import type { LucideIcon } from 'lucide-react';
import { Brain, Check, ChevronDown, Rocket, Zap } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';

/**
 * Chat "effort" picker. The catalog exposes several models across providers,
 * but users don't want to reason about "GPT-5 mini" vs "Claude Sonnet" — they
 * want to say how much horsepower the task needs. So we collapse the catalog
 * into two intent tiers (Everyday / Advanced) and pick a representative model
 * per tier under the hood. The concrete model id still flows through onChange,
 * so the sticky-preference + persistence path is unchanged.
 */

type Tier = 'fast' | 'balanced' | 'heavy';

interface TierMeta {
  label: string;
  tagline: string;
  Icon: LucideIcon;
  /** Accent classes for the icon tile. */
  tile: string;
}

const TIER_META: Record<Tier, TierMeta> = {
  fast: {
    label: 'Everyday',
    tagline: 'Quick answers for everyday questions',
    Icon: Zap,
    tile: 'bg-amber-50 text-amber-600',
  },
  balanced: {
    label: 'Advanced',
    tagline: 'Deeper reasoning for complex work',
    Icon: Brain,
    tile: 'bg-violet-50 text-violet-600',
  },
  heavy: {
    label: 'Max',
    tagline: 'Maximum reasoning for the hardest tasks',
    Icon: Rocket,
    tile: 'bg-rose-50 text-rose-600',
  },
};

const TIER_ORDER: Tier[] = ['fast', 'balanced', 'heavy'];

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

  type Model = (typeof models)[number];
  const pickRepresentative = (tier: Tier): Model | undefined => {
    const inTier = models.filter((m) => m.tier === tier);
    return inTier.find((m) => m.defaultForSelect) ?? inTier[0];
  };

  const tiers = TIER_ORDER.map((tier) => {
    const model = pickRepresentative(tier);
    return model ? { tier, model } : null;
  }).filter((t): t is { tier: Tier; model: Model } => t !== null);

  const effectiveId = value ?? defaultId;
  const currentModel =
    models.find((m) => m.id === effectiveId) ??
    models.find((m) => m.defaultForSelect) ??
    models[0];
  const activeTier = currentModel?.tier;

  if (query.isLoading) {
    return (
      <span className="inline-flex h-7.5 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-400">
        Loading…
      </span>
    );
  }
  if (tiers.length === 0) return null;

  const active = tiers.find((t) => t.tier === activeTier) ?? tiers[0];
  if (!active) return null;
  const activeMeta = TIER_META[active.tier];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white py-1.5 pl-2.5 pr-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60',
          )}
          title={`Mode: ${activeMeta.label}`}
        >
          <activeMeta.Icon className="size-3.5" />
          <span>{activeMeta.label}</span>
          <ChevronDown className="size-3 text-zinc-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-74 p-1.5">
        {tiers.map(({ tier, model }) => {
          const meta = TIER_META[tier];
          const isActive = tier === active.tier;
          return (
            <DropdownMenuItem
              key={tier}
              onSelect={() => onChange(model.id)}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5',
                isActive && 'bg-zinc-50',
              )}
            >
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-lg',
                  meta.tile,
                )}
              >
                <meta.Icon className="size-4.5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold leading-none text-zinc-900">
                  {meta.label}
                </span>
                <span className="text-xs leading-snug text-zinc-500">
                  {meta.tagline}
                </span>
              </span>
              {isActive && <Check className="size-4 shrink-0 text-zinc-900" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
