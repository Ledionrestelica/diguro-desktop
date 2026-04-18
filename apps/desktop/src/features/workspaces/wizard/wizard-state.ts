import { createContext, useContext } from 'react';

/**
 * Draft state for the 3-step new-workspace wizard. Lives in memory only —
 * closing the window discards it. Values accumulate as the user advances;
 * the final step 3 handler submits the real workspace creation mutation.
 */
export interface NewWorkspaceDraft {
  name: string;
  description: string;
  // Reserved for step 2 (branding).
  logoDataUrl?: string;
  primaryColor?: string;
}

export interface NewWorkspaceWizardContextValue {
  step: 1 | 2 | 3;
  draft: NewWorkspaceDraft;
  setDraft: (patch: Partial<NewWorkspaceDraft>) => void;
  goTo: (step: 1 | 2 | 3) => void;
  next: () => void;
  back: () => void;
  cancel: () => void;
}

export const NewWorkspaceWizardContext =
  createContext<NewWorkspaceWizardContextValue | null>(null);

export function useNewWorkspaceWizard(): NewWorkspaceWizardContextValue {
  const ctx = useContext(NewWorkspaceWizardContext);
  if (!ctx) {
    throw new Error('useNewWorkspaceWizard must be used inside <NewWorkspaceWizard>');
  }
  return ctx;
}
