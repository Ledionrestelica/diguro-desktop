import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { SettingsRow, SettingsSection } from '@/features/admin/SettingsSection';
import { dsButtonClass } from '@/components/ui/ds-button';

const MAX_LEN = 4000;
const PLACEHOLDER =
  'e.g. Answer in formal Swedish. Be brief and use bullet points. ' +
  'Always explain legal terms in plain language.';

/**
 * Settings · Account · Profile → Chat: the user's custom instructions, free
 * text the server adds to the system prompt of every chat (see
 * apps/api/src/hono/chat-route.ts). Persists via `me.setCustomInstructions`.
 */
export function CustomInstructionsSettings() {
  const me = trpc.health.me.useQuery();
  const utils = trpc.useUtils();
  const saved = me.data?.customInstructions ?? '';

  const [value, setValue] = useState(saved);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the saved value when it loads or changes elsewhere.
  useEffect(() => setValue(saved), [saved]);
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const setInstructions = trpc.me.setCustomInstructions.useMutation({
    onSuccess: async () => {
      await utils.health.me.invalidate();
      setJustSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setJustSaved(false), 1500);
    },
  });

  const isDirty = value.trim() !== saved.trim();
  const save = () => setInstructions.mutate({ instructions: value });

  return (
    <SettingsSection title="Chat">
      <SettingsRow
        label="Custom instructions"
        hint="How the assistant should answer you: tone, language, format. Applied to every chat."
        stacked
      >
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && isDirty) {
              e.preventDefault();
              save();
            }
          }}
          rows={5}
          placeholder={PLACEHOLDER}
          className="w-full resize-none rounded-[10px] border border-border-default bg-bg-panel px-3 py-2.5 text-copy-14 text-text outline-none transition-[border-color,box-shadow] placeholder:text-text-placeholder hover:border-border-hover focus-visible:border-focus-ring focus-visible:shadow-[0_0_0_3px_var(--color-selection)]"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-label-12 text-text-placeholder tabular-nums">
            {setInstructions.isError
              ? 'Couldn’t save. Please try again.'
              : `${value.length} / ${MAX_LEN} · ⌘↵ to save`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setValue('')}
              disabled={value.length === 0 || setInstructions.isPending}
              className={dsButtonClass({ variant: 'tertiary' })}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!isDirty || setInstructions.isPending}
              className={cn(
                dsButtonClass({ variant: 'primary' }),
                justSaved && 'disabled:bg-primary disabled:text-white',
              )}
            >
              {setInstructions.isPending ? 'Saving…' : justSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
