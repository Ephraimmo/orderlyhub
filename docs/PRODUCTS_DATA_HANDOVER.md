# Products / Menu Data Handover — ForkFleet Platform

**Audience:** the AI agents and developers building the **Customer app**, the **Super Admin app**, and the **Driver app**.
**Goal:** every app reads the restaurant's products (menu items), categories, variants, add-ons, and modifiers from the **same Cloud Firestore data** the Restaurant Admin app writes. Follow this document exactly and the customer-facing menu will always match what the restaurant saved.

---

## 1. Where products are stored (the single source of truth)

All menu data lives in Cloud Firestore under the `menus` collection, scoped by restaurant id. **Do not invent new collections.**

| Data | Firestore path | Document key |
|---|---|---|
| Menu categories | `menus/{restaurantId}/categories` | one document per category, id = category id |
| **Products (menu items)** | `menus/{restaurantId}/items` | one document per product, id = product id |
| Variants (sizes etc.) | `menus/{restaurantId}/variants` | one document per variant |
| Add-ons (extras) | `menus/{restaurantId}/addons` | one document per add-on |
| Modifier groups | `menus/{restaurantId}/modifiers` | one document per modifier group |

Notes:
- Each document carries an `id` field equal to its document id, plus `restaurant_id` / `restaurantId` (both are written) so items can be filtered by restaurant.
- There is **no products subcollection on the restaurant document**. Restaurant details (name, address, coordinates) live on `restaurants/{restaurantId}` — see `docs/MAP_INTEGRATION_HANDOVER.md`.
- All prices are **numbers in major currency units** (e.g. `49.99` = R49.99), never strings and never cents.

---

## 2. Product document schema (`menus/{restaurantId}/items/{productId}`)

The Restaurant Admin writes **both snake_case and camelCase** versions of several fields so older apps keep working. When reading, prefer snake_case and fall back to camelCase.

```json
{
  "id": "itm_x1y2z3",
  "restaurant_id": "rest_abc",
  "restaurantId": "rest_abc",
  "name": "Chicken Burger",
  "description": "Grilled chicken, lettuce, mayo",
  "category_id": "cat_burgers",
  "categoryId": "cat_burgers",
  "category": "Burgers",
  "price": 59.99,
  "discount_price": 49.99,
  "discountPrice": 49.99,
  "prep_time_minutes": 15,
  "prepTime": 15,
  "points_value": 5,
  "pointsValue": 5,
  "is_available": true,
  "available": true,
  "isAvailable": true,
  "is_featured": false,
  "isFeatured": false,
  "image_url": "https://res.cloudinary.com/.../burger.jpg",
  "imageUrl": "https://res.cloudinary.com/.../burger.jpg",
  "imageUrls": ["https://res.cloudinary.com/.../burger.jpg"],
  "allergens": ["gluten", "egg"],
  "modifier_ids": ["mod_size"],
  "modifierIds": ["mod_size"],
  "modifier_config": { "mod_size": { "0": { "selected": true, "price": 0 } } },
  "modifierConfig": { "mod_size": { "0": { "selected": true, "price": 0 } } },
  "extrasProducts": ["itm_chips"]
}
```

Field rules the Customer app must apply:
- **Only show a product when it is available**: `is_available !== false && available !== false && isAvailable !== false`.
- **Effective price** = `discount_price` if it is a number greater than 0, otherwise `price`.
- **Image** = first entry of `imageUrls`, falling back to `image_url` / `imageUrl`. May be `null` — render a placeholder, never a broken `<img>`.
- **Category grouping**: match `category_id` (or `categoryId`) to the category document id in `menus/{restaurantId}/categories`. The plain `category` field is the category *name* and is only a display fallback.
- `null` fields are normal (e.g. `description`, `discount_price`, `image_url`) — always null-check.

---

## 3. Categories, variants, add-ons, modifiers

### Categories — `menus/{restaurantId}/categories/{categoryId}`
```json
{ "id": "cat_burgers", "restaurant_id": "rest_abc", "name": "Burgers",
  "description": null, "sort_order": 1, "is_available": true, "image_url": null }
```
Show only categories where `is_available !== false` and `active !== false`; order by `sort_order` ascending.

### Variants — `menus/{restaurantId}/variants/{variantId}` (e.g. Small / Medium / Large)
```json
{ "id": "var_1", "menu_item_id": "itm_x1y2z3", "menuItemId": "itm_x1y2z3",
  "name": "Large", "price_delta": 15, "priceDelta": 15,
  "is_default": false, "isDefault": false,
  "is_available": true, "isAvailable": true,
  "sort_order": 1, "sortOrder": 1 }
```
Linked to a product by `menu_item_id` / `menuItemId`. Variant price = product price + `price_delta`.

### Add-ons — `menus/{restaurantId}/addons/{addonId}` (e.g. Extra cheese)
```json
{ "id": "add_1", "menu_item_id": "itm_x1y2z3", "menuItemId": "itm_x1y2z3",
  "name": "Extra cheese", "price": 10,
  "max_quantity": 3, "maxQuantity": 3,
  "is_available": true, "isAvailable": true }
```
Also linked by `menu_item_id` / `menuItemId`. Respect `max_quantity` per order line.

