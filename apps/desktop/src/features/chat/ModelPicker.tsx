import { Check, ChevronDown, Cpu, Sparkles, Zap } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';

/**
 * Chat model picker. Pulls the available catalog from the API (filtered
 * to configured providers) and displays it in a dropdown next to the
 * Composer's send button.
 *
 * The picker is "sticky": whichever model the user selects becomes their
 * default next time, via the chat-route's background update. No explicit
 * "make default" button — the app remembers what you actually use.
 */

interface Props {
  value: string | null;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelPicker({ value, onChange, disabled }: Props) {
  const query = trpc.me.listAvailableModels.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // Catalog rarely changes; cache aggressively.
  });

  const models = query.data?.models ?? [];
  const defaultId = query.data?.defaultId ?? null;
  const effectiveId = value ?? defaultId;
  const current = models.find((m) => m.id === effectiveId) ?? models[0] ?? null;

  if (query.isLoading) {
    return (
      <span className="inline-flex h-[30px] items-center rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-400">
        Loading…
      </span>
    );
  }
  if (!current) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60',
          )}
          title={`Model: ${current.label}`}
        >
          <TierIcon tier={current.tier} />
          <span className="max-w-[140px] truncate">{current.label}</span>
          <ChevronDown className="size-3 text-zinc-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[300px]">
        {models.map((m) => {
          const isCurrent = m.id === current.id;
          return (
            <DropdownMenuItem
              key={m.id}
              onSelect={() => onChange(m.id)}
              className="flex items-start gap-2 py-2"
            >
              <span className="mt-0.5">
                <TierIcon tier={m.tier} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5">
                  <span className="font-medium text-zinc-900">{m.label}</span>
                  <TierBadge tier={m.tier} />
                </span>
                <span className="text-xs text-zinc-500">{m.description}</span>
              </span>
              {isCurrent && (
                <Check className="mt-1 size-4 shrink-0 text-zinc-900" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TierIcon({ tier }: { tier: 'fast' | 'balanced' | 'heavy' }) {
  switch (tier) {
    case 'fast':
      return <Zap className="size-3.5 text-amber-600" />;
    case 'balanced':
      return <Cpu className="size-3.5 text-sky-600" />;
    case 'heavy':
      return <Sparkles className="size-3.5 text-violet-600" />;
  }
}

function TierBadge({ tier }: { tier: 'fast' | 'balanced' | 'heavy' }) {
  const config = {
    fast: { label: 'Fast', className: 'bg-amber-50 text-amber-700' },
    balanced: { label: 'Balanced', className: 'bg-sky-50 text-sky-700' },
    heavy: { label: 'Max', className: 'bg-violet-50 text-violet-700' },
  }[tier];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-semibold',
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}
