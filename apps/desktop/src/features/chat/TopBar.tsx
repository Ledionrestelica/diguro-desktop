import { MessageCircleDashed } from 'lucide-react';
import { apiAuth } from '@/lib/api-auth';
import { useAuth } from '@/app/auth-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { mockOrg } from './mock-data';

export function TopBar() {
  const { signOut } = useAuth();

  async function handleSignOut() {
    await apiAuth.signOut();
    signOut();
  }

  return (
    <header className="relative flex h-[70px] items-center justify-between px-6">
      <div className="w-20" />

      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5">
        <OrgGlyph />
        <span className="text-xs font-medium leading-5 text-zinc-600">{mockOrg.shortName}</span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Chat info"
          className="grid size-[42px] place-items-center rounded-full border border-zinc-100 bg-white text-zinc-700 shadow-xs transition-colors hover:bg-zinc-50"
        >
          <MessageCircleDashed className="size-4" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="User menu"
              className="grid size-[42px] place-items-center rounded-full border border-zinc-300 bg-zinc-100 text-[13px] font-medium text-zinc-800 shadow-xs transition-colors hover:bg-zinc-200"
            >
              AG
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem disabled>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleSignOut}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function OrgGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <defs>
        <linearGradient id="org-glyph" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A8C5E8" />
          <stop offset="100%" stopColor="#D7C5E8" />
        </linearGradient>
      </defs>
      <circle cx="10" cy="10" r="8" fill="url(#org-glyph)" />
    </svg>
  );
}