### Modifier groups — `menus/{restaurantId}/modifiers/{modifierId}`
```json
{ "id": "mod_size", "restaurant_id": "rest_abc", "name": "Choose your side",
  "type": "option", "required": true,
  "include_pricing": true, "includePricing": true,
  "min_selections": 1, "minSelections": 1,
  "max_selections": 1, "maxSelections": 1,
  "choices": [{ "label": "Chips", "price": 0 }, { "label": "Salad", "price": 5 }],
  "sort_order": 0, "sortOrder": 0,
  "is_available": true, "isAvailable": true }
```
- A product's modifier groups come from its `modifier_ids` / `modifierIds` array — **not** from a field on the modifier itself.
- `type: "option"` = pick from a list (usually required); `type: "extra"` = optional extras.
- Per-product price overrides live in the product's `modifier_config[modifierId][choiceIndex] = { selected, price }`. When `selected === false`, hide that choice for that product; when it carries a `price`, it overrides the choice's base price.

---

## 4. Reading the menu (Customer app reference code)

```ts
import { collection, getDocs, getFirestore } from "firebase/firestore";

const db = getFirestore(app);

async function fetchMenu(restaurantId: string) {
  const read = async (kind: "categories" | "items" | "variants" | "addons" | "modifiers") => {
    const snap = await getDocs(collection(db, `menus/${restaurantId}/${kind}`));
    const out: Record<string, any> = {};
    snap.forEach((d) => { if (d.id !== "_") out[d.id] = { id: d.id, ...d.data() }; });
    return out;
  };

  const [categories, items, variants, addons, modifiers] = await Promise.all([
    read("categories"), read("items"), read("variants"), read("addons"), read("modifiers"),
  ]);
  return { categories, items, variants, addons, modifiers };
}
```

Recommended read-time coercion (accept both field namings):

```ts
const isAvailable = (r: any) =>
  r?.is_available !== false && r?.available !== false && r?.isAvailable !== false;

const effectivePrice = (p: any): number => {
  const discount = Number(p.discount_price ?? p.discountPrice);
  const base = Number(p.price ?? 0);
  return Number.isFinite(discount) && discount > 0 ? discount : base;
};
```

For a live menu (instant updates when the restaurant edits), swap `getDocs` for `onSnapshot` on each of the five collections.

---

## 5. What NOT to do

- **Do not** read from Realtime Database paths — the platform migrated to Firestore; RTDB is stale.
- **Do not** expect products on `restaurants/{id}` or a `products` collection — products are only at `menus/{restaurantId}/items`.
- **Do not** treat money as cents or strings.
- **Do not** show items where any availability flag is explicitly `false` — that is how the restaurant takes an item off the menu.
- **Do not** hardcode a restaurant id; take it from the selected restaurant document (`restaurants/{restaurantId}`).

---

## 6. Order write-back contract (for checkout)

When the customer places an order, write the order to the `orders` collection with `restaurant_id: {restaurantId}` so the Restaurant Admin and driver apps pick it up. Each line item should carry: `menuItemId` (product id), `name`, `quantity`, unit `price` (base + variant delta + add-ons), and the chosen `variant` / `addons` / modifier choices with their ids — the admin resolves these back against the same `menus/{restaurantId}/...` collections using the ids.

---

## 7. Troubleshooting: "the menu is empty / products not showing"

| Symptom | Cause | Fix |
|---|---|---|
| Empty menu for one restaurant | Wrong restaurant id | Confirm the id matches a document under `restaurants/` and the items are under `menus/{thatId}/items`. |
| Empty menu for all restaurants | Reading RTDB or a `products` collection | Use Firestore `menus/{restaurantId}/items` (section 1). |
| Products exist but none render | Availability check inverted | A product shows only when no availability flag is `false` (section 2). |
| Prices show as 0 or NaN | Price read as string/cents | `Number(p.price)`; values are major units (section 1). |
| Product in wrong category / "Uncategorized" | Grouped by `category` name instead of `category_id` | Join on `category_id` → category document id (section 2). |
| Variants/add-ons missing | Filtered by wrong key | Link via `menu_item_id` **or** `menuItemId` (section 3). |
| Modifiers not applying per product | Read from the modifier doc | Modifiers attach to products via the product's `modifier_ids` (section 3). |
| Broken images | `image_url` is `null` | Null-check and render a placeholder (section 2). |
| Stale menu after restaurant edits | One-shot fetch | Use `onSnapshot` listeners for live updates (section 4). |

---

## 8. Acceptance checklist per app

- [ ] Menu is read from `menus/{restaurantId}/{categories,items,variants,addons,modifiers}` — no other paths.
- [ ] Only available categories and products are displayed.
- [ ] Effective price uses the discount price when present.
- [ ] Variants, add-ons, and modifier choices add their prices to the order line correctly.
- [ ] Orders written to `orders` include `restaurant_id` and the product/variant/add-on/modifier ids.
- [ ] The menu updates live (or on refresh) when the restaurant edits a product in the Restaurant Admin app.
