# Handover: Restaurant Admin Customers (real-time data) → Super Admin Console

> **Audience:** AI / developer updating the **ForkFleet Super Admin console**
> (`forkfleet-admin-console`) so its Customers view reads live, real per-restaurant data instead of
> demo/placeholder data.
> **Direction:** same direction as the Media and Payments handover docs in this repo — Orderly Hub
> is the **source of truth**, Super Admin is the one being brought up to date.
> **Source of truth:** Restaurant Admin (`orderlyhub-main`), `src/pages/Customers.tsx` — snapshot as
> of **2026-09-20**.
> **Scope:** Super Admin's Customers section currently shows demo data. This doc describes how
> Orderly Hub actually sources customer data — live Firebase Realtime Database listeners, not a
> one-time fetch and not mock data — so Super Admin can be brought up to the same standard on a
> per-restaurant basis.

Related docs: this is unrelated in schema to
`RESTAURANT_ADMIN_TO_SUPER_ADMIN_MEDIA_HANDOVER.md` and
`RESTAURANT_ADMIN_TO_SUPER_ADMIN_PAYMENTS_HANDOVER.md` — it's cross-referenced from those only
because it surfaced in the same handover pass, not because it shares any data with Cloudinary or
payment config. It does share the **order data model** with the Orders handover doc
(`SUPER_ADMIN_TO_RESTAURANT_ADMIN_ORDERS_HANDOVER.md`, if present in your checkout) — read that one
for the full `orders/{orderId}` shape; this doc only uses a handful of order fields to compute
per-customer order count and spend.

---

## 0. The problem this doc addresses

Per the person requesting this handover: **the Super Admin app is currently showing demo data on its
Customers view.** That's a data-freshness/wiring gap, not a schema gap — Super Admin needs to read
the same live records Orderly Hub reads, scoped to the restaurant being viewed, instead of rendering
hardcoded or seeded sample rows. This doc documents exactly what "the same live records" means by
describing Orderly Hub's actual implementation.

**Caveat on Super Admin specifics:** unlike the Media and Payments handover docs, this one does not
cite exact Super Admin file paths/line numbers for the current demo-data implementation — that repo
wasn't available to cross-check while writing this doc. Locate the current Customers view in
`forkfleet-admin-console` (likely `src/routes/_authenticated/customers.tsx` or similar, possibly
nested under a restaurant's detail page) and replace whatever seed/mock data it renders with the
pattern below. Don't guess at exact paths from this doc; confirm them in that repo first.

---

## 1. What you must understand first

### 1.1 Customer data lives in two RTDB nodes, read live, not fetched once

Reference: `src/pages/Customers.tsx`, full file. Orderly Hub subscribes to two top-level Realtime
Database nodes with `onValue` (a live listener, not a one-shot `get()`):

```ts
const unsub1 = onValue(ref(db, "customers"), (snap) => { /* ... */ });
const unsub2 = onValue(ref(db, "orders"), (snap) => { /* ... */ });
```

Both listeners are torn down on unmount (`return () => { unsub1(); unsub2(); };`). This is the
"real-time" behavior being asked for: when a new order comes in or a customer record changes
anywhere in the app, this screen updates itself immediately — there is no manual refresh, no
polling interval, and no cached snapshot that goes stale. **Replicate the live-subscription
pattern, not a one-time load-on-mount fetch** — a `get()` call that only runs once on page load would
technically pull real data but would not behave like Orderly Hub's screen (it would go stale the
moment another order arrives while the page is open).

### 1.2 Customers are NOT restaurant-scoped by their own record — scoping is derived transitively, through orders

This is the landmine most likely to trip up a naive per-restaurant reimplementation. The `customers`
RTDB node has **no `restaurant_id` field** — Orderly Hub reads the entire global `customers` node,
unfiltered:

```ts
onValue(ref(db, "customers"), (snap) => {
  setCustomers(Object.entries(snap.val()).map(([id, val]: any) => ({ id, ...val })));
});
```

