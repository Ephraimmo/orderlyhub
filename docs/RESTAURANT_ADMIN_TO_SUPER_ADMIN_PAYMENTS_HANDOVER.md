# Handover: Restaurant Admin Payments → Super Admin Console

> **Audience:** AI / developer updating the **ForkFleet Super Admin console**
> (`forkfleetadminconsole`) so its payment configuration and order-approval flow match
> Restaurant Admin ("Orderly Hub").
> **Direction:** this is the reverse of the other handover docs in this repo — Orderly Hub is the
> **source of truth** here, and the Super Admin console is the one being brought up to date.
> **Source of truth:** Restaurant Admin (`orderlyhub-main`), `src/pages/Settings.tsx`,
> `src/pages/Orders.tsx`, `src/pages/Payments.tsx` — snapshot as of **2026-09-20**.
> **Scope:** two related but distinct features, covered in one document because they share the
> same underlying data:
> 1. **Card Payment (Stripe) setup** — where the publishable/secret keys live and how the toggle
>    works.
> 2. **Payment verification ("wait for approval")** — why some orders can't be Accepted until a
>    human approves the customer's proof of payment, and how that approval is recorded.

Related docs in this repo: `SUPER_ADMIN_TO_RESTAURANT_ADMIN_ORDERS_HANDOVER.md` documents the
per-order `payment_method` / `payment_status` fields and the `orderStage()` algorithm this doc's
gating logic builds on top of — read that one first if the order-status vocabulary here is unclear.
This doc does **not** redefine anything from it; §3 below is additive.

---

## 0. ⚠️ A bug was found and fixed while writing this doc — do not port the old behavior

Before today, Orderly Hub's Settings screen **could not actually save a Stripe key**. The read
handler unconditionally reset both key fields to `""` on every Firestore snapshot, and the save
handler never included them in the write payload at all — so anything an admin typed into either
field was silently discarded the moment they clicked Save (the very next `onSnapshot` event blanked
the form again). This was fixed today in `src/pages/Settings.tsx`. **Copy the behavior described
in §2 below (the fixed version), not what you might find by naively re-deriving it from a stale
copy of this file** — the shape of the fix matters: both keys must be present in *both* the read
hydration and the write payload, in the same nested `methods.card` object.

---

## 1. What you must understand first

### 1.1 Payment method config lives on the restaurant's own Firestore document — not a subcollection

Like everything else in this app (see the Orders handover doc §1.1), this is Cloud Firestore, not
Realtime Database or Supabase. Card/cash/EFT configuration is **not** a separate collection or
document — it's a nested field on the restaurant's own document:

```
restaurants/{restaurantId}                 -> the restaurant document (name, phone, hours, ...)
restaurants/{restaurantId}.payment_config  -> nested field: { restaurant_id, methods, updated_at, updated_by }
```

`src/lib/restaurant-scope.ts`:

```ts
export function restaurantPath(restaurantId: string): string {
  return `restaurants/${restaurantId}`;
}
export function restaurantPaymentConfigPath(restaurantId: string): string {
  return `restaurants/${restaurantId}/payment_config`;
}
```

Both business-profile fields (name, phone, `opens_at`/`closes_at`, `prep_time_minutes`,
`cloudinaryCloudName`, ...) and payment config live on **the same document** — payment config is
just namespaced under the `payment_config` key. If your console keeps restaurant profile and
payment settings in different documents/tables today, you have two choices: mirror this nesting
exactly, or keep them separate and just make sure whichever admin UI you build writes to
wherever your platform's actual source of truth is. What matters is the **shape** in §2, not
necessarily the exact path.

### 1.2 The whole `methods` map is replaced on every save — never write a partial patch

`Settings.tsx`'s save handler does a single `set()` (Firestore `setDoc(..., {merge:true})` at the
`payment_config` field path) with **all four methods rebuilt from current form state every time**:

