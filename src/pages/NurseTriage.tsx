import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Phone,
  Save,
  Search,
  Stethoscope,
  Thermometer,
  Trash2,
  UserPlus,
  Users
} from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { StatusChip } from '../components/ui/StatusChip';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast, ToastContainer } from '../components/ui/Toast';
import { usePatient, useSearchPatients } from '../hooks/queries/usePatients';
import { PatientsAPI } from '../api/patients';
import { queueApi } from '../api/queue';
import { useDraft, draftApi } from '../hooks/useDrafts';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import type { Patient, TriageVitals } from '../types/clinical';
import {
  buildEmptyVitals,
  buildSuggestedTriagePriority,
  TRIAGE_PRIORITY_OPTIONS,
  validateIdentity,
  validateTriageSubmission
} from './nurseTriage.form';

function parseBp(bp: string | undefined, position: 0 | 1, fallback: number) {
  const part = bp?.split('/')?.[position];
  const numeric = Number(part);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function deriveVitalsFromPatient(patient?: Patient | null): TriageVitals {
  if (!patient) {
    return buildEmptyVitals();
  }

  return {
    height: 175,
    weight: 70,
    systolic: parseBp(patient.vitals.bp, 0, 120),
    diastolic: parseBp(patient.vitals.bp, 1, 80),
    hr: patient.vitals.hr || 72,
    temp: patient.vitals.temp || 37,
    spo2: patient.vitals.spo2 || 99,
  };
}

function buildChiefComplaintHint(patient?: Patient | null) {
  if (!patient?.riskFlags?.length) {
    return 'Briefly capture why the patient is here today.';
  }

  return `Chief complaint. Registry flags: ${patient.riskFlags.join(', ')}.`;
}

function calculateSuggestedPriorityFromVitals(nextVitals: TriageVitals) {
  let score = 0;
  if (nextVitals.systolic < 90 || nextVitals.systolic > 150) score += 2;
  else if (nextVitals.systolic > 130) score += 1;
  if (nextVitals.hr > 110 || nextVitals.hr < 50) score += 2;
  else if (nextVitals.hr > 100) score += 1;
  if (nextVitals.temp > 38.5 || nextVitals.temp < 35.0) score += 2;
  else if (nextVitals.temp > 37.5) score += 1;
  if (nextVitals.spo2 < 92) score += 2;
  else if (nextVitals.spo2 < 95) score += 1;
  return buildSuggestedTriagePriority(score);
}

function formatPatientMeta(patient: Patient) {
  const parts = [`MRN: ${patient.mrn}`];

  if (patient.dob) {
    parts.push(`DOB: ${patient.dob}`);
  } else if (patient.age > 0) {
    parts.push(`Age: ${patient.age}`);
  }

  parts.push(patient.gender || 'Not specified');

  if (patient.phone) {
    parts.push(patient.phone);
  }

  return parts.join(' · ');
}

function getPriorityStyle(priority: string) {
  switch (priority) {
    case 'IMMEDIATE':
      return { chip: 'error' as const, label: 'Immediate' };
    case 'URGENT':
      return { chip: 'tertiary' as const, label: 'Urgent' };
    case 'STANDARD':
      return { chip: 'primary' as const, label: 'Standard' };
    default:
      return { chip: 'surface' as const, label: 'Low' };
  }
}

export const NurseTriage = () => {
  const { patientId } = useParams<{ patientId?: string }>();
  const navigate = useNavigate();
  const { toasts, push, dismiss } = useToast();
  const draftKey = `cc_triage_draft_${patientId}`;
  const hydratedPatientId = useRef<string | null>(null);

  const [lookupQuery, setLookupQuery] = useState('');
  const [showNewIntake, setShowNewIntake] = useState(false);
  const [newPatient, setNewPatient] = useState({ name: '', dob: '', gender: '', phone: '' });
  const [identityErrors, setIdentityErrors] = useState<Record<string, string>>({});
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [triagePriority, setTriagePriority] = useState('STANDARD');
  const [handoffNotes, setHandoffNotes] = useState('');
  const [vitals, setVitals] = useState<TriageVitals>(buildEmptyVitals());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [isCreatingPatient, setIsCreatingPatient] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastHandoff, setLastHandoff] = useState<null | {
    patientId: string;
    patientName: string;
    doctorName: string;
  }>(null);

  const debouncedLookupQuery = useDebounce(lookupQuery, 250);
  const { data: matchingPatients = [], isLoading: isSearchLoading } = useSearchPatients(debouncedLookupQuery);
  const { data: registryPatient, isLoading: isPatientLoading, isError: isPatientError } = usePatient(patientId);
  const { data: draft, isLoading: isDraftLoading } = useDraft<{
    selectedDoctorId?: string;
    chiefComplaint?: string;
    triagePriority?: string;
    handoffNotes?: string;
    vitals?: TriageVitals;
  }>(draftKey, { enabled: Boolean(patientId) });

  const {
    data: doctors = [],
    isLoading: isDoctorsLoading,
    refetch: refetchDoctors,
  } = useQuery({
    queryKey: ['triageDoctors'],
    queryFn: queueApi.fetchDoctors,
  });

  const ewsScore = useMemo(() => {
    let score = 0;
    if (vitals.systolic < 90 || vitals.systolic > 150) score += 2;
    else if (vitals.systolic > 130) score += 1;
    if (vitals.hr > 110 || vitals.hr < 50) score += 2;
    else if (vitals.hr > 100) score += 1;
    if (vitals.temp > 38.5 || vitals.temp < 35.0) score += 2;
    else if (vitals.temp > 37.5) score += 1;
    if (vitals.spo2 < 92) score += 2;
    else if (vitals.spo2 < 95) score += 1;
    return score;
  }, [vitals]);

  const ewsLevel = ewsScore >= 6 ? 'L2' : ewsScore >= 3 ? 'L3' : ewsScore >= 1 ? 'L4' : 'L5';
  const ewsLabel = ewsScore >= 6 ? 'Emergent' : ewsScore >= 3 ? 'Urgent' : ewsScore >= 1 ? 'Less Urgent' : 'Non-Urgent';
  const ewsColor = ewsScore >= 6 ? 'bg-error' : ewsScore >= 3 ? 'bg-tertiary' : 'bg-primary';
  const priorityStyle = getPriorityStyle(triagePriority);
  const selectedDoctor = doctors.find((doctor) => doctor.id === selectedDoctorId) || null;

  useEffect(() => {
    if (!patientId) {
      hydratedPatientId.current = null;
      return;
    }

    if (!registryPatient || isDraftLoading || hydratedPatientId.current === patientId) {
      return;
    }

    const nextVitals = deriveVitalsFromPatient(registryPatient);
    hydratedPatientId.current = patientId;
    setVitals(draft?.vitals || nextVitals);
    setChiefComplaint(draft?.chiefComplaint || '');
    setTriagePriority(draft?.triagePriority || calculateSuggestedPriorityFromVitals(nextVitals));
    setHandoffNotes(draft?.handoffNotes || '');
    setSelectedDoctorId(draft?.selectedDoctorId || '');
    setFormErrors({});
    setSubmitError('');
  }, [draft, isDraftLoading, patientId, registryPatient]);

  useEffect(() => {
    if (!patientId || isDraftLoading || !registryPatient) {
      return;
    }

    const debouncedDraft = {
      selectedDoctorId,
      chiefComplaint,
      triagePriority,
      handoffNotes,
      vitals,
    };

    const timer = setTimeout(() => {
      draftApi.saveDraft(draftKey, debouncedDraft);
    }, 700);

    return () => clearTimeout(timer);
  }, [chiefComplaint, draftKey, handoffNotes, isDraftLoading, patientId, registryPatient, selectedDoctorId, triagePriority, vitals]);

  const isHypertensive = vitals.systolic > 130 || vitals.diastolic > 85;
  const isTachycardic = vitals.hr > 100;
  const isFeverish = vitals.temp > 37.5;
  const ewsWarnings = [
    isHypertensive && 'Elevated blood pressure',
    isTachycardic && 'Tachycardia',
    isFeverish && 'Low-grade fever',
    registryPatient && registryPatient.riskFlags.length > 0 && `Registry flags: ${registryPatient.riskFlags.join(', ')}`,
  ].filter(Boolean);

  const resetToLanding = () => {
    setLookupQuery('');
    setShowNewIntake(false);
    setNewPatient({ name: '', dob: '', gender: '', phone: '' });
    setIdentityErrors({});
    setFormErrors({});
    setSubmitError('');
    setLastHandoff(null);
    if (patientId) {
      draftApi.clearDraft(draftKey);
    }
    navigate('/operations/nurse-triage');
  };

  const handleCreatePatient = async () => {
    const validation = validateIdentity(newPatient);
    if (Object.keys(validation).length > 0) {
      setIdentityErrors(validation);
      return;
    }

    setIdentityErrors({});
    setIsCreatingPatient(true);

    try {
      const response = await PatientsAPI.createPatient({
        name: newPatient.name.trim(),
        dob: newPatient.dob,
        gender: newPatient.gender,
        phone: newPatient.phone.trim() || undefined,
      });

      push(
        'success',
        response.patientCreated ? 'Intake Created' : 'Patient Reused',
        `${response.patient.name} is ready for triage.`
      );
      setShowNewIntake(false);
      navigate(`/operations/nurse-triage/${response.patient.id}`);
    } catch (error: any) {
      setIdentityErrors({
        form: error.response?.data?.error?.message || 'Could not create the patient intake right now.'
      });
    } finally {
      setIsCreatingPatient(false);
    }
  };

  const handlePushToDoctor = async () => {
    const validation = validateTriageSubmission({
      patientId,
      doctorId: selectedDoctorId,
      chiefComplaint,
      triagePriority,
      doctorsAvailable: doctors.length,
    });

    if (Object.keys(validation).length > 0) {
      setFormErrors(validation);
      setSubmitError('');
      return;
    }

    if (!patientId) {
      return;
    }

    setFormErrors({});
    setSubmitError('');
    setIsSubmitting(true);

    try {
      const response = await queueApi.handoffToDoctor({
        patientId,
        doctorId: selectedDoctorId,
        chiefComplaint: chiefComplaint.trim(),
        triagePriority,
        handoffNotes: handoffNotes.trim(),
        vitals,
      });

      draftApi.clearDraft(draftKey);
      setLastHandoff({
        patientId,
        patientName: registryPatient?.name || response.patientId,
        doctorName: response.assignedDoctor.name,
      });
      push(
        'success',
        'Patient Pushed',
        `${registryPatient?.name || 'Patient'} is now assigned to ${response.assignedDoctor.name}.`
      );
    } catch (error: any) {
      const message = error.response?.data?.error?.message || 'Doctor assignment failed. Please retry.';
      setSubmitError(message);
      push('error', 'Assignment Failed', message);
      void refetchDoctors();
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderLanding = () => (
    <div className="space-y-6">
      {lastHandoff && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Handoff Complete</p>
              <h2 className="mt-1 text-xl font-bold text-on-surface">{lastHandoff.patientName} assigned successfully</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                {lastHandoff.doctorName} now owns the doctor handoff for this patient.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={resetToLanding}
                className="rounded-lg border border-outline px-4 py-2 text-sm font-bold hover:bg-white transition-colors"
              >
                Continue Next Intake
              </button>
              <button
                type="button"
                onClick={() => navigate(`/clinical/patient/${lastHandoff.patientId}/dossier`)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:brightness-110 transition-colors"
              >
                Open Patient Dossier
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <EmptyState
        icon={Users}
        title="Select A Patient To Start Triage"
        description="Search the existing registry or create a fresh intake record before collecting triage details."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>Find Existing Patient</CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-3 text-on-surface-variant" />
              <input
                value={lookupQuery}
                onChange={(event) => setLookupQuery(event.target.value)}
                placeholder="Search by patient name, phone, or MRN"
                className="w-full rounded-lg border border-outline bg-white py-2.5 pl-10 pr-4 text-sm font-medium outline-none focus:border-primary"
              />
            </div>

            <div className="rounded-xl border border-outline/20 bg-surface-container-low">
              {lookupQuery.trim().length < 2 ? (
                <p className="p-4 text-sm text-on-surface-variant">Enter at least 2 characters to search the patient registry.</p>
              ) : isSearchLoading ? (
                <div className="p-6 text-sm font-semibold text-on-surface-variant">Searching registry...</div>
              ) : matchingPatients.length === 0 ? (
                <p className="p-4 text-sm text-on-surface-variant">No registry matches found.</p>
              ) : (
                matchingPatients.map((patient) => (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => navigate(`/operations/nurse-triage/${patient.id}`)}
                    className="flex w-full items-center justify-between gap-3 border-b border-outline/10 px-4 py-3 text-left last:border-b-0 hover:bg-primary/5"
                  >
                    <div>
                      <p className="font-bold text-on-surface">{patient.name}</p>
                      <p className="mt-1 text-xs text-on-surface-variant">{formatPatientMeta(patient)}</p>
                    </div>
                    <span className="text-xs font-bold text-primary">Select</span>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>Fresh Intake</CardHeader>
          <CardContent className="space-y-4">
            {!showNewIntake ? (
              <div className="rounded-xl border border-dashed border-outline/40 bg-surface-container-low p-5">
                <p className="text-sm text-on-surface-variant">
                  Use this when the patient is not yet in the registry. Capture the minimum identity details first, then continue straight into triage.
                </p>
                <button
                  type="button"
                  onClick={() => setShowNewIntake(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:brightness-110 transition-colors"
                >
                  <UserPlus size={16} /> Create Intake Record
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">Patient Name</label>
                    <input
                      value={newPatient.name}
                      onChange={(event) => setNewPatient((current) => ({ ...current, name: event.target.value }))}
                      className="w-full rounded-lg border border-outline bg-white p-2.5 font-medium outline-none focus:border-primary"
                    />
                    {identityErrors.name && <p className="mt-1 text-xs font-semibold text-error">{identityErrors.name}</p>}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">DOB</label>
                    <input
                      type="date"
                      value={newPatient.dob}
                      onChange={(event) => setNewPatient((current) => ({ ...current, dob: event.target.value }))}
                      className="w-full rounded-lg border border-outline bg-white p-2.5 font-medium outline-none focus:border-primary"
                    />
                    {identityErrors.dob && <p className="mt-1 text-xs font-semibold text-error">{identityErrors.dob}</p>}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">Sex / Gender</label>
                    <select
                      value={newPatient.gender}
                      onChange={(event) => setNewPatient((current) => ({ ...current, gender: event.target.value }))}
                      className="w-full rounded-lg border border-outline bg-white p-2.5 font-medium outline-none focus:border-primary"
                    >
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                      <option value="Not specified">Not specified</option>
                    </select>
                    {identityErrors.gender && <p className="mt-1 text-xs font-semibold text-error">{identityErrors.gender}</p>}
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">Phone (Optional)</label>
                    <input
                      value={newPatient.phone}
                      onChange={(event) => setNewPatient((current) => ({ ...current, phone: event.target.value }))}
                      placeholder="+91 9876543210"
                      className="w-full rounded-lg border border-outline bg-white p-2.5 font-medium outline-none focus:border-primary"
                    />
                    {identityErrors.phone && <p className="mt-1 text-xs font-semibold text-error">{identityErrors.phone}</p>}
                  </div>
                </div>

                {identityErrors.form && (
                  <div className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
                    {identityErrors.form}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewIntake(false);
                      setIdentityErrors({});
                    }}
                    className="rounded-lg border border-outline px-4 py-2 text-sm font-bold hover:bg-surface-container transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreatePatient}
                    disabled={isCreatingPatient}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
                  >
                    {isCreatingPatient ? 'Creating Intake...' : 'Create And Continue'}
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  if (!patientId) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto relative">
        <ToastContainer toasts={toasts} onDismiss={dismiss} />
        {renderLanding()}
      </div>
    );
  }

  if (isPatientLoading || isDraftLoading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto relative">
        <ToastContainer toasts={toasts} onDismiss={dismiss} />
        <div className="rounded-xl border border-outline/20 bg-white p-10 text-center font-semibold text-on-surface-variant">
          Restoring patient intake...
        </div>
      </div>
    );
  }

  if (isPatientError || !registryPatient) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto relative">
        <ToastContainer toasts={toasts} onDismiss={dismiss} />
        <Card>
          <CardContent>
            <EmptyState
              icon={AlertCircle}
              title="Patient Not Available"
              description="We could not load this patient from the registry. Return to nurse triage and choose another patient."
              action={{ label: 'Back To Triage', onClick: resetToLanding }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto relative">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div className="sticky top-24 z-10 flex flex-col gap-4 rounded-xl border border-outline/30 bg-surface p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-primary">Nurse Triage Intake</h3>
          <h1 className="mt-1 text-2xl font-bold text-on-surface">{registryPatient.name}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{formatPatientMeta(registryPatient)}</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={resetToLanding}
            className="inline-flex items-center gap-2 rounded-lg border border-outline px-4 py-2 text-sm font-bold hover:bg-surface-container transition-colors"
          >
            <Trash2 size={16} /> Reset Intake
          </button>
          <button
            type="button"
            onClick={handlePushToDoctor}
            disabled={isSubmitting || isDoctorsLoading || doctors.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={16} /> {isSubmitting ? 'Pushing...' : 'Push To Doctor'}
          </button>
        </div>
      </div>

      {lastHandoff && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="mt-0.5 text-emerald-600" />
              <div>
                <p className="font-bold text-on-surface">Handoff complete</p>
                <p className="text-sm text-on-surface-variant">
                  {lastHandoff.patientName} is now assigned to {lastHandoff.doctorName}.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={resetToLanding}
                className="rounded-lg border border-outline px-4 py-2 text-sm font-bold hover:bg-white transition-colors"
              >
                Continue Next Intake
              </button>
              <button
                type="button"
                onClick={() => navigate(`/clinical/patient/${registryPatient.id}/dossier`)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:brightness-110 transition-colors"
              >
                Open Patient Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {registryPatient.allergies.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-error px-4 py-3 text-sm font-semibold text-white">
          <AlertCircle size={18} className="shrink-0" />
          <span>
            {registryPatient.allergies.map((allergy) => `${allergy.substance} (${allergy.severity})`).join(' · ')}
            <span className="ml-2 text-xs font-normal opacity-75">Registry alert</span>
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <ErrorBoundary moduleName="Patient Identity">
            <Card>
              <CardHeader>Patient Identity</CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-outline/20 bg-surface-container-low p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Patient Name</p>
                  <p className="mt-2 text-lg font-bold text-on-surface">{registryPatient.name}</p>
                </div>
                <div className="rounded-xl border border-outline/20 bg-surface-container-low p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">MRN / Internal ID</p>
                  <p className="mt-2 text-lg font-bold text-on-surface">{registryPatient.mrn}</p>
                </div>
                <div className="rounded-xl border border-outline/20 bg-surface-container-low p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">DOB / Age</p>
                  <p className="mt-2 text-lg font-bold text-on-surface">{registryPatient.dob || `${registryPatient.age} years`}</p>
                </div>
                <div className="rounded-xl border border-outline/20 bg-surface-container-low p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Sex / Gender</p>
                  <p className="mt-2 text-lg font-bold text-on-surface">{registryPatient.gender}</p>
                </div>
                <div className="rounded-xl border border-outline/20 bg-surface-container-low p-4 md:col-span-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Phone</p>
                  <p className="mt-2 flex items-center gap-2 text-lg font-bold text-on-surface">
                    <Phone size={16} className="text-on-surface-variant" />
                    {registryPatient.phone || 'Phone not available in registry'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </ErrorBoundary>

          <ErrorBoundary moduleName="Vitals Intake">
            <Card>
              <CardHeader>Vitals</CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">Height (cm)</label>
                    <input
                      type="number"
                      value={vitals.height}
                      onChange={(event) => setVitals((current) => ({ ...current, height: Number(event.target.value) }))}
                      className="w-full rounded-lg border border-outline bg-surface-container p-2 font-semibold outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">Weight (kg)</label>
                    <input
                      type="number"
                      value={vitals.weight}
                      onChange={(event) => setVitals((current) => ({ ...current, weight: Number(event.target.value) }))}
                      className="w-full rounded-lg border border-outline bg-surface-container p-2 font-semibold outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">Blood Pressure (mmHg)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={vitals.systolic}
                      onChange={(event) => setVitals((current) => ({ ...current, systolic: Number(event.target.value) }))}
                      className={`w-full rounded-lg border bg-surface-container p-2 font-semibold outline-none transition-colors ${isHypertensive ? 'border-amber-400 text-amber-700' : 'border-outline focus:border-primary'}`}
                    />
                    <span className="text-xl text-on-surface-variant">/</span>
                    <input
                      type="number"
                      value={vitals.diastolic}
                      onChange={(event) => setVitals((current) => ({ ...current, diastolic: Number(event.target.value) }))}
                      className={`w-full rounded-lg border bg-surface-container p-2 font-semibold outline-none transition-colors ${isHypertensive ? 'border-amber-400 text-amber-700' : 'border-outline focus:border-primary'}`}
                    />
                  </div>
                  {isHypertensive && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-600">
                      <AlertCircle size={12} /> Hypertensive range detected
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">HR (bpm)</label>
                    <div className="relative">
                      <Activity className="absolute left-2 top-2.5 text-on-surface-variant" size={15} />
                      <input
                        type="number"
                        value={vitals.hr}
                        onChange={(event) => setVitals((current) => ({ ...current, hr: Number(event.target.value) }))}
                        className={`w-full rounded-lg border bg-surface-container p-2 pl-7 font-semibold outline-none transition-colors ${isTachycardic ? 'border-amber-400 text-amber-700' : 'border-outline focus:border-primary'}`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">Temp (°C)</label>
                    <div className="relative">
                      <Thermometer className="absolute left-2 top-2.5 text-on-surface-variant" size={15} />
                      <input
                        type="number"
                        value={vitals.temp}
                        onChange={(event) => setVitals((current) => ({ ...current, temp: Number(event.target.value) }))}
                        className={`w-full rounded-lg border bg-surface-container p-2 pl-7 font-semibold outline-none transition-colors ${isFeverish ? 'border-amber-400 text-amber-700' : 'border-outline focus:border-primary'}`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">SpO₂ (%)</label>
                    <input
                      type="number"
                      value={vitals.spo2}
                      onChange={(event) => setVitals((current) => ({ ...current, spo2: Number(event.target.value) }))}
                      className={`w-full rounded-lg border bg-surface-container p-2 font-semibold outline-none transition-colors ${vitals.spo2 < 95 ? 'border-error text-error' : 'border-outline focus:border-primary'}`}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </ErrorBoundary>
        </div>

        <div className="space-y-6">
          <ErrorBoundary moduleName="Intake Summary">
            <Card>
              <CardHeader>Core Intake Details</CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">Chief Complaint</label>
                  <textarea
                    value={chiefComplaint}
                    onChange={(event) => setChiefComplaint(event.target.value)}
                    placeholder={buildChiefComplaintHint(registryPatient)}
                    className="h-28 w-full resize-none rounded-lg border border-outline bg-white p-3 text-sm font-medium outline-none focus:border-primary"
                  />
                  {formErrors.chiefComplaint && <p className="mt-1 text-xs font-semibold text-error">{formErrors.chiefComplaint}</p>}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">Triage Priority</label>
                    <select
                      value={triagePriority}
                      onChange={(event) => setTriagePriority(event.target.value)}
                      className="w-full rounded-lg border border-outline bg-white p-2.5 font-semibold outline-none focus:border-primary"
                    >
                      {TRIAGE_PRIORITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 flex items-center gap-2">
                      <StatusChip variant={priorityStyle.chip} label={priorityStyle.label} />
                      <span className="text-xs text-on-surface-variant">Nurse-selected priority for doctor handoff</span>
                    </div>
                    {formErrors.triagePriority && <p className="mt-1 text-xs font-semibold text-error">{formErrors.triagePriority}</p>}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">Assign Doctor</label>
                    <div className="relative">
                      <Stethoscope size={16} className="absolute left-3 top-3 text-on-surface-variant" />
                      <select
                        value={selectedDoctorId}
                        onChange={(event) => setSelectedDoctorId(event.target.value)}
                        className="w-full rounded-lg border border-outline bg-white py-2.5 pl-10 pr-3 font-semibold outline-none focus:border-primary"
                      >
                        <option value="">{isDoctorsLoading ? 'Loading doctors...' : 'Select doctor'}</option>
                        {doctors.map((doctor) => (
                          <option key={doctor.id} value={doctor.id}>
                            {doctor.name} {typeof doctor.activeQueueCount === 'number' ? `· ${doctor.activeQueueCount} active` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedDoctor && (
                      <p className="mt-2 text-xs text-on-surface-variant">
                        {selectedDoctor.name} currently has {selectedDoctor.activeQueueCount || 0} active patient{selectedDoctor.activeQueueCount === 1 ? '' : 's'}.
                      </p>
                    )}
                    {!isDoctorsLoading && doctors.length === 0 && (
                      <p className="mt-2 text-xs font-semibold text-error">No doctors are currently available for assignment.</p>
                    )}
                    {formErrors.doctor && <p className="mt-1 text-xs font-semibold text-error">{formErrors.doctor}</p>}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">Handoff Notes (Optional)</label>
                  <textarea
                    value={handoffNotes}
                    onChange={(event) => setHandoffNotes(event.target.value)}
                    placeholder="Anything the receiving doctor should know right away"
                    className="h-24 w-full resize-none rounded-lg border border-outline bg-white p-3 text-sm font-medium outline-none focus:border-primary"
                  />
                </div>

                {formErrors.patient && (
                  <div className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
                    {formErrors.patient}
                  </div>
                )}

                {submitError && (
                  <div className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
                    {submitError}
                  </div>
                )}
              </CardContent>
            </Card>
          </ErrorBoundary>

          <ErrorBoundary moduleName="EWS Summary">
            <Card className="overflow-hidden">
              <div className={`flex items-center justify-between p-4 text-white ${ewsColor}`}>
                <div className="flex items-center gap-2">
                  <AlertCircle size={20} />
                  <h2 className="font-bold">Calculated EWS</h2>
                  <span className="text-xs opacity-80">(Score: {ewsScore})</span>
                </div>
                <span className="text-2xl font-black">{ewsLevel}</span>
              </div>
              <CardContent className="bg-surface-container-low">
                <p className="text-sm font-semibold text-on-surface">
                  Classification: <strong>{ewsLabel}</strong>
                </p>
                {ewsWarnings.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-on-surface/80">
                    {ewsWarnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-on-surface-variant">No active warning flags detected from the current intake.</p>
                )}
              </CardContent>
            </Card>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
};
