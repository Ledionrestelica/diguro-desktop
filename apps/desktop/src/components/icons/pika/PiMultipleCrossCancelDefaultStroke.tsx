import type { SVGProps } from 'react';

/**
 * PiMultipleCrossCancelDefaultStroke icon from the stroke style in maths category.
 */
interface PiMultipleCrossCancelDefaultStrokeProps extends SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  className?: string;
  ariaLabel?: string;
}

export function PiMultipleCrossCancelDefaultStroke({
  size = 24,
  color,
  className,
  ariaLabel,
  ...props
}: PiMultipleCrossCancelDefaultStrokeProps) {
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
        d="m6 18 6-6m0 0 6-6m-6 6L6 6m6 6 6 6"
        fill="none"
      />
    </svg>
  );
}
