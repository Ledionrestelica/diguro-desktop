import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { apiAuth } from '@/lib/api-auth';
import { useAuth } from '@/app/auth-context';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
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
 *  workspace, and the account menu. */
export function UserFooter() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const me = trpc.health.me.useQuery();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const data = me.data;
  const wsRole = data?.activeWorkspace?.myRole;
  const canAdminWorkspace =
    data?.role === 'superadmin' ||
    data?.role === 'organization_admin' ||
    wsRole === 'OWNER' ||
    wsRole === 'ADMIN';
  const canAdminOrg = data?.role === 'organization_admin' || data?.role === 'superadmin';
  const subtitle = [ROLE_LABEL[data?.role ?? 'user'], data?.activeWorkspace?.name]
    .filter(Boolean)
    .join(' · ');

  async function handleSignOut() {
    await apiAuth.signOut();
    signOut();
  }

  const menu = (
    <DropdownMenuContent align="end" side="top" className="w-52 font-inter">
      <DropdownMenuItem onSelect={() => void navigate('/workspaces')}>
        Switch workspace
      </DropdownMenuItem>
      {canAdminWorkspace && (
        <DropdownMenuItem onSelect={() => void navigate('/admin/workspace/general')}>
          Workspace settings
        </DropdownMenuItem>
      )}
      {canAdminOrg && (
        <DropdownMenuItem onSelect={() => void navigate('/admin/organization/general')}>
          Organization settings
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>Settings</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => void handleSignOut()}>Sign out</DropdownMenuItem>
    </DropdownMenuContent>
  );

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
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
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
