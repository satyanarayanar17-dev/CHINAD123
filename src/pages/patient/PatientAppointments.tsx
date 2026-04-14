import React, { useState } from 'react';
import { Calendar, MapPin, Clock, History } from 'lucide-react';
import { useMyAppointments } from '../../hooks/queries/usePatientPortal';
import { EmptyState } from '../../components/ui/EmptyState';
import { getDateBadgeParts } from '../../api/contracts';
import type { PatientAppointment } from '../../types/clinical';

export const PatientAppointments = () => {
  const { data: appointments = [], isLoading } = useMyAppointments();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const upcoming = appointments.filter((a) => a.status === 'UPCOMING');
  const past = appointments.filter((a) => a.status !== 'UPCOMING');

  const displayList = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-on-surface">Appointments</h1>
          <p className="text-sm text-on-surface-variant">Your upcoming and past visits</p>
        </div>
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

              {/* Status indicator */}
              {appt.status === 'UPCOMING' && (
                <div className="shrink-0">
                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-lg">Confirmed</span>
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
              action={undefined}
            />
          </div>
        )}
      </div>

      <p className="text-xs text-on-surface-variant text-center mt-4">To book, cancel, or reschedule appointments, please call the clinic directly at <span className="font-bold text-on-surface">+91 44 4741 1000</span>.</p>
    </div>
  );
};
