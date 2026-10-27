import type { SVGProps } from 'react';

/**
 * PiReminderAnticlockwiseStroke icon from the stroke style in time category.
 */
interface PiReminderAnticlockwiseStrokeProps extends SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  className?: string;
  ariaLabel?: string;
}

export function PiReminderAnticlockwiseStroke({
  size = 24,
  color,
  className,
  ariaLabel,
  ...props
}: PiReminderAnticlockwiseStrokeProps) {
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
        d="M5.07 3.693a15 15 0 0 0-.487 3.84c0 .339.284.448.56.51h.001m3.66.348a15 15 0 0 1-3.66-.348m0 0a8 8 0 1 1-1.06 5.908M14.001 15l-1.707-1.707a1 1 0 0 1-.293-.707V9"
        fill="none"
      />
    </svg>
  );
}
