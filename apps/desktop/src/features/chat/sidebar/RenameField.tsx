import { useState } from 'react';

/** Inline rename input (Figma state C): white field with the focus ring.
 *  Enter saves, Escape or blur cancels. */
export function RenameField({
  initial,
  placeholder,
  onDone,
}: {
  initial: string;
  placeholder?: string;
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onDone(value.trim() || null);
      }}
    >
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => onDone(null)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone(null);
        }}
        className="h-9 w-full rounded-[10px] border border-focus-ring bg-bg-panel px-2 text-label-14 font-medium text-text shadow-[0_0_0_3px_var(--color-selection)] outline-none placeholder:text-text-placeholder"
      />
    </form>
  );
}
