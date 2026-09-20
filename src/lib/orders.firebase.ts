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

/** Granular driver-side progress. Independent of `status` — written by the
 * driver app directly, never by the restaurant admin app. */
export type DriverStatus =
  | "assigned"
  | "arrived_at_restaurant"
  | "picked_up"
  | "on_the_way"
  | "arrived_at_customer"
  | "delivered";

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
  branch_id?: string | null;
  branch_name?: string | null;
  customer_name: string;

  driver_id?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  driver_photo?: string | null;
  driver_rating?: number | null;
  driver_status?: DriverStatus | string | null;
  assigned_at?: string | null;
  arrived_at_restaurant?: string | null;
  on_the_way_at?: string | null;
  arrived_at_customer?: string | null;

  rejection_reason?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;

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

/** Canonicalize a raw/legacy status value. Use when loading order records into UI state. */
export const canonicalOrderStatus = normalizeStatus;

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

/**
 * Display stage computed from `status` + `driver_id` + `driver_status` together.
 * `status` alone is ambiguous for delivery orders: "ready" means either "no driver
 * yet" or "driver hasn't accepted"; "assigned" means either "heading to restaurant"
 * or "already at the restaurant". Never switch on raw `status` for a delivery-order
 * badge or action button — always go through this function.
 */
export type OrderStage =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready"
  | "unassigned"
  | "waiting_accept"
  | "heading_to_restaurant"
  | "at_restaurant"
  | "picked_up"
  | "on_the_way"
  | "at_customer"
  | "delivered"
  | "rejected"
  | "cancelled"
  | "refunded";

export function orderStage(o: {
  status: OrderStatus | string;
  order_type?: OrderType | string | null;
  driver_id?: string | null;
  driver_status?: DriverStatus | string | null;
}): OrderStage {
  const raw = normalizeStatus(String(o.status)) as string;

  if (orderType(o) === "pickup") {
    // No driver is ever involved for pickup orders — the stage is the raw status.
    return raw as OrderStage;
  }

  if (raw === "ready" || raw === "offered") {
    return o.driver_id ? "waiting_accept" : "unassigned";
  }
  if (raw === "assigned" || raw === "arrived") {
    return raw === "arrived" || o.driver_status === "arrived_at_restaurant"
      ? "at_restaurant"
      : "heading_to_restaurant";
  }
  if (raw === "on_the_way") {
    return o.driver_status === "arrived_at_customer" ? "at_customer" : "on_the_way";
  }
  return raw as OrderStage; // pending, accepted, preparing, picked_up, delivered, rejected, cancelled, refunded
}

