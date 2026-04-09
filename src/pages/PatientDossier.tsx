import React, { useState } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Tabs } from '../components/ui/Tabs';
import { AuditMetadata } from '../components/ui/AuditMetadata';
import { AlertTriangle, LockOpen, FileText, Activity, Database, History as HistoryIcon, ArrowLeft } from 'lucide-react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { usePatient, usePatientTimeline } from '../hooks/queries/usePatients';
import { PatientsAPI } from '../api/patients';
import { useMutation } from '@tanstack/react-query';
import { useToast, ToastContainer } from '../components/ui/Toast';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

export const PatientDossier = () => {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { toasts, push, dismiss } = useToast();
  const [breakGlassOpen, setBreakGlassOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('timeline');
  const [isEmergencyAccess, setIsEmergencyAccess] = useState(false);
  const [justification, setJustification] = useState('');

  // Resolve patient from centralized store — fall back to first patient if id unknown
  const fallbackId = patientId ?? 'CC-99821';
  const { data: patient, isLoading: isPatientLoading, isError: isPatientError } = usePatient(fallbackId);
  const { data: fullTimeline = [], isLoading: isTimelineLoading } = usePatientTimeline(fallbackId);
  
  const isLoading = isPatientLoading || isTimelineLoading;
  const isError = isPatientError;
  
  const timeline = fullTimeline.filter((t) => {
    if (!patient || t.patientId !== patient.id) return false;
    if (activeTab === 'timeline') return true;
    if (activeTab === 'pathology') return t.type === 'lab';
    if (activeTab === 'radiology') return t.type === 'radiology';
    return true;
  });

  const breakGlassMutation = useMutation({
    mutationFn: async (reason: string) => {
      return await PatientsAPI.breakGlass(patientId!, reason);
    },
    onSuccess: () => {
      setBreakGlassOpen(false);
      setIsEmergencyAccess(true);
      push('warning', 'Override Active', 'Emergency access granted. Your activity is being monitored and audited.');
    },
    onError: (error: any) => {
      push('error', 'Override Prohibited', error.response?.data?.message || 'Failed to authorize break-glass override.');
    }
  });

  const handleGrantAccess = () => {
    if (justification.length < 50) {
       push('error', 'Verification Failed', 'Justification must be significantly descriptive (at least 50 characters).');
       return;
    }
    breakGlassMutation.mutate(justification);
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
        <Link to="/clinical/command-center" className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
          <ArrowLeft size={14} /> Registry
        </Link>
        <span className="text-on-surface-variant opacity-30">&gt;</span>
        <span className="text-on-surface font-bold">
          Patient Dossier ({patient.mrn})
        </span>
      </div>

      {isEmergencyAccess && (
        <div className="bg-error/10 border-2 border-error border-dashed p-4 rounded-xl flex items-center gap-4 text-error animate-pulse">
          <AlertTriangle size={24} />
          <div className="flex-1">
            <p className="text-sm font-black uppercase tracking-wider">Active Emergency Override Session</p>
            <p className="text-xs font-bold opacity-80">All actions are being recorded to the compliance audit server.</p>
          </div>
          <button 
            onClick={() => setIsEmergencyAccess(false)}
            className="px-4 py-2 bg-error text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors"
          >
            Terminate Session
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
            className="w-full bg-error text-white py-3 rounded-xl text-xs font-black uppercase tracking-[0.1em] shadow-lg shadow-error/20 hover:bg-red-700 transition-all flex items-center justify-center gap-2"
          >
            <LockOpen size={18} />
            Break-Glass Emergency
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
                <Link
                  to={`/clinical/patient/${patient.id}/prescription/new`}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  + Prescribe
                </Link>
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

          {/* Order Tracking */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-outline border-l-4 border-l-amber-400 shadow-sm">
              <span className="text-[10px] font-bold text-on-surface-variant block mb-2">ETA: Today, 04:00 PM</span>
              <span className="text-xs font-bold block mb-2">Lipid Profile</span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700 uppercase">Sample Collected</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-outline border-l-4 border-l-emerald-400 shadow-sm">
              <span className="text-[10px] font-bold text-on-surface-variant block mb-2">Ready for pickup</span>
              <span className="text-xs font-bold block mb-2">Gliclazide 80mg</span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 uppercase">Dispensed</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-outline border-l-4 border-l-blue-400 shadow-sm">
              <span className="text-[10px] font-bold text-on-surface-variant block mb-2">Processing</span>
              <span className="text-xs font-bold block mb-2">Urine Culture</span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">In-Process</span>
            </div>
          </div>

          {/* Timeline Header */}
          <div className="flex items-center justify-between mt-4">
            <h2 className="text-2xl font-extrabold text-on-surface">Clinical Timeline</h2>
            <Link
              to={`/clinical/patient/${patient.id}/note/new`}
              className="bg-primary text-white px-6 py-2 rounded-lg text-sm font-bold shadow-sm hover:brightness-110 transition-all"
            >
              + New Encounter
            </Link>
          </div>

          {/* Timeline Tabs + Entries */}
          <Card>
            <Tabs
              value={activeTab}
              onChange={setActiveTab}
              tabs={[
                { id: 'timeline', label: 'Timeline', icon: <HistoryIcon size={16} /> },
                { id: 'pathology', label: 'Pathology', icon: <Database size={16} /> },
                { id: 'radiology', label: 'Radiology', icon: <FileText size={16} /> },
              ]}
            />

            <div className="p-6 space-y-6">
              {timeline.length === 0 ? (
                <p className="text-sm text-on-surface-variant text-center py-8">No timeline entries for this patient yet.</p>
              ) : (
                timeline.map((entry) => (
                  <div key={entry.id} className="bg-surface rounded-xl shadow-sm border border-outline p-6 hover:shadow-md transition-all">
                    <span className={`text-xs font-bold uppercase tracking-widest block mb-1 ${
                      entry.type === 'consultation' ? 'text-primary' : entry.type === 'lab' ? 'text-tertiary' : 'text-on-surface-variant'
                    }`}>
                      {entry.type === 'consultation' ? 'Consultation' : entry.type === 'lab' ? 'Lab Report: Pathology' : 'Radiology'}
                    </span>
                    <span className="text-xs font-medium text-on-surface-variant block mb-3">• {entry.date}</span>
                    <h3 className="text-lg font-bold text-on-surface mb-2">{entry.title}</h3>
                    <p className="text-sm text-on-surface mb-4">{entry.summary}</p>
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
            <h3 className="text-center text-xl font-black uppercase tracking-tight text-error mb-2">Emergency Override</h3>
            <p className="text-center font-bold text-on-surface mb-6">Break-Glass Protocol — {patient.name}</p>

            <div className="bg-red-50 p-4 rounded-lg border border-error/20 mb-6 text-sm text-error/90 font-medium">
              All activities during emergency access are logged in the permanent audit trail and flagged for compliance review. Unauthorized use is subject to hospital policy.
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
                {breakGlassMutation.isPending ? 'Authenticating...' : 'Grant Access'}
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
