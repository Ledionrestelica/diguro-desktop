import type { SVGProps } from 'react';

/**
 * PiChevronRightStroke icon from the stroke style in arrows-&-chevrons category.
 */
interface PiChevronRightStrokeProps extends SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  className?: string;
  ariaLabel?: string;
}

export function PiChevronRightStroke({
  size = 24,
  color,
  className,
  ariaLabel,
  ...props
}: PiChevronRightStrokeProps) {
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
        d="M10 8.14a20.4 20.4 0 0 1 3.894 3.701.47.47 0 0 1 0 .596A20.4 20.4 0 0 1 10 16.139"
        fill="none"
      />
    </svg>
  );
}
