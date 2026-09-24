import { cn } from "@/lib/utils";

/**
 * Hearth brand mark — copied verbatim from the customer app (src/components/app/logo.tsx).
 * Do not redraw. public/favicon.svg, logo-mark.svg and logo-wordmark.svg carry the same path.
 */
export const HEARTH_FLAME_PATH =
  "M16 4C20.5 10 25 13.5 25 19A9 9 0 0 1 7 19C7 13.5 11.5 10 16 4ZM16 13C18 16 20 17.8 20 20.5A4 4 0 0 1 12 20.5C12 17.8 14 16 16 13Z";

export const CONSOLE_NAME = "Hearth Kitchen";

type MarkProps = { className?: string };

/** Flame alone, inherits currentColor. Size it from the outside. */
export const HearthMark = ({ className }: MarkProps) => (
  <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("h-6 w-6", className)}>
    <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d={HEARTH_FLAME_PATH} />
  </svg>
);

/** Cream flame in an orange tile, matching the app icon lockup (scale 0.78, rx 7). */
export const HearthBadge = ({ className }: MarkProps) => (
  <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("h-12 w-12", className)}>
    <rect width="32" height="32" rx="7" fill="#fb4500" />
    <g transform="translate(16 16) scale(0.78) translate(-16 -16)">
      <path fill="#fcfaf7" fillRule="evenodd" clipRule="evenodd" d={HEARTH_FLAME_PATH} />
    </g>
  </svg>
);

/** Mark + wordmark. The wordmark stays real text so it is selectable and read correctly. */
export const HearthLogo = ({
  className,
  subtitle,
}: {
  className?: string;
  /** Optional console sub-name, e.g. "Kitchen". */
  subtitle?: string;
}) => (
  <span className={cn("inline-flex items-center gap-2", className)}>
    <HearthMark className="h-7 w-7 shrink-0 text-primary" />
    <span className="text-lg font-black leading-none tracking-[-0.02em] text-foreground">
      Hearth
      {subtitle ? <span className="ml-1.5 font-semibold text-muted-foreground">{subtitle}</span> : null}
    </span>
  </span>
);
