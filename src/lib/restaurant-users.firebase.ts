import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { fsGet, fsUpdate } from "@/lib/firestore";
import {
  isRestaurantRole,
  mapToPermissions,
  type RestaurantRole,
} from "@/lib/restaurant-permissions";

export type RestaurantUserStatus = "active" | "suspended";

interface RestaurantUserRaw {
  uid?: string;
  email?: string;
  full_name?: string | null;
  job_title?: string | null;
  phone?: string | null;
  restaurant_id?: string | null;
  role?: string | null;
  permissions?: Record<string, boolean> | null;
  status?: string | null;
  is_deleted?: boolean | null;
  created_at?: string | null;
  last_login_at?: string | null;
}

export interface RestaurantUserRecord {
  uid: string;
  email: string;
  full_name: string;
  job_title: string | null;
  phone: string | null;
  restaurant_id: string;
  role: RestaurantRole;
  permissions: string[];
  status: RestaurantUserStatus;
  created_at: string;
  last_login_at: string | null;
}

export interface RestaurantUserSession {
  userId: string;
  email: string;
  fullName: string | null;
  jobTitle: string | null;
  phone: string | null;
  restaurantId: string;
  /** A built-in RestaurantRole for admin accounts; staff accounts may also carry a
   * "custom_"-prefixed CustomRole id (see custom-roles.firebase.ts) — use `roleName`
   * for display in that case, since it won't resolve through RESTAURANT_ROLE_LABELS. */
  role: RestaurantRole | string;
  /** Display name for a custom role. Unset (falls back to restaurantRoleLabel) for built-in roles. */
  roleName?: string | null;
  permissions: string[];
  /** "admin" = Firebase email/password account, "staff" = username account created in-app. */
  kind?: "admin" | "staff";
  username?: string | null;
  branchId?: string | null;
  branchName?: string | null;
}

export const RESTAURANT_USERS_PATH = "restaurantUsers";
const SESSION_STORAGE_KEY = "orderly_hub_rm_session";

const nowIso = () => new Date().toISOString();

function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string } | null | undefined)?.code ?? "";
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error — check your connection and try again.";
    default:
      return err instanceof Error && err.message ? err.message : "Login failed.";
  }
}

export function normalizeRestaurantUser(
  raw: RestaurantUserRaw | null | undefined,
  uid: string,
): RestaurantUserRecord | null {
  if (!raw || raw.is_deleted === true) return null;
  const email = String(raw.email ?? "").trim();
  const restaurantId = String(raw.restaurant_id ?? "").trim();
  const role = raw.role ?? "";
  if (!email || !restaurantId || !isRestaurantRole(role)) return null;
  return {
    uid: raw.uid ?? uid,
    email,
    full_name: String(raw.full_name ?? "").trim(),
    job_title: raw.job_title ?? null,
    phone: raw.phone ?? null,
    restaurant_id: restaurantId,
    role,
    permissions: mapToPermissions(raw.permissions),
    status: raw.status === "suspended" ? "suspended" : "active",
    created_at: raw.created_at ?? nowIso(),
    last_login_at: raw.last_login_at ?? null,
  };
}

export function buildRestaurantUserSession(record: RestaurantUserRecord): RestaurantUserSession {
  return {
    userId: record.uid,
    email: record.email,
    fullName: record.full_name || null,
    jobTitle: record.job_title,
    phone: record.phone,
    restaurantId: record.restaurant_id,
    role: record.role,
    permissions: record.permissions,
    kind: "admin",
  };
}

export async function fetchRestaurantUserByUid(uid: string): Promise<RestaurantUserRecord | null> {
  return normalizeRestaurantUser(
    await fsGet<RestaurantUserRaw>(`${RESTAURANT_USERS_PATH}/${uid}`),
    uid,
  );
}

export type RestaurantSignInResult =
  | { ok: true; session: RestaurantUserSession }
  | {
      ok: false;
      error: "invalid_credentials" | "not_provisioned" | "suspended" | "unavailable";
      message: string;
    };

export async function signInRestaurantUserWithFirebase(input: {
  email: string;
  password: string;
}): Promise<RestaurantSignInResult> {
  const email = input.email.trim().toLowerCase();
  try {
    const credential = await signInWithEmailAndPassword(auth, email, input.password);
    const uid = credential.user.uid;
    const record = normalizeRestaurantUser(
      await fsGet<RestaurantUserRaw>(`${RESTAURANT_USERS_PATH}/${uid}`),
      uid,
    );
    if (!record) {
      await signOut(auth);
      return {
        ok: false,
        error: "not_provisioned",
        message:
          "This account has no Kasi Zonke Link access. Ask a platform administrator to provision it.",
      };
    }
    if (record.status === "suspended") {
      await signOut(auth);
      return {
        ok: false,
        error: "suspended",
        message: "This account is deactivated. Contact a platform administrator.",
      };
    }
    const session = buildRestaurantUserSession(record);
    persistSession(session);
    await fsUpdate(`${RESTAURANT_USERS_PATH}/${uid}`, { last_login_at: nowIso() }).catch(() => {});
    return { ok: true, session };
  } catch (err) {
    return { ok: false, error: "invalid_credentials", message: friendlyAuthError(err) };
  }
}

export async function refreshRestaurantUserSession(
  stored: RestaurantUserSession,
): Promise<RestaurantUserSession | null> {
  try {
    const record = normalizeRestaurantUser(
      await fsGet<RestaurantUserRaw>(`${RESTAURANT_USERS_PATH}/${stored.userId}`),
      stored.userId,
    );
    if (!record || record.status === "suspended") {
      clearPersistedSession();
      return null;
    }
    const session = buildRestaurantUserSession(record);
    persistSession(session);
    return session;
  } catch {
    return stored;
  }
}

export function persistSession(session: RestaurantUserSession): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function readPersistedSession(): RestaurantUserSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RestaurantUserSession;
  } catch {
    return null;
  }
}

export function clearPersistedSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
