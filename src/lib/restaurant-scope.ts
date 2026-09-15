/** RTDB path helpers scoped to the authenticated user's assigned restaurant. */

export function restaurantPath(restaurantId: string): string {
  return `restaurants/${restaurantId}`;
}

export function restaurantPaymentConfigPath(restaurantId: string): string {
  return `restaurants/${restaurantId}/payment_config`;
}

export function menuPath(
  restaurantId: string,
  kind: "categories" | "items" | "variants" | "addons" | "modifiers",
): string {
  return `menus/${restaurantId}/${kind}`;
}

export function belongsToRestaurant(
  record: { restaurant_id?: string | null } | null | undefined,
  restaurantId: string,
): boolean {
  return String(record?.restaurant_id ?? "").trim() === restaurantId;
}

export function filterByRestaurant<T extends { restaurant_id?: string | null }>(
  records: T[],
  restaurantId: string,
): T[] {
  return records.filter((r) => belongsToRestaurant(r, restaurantId));
}

/** Map ForkFleet order statuses to legacy UI labels where needed. */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  assigned: "Assigned",
  picked_up: "Picked up",
  on_the_way: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
  rejected: "Rejected",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  out_for_delivery: "Out for delivery",
  completed: "Completed",
};

export function normalizeOrderStatus(status: string | undefined | null): string {
  return String(status ?? "pending").trim();
}

export function isActiveDeliveryStatus(status: string): boolean {
  return ["assigned", "picked_up", "on_the_way", "out_for_delivery"].includes(status);
}

export function isCompletedOrderStatus(status: string): boolean {
  return ["delivered", "completed", "cancelled", "refunded", "rejected"].includes(status);
}

export function isPendingOrderStatus(status: string): boolean {
  return ["pending", "awaiting_approval", "accepted", "approved"].includes(status);
}
