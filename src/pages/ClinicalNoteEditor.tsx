import React, { useState, useEffect, useRef } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { Card, CardContent } from '../components/ui/Card';
import { StatusChip } from '../components/ui/StatusChip';
import { AuditMetadata } from '../components/ui/AuditMetadata';
import { PenTool, CheckCircle, Search, Mic, AlertTriangle, Activity, Calendar, Plus } from 'lucide-react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useToast, ToastContainer } from '../components/ui/Toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicalApi } from '../api/clinical';
import { usePatient, usePatientTimeline } from '../hooks/queries/usePatients';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

type Diagnosis = { code: string; name: string; isNew: boolean };
type NoteDraftPayload = {
  soap: { S: string; O: string; A: string; P: string };
  diagnoses: Diagnosis[];
  followUp: boolean;
  followUpDate: string;
  followUpInstructions: string;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

type ConflictState = {
  localDraft: string;
  serverDraft: string;
  updatedAt: string | null;
  localDraftApplied: boolean;
  recoveredFromBrowser: boolean;
};

const EMPTY_SOAP = { S: '', O: '', A: '', P: '' };

function parseDraftContent(rawContent?: string | null): NoteDraftPayload {
  if (!rawContent) {
    return {
      soap: { ...EMPTY_SOAP },
      diagnoses: [],
      followUp: false,
      followUpDate: '',
      followUpInstructions: '',
    };
  }

  try {
    const parsed = JSON.parse(rawContent);
    return {
      soap: parsed.soap || { ...EMPTY_SOAP },
      diagnoses: Array.isArray(parsed.diagnoses) ? parsed.diagnoses : [],
      followUp: Boolean(parsed.followUp),
      followUpDate: parsed.followUpDate || '',
      followUpInstructions: parsed.followUpInstructions || '',
    };
  } catch {
    return {
      soap: { ...EMPTY_SOAP },
      diagnoses: [],
      followUp: false,
      followUpDate: '',
      followUpInstructions: '',
    };
  }
}

function formatSaveTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return null;
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ClinicalNoteEditor = () => {
  const { patientId, consultationId } = useParams<{ patientId: string; consultationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toasts, push, dismiss } = useToast();

  const { data: patient, isLoading: isPatientLoading } = usePatient(patientId!);
  const { data: timeline } = usePatientTimeline(patientId!);
  
  const prevNote = timeline?.find((t: any) => t.type === 'consultation');

  const [noteId, setNoteId] = useState<string | null>(consultationId !== 'new' ? consultationId! : null);
  const [version, setVersion] = useState<number>(1);
  const [signed, setSigned] = useState(false);
  const [diagSearch, setDiagSearch] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [conflictState, setConflictState] = useState<ConflictState | null>(null);
  const [showSignConfirm, setShowSignConfirm] = useState(false);

  const [soap, setSoap] = useState<any>({ S: '', O: '', A: '', P: '' });
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [followUp, setFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const noteIdRef = useRef<string | null>(noteId);
  const versionRef = useRef<number>(version);
  const lastSavedDraftRef = useRef<string | null>(null);
  const recoveryDraftStorageKeyRef = useRef<string>('');
  const isSaveInFlightRef = useRef(false);
  const pendingSaveContentRef = useRef<string | null>(null);

  // Load existing note from backend if noteId exists
  const { data: existingNote, isLoading: isNoteLoading } = useQuery({
    queryKey: ['clinicalNote', noteId],
    queryFn: () => clinicalApi.getNote(noteId!),
    enabled: !!noteId && !isInitialized,
    retry: 1
  });

  useEffect(() => {
    noteIdRef.current = noteId;
  }, [noteId]);

  useEffect(() => {
    versionRef.current = version;
  }, [version]);

  const applyDraftPayload = (draft: NoteDraftPayload) => {
    setSoap(draft.soap);
    setDiagnoses(draft.diagnoses);
    setFollowUp(draft.followUp);
    setFollowUpDate(draft.followUpDate);
    setFollowUpInstructions(draft.followUpInstructions);
  };

  const buildDraftPayload = (): NoteDraftPayload => ({
    soap,
    diagnoses,
    followUp,
    followUpDate,
    followUpInstructions,
  });

  const serializeDraftPayload = (payload: NoteDraftPayload = buildDraftPayload()) => JSON.stringify(payload);

  const persistRecoverableDraft = (draftContent: string, reason: 'conflict' | 'save_failed') => {
    const storageKey = recoveryDraftStorageKeyRef.current;
    if (!storageKey) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        draftContent,
        reason,
        noteId: noteIdRef.current,
        patientId,
        storedAt: new Date().toISOString(),
      }));
    } catch {
      // Best-effort local recovery only.
    }
  };

  const clearRecoverableDraft = () => {
    const storageKey = recoveryDraftStorageKeyRef.current;
    if (!storageKey) {
      return;
    }

    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage cleanup failures.
    }
  };

  const resolveConflictFromLatest = (latest: any, localDraft: string, recoveredFromBrowser = false) => {
    const latestDraft = latest?.draft_content || '';
    applyDraftPayload(parseDraftContent(latestDraft));
    if (latest?.id) {
      setNoteId(latest.id);
      noteIdRef.current = latest.id;
    }
    if (Number.isInteger(latest?.__v)) {
      setVersion(latest.__v);
      versionRef.current = latest.__v;
    }
    if (latest?.status === 'FINALIZED') {
      setSigned(true);
    }
    lastSavedDraftRef.current = latestDraft;
    setLastSavedAt(latest?.updated_at || latest?.created_at || new Date().toISOString());
    setSaveError('Another session changed this note. Review the latest server version before saving again.');
    setSaveState('conflict');
    setConflictState({
      localDraft,
      serverDraft: latestDraft,
      updatedAt: latest?.updated_at || latest?.created_at || null,
      localDraftApplied: false,
      recoveredFromBrowser,
    });
    persistRecoverableDraft(localDraft, 'conflict');
  };

  useEffect(() => {
    if (patient && !isInitialized && consultationId === 'new') {
      const seededDiagnoses = patient.riskFlags.map((flag) => ({ code: 'Z99.9', name: flag, isNew: false }));
      const initialSoap = {
        S: prevNote ? `Patient returns for follow-up. Previously: ${prevNote.title}.` : `Patient presents with primary complaints. Background: ${patient.riskFlags.join(', ') || 'None'}.`,
        O: `Vitals: BP ${patient.vitals?.bp} mmHg, HR ${patient.vitals?.hr} bpm, Temp ${patient.vitals?.temp}°C, SpO₂ ${patient.vitals?.spo2}%.`,
        A: '',
        P: '',
      };
      const unsavedDraft = {
        soap: initialSoap,
        diagnoses: seededDiagnoses,
        followUp: false,
        followUpDate: '',
        followUpInstructions: '',
      };
      applyDraftPayload(unsavedDraft);
      lastSavedDraftRef.current = serializeDraftPayload(unsavedDraft);
      recoveryDraftStorageKeyRef.current = `cc-note-recovery:${patientId}:new`;
      setLastSavedAt(null);
      setSaveState('idle');
      setIsInitialized(true);
    }
  }, [patient, isInitialized, consultationId, prevNote, patientId]);

  useEffect(() => {
    if (existingNote && !isInitialized) {
      const parsedDraft = existingNote.draft_content
        ? parseDraftContent(existingNote.draft_content)
        : {
            soap: { ...EMPTY_SOAP },
            diagnoses: patient && consultationId !== 'new'
              ? patient.riskFlags.map((flag) => ({ code: 'Z99.9', name: flag, isNew: false }))
              : [],
            followUp: false,
            followUpDate: '',
            followUpInstructions: '',
          };

      applyDraftPayload(parsedDraft);
      setVersion(existingNote.__v || 1);
      versionRef.current = existingNote.__v || 1;
      noteIdRef.current = existingNote.id || noteIdRef.current;
      recoveryDraftStorageKeyRef.current = `cc-note-recovery:${patientId}:${existingNote.id || noteIdRef.current || 'existing'}`;
      lastSavedDraftRef.current = existingNote.draft_content || serializeDraftPayload(parsedDraft);
      setLastSavedAt(existingNote.updated_at || existingNote.created_at || null);
      setSaveState('saved');
      if (existingNote.status === 'FINALIZED') {
        setSigned(true);
      }
      setIsInitialized(true);
    }
  }, [existingNote, isInitialized, patient, consultationId]);

  const debouncedState = useDebounce(buildDraftPayload(), 1000);

  useEffect(() => {
    if (!isInitialized || conflictState || !recoveryDraftStorageKeyRef.current) {
      return;
    }

    try {
      const stored = window.localStorage.getItem(recoveryDraftStorageKeyRef.current);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored);
      if (parsed?.reason !== 'conflict' || typeof parsed?.draftContent !== 'string') {
        return;
      }

      resolveConflictFromLatest({
        id: noteIdRef.current,
        draft_content: lastSavedDraftRef.current || '',
        updated_at: lastSavedAt,
        __v: versionRef.current,
        status: signed ? 'FINALIZED' : 'DRAFT',
      }, parsed.draftContent, true);
    } catch {
      // Ignore malformed local recovery data.
    }
  }, [conflictState, isInitialized, lastSavedAt, signed]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isInitialized || signed) {
        return;
      }

      const hasUnsavedDraft = serializeDraftPayload() !== (lastSavedDraftRef.current || '');
      if (!hasUnsavedDraft && saveState !== 'saving' && saveState !== 'error' && saveState !== 'conflict') {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [soap, diagnoses, followUp, followUpDate, followUpInstructions, isInitialized, saveState, signed]);

  // Serialized auto-save: only one save request in flight at a time.
  // If a new save is needed while one is in-flight, it is queued and
  // fires after the current one resolves, using the latest version.
  const executeSave = async (contentStr: string) => {
    if (isSaveInFlightRef.current) {
      pendingSaveContentRef.current = contentStr;
      return;
    }

    isSaveInFlightRef.current = true;
    setSaveState('saving');
    setSaveError(null);

    try {
      if (!noteIdRef.current) {
        const res = await clinicalApi.createNote(patientId!, contentStr);
        noteIdRef.current = res.noteId;
        versionRef.current = res.newVersion;
        lastSavedDraftRef.current = contentStr;
        setNoteId(res.noteId);
        setVersion(res.newVersion);
        recoveryDraftStorageKeyRef.current = `cc-note-recovery:${patientId}:${res.noteId}`;
        window.history.replaceState(null, '', `/clinical/patient/${patientId}/note/${res.noteId}`);
      } else {
        const res = await clinicalApi.saveDraftNote(noteIdRef.current, contentStr, versionRef.current);
        versionRef.current = res.newVersion;
        lastSavedDraftRef.current = contentStr;
        setVersion(res.newVersion);
      }
      clearRecoverableDraft();
      setConflictState(null);
      setLastSavedAt(new Date().toISOString());
      setSaveState('saved');
    } catch (err: any) {
      if (err.response?.status === 409) {
        resolveConflictFromLatest(
          err.response?.data?.error?.details?.latest,
          contentStr
        );
      } else {
        const message = err.response?.data?.error?.message || err.response?.data?.message || 'Autosave failed. Your local draft is still in this browser.';
        setSaveState('error');
        setSaveError(message);
        persistRecoverableDraft(contentStr, 'save_failed');
      }
    } finally {
      isSaveInFlightRef.current = false;
      // Drain queued save if one arrived while this save was in flight.
      const queued = pendingSaveContentRef.current;
      if (queued) {
        pendingSaveContentRef.current = null;
        executeSave(queued);
      }
    }
  };

  // Auto-save draft
  useEffect(() => {
    if (!isInitialized || signed || isNoteLoading || isPatientLoading || conflictState) return;

    const contentStr = serializeDraftPayload(debouncedState);
    if (noteIdRef.current && lastSavedDraftRef.current === contentStr) {
      if (saveState === 'saving') {
        setSaveState('saved');
      }
      return;
    }

    executeSave(contentStr);
  }, [debouncedState, conflictState, isInitialized, isNoteLoading, isPatientLoading, patientId, saveState, signed]);

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!noteId) throw new Error("No note ID found");
      const saveResult = await clinicalApi.saveDraftNote(noteId, serializeDraftPayload(), version);
      setVersion(saveResult.newVersion);
      return await clinicalApi.finalizeNote(noteId, saveResult.newVersion);
    },
    onSuccess: () => {
      setSigned(true);
      clearRecoverableDraft();
      setConflictState(null);
      setLastSavedAt(new Date().toISOString());
      setSaveState('saved');
      queryClient.invalidateQueries({ queryKey: ['patientTimeline', patientId] });
      push('success', 'Note Finalized', 'The clinical note has been signed and safely transmitted to the ledger.');
      setTimeout(() => {
        navigate(`/clinical/patient/${patientId}/dossier`);
      }, 2000);
    },
    onError: (error: any) => {
      if (error.response?.status === 409) {
        resolveConflictFromLatest(
          error.response?.data?.error?.details?.latest,
          serializeDraftPayload()
        );
        return;
      }

      const message = error.response?.data?.error?.message || error.response?.data?.message || 'Could not commit note to backend. Please retry.';
      setSaveState('error');
      setSaveError(message);
      persistRecoverableDraft(serializeDraftPayload(), 'save_failed');
      push('error', 'Transmission Failed', message);
    }
  });

  const handleSign = () => setShowSignConfirm(true);
  const handleConfirmSign = () => {
    setShowSignConfirm(false);
    signMutation.mutate();
  };
  const handleImportLabs = () => push('error', 'LIS Offline', 'Laboratory Information System (LIS) integration is pending.');

  const handleAddDiagnosis = (name: string) => {
    setDiagnoses(prev => [...prev, { code: 'I10', name, isNew: true }]);
    setDiagSearch('');
  };

  const handleRemoveDiagnosis = (index: number) => setDiagnoses(prev => prev.filter((_, i) => i !== index));

  const handleCopyLocalDraft = async () => {
    if (!conflictState?.localDraft) {
      return;
    }

    try {
      await navigator.clipboard.writeText(conflictState.localDraft);
      push('success', 'Draft Copied', 'Your unsaved local draft has been copied to the clipboard.');
    } catch {
      push('error', 'Copy Failed', 'Clipboard access was unavailable. The local draft is still preserved in this browser.');
    }
  };

  const handleLoadServerVersion = () => {
    if (!conflictState) {
      return;
    }

    applyDraftPayload(parseDraftContent(conflictState.serverDraft));
    lastSavedDraftRef.current = conflictState.serverDraft;
    setConflictState((current) => current ? { ...current, localDraftApplied: false } : current);
    setSaveState('conflict');
  };

  const handleReapplyLocalDraft = () => {
    if (!conflictState) {
      return;
    }

    applyDraftPayload(parseDraftContent(conflictState.localDraft));
    setConflictState((current) => current ? { ...current, localDraftApplied: true } : current);
    setSaveState('idle');
    setSaveError(null);
  };

  const formattedSavedAt = formatSaveTimestamp(lastSavedAt);
  const saveStatusLabel = saveState === 'saving'
    ? 'Saving...'
    : saveState === 'saved'
      ? `Saved at ${formattedSavedAt || 'just now'}`
      : saveState === 'conflict'
        ? 'Conflict requires review'
        : saveState === 'error'
          ? 'Save failed'
          : 'Draft not yet saved';

  const saveStatusClass = saveState === 'saved'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : saveState === 'saving'
      ? 'border-primary/20 bg-primary/5 text-primary'
      : saveState === 'conflict'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : saveState === 'error'
          ? 'border-error/20 bg-error/10 text-error'
          : 'border-outline/40 bg-surface-container-low text-on-surface-variant';

  if (isPatientLoading || (!isInitialized && isNoteLoading)) {
    return (
      <div className="absolute inset-0 bg-surface/60 z-50 flex items-start justify-center backdrop-blur-sm rounded-xl py-20">
         <div className="bg-white p-4 rounded-xl shadow-lg border border-outline/20 font-bold text-primary animate-pulse">
           Restoring clinical context...
         </div>
      </div>
    );
  }

  if (!patient) {
     return <div className="p-10 text-center text-error font-bold">Patient record not found.</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24 relative">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 text-sm font-medium flex-wrap">
          <Link to="/clinical/command-center" className="text-on-surface-variant hover:text-primary transition-colors">
            Command Center
          </Link>
          <span className="text-on-surface-variant">/</span>
          <Link to={`/clinical/patient/${patient.id}/dossier`} className="text-primary hover:underline">
            {patient.name}
          </Link>
          <span className="text-on-surface-variant">/</span>
          <span className="text-on-surface font-semibold">
            {consultationId === 'new' && !noteId ? 'New Encounter' : `Note #${noteId}`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${saveStatusClass}`}>
            {saveStatusLabel}
          </div>
          <StatusChip variant={signed ? 'success' : 'error'} label={signed ? 'Signed & Locked' : 'Unsigned Draft'} />
        </div>
      </div>

      {conflictState && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-bold">Another session updated this note.</p>
              <p className="mt-1 text-xs text-amber-800">
                {conflictState.recoveredFromBrowser
                  ? 'A recoverable local draft from this browser was restored after refresh.'
                  : 'The latest server version is loaded below so you can safely review before saving again.'}
              </p>
              {conflictState.updatedAt && (
                <p className="mt-1 text-xs text-amber-800">
                  Latest server save: {new Date(conflictState.updatedAt).toLocaleString('en-IN')}
                </p>
              )}
              <p className="mt-2 text-xs text-amber-800">
                {conflictState.localDraftApplied
                  ? 'Your local draft has been re-applied to the editor. Review it, then wait for a fresh save confirmation.'
                  : 'Your unsaved local draft is preserved here and can be copied or re-applied.'}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleCopyLocalDraft}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
              >
                Copy Local Draft
              </button>
              <button
                type="button"
                onClick={handleLoadServerVersion}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
              >
                Load Server Version
              </button>
              <button
                type="button"
                onClick={handleReapplyLocalDraft}
                className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800"
              >
                Reapply Local Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {saveState === 'error' && saveError && !conflictState && (
        <div className="rounded-xl border border-error/20 bg-error/10 p-4 text-sm text-error">
          <p className="font-bold">Autosave failed</p>
          <p className="mt-1 text-xs">{saveError}</p>
          <p className="mt-2 text-xs">Your local draft is still in this browser. Keep this tab open until the save state returns to “Saved”.</p>
        </div>
      )}

      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 text-primary font-bold rounded-full flex items-center justify-center text-sm">
            {patient.initials}
          </div>
          <div>
            <p className="font-bold text-on-surface text-sm">{patient.name}</p>
            <p className="text-xs text-on-surface-variant">{patient.mrn} · {patient.age}Y / {patient.gender} · {patient.bloodGroup}</p>
          </div>
        </div>
        <div className="flex items-center gap-5 text-xs text-on-surface-variant font-medium flex-wrap">
          <span className="flex items-center gap-1"><Activity size={13} /> BP {patient.vitals?.bp}</span>
          <span className="flex items-center gap-1"><Activity size={13} /> HR {patient.vitals?.hr}</span>
          <span>SpO₂ {patient.vitals?.spo2}%</span>
          <span>Temp {patient.vitals?.temp}°C</span>
        </div>
        {patient.allergies?.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-error font-bold">
            <AlertTriangle size={13} />
            {patient.allergies.map(a => `${a.substance} (${a.severity})`).join(' · ')}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="lg:col-span-2 space-y-5">
          <ErrorBoundary moduleName="Clinical Documentation Editor">
          <Card>
            <CardContent className="space-y-5">
              {([
                { key: 'S', label: 'Subjective (S)', color: 'border-l-primary', hint: 'Chief complaint in patient\'s own words' },
                { key: 'O', label: 'Objective (O)', color: 'border-l-primary/60', hint: 'Examination findings, vitals, labs' },
                { key: 'A', label: 'Assessment (A)', color: 'border-l-secondary/70', hint: 'Diagnosis or differential' },
                { key: 'P', label: 'Plan (P)', color: 'border-l-tertiary/70', hint: 'Treatment, referrals, follow-up' },
              ] as const).map(({ key, label, color, hint }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <label className="text-sm font-bold text-on-surface">{label}</label>
                      <span className="text-xs text-on-surface-variant ml-2">{hint}</span>
                    </div>
                    {key === 'S' && (
                      <button 
                        onClick={() => push('warning', 'Hardware Error', 'Voice dictation requires an active microphone connection.')}
                        className="p-1.5 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors"
                      >
                        <Mic size={13} />
                      </button>
                    )}
                    {key === 'O' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSoap((s: any) => ({ ...s, O: `Vitals: BP ${patient.vitals?.bp} mmHg, HR ${patient.vitals?.hr} bpm, Temp ${patient.vitals?.temp}°C, SpO₂ ${patient.vitals?.spo2}%.` }))}
                          className="text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/20 px-2 py-1 rounded bg-primary/5 hover:bg-primary/10 transition-colors"
                        >
                          Import Vitals
                        </button>
                        <button 
                          onClick={handleImportLabs}
                          className="text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/20 px-2 py-1 rounded bg-primary/5 hover:bg-primary/10 transition-colors"
                        >
                          Import Labs
                        </button>
                      </div>
                    )}
                  </div>
                  <textarea
                    disabled={signed}
                    value={soap[key]}
                    onChange={e => setSoap((s: any) => ({ ...s, [key]: e.target.value }))}
                    placeholder={`Enter ${label.split(' ')[0]} notes…`}
                    className={`w-full bg-surface-container border border-outline border-l-4 ${color} rounded-lg p-3 text-sm min-h-24 outline-none focus:ring-1 focus:ring-primary resize-none transition-colors ${signed ? 'opacity-60 cursor-not-allowed' : ''}`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-tertiary/20">
            <CardContent>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold flex items-center gap-2 text-on-surface">
                  <Calendar size={16} className="text-tertiary" /> Request Follow-up
                </h3>
                <button
                  onClick={() => setFollowUp((f: boolean) => !f)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
                    followUp ? 'bg-tertiary text-white' : 'bg-gray-100 text-on-surface-variant hover:bg-gray-200'
                  }`}
                >
                  {followUp ? 'Scheduled' : 'Add Follow-up'}
                </button>
              </div>
              {followUp && (
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-on-surface-variant uppercase mb-1 block">Follow-up Date</label>
                    <input
                      type="date"
                      value={followUpDate}
                      onChange={e => setFollowUpDate(e.target.value)}
                      className="w-full border border-outline rounded-lg px-3 py-2 text-sm outline-none focus:border-tertiary"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-bold text-on-surface-variant uppercase mb-1 block">Instructions</label>
                    <input
                      type="text"
                      value={followUpInstructions}
                      onChange={e => setFollowUpInstructions(e.target.value)}
                      placeholder="e.g. Repeat HbA1c in 3 months"
                      className="w-full border border-outline rounded-lg px-3 py-2 text-sm outline-none focus:border-tertiary"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          </ErrorBoundary>
        </div>

        <div className="lg:col-span-1 space-y-5">
          <ErrorBoundary moduleName="ICD-10 Diagnostic Engine">
          <Card>
            <div className="p-4 border-b border-outline/20">
              <h2 className="text-sm font-bold mb-2">ICD-10 Diagnoses</h2>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-on-surface-variant" />
                <input
                  type="text"
                  placeholder="Search conditions..."
                  disabled={signed}
                  value={diagSearch}
                  onChange={e => setDiagSearch(e.target.value)}
                  className="w-full text-sm py-2 pl-8 pr-3 bg-surface-container border border-outline rounded-lg outline-none focus:border-primary"
                />
                {!signed && diagSearch.length > 2 && (
                  <div className="absolute top-full left-0 right-0 z-10 bg-white border border-outline rounded-lg shadow-xl mt-1 overflow-hidden">
                    {['Essential Hypertension', 'Type 2 Diabetes', 'Hyperlipidemia'].filter(x => x.toLowerCase().includes(diagSearch.toLowerCase())).map(x => (
                      <button 
                        key={x}
                        onClick={() => handleAddDiagnosis(x)}
                        className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-primary/5 flex items-center justify-between group"
                      >
                        {x}
                        <Plus size={12} className="opacity-0 group-hover:opacity-100 text-primary" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <CardContent className="p-4 space-y-3">
              {diagnoses.length === 0 ? (
                <p className="text-[10px] text-on-surface-variant italic text-center py-2">No diagnoses recorded.</p>
              ) : (
                diagnoses.map((diag, i) => (
                  <div key={i} className="flex items-center justify-between bg-surface shadow-sm border border-outline p-2 rounded-lg">
                    <div>
                      <span className={`text-[10px] font-bold block ${diag.isNew ? 'text-secondary' : 'text-primary'}`}>
                        {diag.isNew ? 'NEW' : 'PRE-EXISTING'} · {diag.code}
                      </span>
                      <span className="text-xs font-semibold">{diag.name}</span>
                    </div>
                    {!signed && (
                      <button 
                        onClick={() => handleRemoveDiagnosis(i)}
                        className="text-error font-bold text-[10px] uppercase tracking-wider hover:bg-error/5 p-1 rounded transition-colors"
                      >
                        Rev
                      </button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {prevNote && (
            <Card className="bg-surface-container-low">
              <CardContent className="p-4">
                <h3 className="text-xs font-bold text-on-surface-variant uppercase mb-2 tracking-widest">Last Encounter</h3>
                <p className="text-xs font-bold text-on-surface">{prevNote.title}</p>
                <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{prevNote.summary}</p>
                <AuditMetadata lastModifiedDate={prevNote.date} verifiedBy={prevNote.verifiedBy} />
              </CardContent>
            </Card>
          )}

          {signed ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center space-y-2">
              <CheckCircle size={32} className="text-emerald-600 mx-auto" />
              <p className="font-bold text-emerald-800">Note Signed & Locked</p>
              <p className="text-xs text-emerald-700">Redirecting to patient dossier…</p>
            </div>
          ) : (
            <Card className="border-2 border-primary/20 bg-primary/5">
              <CardContent className="space-y-4">
                <h2 className="text-sm font-bold text-on-surface flex items-center gap-2">
                  <PenTool size={16} className="text-primary" /> Physician Sign-off
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Signing finalizes this note and appends it to {patient.name}'s longitudinal record. This action cannot be undone.
                </p>
                <button
                  onClick={handleSign}
                  disabled={signMutation.isPending || !noteId}
                  className={`w-full text-white py-3 rounded-lg text-sm font-bold shadow-sm shadow-primary/20 transition-all flex justify-center items-center gap-2 ${
                    signMutation.isPending || !noteId ? 'bg-primary/50 animate-pulse' : 'bg-primary hover:brightness-110'
                  }`}
                >
                  <CheckCircle size={18} /> {signMutation.isPending ? 'Committing...' : 'Sign & Lock Note'}
                </button>
                <div className="text-center">
                  <Link
                    to={`/clinical/patient/${patient.id}/dossier`}
                    className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest hover:text-on-surface"
                  >
                    Save as Draft & Return
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
          </ErrorBoundary>
        </div>
      </div>

      {showSignConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-extrabold text-on-surface">Finalize Clinical Note</h3>
            <p className="mt-3 text-sm text-on-surface-variant">
              Are you sure? This will permanently lock this clinical note.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowSignConfirm(false)}
                className="flex-1 rounded-xl border border-outline px-4 py-3 text-sm font-bold text-on-surface hover:bg-surface-container-low"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSign}
                disabled={signMutation.isPending}
                className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
