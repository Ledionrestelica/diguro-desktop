import type { SVGProps } from 'react';

/**
 * PiCheckTickSingleStroke icon from the stroke style in general category.
 */
interface PiCheckTickSingleStrokeProps extends SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  className?: string;
  ariaLabel?: string;
}

export function PiCheckTickSingleStroke({
  size = 24,
  color,
  className,
  ariaLabel,
  ...props
}: PiCheckTickSingleStrokeProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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
        strokeWidth="2"
        d="m5.5 12.5 4.517 5.225.4-.701a28.6 28.6 0 0 1 8.7-9.42L20 7"
        fill="none"
      />
    </svg>
  );
}
