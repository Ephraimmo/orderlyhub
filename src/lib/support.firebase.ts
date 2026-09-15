// Support / inquiries data layer for Restaurant Admin.
//
// Source of truth: shared Firebase RTDB `e-comm-bd997` — the same database the
// customer app and ForkFleet Super Admin use. There is NO Supabase table for
// support; do not create one.
//
//   /support/tickets/{ticketId}              -> SupportTicket
//   /support/messages/{ticketId}/{messageId} -> SupportMessage
//
// Scoping rule (the entire point of this module):
//   visible(ticket, session) <=> ticket.restaurant_id === session.restaurantId
// Tickets with restaurant_id === null are platform-level and must never be
// rendered, counted, or acted on here.

import { isFirebaseAvailable, fsGet, fsSet, fsSubscribe, fsUpdate, type FirestoreValue } from "@/lib/firestore";
import type { RestaurantUserSession } from "@/lib/restaurant-users.firebase";

export type SupportChannel = "chat" | "email" | "phone" | "in_app";
export type SupportStatus = "open" | "in_progress" | "waiting" | "resolved";
export type SupportPriority = "low" | "medium" | "high" | "urgent";

export interface SupportTicket {
  id: string;
  subject: string;
  channel: SupportChannel;
  status: SupportStatus;
  priority: SupportPriority;
  customer_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  order_id: string | null;
  order_number: string | null;
  restaurant_id: string | null;
  restaurant_name: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_from: "customer" | "agent" | null;
  unread_for_agent: number;
  unread_for_customer: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  from: "customer" | "agent" | "system";
  author_id: string | null;
  author_name: string;
  body: string;
  attachment_url: string | null;
  at: string;
}

const TICKETS_PATH = "support/tickets";
const MESSAGES_PATH = "support/messages";

const SUPPORT_STATUSES: SupportStatus[] = ["open", "in_progress", "waiting", "resolved"];
const SUPPORT_PRIORITIES: SupportPriority[] = ["low", "medium", "high", "urgent"];
const SUPPORT_CHANNELS: SupportChannel[] = ["chat", "email", "phone", "in_app"];

function pickEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  const raw = String(value ?? "").trim();
  return (allowed as string[]).includes(raw) ? (raw as T) : fallback;
}

function pickString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function pickNullableString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function pickCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Legacy/partial records exist — default missing fields like Super Admin's coerceTicket(). */
export function coerceTicket(id: string, raw: Partial<SupportTicket> | null | undefined): SupportTicket {
  const nowIso = new Date().toISOString();
  return {
    id: raw?.id ?? id,
    subject: pickString(raw?.subject),
    channel: pickEnum(raw?.channel, SUPPORT_CHANNELS, "chat"),
    status: pickEnum(raw?.status, SUPPORT_STATUSES, "open"),
    priority: pickEnum(raw?.priority, SUPPORT_PRIORITIES, "medium"),
    customer_id: pickNullableString(raw?.customer_id),
    customer_name: pickString(raw?.customer_name).trim() || "Customer",
    customer_email: pickNullableString(raw?.customer_email),
    customer_phone: pickNullableString(raw?.customer_phone),
    order_id: pickNullableString(raw?.order_id),
    order_number: pickNullableString(raw?.order_number),
    restaurant_id: pickNullableString(raw?.restaurant_id),
    restaurant_name: pickNullableString(raw?.restaurant_name),
    assigned_to: pickNullableString(raw?.assigned_to),
    assigned_name: pickNullableString(raw?.assigned_name),
    last_message: pickNullableString(raw?.last_message),
    last_message_at: pickNullableString(raw?.last_message_at),
    last_message_from:
      raw?.last_message_from === "customer" || raw?.last_message_from === "agent"
        ? raw.last_message_from
        : null,
    unread_for_agent: pickCount(raw?.unread_for_agent),
    unread_for_customer: pickCount(raw?.unread_for_customer),
    created_at: pickNullableString(raw?.created_at) ?? nowIso,
    updated_at: pickNullableString(raw?.updated_at) ?? nowIso,
    resolved_at: pickNullableString(raw?.resolved_at),
  };
}

function coerceMessage(id: string, raw: Partial<SupportMessage> | null | undefined): SupportMessage {
  return {
    id: raw?.id ?? id,
    ticket_id: pickString(raw?.ticket_id),
    from: pickEnum(raw?.from, ["customer", "agent", "system"] as const, "customer"),
    author_id: pickNullableString(raw?.author_id),
    author_name: pickString(raw?.author_name).trim() || "Customer",
    body: pickString(raw?.body),
    attachment_url: pickNullableString(raw?.attachment_url),
    at: pickNullableString(raw?.at) ?? new Date(0).toISOString(),
  };
}

function toList<T>(raw: Record<string, T> | null | undefined): Array<[string, T]> {
  return raw ? Object.entries(raw) : [];
}

/** ISO timestamps sort lexicographically — never convert to numbers. */
export function ticketSortKey(t: Pick<SupportTicket, "last_message_at" | "created_at">): string {
  return t.last_message_at ?? t.created_at;
}

export function sortTicketsNewestFirst<T extends Pick<SupportTicket, "last_message_at" | "created_at">>(
  tickets: T[],
): T[] {
  return [...tickets].sort((a, b) => ticketSortKey(b).localeCompare(ticketSortKey(a)));
}

