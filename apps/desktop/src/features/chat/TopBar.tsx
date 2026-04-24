import { Building2, MessageCircleDashed, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiAuth } from '@/lib/api-auth';
import { useAuth } from '@/app/auth-context';
import { trpc } from '@/lib/trpc';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OrganizationMark } from '@/features/organization/OrganizationMark';
import { mockOrg } from './mock-data';

export function TopBar() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const me = trpc.health.me.useQuery();

  async function handleSignOut() {
    await apiAuth.signOut();
    signOut();
  }

  // Shown to: platform admins (superadmin, organization_admin) OR members
  // who are OWNER / ADMIN of the active workspace. The server mirrors this
  // check on every adminWorkspace procedure.
  const wsRole = me.data?.activeWorkspace?.myRole;
  const canAdmin =
    me.data?.role === 'superadmin' ||
    me.data?.role === 'organization_admin' ||
    wsRole === 'OWNER' ||
    wsRole === 'ADMIN';
  const org = me.data?.organization;
  const activeWs = me.data?.activeWorkspace;
  const orgName = org?.name ?? mockOrg.shortName;
  const wsName = activeWs?.name;
  const avatarInitials = initials(me.data?.email);

  return (
    <header className="relative flex h-[70px] items-center justify-between px-6">
      <div className="w-20" />

      <button
        type="button"
        onClick={() => void navigate('/workspaces')}
        aria-label="Switch workspace"
        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full px-2 py-1 transition-colors hover:bg-zinc-100"
      >
        <OrganizationMark
          logoUrl={org?.logoUrl ?? null}
          seed={org?.id ?? ''}
          primaryColor={org?.primaryColor ?? null}
          size={20}
          alt={orgName}
        />
        <span className="text-xs font-medium leading-5 text-zinc-600">{orgName}</span>
        {wsName && activeWs && (
          <>
            <span className="text-xs leading-5 text-zinc-300">/</span>
            <OrganizationMark
              logoUrl={activeWs.logoUrl ?? null}
              seed={activeWs.id}
              size={20}
              alt={wsName}
            />
            <span className="text-xs font-medium leading-5 text-zinc-600">{wsName}</span>
          </>
        )}
      </button>

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
              {avatarInitials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => void navigate('/workspaces')}>
              <Building2 className="size-4" />
              Switch workspace
            </DropdownMenuItem>
            {canAdmin && (
              <DropdownMenuItem onSelect={() => void navigate('/admin/workspace/general')}>
                <Shield className="size-4" />
                Admin settings
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleSignOut}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function initials(email: string | undefined): string {
  if (!email) return '·';
  const handle = email.split('@')[0] ?? email;
  const parts = handle.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0] ?? '';
    const b = parts[1]?.[0] ?? '';
    return (a + b).toUpperCase() || '·';
  }
  return (handle.slice(0, 2) || '·').toUpperCase();
}
