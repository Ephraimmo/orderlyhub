/**
 * Branch staff accounts.
 *
 * Stored as fields on the single document `restaurantStaff/{restaurantId}`
 * (same "one document, one field per record" contract as restaurantBranches),
 * keyed by the normalized username. These accounts do NOT use Firebase Auth —
 * they sign in with a username + password issued by the restaurant admin and
 * always run with a restricted, view/operate-only permission set.
 */
import { fsGet, fsRemove, fsSubscribe, fsUpdate } from "@/lib/firestore";
import {
  getDefaultPermissionsForRole,
  isRestaurantRole,
  type RestaurantRole,
} from "@/lib/restaurant-permissions";
import type { RestaurantUserSession } from "@/lib/restaurant-users.firebase";

export const STAFF_ROLES: RestaurantRole[] = [
  "restaurant_manager",
  "branch_manager",
  "kitchen_manager",
  "kitchen_staff",
  "cashier",
  "inventory_manager",
];

/** Permissions a username account may never hold — system configuration is admin-only. */
const STAFF_DENIED_PERMISSIONS = [
  "rm.settings.view",
  "rm.settings.manage",
  "rm.profile.manage",
  "rm.payments.manage",
];

export function staffPermissionsForRole(role: RestaurantRole): string[] {
  return getDefaultPermissionsForRole(role).filter((code) => !STAFF_DENIED_PERMISSIONS.includes(code));
}

export interface StaffUser {
  id: string;
  restaurant_id: string;
  username: string;
  full_name: string;
  phone?: string | null;
  role: RestaurantRole;
  branch_id: string | null;
  branch_name: string | null;
  is_active: boolean;
  password_salt: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
  last_login_at?: string | null;
}

const staffPath = (restaurantId: string) => `restaurantStaff/${restaurantId}`;

const nowIso = () => new Date().toISOString();

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export function makeSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

const toList = (map: Record<string, unknown> | null, restaurantId: string): StaffUser[] => {
  if (!map) return [];
  return Object.entries(map)
    .filter(([key, value]) => key !== "id" && value && typeof value === "object")
    .map(([key, value]) => {
      const staff = value as Partial<StaffUser>;
      return {
        ...staff,
        id: staff.id ?? key,
        restaurant_id: staff.restaurant_id ?? restaurantId,
        username: staff.username ?? key,
        full_name: staff.full_name ?? key,
        role: isRestaurantRole(String(staff.role)) ? (staff.role as RestaurantRole) : "cashier",
        branch_id: staff.branch_id ?? null,
        branch_name: staff.branch_name ?? null,
        is_active: staff.is_active !== false,
        password_salt: staff.password_salt ?? "",
        password_hash: staff.password_hash ?? "",
        created_at: staff.created_at ?? "",
        updated_at: staff.updated_at ?? "",
      } as StaffUser;
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
};

export function subscribeStaffUsers(
  restaurantId: string,
  callback: (users: StaffUser[]) => void,
): () => void {
  return fsSubscribe<Record<string, unknown>>(staffPath(restaurantId), (map) =>
    callback(toList(map, restaurantId)),
  );
}

export interface StaffUserInput {
  username: string;
  full_name: string;
  phone?: string | null;
  role: RestaurantRole;
  branch_id: string | null;
  branch_name: string | null;
  is_active: boolean;
  /** Omit to keep the existing password when editing. */
  password?: string;
}

export async function saveStaffUser(
  restaurantId: string,
  input: StaffUserInput,
  existing?: StaffUser,
): Promise<void> {
  const username = normalizeUsername(input.username);
  if (!username) throw new Error("Username is required.");
  if (!existing && !input.password) throw new Error("A password is required for new users.");

  let salt = existing?.password_salt ?? "";
  let hash = existing?.password_hash ?? "";
  if (input.password) {
    salt = makeSalt();
    hash = await hashPassword(input.password, salt);
  }

  const record: StaffUser = {
    id: username,
    restaurant_id: restaurantId,
    username,
    full_name: input.full_name.trim() || username,
    phone: input.phone?.trim() || null,
    role: input.role,
    branch_id: input.branch_id,
    branch_name: input.branch_name,
    is_active: input.is_active,
    password_salt: salt,
    password_hash: hash,
    created_at: existing?.created_at || nowIso(),
    updated_at: nowIso(),
    last_login_at: existing?.last_login_at ?? null,
  };

  await fsUpdate(staffPath(restaurantId), { [username]: record });
  // Global username -> restaurant index so staff sign in with username only.
  await fsUpdate(`staffDirectory/${username}`, { restaurant_id: restaurantId, updated_at: nowIso() });
}

export async function deleteStaffUser(restaurantId: string, username: string): Promise<void> {
  await fsRemove(`${staffPath(restaurantId)}/${normalizeUsername(username)}`);
  await fsRemove(`staffDirectory/${normalizeUsername(username)}`).catch(() => {});
}

export type StaffSignInResult =
  | { ok: true; session: RestaurantUserSession }
  | { ok: false; message: string };

/**
 * Sign in a username account. The restaurant is resolved from the directory
 * index so staff never need to know their restaurant id.
 */
export async function signInStaffUser(input: {
  username: string;
  password: string;
}): Promise<StaffSignInResult> {
  const username = normalizeUsername(input.username);
  if (!username || !input.password) return { ok: false, message: "Enter your username and password." };

  let restaurantId = "";
  try {
    const entry = await fsGet<{ restaurant_id?: string }>(`staffDirectory/${username}`);
    restaurantId = String(entry?.restaurant_id ?? "").trim();
  } catch {
    return { ok: false, message: "Could not reach the server. Try again." };
  }
  if (!restaurantId) return { ok: false, message: "Incorrect username or password." };

  let record: StaffUser | null = null;
  try {
    const raw = await fsGet<StaffUser>(`${staffPath(restaurantId)}/${username}`);
    record = raw ?? null;
  } catch {
    return { ok: false, message: "Could not reach the server. Try again." };
  }
  if (!record || !record.password_hash) {
    return { ok: false, message: "Incorrect username or password." };
  }
  if (record.is_active === false) {
    return { ok: false, message: "This account is deactivated. Contact your restaurant admin." };
  }
  const hash = await hashPassword(input.password, record.password_salt);
  if (hash !== record.password_hash) {
    return { ok: false, message: "Incorrect username or password." };
  }

  await fsUpdate(staffPath(restaurantId), {
    [username]: { ...record, last_login_at: nowIso() },
  }).catch(() => {});

  const session: RestaurantUserSession = {
    userId: `staff:${restaurantId}:${username}`,
    email: `${username}@staff.local`,
    fullName: record.full_name,
    jobTitle: null,
    phone: record.phone ?? null,
    restaurantId,
    role: record.role,
    permissions: staffPermissionsForRole(record.role),
    kind: "staff",
    username,
    branchId: record.branch_id ?? null,
    branchName: record.branch_name ?? null,
  };
  return { ok: true, session };
}

const STAFF_SESSION_KEY = "orderly_hub_staff_session";

export function persistStaffSession(session: RestaurantUserSession): void {
  try {
    localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function readStaffSession(): RestaurantUserSession | null {
  try {
    const raw = localStorage.getItem(STAFF_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RestaurantUserSession;
    return parsed?.kind === "staff" && parsed.restaurantId ? parsed : null;
  } catch {
    return null;
  }
}

export function clearStaffSession(): void {
  try {
    localStorage.removeItem(STAFF_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