export function belongsToRestaurant(
  ticket: { restaurant_id?: string | null } | null | undefined,
  restaurantId: string,
): boolean {
  return String(ticket?.restaurant_id ?? "").trim() === restaurantId;
}

/**
 * Live subscription to this restaurant's support tickets only. RTDB cannot
 * deep-filter nested fields server-side, so we subscribe to the collection and
 * filter client-side (same accepted pattern as orders).
 */
export function subscribeRestaurantTickets(
  restaurantId: string,
  cb: (tickets: SupportTicket[]) => void,
): () => void {
  if (!isFirebaseAvailable() || !restaurantId) {
    cb([]);
    return () => {};
  }
  return fsSubscribe<Record<string, Partial<SupportTicket>> | null>(TICKETS_PATH, (raw) =>
    cb(
      sortTicketsNewestFirst(
        toList(raw)
          .map(([id, t]) => coerceTicket(id, t))
          .filter((t) => belongsToRestaurant(t, restaurantId)),
      ),
    ),
  );
}

/** Live thread for one ticket, oldest → newest. Caller must re-check scoping of the parent ticket. */
export function subscribeTicketMessages(
  ticketId: string,
  cb: (messages: SupportMessage[]) => void,
): () => void {
  if (!isFirebaseAvailable() || !ticketId) {
    cb([]);
    return () => {};
  }
  return fsSubscribe<Record<string, Partial<SupportMessage>> | null>(
    `${MESSAGES_PATH}/${ticketId}`,
    (raw) =>
      cb(
        toList(raw)
          .map(([id, m]) => coerceMessage(id, m))
          .sort((a, b) => a.at.localeCompare(b.at)),
      ),
  );
}

/** Super Admin's relativeTime() format: just now, Xm, Xh, Xd. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const w = (v: unknown): FirestoreValue => v as FirestoreValue;

async function loadScopedTicket(
  ticketId: string,
  restaurantId: string,
): Promise<SupportTicket> {
  const raw = await fsGet<Partial<SupportTicket>>(`${TICKETS_PATH}/${ticketId}`);
  if (!raw) throw new Error("Ticket not found");
  const ticket = coerceTicket(ticketId, raw);
  if (!belongsToRestaurant(ticket, restaurantId)) {
    throw new Error("This inquiry does not belong to your restaurant");
  }
  return ticket;
}

function agentAuthorName(session: RestaurantUserSession): string {
  const base = session.fullName?.trim() || session.email;
  return `${base} · Restaurant Support`;
}

/**
 * Reply on behalf of the restaurant. Writes `from: "agent"` so the customer app
 * renders it unchanged, then mirrors sendAgentReply()'s read-modify-write on
 * the parent ticket.
 */
export async function sendRestaurantReply(input: {
  ticketId: string;
  session: RestaurantUserSession;
  body: string;
}): Promise<void> {
  const body = input.body.trim();
  if (!body) throw new Error("Reply cannot be empty");
  if (!isFirebaseAvailable()) throw new Error("Firebase unavailable");

  const existing = await loadScopedTicket(input.ticketId, input.session.restaurantId);

  const at = new Date().toISOString();
  const message: SupportMessage = {
    id: `msg_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`,
    ticket_id: input.ticketId,
    from: "agent",
    author_id: input.session.userId,
    author_name: agentAuthorName(input.session),
    body,
    attachment_url: null,
    at,
  };

  const patch: Record<string, FirestoreValue> = {
    last_message: body.slice(0, 160),
    last_message_at: at,
    last_message_from: "agent",
    unread_for_agent: 0,
    unread_for_customer: Number(existing.unread_for_customer ?? 0) + 1,
    status: existing.status === "open" ? "in_progress" : existing.status || "in_progress",
    updated_at: at,
  };
  await fsUpdate(`${TICKETS_PATH}/${input.ticketId}`, patch);
  await fsSet(`${MESSAGES_PATH}/${input.ticketId}/${message.id}`, w(message));
}

/** Resolve sets resolved_at; any other status clears it; always bumps updated_at. */
export async function setRestaurantTicketStatus(input: {
  ticketId: string;
  session: RestaurantUserSession;
  status: SupportStatus;
}): Promise<void> {
  if (!isFirebaseAvailable()) throw new Error("Firebase unavailable");
  await loadScopedTicket(input.ticketId, input.session.restaurantId);

  const at = new Date().toISOString();
  const patch: Record<string, FirestoreValue> = { status: input.status, updated_at: at };
  if (input.status === "resolved") {
    patch.resolved_at = at;
  } else {
    patch.resolved_at = null;
  }
  await fsUpdate(`${TICKETS_PATH}/${input.ticketId}`, patch);
}

/**
 * Shared staff-facing counter: opening a thread clears the badge in Super
 * Admin's inbox too — that is one queue by design, not a bug.
 */
export async function markRestaurantTicketReadByAgent(ticketId: string, restaurantId: string): Promise<void> {
  if (!isFirebaseAvailable()) return;
  await loadScopedTicket(ticketId, restaurantId);
  await fsUpdate(`${TICKETS_PATH}/${ticketId}`, { unread_for_agent: 0 });
}
