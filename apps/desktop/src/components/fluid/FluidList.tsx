import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useFluidHover } from './use-fluid-hover';
import { FluidHoverHighlight } from './fluid-hover-highlight';

/**
 * Fluid hover for a list: one highlight springs to the row nearest the
 * pointer instead of each row flashing its own hover fill. Rows anywhere
 * below opt in with `useFluidItem(key)`; keys keep their slot as rows mount
 * and unmount (a project expanding, a search filtering chats).
 */

type FluidContext = { register: (key: string, element: HTMLElement | null) => void };

const Context = createContext<FluidContext | null>(null);

export function FluidList({
  children,
  className,
  highlightClassName,
}: {
  children: ReactNode;
  className?: string;
  /** Shape and fill of the highlight. Defaults to the 8px `bg-hover` row. */
  highlightClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hover = useFluidHover(containerRef, { gapClick: false });
  const slots = useRef(new Map<string, number>());
  const nextSlot = useRef(0);
  const { registerItem } = hover;

  const register = useCallback(
    (key: string, element: HTMLElement | null) => {
      let slot = slots.current.get(key);
      if (slot === undefined) {
        slot = nextSlot.current++;
        slots.current.set(key, slot);
      }
      registerItem(slot, element);
    },
    [registerItem],
  );
  const value = useMemo(() => ({ register }), [register]);

  return (
    <div ref={containerRef} className={cn('relative', className)} {...hover.handlers}>
      <FluidHoverHighlight hover={hover} className={cn('rounded-[8px]', highlightClassName)} />
      <Context.Provider value={value}>{children}</Context.Provider>
    </div>
  );
}

/** Ref callback that joins the nearest `FluidList`, plus whether one exists
 *  (rows drop their own hover fill when the list draws it). */
export function useFluidItem(key: string | undefined) {
  const context = useContext(Context);
  const ref = useCallback(
    (element: HTMLElement | null) => {
      if (context && key) context.register(key, element);
    },
    [context, key],
  );
  return { ref, fluid: Boolean(context && key) };
}
