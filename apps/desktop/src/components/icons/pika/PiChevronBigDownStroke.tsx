import type { SVGProps } from 'react';

/**
 * PiChevronBigDownStroke icon from the stroke style in arrows-&-chevrons category.
 */
interface PiChevronBigDownStrokeProps extends SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  className?: string;
  ariaLabel?: string;
}

export function PiChevronBigDownStroke({
  size = 24,
  color,
  className,
  ariaLabel,
  ...props
}: PiChevronBigDownStrokeProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: color || 'currentColor' }}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      {...props}
    >
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        d="M6 9a30.6 30.6 0 0 0 5.49 5.817c.3.244.72.244 1.02 0A30.6 30.6 0 0 0 18 9"
        fill="none"
      />
    </svg>
  );
}