```ts
await set(ref(db, restaurantPaymentConfigPath(restaurantId)), {
  restaurant_id: restaurantId,
  methods: {
    card: { enabled, instructions: null, stripePublishableKey, stripeSecretKey },
    cash_on_delivery: { enabled, instructions: null },
    cash_on_pickup: { enabled, instructions: null },
    eft: { enabled, instructions: null },
  },
  updated_at: new Date().toISOString(),
  updated_by: user?.email ?? null,
});
```

Firestore's `merge: true` only merges at the **top-level key you pass** (`payment_config`) — it does
not deep-merge the nested `methods` object against whatever was already there. So this call
**replaces `payment_config.methods` in its entirety** on every save. If your Super Admin
implementation ever saves from a form that only has, say, the Card section loaded, you must still
read-and-rebuild the full `methods` map before writing, or you will silently erase EFT/cash
configuration that isn't part of that form. This is exactly the shape of bug described in §0 — the
missing fields there were empty strings; the same mechanism could just as easily wipe out an entire
sibling method.

### 1.3 Two unrelated "payment status" concepts — don't conflate them

- **This document's `payment_config`** (§1.1) controls which payment methods are *offered* at
  checkout and holds the Stripe *credentials*. It lives on the restaurant document and is set once,
  rarely changed.
- **Per-order `payment_method` / `payment_status`** (documented in the Orders handover doc §2) record
  which method a *specific order* used and whether *that order's* payment has cleared. These live on
  `orders/{orderId}` and change per order, constantly. §3 of this doc is entirely about the second
  concept — do not try to gate order acceptance on `payment_config`, it has no per-order state.

---

## 2. Card Payment (Stripe) setup

### 2.1 Exact shape (copy verbatim)

```ts
// restaurants/{restaurantId}.payment_config
interface RestaurantPaymentConfig {
  restaurant_id: string;
  methods: {
    card: {
      enabled: boolean;
      instructions: null;               // reserved, always null for card today
      stripePublishableKey: string;      // "" when unset — camelCase, NOT snake_case
      stripeSecretKey: string;           // "" when unset — camelCase, NOT snake_case
    };
    cash_on_delivery: { enabled: boolean; instructions: null };
    cash_on_pickup: { enabled: boolean; instructions: null };
    eft: { enabled: boolean; instructions: null };   // UI label: "Upload Proof of Payment"
  };
  updated_at: string;   // ISO 8601
  updated_by: string | null;   // admin email
}
```

**Note the naming inconsistency and preserve it deliberately, don't "fix" it:** every other field in
this schema is snake_case, but `stripePublishableKey`/`stripeSecretKey` are camelCase. This is
already how the field exists in production data; renaming it in a new implementation would just
create a second, unreadable copy of the same setting.

### 2.2 UI (reference: `src/pages/Settings.tsx` lines ~236–281)

- A single "Payment Methods" card lists three toggles: Cash on Delivery, Card Payment (Stripe),
  Upload Proof of Payment (EFT).
- Toggling Card Payment on reveals two additional fields directly beneath it (not a separate
  dialog):
  - **Stripe Publishable Key** — plain `Input`, placeholder `pk_live_... or pk_test_...`.
  - **Stripe Secret Key** — `Input` with `type="password"` by default, plus an eye/eye-off icon
    button (`lucide-react` `Eye`/`EyeOff`) that toggles `type="text"` to reveal it. Caption below:
    *"Keys are saved to Firebase and used by the customer app for Stripe checkout."*
- Everything on this page — business profile, Cloudinary config, and payment methods — saves
  together via one "Save All Settings" button; there is no separate save action for payment methods
  alone.

### 2.3 Read + write (the corrected version — see §0)

