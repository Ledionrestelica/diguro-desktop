import type { SVGProps } from 'react';

/**
 * PiUserPlusStroke icon from the stroke style in users category.
 */
interface PiUserPlusStrokeProps extends SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  className?: string;
  ariaLabel?: string;
}

export function PiUserPlusStroke({
  size = 24,
  color,
  className,
  ariaLabel,
  ...props
}: PiUserPlusStrokeProps) {
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
        d="M15.352 21H5a2 2 0 0 1-2-2 4 4 0 0 1 4-4h4m7 3v-3m0 0v-3m0 3h-3m3 0h3m-6-8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
        fill="none"
      />
    </svg>
  );
}
