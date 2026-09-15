/** Normalize ForkFleet + legacy order shapes for the admin Orders UI. */

import type { MenuCatalog } from "@/lib/menu-catalog";

export interface DisplayAddon {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface DisplayVariant {
  id: string;
  name: string;
  priceDelta: number;
}

export interface DisplayModifier {
  group: string;
  label: string;
  price: number;
}

export interface DisplayOrderLine {
  id: string;
  itemId: string | null;
  name: string;
  quantity: number;
  basePrice: number;
  unitPrice: number;
  lineTotal: number;
  notes: string | null;
  variant: DisplayVariant | null;
  addons: DisplayAddon[];
  modifiers: DisplayModifier[];
  /** Legacy modifier groups keyed by name */
  options: { group: string; value: string }[];
  /** Variants configured on the menu item (for display when order line omits selection). */
  menuVariants: DisplayVariant[];
  /** Add-ons configured on the menu item (for display when order line omits selection). */
  menuAddons: DisplayAddon[];
}

function toAmount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function firstString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const rec = asRecord(value);
  if (rec) return Object.values(rec) as T[];
  return [];
}

export function orderCustomerName(order: Record<string, unknown>): string {
  return firstString(order.customer_name, order.customerName) || "Customer";
}

export function orderCustomerPhone(order: Record<string, unknown>): string {
  return firstString(order.customer_phone, order.customerPhone) || "—";
}

export function orderCustomerEmail(order: Record<string, unknown>): string {
  return firstString(order.customer_email, order.customerEmail);
}

export function orderNumber(order: Record<string, unknown>): string {
  return firstString(order.order_number, order.orderNumber) || String(order.id ?? "").slice(-6);
}

