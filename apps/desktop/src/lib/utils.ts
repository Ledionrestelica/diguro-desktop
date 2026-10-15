import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Type tokens from typography.css (`text-heading-32`, `text-label-14`, …) are
// font sizes; without this tailwind-merge reads them as colors and drops them
// when combined with a text color class.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [(value: string) => /^(heading|button|label|copy)-\d+$/.test(value)] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
