import { NavLink, useNavigate } from 'react-router-dom';
import {
  Building2,
  ChevronLeft,
  LayoutDashboard,
  ShieldAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const navigate = useNavigate();
  return (
    <aside className="flex h-full w-[226px] shrink-0 flex-col border-r border-zinc-200 bg-[#fafafa]">
      <div className="flex items-center gap-3 px-3.5 py-4">
        <button
          type="button"
          aria-label="Back to chat"
          onClick={() => void navigate('/chat')}
          className="grid size-8 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="grid size-4 place-items-center rounded-[4px] bg-black text-white">
              <ShieldAlert className="size-3" />
            </span>
            <p className="truncate text-sm font-medium leading-5 text-black">
              Platform
            </p>
          </div>
          <p className="truncate text-sm font-medium leading-5 text-zinc-400">
            Superadmin only
          </p>
        </div>
      </div>

      <NavGroup label="MANAGE" items={PLATFORM_ITEMS} />

      <div className="mt-auto px-3.5 py-4">
        <div className="rounded-[10px] border border-zinc-200 bg-white p-3">
          <p className="text-xs font-semibold leading-4 text-zinc-700">
            Acting as platform operator
          </p>
          <p className="mt-1 text-[11px] leading-[14px] text-zinc-500">
            You can see and edit every tenant. Be careful — actions taken
            here are not gated by org-level checks.
          </p>
        </div>
      </div>
    </aside>
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
