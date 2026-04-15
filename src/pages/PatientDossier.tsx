import React, { useState } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Tabs } from '../components/ui/Tabs';
import { AuditMetadata } from '../components/ui/AuditMetadata';
import { AlertTriangle, LockOpen, FileText, Activity, History as HistoryIcon, ArrowLeft, ClipboardList, Pill } from 'lucide-react';
import { useParams, Link } from 'react-router-dom';
import { usePatient, usePatientTimeline } from '../hooks/queries/usePatients';
import { PatientsAPI } from '../api/patients';
import { useMutation } from '@tanstack/react-query';
import { useToast, ToastContainer } from '../components/ui/Toast';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { useAuth } from '../hooks/useAuth';
import type { TimelineEntry } from '../types/clinical';

const TIMELINE_META: Record<TimelineEntry['type'], { label: string; accent: string }> = {
  encounter: { label: 'Encounter Opened', accent: 'text-primary' },
  consultation: { label: 'Clinical Note', accent: 'text-primary' },
  prescription: { label: 'Prescription Authorized', accent: 'text-tertiary' },
  discharge: { label: 'Encounter Closed', accent: 'text-emerald-700' },
  lab: { label: 'Lab Record', accent: 'text-tertiary' },
  radiology: { label: 'Imaging Record', accent: 'text-on-surface-variant' },
};

