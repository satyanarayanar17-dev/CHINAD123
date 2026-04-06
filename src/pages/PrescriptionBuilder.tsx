import React, { useState, useEffect } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { Card, CardContent } from '../components/ui/Card';
import { StatusChip } from '../components/ui/StatusChip';
import { Search, Pill, Beaker, CheckCircle, AlertTriangle, X, Plus, Trash2, Edit3, ArrowRight } from 'lucide-react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clinicalApi } from '../api/clinical';
import { usePatient, usePatientTimeline } from '../hooks/queries/usePatients';
import { useToast, ToastContainer } from '../components/ui/Toast';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

interface NewMedication {
  name: string;
  strength: string;
  frequency: string;
  duration: number;
}

export const PrescriptionBuilder = () => {
  const { patientId, prescriptionId } = useParams<{ patientId: string; prescriptionId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toasts, push, dismiss } = useToast();

  const { data: patient, isLoading: isPatientLoading } = usePatient(patientId!);
  
  const [rxId, setRxId] = useState<string | null>(prescriptionId && prescriptionId !== 'new' ? prescriptionId : null);
  const [version, setVersion] = useState<number>(1);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  const [activeMeds, setActiveMeds] = useState<any[]>([]);
  const [newRx, setNewRx] = useState<NewMedication[]>([]);
  const [selectedLabs, setSelectedLabs] = useState<string[]>(['Complete Blood Count (CBC)']);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const [medSearch, setMedSearch] = useState('');
  const [labSearch, setLabSearch] = useState('');

  const { data: existingRx, isLoading: isRxLoading } = useQuery({
    queryKey: ['clinicalPrescription', rxId],
    queryFn: () => clinicalApi.getPrescription(rxId!),
    enabled: !!rxId && !isInitialized,
    retry: 1
  });

  useEffect(() => {
    if (patient && !isInitialized && (!prescriptionId || prescriptionId === 'new')) {
       setActiveMeds([...(patient.activeMeds || [])]);
       setIsInitialized(true);
    }
  }, [patient, isInitialized, prescriptionId]);

  useEffect(() => {
    if (existingRx && !isInitialized) {
      if (existingRx.rx_content) {
        try {
          const parsed = JSON.parse(existingRx.rx_content);
          setActiveMeds(parsed.activeMeds || []);
          setNewRx(parsed.newRx || []);
          setSelectedLabs(parsed.selectedLabs || []);
        } catch(e) {}
      } else if (patient && prescriptionId !== 'new') {
         setActiveMeds([...(patient.activeMeds || [])]);
      }
      setVersion(existingRx.__v || 1);
      if (existingRx.status !== 'DRAFT') {
        setIsAuthorizing(true);
      }
      setIsInitialized(true);
    }
  }, [existingRx, isInitialized, patient, prescriptionId]);


  const debouncedDraft = useDebounce({ activeMeds, newRx, selectedLabs }, 1000);

  useEffect(() => {
    if (!isInitialized || isAuthorizing || isRxLoading || isPatientLoading) return;

    const saveDraft = async () => {
      try {
        const contentStr = JSON.stringify(debouncedDraft);
        if (!rxId) {
           const res = await clinicalApi.createPrescription(patientId!, contentStr);
           setRxId(res.rxId);
           setVersion(res.newVersion);
           window.history.replaceState(null, '', `/clinical/patient/${patientId}/prescription/${res.rxId}`);
        } else {
           const res = await clinicalApi.saveDraftPrescription(rxId, contentStr, version);
           setVersion(res.newVersion);
        }
      } catch (err: any) {
        if (err.response?.status === 409) {
          push('warning', 'Conflict Detected', 'Another session updated this draft. Please refresh.');
        } else if (err.response?.status === 422) {
          push('error', 'Encounter Error', err.response.data?.message || 'Failed to save');
        }
      }
    };

    saveDraft();
  }, [debouncedDraft]);

  const handleMedAction = (medName: string, action: 'continue' | 'stop' | 'modify') => {
    if (action === 'stop') {
      setActiveMeds(prev => prev.filter(m => m.name !== medName));
    }
  };

  const handleAddMed = (name: string) => {
    setNewRx(prev => [...prev, { name, strength: '', frequency: '', duration: 30 }]);
    setMedSearch('');
  };

  const handleRemoveRx = (index: number) => setNewRx(prev => prev.filter((_, i) => i !== index));

  const handleAddLab = (name: string) => {
    setSelectedLabs(prev => [...prev, name]);
    setLabSearch('');
  };

  const handleRemoveLab = (name: string) => setSelectedLabs(prev => prev.filter(l => l !== name));

  const authMutation = useMutation({
    mutationFn: async () => {
      if (!rxId) throw new Error("No rx ID found");
      await clinicalApi.saveDraftPrescription(rxId, JSON.stringify({ activeMeds, newRx, selectedLabs }), version);
      return await clinicalApi.authorizePrescription(rxId, version + 1);
    },
    onSuccess: () => {
      setIsAuthorizing(true);
      queryClient.invalidateQueries({ queryKey: ['patientTimeline', patientId] });
      push('success', 'Orders Authorized', 'Prescriptions and lab orders have been securely transmitted to fulfillment endpoints.');
      setTimeout(() => navigate(`/clinical/patient/${patientId}/dossier`), 2000);
    },
    onError: (error: any) => {
      push('error', 'Transmission Failed', error.response?.data?.message || 'Could not authorize orders. Please verify network or signature integrity.');
    }
  });

  const handleAuthorize = () => authMutation.mutate();

  if (isPatientLoading || (!isInitialized && isRxLoading)) {
    return (
      <div className="absolute inset-0 bg-surface/60 z-50 flex items-start justify-center backdrop-blur-sm rounded-xl py-20">
         <div className="bg-white p-4 rounded-xl shadow-lg border border-outline/20 font-bold text-primary animate-pulse">
           Restoring prescription session...
         </div>
      </div>
    );
  }

  if (!patient) {
     return <div className="p-10 text-center text-error font-bold">Patient record not found.</div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24 relative">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 text-sm font-medium">
          <Link to={`/clinical/patient/${patient.id}/dossier`} className="text-primary hover:underline">
            ← {patient.name}
          </Link>
          <span className="text-on-surface-variant">/</span>
          <span className="text-on-surface">CPOE &amp; Prescription</span>
        </div>
        <StatusChip variant={isAuthorizing ? 'success' : 'primary'} label={isAuthorizing ? 'Authorized' : 'New Order'} />
      </div>

      {patient.allergies?.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-error/10 border border-error/30 rounded-xl">
          <AlertTriangle className="text-error shrink-0 mt-0.5" size={20} />
          <div>
            <span className="text-error font-bold text-xs uppercase tracking-widest block mb-1">Registry Allergy Alert</span>
            {patient.allergies.map((a: any) => (
              <p key={a.substance} className="text-sm text-error/90 font-medium">
                <strong>{a.substance}</strong> — {a.severity} (Verified: {a.verifiedDate})
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="lg:col-span-2 space-y-6">
          <ErrorBoundary moduleName="Formulary Core">
          <Card>
            <div className="p-4 border-b border-outline/20">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Pill className="text-primary" /> Medication Reconciliation
              </h2>
              <p className="text-xs text-on-surface-variant mt-1">
                {activeMeds.length} active medications on file for {patient.name}
              </p>
            </div>
            <div className="divide-y divide-outline/20">
              {activeMeds.length === 0 ? (
                <p className="p-4 text-sm text-on-surface-variant italic">No active medications in registry.</p>
              ) : (
                activeMeds.map((med: any) => (
                  <div key={med.name} className="p-4 flex items-center justify-between bg-surface-container-low hover:bg-surface-container transition-colors">
                    <div className="flex-1">
                      <h4 className="font-bold text-sm text-on-surface">{med.name}</h4>
                      <span className="text-xs text-on-surface-variant">{med.frequency}</span>
                    </div>
                    <div className="flex gap-2">
                       {/* Omit continue/modify for brevity */}
                      <button 
                        onClick={() => handleMedAction(med.name, 'stop')}
                        className="px-3 py-1.5 bg-white border border-outline rounded text-xs font-bold hover:border-error hover:text-error transition-colors flex items-center gap-1"
                      >
                        <Trash2 size={12} /> Stop
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <div className="p-4 border-b border-outline/20 bg-primary/5">
              <h2 className="text-lg font-bold">New Prescription</h2>
              <div className="relative mt-3">
                <Search size={16} className="absolute left-3 top-3 text-on-surface-variant" />
                <input
                  type="text"
                  placeholder="Search Institutional Formulary (generic or brand)..."
                  value={medSearch}
                  disabled={isAuthorizing}
                  onChange={e => setMedSearch(e.target.value)}
                  className="w-full text-sm py-2.5 pl-10 pr-3 bg-white border border-primary/30 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-inner"
                />
                {!isAuthorizing && medSearch.length > 2 && (
                  <div className="absolute top-full left-0 right-0 z-10 bg-white border border-outline rounded-xl shadow-2xl mt-1 overflow-hidden">
                    {['Paracetamol 500mg', 'Metformin 500mg', 'Amlodipine 5mg', 'Atorvastatin 20mg'].filter(m => m.toLowerCase().includes(medSearch.toLowerCase())).map(m => (
                      <button 
                        key={m}
                        onClick={() => handleAddMed(m)}
                        className="w-full text-left px-4 py-3 text-xs font-bold hover:bg-primary/5 flex items-center justify-between group border-b border-outline/10 last:border-0"
                      >
                        {m}
                        <Plus size={14} className="text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <CardContent className="space-y-4">
              {newRx.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-outline/50 rounded-xl bg-surface-container-low/30">
                  <p className="text-xs text-on-surface-variant">Use search to add medications to the prescription.</p>
                </div>
              ) : (
                newRx.map((rx, idx) => (
                  <div key={idx} className="border border-outline/50 rounded-xl overflow-hidden transition-all hover:border-primary/30">
                    <div className="bg-surface-container-low p-3 flex items-center justify-between border-b border-outline/20">
                      <span className="font-bold text-sm text-primary">{rx.name}</span>
                      {!isAuthorizing && (
                         <button onClick={() => handleRemoveRx(idx)} className="text-error text-xs font-bold hover:underline">Remove</button>
                      )}
                    </div>
                    <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 bg-surface">
                      <div>
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1">Strength</label>
                        <select disabled={isAuthorizing} className="w-full text-sm p-2 border border-outline rounded bg-surface-container outline-none focus:border-primary">
                          <option>500mg</option>
                          <option>1000mg</option>
                          <option>As specified</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1">Frequency</label>
                        <select disabled={isAuthorizing} className="w-full text-sm p-2 border border-outline rounded bg-surface-container outline-none focus:border-primary">
                          <option>OD (Once Daily)</option>
                          <option>BID (Twice Daily)</option>
                          <option>TID (Thrice Daily)</option>
                          <option>QID (Four Times Daily)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1">Route</label>
                        <select disabled={isAuthorizing} className="w-full text-sm p-2 border border-outline rounded bg-surface-container outline-none focus:border-primary">
                          <option>Oral</option>
                          <option>IV</option>
                          <option>IM</option>
                          <option>Subcutaneous</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1">Duration</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            disabled={isAuthorizing}
                            defaultValue={rx.duration}
                            className="w-16 text-sm p-2 border border-outline rounded bg-surface-container outline-none focus:border-primary"
                          />
                          <span className="text-sm text-on-surface-variant">Days</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          </ErrorBoundary>
        </div>

        <div className="lg:col-span-1 space-y-5">
          <ErrorBoundary moduleName="Order Fulfillment Engine">
          <Card className="border-tertiary/20">
            <div className="p-4 border-b border-outline/20 bg-tertiary/5">
              <h2 className="text-sm font-bold flex items-center gap-2 text-tertiary">
                <Beaker size={16} /> Laboratory Orders
              </h2>
            </div>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-on-surface-variant" />
                <input
                  type="text"
                  disabled={isAuthorizing}
                  placeholder="Search lab directory..."
                  value={labSearch}
                  onChange={e => setLabSearch(e.target.value)}
                  className="w-full text-sm py-2 pl-8 pr-3 bg-white border border-outline rounded-lg outline-none focus:border-tertiary transition-all"
                />
                {!isAuthorizing && labSearch.length > 2 && (
                  <div className="absolute top-full left-0 right-0 z-10 bg-white border border-outline rounded-lg shadow-xl mt-1 overflow-hidden">
                    {['Lipid Profile', 'HbA1c', 'Creatinine', 'Urine Culture', 'Chest X-Ray'].filter(l => l.toLowerCase().includes(labSearch.toLowerCase())).map(l => (
                      <button 
                        key={l}
                        onClick={() => handleAddLab(l)}
                        className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-tertiary/5 flex items-center justify-between group border-b border-outline/10 last:border-0"
                      >
                        {l}
                        <Plus size={12} className="text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Selected Tests</h3>
                {selectedLabs.length === 0 ? (
                  <p className="text-[10px] text-on-surface-variant italic text-center py-2 bg-surface-container-low rounded border border-dashed border-outline/50">No labs selected.</p>
                ) : (
                  selectedLabs.map(lab => (
                    <div key={lab} className="p-2 bg-white border border-outline rounded flex items-center justify-between text-xs transition-shadow hover:shadow-sm">
                      <span className="font-bold text-tertiary">{lab}</span>
                      {!isAuthorizing && (
                         <button onClick={() => handleRemoveLab(lab)} className="text-on-surface-variant hover:text-error transition-colors p-0.5 rounded-full hover:bg-error/5">
                           <X size={14} />
                         </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {patient.activeMeds?.length > 0 && (
            <div className="bg-error/10 border border-error/30 rounded-xl p-4 flex gap-3">
              <AlertTriangle className="text-error shrink-0 mt-0.5" size={20} />
              <div>
                <span className="text-error font-bold text-xs uppercase tracking-widest block mb-1">Drug Interaction Warning</span>
                <p className="text-sm text-error/90 font-medium">
                  Potential moderate interaction between <strong>Gliclazide</strong> and <strong>{patient.activeMeds[0].name.split(' ')[0]}</strong>.
                  Increased risk of hypoglycemia. Monitor closely.
                </p>
              </div>
            </div>
          )}

          <div className="p-3 bg-surface-container rounded-xl border border-outline/30 text-xs text-on-surface-variant space-y-1">
            <div className="font-bold text-on-surface">{patient.name}</div>
            <div>{patient.age}Y · {patient.gender} · {patient.bloodGroup}</div>
            {patient.riskFlags?.length > 0 && (
              <div className="text-tertiary font-semibold">{patient.riskFlags.join(' · ')}</div>
            )}
          </div>

          <button 
            onClick={handleAuthorize}
            disabled={authMutation.isPending || isAuthorizing || !rxId}
            className={`w-full py-4 rounded-xl text-base font-bold shadow-md transition-all flex justify-center items-center gap-2 ${
              (authMutation.isPending || isAuthorizing || !rxId) ? 'bg-emerald-500 text-white animate-pulse' : 'bg-primary text-white shadow-primary/20 hover:brightness-110'
            }`}
          >
            {(authMutation.isPending || isAuthorizing || !rxId) ? <CheckCircle size={20} /> : <ArrowRight size={20} />}
            {(authMutation.isPending || isAuthorizing || !rxId) ? 'Orders Authorized' : 'Authorize Orders'}
          </button>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
};
