import React, { useState, useEffect } from 'react';
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

  const [soap, setSoap] = useState<any>({ S: '', O: '', A: '', P: '' });
  const [diagnoses, setDiagnoses] = useState<{code: string, name: string, isNew: boolean}[]>([]);
  const [followUp, setFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  // Load existing note from backend if noteId exists
  const { data: existingNote, isLoading: isNoteLoading } = useQuery({
    queryKey: ['clinicalNote', noteId],
    queryFn: () => clinicalApi.getNote(noteId!),
    enabled: !!noteId && !isInitialized,
    retry: 1
  });

  useEffect(() => {
    if (patient && !isInitialized && consultationId === 'new') {
      setSoap({
        S: prevNote ? `Patient returns for follow-up. Previously: ${prevNote.title}.` : `Patient presents with primary complaints. Background: ${patient.riskFlags.join(', ') || 'None'}.`,
        O: `Vitals: BP ${patient.vitals?.bp} mmHg, HR ${patient.vitals?.hr} bpm, Temp ${patient.vitals?.temp}°C, SpO₂ ${patient.vitals?.spo2}%.`,
        A: '',
        P: '',
      });
      setDiagnoses(patient.riskFlags.map(f => ({ code: 'Z99.9', name: f, isNew: false })));
      setIsInitialized(true);
    }
  }, [patient, isInitialized, consultationId, prevNote]);

  useEffect(() => {
    if (existingNote && !isInitialized) {
      if (existingNote.draft_content) {
        try {
          const parsed = JSON.parse(existingNote.draft_content);
          setSoap(parsed.soap || { S: '', O: '', A: '', P: '' });
          setDiagnoses(parsed.diagnoses || []);
          setFollowUp(parsed.followUp || false);
          setFollowUpDate(parsed.followUpDate || '');
        } catch(e) {}
      } else if (patient && consultationId !== 'new') {
         setDiagnoses(patient.riskFlags.map(f => ({ code: 'Z99.9', name: f, isNew: false })));
      }
      setVersion(existingNote.__v || 1);
      if (existingNote.status === 'FINALIZED') {
        setSigned(true);
      }
      setIsInitialized(true);
    }
  }, [existingNote, isInitialized, patient, consultationId]);

  const debouncedState = useDebounce({ soap, diagnoses, followUp, followUpDate }, 1000);

  // Auto-save draft
  useEffect(() => {
    if (!isInitialized || signed || isNoteLoading || isPatientLoading) return;

    const saveDraft = async () => {
      try {
        const contentStr = JSON.stringify(debouncedState);
        if (!noteId) {
           // Create new note
           const res = await clinicalApi.createNote(patientId!, contentStr);
           setNoteId(res.noteId);
           setVersion(res.newVersion);
           // replace url
           window.history.replaceState(null, '', `/clinical/patient/${patientId}/note/${res.noteId}`);
        } else {
           const res = await clinicalApi.saveDraftNote(noteId, contentStr, version);
           setVersion(res.newVersion);
        }
      } catch (err: any) {
        if (err.response?.status === 409) {
          push('warning', 'Conflict Detected', 'Another session updated this draft. Please refresh.');
        } else if (err.response?.status === 422) {
          push('error', 'Encounter Error', err.response.data?.message || 'Failed to save');
        } else {
          console.error("Draft save failed", err);
        }
      }
    };

    saveDraft();
  }, [debouncedState]);

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!noteId) throw new Error("No note ID found");
      // First ensure the latest draft is saved, we don't strictly need to but good practice
      await clinicalApi.saveDraftNote(noteId, JSON.stringify({ soap, diagnoses, followUp, followUpDate }), version);
      // Wait for it to save then finalize with version+1
      return await clinicalApi.finalizeNote(noteId, version + 1);
    },
    onSuccess: () => {
      setSigned(true);
      queryClient.invalidateQueries({ queryKey: ['patientTimeline', patientId] });
      push('success', 'Note Finalized', 'The clinical note has been signed and safely transmitted to the ledger.');
      setTimeout(() => {
        navigate(`/clinical/patient/${patientId}/dossier`);
      }, 2000);
    },
    onError: (error: any) => {
      push('error', 'Transmission Failed', error.response?.data?.message || 'Could not commit note to backend. Please retry.');
    }
  });

  const handleSign = () => signMutation.mutate();
  const handleImportLabs = () => push('error', 'LIS Offline', 'Laboratory Information System (LIS) integration is pending.');

  const handleAddDiagnosis = (name: string) => {
    setDiagnoses(prev => [...prev, { code: 'I10', name, isNew: true }]);
    setDiagSearch('');
  };

  const handleRemoveDiagnosis = (index: number) => setDiagnoses(prev => prev.filter((_, i) => i !== index));

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
        <StatusChip variant={signed ? 'success' : 'error'} label={signed ? 'Signed & Locked' : 'Unsigned Draft'} />
      </div>

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
                    <input type="text" placeholder="e.g. Repeat HbA1c in 3 months" className="w-full border border-outline rounded-lg px-3 py-2 text-sm outline-none focus:border-tertiary" />
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
    </div>
  );
};
