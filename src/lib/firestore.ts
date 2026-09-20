/**
 * Single data layer for ForkFleet — Cloud Firestore.
 *
 * The whole app (and the Super Admin console it shares a backend with) talks to
 * Firestore through the *logical paths* that were previously RTDB paths. The
 * mapping rules come from FIRESTORE_MIGRATION_HANDOVER.md:
 *
 *  - `COLLECTIONS` declares which logical prefixes are Firestore collections.
 *    The segment right after a collection is a document id; anything deeper is
 *    a nested field path inside that document (same semantics as RTDB subtrees).
 *  - Firestore collection paths must have an odd segment count. When a logical
 *    collection path is even-length, the container document `_` is inserted
 *    before the final segment (e.g. `promotions/codes` -> `promotions/_/codes`).
 *  - Timestamps are ISO-8601 strings, money is stored in major units, and
 *    `undefined` is never written.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import app from "@/lib/firebase";

export const db: Firestore = getFirestore(app);

export type FirestoreValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: FirestoreValue | undefined }
  | FirestoreValue[]
  | undefined;

export const isFirebaseAvailable = (): boolean => typeof window !== "undefined";

/** Logical collection prefixes. `*` matches exactly one segment. */
const COLLECTIONS: string[] = [
  "restaurants",
  "restaurantBranches",
  "restaurantStaff",
  "restaurantCustomRoles",
  "staffDirectory",
  "menus/*/categories",
  "menus/*/items",
  "menus/*/variants",
  "menus/*/addons",
  "menus/*/modifiers",
  "orders",
  "customers",
  "coupons",
  "drivers",
  "driverAssignments",
  "staffUsers",
  "restaurantUsers",
  "staffAudit",
  "restaurantUserAudit",
  "promotions/codes",
  "promotions/combos",
  "promotions/restaurant_points",
  "settings",
  "settingsAudit",
  "support/tickets",
  "support/messages",
  "uploads/images",
  "notificationAlerts",
  "notificationTriggers",
  "notificationReads",
  "notificationAudit",
];

const SORTED_COLLECTIONS = [...COLLECTIONS].sort(
  (a, b) => b.split("/").length - a.split("/").length,
);

const matches = (pattern: string, segments: string[]): boolean => {
  const parts = pattern.split("/");
  if (parts.length > segments.length) return false;
  return parts.every((p, i) => p === "*" || p === segments[i]);
};

interface ResolvedPath {
  /** Real Firestore collection path (odd segment count). */
  collection: string[];
  /** Document id, when the logical path points at or inside a document. */
  docId?: string;
  /** Nested field path inside the document. */
  field: string[];
}

/** Insert the `_` container document when a collection path is even-length. */
const normalizeCollection = (segments: string[]): string[] => {
  if (segments.length % 2 === 1) return segments;
  return [...segments.slice(0, -1), "_", segments[segments.length - 1]];
};

export function resolvePath(path: string): ResolvedPath {
  const segments = path.split("/").filter(Boolean);
  const pattern = SORTED_COLLECTIONS.find((p) => matches(p, segments));
  const depth = pattern ? pattern.split("/").length : 1;
  return {
    collection: normalizeCollection(segments.slice(0, depth)),
    docId: segments[depth],
    field: segments.slice(depth + 1),
  };
}

const docRef = (resolved: ResolvedPath) =>
  doc(db, [...resolved.collection, resolved.docId as string].join("/"));

const collRef = (resolved: ResolvedPath) => collection(db, resolved.collection.join("/"));

/** Remove `undefined` recursively — Firestore rejects undefined values. */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripUndefined(v)) as unknown as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