Orderly Hub gets away with this because it's a **single-tenant** app — one deployment, one
restaurant, so "all customers" and "this restaurant's customers" are the same set. Super Admin is
multi-tenant, so a Customers view scoped to one restaurant **cannot filter the `customers` node
itself** — there's nothing on a customer record to filter by. Instead, restaurant-scoping has to be
derived the same way the rest of this screen derives per-customer stats: through that restaurant's
own **orders**, which do carry `restaurant_id`:

```ts
const unsub2 = onValue(ref(db, "orders"), (snap) => {
  setOrders(
    Object.entries(snap.val())
      .map(([id, val]: any) => ({ id, ...val }))
      .filter((o) => belongsToRestaurant(o, restaurantId)),
  );
});
```

(`belongsToRestaurant` from `src/lib/restaurant-scope.ts`: `String(record?.restaurant_id ?? "").trim() === restaurantId`.)

**For a per-restaurant Customers view in Super Admin, "this restaurant's customers" must be defined
as: customers who appear on at least one order with this restaurant's `restaurant_id`** — i.e.
filter `orders` by `restaurant_id` first, collect the distinct `customerId`/`customer_id` values from
that filtered set, then look up only those ids in the global `customers` node. Do not add a
`restaurant_id` field to the `customers` node yourself as a shortcut — a customer can plausibly order
from more than one restaurant on a shared platform, and inventing an ownership field would silently
assume otherwise. If Super Admin needs a customer to appear under every restaurant they've ordered
from (rather than being "owned" by one), that's what deriving from orders naturally gives you for
free; a `customers.restaurant_id` field would actively break that.

### 1.3 Per-customer stats (order count, total spent) are computed client-side from the filtered order list, not stored fields

Neither "orders count" nor "total spent" exists as a stored field on a customer record. Both are
derived at render time from the (restaurant-filtered) orders list:

```ts
const getCustomerOrders = (customerId: string) =>
  orders.filter((o) => o.customerId === customerId || o.customer_id === customerId);
const getCustomerSpent = (customerId: string) =>
  getCustomerOrders(customerId).reduce((sum, o) => sum + getOrderTotal(o), 0);
```

Note the dual key check (`customerId` **or** `customer_id`) — order records in this codebase are
inconsistent about casing for this field, and Orderly Hub defensively checks both. Copy that
defensiveness; don't assume one casing has been fully migrated away.

`getOrderTotal(order)` itself falls back through several possible shapes in priority order, because
not every order document has a clean top-level `total`:

```ts
const getOrderTotal = (order: any) => {
  const explicitTotal = toAmount(order?.total);
  if (explicitTotal > 0) return explicitTotal;
  const subtotal = toAmount(order?.subtotal);
  const deliveryFee = toAmount(order?.deliveryFee);
  const serviceFee = toAmount(order?.serviceFee);
  const discount = toAmount(order?.discount);
  if (subtotal > 0) return Math.max(0, subtotal + deliveryFee + serviceFee - discount);
  const itemsTotal = order?.items
    ? Object.values(order.items).reduce<number>((sum, item: any) => {
        const lineTotal = toAmount(item?.total) || toAmount(item?.lineTotal);
        if (lineTotal > 0) return sum + lineTotal;
        return sum + (toAmount(item?.price) * Math.max(1, toAmount(item?.quantity)));
      }, 0)
    : 0;
  return Math.max(0, itemsTotal + deliveryFee + serviceFee - discount);
};
```

Priority: explicit `total` → reconstructed from `subtotal` + fees − discount → reconstructed from
summing `items`. Copy this fallback chain rather than assuming every order in your data has a clean
`total` field — if Super Admin's order records are more consistent than Orderly Hub's, this still
degrades safely; if they're not, skipping the fallback would under-report spend for any order missing
a top-level `total`.

### 1.4 Customer record shape (read) and the one field Orderly Hub writes back

