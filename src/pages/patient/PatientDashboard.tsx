import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Pill, FileText, Clock, ChevronRight, CheckCircle, AlertCircle } from 'lucide-react';
import { usePatientDashboardData } from '../../hooks/queries/usePatientPortal';
import { useAuth } from '../../hooks/useAuth';

export const PatientDashboard = () => {
  const { user } = useAuth();
  const { appointments, prescriptions: activeMeds, records, isLoading } = usePatientDashboardData();
  const userName = user?.name || 'Patient';

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 animate-pulse">
        <div className="w-16 h-16 bg-primary/10 rounded-full mb-4 flex items-center justify-center">
           <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="font-bold text-on-surface-variant">Restoring your health records...</p>
      </div>
    );
  }

  const upcomingAppts = appointments.filter(a => a.status === 'UPCOMING');
  const pendingReports = records.filter(r => r.status === 'PROCESSING');
  const readyReports = records.filter(r => r.status === 'READY').slice(0, 2);

  return (
    <div className="space-y-8">

      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-6 text-white shadow-lg shadow-primary/20">
        <p className="text-white/70 text-sm font-medium mb-1">Good morning,</p>
        <h1 className="text-2xl font-extrabold mb-4">
          {userName} 👋
        </h1>
        {upcomingAppts.length > 0 && (
          <div className="bg-white/15 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-white/70 font-semibold mb-0.5 uppercase tracking-wider">Next Appointment</p>
              <p className="font-bold">{upcomingAppts[0].doctor}</p>
              <p className="text-sm text-white/80">{upcomingAppts[0].date} · {upcomingAppts[0].time}</p>
              <p className="text-xs text-white/60 mt-0.5">{upcomingAppts[0].location}</p>
            </div>
            <Link
              to="/patient/appointments"
              className="ml-4 bg-white text-primary text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-white/90 transition-colors shrink-0"
            >
              View Details
            </Link>
          </div>
        )}
      </div>

      {/* Quick Nav Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { to: '/patient/appointments', icon: <Calendar size={22} className="text-primary" />, label: 'Appointments', count: upcomingAppts.length, countLabel: 'upcoming', color: 'bg-primary/10' },
          { to: '/patient/prescriptions', icon: <Pill size={22} className="text-tertiary" />, label: 'Prescriptions', count: activeMeds.length, countLabel: 'active', color: 'bg-tertiary/10' },
          { to: '/patient/records', icon: <FileText size={22} className="text-emerald-600" />, label: 'Reports', count: readyReports.length, countLabel: 'ready', color: 'bg-emerald-100' },
          { to: '/patient/records', icon: <Clock size={22} className="text-amber-600" />, label: 'Pending', count: pendingReports.length, countLabel: 'in progress', color: 'bg-amber-100' },
        ].map(card => (
          <Link key={card.to + card.label} to={card.to} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all group">
            <div className={`w-10 h-10 ${card.color} rounded-xl flex items-center justify-center mb-3`}>
              {card.icon}
            </div>
            <div className="text-2xl font-extrabold text-on-surface">{card.count}</div>
            <div className="text-xs text-on-surface-variant font-semibold mt-0.5">{card.countLabel}</div>
            <div className="text-sm font-bold text-on-surface mt-1">{card.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Upcoming Appointments */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <Calendar size={18} className="text-primary" /> Upcoming Appointments
            </h2>
            <Link to="/patient/appointments" className="text-xs text-primary font-bold hover:underline">View All</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {upcomingAppts.length > 0 ? (
              upcomingAppts.map(appt => (
                <div key={appt.id} className="px-6 py-4 flex items-start justify-between hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="font-bold text-sm text-on-surface">{appt.doctor}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{appt.specialty} · {appt.reason}</p>
                    <p className="text-xs text-primary font-semibold mt-1">{appt.date} · {appt.time}</p>
                  </div>
                  <ChevronRight size={16} className="text-on-surface-variant mt-1 shrink-0" />
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center bg-gray-50/50">
                <p className="text-sm text-on-surface-variant font-medium">No upcoming appointments found.</p>
              </div>
            )}
          </div>
        </section>

        {/* Active Prescriptions */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <Pill size={18} className="text-tertiary" /> Active Prescriptions
            </h2>
            <Link to="/patient/prescriptions" className="text-xs text-primary font-bold hover:underline">View All</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {activeMeds.length > 0 ? (
              activeMeds.slice(0, 3).map(med => (
                <div key={med.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm text-on-surface">{med.medicine}</p>
                    <p className="text-xs text-on-surface-variant">{med.dose} · {med.frequency}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      med.daysRemaining <= 7 ? 'bg-error/10 text-error' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {med.daysRemaining}d remain
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center bg-gray-50/50">
                <p className="text-sm text-on-surface-variant font-medium">No active prescriptions.</p>
              </div>
            )}
          </div>
        </section>

        {/* Recent Reports */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <FileText size={18} className="text-emerald-600" /> Recent Reports
            </h2>
            <Link to="/patient/records" className="text-xs text-primary font-bold hover:underline">View All</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {records.length > 0 ? (
              records.slice(0, 3).map((report: any) => (
                <div key={report.id} className="px-6 py-4 flex items-center gap-4">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    report.status === 'READY' ? 'bg-emerald-100' : 'bg-amber-100'
                  }`}>
                    {report.status === 'READY'
                      ? <CheckCircle size={18} className="text-emerald-600" />
                      : <AlertCircle size={18} className="text-amber-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-on-surface truncate">{report.testName}</p>
                    <p className="text-xs text-on-surface-variant">{report.date} · {report.requestedBy}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                    report.status === 'READY'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {report.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center bg-gray-50/50">
                <p className="text-sm text-on-surface-variant font-medium">No recent reports found.</p>
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
};
