import { Layers, MessageSquare, PlusCircle, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { DisplayOrderLine } from "@/lib/order-display";
import { lineCustomizationTotal } from "@/lib/order-display";

interface OrderDetailLineProps {
  line: DisplayOrderLine;
}

function money(value: number): string {
  return `R${value.toFixed(2)}`;
}

export function OrderDetailLine({ line }: OrderDetailLineProps) {
  const customizationTotal = lineCustomizationTotal(line);
  const hasVariant = line.variant != null;
  const hasAddons = line.addons.length > 0;
  const hasModifiers = line.modifiers.length > 0;
  const hasLegacyOptions = line.options.length > 0;
  const hasNotes = Boolean(line.notes);
  const hasCustomizations =
    hasVariant || hasAddons || hasModifiers || hasLegacyOptions || hasNotes;

  const showMenuCatalog =
    !hasVariant &&
    !hasAddons &&
    (line.menuVariants.length > 0 || line.menuAddons.length > 0);

  const showBreakdown =
    hasCustomizations ||
    Math.abs(line.basePrice - line.unitPrice) > 0.009 ||
    line.quantity > 1;

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/90 text-sm font-bold text-primary-foreground">
            {line.quantity}
          </span>
          <div className="min-w-0 space-y-1">
            <p className="font-semibold leading-snug">{line.name}</p>
            <p className="text-xs text-muted-foreground">
              Base {money(line.basePrice)}
              {line.quantity > 1 && ` · ${line.quantity} units`}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">{money(line.lineTotal)}</p>
          {line.quantity > 1 && (
            <p className="text-[11px] text-muted-foreground tabular-nums">{money(line.unitPrice)} / unit</p>
          )}
        </div>
      </div>

      {hasCustomizations && (
        <div className="space-y-3 border-t border-border/60 bg-muted/15 px-4 py-3">
          {hasVariant && line.variant && (
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                  <Layers className="size-3" /> Variant
                </span>
                <Badge variant="secondary" className="border-violet-500/20 bg-violet-500/10 font-normal">
                  {line.variant.name}
                </Badge>
              </div>
              {line.variant.priceDelta !== 0 && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {line.variant.priceDelta > 0 ? "+" : ""}
                  {money(line.variant.priceDelta)}
                </span>
              )}
            </div>
          )}

          {hasAddons && (
            <div className="space-y-2">
              <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                <PlusCircle className="size-3" /> Add-ons
              </p>
              <ul className="space-y-1.5">
                {line.addons.map((addon) => (
                  <li
                    key={`${addon.id}-${addon.name}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-emerald-500/15 bg-emerald-500/5 px-3 py-2"
                  >
                    <span className="text-sm">
                      {addon.quantity > 1 && (
                        <span className="mr-1 font-medium text-muted-foreground">{addon.quantity}×</span>
                      )}
                      {addon.name}
                    </span>
                    {addon.price > 0 && (
                      <span className="shrink-0 text-xs tabular-nums text-emerald-700 dark:text-emerald-300">
                        +{money(addon.price * addon.quantity)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasModifiers && (
            <div className="space-y-2">
              <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-300">
                <SlidersHorizontal className="size-3" /> Modifiers
              </p>
              <ul className="space-y-1.5">
                {line.modifiers.map((mod, i) => (
                  <li
                    key={`${mod.group}-${mod.label}-${i}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-sky-500/15 bg-sky-500/5 px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="text-muted-foreground">{mod.group}:</span> {mod.label}
                    </span>
                    {mod.price > 0 && (
                      <span className="shrink-0 text-xs tabular-nums text-sky-700 dark:text-sky-300">
                        +{money(mod.price)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasLegacyOptions && (
            <div className="flex flex-wrap gap-1.5">
              {line.options.map((opt, i) => (
                <Badge key={`${opt.group}-${i}`} variant="outline" className="font-normal">
                  <span className="text-muted-foreground">{opt.group}:</span> {opt.value}
                </Badge>
              ))}
            </div>
          )}

          {hasNotes && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
              <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                <MessageSquare className="size-3" /> Kitchen note
              </p>
              <p className="mt-1 text-xs leading-relaxed">{line.notes}</p>
            </div>
          )}
        </div>
      )}

      {showMenuCatalog && (
        <div className="space-y-2.5 border-t border-dashed border-border/60 bg-muted/10 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Menu options for this product
          </p>
          {line.menuVariants.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Layers className="size-3 text-violet-500" />
              {line.menuVariants.map((v) => (
                <Badge
                  key={v.id}
                  variant="outline"
                  className="border-violet-500/20 bg-violet-500/5 font-normal text-violet-700 dark:text-violet-300"
                >
                  {v.name}
                  {v.priceDelta !== 0 && (
                    <span className="ml-1 opacity-75">
                      {v.priceDelta > 0 ? "+" : ""}
                      {money(v.priceDelta)}
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          )}
          {line.menuAddons.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <PlusCircle className="size-3 text-emerald-500" />
              {line.menuAddons.map((a) => (
                <Badge
                  key={a.id}
                  variant="outline"
                  className="border-emerald-500/20 bg-emerald-500/5 font-normal text-emerald-700 dark:text-emerald-300"
                >
                  {a.name}
                  {a.price > 0 && <span className="ml-1 opacity-75">+{money(a.price)}</span>}
                </Badge>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Standard configuration ordered — options above are available on the menu for this item.
          </p>
        </div>
      )}

      {showBreakdown && (
        <div className="border-t border-border/60 bg-muted/25 px-4 py-3">
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Base ({line.quantity}× {money(line.basePrice)})</span>
              <span className="tabular-nums">{money(line.basePrice * line.quantity)}</span>
            </div>
            {customizationTotal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Customizations</span>
                <span className="tabular-nums">+{money(customizationTotal * line.quantity)}</span>
              </div>
            )}
            <Separator className="my-1.5" />
            <div className="flex justify-between font-medium">
              <span>Line total</span>
              <span className="tabular-nums">{money(line.lineTotal)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