export const PatientDossier = () => {
  const { patientId } = useParams<{ patientId: string }>();
  const { role } = useAuth();
  const { toasts, push, dismiss } = useToast();
  const [breakGlassOpen, setBreakGlassOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('timeline');
  const [isEmergencyAccess, setIsEmergencyAccess] = useState(false);
  const [justification, setJustification] = useState('');
  const canWriteDoctorOrders = role === 'doctor';
  const canOpenOperationalPrescription = role === 'nurse';
  const registryRoute = role === 'nurse' ? '/operations/nurse-triage' : '/clinical/command-center';

  const { data: patient, isLoading: isPatientLoading, isError: isPatientError } = usePatient(patientId);
  const { data: fullTimeline = [], isLoading: isTimelineLoading } = usePatientTimeline(patientId);
  
  const isLoading = isPatientLoading || isTimelineLoading;
  const isError = isPatientError || !patientId;
  
  const timeline = fullTimeline.filter((t) => {
    if (!patient || t.patientId !== patient.id) return false;
    if (activeTab === 'timeline') return true;
    if (activeTab === 'encounters') return t.type === 'encounter' || t.type === 'discharge';
    if (activeTab === 'consultations') return t.type === 'consultation';
    if (activeTab === 'prescriptions') return t.type === 'prescription';
    return true;
  });
  const continuityStats = {
    encounters: fullTimeline.filter((entry) => entry.type === 'encounter' || entry.type === 'discharge').length,
    consultations: fullTimeline.filter((entry) => entry.type === 'consultation').length,
    prescriptions: fullTimeline.filter((entry) => entry.type === 'prescription').length,
  };

  const breakGlassMutation = useMutation({
    mutationFn: async (reason: string) => {
      return await PatientsAPI.breakGlass(patientId!, reason);
    },
    onSuccess: () => {
      setBreakGlassOpen(false);
      setIsEmergencyAccess(true);
      push('warning', 'Admin Alerted', 'Break-glass alert sent and audit recorded. Finalized records are visible below. To transfer active case ownership, contact admin to reassign this encounter.');
    },
    onError: (error: any) => {
      push('error', 'Alert Failed', error.response?.data?.message || 'Failed to send break-glass alert.');
    }
  });

  const handleGrantAccess = () => {
    if (justification.length < 50) {
       push('error', 'Verification Failed', 'Justification must be significantly descriptive (at least 50 characters).');
       return;
    }
    breakGlassMutation.mutate(justification);
  };

  const getPrescriptionRoute = (rxId?: string | null) => {
    if (!rxId || !patientId) {
      return null;
    }

    if (canWriteDoctorOrders) {
      return `/clinical/patient/${patientId}/prescription/${rxId}`;
    }

    if (canOpenOperationalPrescription) {
      return `/operations/prescriptions/${patientId}/${rxId}`;
    }

    return null;
  };

  return (
    <div className="space-y-6 relative pb-20">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      
      {isLoading && (
        <div className="flex flex-col items-center justify-center p-24 space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          <p className="text-sm font-bold text-on-surface-variant animate-pulse">Loading patient dossier...</p>
        </div>
      )}

      {isError || (!isLoading && !patient) ? (
        <div className="flex flex-col items-center justify-center p-24 space-y-2">
          <AlertTriangle size={32} className="text-error mb-2" />
          <h2 className="text-lg font-bold text-on-surface">Error Retrieving Record</h2>
          <p className="text-sm text-on-surface-variant">Could not load the patient dossier from the registry.</p>
        </div>
      ) : null}

      {!isLoading && !isError && patient && (
        <>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm font-medium mb-6">
        <Link to={registryRoute} className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
          <ArrowLeft size={14} /> Registry
        </Link>
        <span className="text-on-surface-variant opacity-30">&gt;</span>
        <span className="text-on-surface font-bold">
          Patient Dossier ({patient.mrn})
        </span>
      </div>

      {isEmergencyAccess && (
        <div className="bg-error/10 border-2 border-error border-dashed p-4 rounded-xl flex items-center gap-4 text-error">
          <AlertTriangle size={24} />
          <div className="flex-1">
            <p className="text-sm font-black uppercase tracking-wider">Break-Glass Alert Active — Admin Notified</p>
            <p className="text-xs font-bold opacity-80">Your request has been logged. Finalized records are visible below. Contact admin to reassign active case ownership.</p>
          </div>
          <button
            onClick={() => setIsEmergencyAccess(false)}
            className="px-4 py-2 bg-error text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

        {/* ── Left Col — Identity ─────────────────────────────────────── */}
        <div className="md:col-span-1 space-y-4">
          <ErrorBoundary moduleName="Patient Identity Tracker">
          <Card>
            <div className="p-6 text-center border-b border-outline/20">
              <div className="w-16 h-16 bg-primary/10 text-primary font-bold text-xl rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/20">
                {patient.initials}
              </div>
              <p className="text-xs text-on-surface-variant mb-1">UID: {patient.mrn}</p>
              <h1 className="text-lg font-bold text-on-surface leading-tight">{patient.name}</h1>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div>
                <span className="block text-[10px] uppercase font-bold text-on-surface-variant mb-0.5 tracking-wider">Age/Sex</span>
                <span className="text-sm font-semibold">{patient.age}Y / {patient.gender}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-on-surface-variant mb-0.5 tracking-wider">Blood Group</span>
                <span className="text-sm font-semibold text-error">{patient.bloodGroup}</span>
              </div>
            </div>
          </Card>

          <button
            onClick={() => setBreakGlassOpen(true)}
            className="w-full bg-error text-white py-3 rounded-xl text-xs font-black uppercase tracking-[0.1em] shadow-lg shadow-error/20 hover:bg-red-700 transition-all flex flex-col items-center justify-center gap-1"
          >
            <span className="flex items-center justify-center gap-2">
              <LockOpen size={18} />
              Alert Admin (Break-Glass)
            </span>
            <span className="text-[10px] font-semibold tracking-normal normal-case text-white/85">
              Audit recorded · Admin notified
            </span>
          </button>
          </ErrorBoundary>

          {/* Current Vitals */}
          <ErrorBoundary moduleName="Real-time Vitals">
          <Card>
            <CardContent className="space-y-4">
              <h2 className="text-xs font-bold uppercase text-on-surface-variant tracking-widest">Current Vitals</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant block mb-1">BP</span>
                  <span className="text-xl font-extrabold">{patient.vitals.bp}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant block mb-1">HR</span>
                  <span className="text-xl font-extrabold">{patient.vitals.hr}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant block mb-1">Temp (°C)</span>
                  <span className="text-xl font-extrabold">{patient.vitals.temp}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant block mb-1">SpO₂ (%)</span>
                  <span className="text-xl font-extrabold">{patient.vitals.spo2}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          </ErrorBoundary>

          {/* Active Meds */}
          <ErrorBoundary moduleName="Medication List">
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase text-on-surface-variant tracking-widest">Active Meds</h2>
                {canWriteDoctorOrders && (
                  <Link
                    to={`/clinical/patient/${patient.id}/prescription/new`}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    + Prescribe
                  </Link>
                )}
              </div>
              {patient.activeMeds.length === 0 ? (
                <p className="text-xs text-on-surface-variant">No active medications.</p>
              ) : (
                patient.activeMeds.map((med) => (
                  <div key={med.name} className="flex items-start gap-2">
                    <Activity size={15} className="text-primary mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-bold block">{med.name}</span>
                      <span className="text-[10px] text-on-surface-variant">{med.frequency}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          </ErrorBoundary>
        </div>

        {/* ── Right Col — Clinical Context ────────────────────────────── */}
        <div className="md:col-span-3 space-y-5">
          <ErrorBoundary moduleName="Clinical Record Aggregator">

          {/* Allergy Alerts */}
          {patient.allergies.map((a) => (
            <div key={a.substance} className="p-4 bg-error text-white rounded-xl shadow-lg border-2 border-white/20 flex items-center gap-4">
              <AlertTriangle size={24} className="shrink-0" />
              <div>
                <span className="text-xs font-extrabold uppercase tracking-widest block mb-0.5 opacity-90">Allergy Alert</span>
                <span className="font-bold">
                  {a.substance} ({a.severity})
                  <span className="opacity-75 text-sm ml-2 font-normal">Verified: {a.verifiedDate}</span>
                </span>
              </div>
            </div>
          ))}

          {/* Risk Flags */}
          {patient.riskFlags.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase text-on-surface-variant self-center">Risk Flags</span>
              {patient.riskFlags.map((flag) => (
                <span key={flag} className="bg-tertiary-container text-on-tertiary-container text-[10px] font-bold px-3 py-1 rounded-full uppercase">
                  {flag}
                </span>
              ))}
            </div>
          )}

          {/* Continuity Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-outline border-l-4 border-l-primary shadow-sm">
              <span className="text-[10px] font-bold text-on-surface-variant block mb-2">Continuity Loop</span>
              <span className="text-2xl font-extrabold text-on-surface">{continuityStats.encounters}</span>
              <span className="text-xs font-semibold text-on-surface-variant">encounter milestones on file</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-outline border-l-4 border-l-tertiary shadow-sm">
              <span className="text-[10px] font-bold text-on-surface-variant block mb-2">Clinical Notes</span>
              <span className="text-2xl font-extrabold text-on-surface">{continuityStats.consultations}</span>
              <span className="text-xs font-semibold text-on-surface-variant">finalized consultations available</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-outline border-l-4 border-l-emerald-500 shadow-sm">
              <span className="text-[10px] font-bold text-on-surface-variant block mb-2">Authorized Rx</span>
              <span className="text-2xl font-extrabold text-on-surface">{continuityStats.prescriptions}</span>
              <span className="text-xs font-semibold text-on-surface-variant">prescriptions in the timeline</span>
            </div>
          </div>

          {/* Timeline Header */}
          <div className="flex items-center justify-between mt-4">
            <h2 className="text-2xl font-extrabold text-on-surface">Clinical Timeline</h2>
            {canWriteDoctorOrders && (
              <Link
                to={`/clinical/patient/${patient.id}/note/new`}
                className="bg-primary text-white px-6 py-2 rounded-lg text-sm font-bold shadow-sm hover:brightness-110 transition-all"
              >
                + New Note
              </Link>
            )}
          </div>

          {/* Timeline Tabs + Entries */}
          <Card>
            <Tabs
              value={activeTab}
              onChange={setActiveTab}
              tabs={[
                { id: 'timeline', label: 'Timeline', icon: <HistoryIcon size={16} /> },
                { id: 'encounters', label: 'Encounters', icon: <Activity size={16} /> },
                { id: 'consultations', label: 'Notes', icon: <ClipboardList size={16} /> },
                { id: 'prescriptions', label: 'Prescriptions', icon: <Pill size={16} /> },
              ]}
            />

            <div className="p-6 space-y-6">
              {timeline.length === 0 ? (
                <p className="text-sm text-on-surface-variant text-center py-8">No continuity events have been recorded for this patient yet.</p>
              ) : (
                timeline.map((entry) => (
                  <div key={entry.id} className="bg-surface rounded-xl shadow-sm border border-outline p-6 hover:shadow-md transition-all">
                    <span className={`text-xs font-bold uppercase tracking-widest block mb-1 ${TIMELINE_META[entry.type].accent}`}>
                      {TIMELINE_META[entry.type].label}
                    </span>
                    <span className="text-xs font-medium text-on-surface-variant block mb-3">• {entry.date}</span>
                    <h3 className="text-lg font-bold text-on-surface mb-2">{entry.title}</h3>
                    <p className="text-sm text-on-surface mb-4">{entry.summary}</p>
                    {entry.type === 'prescription' && getPrescriptionRoute(entry.rxId) && (
                      <Link
                        to={getPrescriptionRoute(entry.rxId)!}
                        className="mb-4 inline-flex items-center gap-2 rounded-lg border border-outline bg-white px-3 py-2 text-xs font-bold text-primary hover:bg-primary/5"
                      >
                        Open Authorized Prescription
                      </Link>
                    )}
                    <AuditMetadata lastModifiedDate={entry.date} verifiedBy={entry.verifiedBy} />
                  </div>
                ))
              )}
            </div>
          </Card>
          </ErrorBoundary>
        </div>
      </div>

      {/* ── Break-Glass Modal ─────────────────────────────────────────── */}
      {breakGlassOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/50 backdrop-blur-sm px-4">
          <div className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl p-6 border-t-8 border-error">
            <div className="flex justify-center mb-4 text-error">
              <AlertTriangle size={48} />
            </div>
            <h3 className="text-center text-xl font-black uppercase tracking-tight text-error mb-2">Break-Glass Alert</h3>
            <p className="text-center font-bold text-on-surface mb-6">Emergency Admin Notification — {patient.name}</p>

            <div className="bg-red-50 p-4 rounded-lg border border-error/20 mb-6 text-sm text-error/90 font-medium">
              This will log an immutable audit record and immediately notify the administrator. Finalized records in this dossier are already visible to you. For active case transfer (draft notes, in-progress prescriptions), the admin must reassign this encounter. Unauthorized use is subject to hospital policy.
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-on-surface-variant mb-2 uppercase">Reason for Access</label>
              <textarea
                value={justification}
                onChange={e => setJustification(e.target.value)}
                className="w-full bg-surface-container border border-outline rounded-lg p-3 text-sm focus:ring-2 focus:ring-error focus:border-error outline-none"
                rows={3}
                placeholder="Describe the clinical emergency... (minimum 50 characters)"
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setBreakGlassOpen(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-outline text-sm font-bold text-on-surface hover:bg-surface-container-low transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGrantAccess}
                disabled={breakGlassMutation.isPending}
                className="flex-1 px-4 py-3 bg-error text-white rounded-xl text-sm font-black uppercase tracking-wider hover:bg-red-700 transition-colors shadow-lg shadow-error/20 disabled:opacity-50"
              >
                {breakGlassMutation.isPending ? 'Sending Alert...' : 'Send Alert'}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};
