import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/Card';
import { StatusChip } from '../components/ui/StatusChip';
import { AlertTriangle, ClipboardList, Activity, ActivitySquare, ChevronDown, RefreshCw } from 'lucide-react';
import { useLiveQueue } from '../hooks/queries/useLiveQueue';
import { clinicalApi } from '../api/clinical';
import type { AppointmentSlot } from '../types/clinical';
import { useToast, ToastContainer } from '../components/ui/Toast';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { useAuth } from '../hooks/useAuth';

export const DoctorCommandCenter = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toasts, push, dismiss } = useToast();
  const [showFilter, setShowFilter] = useState(false);
  const [filter, setFilter] = useState('All');
  const { queue, updateSlotStatus, refetchQueue, isLoading, isError } = useLiveQueue();

  const openChart = (patientId: string) => {
    navigate(`/clinical/patient/${patientId}/dossier`);
  };

  const handleDischarge = async (slot: AppointmentSlot) => {
    try {
      await clinicalApi.dischargeEncounter(slot.id);
      await refetchQueue();
      push('success', 'Patient Discharged', 'Visit cycle completed successfully.');
    } catch (error: any) {
      push('error', 'Discharge Failed', error.response?.data?.message || 'Could not discharge patient.');
    }
  };

  const handleStartConsultation = (slot: AppointmentSlot) => {
    if (slot.lifecycleStatus !== 'IN_CONSULTATION') {
      updateSlotStatus(slot.id, 'IN_CONSULTATION', slot.__v || 1);
    }
    openChart(slot.patient.id);
  };

  const filteredQueue = filter === 'All' 
    ? queue 
    : queue.filter(slot => slot.specialty === filter);
  const activeConsultation = queue.find((slot) => slot.lifecycleStatus === 'IN_CONSULTATION') || null;
  const nextWaitingPatient = queue.find((slot) => slot.lifecycleStatus === 'AWAITING' || slot.lifecycleStatus === 'RECEPTION');
  const waitingCount = queue.filter((slot) => slot.lifecycleStatus === 'AWAITING' || slot.lifecycleStatus === 'RECEPTION').length;
  const dischargedCount = queue.filter((slot) => slot.lifecycleStatus === 'DISCHARGED').length;

  return (
    <div className="space-y-6 relative">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <div>
        <h3 className="text-primary font-semibold text-sm tracking-wider uppercase">Operational Command</h3>
        <h1 className="text-3xl font-bold tracking-tight text-on-surface">Doctor Command Center</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Showing only patients assigned to {user?.name || 'the signed-in doctor'}.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Col — Alerts */}
        <div className="lg:col-span-1 space-y-6">
          <ErrorBoundary moduleName="Clinical Alerts Board">
            <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
              <AlertTriangle className="text-error" /> Action Required
            </h2>

            <Card>
              {activeConsultation ? (
                <div className="p-4 border-l-4 border-error/80 bg-error/5">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-error font-bold text-xs uppercase tracking-widest">Active Consultation</span>
                    <span className="bg-error text-white px-2 py-0.5 rounded text-[10px] font-bold">{activeConsultation.lifecycleStatus}</span>
                  </div>
                  <p className="text-sm font-bold text-on-surface mb-1">
                    Patient: {activeConsultation.patient.name}
                  </p>
                  <p className="text-xs text-error font-medium">{activeConsultation.type} · {activeConsultation.specialty}</p>
                  {activeConsultation.chiefComplaint && (
                    <p className="mt-2 text-xs text-on-surface-variant">
                      Chief complaint: {activeConsultation.chiefComplaint}
                    </p>
                  )}
                  <button
                    onClick={() => openChart(activeConsultation.patient.id)}
                    className="mt-3 text-xs font-bold text-primary hover:underline"
                  >
                    Resume Chart →
                  </button>
                </div>
              ) : (
                <div className="p-4 border-l-4 border-outline/40 bg-surface-container-low">
                  <span className="text-on-surface-variant font-bold text-xs uppercase tracking-widest">No active consults</span>
                  <p className="text-sm text-on-surface-variant mt-2">The doctor queue is currently clear.</p>
                </div>
              )}

              {nextWaitingPatient && (
                <div className="p-4 border-t border-outline/20 border-l-4 border-primary/80 bg-primary/5">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-primary font-bold text-xs uppercase tracking-widest">Next In Queue</span>
                    <span className="bg-primary text-white px-2 py-0.5 rounded text-[10px] font-bold">{nextWaitingPatient.lifecycleStatus}</span>
                  </div>
                  <p className="text-sm font-bold text-on-surface mb-1">
                    Patient: {nextWaitingPatient.patient.name}
                  </p>
                  <p className="text-xs text-primary font-medium flex items-center gap-1">
                    <Activity size={14} /> {nextWaitingPatient.type} · {nextWaitingPatient.specialty}
                  </p>
                  {nextWaitingPatient.chiefComplaint && (
                    <p className="mt-2 text-xs text-on-surface-variant">
                      Chief complaint: {nextWaitingPatient.chiefComplaint}
                    </p>
                  )}
                  <button
                    onClick={() => handleStartConsultation(nextWaitingPatient)}
                    className="mt-3 text-xs font-bold text-primary hover:underline"
                  >
                    Open Chart →
                  </button>
                </div>
              )}
            </Card>
          </ErrorBoundary>

          <ErrorBoundary moduleName="Queue Snapshot">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="space-y-4">
                <h3 className="text-lg font-bold">Queue Snapshot</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-outline/20 bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Waiting</p>
                    <p className="mt-2 text-2xl font-bold text-on-surface">{waitingCount}</p>
                  </div>
                  <div className="rounded-xl border border-outline/20 bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">In Consult</p>
                    <p className="mt-2 text-2xl font-bold text-on-surface">{activeConsultation ? 1 : 0}</p>
                  </div>
                  <div className="rounded-xl border border-outline/20 bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Completed</p>
                    <p className="mt-2 text-2xl font-bold text-on-surface">{dischargedCount}</p>
                  </div>
                </div>
                <p className="text-xs text-on-surface-variant">
                  This panel reflects the signed-in doctor's live assigned queue only. No predictive or disconnected actions are shown.
                </p>
              </CardContent>
            </Card>
          </ErrorBoundary>
        </div>

        {/* Right Col — Queue */}
        <div className="lg:col-span-2 space-y-6">
          <ErrorBoundary moduleName="Live Appointment Queue">
            <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-on-surface">
              Assigned Doctor Queue
              <span className="ml-2 text-sm font-normal text-on-surface-variant">
                ({queue.length} patients)
              </span>
            </h2>
            <div className="flex gap-2 relative">
              <button
                type="button"
                onClick={() => { void refetchQueue(); }}
                title="Force refresh queue"
                className="rounded-full border border-outline bg-white p-2 text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors"
              >
                <RefreshCw size={14} />
              </button>
              <div className="relative">
                <button 
                  onClick={() => setShowFilter(!showFilter)}
                  className="text-xs font-semibold px-4 py-1.5 bg-white border border-outline rounded-full text-on-surface-variant hover:bg-surface-container transition-colors flex items-center gap-1"
                >
                  Filter: {filter} <ChevronDown size={14} />
                </button>
                {showFilter && (
                  <div className="absolute top-full mt-1 right-0 bg-white border border-outline rounded-xl shadow-xl z-20 w-40 overflow-hidden">
                    {['All', 'Cardiology', 'General Medicine', 'Orthopedics'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => { setFilter(opt); setShowFilter(false); }}
                        className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-primary/5 hover:text-primary transition-colors border-b last:border-0 border-outline/10 text-on-surface-variant"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {isLoading ? (
              <div className="p-12 flex justify-center items-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
              </div>
            ) : isError ? (
              <div className="p-8 text-center text-error font-bold bg-error/10 rounded-xl">
                Error retrieving queue schedule.
              </div>
            ) : filteredQueue.length === 0 ? (
              <div className="text-center py-10 bg-surface-container/30 rounded-2xl border border-dashed border-outline/50">
                <p className="text-sm text-on-surface-variant">No patients found matching "{filter}" filter.</p>
              </div>
            ) : (
              filteredQueue.map((slot) => (
                <QueueRow 
                  key={slot.id} 
                  slot={slot} 
                  onOpen={() => handleStartConsultation(slot)} 
                  onDischarge={() => handleDischarge(slot)} 
                />
              ))
            )}
          </div>
          </ErrorBoundary>
        </div>

      </div>
    </div>
  );
};

