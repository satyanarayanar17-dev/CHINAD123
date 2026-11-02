import React, { useState } from 'react';
import { useCarePlanAdherence } from '../../hooks/queries/usePatientPortal';
import { useAuth } from '../../hooks/useAuth';
import { CheckCircle, Clock, Check, Loader2, HeartPulse } from 'lucide-react';
import { PatientPortalAPI } from '../../api/patientPortal';
import { useToast } from '../../components/ui/Toast';

export const CarePlanWidget = () => {
  const { user } = useAuth();
  const { push } = useToast();
  const { data: adherenceTasks = [], isLoading, refetch } = useCarePlanAdherence(user?.id || '');
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="p-6 bg-white rounded-xl shadow-sm text-center text-on-surface-variant text-sm flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading today's care plan...</div>;
  }

  if (adherenceTasks.length === 0) {
    return (
      <div className="bg-surface-container-lowest p-6 rounded-xl border border-surface-container flex flex-col items-center justify-center text-center">
        <HeartPulse size={32} className="text-primary/40 mb-3" />
        <h3 className="font-headline font-bold text-base text-on-surface">No Care Plan Tasks</h3>
        <p className="font-body text-xs text-on-surface-variant mt-1 max-w-sm">
          You don't have any prescribed activities, measurements, or medication tasks scheduled for today.
        </p>
      </div>
    );
  }

  const completedCount = adherenceTasks.filter(t => t.status === 'COMPLETED' || t.status === 'RECORDED').length;
  const progressPercent = Math.round((completedCount / adherenceTasks.length) * 100);
  
  const handleComplete = async (taskId: string, isReading: boolean = false) => {
    let value = null;
    if (isReading) {
      value = prompt('Enter the reading value (e.g., 105 for glucose mg/dL):');
      if (!value) return;
    }

    try {
      setSubmittingId(taskId);
      await PatientPortalAPI.recordAdherence(taskId, {
        status: isReading ? 'RECORDED' : 'COMPLETED',
        value
      });
      await refetch();
      push('success', 'Care Plan Updated', 'Your adherence has been recorded.');
    } catch (err: any) {
      push('error', 'Update Failed', err.message || 'Could not record task.');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm border border-surface-container overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-headline font-bold text-lg text-on-surface">Today's Care Plan</h2>
        <div className="text-right">
          <span className="text-sm font-bold text-primary font-headline">{completedCount} of {adherenceTasks.length} completed</span>
          <p className="text-xs text-on-surface-variant font-label">{progressPercent}% adherence today</p>
        </div>
      </div>

      <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden mb-6 flex">
        <div className="bg-primary h-full transition-all duration-500 rounded-full" style={{ width: `${progressPercent}%` }}></div>
      </div>

      <div className="space-y-3">
        {adherenceTasks.map(task => {
          const isDone = task.status === 'COMPLETED' || task.status === 'RECORDED';
          const isMissed = task.status === 'MISSED';
          const isPending = task.status === 'PENDING';
          const isReading = task.task_type === 'READING';
          
          return (
            <div key={task.id} className={`flex items-center justify-between p-3 rounded-lg border ${isDone ? 'border-primary/20 bg-primary/5' : isMissed ? 'border-error/20 bg-error/5' : 'border-outline/20 bg-surface-container-lowest'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDone ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                  {isDone ? <Check size={16} /> : <Clock size={16} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className={`font-semibold text-sm ${isDone ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>{task.title}</h4>
                    {isMissed && <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-sm bg-error/10 text-error">Missed</span>}
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    {task.description ? `${task.description} • ` : ''}Due {task.due_time || 'Today'}
                  </p>
                  {isDone && task.recorded_value && (
                    <p className="text-xs font-bold text-primary mt-1">Recorded: {task.recorded_value}</p>
                  )}
                </div>
              </div>

              {!isDone && (
                <button
                  disabled={submittingId === task.id}
                  onClick={() => handleComplete(task.id, isReading)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-on-primary hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {submittingId === task.id ? 'Saving...' : (isReading ? 'Record' : 'Mark Done')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
