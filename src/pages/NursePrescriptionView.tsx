import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Pill, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { StatusChip } from '../components/ui/StatusChip';
import { useToast, ToastContainer } from '../components/ui/Toast';
import { clinicalApi } from '../api/clinical';
import { usePatient } from '../hooks/queries/usePatients';

function parsePrescriptionContent(rawContent: string | null | undefined) {
  if (!rawContent) {
    return { medications: [], labs: [] };
  }

  try {
    const parsed = JSON.parse(rawContent);
    return {
      medications: Array.isArray(parsed.newRx) ? parsed.newRx : [],
      labs: Array.isArray(parsed.selectedLabs) ? parsed.selectedLabs : [],
    };
  } catch {
    return {
      medications: [],
      labs: [],
    };
  }
}

export const NursePrescriptionView = () => {
  const { patientId, prescriptionId } = useParams<{ patientId: string; prescriptionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toasts, push, dismiss } = useToast();
  const [dispensingNote, setDispensingNote] = useState('');

  const { data: patient, isLoading: isPatientLoading } = usePatient(patientId!);
  const {
    data: prescription,
    isLoading: isPrescriptionLoading,
    isError: isPrescriptionError,
    error,
  } = useQuery({
    queryKey: ['operationalPrescription', prescriptionId],
    queryFn: () => clinicalApi.getPrescription(prescriptionId!),
    enabled: Boolean(prescriptionId),
  });

  const content = useMemo(
    () => parsePrescriptionContent(prescription?.rx_content),
    [prescription?.rx_content]
  );

  const handoverMutation = useMutation({
    mutationFn: () => clinicalApi.markPrescriptionHandedOver(prescriptionId!, dispensingNote.trim()),
    onSuccess: () => {
      push('success', 'Prescription Handed Over', 'Dispensing handover has been recorded successfully.');
      queryClient.invalidateQueries({ queryKey: ['operationalPrescription', prescriptionId] });
      queryClient.invalidateQueries({ queryKey: ['patientTimeline', patientId] });
    },
    onError: (mutationError: any) => {
      push('error', 'Handover Failed', mutationError.response?.data?.error?.message || 'Could not record prescription handover.');
    }
  });

  const handlePrint = () => {
    const printClass = 'print-prescription';
    const cleanup = () => {
      document.body.classList.remove(printClass);
      window.removeEventListener('afterprint', cleanup);
    };

    document.body.classList.add(printClass);
    window.addEventListener('afterprint', cleanup);
    window.print();
    window.setTimeout(cleanup, 1000);
  };

  const isLoading = isPatientLoading || isPrescriptionLoading;

  return (
    <div className="space-y-6 max-w-5xl mx-auto relative">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {isLoading ? (
        <div className="rounded-xl border border-outline/20 bg-white p-12 text-center font-semibold text-on-surface-variant">
          Loading authorized prescription...
        </div>
      ) : isPrescriptionError || !prescription || !patient ? (
        <Card>
          <CardContent className="py-16 text-center">
            <AlertCircle size={32} className="mx-auto mb-3 text-error" />
            <h2 className="text-lg font-bold text-on-surface">Prescription Unavailable</h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              {error && typeof error === 'object' && 'response' in error
                ? (error as any).response?.data?.error?.message || 'This prescription could not be opened.'
                : 'This prescription could not be opened.'}
            </p>
            <button
              type="button"
              onClick={() => navigate(`/clinical/patient/${patientId}/dossier`)}
              className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:brightness-110"
            >
              Back To Dossier
            </button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-outline/30 bg-surface p-4 shadow-sm">
            <div>
              <Link to={`/clinical/patient/${patientId}/dossier`} className="inline-flex items-center gap-1 text-sm font-semibold text-on-surface-variant hover:text-primary">
                <ArrowLeft size={14} /> Back To Dossier
              </Link>
              <h1 className="mt-2 text-2xl font-bold text-on-surface">Authorized Prescription</h1>
              <p className="mt-1 text-sm text-on-surface-variant">{patient.name} · {patient.mrn}</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-lg border border-outline bg-white px-4 py-2 text-sm font-bold hover:bg-surface-container"
              >
                <Printer size={16} />
                Print
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>Medication Orders</CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <StatusChip variant="success" label={prescription.status || 'AUTHORIZED'} />
                  <span className="text-sm text-on-surface-variant">Authorized by {prescription.authorizing_user_id || 'Doctor'}</span>
                </div>

                {content.medications.length === 0 ? (
                  <div className="rounded-xl border border-outline/20 bg-surface-container-low p-4 text-sm text-on-surface-variant">
                    No structured medication lines were found in this prescription.
                  </div>
                ) : (
                  content.medications.map((medication: any, index: number) => (
                    <div key={`${medication.name}-${index}`} className="rounded-xl border border-outline/20 bg-surface-container-low p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 rounded-lg bg-primary/10 p-2 text-primary">
                          <Pill size={16} />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-on-surface">{medication.name || 'Medication'}</p>
                          <p className="mt-1 text-sm text-on-surface-variant">
                            {medication.strength || medication.dose || 'As prescribed'} · {medication.frequency || 'As directed'}
                          </p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            Route: {medication.route || 'Oral'} · Duration: {medication.duration ? `${medication.duration} days` : 'As directed'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {content.labs.length > 0 && (
                  <div className="rounded-xl border border-outline/20 bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Linked Lab Orders</p>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-on-surface">
                      {content.labs.map((lab: string) => (
                        <li key={lab}>{lab}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>Dispensing Status</CardHeader>
                <CardContent className="space-y-4">
                  {prescription.handed_over_at ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 size={20} className="mt-0.5 text-emerald-600" />
                        <div>
                          <p className="font-bold text-on-surface">Prescription already handed over</p>
                          <p className="mt-1 text-sm text-on-surface-variant">
                            {prescription.handed_over_by || 'Staff'} · {new Date(prescription.handed_over_at).toLocaleString('en-IN')}
                          </p>
                          {prescription.dispensing_note && (
                            <p className="mt-2 text-sm text-on-surface">{prescription.dispensing_note}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-on-surface-variant">
                        Mark this only after the authorized prescription has been printed and handed to the patient or caregiver.
                      </p>
                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                          Dispensing Note (Optional)
                        </label>
                        <textarea
                          value={dispensingNote}
                          onChange={(event) => setDispensingNote(event.target.value)}
                          placeholder="Non-clinical note only, e.g. handed to caregiver at front desk"
                          className="h-28 w-full resize-none rounded-lg border border-outline bg-white p-3 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handoverMutation.mutate()}
                        disabled={handoverMutation.isPending}
                        className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
                      >
                        {handoverMutation.isPending ? 'Recording Handover...' : 'Mark Handed Over'}
                      </button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <section className="print-surface print-surface--prescription hidden">
            <div className="mx-auto max-w-3xl rounded-2xl border border-slate-300 bg-white p-8 text-slate-900 shadow-none">
              <div className="border-b border-slate-300 pb-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Chettinad Care</p>
                <h1 className="mt-2 text-2xl font-bold">Authorized Prescription</h1>
                <p className="mt-1 text-sm text-slate-600">{patient.name} · {patient.mrn}</p>
              </div>
              <div className="mt-6 space-y-4">
                {content.medications.map((medication: any, index: number) => (
                  <div key={`${medication.name}-${index}`} className="rounded-xl border border-slate-200 p-4">
                    <p className="font-semibold">{medication.name || 'Medication'}</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {medication.strength || medication.dose || 'As prescribed'} · {medication.frequency || 'As directed'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Route: {medication.route || 'Oral'} · Duration: {medication.duration ? `${medication.duration} days` : 'As directed'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