Read shape, per customer, all optional/defensive (`c.field || "—"` throughout):

```ts
interface CustomerRecord {
  name?: string;
  email?: string;
  phone?: string;
  address?: string | { label?: string; street?: string };
  active?: boolean;   // treated as true unless explicitly false: c.active !== false
}
```

The only write Orderly Hub performs against a customer record is toggling active/inactive:

```ts
const toggleActive = async (customer: any) => {
  await update(ref(db, `customers/${customer.id}`), { active: !(customer.active !== false) });
};
```

This is a **global** toggle on the shared `customers` node (consistent with §1.2 — there's no
restaurant-scoped copy of a customer to toggle instead). If Super Admin lets a restaurant operator
deactivate a customer from a per-restaurant view, be aware that action is not restaurant-scoped
either in the source app — decide deliberately whether that's the behavior you want to keep (a
customer deactivated by one restaurant becomes inactive everywhere) or whether Super Admin should
introduce a restaurant-scoped block/flag instead. Don't silently assume parity here; this is a
sharper version of the same "global toggle" landmine, now visible across tenants instead of hidden
inside one.

### 1.5 Order fields the Customer detail view reads

The order-history section of the customer detail dialog reads: `id`, `status`, `total` (via
`getOrderTotal`), `paymentMethod`, `paymentStatus` (`"approved" | "rejected" | ` other →
pending-styled), `type` (`"delivery" | "pickup"`, defaults to `"delivery"`), `createdAt`. Cross-check
these against whatever the Orders handover doc in your checkout says orders actually store — that
doc is the canonical order shape; this doc only lists which of those fields feed this one screen.

---

## 2. What "real-time" requires, concretely