```ts
// READ — hydrate form state from Firestore
const methods = paymentConfigDoc.methods ?? {};
card: {
  enabled: methods.card?.enabled ?? previousState.card.enabled,
  stripePublishableKey: methods.card?.stripePublishableKey ?? "",
  stripeSecretKey: methods.card?.stripeSecretKey ?? "",
}

// WRITE — full methods map, every field, every save (see §1.2)
methods: {
  card: {
    enabled: formState.card.enabled !== false,
    instructions: null,
    stripePublishableKey: (formState.card.stripePublishableKey || "").trim(),
    stripeSecretKey: (formState.card.stripeSecretKey || "").trim(),
  },
  cash_on_delivery: { enabled: formState.cash.enabled !== false, instructions: null },
  cash_on_pickup: { enabled: formState.cash.enabled !== false, instructions: null },
  eft: { enabled: formState.proofOfPayment.enabled === true, instructions: null },
}
```

Both the read hydration and the write payload must include the two key fields — omitting them from
either side reproduces the exact bug fixed today.

### 2.4 Landmines specific to this section

- **One "Cash" toggle controls two backend flags.** The UI shows a single "Cash on Delivery" switch,
  but it sets `cash_on_delivery.enabled` *and* `cash_on_pickup.enabled` to the same value
  simultaneously. There is no independent control per fulfillment type today, despite the schema
  supporting it. Decide deliberately whether Super Admin should keep this coupling or split it into
  two switches — don't silently assume one or the other.
- **UI label ≠ storage key for EFT.** The switch is labeled "Upload Proof of Payment" but writes to
  `methods.eft`. Keep whichever pairing you choose consistent across your own UI and code comments so
  the next person doesn't go looking for a `methods.proof_of_payment` field that doesn't exist.
- **Permission gating is `rm.settings.manage` / `rm.profile.manage`, not a payments-specific
  permission.** Editing Stripe credentials sits behind the same permission as editing business hours
  and the logo (`readOnly = !canManage("settings") && !canManage("profile")` — see
  `src/lib/restaurant-permissions.ts`). There is a separate `rm.payments.manage` permission in this
  app, but it governs the *Payments verification* module (§3), not credential entry. If your Super
  Admin console has more granular roles, decide explicitly whether Stripe credential edit access
  should ride on your general settings permission or get its own code — don't assume parity with
  Orderly Hub without checking whether that's actually what you want.

### 2.5 ⚠️ Security note — flag for product/security, do not silently redesign

The Stripe **secret key** is stored in Firestore on a document the UI's own copy already says is
read by the customer-facing app ("used by the customer app for Stripe checkout"). Shipping a Stripe
secret key to any client — the customer app, or any restaurant staff member whose role can read the
restaurant document — is a serious anti-pattern: secret keys must never leave a trusted server
context. This is how Orderly Hub already works today; this document is not asking you to introduce
the risk, but copying this pattern into Super Admin would spread the same vulnerability platform-wide
instead of containing it to one app.

**Do not silently "fix" this by redesigning the checkout flow as part of this handover** — that's a
materially larger change (a server-side Checkout Session / PaymentIntent creation endpoint, e.g. a
Cloud Function, that holds the secret key and only ever returns a client secret / session URL to the
browser) and neither this repo nor the customer app repo is in scope here. Flag it explicitly to
whoever owns the Super Admin payments roadmap and let them decide whether to fix it now, fix it
later, or accept the risk — the same way the Orders handover doc flags the unscoped Firestore rules
as a known gap rather than quietly patching it.

---

## 3. Payment verification ("wait for approval") workflow

### 3.1 The rule

An order paid by a method that isn't settled instantly **cannot be Accepted** from the Orders screen
until a restaurant admin has approved its uploaded proof of payment in the Payments module. This
closes a real gap: without it, a restaurant could accept (and start cooking) an order whose EFT
payment turns out to be fake or never arrives.

```ts
// src/lib/order-display.ts
const INSTANT_PAYMENT_METHODS = new Set(["cash", "card", "wallet", "apple_pay", "google_pay"]);

export function paymentRequiresVerification(order): boolean {
  const method = orderPaymentMethod(order); // lower-cased payment_method
  return method !== "—" && !INSTANT_PAYMENT_METHODS.has(method);
}

export function isPaymentVerified(order): boolean {
  return orderPaymentStatus(order) === "paid";
}
```

