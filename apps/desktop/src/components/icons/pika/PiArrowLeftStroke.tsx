import type { SVGProps } from 'react';

/**
 * PiArrowLeftStroke icon from the stroke style in arrows-&-chevrons category.
 */
interface PiArrowLeftStrokeProps extends SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  className?: string;
  ariaLabel?: string;
}

export function PiArrowLeftStroke({
  size = 24,
  color,
  className,
  ariaLabel,
  ...props
}: PiArrowLeftStrokeProps) {
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
        d="M9.83 6a30.2 30.2 0 0 0-5.62 5.406A.95.95 0 0 0 4 12m5.83 6a30.2 30.2 0 0 1-5.62-5.406A.95.95 0 0 1 4 12m0 0h16"
        fill="none"
      />
    </svg>
  );
}