const readField = (data: unknown, field: string[]): unknown => {
  let current: unknown = data;
  for (const key of field) {
    if (current == null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current ?? null;
};

const nested = (field: string[], value: unknown): Record<string, unknown> => {
  if (!field.length) return value as Record<string, unknown>;
  return { [field[0]]: nested(field.slice(1), value) };
};

const dotted = (field: string[]) => field.join(".");

/** Read a document, a collection (keyed object), or a nested field. */
export async function fsGet<T = unknown>(path: string): Promise<T | null> {
  if (!isFirebaseAvailable()) return null;
  const resolved = resolvePath(path);
  if (!resolved.docId) {
    const snap = await getDocs(collRef(resolved));
    if (snap.empty) return null;
    const out: Record<string, unknown> = {};
    snap.forEach((d) => {
      if (d.id !== "_") out[d.id] = { id: d.id, ...d.data() };
    });
    return out as T;
  }
  const snap = await getDoc(docRef(resolved));
  if (!snap.exists()) return null;
  const data = { id: snap.id, ...snap.data() };
  if (!resolved.field.length) return data as T;
  return (readField(data, resolved.field) as T) ?? null;
}

/** Create/replace a document, or set a nested field. */
export async function fsSet<T>(path: string, value: T): Promise<void> {
  const resolved = resolvePath(path);
  if (!resolved.docId) throw new Error(`fsSet requires a document path: ${path}`);
  const clean = stripUndefined(value);
  if (!resolved.field.length) {
    await setDoc(docRef(resolved), clean as Record<string, unknown>);
    return;
  }
  await setDoc(docRef(resolved), nested(resolved.field, clean), { merge: true });
}

/** Shallow/nested field update (creates the document when missing). */
export async function fsUpdate(path: string, value: Record<string, unknown>): Promise<void> {
  const resolved = resolvePath(path);
  if (!resolved.docId) throw new Error(`fsUpdate requires a document path: ${path}`);
  const clean = stripUndefined(value);
  const payload = resolved.field.length ? nested(resolved.field, clean) : clean;
  await setDoc(docRef(resolved), payload as Record<string, unknown>, { merge: true });
}

/** Auto-id document in a collection -> returns the new id. */
export async function fsPush<T>(path: string, value: T): Promise<string> {
  const resolved = resolvePath(path);
  const clean = stripUndefined(value) as Record<string, unknown>;
  if (resolved.docId) {
    // Logical path points inside a document: push into a nested map.
    const id = `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await fsSet(`${path}/${id}`, { ...clean, id });
    return id;
  }
  const created = await addDoc(collRef(resolved), clean);
  await setDoc(created, { id: created.id }, { merge: true });
  return created.id;
}

/** Delete a document or a nested field. */
export async function fsRemove(path: string): Promise<void> {
  const resolved = resolvePath(path);
  if (!resolved.docId) throw new Error(`fsRemove requires a document path: ${path}`);
  if (!resolved.field.length) {
    await deleteDoc(docRef(resolved));
    return;
  }
  await setDoc(
    docRef(resolved),
    { [dotted(resolved.field).split(".")[0]]: undefined },
    { merge: true },
  ).catch(() => {});
  await setDoc(docRef(resolved), nested(resolved.field, deleteField()) as never, { merge: true });
}

/** Realtime listener over a document, nested field, or collection. */
export function fsSubscribe<T = unknown>(
  path: string,
  callback: (value: T | null) => void,
): () => void {
  if (!isFirebaseAvailable()) {
    callback(null);
    return () => {};
  }
  const resolved = resolvePath(path);
  if (!resolved.docId) {
    return onSnapshot(
      collRef(resolved),
      (snap) => {
        if (snap.empty) return callback(null);
        const out: Record<string, unknown> = {};
        snap.forEach((d) => {
          if (d.id !== "_") out[d.id] = { id: d.id, ...d.data() };
        });
        callback(out as T);
      },
      () => callback(null),
    );
  }
  return onSnapshot(
    docRef(resolved),
    (snap) => {
      if (!snap.exists()) return callback(null);
      const data = { id: snap.id, ...snap.data() };
      callback(
        (resolved.field.length ? (readField(data, resolved.field) as T) : (data as T)) ?? null,
      );
    },
    () => callback(null),
  );
}

/* -------------------------------------------------------------------------
 * Compatibility helpers
 *
 * Screens use the familiar `ref(db, path)` / `onValue` / `set` / `update` /
 * `remove` / `push` shape. These wrappers keep those call sites unchanged while
 * every read and write goes to Firestore through the primitives above.
 * ---------------------------------------------------------------------- */

export interface PathRef {
  path: string;
}

export const ref = (_db: unknown, path: string): PathRef => ({ path });

export interface CompatSnapshot<T = any> {
  val: () => T;
  exists: () => boolean;
}

const snapshotOf = <T>(value: T | null): CompatSnapshot<T> => ({
  val: () => value,
  exists: () => value !== null && value !== undefined,
});

export function onValue<T = any>(
  target: PathRef | string,
  callback: (snap: CompatSnapshot<T>) => void,
): () => void {
  const path = typeof target === "string" ? target : target.path;
  return fsSubscribe<T>(path, (value) => callback(snapshotOf(value)));
}

export async function get<T = any>(target: PathRef | string): Promise<CompatSnapshot<T>> {
  const path = typeof target === "string" ? target : target.path;
  return snapshotOf(await fsGet<T>(path));
}

export const set = (target: PathRef | string, value: unknown) =>
  fsSet(typeof target === "string" ? target : target.path, value);

export const update = (target: PathRef | string, value: Record<string, unknown>) =>
  fsUpdate(typeof target === "string" ? target : target.path, value);

export const remove = (target: PathRef | string) =>
  fsRemove(typeof target === "string" ? target : target.path);

export async function push(
  target: PathRef | string,
  value: unknown,
): Promise<{ key: string }> {
  const path = typeof target === "string" ? target : target.path;
  return { key: await fsPush(path, value) };
}