- Use live listeners (Firestore `onSnapshot` / RTDB `onValue`, whichever your Super Admin data layer
  already uses elsewhere — check how the existing Orders/Payments screens in Super Admin subscribe,
  and match that, don't introduce a third subscription style) — not `getDocs`/`get()` one-time reads.
- Unsubscribe on unmount / restaurant-id change, exactly as Orderly Hub does, to avoid leaking
  listeners across restaurant switches.
- Recompute derived stats (order count, spend) reactively whenever either the customers or the
  filtered-orders listener fires — don't cache them into a separate stored field that could drift
  from the live orders list.

---

## 3. Landmines

- **Don't add a `restaurant_id` field to `customers` as a shortcut** — Orderly Hub has none, and
  doing so would assume a customer belongs to exactly one restaurant, which the current data model
  doesn't assume (§1.2).
- **Don't replace the live listener with a one-time fetch** — that would still be "real data" but not
  "real-time," and defeats the actual ask (§1.1, §2).
- **Don't drop the dual `customerId`/`customer_id` key check** — the underlying order data is
  inconsistent about casing; checking only one will silently undercount some customers' orders
  (§1.3).
- **Don't assume every order has a clean top-level `total`** — copy the subtotal/items fallback chain
  in §1.3 or spend figures will be wrong for any order missing it.
- **The active/inactive toggle is global, not per-restaurant, in the source app** — decide
  deliberately whether to keep that or scope it, don't assume (§1.4).
- **No exact Super Admin file paths are cited here** (see §0) — this repo wasn't available to verify
  against; confirm the real location of the current demo-data Customers view before wiring this in.

---

## 4. Acceptance checklist

- [ ] Super Admin's Customers view for a given restaurant subscribes live (not one-time) to real
      order and customer data — verified by placing a new order while the screen is open and seeing
      it appear without a manual refresh.
- [ ] "This restaurant's customers" is derived from customers who appear on that restaurant's own
      orders (filtered by `restaurant_id`), not from a new ownership field added to `customers`
      (§1.2).
- [ ] Order count and total spent are computed client-side from the restaurant-filtered order list
      using the same fallback chain as `getOrderTotal` (§1.3), not read from a stored aggregate.
- [ ] The dual `customerId`/`customer_id` field check is preserved (§1.3).
- [ ] All demo/seed/mock data has been removed from the Customers view for restaurants with real
      order history.
- [ ] The active/inactive toggle's scope (global vs per-restaurant) has been decided deliberately and
      documented, not assumed (§1.4).

---

## 5. AI implementation prompt (copy-paste)

```
You are updating the Super Admin console (forkfleet-admin-console) so its per-restaurant Customers
view reads live, real data instead of demo/placeholder data (reference:
docs/RESTAURANT_ADMIN_TO_SUPER_ADMIN_CUSTOMERS_HANDOVER.md in the orderlyhub-main repo, this file).
Orderly Hub is the source of truth for how this data is actually shaped and sourced; this repo's
current Customers view was not available to cross-check exact file paths, so locate the real
implementation in this repo first before changing it.

## Goal
Replace demo/seed data on the Customers view with live per-restaurant data, matching Orderly Hub's
src/pages/Customers.tsx.

## Required behaviour

### 1. Live subscriptions, not one-time fetches
Subscribe to your data layer's live-listener equivalent of Orderly Hub's onValue(ref(db, "customers"))
and onValue(ref(db, "orders")) — whichever real-time mechanism this repo's existing Orders/Payments
screens already use. Unsubscribe on unmount / restaurant switch.

### 2. Restaurant scoping is derived through orders, not a customer field
Customers have no restaurant_id field in the source app (single-tenant, so it never needed one).
For a per-restaurant view: filter orders by restaurant_id first, collect the distinct
customerId/customer_id values referenced by those orders, then look up only those customers from the
global customers collection/node. Do NOT add a restaurant ownership field to customer records — a
customer may order from more than one restaurant.

### 3. Derived stats, not stored aggregates
Compute order count and total spent client-side from the restaurant-filtered order list, per order.
For total spent, use this fallback priority (handover doc §1.3): explicit order.total → reconstructed
from subtotal + deliveryFee + serviceFee - discount → reconstructed by summing order.items (each
item's total/lineTotal, or price * quantity). Check both customerId and customer_id when matching an
order to a customer — this field is inconsistently cased in existing data.

### 4. Do not
- Add a restaurant_id field to customer records.
- Replace the live-listener requirement with a one-time fetch-on-mount.
- Drop the dual-casing customerId/customer_id check.
- Assume every order has a clean top-level total field.
- Silently decide whether the active/inactive toggle should be global or per-restaurant — flag it.

## Reference files (Orderly Hub repo)
- src/pages/Customers.tsx (full file — live listeners, derived stats, active toggle)
- src/lib/restaurant-scope.ts (belongsToRestaurant)
- src/lib/firestore.ts (db/ref/onValue/update exports — note: despite the name, this wraps Firebase
  Realtime Database, not Firestore; see the Media handover doc §0.2 for the same naming quirk
  elsewhere in this codebase)

## Reference files (this repo, Super Admin)
- Locate the current Customers view yourself (likely under src/routes/_authenticated/) — this repo
  was not available while writing the handover doc, so no exact path is asserted here. Confirm before
  editing.
```

---

## 6. Source map

**Orderly Hub (`orderlyhub-main`)**

| File | Role |
|---|---|
| `src/pages/Customers.tsx` | Full implementation — live listeners, derived per-customer stats, active toggle, detail dialog |
| `src/lib/restaurant-scope.ts` | `belongsToRestaurant` — used to filter `orders` by `restaurant_id` |
| `src/lib/firestore.ts` | `db`, `ref`, `onValue`, `update` — RTDB wrapper despite the filename |

**Super Admin (this repo, `forkfleet-admin-console`)**

| File | Role |
|---|---|
| *(to be located)* | Current Customers view rendering demo data — confirm exact path before editing (§0) |

---

*Prepared as a handover reference — update alongside any change to how customer data is sourced or
scoped.*
