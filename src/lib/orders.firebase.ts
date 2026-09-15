import { isFirebaseAvailable, fsGet, fsSet, fsSubscribe, type FirestoreValue } from "@/lib/firestore";

export type OrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready"
  | "assigned"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "rejected"
  | "cancelled"
  | "refunded";

export type OrderType = "delivery" | "pickup";

export interface DeliveryAddress {
  label: string | null;
  street: string;
  city: string;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
}

export interface OrderLineVariant {
  id: string;
  name: string;
  price_delta: number;
}

export interface OrderLineAddon {
  id: string;
  name: string;
  price: number;
  quantity?: number;
}

export interface OrderLine {
  id: string;
  item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  notes: string | null;
  variant: OrderLineVariant | null;
  addons?: OrderLineAddon[] | Record<string, OrderLineAddon> | null;
}

export interface TimelineEvent {
  id: string;
  status: OrderStatus | "placed" | "note";
  at: string;
  note: string | null;
  actor: string | null;
}

export interface FirebaseOrder {
  id: string;
  order_number: string;
  status: OrderStatus | string;
  order_type?: OrderType | null;
  placed_at: string;
  accepted_at?: string | null;
  ready_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  eta_minutes?: number | null;
  eta_at?: string | null;
  total: number;
  special_instructions?: string | null;
  delivery_address?: DeliveryAddress | null;
  restaurant_id: string;
  restaurant_name: string;
  customer_name: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface OrderPayload {
  order: FirebaseOrder;
  items: OrderLine[];
  timeline: TimelineEvent[];
}

const ORDERS_PATH = "orders";
const EMPTY: OrderPayload[] = [];

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

function orderPath(orderId: string, ...tail: string[]): string {
  return [ORDERS_PATH, orderId, ...tail].filter(Boolean).join("/");
}

function toArr<T>(data: Record<string, T> | null): T[] {
  return data ? Object.values(data) : [];
}

const w = (v: unknown): FirestoreValue => v as FirestoreValue;

function normalizeStatus(status: string | undefined | null): OrderStatus {
  const s = String(status ?? "pending");
  if (s === "approved" || s === "awaiting_approval") return "pending";
  if (s === "completed") return "delivered";
  if (s === "out_for_delivery") return "on_the_way";
  return s as OrderStatus;
}

function assemble(
  ordersMap: Record<string, FirebaseOrder> | null,
  itemsMap: Record<string, Record<string, OrderLine>> | null,
): OrderPayload[] {
  if (!ordersMap) return [];
  return Object.entries(ordersMap)
    .filter(([, o]) => Boolean(o))
    .map(([id, raw]) => {
      const o = { ...raw, id: raw.id ?? id, status: normalizeStatus(String(raw.status)) };
      return {
        order: o as FirebaseOrder,
        items: toArr(itemsMap?.[id] ?? null).sort((a, b) => a.id.localeCompare(b.id)),
        timeline: [],
      };
    });
}

export function orderType(o: {
  order_type?: OrderType | string | null;
  type?: string | null;
}): OrderType {
  const raw = o.order_type ?? o.type;
  if (raw === "pickup") return "pickup";
  return "delivery";
}

export function isDeliveryOrder(o: { order_type?: string | null; type?: string | null }): boolean {
  return orderType(o) === "delivery";
}

export function isPickupOrder(o: { order_type?: string | null; type?: string | null }): boolean {
  return orderType(o) === "pickup";
}

/** Pickup at counter: ready → collected → completed (delivered). */
export async function completePickupCollection(input: {
  orderId: string;
  actor?: string | null;
}): Promise<void> {
  const order = await fsGet<FirebaseOrder>(orderPath(input.orderId));
  if (!order) throw new Error("Order not found");
  if (!isPickupOrder(order)) {
    throw new Error("Only pickup orders can be collected at the counter");
  }
  if (order.status !== "ready") {
    throw new Error("Order must be ready before the customer can collect it");
  }
  await setFirebaseOrderStatus({
    orderId: input.orderId,
    status: "picked_up",
    note: "Customer collected at the counter",
    actor: input.actor ?? null,
  });
  await setFirebaseOrderStatus({
    orderId: input.orderId,
    status: "delivered",
    note: "Order completed — customer collected",
    actor: input.actor ?? null,
  });
}

export async function assignOrderDriver(input: {
  orderId: string;
  driverId: string;
  driverName: string;
  driverPhone?: string | null;
  actor?: string | null;
}): Promise<void> {
  const order = await fsGet<FirebaseOrder>(orderPath(input.orderId));
  if (!order) throw new Error("Order not found");
  if (!isDeliveryOrder(order)) {
    throw new Error("Only delivery orders can be assigned to a driver");
  }
  if (!["accepted", "preparing", "ready", "assigned"].includes(String(order.status))) {
    throw new Error(`Cannot assign a driver while order is ${order.status}`);
  }
  const ts = now();
  const eta = order.eta_minutes ?? 30;
  await fsSet(
    orderPath(input.orderId),
    w({
      ...order,
      driver_id: input.driverId,
      driver_name: input.driverName,
      driver_phone: input.driverPhone ?? null,
      status: "assigned",
      updated_at: ts,
      eta_minutes: eta,
      eta_at: new Date(Date.now() + eta * 60_000).toISOString(),
    }),
  );
  await appendTimeline(input.orderId, {
    status: "assigned",
    note: `Driver assigned: ${input.driverName}`,
    actor: input.actor ?? null,
  });
}

export function subscribeFirebaseOrders(cb: (rows: OrderPayload[]) => void): () => void {
  if (!isFirebaseAvailable()) {
    cb(EMPTY);
    return () => {};
  }

  let ordersMap: Record<string, FirebaseOrder> | null = null;
  const itemsMap: Record<string, Record<string, OrderLine>> = {};
  let haveOrders = false;
  const watchedItems = new Set<string>();
  const unsubs: Array<() => void> = [];

  const emit = () => {
    if (!haveOrders) return;
    cb(assemble(ordersMap, itemsMap));
  };

  const watchOrderChildren = (ids: string[]) => {
    for (const id of ids) {
      if (watchedItems.has(id)) continue;
      watchedItems.add(id);
      unsubs.push(
        fsSubscribe<Record<string, OrderLine>>(orderPath(id, "items"), (v) => {
          if (v) itemsMap[id] = v;
          else delete itemsMap[id];
          emit();
        }),
      );
    }
  };

  const mainUnsub = fsSubscribe<Record<string, FirebaseOrder>>(ORDERS_PATH, (v) => {
    ordersMap = v;
    haveOrders = true;
    if (v) watchOrderChildren(Object.keys(v));
    emit();
  });

  return () => {
    mainUnsub();
    unsubs.forEach((u) => u());
  };
}

function now() {
  return new Date().toISOString();
}

async function appendTimeline(
  orderId: string,
  event: Omit<TimelineEvent, "id" | "at"> & { at?: string },
) {
  const id = uid("tl");
  const record: TimelineEvent = {
    id,
    at: event.at ?? now(),
    note: event.note ?? null,
    status: event.status,
    actor: event.actor ?? null,
  };
  await fsSet(orderPath(orderId, "timeline", id), w(record));
}

const DELIVERY_ONLY_STATUSES: OrderStatus[] = ["assigned", "on_the_way"];

export async function setFirebaseOrderStatus(input: {
  orderId: string;
  status: OrderStatus;
  etaMinutes?: number | null;
  note?: string | null;
  actor?: string | null;
}): Promise<void> {
  if (!isFirebaseAvailable()) throw new Error("Firebase unavailable");
  const order = await fsGet<FirebaseOrder>(orderPath(input.orderId));
  if (!order) throw new Error("Order not found");

  if (DELIVERY_ONLY_STATUSES.includes(input.status) && orderType(order) === "pickup") {
    throw new Error(
      `Customer pickup orders never go through "${input.status.replace("_", " ")}" — mark collected, then complete.`,
    );
  }

  const ts = now();
  const patch: Partial<FirebaseOrder> = { status: input.status, updated_at: ts };
  switch (input.status) {
    case "accepted":
      patch.accepted_at = ts;
      break;
    case "ready":
      patch.ready_at = ts;
      if (input.etaMinutes != null) patch.eta_minutes = input.etaMinutes;
      break;
    case "picked_up":
      patch.picked_up_at = ts;
      break;
    case "delivered":
      patch.delivered_at = ts;
      patch.eta_minutes = 0;
      patch.eta_at = null;
      break;
    case "cancelled":
    case "rejected":
      patch.cancelled_at = ts;
      break;
  }
  if (input.etaMinutes != null && input.status !== "delivered") {
    patch.eta_minutes = input.etaMinutes;
  }
  if (patch.eta_minutes != null && patch.eta_minutes > 0) {
    patch.eta_at = new Date(Date.now() + patch.eta_minutes * 60_000).toISOString();
  }

  await fsSet(orderPath(input.orderId), w({ ...order, ...patch }));
  await appendTimeline(input.orderId, {
    status: input.status,
    note: input.note ?? null,
    actor: input.actor ?? null,
  });
}
