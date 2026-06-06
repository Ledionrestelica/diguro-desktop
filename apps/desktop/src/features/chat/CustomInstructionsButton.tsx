import { useEffect, useRef, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const MAX_LEN = 4000;
const PLACEHOLDER =
  'e.g. Answer in formal Swedish. Be brief and use bullet points. ' +
  'Always explain legal terms in plain language. Address me as "du".';

/**
 * Top-bar control for the user's custom instructions — free text describing
 * how they want the assistant to behave. Persists per-user via
 * `me.setCustomInstructions`; the server injects it into the chat system
 * prompt on every turn (see apps/api/src/hono/chat-route.ts).
 */
export function CustomInstructionsButton() {
  const me = trpc.health.me.useQuery();
  const utils = trpc.useUtils();
  const saved = me.data?.customInstructions ?? '';

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(saved);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setInstructions = trpc.me.setCustomInstructions.useMutation({
    onSuccess: async () => {
      await utils.health.me.invalidate();
      setJustSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setJustSaved(false), 1500);
      setOpen(false);
    },
  });

  // Resync the editor with the persisted value whenever the popover opens or
  // the saved value changes underneath us (e.g. another window saved it).
  useEffect(() => {
    if (open) setValue(saved);
  }, [open, saved]);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const isDirty = value.trim() !== saved.trim();
  const hasInstructions = saved.trim().length > 0;

  function handleSave() {
    setInstructions.mutate({ instructions: value });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Custom AI instructions"
          title="How should the AI behave?"
          className="relative grid size-[42px] place-items-center rounded-full border border-zinc-100 bg-white text-zinc-700 shadow-xs transition-colors hover:bg-zinc-50"
        >
          {justSaved ? (
            <Check className="size-4 text-emerald-600" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {hasInstructions && !justSaved && (
            <span
              aria-hidden
              className="absolute right-2 top-2 size-2 rounded-full bg-emerald-500 ring-2 ring-white"
            />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h3 className="text-sm font-medium text-zinc-900">AI instructions</h3>
          <p className="mt-0.5 text-xs leading-4 text-zinc-500">
            Tell the assistant how to behave — tone, language, format, persona.
            Applied to every message in this account.
          </p>
        </div>

        <div className="px-4 py-3">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, MAX_LEN))}
            placeholder={PLACEHOLDER}
            rows={6}
            autoFocus
            className="resize-none text-sm"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && isDirty) {
                e.preventDefault();
                handleSave();
              }
            }}
          />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">
              {value.length}/{MAX_LEN} · ⌘↵ to save
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setValue('')}
            disabled={value.length === 0 || setInstructions.isPending}
          >
            Clear
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || setInstructions.isPending}
          >
            {setInstructions.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>

        {setInstructions.isError && (
          <p className="px-4 pb-3 text-xs text-destructive">
            Couldn’t save — please try again.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