// ─── Queue Row ──────────────────────────────────────────────────────────────

const statusConfig = {
  DELAYED: { label: 'Delayed', textClass: 'text-error', borderClass: 'border-l-error' },
  ON_TIME: { label: 'On-Time', textClass: 'text-primary', borderClass: 'border-l-primary' },
  EARLY: { label: 'Early', textClass: 'text-green-600', borderClass: 'border-l-green-400' },
};

const lifecycleChip: Record<string, { label: string; variant: 'primary' | 'secondary' | 'surface' | 'error' | 'success' | 'tertiary' }> = {
  AWAITING: { label: 'Awaiting', variant: 'surface' },
  RECEPTION: { label: 'Checked-in', variant: 'secondary' },
  IN_CONSULTATION: { label: 'In-Consultation', variant: 'primary' },
  DISCHARGED: { label: 'Discharged', variant: 'success' },
};

const QueueRow = ({ slot, onOpen, onDischarge }: { slot: AppointmentSlot; onOpen: () => void; onDischarge: () => void }) => {
  const st = statusConfig[slot.status] || { label: 'Unknown', textClass: 'text-gray-500', borderClass: 'border-l-gray-300' };
  const chip = lifecycleChip[slot.lifecycleStatus] || { label: slot.lifecycleStatus || 'Unknown', variant: 'surface' as const };
  const isActive = slot.lifecycleStatus === 'IN_CONSULTATION';

  return (
    <Card
      hoverable
      className={`flex items-center p-4 gap-4 border-l-4 ${st.borderClass} ${isActive ? 'shadow-md' : ''}`}
    >
      <div className="w-16 text-center">
        <div className="text-xl font-bold text-on-surface">{slot.time}</div>
        <div className={`text-[10px] font-bold uppercase ${st.textClass}`}>{st.label}</div>
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-on-surface">
          {slot.patient.name}
          <span className="text-on-surface-variant text-xs font-normal ml-2">ID: {slot.patient.id}</span>
        </h3>
        <div className="flex items-center gap-4 text-xs font-medium text-on-surface-variant mt-1.5">
          <span className="flex items-center gap-1">
            <ClipboardList size={13} /> {slot.type}
          </span>
          <span className="flex items-center gap-1">
            <ActivitySquare size={13} /> {slot.specialty}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {slot.triagePriority && <StatusChip variant={slot.triagePriority === 'IMMEDIATE' ? 'error' : slot.triagePriority === 'URGENT' ? 'tertiary' : slot.triagePriority === 'STANDARD' ? 'primary' : 'surface'} label={slot.triagePriority} />}
          {slot.assignedDoctor && <span className="text-on-surface-variant">Assigned: {slot.assignedDoctor.name}</span>}
        </div>
        {slot.chiefComplaint && (
          <p className="mt-2 text-sm text-on-surface-variant">{slot.chiefComplaint}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <StatusChip variant={chip.variant} label={chip.label} />
        {slot.lifecycleStatus !== 'DISCHARGED' && (
          <button
            onClick={(e) => { e.stopPropagation(); onDischarge(); }}
            className="px-4 py-2.5 rounded-lg text-sm font-bold border border-outline bg-white hover:bg-error/5 hover:text-error hover:border-error/30 transition-all text-on-surface-variant"
          >
            Discharge
          </button>
        )}
        <button
          onClick={onOpen}
          className={`px-5 py-2.5 rounded-lg text-sm font-bold border transition-all ${
            isActive
              ? 'bg-primary text-white border-primary shadow-sm hover:brightness-110'
              : 'bg-primary-container text-on-primary-container border-primary/20 hover:bg-primary hover:text-white'
          }`}
        >
          {isActive ? 'Resume Care' : 'Open Chart'}
        </button>
      </div>
    </Card>
  );
};
