import { NavLink, useNavigate } from 'react-router-dom';
import {
  Building2,
  LayoutDashboard,
  LogOut,
  ShieldAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { apiAuth } from '@/lib/api-auth';
import { useAuth } from '@/app/auth-context';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

const PLATFORM_ITEMS: NavItem[] = [
  { label: 'Overview', to: '/admin/platform', icon: LayoutDashboard, end: true },
  { label: 'Organizations', to: '/admin/platform/organizations', icon: Building2 },
  { label: 'Users', to: '/admin/platform/users', icon: Users },
];

/**
 * Sidebar for the platform admin tier. Compact — there are only three
 * surfaces that matter at this level. The "PLATFORM" pill at the top is
 * a deliberate signal: superadmins are operating ABOVE individual orgs,
 * and the sidebar shouldn't read the same as an in-org admin sidebar.
 */
export function PlatformAdminSidebar() {
  return (
    <aside className="flex h-full w-[226px] shrink-0 flex-col border-r border-zinc-200 bg-[#fafafa]">
      <div className="flex items-center gap-3 px-3.5 py-4">
        <span className="grid size-8 place-items-center rounded-[8px] bg-black text-white">
          <ShieldAlert className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-5 text-black">
            Platform
          </p>
          <p className="truncate text-sm font-medium leading-5 text-zinc-400">
            Superadmin only
          </p>
        </div>
      </div>

      <NavGroup label="MANAGE" items={PLATFORM_ITEMS} />

      <div className="mt-auto flex flex-col gap-3 px-3.5 py-4">
        <div className="rounded-[10px] border border-zinc-200 bg-white p-3">
          <p className="text-xs font-semibold leading-4 text-zinc-700">
            Acting as platform operator
          </p>
          <p className="mt-1 text-[11px] leading-[14px] text-zinc-500">
            You can see and edit every tenant. Be careful — actions taken
            here are not gated by org-level checks.
          </p>
        </div>

        <AccountFooter />
      </div>
    </aside>
  );
}

/**
 * Compact "you are signed in as …" card with a sign-out action. Lives at
 * the bottom of the sidebar so it's always reachable without opening a
 * menu — superadmins have no top-bar account dropdown to fall back on.
 */
function AccountFooter() {
  const me = trpc.health.me.useQuery();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    try {
      await apiAuth.signOut();
    } finally {
      // Even if the network call fails, clear the local session — the
      // user clicked sign out and expects to land on the login screen.
      signOut();
      void navigate('/');
    }
  }

  const email = me.data?.email ?? '';
  const display = email.split('@')[0] ?? 'Account';
  const initial = (email.charAt(0) || '?').toUpperCase();

  return (
    <div className="rounded-[10px] border border-zinc-200 bg-white p-2">
      <div className="flex items-center gap-2 px-1.5 py-1">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-black text-[11px] font-semibold text-white">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-zinc-900">{display}</p>
          <p className="truncate text-[10px] text-zinc-500">{email}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        className="mt-1 flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
      >
        <LogOut className="size-3.5" />
        Sign out
      </button>
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
      end={item.end}
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
