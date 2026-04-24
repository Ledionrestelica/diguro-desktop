import { useMemo } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared rendering primitive for the organization brand mark. Shows the
 * uploaded logo when present; otherwise falls back to a deterministic
 * gradient disc seeded from the organization id (so different tenants
 * still look distinct before they've set a logo).
 *
 * Use across the app: chat top bar, workspace picker, wizard preview —
 * anywhere we need a consistent glyph for the organization.
 */
interface Props {
  /** Already resolved (https) logo URL, or null if none set. */
  logoUrl: string | null | undefined;
  /** Deterministic seed for the gradient fallback. */
  seed: string | null | undefined;
  size?: number;
  className?: string;
  /** Primary color override — used by the fallback. Accepts CSS color. */
  primaryColor?: string | null;
  alt?: string;
}

export function OrganizationMark({
  logoUrl,
  seed,
  size = 20,
  className,
  primaryColor,
  alt = '',
}: Props) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={alt}
        width={size}
        height={size}
        className={cn('shrink-0 rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <OrganizationGlyphFallback
      seed={seed ?? 'diguro'}
      size={size}
      {...(className ? { className } : {})}
      {...(primaryColor ? { primaryColor } : {})}
    />
  );
}

function OrganizationGlyphFallback({
  seed,
  size,
  className,
  primaryColor,
}: {
  seed: string;
  size: number;
  className?: string;
  primaryColor?: string;
}) {
  const { id, stops } = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const hue1 = h % 360;
    const hue2 = (hue1 + 40) % 360;
    return {
      id: `organization-mark-${h.toString(36)}`,
      stops: primaryColor
        ? [primaryColor, primaryColor]
        : [`hsl(${hue1}, 55%, 78%)`, `hsl(${hue2}, 55%, 86%)`],
    };
  }, [seed, primaryColor]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={stops[0]} />
          <stop offset="100%" stopColor={stops[1]} />
        </linearGradient>
      </defs>
      <circle cx="10" cy="10" r="9" fill={`url(#${id})`} />
    </svg>
  );
}
