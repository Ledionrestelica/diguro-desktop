import type { SVGProps } from 'react';

/**
 * PiCheckTickDoubleStroke icon from the stroke style in general category.
 */
interface PiCheckTickDoubleStrokeProps extends SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  className?: string;
  ariaLabel?: string;
}

export function PiCheckTickDoubleStroke({
  size = 24,
  color,
  className,
  ariaLabel,
  ...props
}: PiCheckTickDoubleStrokeProps) {
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
        d="m2.605 11.781 4.524 5.224.374-.654a26.7 26.7 0 0 1 8.119-8.793l.825-.563m5.106.614-.87.49a26.7 26.7 0 0 0-8.837 8.07l-.428.62-.298-.352"
        fill="none"
      />
    </svg>
  );
}
