import type { SVGProps } from 'react';

/**
 * PiThreeDotsMenuHorizontalStroke icon from the stroke style in general category.
 */
interface PiThreeDotsMenuHorizontalStrokeProps extends SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  className?: string;
  ariaLabel?: string;
}

export function PiThreeDotsMenuHorizontalStroke({
  size = 24,
  color,
  className,
  ariaLabel,
  ...props
}: PiThreeDotsMenuHorizontalStrokeProps) {
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
        d="M6 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
        fill="none"
      />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        d="M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
        fill="none"
      />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        d="M20 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
        fill="none"
      />
    </svg>
  );
}
