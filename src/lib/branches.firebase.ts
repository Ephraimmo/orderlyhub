import { fsRemove, fsSubscribe, fsUpdate } from "@/lib/firestore";

/**
 * Branch registry contract shared with the Super Admin console.
 * `restaurantBranches/{restaurantId}` is a single document whose fields are branch ids.
 */
export interface RestaurantBranch {
  id: string;
  restaurant_id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  delivery_radius_km?: number;
  is_main?: boolean;
  is_active?: boolean;
  status?: "approved" | "pending" | "suspended" | null;
  opens_at?: string;
  closes_at?: string;
  created_at: string;
  updated_at: string;
}

const branchesPath = (restaurantId: string) => `restaurantBranches/${restaurantId}`;

export const nowIso = () => new Date().toISOString();

export function makeBranchId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `brn-${slug || "branch"}-${suffix}`;
}

const toList = (map: Record<string, unknown> | null, restaurantId: string): RestaurantBranch[] => {
  if (!map) return [];
  return Object.entries(map)
    .filter(([key, value]) => key !== "id" && value && typeof value === "object")
    .map(([key, value]) => {
      const branch = value as Partial<RestaurantBranch>;
      return {
        ...branch,
        id: branch.id ?? key,
        restaurant_id: branch.restaurant_id ?? restaurantId,
        name: branch.name ?? key,
        created_at: branch.created_at ?? "",
        updated_at: branch.updated_at ?? "",
      } as RestaurantBranch;
    })
    .sort((a, b) => Number(b.is_main ?? false) - Number(a.is_main ?? false) || a.name.localeCompare(b.name));
};

export function subscribeBranches(
  restaurantId: string,
  callback: (branches: RestaurantBranch[]) => void,
): () => void {
  return fsSubscribe<Record<string, unknown>>(branchesPath(restaurantId), (map) =>
    callback(toList(map, restaurantId)),
  );
}

/** Create or update a single branch without touching sibling branches. */
export async function saveBranch(
  restaurantId: string,
  branch: RestaurantBranch,
  options: { existing?: RestaurantBranch[] } = {},
): Promise<void> {
  const payload: Record<string, unknown> = { [branch.id]: { ...branch, updated_at: nowIso() } };

  // Exactly one main branch per restaurant.
  if (branch.is_main) {
    for (const other of options.existing ?? []) {
      if (other.id !== branch.id && other.is_main) {
        payload[other.id] = { ...other, is_main: false, updated_at: nowIso() };
      }
    }
  }
  await fsUpdate(branchesPath(restaurantId), payload);
}

export async function deleteBranch(restaurantId: string, branchId: string): Promise<void> {
  await fsRemove(`${branchesPath(restaurantId)}/${branchId}`);
}