export function orderPlacedAt(order: Record<string, unknown>): Date | null {
  const raw = firstString(order.placed_at, order.created_at, order.createdAt);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function orderPaymentMethod(order: Record<string, unknown>): string {
  const payment = asRecord(order.payment);
  return (
    firstString(order.payment_method, order.paymentMethod, payment?.method) || "—"
  ).toLowerCase();
}

export function orderPaymentStatus(order: Record<string, unknown>): string {
  const payment = asRecord(order.payment);
  return firstString(order.payment_status, order.paymentStatus, payment?.status) || "pending";
}

export function orderDriverName(order: Record<string, unknown>): string {
  return firstString(order.driver_name, order.driverName);
}

export function orderDriverPhone(order: Record<string, unknown>): string {
  return firstString(order.driver_phone, order.driverPhone);
}

export function orderDeliveryAddress(order: Record<string, unknown>): Record<string, unknown> | string | null {
  return (order.delivery_address ?? order.address ?? null) as Record<string, unknown> | string | null;
}

export function orderSpecialInstructions(order: Record<string, unknown>): string {
  return firstString(order.special_instructions, order.note, order.notes);
}

export function orderFee(order: Record<string, unknown>, kind: "delivery" | "service" | "tax" | "tip" | "discount"): number {
  const map = {
    delivery: ["delivery_fee", "deliveryFee"],
    service: ["service_fee", "serviceFee"],
    tax: ["tax"],
    tip: ["tip"],
    discount: ["discount"],
  } as const;
  for (const key of map[kind]) {
    const v = order[key];
    if (v != null) return toAmount(v);
  }
  return 0;
}

export function formatDeliveryAddress(addr: Record<string, unknown> | string | null | undefined): string {
  if (!addr) return "—";
  if (typeof addr === "string") return addr;
  const parts = [
    firstString(addr.label),
    firstString(addr.street),
    firstString(addr.city),
    firstString(addr.postal_code, addr.postalCode),
  ].filter(Boolean);
  return parts.join(", ") || "—";
}

export function orderCardLast4(order: Record<string, unknown>): string {
  const payment = asRecord(order.payment);
  return firstString(order.cardLast4, order.card_last4, payment?.card_last4);
}

export function orderCardBrand(order: Record<string, unknown>): string {
  const payment = asRecord(order.payment);
  return firstString(order.cardBrand, order.card_brand, payment?.card_brand);
}

export function orderPaymentReference(order: Record<string, unknown>): string {
  const payment = asRecord(order.payment);
  return firstString(order.transactionId, order.transaction_id, payment?.reference, payment?.receipt_number);
}

export function orderReceiptNumber(order: Record<string, unknown>): string {
  const payment = asRecord(order.payment);
  return firstString(order.receipt_number, payment?.receipt_number);
}

export function orderEtaAt(order: Record<string, unknown>): Date | null {
  const raw = firstString(order.eta_at, order.estimatedDelivery);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function variantFromCatalog(catalog: MenuCatalog, variantId: string): DisplayVariant | null {
  const v = catalog.getVariant(variantId);
  if (!v) return null;
  return { id: v.id, name: v.name, priceDelta: v.priceDelta };
}

function addonFromCatalog(catalog: MenuCatalog, addonId: string, quantity = 1): DisplayAddon | null {
  const a = catalog.getAddon(addonId);
  if (!a) return null;
  return { id: a.id, name: a.name, price: a.price, quantity: Math.max(1, quantity) };
}

function extractVariant(raw: Record<string, unknown>, catalog?: MenuCatalog): DisplayVariant | null {
  const embedded =
    asRecord(raw.variant) ??
    asRecord(raw.selected_variant) ??
    asRecord(raw.selectedVariant);

  if (embedded) {
    const id = firstString(embedded.id, raw.variant_id, raw.variantId) || "variant";
    if (catalog) {
      const fromCatalog = variantFromCatalog(catalog, id);
      if (fromCatalog) {
        return {
          ...fromCatalog,
          name: firstString(embedded.name, embedded.label, fromCatalog.name),
          priceDelta: toAmount(embedded.price_delta ?? embedded.priceDelta ?? fromCatalog.priceDelta),
        };
      }
    }
    return {
      id,
      name: firstString(embedded.name, embedded.label) || "Variant",
      priceDelta: toAmount(embedded.price_delta ?? embedded.priceDelta ?? embedded.price),
    };
  }

  const variantId = firstString(
    raw.variant_id,
    raw.variantId,
    raw.selected_variant_id,
    raw.selectedVariantId,
  );

  if (variantId && catalog) {
    return variantFromCatalog(catalog, variantId);
  }

  const name = firstString(raw.variant_name, raw.variantName);
  if (name) {
    return {
      id: variantId || "variant",
      name,
      priceDelta: toAmount(raw.variant_price_delta ?? raw.variantPriceDelta),
    };
  }

  return null;
}

function addonFromRaw(raw: unknown, fallbackId: string, catalog?: MenuCatalog): DisplayAddon | null {
  if (raw == null) return null;

  if (typeof raw === "string") {
    if (catalog) {
      const fromCatalog = addonFromCatalog(catalog, raw);
      if (fromCatalog) return fromCatalog;
    }
    return { id: fallbackId, name: raw, price: 0, quantity: 1 };
  }

  const rec = asRecord(raw);
  if (!rec) return null;

  const id = firstString(rec.id, rec.addon_id, rec.addonId);
  const qty = Math.max(1, toAmount(rec.quantity) || 1);

  if (id && catalog) {
    const fromCatalog = addonFromCatalog(catalog, id, qty);
    if (fromCatalog) {
      return {
        ...fromCatalog,
        name: firstString(rec.name, rec.label, fromCatalog.name),
        price: toAmount(rec.price ?? rec.unit_price ?? fromCatalog.price),
        quantity: qty,
      };
    }
  }

  const name = firstString(rec.name, rec.label, rec.title);
  if (!name) return null;

  return {
    id: id || fallbackId,
    name,
    price: toAmount(rec.price ?? rec.unit_price ?? rec.line_total),
    quantity: qty,
  };
}

function extractAddons(raw: Record<string, unknown>, catalog?: MenuCatalog): DisplayAddon[] {
  const out: DisplayAddon[] = [];
  const seen = new Set<string>();

  const push = (addon: DisplayAddon | null) => {
    if (!addon) return;
    const key = `${addon.id}:${addon.name}:${addon.quantity}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(addon);
  };

  for (const src of [
    raw.addons,
    raw.add_ons,
    raw.selected_addons,
    raw.addon_selections,
    raw.extras,
  ]) {
    for (const [i, entry] of asArray(src).entries()) {
      push(addonFromRaw(entry, `addon_${i}`, catalog));
    }
    const rec = asRecord(src);
    if (rec) {
      for (const [id, entry] of Object.entries(rec)) {
        push(addonFromRaw(entry, id, catalog));
      }
    }
  }

  for (const id of asArray<string>(raw.addon_ids ?? raw.addonIds)) {
    if (catalog) push(addonFromCatalog(catalog, id));
  }

  const selections = asRecord(raw.addon_quantities ?? raw.addonQuantities);
  if (selections && catalog) {
    for (const [id, qty] of Object.entries(selections)) {
      push(addonFromCatalog(catalog, id, Math.max(1, toAmount(qty) || 1)));
    }
  }

  return out;
}

function extractModifiers(raw: Record<string, unknown>, catalog?: MenuCatalog): DisplayModifier[] {
  const out: DisplayModifier[] = [];
  const seen = new Set<string>();

  const push = (group: string, label: string, price: number) => {
    const key = `${group}:${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ group, label, price });
  };

  for (const src of [raw.modifiers, raw.modifier_selections, raw.selected_modifiers]) {
    const rec = asRecord(src);
    if (!rec) continue;
    for (const [groupKey, val] of Object.entries(rec)) {
      if (catalog) {
        const choice = catalog.resolveModifierChoice(groupKey, val);
        if (choice) {
          push(
            catalog.getModifier(groupKey)?.name ?? groupKey,
            choice.label,
            choice.price,
          );
          continue;
        }
      }
      if (typeof val === "object") {
        const choiceRec = asRecord(val);
        push(
          groupKey,
          firstString(choiceRec?.label, choiceRec?.name) || "Selected",
          toAmount(choiceRec?.price),
        );
      } else {
        push(groupKey, String(val), 0);
      }
    }
  }

  for (const entry of asArray<Record<string, unknown>>(raw.modifier_choices)) {
    push(
      firstString(entry.group, entry.modifier_name, entry.modifier_id) || "Modifier",
      firstString(entry.label, entry.name, entry.choice) || "Choice",
      toAmount(entry.price),
    );
  }

  return out;
}

function extractLegacyOptions(raw: Record<string, unknown>, catalog?: MenuCatalog): { group: string; value: string }[] {
  const out: { group: string; value: string }[] = [];

  const options = raw.options;
  if (options && typeof options === "object" && !Array.isArray(options)) {
    for (const [group, val] of Object.entries(options as Record<string, unknown>)) {
      if (val == null) continue;
      if (catalog) {
        const choice = catalog.resolveModifierChoice(group, val);
        if (choice) {
          out.push({ group, value: choice.label });
          continue;
        }
      }
      if (typeof val === "object") {
        const rec = asRecord(val);
        out.push({
          group,
          value: firstString(rec?.name, rec?.label, rec?.value) || JSON.stringify(val),
        });
      } else {
        out.push({ group, value: String(val) });
      }
    }
  }

  const selected = asRecord(raw.selectedOption);
  if (selected) {
    out.push({
      group: firstString(selected.group) || "Option",
      value: firstString(selected.label, selected.name, selected.value),
    });
  }

  return out;
}

export function normalizeOrderLine(
  raw: Record<string, unknown>,
  catalog?: MenuCatalog,
): DisplayOrderLine {
  const quantity = Math.max(1, toAmount(raw.quantity) || 1);
  const itemId = firstString(raw.item_id, raw.itemId, raw.product_id, raw.productId) || null;

  const menuItem = itemId && catalog ? catalog.getItem(itemId) : null;
  const basePrice = menuItem?.price ?? toAmount(raw.base_price ?? raw.basePrice);

  let unitPrice = toAmount(raw.unit_price ?? raw.unitPrice ?? raw.price);
  const lineTotal =
    toAmount(raw.line_total ?? raw.lineTotal ?? raw.total) ||
    unitPrice * quantity;

  if (!unitPrice && quantity > 0) unitPrice = lineTotal / quantity;

  let variant = extractVariant(raw, catalog);
  let addons = extractAddons(raw, catalog);
  const modifiers = extractModifiers(raw, catalog);
  const options = extractLegacyOptions(raw, catalog);

  if (catalog && itemId) {
    if (!variant && addons.length === 0) {
      const resolved = catalog.resolveCustomizationsFromLineTotal(itemId, lineTotal, quantity);
      if (resolved.variant) {
        variant = {
          id: resolved.variant.id,
          name: resolved.variant.name,
          priceDelta: resolved.variant.priceDelta,
        };
      }
      addons = resolved.addons.map((a) => ({
        id: a.id,
        name: a.name,
        price: a.price,
        quantity: 1,
      }));
    } else {
      const perUnit = quantity > 0 ? lineTotal / quantity : unitPrice;
      if (!variant) {
        const inferred = catalog.inferVariantFromPricing(itemId, perUnit, quantity);
        if (inferred) {
          variant = { id: inferred.id, name: inferred.name, priceDelta: inferred.priceDelta };
        }
      }
      if (addons.length === 0) {
        const inferred = catalog.inferAddonsFromPricing(
          itemId,
          perUnit,
          quantity,
          variant?.priceDelta ?? 0,
        );
        addons = inferred.map((a) => ({
          id: a.id,
          name: a.name,
          price: a.price,
          quantity: 1,
        }));
      }
    }
  }

  const linkedMenuVariants =
    itemId && catalog
      ? catalog.variantsForItem(itemId).map((v) => ({
          id: v.id,
          name: v.name,
          priceDelta: v.priceDelta,
        }))
      : [];

  const linkedMenuAddons =
    itemId && catalog
      ? catalog.addonsForItem(itemId).map((a) => ({
          id: a.id,
          name: a.name,
          price: a.price,
          quantity: 1,
        }))
      : [];

  const resolvedBase = basePrice || (variant || addons.length
    ? Math.max(0, unitPrice - (variant?.priceDelta ?? 0) - addons.reduce((s, a) => s + a.price * a.quantity, 0))
    : unitPrice);

  return {
    id: firstString(raw.id) || `line_${Math.random().toString(36).slice(2, 7)}`,
    itemId,
    name: firstString(raw.name, raw.productName, raw.item_name, menuItem?.name) || "Item",
    quantity,
    basePrice: resolvedBase,
    unitPrice,
    lineTotal,
    notes: firstString(raw.notes, raw.specialInstructions, raw.special_instructions) || null,
    variant,
    addons,
    modifiers,
    options,
    menuVariants: linkedMenuVariants,
    menuAddons: linkedMenuAddons,
  };
}

export function normalizeOrderItems(
  items: unknown,
  catalog?: MenuCatalog,
): DisplayOrderLine[] {
  if (!items) return [];
  const list = Array.isArray(items) ? items : Object.values(asRecord(items) ?? {});
  return list
    .map((raw) => normalizeOrderLine(asRecord(raw) ?? {}, catalog))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function orderLineTotal(order: Record<string, unknown>): number {
  const explicit = toAmount(order.total);
  if (explicit > 0) return explicit;

  const subtotal = toAmount(order.subtotal);
  const fees =
    orderFee(order, "delivery") +
    orderFee(order, "service") +
    orderFee(order, "tax") +
    orderFee(order, "tip") -
    orderFee(order, "discount");

  if (subtotal > 0) return Math.max(0, subtotal + fees);

  const items = normalizeOrderItems(order.items);
  const itemsSum = items.reduce((sum, line) => sum + line.lineTotal, 0);
  return Math.max(0, itemsSum + fees);
}

export function lineCustomizationTotal(line: DisplayOrderLine): number {
  const variant = line.variant?.priceDelta ?? 0;
  const addons = line.addons.reduce((s, a) => s + a.price * a.quantity, 0);
  const mods = line.modifiers.reduce((s, m) => s + m.price, 0);
  return variant + addons + mods;
}
