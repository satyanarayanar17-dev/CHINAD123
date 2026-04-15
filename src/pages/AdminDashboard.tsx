import React from 'react';
import { Card, CardHeader } from '../components/ui/Card';
import { Users } from 'lucide-react';
import { useToast, ToastContainer } from '../components/ui/Toast';
import { EmptyState } from '../components/ui/EmptyState';
import { useLiveQueue } from '../hooks/queries/useLiveQueue';
import type { AppointmentSlot } from '../types/clinical';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { PatientOnboarding } from './admin/PatientOnboarding';
import { PatientManagement } from './admin/PatientManagement';
import { UserManagement } from './admin/UserManagement';

const formatDashboardDate = () => {
  const d = new Date();
  return d.toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' });
};

export const AdminDashboard = () => {
  const { toasts, push, dismiss } = useToast();
  const { queue, isLoading, isError } = useLiveQueue();

  return (
    <div className="space-y-6 relative">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <div>
        <h3 className="text-on-surface-variant font-semibold text-sm tracking-wider uppercase">Institutional Dashboard — {formatDashboardDate()}</h3>
        <h1 className="text-3xl font-bold tracking-tight text-on-surface">Staff Operations</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Admin is acting as the temporary receptionist proxy in this pilot. No clinical authoring is performed here.
        </p>
      </div>

      {/* Live Queue Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 flex flex-col justify-center">
          <div className="flex justify-between items-center mb-2">
            <span className="text-on-surface-variant font-semibold text-xs uppercase tracking-wider">Active Queue</span>
            <Users className="text-primary" size={18}/>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-on-surface">{isLoading ? '—' : queue.length}</span>
            <span className="text-on-surface-variant text-xs font-bold">patients today</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col - Live Queue */}
        <div className="lg:col-span-2 space-y-6">
          <ErrorBoundary moduleName="Live Admin Queue">
          <Card>
            <CardHeader>Live Patient Queue</CardHeader>
            <div className="divide-y divide-outline/20">
              {isLoading ? (
                <div className="p-10 flex justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : isError ? (
                <div className="p-8 text-center text-error font-bold">Failed to connect to live queue.</div>
              ) : queue.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No Live Patients"
                  description="The clinical queue is currently empty. New check-ins will appear here."
                />
              ) : (
                queue.map((slot: AppointmentSlot, i: number) => (
                  <div key={slot.id || i} className="p-4 flex items-center gap-4 hover:bg-surface-container-low transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-sm text-on-surface">{slot.patient?.name || 'Anonymous'}</h4>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-extrabold uppercase ${
                          slot.status === 'DELAYED' ? 'bg-tertiary-container text-tertiary' : 'bg-primary-container text-primary'
                        }`}>
                          {slot.status === 'DELAYED' ? 'Urgent' : 'Routine'}
                        </span>
                      </div>
                      <span className="text-xs text-on-surface-variant">ID: #{slot.patient?.id || '???'} • {slot.specialty}</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold text-xs ${slot.status === 'DELAYED' ? 'text-error' : 'text-primary'}`}>
                        {slot.status === 'DELAYED' ? 'Delayed' : 'On Time'}
                      </span>
                      <span className="text-xs font-bold text-on-surface block">{slot.lifecycleStatus}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
          </ErrorBoundary>
        </div>

        {/* Right Col - Admin Tools */}
        <div className="lg:col-span-1 space-y-6">
          <ErrorBoundary moduleName="Staff Identity Management">
            <UserManagement />
          </ErrorBoundary>

          <ErrorBoundary moduleName="Patient Onboarding">
            <PatientOnboarding />
          </ErrorBoundary>

          <ErrorBoundary moduleName="Patient Demographics">
            <PatientManagement />
          </ErrorBoundary>
        </div>

      </div>
    </div>
  );
};