**Copy the exclusion-list shape, not an inclusion list.** Only methods known to settle instantly are
exempted; anything else — EFT today, and any future method neither side has thought of yet — defaults
to requiring verification. This fails closed: a new/unrecognized payment method is treated as
needing manual review rather than silently bypassing it.

### 3.2 `payment_status` values and what they mean here

Reuses the exact same field from the Orders handover doc §2 (`payment_status: "pending" | "paid" |
"failed" | "refunded"`) — there is no separate "verification status" field. In this workflow:

| `payment_status` | Meaning | UI label in Payments |
|---|---|---|
| `pending` | Not yet reviewed | Pending |
| `paid` | Restaurant approved the proof of payment | **Approved** |
| `failed` | Restaurant rejected the proof of payment | **Rejected** |
| `refunded` | (unrelated to this flow; also blocks acceptance defensively) | Refunded |

`isPaymentVerified()` checks for exactly `"paid"` — nothing else counts, including `refunded`, which
is intentional (a refunded order should never be re-accepted).

### 3.3 What changes on the Orders screen

Reference: `src/pages/Orders.tsx`. At stage `pending` (see the Orders handover doc §3 for the stage
algorithm — this sits on top of it, not instead of it):

- **If `paymentRequiresVerification(order) && !isPaymentVerified(order)`:** the Accept button is
  **replaced**, not just disabled, with a link to the Payments screen (`/payments` in this app) —
  or, for a user without permission to view Payments, a plain "Awaiting payment verification" notice.
  **Reject remains available regardless** — a restaurant can still decline an order it can't fulfill
  even if payment hasn't been verified yet; only Accept is gated.
- **Defense in depth:** the `acceptOrder()` handler itself re-checks
  `paymentRequiresVerification(order) && !isPaymentVerified(order)` and refuses even if somehow
  invoked, rather than relying solely on the button being hidden.
- The order detail dialog shows a "Payment not yet verified" banner (Details tab) and, in the Payment
  tab, a verification-status line plus the uploaded receipt image, when the order requires review.

Do not let restaurant staff work around this by editing `status` directly, or by any path other than
the one below.

### 3.4 What changes on the Payments screen — this is the only way to clear the gate

Reference: `src/pages/Payments.tsx` and `src/lib/orders.firebase.ts`'s `reviewOrderPayment()`. There
is exactly one function that resolves this state, and it is intentionally narrow:

```ts
// src/lib/orders.firebase.ts
export async function reviewOrderPayment(input: {
  orderId: string;
  decision: "paid" | "failed";
  actor?: string | null;
}): Promise<void> {
  const order = await fsGet<FirebaseOrder>(orderPath(input.orderId));
  const ts = now();
  await fsSet(orderPath(input.orderId), {
    ...order,
    payment_status: input.decision,
    payment_reviewed_at: ts,
    payment_reviewed_by: input.actor ?? null,
    updated_at: ts,
  });
  await appendTimeline(input.orderId, {
    status: "note",
    note: input.decision === "paid" ? "Proof of payment approved" : "Proof of payment rejected",
    actor: input.actor ?? null,
  });
}
```

Key properties to preserve:

- **It never touches the order's `status` field.** Approving a payment does not accept the order —
  the restaurant still has to go press Accept afterward (now unblocked). Rejecting a payment does not
  reject the order either — those remain two separate, deliberate actions. Do not cascade one into
  the other; if product wants that coupling, that's an explicit decision to make, not something to
  assume.