export const ORDER_STAGE_LABEL: Record<OrderStage, string> = {
  pending: "Pending",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready for pickup",
  unassigned: "Unassigned",
  waiting_accept: "Waiting for driver to accept",
  heading_to_restaurant: "Waiting for driver to get to the restaurant",
  at_restaurant: "Driver at restaurant — picking up order",
  picked_up: "Order picked up — driver en route",
  on_the_way: "On the way to customer",
  at_customer: "Driver at customer's door",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const ORDER_STAGE_COLOR: Record<OrderStage, string> = {
  pending: "bg-warning/10 text-warning",
  accepted: "bg-primary/10 text-primary",
  preparing: "bg-primary/10 text-primary",
  ready: "bg-success/10 text-success",
  unassigned: "bg-muted text-muted-foreground",
  waiting_accept: "bg-warning/10 text-warning",
  heading_to_restaurant: "bg-primary/10 text-primary",
  at_restaurant: "bg-primary/10 text-primary",
  picked_up: "bg-warning/10 text-warning",
  on_the_way: "bg-warning/10 text-warning",
  at_customer: "bg-warning/10 text-warning",
  delivered: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-destructive/10 text-destructive",
  refunded: "bg-destructive/10 text-destructive",
};

/** True while a delivery order can be (re)assigned to a driver — i.e. no driver has
 * accepted yet. Once accepted (`status: "assigned"`), driver_id must not be
 * overwritten through this path (see orders.firebase.ts §5.3 of the handover doc). */
export function isAssignableToDriver(o: { status: OrderStatus | string; order_type?: OrderType | string | null }): boolean {
  if (!isDeliveryOrder(o)) return false;
  const raw = normalizeStatus(String(o.status)) as string;
  return raw === "ready" || raw === "offered";
}

/**
 * Assign (or reassign) a driver to a delivery order. Only valid while the order is
 * still "ready" (nobody has accepted it yet) — `status` is intentionally NOT part
 * of this patch, it stays "ready" until the driver's own app accepts the job by
 * writing `status: "assigned"`. Never set `status` to "assigned" from here.
 */
export async function assignOrderDriver(input: {
  orderId: string;
  driverId: string;
  driverName: string;
  driverPhone?: string | null;
  driverPhoto?: string | null;
  driverRating?: number | null;
  etaMinutes?: number | null;
  actor?: string | null;
}): Promise<void> {
  if (!isFirebaseAvailable()) throw new Error("Firebase unavailable");
  const order = await fsGet<FirebaseOrder>(orderPath(input.orderId));
  if (!order) throw new Error("Order not found");
  if (!isAssignableToDriver(order)) {
    throw new Error(
      isDeliveryOrder(order)
        ? `Cannot assign a driver while the order is "${order.status}" — the driver app must accept before reassignment`
        : "Only delivery orders can be assigned to a driver",
    );
  }

  const wasAssigned = Boolean(order.driver_id);
  const ts = now();
  const eta = input.etaMinutes ?? order.eta_minutes ?? 30;
  const patch: Partial<FirebaseOrder> = {
    driver_id: input.driverId,
    driver_name: input.driverName,
    driver_phone: input.driverPhone ?? null,
    driver_photo: input.driverPhoto ?? null,
    driver_rating: input.driverRating ?? null,
    eta_minutes: eta,
    eta_at: new Date(Date.now() + eta * 60_000).toISOString(),
    updated_at: ts,
  };

  await fsSet(orderPath(input.orderId), w({ ...order, ...patch }));
  await appendTimeline(input.orderId, {
    status: "note",
    note: `Driver ${wasAssigned ? "reassigned" : "assigned"}: ${input.driverName}`,
    actor: input.actor ?? null,
  });
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
      // Mirrors the driver app's own PIN-verified pickup write — this status is
      // only ever set on a delivery order via the "Mark picked up" fallback at
      // stage "at_restaurant" (see setFirebaseOrderStatus callers / docs).
      if (isDeliveryOrder(order)) patch.driver_status = "picked_up";
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

/** Reject a pending order. A reason is mandatory — it is shown to the customer. */
export async function rejectFirebaseOrder(input: {
  orderId: string;
  reason: string;
  actor?: string | null;
}): Promise<void> {
  if (!isFirebaseAvailable()) throw new Error("Firebase unavailable");
  const reason = input.reason.trim();
  if (!reason) throw new Error("A rejection reason is required");

  const order = await fsGet<FirebaseOrder>(orderPath(input.orderId));
  if (!order) throw new Error("Order not found");
  if (normalizeStatus(String(order.status)) !== "pending") {
    throw new Error("Only pending orders can be rejected");
  }

  const ts = now();
  const patch: Partial<FirebaseOrder> = {
    status: "rejected",
    rejected_at: ts,
    rejection_reason: reason,
    rejected_by: input.actor ?? null,
    cancelled_at: ts,
    updated_at: ts,
    driver_id: null,
    driver_name: null,
    driver_phone: null,
    driver_status: null,
  };

  await fsSet(orderPath(input.orderId), w({ ...order, ...patch }));
  await appendTimeline(input.orderId, {
    status: "rejected",
    note: reason,
    actor: input.actor ?? null,
  });
}
