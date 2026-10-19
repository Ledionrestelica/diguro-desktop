import { cn } from '@/lib/utils';

/** The 8-spoke "running" spinner from the Figma (Sidebar/Spinner). */
export function Spinner({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn(
        'shrink-0 animate-spin text-text-secondary [animation-duration:1.4s]',
        className,
      )}
    >
      <path
        d="M12 2v4m0 12v4M6 12H2m20 0h-4m1.078 7.078L16.25 16.25M19.078 5 16.25 7.828M4.922 19.078 7.75 16.25M4.922 5 7.75 7.828"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
