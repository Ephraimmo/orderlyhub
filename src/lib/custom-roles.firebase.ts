/**
 * Restaurant-defined custom staff roles.
 *
 * Alongside the fixed built-in roles in restaurant-permissions.ts, a restaurant
 * admin can define their own named role with an arbitrary set of permissions.
 * Stored the same way as branches/staff — one document per restaurant, one
 * field per role, keyed by a generated id prefixed "custom_" so it's always
 * distinguishable from a built-in `RestaurantRole` value at a glance.
 */
import { fsGet, fsRemove, fsSubscribe, fsUpdate } from "@/lib/firestore";
import { isRestaurantPermission } from "@/lib/restaurant-permissions";

export interface CustomRole {
  id: string;
  restaurant_id: string;
  name: string;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

const CUSTOM_ROLE_PREFIX = "custom_";
const customRolesPath = (restaurantId: string) => `restaurantCustomRoles/${restaurantId}`;
const nowIso = () => new Date().toISOString();

export function isCustomRoleId(role: string): boolean {
  return role.startsWith(CUSTOM_ROLE_PREFIX);
}

function makeCustomRoleId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${CUSTOM_ROLE_PREFIX}${slug || "role"}-${suffix}`;
}

const toList = (map: Record<string, unknown> | null, restaurantId: string): CustomRole[] => {
  if (!map) return [];
  return Object.entries(map)
    .filter(([key, value]) => key !== "id" && value && typeof value === "object")
    .map(([key, value]) => {
      const role = value as Partial<CustomRole>;
      return {
        id: role.id ?? key,
        restaurant_id: role.restaurant_id ?? restaurantId,
        name: role.name ?? key,
        permissions: Array.isArray(role.permissions) ? role.permissions.filter(isRestaurantPermission) : [],
        created_at: role.created_at ?? "",
        updated_at: role.updated_at ?? "",
      } satisfies CustomRole;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

export function subscribeCustomRoles(
  restaurantId: string,
  callback: (roles: CustomRole[]) => void,
): () => void {
  return fsSubscribe<Record<string, unknown>>(customRolesPath(restaurantId), (map) =>
    callback(toList(map, restaurantId)),
  );
}

export async function fetchCustomRole(restaurantId: string, roleId: string): Promise<CustomRole | null> {
  return fsGet<CustomRole>(`${customRolesPath(restaurantId)}/${roleId}`);
}

/** Create a new custom role, or update an existing one's name/permissions in place. */
export async function saveCustomRole(
  restaurantId: string,
  input: { id?: string; name: string; permissions: string[] },
): Promise<CustomRole> {
  const name = input.name.trim();
  if (!name) throw new Error("Role name is required.");
  const permissions = [...new Set(input.permissions.filter(isRestaurantPermission))];
  if (permissions.length === 0) throw new Error("Select at least one permission.");

  const id = input.id ?? makeCustomRoleId(name);
  const existing = input.id ? await fetchCustomRole(restaurantId, input.id) : null;
  const record: CustomRole = {
    id,
    restaurant_id: restaurantId,
    name,
    permissions,
    created_at: existing?.created_at || nowIso(),
    updated_at: nowIso(),
  };
  await fsUpdate(customRolesPath(restaurantId), { [id]: record });
  return record;
}

export async function deleteCustomRole(restaurantId: string, roleId: string): Promise<void> {
  await fsRemove(`${customRolesPath(restaurantId)}/${roleId}`);
}
