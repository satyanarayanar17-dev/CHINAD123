import React, { useState } from 'react';
import { StatusChip } from '../components/ui/StatusChip';
import { Card } from '../components/ui/Card';
import { Calendar, CheckCircle, Clock, Search, Filter, ChevronDown, User, AlertCircle } from 'lucide-react';
import { useLiveQueue } from '../hooks/queries/useLiveQueue';
import { useNavigate } from 'react-router-dom';
import { useToast, ToastContainer } from '../components/ui/Toast';
import type { AppointmentSlot } from '../types/clinical';
import { useAuth } from '../hooks/useAuth';

const SPECIALTIES = ['All', 'Cardiology', 'General Medicine', 'Orthopedics'];
const FALLBACK_SLOT_STATUS = { cls: 'text-gray-500', border: 'border-l-gray-300' };
const FALLBACK_LIFECYCLE = { label: 'Unknown', variant: 'surface' as const };

function getPatientName(slot: AppointmentSlot) {
  return slot?.patient?.name || 'Unknown Patient';
}

function getPatientId(slot: AppointmentSlot) {
  return slot?.patient?.id || 'Unknown ID';
}

function getPatientInitials(slot: AppointmentSlot) {
  if (slot?.patient?.initials) {
    return slot.patient.initials;
  }

  const patientName = getPatientName(slot);
  return patientName
    .split(' ')
    .filter((word: string) => Boolean(word))
    .map((word: string) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'NA';
}

export const DoctorAppointments = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toasts, push, dismiss } = useToast();
  const { queue, updateSlotStatus, isLoading, isError } = useLiveQueue();
  
  const [filterSpec, setFilterSpec] = useState('All');
  const [rescheduleSlot, setRescheduleSlot] = useState<AppointmentSlot | null>(null);
  const [newTime, setNewTime] = useState('');
  const [search, setSearch] = useState('');

  const filtered = queue.filter((s) => {
    const patientName = getPatientName(s);
    const patientId = getPatientId(s);
    const matchSpec = filterSpec === 'All' || (s.specialty || 'General Medicine') === filterSpec;
    const matchSearch =
      patientName.toLowerCase().includes(search.toLowerCase()) ||
      patientId.toLowerCase().includes(search.toLowerCase());
    return matchSpec && matchSearch;
  });

  const approve = (slot: AppointmentSlot) => {
    updateSlotStatus(slot.id, 'RECEPTION', slot.__v || 1);
  };

  const confirmReschedule = () => {
    push('warning', 'Adjustment Offline', 'Schedule adjustment requires backend integration. Contact admin.');
    setRescheduleSlot(null);
    setNewTime('');
  };

  const statusConfig = {
    AWAITING: { label: 'Awaiting', variant: 'surface' as const },
    RECEPTION: { label: 'Checked-in', variant: 'secondary' as const },
    IN_CONSULTATION: { label: 'In-Consultation', variant: 'primary' as const },
    DISCHARGED: { label: 'Discharged', variant: 'success' as const },
  };

  const slotStatus = {
    DELAYED: { cls: 'text-error', border: 'border-l-error' },
    ON_TIME: { cls: 'text-primary', border: 'border-l-primary' },
    EARLY: { cls: 'text-green-600', border: 'border-l-green-400' },
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-primary font-semibold text-xs uppercase tracking-widest">Doctor</h3>
          <h1 className="text-3xl font-bold text-on-surface">Queue Management</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Only patients assigned to {user?.name || 'the signed-in doctor'} appear here. Calendar scheduling is intentionally out of scope for this pilot.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-on-surface-variant" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search patient…"
              className="pl-9 pr-4 py-2 text-sm border border-outline rounded-xl outline-none focus:border-primary bg-white w-52"
            />
          </div>
          {/* Specialty filter */}
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-2.5 text-on-surface-variant" />
            <select
              value={filterSpec}
              onChange={e => setFilterSpec(e.target.value)}
              className="pl-8 pr-8 py-2 text-sm border border-outline rounded-xl outline-none focus:border-primary bg-white appearance-none cursor-pointer"
            >
              {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-2.5 text-on-surface-variant pointer-events-none" />
          </div>
        </div>
      </div>

      {isLoading || isError ? (
        <div className="flex flex-col items-center p-20">
          {isLoading ? (
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          ) : (
            <div className="text-center text-error space-y-2">
              <AlertCircle size={32} className="mx-auto" />
              <p className="font-bold">Error loading dispatch queue.</p>
            </div>
          )}
        </div>
      ) : (
        <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total', count: queue.length, color: 'text-on-surface' },
            { label: 'Awaiting', count: queue.filter((s) => s.lifecycleStatus === 'AWAITING').length, color: 'text-on-surface-variant' },
            { label: 'In Progress', count: queue.filter((s) => s.lifecycleStatus === 'IN_CONSULTATION').length, color: 'text-primary' },
            { label: 'Checked-in', count: queue.filter((s) => s.lifecycleStatus === 'RECEPTION').length, color: 'text-tertiary' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
              <div className={`text-3xl font-extrabold ${stat.color}`}>{stat.count}</div>
              <div className="text-xs font-semibold text-on-surface-variant mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

      {/* Appointment Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline/30 bg-surface-container-low text-left">
                <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-on-surface-variant">Time</th>
                <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-on-surface-variant">Patient</th>
                <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-on-surface-variant">Type / Specialty</th>
                <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-on-surface-variant">Status</th>
                <th className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-on-surface-variant">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline/20">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-on-surface-variant text-sm">No appointments match your filter.</td>
                </tr>
              )}
              {filtered.map(slot => {
                const st = slotStatus[slot.status] || FALLBACK_SLOT_STATUS;
                const chip = statusConfig[slot.lifecycleStatus] || {
                  ...FALLBACK_LIFECYCLE,
                  label: slot.lifecycleStatus || FALLBACK_LIFECYCLE.label,
                };
                const patientName = getPatientName(slot);
                const patientId = getPatientId(slot);
                const patientInitials = getPatientInitials(slot);
                return (
                  <tr key={slot.id} className={`hover:bg-surface-container-low/60 border-l-4 ${st.border} transition-colors`}>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="font-bold text-on-surface">{slot.time || 'TBD'}</div>
                      <div className={`text-[10px] font-bold uppercase ${st.cls}`}>{slot.status || 'UNKNOWN'}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                          {patientInitials}
                        </div>
                        <div>
                          <div className="font-bold text-on-surface">{patientName}</div>
                          <div className="text-xs text-on-surface-variant">{patientId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-on-surface">{slot.type || 'General Review'}</div>
                      <div className="text-xs text-on-surface-variant">{slot.specialty || 'General Medicine'}</div>
                      {slot.chiefComplaint && (
                        <div className="mt-1 text-xs text-on-surface-variant">{slot.chiefComplaint}</div>
                      )}
                      {slot.assignedDoctor && (
                        <div className="mt-1 text-[11px] font-semibold text-primary">Assigned: {slot.assignedDoctor.name}</div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <StatusChip variant={chip.variant} label={chip.label} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => navigate(`/clinical/patient/${patientId}/dossier`)}
                          disabled={!slot?.patient?.id}
                          className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:brightness-110 transition-colors"
                        >
                          Open Chart
                        </button>
                        {slot.lifecycleStatus === 'AWAITING' && (
                          <button
                            onClick={() => approve(slot)}
                            className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-200 transition-colors flex items-center gap-1"
                          >
                            <CheckCircle size={13} /> Approve
                          </button>
                        )}
                          <button
                            onClick={() => setRescheduleSlot(slot)}
                            className="px-3 py-1.5 bg-gray-100 text-on-surface-variant text-xs font-bold rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1"
                          >
                            <Clock size={13} /> Adjust Queue
                          </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Reschedule Modal */}
      {rescheduleSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6">
            <h2 className="text-lg font-extrabold mb-1">Adjust Queue Timing</h2>
            <p className="text-sm text-on-surface-variant mb-5 flex items-center gap-2">
              <User size={14} /> {rescheduleSlot.patient.name} — {rescheduleSlot.type}
            </p>
            <div className="mb-5">
                  <label className="text-xs font-bold uppercase text-on-surface-variant mb-1.5 block">Queue Time Placeholder</label>
              <input
                type="time"
                value={newTime}
                onChange={e => setNewTime(e.target.value)}
                className="w-full border border-outline rounded-xl px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setRescheduleSlot(null); setNewTime(''); }}
                className="flex-1 border border-outline py-3 rounded-xl text-sm font-bold hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmReschedule}
                disabled={!newTime}
                className="flex-1 bg-primary text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50 hover:brightness-110 transition-colors"
              >
                Confirm
              </button>
            </div>
            <p className="mt-4 text-xs text-on-surface-variant">
              Calendar scheduling is not part of the pilot yet. This control remains queue-only.
            </p>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};
