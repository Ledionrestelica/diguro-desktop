/**
 * Small gradient disc used as a placeholder workspace avatar. Swap to a
 * real <img src={logoUrl}/> once the workspace has an uploaded logo.
 */
export function WorkspaceGlyph({
  seed,
  size = 30,
  className,
}: {
  seed: string;
  size?: number;
  className?: string;
}) {
  // Deterministic-ish hue from the seed (workspace id) so different
  // workspaces get visually distinct gradients without a palette.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue1 = h % 360;
  const hue2 = (hue1 + 40) % 360;
  const gradientId = `workspace-${h.toString(36)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue1}, 55%, 78%)`} />
          <stop offset="100%" stopColor={`hsl(${hue2}, 55%, 86%)`} />
        </linearGradient>
      </defs>
      <circle cx="10" cy="10" r="9" fill={`url(#${gradientId})`} />
    </svg>
  );
}
