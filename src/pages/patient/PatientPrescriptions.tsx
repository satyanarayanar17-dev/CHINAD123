import React from 'react';
import { Pill, Clock, AlertCircle, Bell, BellOff, Download, ChevronRight } from 'lucide-react';
import { useMyPrescriptions } from '../../hooks/queries/usePatientPortal';

export const PatientPrescriptions = () => {
  const { data: prescriptions = [], isLoading } = useMyPrescriptions();

  if (isLoading) return <div className="p-20 text-center animate-pulse font-bold text-on-surface-variant text-sm">Gathering your prescriptions...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-on-surface">Prescriptions</h1>
          <p className="text-sm text-on-surface-variant">Active medications and refill tracking</p>
        </div>
        <button className="flex items-center gap-2 text-primary font-bold text-sm bg-primary/5 px-4 py-2 rounded-xl hover:bg-primary/10 transition-colors">
          <Download size={16} /> Export Rx History
        </button>
      </div>

      {prescriptions.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {prescriptions.map((med: any) => (
            <div key={med.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition-all group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-tertiary/10 rounded-xl flex items-center justify-center text-tertiary group-hover:scale-110 transition-transform">
                    <Pill size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-on-surface">{med.medicine}</h3>
                    <p className="text-xs text-on-surface-variant font-medium">{med.prescribedBy}</p>
                  </div>
                </div>
                <button className="p-2 text-on-surface-variant hover:bg-gray-100 rounded-lg transition-colors">
                  {med.reminderEnabled ? <Bell size={18} className="text-primary" /> : <BellOff size={18} />}
                </button>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between mb-4">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-on-surface-variant leading-none">Dosage & Frequency</p>
                  <p className="text-sm font-bold text-on-surface">{med.dose}</p>
                  <p className="text-xs text-on-surface-variant">{med.frequency}</p>
                </div>
                <div className="bg-white p-2 rounded-lg border border-gray-100 text-center min-w-[70px]">
                  <p className="text-[9px] font-bold text-on-surface-variant uppercase">Remains</p>
                  <p className={`text-lg font-black ${med.daysRemaining <= 7 ? 'text-error' : 'text-on-surface'}`}>
                    {med.daysRemaining}d
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-semibold text-on-surface-variant border-t border-gray-50 pt-4">
                <span className="flex items-center gap-1.5">
                  <Clock size={14} /> Next Refill: {med.refillDate}
                </span>
                <button className="text-primary hover:underline flex items-center gap-1">
                  Details <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white p-12 rounded-3xl border border-dashed border-gray-200 text-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
            <Pill size={32} />
          </div>
          <h2 className="text-lg font-bold text-on-surface">No Active Prescriptions</h2>
          <p className="text-on-surface-variant text-sm mt-1 max-w-xs mx-auto">
            You don't have any registered active medications.
          </p>
        </div>
      )}
    </div>
  );
};
