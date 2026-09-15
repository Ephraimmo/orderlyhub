/** Menu catalog index for resolving order line variants, add-ons, and modifiers. */

export interface CatalogItem {
  id: string;
  name: string;
  price: number;
}

export interface CatalogVariant {
  id: string;
  menuItemId: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
}

export interface CatalogAddon {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  maxQuantity: number;
}

export interface CatalogModifierChoice {
  label: string;
  price: number;
}

export interface CatalogModifier {
  id: string;
  name: string;
  type: string;
  choices: CatalogModifierChoice[];
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

export class MenuCatalog {
  readonly items = new Map<string, CatalogItem>();
  readonly variants = new Map<string, CatalogVariant>();
  readonly addons = new Map<string, CatalogAddon>();
  readonly modifiers = new Map<string, CatalogModifier>();
  readonly variantsByItem = new Map<string, CatalogVariant[]>();
  readonly addonsByItem = new Map<string, CatalogAddon[]>();

  static fromRtdb(input: {
    items?: Record<string, Record<string, unknown>> | null;
    variants?: Record<string, Record<string, unknown>> | null;
    addons?: Record<string, Record<string, unknown>> | null;
    modifiers?: Record<string, Record<string, unknown>> | null;
  }): MenuCatalog {
    const catalog = new MenuCatalog();

    for (const [id, raw] of Object.entries(input.items ?? {})) {
      catalog.items.set(id, {
        id,
        name: firstString(raw.name) || id,
        price: toAmount(raw.price),
      });
    }

    for (const [id, raw] of Object.entries(input.variants ?? {})) {
      const menuItemId = firstString(raw.menu_item_id, raw.menuItemId);
      const variant: CatalogVariant = {
        id,
        menuItemId,
        name: firstString(raw.name) || "Variant",
        priceDelta: toAmount(raw.price_delta ?? raw.priceDelta),
        isDefault: raw.is_default === true || raw.isDefault === true,
      };
      catalog.variants.set(id, variant);
      if (menuItemId) {
        const list = catalog.variantsByItem.get(menuItemId) ?? [];
        list.push(variant);
        catalog.variantsByItem.set(menuItemId, list);
      }
    }

    for (const [id, raw] of Object.entries(input.addons ?? {})) {
      const menuItemId = firstString(raw.menu_item_id, raw.menuItemId);
      const addon: CatalogAddon = {
        id,
        menuItemId,
        name: firstString(raw.name) || "Add-on",
        price: toAmount(raw.price),
        maxQuantity: Math.max(1, toAmount(raw.max_quantity ?? raw.maxQuantity) || 1),
      };
      catalog.addons.set(id, addon);
      if (menuItemId) {
        const list = catalog.addonsByItem.get(menuItemId) ?? [];
        list.push(addon);
        catalog.addonsByItem.set(menuItemId, list);
      }
    }

    for (const [id, raw] of Object.entries(input.modifiers ?? {})) {
      const choices = asArray<Record<string, unknown>>(raw.choices).map((c) => ({
        label: firstString(c.label, c.name) || "Choice",
        price: toAmount(c.price),
      }));
      catalog.modifiers.set(id, {
        id,
        name: firstString(raw.name) || id,
        type: firstString(raw.type) || "option",
        choices,
      });
    }

    return catalog;
  }

  getItem(id: string): CatalogItem | null {
    return this.items.get(id) ?? null;
  }

  getVariant(id: string): CatalogVariant | null {
    return this.variants.get(id) ?? null;
  }

  getAddon(id: string): CatalogAddon | null {
    return this.addons.get(id) ?? null;
  }

  getModifier(id: string): CatalogModifier | null {
    return this.modifiers.get(id) ?? null;
  }

  variantsForItem(menuItemId: string): CatalogVariant[] {
    return this.variantsByItem.get(menuItemId) ?? [];
  }

  addonsForItem(menuItemId: string): CatalogAddon[] {
    return this.addonsByItem.get(menuItemId) ?? [];
  }

  /** Decompose line total into variant + add-ons using menu catalog prices. */
  resolveCustomizationsFromLineTotal(
    menuItemId: string,
    lineTotal: number,
    quantity: number,
  ): { variant: CatalogVariant | null; addons: CatalogAddon[] } {
    const item = this.getItem(menuItemId);
    if (!item) return { variant: null, addons: [] };

    const perUnit = lineTotal / Math.max(1, quantity);
    const remainder = perUnit - item.price;
    if (remainder < 0.009) return { variant: null, addons: [] };

    const variants = this.variantsForItem(menuItemId);
    const addons = this.addonsForItem(menuItemId);

    for (const variant of variants) {
      const afterVariant = remainder - variant.priceDelta;
      if (afterVariant < 0.009) {
        if (Math.abs(afterVariant) < 0.009) return { variant, addons: [] };
        continue;
      }
      for (const addon of addons) {
        if (Math.abs(addon.price - afterVariant) < 0.009) {
          return { variant, addons: [addon] };
        }
      }
    }

    for (const variant of variants) {
      if (Math.abs(variant.priceDelta - remainder) < 0.009) {
        return { variant, addons: [] };
      }
    }

    for (const addon of addons) {
      if (Math.abs(addon.price - remainder) < 0.009) {
        return { variant: null, addons: [addon] };
      }
    }

    return { variant: null, addons: [] };
  }

  /** Infer variant from line total when order payload omitted variant but price includes delta. */
  inferVariantFromPricing(menuItemId: string, unitPrice: number, quantity: number): CatalogVariant | null {
    const item = this.getItem(menuItemId);
    if (!item) return null;
    const base = item.price;
    const perUnitDelta = unitPrice - base;
    if (Math.abs(perUnitDelta) < 0.01) return null;

    const candidates = this.variantsForItem(menuItemId).filter(
      (v) => Math.abs(v.priceDelta - perUnitDelta) < 0.01,
    );
    if (candidates.length === 1) return candidates[0]!;
    return null;
  }

  /** Infer add-ons when line total exceeds base + variant delta. */
  inferAddonsFromPricing(
    menuItemId: string,
    unitPrice: number,
    quantity: number,
    variantDelta: number,
  ): CatalogAddon[] {
    const item = this.getItem(menuItemId);
    if (!item) return [];
    const expected = item.price + variantDelta;
    const remainder = unitPrice - expected;
    if (remainder < 0.01) return [];

    const available = this.addonsForItem(menuItemId);
    const matched: CatalogAddon[] = [];

    for (const addon of available) {
      if (Math.abs(addon.price - remainder) < 0.01) {
        matched.push(addon);
        return matched;
      }
    }

    return matched;
  }

  resolveModifierChoice(modifierIdOrName: string, choiceIndexOrLabel: unknown): CatalogModifierChoice | null {
    const key = modifierIdOrName.trim().toLowerCase();
    let modifier: CatalogModifier | undefined;
    for (const m of this.modifiers.values()) {
      if (m.id === modifierIdOrName || m.name.toLowerCase() === key) {
        modifier = m;
        break;
      }
    }
    if (!modifier) return null;

    if (typeof choiceIndexOrLabel === "number") {
      return modifier.choices[choiceIndexOrLabel] ?? null;
    }
    if (typeof choiceIndexOrLabel === "string") {
      const parsed = Number(choiceIndexOrLabel);
      if (Number.isInteger(parsed) && parsed >= 0 && parsed < modifier.choices.length) {
        return modifier.choices[parsed] ?? null;
      }
      const labelKey = choiceIndexOrLabel.trim().toLowerCase();
      return modifier.choices.find((c) => c.label.toLowerCase() === labelKey) ?? null;
    }
    return null;
  }
}
