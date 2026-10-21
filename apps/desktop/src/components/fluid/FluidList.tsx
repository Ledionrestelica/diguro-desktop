import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { useFluidHover } from './use-fluid-hover';
import { FluidHoverHighlight } from './fluid-hover-highlight';

/**
 * Fluid hover for a list: one highlight springs to the row nearest the
 * pointer instead of each row flashing its own hover fill. Rows anywhere
 * below opt in with `useFluidItem(key)`; keys keep their slot as rows mount
 * and unmount (a project expanding, a search filtering chats).
 *
 * Mark non-row areas inside the list (a section header and its "+") with
 * `data-fluid-ignore`: hovering them clears the highlight instead of lighting
 * the nearest row. The selected row (`data-fluid-selected`) already has its
 * own fill, so the highlight never slides onto it. A nested list (a submenu)
 * owns the moves inside it.
 */

type FluidContext = {
  register: (key: string, element: HTMLElement | null) => void;
  /** Light this row without the pointer (keyboard focus in a menu). */
  activate: (key: string) => void;
};

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
  const hover = useFluidHover(containerRef, { gapClick: false, isItemDisabled: isSelected });
  const slots = useRef(new Map<string, number>());
  const nextSlot = useRef(0);
  const { registerItem, setActiveIndex } = hover;

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
  const activate = useCallback(
    (key: string) => {
      const slot = slots.current.get(key);
      if (slot !== undefined) setActiveIndex(slot);
    },
    [setActiveIndex],
  );
  const value = useMemo(() => ({ register, activate }), [register, activate]);

  const { onMouseMove, onMouseLeave } = hover.handlers;
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target && target.closest('[data-fluid-list]') !== containerRef.current) return;
      if (target?.closest('[data-fluid-ignore], [data-fluid-selected]')) {
        onMouseLeave();
        return;
      }
      onMouseMove(e);
    },
    [onMouseMove, onMouseLeave],
  );

  // React bubbles events through portals, so moving from a row into the
  // dropdown it opened never counts as leaving the list and the highlight
  // stays stuck after the menu closes. The DOM's own mouseleave does fire.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('mouseleave', onMouseLeave);
    return () => container.removeEventListener('mouseleave', onMouseLeave);
  }, [onMouseLeave]);

  return (
    <div
      ref={containerRef}
      data-fluid-list=""
      className={cn('relative', className)}
      {...hover.handlers}
      onMouseMove={handleMouseMove}
    >
      <FluidHoverHighlight hover={hover} className={cn('rounded-[8px]', highlightClassName)} />
      <Context.Provider value={value}>{children}</Context.Provider>
    </div>
  );
}

const isSelected = (element: HTMLElement) => element.hasAttribute('data-fluid-selected');

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
  const activate = useCallback(() => {
    if (context && key) context.activate(key);
  }, [context, key]);
  return { ref, activate, fluid: Boolean(context && key) };
}
