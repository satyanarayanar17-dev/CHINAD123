import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { StatusChip } from '../components/ui/StatusChip';
import { Wallet, Users, Clock, AlertCircle, FileText, ChevronRight, LogOut } from 'lucide-react';
import { useToast, ToastContainer } from '../components/ui/Toast';
import { EmptyState } from '../components/ui/EmptyState';
import { useLiveQueue } from '../hooks/queries/useLiveQueue';
import type { AppointmentSlot } from '../store/mockData';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { UserManagement } from './admin/UserManagement';

export const AdminDashboard = () => {
  const { toasts, push, dismiss } = useToast();
  const { queue, isLoading, isError } = useLiveQueue();

  const handleBillNow = (name: string) => {
    push('error', 'Billing Offline', 'Legacy connection required. Payment gateway is disconnected.');
  };

  const handleSchedule = (name: string) => {
    push('warning', 'Scheduler Unavailable', 'Please manually log this follow-up in the registry.');
  };

  const handleRetryOCR = () => {
    push('error', 'OCR Offline', 'Optical recognition engine cannot be reached.');
  };

  const handleLoadFullQueue = () => {
    push('warning', 'Sync Failed', 'HMIS database connection refused. Working from local cache only.');
  };

  return (
    <div className="space-y-6 relative">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <div>
        <h3 className="text-on-surface-variant font-semibold text-sm tracking-wider uppercase">Institutional Dashboard — Monday, Oct 23</h3>
        <h1 className="text-3xl font-bold tracking-tight text-on-surface">Staff Operations</h1>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 flex flex-col justify-center">
          <div className="flex justify-between items-center mb-2">
            <span className="text-on-surface-variant font-semibold text-xs uppercase tracking-wider">Active Check-ins</span>
            <Users className="text-primary" size={18}/>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-on-surface">142</span>
            <span className="text-primary text-xs font-bold">+12% vs avg</span>
          </div>
        </Card>
        
        <Card className="p-4 flex flex-col justify-center">
          <div className="flex justify-between items-center mb-2">
            <span className="text-on-surface-variant font-semibold text-xs uppercase tracking-wider">Avg Wait Time</span>
            <Clock className="text-tertiary" size={18}/>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-on-surface">18m</span>
            <span className="text-tertiary text-xs font-bold">Delayed</span>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-center">
          <div className="flex justify-between items-center mb-2">
            <span className="text-on-surface-variant font-semibold text-xs uppercase tracking-wider">Pending Billing</span>
            <Wallet className="text-primary" size={18}/>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-on-surface">₹28.4k</span>
            <span className="text-on-surface-variant text-xs font-bold">14 invoices</span>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-center bg-tertiary/5 border-tertiary/20">
          <div className="flex justify-between items-center mb-2">
            <span className="text-on-surface-variant font-semibold text-xs uppercase tracking-wider">Discharge Today</span>
            <LogOut className="text-tertiary" size={18}/>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-on-surface">18</span>
            <span className="text-tertiary text-xs font-bold">6 pending</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col - Admin Queues */}
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
                queue.slice(0, 5).map((slot: AppointmentSlot, i: number) => (
                  <div key={i} className="p-4 flex items-center gap-4 hover:bg-surface-container-low transition-colors">
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
                      <div className="text-sm font-medium">Dr. {slot.specialty === 'Cardiology' ? 'V. Raman' : 'S. Nair'} <span className={`font-bold text-xs ml-1 ${slot.status === 'DELAYED' ? 'text-error' : 'text-primary'}`}>
                        {slot.status === 'DELAYED' ? 'Delayed 15m' : 'On Time'}
                      </span></div>
                      <span className="text-xs font-bold text-on-surface">{slot.lifecycleStatus === 'RECEPTION' ? 'Waiting' : 'Room 302'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 border-t border-outline/20 text-center">
              <button 
                onClick={handleLoadFullQueue}
                className="text-primary text-xs font-bold hover:underline"
              >
                View Full Queue ({Math.max(0, queue.length - 5)} more)
              </button>
            </div>
          </Card>
          </ErrorBoundary>

          <ErrorBoundary moduleName="Billing Dashboard">
          <Card>
            <CardHeader>Unsettled Billing</CardHeader>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold">Rahul Verma <span className="text-xs font-normal text-on-surface-variant ml-2">Inv #88122</span></div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold">₹4,200</span>
                  <button 
                    onClick={() => handleBillNow('Rahul Verma')}
                    className="text-primary text-[10px] font-bold uppercase hover:underline"
                  >
                    Bill Now
                  </button>
                </div>
              </div>
            </div>
          </Card>
          </ErrorBoundary>
        </div>

        {/* Right Col - Admin Tools */}
        <div className="lg:col-span-1 space-y-6">
          <ErrorBoundary moduleName="Scheduler Operations">
          <Card>
            <CardContent className="space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-wide text-on-surface-variant">Pending Follow-ups</h3>
              
              <div className="flex items-center justify-between py-2 border-b border-outline/20">
                <div className="text-sm font-medium">Anjali R. <span className="text-xs text-on-surface-variant block">Req: 1 week</span></div>
                <button 
                  onClick={() => handleSchedule('Anjali R.')}
                  className="bg-primary/10 text-primary px-3 py-1 rounded text-[10px] font-bold hover:bg-primary hover:text-white transition-colors"
                >
                  Schedule
                </button>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-outline/20">
                <div className="text-sm font-medium">Vikram S. <span className="text-xs text-on-surface-variant block">Req: 3 days</span></div>
                <button 
                  onClick={() => handleSchedule('Vikram S.')}
                  className="bg-primary/10 text-primary px-3 py-1 rounded text-[10px] font-bold hover:bg-primary hover:text-white transition-colors"
                >
                  Schedule
                </button>
              </div>

              <button 
                onClick={() => push('info', 'Redirecting', 'Loading full request module...')}
                className="w-full text-primary text-[10px] font-bold uppercase hover:underline mt-2"
              >
                View All Requests
              </button>
            </CardContent>
          </Card>
          </ErrorBoundary>

          <ErrorBoundary moduleName="Staff Identity Management">
            <UserManagement />
          </ErrorBoundary>
        </div>

      </div>
    </div>
  );
};
