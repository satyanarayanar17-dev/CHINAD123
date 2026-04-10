import React, { useState } from 'react';
import { Calendar, MapPin, X, AlertCircle, Clock, History } from 'lucide-react';
import { useMyAppointments } from '../../hooks/queries/usePatientPortal';
import { useToast, ToastContainer } from '../../components/ui/Toast';
import { EmptyState } from '../../components/ui/EmptyState';
import { getDateBadgeParts } from '../../api/contracts';
import type { PatientAppointment } from '../../store/mockData';

const SPECIALTIES = ['General Medicine', 'Cardiology', 'Orthopedics', 'Pathology', 'Radiology', 'Dermatology'];

export const PatientAppointments = () => {
  const { data: appointments = [], isLoading } = useMyAppointments();
  const { toasts, push, dismiss } = useToast();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [showBooking, setShowBooking] = useState(false);
  const [specialty, setSpecialty] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [booked, setBooked] = useState(false);

  const upcoming = appointments.filter((a) => a.status === 'UPCOMING');
  const past = appointments.filter((a) => a.status !== 'UPCOMING');

  const displayList = tab === 'upcoming' ? upcoming : past;

  const handleBook = () => {
    if (!specialty || !date) return;
    push('error', 'Booking Unavailable', 'The external patient scheduling API is offline. Call the clinic directly.');
    setTimeout(() => {
      setShowBooking(false);
      setSpecialty(''); setDate(''); setReason('');
    }, 1500);
  };

  const handleCancel = (id: string) => {
    push('error', 'Cancellation Offline', 'Cannot mutate remote schedule. Please contact administration directly.');
  };

  const handleReschedule = (id: string) => {
    push('error', 'Rescheduling Offline', 'Self-service rescheduling is not currently integrated.');
  };

  return (
    <div className="space-y-6 relative">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-on-surface">Appointments</h1>
          <p className="text-sm text-on-surface-variant">Manage your upcoming and past visits</p>
        </div>
        <button
          onClick={() => setShowBooking(true)}
          className="bg-primary text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:brightness-110 transition-all shadow-sm shadow-primary/20 flex items-center gap-2"
        >
          <Calendar size={16} /> Book Appointment
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(['upcoming', 'past'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
              tab === t ? 'bg-white text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t} ({t === 'upcoming' ? upcoming.length : past.length})
          </button>
        ))}
      </div>

      {/* Appointment Cards */}
      <div className="space-y-4">
        {displayList.length > 0 ? (
          displayList.map((appt: PatientAppointment) => {
            const dateBadge = getDateBadgeParts(appt.date);
            return (
            <div key={appt.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-start gap-5 hover:shadow-md transition-shadow">
              {/* Date block */}
              <div className={`shrink-0 w-16 text-center rounded-xl p-2 ${
                appt.status === 'UPCOMING' ? 'bg-primary/10' : 'bg-gray-100'
              }`}>
                <div className="text-[10px] font-bold uppercase text-on-surface-variant">
                  {dateBadge.month}
                </div>
                <div className={`text-2xl font-extrabold ${appt.status === 'UPCOMING' ? 'text-primary' : 'text-on-surface-variant'}`}>
                  {dateBadge.day}
                </div>
                <div className="text-[10px] text-on-surface-variant font-semibold">
                  {dateBadge.year}
                </div>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-on-surface">{appt.doctor}</h3>
                    <p className="text-sm text-on-surface-variant">{appt.specialty}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                    appt.status === 'UPCOMING' ? 'bg-primary/10 text-primary'
                    : appt.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-gray-200 text-on-surface-variant'
                  }`}>
                    {appt.status}
                  </span>
                </div>
                <p className="text-sm text-on-surface mt-2">{appt.reason}</p>
                <div className="flex items-center gap-4 mt-3 text-xs text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} /> {appt.time}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin size={12} /> {appt.location}
                  </span>
                </div>
              </div>

              {/* Actions */}
              {appt.status === 'UPCOMING' && (
                <div className="flex flex-col gap-2 shrink-0">
                  <button 
                    onClick={() => handleReschedule(appt.id)}
                    className="text-xs font-bold px-4 py-2 bg-gray-100 text-on-surface rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1.5"
                  >
                    <Clock size={12} /> Reschedule
                  </button>
                  <button 
                    onClick={() => handleCancel(appt.id)}
                    className="text-xs font-bold px-4 py-2 bg-error/10 text-error rounded-lg hover:bg-error/20 transition-colors flex items-center gap-1.5"
                  >
                    <AlertCircle size={12} /> Cancel
                  </button>
                </div>
              )}
            </div>
          )})
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <EmptyState
              icon={tab === 'upcoming' ? Calendar : History}
              title={tab === 'upcoming' ? 'No upcoming appointments' : 'No past appointments'}
              description={tab === 'upcoming' 
                ? 'Your schedule is currently clear. You can request a new appointment with any specialist.' 
                : 'You have no historical appointments recorded in the portal.'}
              action={tab === 'upcoming' ? {
                label: 'Book Appointment',
                onClick: () => setShowBooking(true)
              } : undefined}
            />
          </div>
        )}
      </div>

      {/* Booking Modal */}
      {showBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-extrabold text-on-surface">Book New Appointment</h2>
              <button onClick={() => setShowBooking(false)} className="text-on-surface-variant hover:text-on-surface transition-colors">
                <X size={20} />
              </button>
            </div>

            {booked ? (
              <div className="text-center py-8">
                <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar size={28} className="text-emerald-600" />
                </div>
                <h3 className="font-bold text-on-surface text-lg mb-1">Appointment Requested!</h3>
                <p className="text-sm text-on-surface-variant">You'll receive a confirmation once the hospital approves your slot.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-on-surface-variant uppercase mb-1.5 block">Specialty</label>
                  <select
                    value={specialty}
                    onChange={e => setSpecialty(e.target.value)}
                    className="w-full border border-outline rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors bg-white"
                  >
                    <option value="">Select specialty…</option>
                    {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-on-surface-variant uppercase mb-1.5 block">Preferred Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full border border-outline rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-on-surface-variant uppercase mb-1.5 block">Reason for Visit</label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Briefly describe your symptoms or reason…"
                    rows={3}
                    className="w-full border border-outline rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors resize-none"
                  />
                </div>

                <button
                  onClick={handleBook}
                  disabled={!specialty || !date}
                  className="w-full bg-primary text-white font-bold py-3 rounded-xl text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Request Appointment
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
