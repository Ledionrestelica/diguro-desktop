import { NavLink, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronLeft,
  Coins,
  FileText,
  GitMerge,
  Key,
  Settings,
  Settings2,
  Sparkles,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

const WORKSPACE_ITEMS: NavItem[] = [
  { label: 'General', to: '/admin/workspace/general', icon: Settings2 },
  { label: 'Files', to: '/admin/workspace/files', icon: FileText },
  { label: 'AI Customization', to: '/admin/workspace/ai-customization', icon: Sparkles },
  { label: 'Users', to: '/admin/workspace/users', icon: Users },
  { label: 'Token Usage', to: '/admin/workspace/token-usage', icon: Coins },
  { label: 'Integration', to: '/admin/workspace/integration', icon: GitMerge },
];

const PERSONAL_ITEMS: NavItem[] = [
  { label: 'Profile', to: '/admin/workspace/profile', icon: User },
  { label: 'Preferences', to: '/admin/workspace/preferences', icon: Settings },
  { label: 'Notifications', to: '/admin/workspace/notifications', icon: Bell },
  { label: 'API Keys', to: '/admin/workspace/api-keys', icon: Key },
];

interface Props {
  /** Active workspace name — shown as the small subtitle under "Admin Settings". */
  workspaceName: string;
}

export function AdminSidebar({ workspaceName }: Props) {
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
          <p className="truncate text-sm font-medium leading-5 text-black">Admin Settings</p>
          <p className="truncate text-sm font-medium leading-5 text-zinc-400">
            {workspaceName}
          </p>
        </div>
      </div>

      <NavGroup label="WORKSPACE" items={WORKSPACE_ITEMS} />
      <NavGroup label="PERSONAL" items={PERSONAL_ITEMS} />
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
