import { createContext, useContext, useEffect } from 'react';

/**
 * Lets child pages register a "Save" action for the AdminLayout's sticky
 * top bar. Keeps the Save button in one place (consistent design) while
 * delegating its behavior per-page.
 */
export interface AdminSaveAction {
  label?: string;
  disabled?: boolean;
  pending?: boolean;
  onSave: () => void;
}

export interface AdminSaveContextValue {
  register: (action: AdminSaveAction | null) => void;
}

export const AdminSaveContext = createContext<AdminSaveContextValue | null>(null);

export function useAdminSave(action: AdminSaveAction | null): void {
  const ctx = useContext(AdminSaveContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.register(action);
    return () => ctx.register(null);
    // We deliberately re-register on every relevant change in the action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, action?.onSave, action?.disabled, action?.pending, action?.label]);
}
