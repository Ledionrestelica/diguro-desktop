import { useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { apiAuth } from '@/lib/api-auth';
import { useAuth } from '@/app/auth-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PiThreeDotsMenuVerticalStroke } from '@/components/icons/pika/PiThreeDotsMenuVerticalStroke';

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Superadmin',
  organization_admin: 'Admin',
  user: 'Member',
};

/** Bottom of the sidebar (Figma "Sidebar/User"): avatar, name, role ·
 *  workspace, and the account menu. `compact` (the collapsed rail) shows
 *  just the avatar, which opens the same menu. */
export function UserFooter({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const me = trpc.health.me.useQuery();

  const data = me.data;
  const subtitle = [ROLE_LABEL[data?.role ?? 'user'], data?.activeWorkspace?.name]
    .filter(Boolean)
    .join(' · ');

  async function handleSignOut() {
    await apiAuth.signOut();
    signOut();
  }

  const menu = (
    <DropdownMenuContent
      align={compact ? 'start' : 'end'}
      side={compact ? 'right' : 'top'}
      className="w-52 font-inter"
    >
      <DropdownMenuItem onSelect={() => void navigate('/workspaces')}>
        Switch workspace
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void navigate('/settings')}>Settings</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => void handleSignOut()}>Sign out</DropdownMenuItem>
    </DropdownMenuContent>
  );

  if (compact) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account menu"
            title={data?.name || data?.email}
            className="cursor-pointer rounded-full outline-none focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
          >
            <UserAvatar />
          </DropdownMenuTrigger>
          {menu}
        </DropdownMenu>
      </>
    );
  }

  return (
    <>
      <div className="flex h-[62px] shrink-0 items-center gap-2.5 pt-3 pb-3.5">
        <UserAvatar />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="truncate text-label-13 font-medium text-text">
            {data?.name || data?.email}
          </span>
          <span className="truncate text-label-12 text-text-secondary">{subtitle}</span>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account menu"
            className="grid size-6 cursor-pointer place-items-center rounded-[6px] text-text-secondary outline-none hover:bg-hover hover:text-text focus-visible:shadow-[0_0_0_2px_var(--color-text)] data-[state=open]:bg-selected"
          >
            <PiThreeDotsMenuVerticalStroke size={14} />
          </DropdownMenuTrigger>
          {menu}
        </DropdownMenu>
      </div>
    </>
  );
}

/** The signed-in user's 30px avatar: their image, or initials. */
export function UserAvatar() {
  const me = trpc.health.me.useQuery();
  const data = me.data;
  return (
    <span className="grid size-[30px] shrink-0 place-items-center overflow-hidden rounded-full bg-bg-subtle-active text-label-12 font-semibold text-text">
      {data?.image ? (
        <img src={data.image} alt="" className="size-full object-cover" />
      ) : (
        initials(data?.name || data?.email)
      )}
    </span>
  );
}

function initials(value: string | undefined): string {
  if (!value) return '·';
  const parts =
    value
      .split('@')[0]
      ?.split(/[\s._-]+/)
      .filter(Boolean) ?? [];
  const letters =
    parts.length >= 2
      ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`
      : (parts[0] ?? '').slice(0, 2);
  return letters.toUpperCase() || '·';
}