- It records **who** reviewed it and **when** (`payment_reviewed_by`/`payment_reviewed_at`), and logs
  a note to the order's own `timeline` subcollection — same audit trail every other order mutation in
  this app uses (see the Orders handover doc §7 for why that subcollection is the canonical log,
  distinct from the driver app's inline `timeline` array field).
- The Payments screen lists orders where `paymentRequiresVerification(o) || Boolean(proofUrl)` is
  true (so cash/card orders never clutter it, but a stray receipt upload on an otherwise-instant
  method still surfaces defensively), lets the admin view the uploaded image, and offers **Approve**
  → `decision: "paid"` / **Reject** → `decision: "failed"`. Gated on `rm.payments.manage`
  (`rm.payments.view` for read-only).

### 3.5 Landmines specific to this section

- **Two different "approved" vocabularies existed before today and were unified.** An earlier version
  of `Payments.tsx` wrote a separate, invented `paymentStatus` field (camelCase, values
  `"pending"/"approved"/"rejected"`) that didn't match the canonical `payment_status`
  (`"pending"/"paid"/"failed"/"refunded"`) used everywhere else, so the Orders screen and the
  Payments screen silently disagreed about an order's state. **Use one field with the canonical
  values; keep "Approved"/"Rejected" only as display labels**, exactly as shown in §3.2's table — do
  not introduce a second status vocabulary in Super Admin either.
- **The order list must use the real order number, not a raw document id.** The earlier
  `Payments.tsx` displayed `#{doc.id.slice(-6)}`; real orders carry a human-readable
  `order_number` (e.g. `FF-578281`) that customers and support reference. Always resolve display
  identifiers the same way the Orders screen does.

---

## 4. Permissions summary

| Action | Permission |
|---|---|
| View/edit Stripe keys + payment method toggles (Settings) | `rm.settings.manage` or `rm.profile.manage` |
| View the Payments verification queue | `rm.payments.view` |
| Approve / reject a proof of payment | `rm.payments.manage` |
| Accept / reject an order (blocked per §3 until payment approved, when applicable) | `rm.orders.manage` |

These are independent of each other by design — a user with `rm.orders.manage` cannot bypass §3's
gate just because they can accept orders; they must separately hold `rm.payments.manage` (or wait for
someone who does) to clear it.

---

## 5. Acceptance checklist

- [ ] `payment_config.methods.card` includes `stripePublishableKey`/`stripeSecretKey`, both
      round-tripping correctly on read *and* write (§0, §2.3) — verify by saving a key, reloading the
      page, and confirming it's still populated
- [ ] Saving payment settings always rewrites the full `methods` map (§1.2) — never a partial patch
      that could erase sibling methods
- [ ] `paymentRequiresVerification()` uses an exclusion list of instant methods, defaulting
      unrecognized methods to "requires verification" (§3.1)
- [ ] Orders at `pending` whose payment requires verification and isn't yet `paid` cannot be
      Accepted — Accept is replaced with guidance to Payments, not merely disabled; Reject stays
      available (§3.3)
- [ ] Approving/rejecting a payment never changes the order's own `status` (§3.4)
- [ ] Payment review is a single canonical `payment_status` field with values
      `pending/paid/failed/refunded` — no second, parallel status field (§3.5)
- [ ] Stripe secret key exposure has been explicitly flagged to product/security, not silently
      accepted or silently "fixed" out of scope (§2.5)
- [ ] Permissions checked independently per §4 — no permission implies another

---

## 6. AI implementation prompt (copy-paste)

```
You are updating the Super Admin console (forkfleetadminconsole) to match how Restaurant Admin
("Orderly Hub") configures card payments and gates order acceptance on payment verification
(reference: docs/RESTAURANT_ADMIN_TO_SUPER_ADMIN_PAYMENTS_HANDOVER.md in the orderlyhub-main repo).
Do not invent a different shape — copy the schema and behavior in that doc exactly.

## Goal
1. Restaurants must be able to configure Stripe publishable/secret keys and toggle payment methods,
   and those keys must actually persist (a real bug existed here — see the handover doc §0 — where
   keys were silently discarded on save; do not reproduce it).
2. Orders paid by a non-instant method (e.g. EFT) must not be Acceptable until their proof of
   payment is approved in the payments review screen.

## Required behaviour

### 1. Payment method configuration
- Store per-restaurant: methods.card.{enabled, stripePublishableKey, stripeSecretKey},
  methods.cash_on_delivery.enabled, methods.cash_on_pickup.enabled, methods.eft.enabled — exact
  field names from handover doc §2.1.
- Read hydration AND write payload must both include stripePublishableKey/stripeSecretKey. Verify
  by saving then reloading.
- Every save rewrites the full methods map (handover doc §1.2) — never write only the method being
  edited, or you will erase the others.

### 2. Payment verification gate
- Implement paymentRequiresVerification(order): true unless payment method is one of
  cash/card/wallet/apple_pay/google_pay (exclusion list, fails closed for unknown methods).
- Implement isPaymentVerified(order): payment_status === "paid".
- On the Orders screen, for a pending order where paymentRequiresVerification && !isPaymentVerified:
  replace the Accept action with a link/notice pointing to the payments review screen. Reject stays
  available. Re-check the same condition inside the accept handler itself as defense in depth.
- Implement reviewOrderPayment({orderId, decision: "paid"|"failed", actor}): sets payment_status,
  payment_reviewed_at, payment_reviewed_by, and logs an audit note. It must NEVER change the order's
  own status field — accepting/rejecting the order stays a separate, deliberate action.
- Use a single canonical payment_status field (pending/paid/failed/refunded) for this — do not add a
  second, parallel "approved/rejected" status field.

### 3. Permissions
- Gate Stripe credential editing on your settings/profile management permission (not a
  payments-specific one, to match Orderly Hub — or deviate deliberately and document why).
- Gate the payment review screen and its approve/reject actions on a payments permission.
- Check these independently of each other and of order-management permissions — no permission
  should imply another.

### 4. Security
- Flag prominently to product/security (do not silently redesign in this task): the Stripe secret
  key is stored in a document readable by clients (customer app + restaurant staff), which is
  itself already how Orderly Hub works. Document the risk; let the payments roadmap owner decide
  whether/when to move Checkout Session creation server-side.

## Non-goals
- Do not build a server-side Stripe integration or Cloud Function as part of this task.
- Do not couple payment approval to order status — they are independent fields, independently
  mutated.
- Do not invent a second payment/verification status vocabulary.

## Reference files (Orderly Hub repo)
- src/pages/Settings.tsx (Stripe key UI + save/read, lines ~52-138, ~236-281)
- src/lib/restaurant-scope.ts (restaurantPaymentConfigPath)
- src/lib/order-display.ts (paymentRequiresVerification, isPaymentVerified, orderPaymentStatus)
- src/lib/orders.firebase.ts (reviewOrderPayment)
- src/pages/Orders.tsx (Accept gating, payment banners)
- src/pages/Payments.tsx (review queue + approve/reject UI)
- src/lib/restaurant-permissions.ts (rm.settings.*, rm.payments.*, rm.orders.manage)
- docs/SUPER_ADMIN_TO_RESTAURANT_ADMIN_ORDERS_HANDOVER.md (order status model this builds on)
```

---

## 7. Source map (Orderly Hub repo)

| File | Role |
|---|---|
| `src/pages/Settings.tsx` | Stripe key UI, payment method toggles, read/write of `payment_config` |
| `src/lib/restaurant-scope.ts` | `restaurantPath`, `restaurantPaymentConfigPath` |
| `src/lib/order-display.ts` | `paymentRequiresVerification`, `isPaymentVerified`, `orderPaymentStatus`, `orderPaymentMethod`, `orderPaymentProofUrl` |
| `src/lib/orders.firebase.ts` | `reviewOrderPayment`, `FirebaseOrder.payment_status`/`payment_reviewed_at`/`payment_reviewed_by` |
| `src/pages/Orders.tsx` | Accept-gating on pending orders, payment banners in the detail dialog |
| `src/pages/Payments.tsx` | Payment Verification screen — queue, review dialog, Approve/Reject |
| `src/lib/restaurant-permissions.ts` | `rm.settings.*`, `rm.profile.manage`, `rm.payments.*`, `rm.orders.manage` |

---

*Prepared as a handover reference — update alongside any change to the payment configuration or
verification model.*
