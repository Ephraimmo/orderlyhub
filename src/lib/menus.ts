import { menuPath } from "@/lib/restaurant-scope";

/** UI category shape used by Categories page. */
export interface UiCategory {
  id: string;
  name: string;
  imageUrl: string;
  active: boolean;
  sort_order: number;
}

export interface ModifierChoiceConfig {
  selected: boolean;
  price: number;
}

/** UI product shape used by Products page — mirrors Super Admin MenuItem. */
export interface UiProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  discountPrice: number | null;
  category: string;
  category_id: string | null;
  categoryName: string;
  imageUrls: string[];
  imageUrl: string;
  prepTime: number;
  pointsValue: number;
  available: boolean;
  isFeatured: boolean;
  allergens: string[];
  /** Assigned modifier group IDs (normalized from modifier_ids | modifierIds). */
  modifierIds: string[];
  modifierConfig: Record<string, Record<string, ModifierChoiceConfig>>;
  extrasProducts: string[];
}

export interface UiVariant {
  id: string;
  menuItemId: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  isAvailable: boolean;
  sortOrder: number;
}

export interface UiAddon {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  maxQuantity: number;
  isAvailable: boolean;
}

export interface UiModifierChoice {
  label: string;
  price: number;
}

export interface UiModifier {
  id: string;
  restaurantId: string;
  name: string;
  type: "option" | "extra";
  required: boolean;
  includePricing: boolean;
  minSelections: number;
  maxSelections: number;
  choices: UiModifierChoice[];
  sortOrder: number;
  isAvailable: boolean;
}

type RawMap = Record<string, unknown>;

export function itemsPath(restaurantId: string): string {
  return menuPath(restaurantId, "items");
}

export function categoriesPath(restaurantId: string): string {
  return menuPath(restaurantId, "categories");
}

export function variantsPath(restaurantId: string): string {
  return menuPath(restaurantId, "variants");
}

export function addonsPath(restaurantId: string): string {
  return menuPath(restaurantId, "addons");
}

export function modifiersPath(restaurantId: string): string {
  return menuPath(restaurantId, "modifiers");
}

function readMenuItemId(raw: RawMap): string {
  return String(raw.menu_item_id ?? raw.menuItemId ?? "");
}

