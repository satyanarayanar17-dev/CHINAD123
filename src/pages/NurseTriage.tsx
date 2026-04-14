import React, { useState, useEffect } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { StatusChip } from '../components/ui/StatusChip';
import { Activity, Thermometer, AlertCircle, Save, Trash2 } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast, ToastContainer } from '../components/ui/Toast';
import { useLiveQueue } from '../hooks/queries/useLiveQueue';
import { useNotifications } from '../hooks/queries/useNotifications';
import { useDraft, draftApi } from '../hooks/useDrafts';
import { usePatient } from '../hooks/queries/usePatients';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

export const NurseTriage = () => {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { toasts, push, dismiss } = useToast();
  const { queue, addSlot } = useLiveQueue();
  // Using notifications context for reading, removed fake inject
  const { notifications } = useNotifications();

  const { data: registryPatient, isLoading: isPatientLoading } = usePatient(patientId);
  const draftKey = `cc_triage_draft_${patientId}`;

  // State Initialization
  const [height, setHeight] = useState(175);
  const [weight, setWeight] = useState(registryPatient ? 82 : 70);
  const [systolic, setSystolic] = useState(registryPatient ? Number(registryPatient.vitals.bp.split('/')[0]) : 120);
  const [diastolic, setDiastolic] = useState(registryPatient ? Number(registryPatient.vitals.bp.split('/')[1]) : 80);
  const [hr, setHr] = useState(registryPatient ? registryPatient.vitals.hr : 72);
  const [temp, setTemp] = useState(registryPatient ? registryPatient.vitals.temp : 37.0);
  const [spo2, setSpo2] = useState(registryPatient ? registryPatient.vitals.spo2 : 99);
  const [complaint, setComplaint] = useState(registryPatient
    ? `${registryPatient.name} presented with primary complaints. Pre-existing conditions: ${registryPatient.riskFlags.join(', ') || 'None'}.`
    : '');

  const hasHydratedFromPatient = React.useRef(false);
  const { data: draft, isLoading: isDraftLoading } = useDraft<any>(draftKey);

  // Sync vitals from patient data once it loads (initial state race fix).
  // Guard with hasHydratedFromPatient so user edits are not overwritten.
  useEffect(() => {
    if (registryPatient && !hasHydratedFromPatient.current && !isDraftLoading) {
      hasHydratedFromPatient.current = true;
      setWeight(82);
      setSystolic(Number(registryPatient.vitals.bp.split('/')[0]) || 120);
      setDiastolic(Number(registryPatient.vitals.bp.split('/')[1]) || 80);
      setHr(registryPatient.vitals.hr || 72);
      setTemp(registryPatient.vitals.temp || 37.0);
      setSpo2(registryPatient.vitals.spo2 || 99);
      setComplaint(`${registryPatient.name} presented with primary complaints. Pre-existing conditions: ${registryPatient.riskFlags.join(', ') || 'None'}.`);
    }
  }, [registryPatient, isDraftLoading]);

  useEffect(() => {
    if (draft && !isDraftLoading) {
      if (draft.height) setHeight(draft.height);
      if (draft.weight) setWeight(draft.weight);
      if (draft.systolic) setSystolic(draft.systolic);
      if (draft.diastolic) setDiastolic(draft.diastolic);
      if (draft.hr) setHr(draft.hr);
      if (draft.temp) setTemp(draft.temp);
      if (draft.spo2) setSpo2(draft.spo2);
      if (draft.complaint) setComplaint(draft.complaint);
    }
  }, [draft, isDraftLoading]);

  // Save draft
  const debouncedDraft = useDebounce({ height, weight, systolic, diastolic, hr, temp, spo2, complaint }, 1000);

  useEffect(() => {
    if (!isDraftLoading) {
      draftApi.saveDraft(draftKey, debouncedDraft);
    }
  }, [debouncedDraft, draftKey, isDraftLoading]);

  // Derived metrics
  const bmi = (weight / Math.pow(height / 100, 2)).toFixed(1);
  const bmiNum = Number(bmi);
  const isHypertensive = systolic > 130 || diastolic > 85;
  const isTachycardic = hr > 100;
  const isFeverish = temp > 37.5;

  // EWS scoring (simplified)
  let ewsScore = 0;
  if (systolic < 90 || systolic > 150) ewsScore += 2;
  else if (systolic > 130) ewsScore += 1;
  if (hr > 110 || hr < 50) ewsScore += 2;
  else if (hr > 100) ewsScore += 1;
  if (temp > 38.5 || temp < 35.0) ewsScore += 2;
  else if (temp > 37.5) ewsScore += 1;
  if (spo2 < 92) ewsScore += 2;
  else if (spo2 < 95) ewsScore += 1;

  const ewsLevel = ewsScore >= 6 ? 'L2' : ewsScore >= 3 ? 'L3' : ewsScore >= 1 ? 'L4' : 'L5';
  const ewsLabel = ewsScore >= 6 ? 'Emergent' : ewsScore >= 3 ? 'Urgent' : ewsScore >= 1 ? 'Less Urgent' : 'Non-Urgent';
  const ewsColor = ewsScore >= 6 ? 'bg-error' : ewsScore >= 3 ? 'bg-tertiary' : 'bg-primary';
  const ewsWarnings = [
    isHypertensive && 'Elevated Blood Pressure',
    isTachycardic && 'Tachycardia',
    isFeverish && 'Low-Grade Fever',
    bmiNum > 30 && 'Obese BMI',
    registryPatient && registryPatient.riskFlags.length > 0 && `Registry Risk Flags: ${registryPatient.riskFlags.join(', ')}`,
  ].filter(Boolean);

  const handlePromote = () => {
    if (registryPatient) {
      draftApi.clearDraft(draftKey);
      
      const alreadyInQueue = queue.find((s: any) => s.patient.id === registryPatient.id);
      
      if (!alreadyInQueue) {
        const newSlot = {
          id: `queue-${Date.now()}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: 'ON_TIME',
          patient: registryPatient,
          type: 'Nurse Triage Priority',
          specialty: 'General Medicine',
          lifecycleStatus: 'RECEPTION',
          __v: 0
        };
        addSlot(newSlot as any);
      }

      push('success', 'Patient Pushed', `Finalized & notified doctor about ${registryPatient.name}.`);
      setTimeout(() => {
        navigate(`/clinical/patient/${registryPatient.id}/dossier`);
      }, 1500);
    }
  };

  const handleDiscard = () => {
    draftApi.clearDraft(draftKey);
    push('warning', 'Session Discarded', 'Triage data has been cleared. Returning to dashboard...');
    setTimeout(() => {
      navigate('/clinical/command-center');
    }, 1500);
  };

  const displayName = registryPatient
    ? registryPatient.name
    : patientId === 'new'
    ? 'Walk-in Patient'
    : (patientId ?? 'Unknown');

  return (
    <div className="space-y-6 max-w-5xl mx-auto relative">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      
      {isDraftLoading && (
        <div className="absolute inset-0 bg-surface/60 z-50 flex items-start justify-center backdrop-blur-sm rounded-xl py-20 pointer-events-none">
           <div className="bg-white p-4 rounded-xl shadow-lg border border-outline/20 font-bold text-primary animate-pulse pointer-events-auto">
             Restoring session...
           </div>
        </div>
      )}

      {/* Sticky Action Bar */}
      <div className="flex justify-between items-center bg-surface p-4 rounded-xl shadow-sm border border-outline/30 sticky top-24 z-10">
        <div>
          <h3 className="text-primary font-bold text-xs uppercase tracking-widest">Nurse Pre-check</h3>
          <h1 className="text-xl font-bold text-on-surface">{displayName}</h1>
          {registryPatient && (
            <p className="text-xs text-on-surface-variant mt-0.5">MRN: {registryPatient.mrn}</p>
          )}
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleDiscard}
            className="px-4 py-2 border border-outline font-bold text-sm rounded-lg hover:bg-surface-container transition-colors flex items-center gap-2"
          >
            <Trash2 size={16} /> Discard
          </button>
          <button
            onClick={handlePromote}
            className="px-4 py-2 bg-primary text-white font-bold text-sm rounded-lg flex items-center gap-2 hover:brightness-110 transition-colors shadow-sm shadow-primary/20"
          >
            <Save size={16} /> Push to Doctor
          </button>
        </div>
      </div>

      {/* Registry Allergy Banner */}
      {registryPatient && registryPatient.allergies.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-error text-white rounded-lg text-sm font-semibold">
          <AlertCircle size={18} className="shrink-0" />
          <span>
            {registryPatient.allergies.map(a => `${a.substance} (${a.severity})`).join(' · ')}
            <span className="opacity-75 ml-2 font-normal text-xs">— Registry Alert</span>
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Biometric Intake */}
        <ErrorBoundary moduleName="Biometric Intake Form">
        <Card>
          <CardHeader>Biometric Intake</CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-on-surface-variant block mb-1">Height (cm)</label>
                <input
                  type="number"
                  value={height}
                  onChange={e => setHeight(Number(e.target.value))}
                  className="w-full bg-surface-container border border-outline rounded-lg p-2 font-semibold outline-none focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-on-surface-variant block mb-1">Weight (kg)</label>
                <input
                  type="number"
                  value={weight}
                  onChange={e => setWeight(Number(e.target.value))}
                  className="w-full bg-surface-container border border-outline rounded-lg p-2 font-semibold outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div className="p-3 bg-surface-container-low rounded-lg border border-outline/30 flex justify-between items-center">
              <span className="text-sm font-semibold">Calculated BMI</span>
              <StatusChip
                variant={bmiNum >= 30 ? 'error' : bmiNum >= 25 ? 'secondary' : 'success'}
                label={`${bmi} kg/m²`}
              />
            </div>

            <hr className="border-outline/20" />

            <div>
              <label className="text-xs font-bold text-on-surface-variant block mb-1">Blood Pressure (mmHg)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={systolic}
                  onChange={e => setSystolic(Number(e.target.value))}
                  className={`w-full bg-surface-container border rounded-lg p-2 font-semibold outline-none transition-colors ${isHypertensive ? 'border-amber-400 text-amber-700' : 'border-outline focus:border-primary'}`}
                />
                <span className="text-xl text-on-surface-variant">/</span>
                <input
                  type="number"
                  value={diastolic}
                  onChange={e => setDiastolic(Number(e.target.value))}
                  className={`w-full bg-surface-container border rounded-lg p-2 font-semibold outline-none transition-colors ${isHypertensive ? 'border-amber-400 text-amber-700' : 'border-outline focus:border-primary'}`}
                />
              </div>
              {isHypertensive && (
                <p className="text-[11px] text-amber-600 font-bold mt-1 flex items-center gap-1">
                  <AlertCircle size={12} /> Hypertensive range detected
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-on-surface-variant block mb-1">HR (bpm)</label>
                <div className="relative">
                  <Activity className="absolute left-2 top-2.5 text-on-surface-variant" size={15} />
                  <input
                    type="number"
                    value={hr}
                    onChange={e => setHr(Number(e.target.value))}
                    className={`w-full pl-7 bg-surface-container border rounded-lg p-2 font-semibold outline-none transition-colors ${isTachycardic ? 'border-amber-400 text-amber-700' : 'border-outline focus:border-primary'}`}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-on-surface-variant block mb-1">Temp (°C)</label>
                <div className="relative">
                  <Thermometer className="absolute left-2 top-2.5 text-on-surface-variant" size={15} />
                  <input
                    type="number"
                    value={temp}
                    onChange={e => setTemp(Number(e.target.value))}
                    className={`w-full pl-7 bg-surface-container border rounded-lg p-2 font-semibold outline-none transition-colors ${isFeverish ? 'border-amber-400 text-amber-700' : 'border-outline focus:border-primary'}`}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-on-surface-variant block mb-1">SpO₂ (%)</label>
                <input
                  type="number"
                  value={spo2}
                  onChange={e => setSpo2(Number(e.target.value))}
                  className={`w-full bg-surface-container border rounded-lg p-2 font-semibold outline-none transition-colors ${spo2 < 95 ? 'border-error text-error' : 'border-outline focus:border-primary'}`}
                />
              </div>
            </div>
          </CardContent>
        </Card>
        </ErrorBoundary>

        {/* Right Column */}
        <div className="space-y-5">
          <ErrorBoundary moduleName="Complaint Parser">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent>
              <h2 className="text-xs font-bold text-primary uppercase tracking-widest mb-3">Patient Chief Complaint</h2>
              <textarea
                className="w-full h-32 bg-white border border-outline/50 rounded-lg p-3 text-sm font-medium outline-none focus:border-primary shadow-inner resize-none"
                placeholder="Patient describes symptoms as..."
                value={complaint}
                onChange={e => setComplaint(e.target.value)}
              />
            </CardContent>
          </Card>
          </ErrorBoundary>

          {/* Live EWS Output */}
          <ErrorBoundary moduleName="Early Warning Score Engine">
          <Card className="overflow-hidden">
            <div className={`p-4 ${ewsColor} text-white flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <AlertCircle size={20} />
                <h2 className="font-bold">Calculated EWS</h2>
                <span className="text-xs opacity-80">(Score: {ewsScore})</span>
              </div>
              <span className="text-2xl font-black">{ewsLevel}</span>
            </div>
            <CardContent className="p-4 bg-surface-container-low">
              <p className="text-on-surface text-sm font-semibold mb-3">
                Classification: <strong>{ewsLabel}</strong>
              </p>
              {ewsWarnings.length > 0 ? (
                <ul className="list-disc pl-5 text-sm text-on-surface/80 space-y-1">
                  {ewsWarnings.map((w, i) => <li key={i}>{w as string}</li>)}
                </ul>
              ) : (
                <p className="text-sm text-on-surface-variant">No active risk flags detected.</p>
              )}
            </CardContent>
          </Card>
          </ErrorBoundary>
        </div>

      </div>
    </div>
  );
};
