/**
 * Driver roster eligibility for the "assign a driver" picker on Orders.
 *
 * A driver may only be assigned to an order if they already hold an active
 * `driverAssignments/{driverId__restaurantId__branchId}` record for that order's
 * exact restaurant (and branch, when the order is branch-scoped) — a standing
 * roster grant made in ForkFleet Super Admin, never something created per-order.
 * Assigning a driver without one leaves the order stuck at "waiting_accept"
 * forever: their Accept fails server-side, with no client-visible error here.
 */

export interface DriverAssignmentRecord {
  driver_id: string;
  restaurant_id?: string | null;
  branch_id?: string | null;
  is_active?: boolean;
  driver_name?: string | null;
  driver_phone?: string | null;
}

export interface DriverProfileRecord {
  full_name?: string | null;
  name?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  photo?: string | null;
  rating?: number | null;
}

export interface EligibleDriver {
  id: string;
  name: string;
  phone: string;
  photo: string | null;
  rating: number | null;
}

/** Legacy records may prefix restaurant ids with "rst-"; strip it before comparing. */
function normalizeRestaurantId(id: string | null | undefined): string {
  return String(id ?? "").trim().replace(/^rst-/, "");
}

function normalizeBranchId(id: string | null | undefined): string {
  return String(id ?? "").trim();
}

/**
 * True if `assignment` grants its driver access to this restaurant (+ branch,
 * when both the order and the assignment specify one). A restaurant-wide
 * assignment (no `branch_id`) is eligible for any branch of that restaurant;
 * an order with no `branch_id` skips the branch check entirely.
 */
export function hasActiveAssignment(
  assignment: DriverAssignmentRecord,
  restaurantId: string,
  branchId?: string | null,
): boolean {
  if (assignment.is_active === false) return false;
  if (normalizeRestaurantId(assignment.restaurant_id) !== normalizeRestaurantId(restaurantId)) return false;
  if (branchId && assignment.branch_id && normalizeBranchId(assignment.branch_id) !== normalizeBranchId(branchId)) {
    return false;
  }
  return true;
}

export function isDriverEligibleForBranch(
  assignments: DriverAssignmentRecord[],
  driverId: string,
  restaurantId: string,
  branchId?: string | null,
): boolean {
  return assignments.some((a) => a.driver_id === driverId && hasActiveAssignment(a, restaurantId, branchId));
}

/**
 * Distinct, eligible drivers for this order's restaurant + branch, merged with
 * their profile (name/phone/photo/rating). Use this to populate the assign
 * picker — never list every driver on the roster unfiltered.
 */
export function eligibleDriversForOrder(
  assignments: Record<string, DriverAssignmentRecord> | null | undefined,
  profiles: Record<string, DriverProfileRecord> | null | undefined,
  restaurantId: string,
  branchId?: string | null,
): EligibleDriver[] {
  const seen = new Set<string>();
  const out: EligibleDriver[] = [];
  for (const assignment of Object.values(assignments ?? {})) {
    const driverId = assignment?.driver_id;
    if (!driverId || seen.has(driverId)) continue;
    if (!hasActiveAssignment(assignment, restaurantId, branchId)) continue;
    seen.add(driverId);

    const profile = profiles?.[driverId] ?? {};
    const name = profile.full_name ?? profile.name ?? assignment.driver_name ?? driverId;
    out.push({
      id: driverId,
      name: String(name).trim() || driverId,
      phone: profile.phone ?? assignment.driver_phone ?? "",
      photo: profile.photo_url ?? profile.photo ?? null,
      rating: profile.rating ?? null,
    });
  }
  return out;
}
