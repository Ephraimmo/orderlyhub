import {
  completePickupCollection,
  orderType,
  setFirebaseOrderStatus,
  subscribeFirebaseOrders,
  type OrderPayload,
  type OrderStatus,
  type OrderType,
} from "@/lib/orders.firebase";

export interface KitchenOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  order_type: OrderType;
  placed_at: string;
  eta_minutes: number | null;
  total: number;
  special_instructions: string | null;
  delivery_notes: string | null;
  restaurant_id: string;
  restaurant_name: string;
  customer_name: string;
  items: { id: string; item_name: string; quantity: number; notes: string | null }[];
}

const KITCHEN_STATUSES: OrderStatus[] = ["accepted", "preparing", "ready"];

let cached: KitchenOrder[] = [];
const subs = new Set<(rows: KitchenOrder[]) => void>();
let unsub: (() => void) | null = null;

function toKitchen(p: OrderPayload): KitchenOrder {
  const o = p.order;
  const placedAt = o.placed_at ?? (o as { createdAt?: string }).createdAt ?? new Date().toISOString();
  return {
    id: o.id,
    order_number: o.order_number ?? o.id,
    status: o.status as OrderStatus,
    order_type: orderType(o),
    placed_at: placedAt,
    eta_minutes: o.eta_minutes ?? null,
    total: Number(o.total ?? 0),
    special_instructions: o.special_instructions ?? null,
    delivery_notes: o.delivery_address?.notes ?? null,
    restaurant_id: o.restaurant_id,
    restaurant_name: o.restaurant_name ?? "",
    customer_name: o.customer_name ?? "Guest",
    items: p.items.map((l) => ({
      id: l.id,
      item_name: [l.variant?.name, l.name].filter(Boolean).join(" — "),
      quantity: l.quantity,
      notes: l.notes,
    })),
  };
}

function ensureSubscribed() {
  if (unsub) return;
  unsub = subscribeFirebaseOrders((rows) => {
    cached = rows.map(toKitchen);
    subs.forEach((cb) => {
      try {
        cb(cached);
      } catch (e) {
        console.warn(e);
      }
    });
  });
}

function getCached(): KitchenOrder[] {
  ensureSubscribed();
  return cached;
}

export function onKitchenChanged(cb: (rows: KitchenOrder[]) => void): () => void {
  ensureSubscribed();
  subs.add(cb);
  cb(cached);
  return () => {
    subs.delete(cb);
  };
}

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  accepted: "preparing",
  preparing: "ready",
};

export async function getKitchenQueue(input: { restaurantId: string }): Promise<KitchenOrder[]> {
  return getCached()
    .filter((o) => KITCHEN_STATUSES.includes(o.status))
    .filter((o) => o.restaurant_id === input.restaurantId)
    .slice()
    .sort((a, b) => a.placed_at.localeCompare(b.placed_at))
    .slice(0, 120);
}

export async function advanceOrder(input: {
  orderId: string;
  nextStatus: string;
  actor?: string | null;
}) {
  const order = getCached().find((o) => o.id === input.orderId);
  if (!order) throw new Error("Order not found");
  const expected = NEXT_STATUS[order.status];
  if (!expected || expected !== input.nextStatus) {
    throw new Error(`Cannot move order from ${order.status} to ${input.nextStatus}`);
  }

  await setFirebaseOrderStatus({
    orderId: order.id,
    status: expected,
    etaMinutes: expected === "ready" ? Math.max(5, order.eta_minutes ?? 15) : null,
    actor: input.actor ?? null,
  });
  return { ok: true };
}

export async function markCustomerCollected(input: { orderId: string; actor?: string | null }) {
  await completePickupCollection({
    orderId: input.orderId,
    actor: input.actor ?? null,
  });
  return { ok: true };
}

export function kitchenOrderHasNotes(order: KitchenOrder): boolean {
  if ((order.special_instructions ?? "").trim().length > 0) return true;
  if ((order.delivery_notes ?? "").trim().length > 0) return true;
  return order.items.some((it) => (it.notes ?? "").trim().length > 0);
}
