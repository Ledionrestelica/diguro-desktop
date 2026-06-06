import { useState } from 'react';
import { Shield, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { PersonalSettings } from './PersonalSettings';
import { SecuritySettings } from './SecuritySettings';

type TabId = 'personal' | 'security';

interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

const TABS: readonly TabDef[] = [
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Account settings modal (opened from the user menu in the top bar). Left
 * rail of tabs + a scrollable content pane, mirroring the desktop-app
 * settings layout. Currently ships the Personal tab; more tabs slot into
 * `TABS` + the `renderTab` switch.
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [active, setActive] = useState<TabId>('personal');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="grid h-[560px] max-h-[85vh] w-full max-w-[760px] grid-cols-[200px_1fr] gap-0 overflow-hidden p-0 sm:max-w-[760px]"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>

        <nav className="flex flex-col gap-0.5 border-r border-zinc-100 bg-zinc-50/60 p-3">
          <p className="px-2 pb-1.5 pt-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Settings
          </p>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  active === tab.id
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:bg-white/70 hover:text-zinc-900',
                )}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="min-h-0 overflow-y-auto px-6 py-6">
          <h2 className="mb-5 text-lg font-semibold text-zinc-900">
            {TABS.find((t) => t.id === active)?.label}
          </h2>
          {active === 'personal' && <PersonalSettings />}
          {active === 'security' && <SecuritySettings />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