function readModifierIds(raw: RawMap): string[] {
  const ids = raw.modifier_ids ?? raw.modifierIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function readModifierConfig(raw: RawMap): Record<string, Record<string, ModifierChoiceConfig>> {
  const cfg = raw.modifier_config ?? raw.modifierConfig;
  if (!cfg || typeof cfg !== "object") return {};
  const out: Record<string, Record<string, ModifierChoiceConfig>> = {};
  for (const [modId, choices] of Object.entries(cfg as Record<string, unknown>)) {
    if (!choices || typeof choices !== "object") continue;
    const mapped: Record<string, ModifierChoiceConfig> = {};
    for (const [idx, val] of Object.entries(choices as Record<string, unknown>)) {
      const row = (val ?? {}) as RawMap;
      mapped[idx] = {
        selected: row.selected === true,
        price: typeof row.price === "number" ? row.price : Number(row.price ?? 0),
      };
    }
    out[modId] = mapped;
  }
  return out;
}

export function mapCategoryFromRtdb(id: string, raw: Record<string, unknown>): UiCategory {
  return {
    id,
    name: String(raw.name ?? ""),
    imageUrl: String(raw.image_url ?? raw.imageUrl ?? ""),
    active: raw.is_available !== false && raw.active !== false,
    sort_order: Number(raw.sort_order ?? 0),
  };
}

export function mapCategoryToRtdb(
  restaurantId: string,
  ui: Pick<UiCategory, "id" | "name" | "imageUrl" | "active" | "sort_order">,
): Record<string, unknown> {
  return {
    id: ui.id,
    restaurant_id: restaurantId,
    name: ui.name,
    description: null,
    sort_order: ui.sort_order,
    is_available: ui.active !== false,
    image_url: ui.imageUrl || null,
  };
}

export function mapProductFromRtdb(id: string, raw: Record<string, unknown>): UiProduct {
  const imageUrl = String(raw.image_url ?? raw.imageUrl ?? "");
  const imageUrls = Array.isArray(raw.imageUrls)
    ? (raw.imageUrls as string[]).filter(Boolean)
    : imageUrl
      ? [imageUrl]
      : [];
  const categoryId =
    raw.category_id != null
      ? String(raw.category_id)
      : raw.categoryId != null
        ? String(raw.categoryId)
        : "";
  const discountRaw = raw.discount_price ?? raw.discountPrice;
  const discountPrice =
    discountRaw != null && discountRaw !== "" && !Number.isNaN(Number(discountRaw))
      ? Number(discountRaw)
      : null;

  return {
    id,
    name: String(raw.name ?? ""),
    description: String(raw.description ?? ""),
    price: Number(raw.price ?? 0),
    discountPrice,
    category: categoryId,
    category_id: categoryId || null,
    categoryName: String(raw.category ?? ""),
    imageUrls,
    imageUrl: imageUrls[0] ?? "",
    prepTime: Number(raw.prep_time_minutes ?? raw.prepTime ?? 15),
    pointsValue: Math.max(0, Math.round(Number(raw.points_value ?? raw.pointsValue ?? 5))),
    available: raw.is_available !== false && raw.available !== false && raw.isAvailable !== false,
    isFeatured: raw.is_featured === true || raw.isFeatured === true,
    allergens: Array.isArray(raw.allergens)
      ? (raw.allergens as unknown[]).filter((a): a is string => typeof a === "string")
      : [],
    modifierIds: readModifierIds(raw),
    modifierConfig: readModifierConfig(raw),
    extrasProducts: Array.isArray(raw.extrasProducts) ? (raw.extrasProducts as string[]) : [],
  };
}

export function mapProductToRtdb(
  restaurantId: string,
  ui: UiProduct,
  categoryName: string,
): Record<string, unknown> {
  const imageUrls = ui.imageUrls?.filter(Boolean) ?? [];
  const primary = imageUrls[0] ?? ui.imageUrl ?? "";
  const modifierIds = ui.modifierIds ?? [];
  const modifierConfig = ui.modifierConfig ?? {};
  const discount =
    ui.discountPrice != null && !Number.isNaN(Number(ui.discountPrice))
      ? Number(ui.discountPrice)
      : null;

  return {
    id: ui.id,
    restaurant_id: restaurantId,
    restaurantId,
    name: ui.name,
    category_id: ui.category || null,
    categoryId: ui.category || null,
    category: categoryName || ui.categoryName || ui.category || "",
    description: ui.description || null,
    price: Number(ui.price),
    discount_price: discount,
    discountPrice: discount,
    prep_time_minutes: Number(ui.prepTime || 15),
    prepTime: Number(ui.prepTime || 15),
    points_value: Math.max(0, Math.round(Number(ui.pointsValue ?? 5))),
    pointsValue: Math.max(0, Math.round(Number(ui.pointsValue ?? 5))),
    is_available: ui.available !== false,
    available: ui.available !== false,
    isAvailable: ui.available !== false,
    is_featured: ui.isFeatured === true,
    isFeatured: ui.isFeatured === true,
    image_url: primary || null,
    imageUrls,
    imageUrl: primary,
    allergens: ui.allergens ?? [],
    modifier_ids: modifierIds,
    modifierIds,
    modifier_config: modifierConfig,
    modifierConfig,
    extrasProducts: ui.extrasProducts ?? [],
  };
}

export function mapVariantFromRtdb(id: string, raw: Record<string, unknown>): UiVariant {
  return {
    id,
    menuItemId: readMenuItemId(raw),
    name: String(raw.name ?? ""),
    priceDelta: Number(raw.price_delta ?? raw.priceDelta ?? 0),
    isDefault: raw.is_default === true || raw.isDefault === true,
    isAvailable: raw.is_available !== false && raw.isAvailable !== false,
    sortOrder: Number(raw.sort_order ?? raw.sortOrder ?? 0),
  };
}

export function mapVariantToRtdb(ui: UiVariant): Record<string, unknown> {
  return {
    id: ui.id,
    menu_item_id: ui.menuItemId,
    menuItemId: ui.menuItemId,
    name: ui.name,
    price_delta: Number(ui.priceDelta),
    priceDelta: Number(ui.priceDelta),
    is_default: ui.isDefault === true,
    isDefault: ui.isDefault === true,
    is_available: ui.isAvailable !== false,
    isAvailable: ui.isAvailable !== false,
    sort_order: ui.sortOrder,
    sortOrder: ui.sortOrder,
  };
}

export function mapAddonFromRtdb(id: string, raw: Record<string, unknown>): UiAddon {
  return {
    id,
    menuItemId: readMenuItemId(raw),
    name: String(raw.name ?? ""),
    price: Number(raw.price ?? 0),
    maxQuantity: Math.max(1, Number(raw.max_quantity ?? raw.maxQuantity ?? 3) || 3),
    isAvailable: raw.is_available !== false && raw.isAvailable !== false,
  };
}

export function mapAddonToRtdb(ui: UiAddon): Record<string, unknown> {
  return {
    id: ui.id,
    menu_item_id: ui.menuItemId,
    menuItemId: ui.menuItemId,
    name: ui.name,
    price: Number(ui.price),
    max_quantity: Number(ui.maxQuantity),
    maxQuantity: Number(ui.maxQuantity),
    is_available: ui.isAvailable !== false,
    isAvailable: ui.isAvailable !== false,
  };
}

export function mapModifierFromRtdb(
  id: string,
  raw: Record<string, unknown>,
  restaurantId: string,
): UiModifier {
  const choicesRaw = Array.isArray(raw.choices) ? raw.choices : [];
  const type = raw.type === "extra" ? "extra" : "option";
  return {
    id,
    restaurantId: String(raw.restaurant_id ?? raw.restaurantId ?? restaurantId),
    name: String(raw.name ?? ""),
    type,
    required: raw.required === true || (type === "option" && raw.required !== false),
    includePricing: raw.include_pricing === true || raw.includePricing === true,
    minSelections: Number(
      raw.min_selections ?? raw.minSelections ?? (type === "option" ? 1 : 0),
    ),
    maxSelections: Number(
      raw.max_selections ?? raw.maxSelections ?? (type === "option" ? 1 : 3),
    ),
    choices: choicesRaw.map((c) => {
      const row = (c ?? {}) as RawMap;
      return {
        label: String(row.label ?? ""),
        price: Number(row.price ?? 0),
      };
    }),
    sortOrder: Number(raw.sort_order ?? raw.sortOrder ?? 0),
    isAvailable: raw.is_available !== false && raw.isAvailable !== false,
  };
}

export function mapModifierToRtdb(restaurantId: string, ui: UiModifier): Record<string, unknown> {
  const includePricing = ui.includePricing === true;
  return {
    id: ui.id,
    restaurant_id: restaurantId,
    restaurantId,
    name: ui.name.trim(),
    type: ui.type,
    required: ui.required === true,
    include_pricing: includePricing,
    includePricing,
    min_selections: Number(ui.minSelections),
    minSelections: Number(ui.minSelections),
    max_selections: Number(ui.maxSelections),
    maxSelections: Number(ui.maxSelections),
    choices: ui.choices.map((c) => ({
      label: c.label.trim(),
      price: includePricing ? Number(c.price) || 0 : 0,
    })),
    sort_order: ui.sortOrder,
    sortOrder: ui.sortOrder,
    is_available: ui.isAvailable !== false,
    isAvailable: ui.isAvailable !== false,
  };
}

/** Variants linked to a product — accepts snake_case and camelCase menu_item_id. */
export function variantsForItem(variants: UiVariant[], itemId: string): UiVariant[] {
  return variants
    .filter((v) => v.menuItemId === itemId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Add-ons linked to a product. */
export function addonsForItem(addons: UiAddon[], itemId: string): UiAddon[] {
  return addons.filter((a) => a.menuItemId === itemId);
}

/** Modifier groups assigned to a product. */
export function modifiersForItem(modifiers: UiModifier[], item: UiProduct): UiModifier[] {
  const ids = new Set(item.modifierIds);
  return modifiers.filter((m) => ids.has(m.id)).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function newMenuId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}
