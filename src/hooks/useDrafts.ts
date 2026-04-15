import { useQuery } from '@tanstack/react-query';
import { draftsApi, DraftConflictError } from '../api/drafts';

/**
 * Abstraction layer for draft persistence.
 * Completely decouples component logic from the underlying transport layer.
 */

// If a conflict is hit, we globally pause background network writes
// to strictly guarantee local keystrokes are preserved on screen.
let isAutosavePaused = false;

// Safe async hydration hook
export function useDraft<T>(key: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['draft', key],
    queryFn: () => draftsApi.getDraft<T>(key),
    staleTime: Infinity, // Avoid re-fetching existing drafts while user is editing
    enabled: options.enabled ?? true,
  });
}

// Imperative wrapper for lifecycle events (unmounts, saves, clear)
export const draftApi = {
  saveDraft: <T>(key: string, data: T): void => {
    if (isAutosavePaused) {
        console.warn(`Autosave completely halted for draft ${key} to preserve local conflict buffer.`);
        return;
    }

    draftsApi.saveDraft(key, data).catch(e => {
        if (e instanceof DraftConflictError || e.name === 'DraftConflictError') {
             isAutosavePaused = true;
             console.error(`DRAFT CONFLICT [409/412]: Local state acts as master. Network autosave frozen.`);

             const shouldReload = window.confirm(
               "⚠️ CLINICAL RECORD CONFLICT DETECTED\n\n" +
               "Another clinician has recently modified and saved this exact draft from another session.\n" +
               "Auto-save has been paused to protect your current work.\n\n" +
               "Press OK to immediately reload the server's version (losing your current unsaved edits).\n" +
               "Press Cancel to keep your current view frozen so you can manually copy/backup your notes."
             );

             if (shouldReload) {
               window.location.reload();
             } else {
               // Resume autosave so the user isn't permanently locked out.
               // Their local state is preserved; the next save attempt will
               // either succeed or re-trigger the conflict dialog.
               isAutosavePaused = false;
             }
        } else {
             console.error(`Failed to save draft for key ${key}`, e);
        }
    });
  },

  clearDraft: (key: string): void => {
    draftsApi.clearDraft(key).catch(e => console.error(`Failed to clear draft for key ${key}`, e));
  },

  resumeAutosave: () => {
    isAutosavePaused = false;
  }
};
