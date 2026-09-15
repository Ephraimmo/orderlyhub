# Restaurant Admin "My Inquiries" — Support Integration

Restaurant Admin (`orderlyhub-main`) now has a restaurant-scoped support inbox at `/support`.
It reads the shared Firebase RTDB nodes owned by ForkFleet Super Admin:

```
/support/tickets/{ticketId}              -> SupportTicket
/support/messages/{ticketId}/{messageId} -> SupportMessage
```

Scoping rule: `visible(ticket) ⇔ ticket.restaurant_id === session.restaurantId`
(`restaurant_id === null` = platform-level ticket → never visible here).

## What was built

| File | Purpose |
|---|---|
| `src/lib/support.firebase.ts` | Types, `coerceTicket()`, `subscribeRestaurantTickets()` (client-side filter), thread subscription, `sendRestaurantReply()`, `setRestaurantTicketStatus()`, `markRestaurantTicketReadByAgent()` |
| `src/pages/Support.tsx` | Inbox (status tabs + search), live thread view, composer, Resolve/Reopen |
| `src/lib/restaurant-permissions.ts` | Added `rm.support.view` / `rm.support.manage` + role defaults (manager: both; branch manager: view; owner: automatic) |
| Route `/support`, sidebar entry | Gated on `rm.support.view`; composer gated on `rm.support.manage` |

Write boundaries follow `docs/CUSTOMER_APP_SUPPORT_INTEGRATION.md` §5.2 extended for restaurants:
restaurant users may **only** reply (message `from: "agent"`, author name suffixed
`· Restaurant Support`), auto-transition `open → in_progress`, resolve/reopen
(`resolved_at` set/cleared), and reset `unread_for_agent`. They may never create tickets,
change `priority`/`assigned_to`/`subject`/`channel`/`restaurant_id`.

## RTDB security rules (apply in `forkfleetadminconsole/database.rules.json`)

This repo has no `database.rules.json`; rules for the shared `e-comm-bd997` database are
deployed from the Super Admin repo. Merge this fragment under the root, then
`firebase deploy --only database` from that repo:

```json
"support": {
  "tickets": {
    ".read": "auth != null && (root.child('staffUsers').child(auth.uid).child('roles').hasChild('super_admin') || root.child('staffUsers').child(auth.uid).child('roles').hasChild('platform_admin') || root.child('staffUsers').child(auth.uid).child('roles').hasChild('operations_manager') || root.child('staffUsers').child(auth.uid).child('roles').hasChild('customer_support') || root.child('restaurantUsers').child(auth.uid).child('permissions').child('rm_support_view').val() == true)",
    "$ticketId": {
      ".write": "auth != null && (root.child('staffUsers').child(auth.uid).child('roles').hasChild('super_admin') || root.child('staffUsers').child(auth.uid).child('roles').hasChild('platform_admin') || root.child('staffUsers').child(auth.uid).child('roles').hasChild('operations_manager') || root.child('staffUsers').child(auth.uid).child('roles').hasChild('customer_support') || (root.child('restaurantUsers').child(auth.uid).child('permissions').child('rm_support_manage').val() == true && data.exists() && data.child('restaurant_id').val() == root.child('restaurantUsers').child(auth.uid).child('restaurant_id').val()))"
    }
  },
  "messages": {
    "$ticketId": {
      ".read": "auth != null && (root.child('staffUsers').child(auth.uid).child('roles').hasChild('super_admin') || root.child('staffUsers').child(auth.uid).child('roles').hasChild('platform_admin') || root.child('staffUsers').child(auth.uid).child('roles').hasChild('operations_manager') || root.child('staffUsers').child(auth.uid).child('roles').hasChild('customer_support') || (root.child('restaurantUsers').child(auth.uid).child('permissions').child('rm_support_view').val() == true && root.child('support').child('tickets').child($ticketId).child('restaurant_id').val() == root.child('restaurantUsers').child(auth.uid).child('restaurant_id').val()))",
      ".write": "auth != null && (root.child('staffUsers').child(auth.uid).child('roles').hasChild('super_admin') || root.child('staffUsers').child(auth.uid).child('roles').hasChild('platform_admin') || root.child('staffUsers').child(auth.uid).child('roles').hasChild('operations_manager') || root.child('staffUsers').child(auth.uid).child('roles').hasChild('customer_support') || (root.child('restaurantUsers').child(auth.uid).child('permissions').child('rm_support_manage').val() == true && root.child('support').child('tickets').child($ticketId).child('restaurant_id').val() == root.child('restaurantUsers').child(auth.uid).child('restaurant_id').val()))"
    }
  }
}
```

Notes (see the support handover §6):

1. Rules are not filters — the collection `.read` permits download + client-side filter
   (accepted pattern, same as orders); targeted reads/writes outside the restaurant are blocked.
2. Deploying affects the **customer app**: coordinate with that team before deploying
   (their auth identity needs explicit clauses or a staged rollout).
3. Restaurant users can only update existing tickets of their own restaurant (`data.exists()`).
4. Accepted trade-off: other restaurants' payloads transit to permitted clients until a
   denormalized `/support/ticketsByRestaurant/...` index is adopted.

Also merge the matching catalog change into the Super Admin copy of
`src/lib/restaurant-permissions.ts` so Access Control can grant the new codes to
existing users (newly provisioned users pick up role defaults automatically).

## Post-deploy verification (acceptance #7)

With two restaurant test accounts (different restaurants, both with `rm_support_view`
encoded key) use a REST probe against
`https://e-comm-bd997-default-rtdb.firebaseio.com/support/tickets.json?auth=<idToken>`:

- Each token must see only its own restaurant's tickets in the payload it filters.
- A write attempt (`PATCH /support/tickets/<other-restaurant-ticket>.json`) must be denied.
- Reading `/support/messages/<other-restaurant-ticket>.json` must be denied.

Known shared behavior: `unread_for_agent` is one staff-facing counter — opening a thread
in Restaurant Admin clears the badge in the console inbox too.
