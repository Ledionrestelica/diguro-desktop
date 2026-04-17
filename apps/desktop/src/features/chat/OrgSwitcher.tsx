import { Settings2 } from 'lucide-react';
import { mockOrg } from './mock-data';

/**
 * Top-of-sidebar org card. Radial gradient background mirrors the Figma frame.
 * Clicking settings is a no-op for now — wire to org settings later.
 */
export function OrgSwitcher() {
  return (
    <div
      className="relative flex h-14 items-center gap-2.5 overflow-hidden rounded-xl border border-zinc-200 bg-white px-[7px]"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 280% 820% at 50% -8%, rgba(246, 250, 254, 1) 12%, rgba(217, 233, 249, 1) 77%)',
      }}
    >
      <div className="flex size-8 items-center justify-center rounded-[4.8px] bg-white">
        <OrgMark />
      </div>
      <span className="flex-1 truncate text-sm font-medium text-black">{mockOrg.name}</span>
      <button
        type="button"
        aria-label="Organization settings"
        className="grid size-8 place-items-center rounded-md text-zinc-600 hover:bg-black/5"
      >
        <Settings2 className="size-4" />
      </button>
    </div>
  );
}

function OrgMark() {
  // Simple colored disc placeholder — swap with org logo when logoUrl lands on Organization.
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <defs>
        <linearGradient id="org-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A8C5E8" />
          <stop offset="100%" stopColor="#D7C5E8" />
        </linearGradient>
      </defs>
      <circle cx="10" cy="10" r="9" fill="url(#org-mark)" />
    </svg>
  );
}
