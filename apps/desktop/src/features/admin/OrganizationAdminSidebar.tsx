import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Boxes,
  ChevronLeft,
  Coins,
  CreditCard,
  FolderOpen,
  Loader2,
  ScrollText,
  Settings2,
  ShieldAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { WorkspaceGlyph } from '@/features/workspaces/WorkspaceGlyph';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

const ORGANIZATION_ITEMS: NavItem[] = [
  { label: 'General', to: '/admin/organization/general', icon: Settings2 },
  { label: 'Members', to: '/admin/organization/members', icon: Users },
  { label: 'Workspaces', to: '/admin/organization/workspaces', icon: Boxes },
  { label: 'Files', to: '/admin/organization/files', icon: FolderOpen },
  { label: 'Token Usage', to: '/admin/organization/token-usage', icon: Coins },
  { label: 'Audit Log', to: '/admin/organization/audit-log', icon: ScrollText },
  { label: 'Billing', to: '/admin/organization/billing', icon: CreditCard },
];

interface Props {
  organizationName: string;
}

export function OrganizationAdminSidebar({ organizationName }: Props) {
  const navigate = useNavigate();
  return (
    <aside className="flex h-full w-[226px] shrink-0 flex-col overflow-y-auto border-r border-zinc-200 bg-[#fafafa]">
      <div className="flex items-center gap-3 px-3.5 py-4">
        <button
          type="button"
          aria-label="Back to workspaces"
          onClick={() => void navigate('/workspaces')}
          className="grid size-8 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-5 text-black">
            Organization
          </p>
          <p className="truncate text-sm font-medium leading-5 text-zinc-400">
            {organizationName}
          </p>
        </div>
      </div>

      <PlatformShortcut />
      <NavGroup label="ORGANIZATION" items={ORGANIZATION_ITEMS} />
      <WorkspacesGroup />
    </aside>
  );
}

/**
 * Tiny "elevate to platform admin" affordance shown only to superadmins.
 * Lives at the very top of the sidebar so the operator always has a path
 * up to the platform tier without going hunting through other menus.
 */
function PlatformShortcut() {
  const me = trpc.health.me.useQuery();
  if (me.data?.role !== 'superadmin') return null;
  return (
    <div className="px-3.5 pb-1 pt-1">
      <NavLink
        to="/admin/platform"
        className="flex items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
      >
        <span className="grid size-4 place-items-center rounded-[4px] bg-black text-white">
          <ShieldAlert className="size-2.5" />
        </span>
        <span className="flex-1 truncate">Platform admin</span>
        <span className="text-[10px] text-zinc-400">Super</span>
      </NavLink>
    </div>
  );
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <div className="mt-2 px-3.5 pb-2">
      <p className="px-1.5 pb-2 pt-2 text-xs font-medium uppercase leading-[14px] tracking-wide text-zinc-500">
        {label}
      </p>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.to}>
            <NavItemLink item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function NavItemLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-0 rounded-[10px] pr-3 text-sm font-medium text-zinc-800 transition-colors',
          isActive
            ? 'bg-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)]'
            : 'hover:bg-zinc-100/70',
        )
      }
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full text-zinc-600">
        <Icon className="size-4" />
      </span>
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

function WorkspacesGroup() {
  const navigate = useNavigate();
  const location = useLocation();
  const utils = trpc.useUtils();
  const wsQuery = trpc.adminOrganization.workspacesList.useQuery();
  const setActive = trpc.workspaces.setActive.useMutation();

  const onPickWorkspace = async (workspaceId: string) => {
    if (setActive.isPending) return;
    await setActive.mutateAsync({ workspaceId });
    await utils.health.me.invalidate();
    await utils.adminWorkspace.workspaceGet.invalidate();
    void navigate('/admin/workspace/general');
  };

  const pendingId = setActive.isPending ? setActive.variables?.workspaceId : null;
  const activePath = location.pathname;

  return (
    <div className="mt-2 px-3.5 pb-6">
      <p className="px-1.5 pb-2 pt-2 text-xs font-medium uppercase leading-[14px] tracking-wide text-zinc-500">
        WORKSPACES
      </p>

      {wsQuery.isLoading && (
        <p className="px-1.5 py-1 text-xs text-zinc-400">Loading…</p>
      )}

      {wsQuery.data?.length === 0 && (
        <p className="px-1.5 py-1 text-xs text-zinc-400">No workspaces yet.</p>
      )}

      <ul className="flex flex-col gap-0.5">
        {wsQuery.data?.map((ws) => {
          const pending = pendingId === ws.id;
          const isCurrent =
            !setActive.isPending && activePath.startsWith('/admin/workspace');
          return (
            <li key={ws.id}>
              <button
                type="button"
                disabled={setActive.isPending}
                onClick={() => void onPickWorkspace(ws.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-[10px] py-1 pl-1 pr-3 text-left text-sm font-medium text-zinc-800 transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                  isCurrent
                    ? 'hover:bg-zinc-100/70'
                    : 'hover:bg-zinc-100/70',
                )}
                title={`Manage ${ws.name}`}
              >
                <span className="grid size-6 shrink-0 place-items-center">
                  {ws.logoUrl ? (
                    <img
                      src={ws.logoUrl}
                      alt=""
                      className="size-6 rounded-full object-cover"
                    />
                  ) : (
                    <WorkspaceGlyph seed={ws.id} size={22} />
                  )}
                </span>
                <span className="truncate">{ws.name}</span>
                {pending && (
                  <Loader2 className="ml-auto size-3 animate-spin text-zinc-400" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
