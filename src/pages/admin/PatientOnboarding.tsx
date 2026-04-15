import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { UserRoundPlus, KeyRound, Printer } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { adminApi } from '../../api/admin';

const defaultForm = {
  name: '',
  phone: '',
  dob: '',
  gender: 'Female'
};

type OnboardingResult = {
  patient: {
    id: string;
    name: string;
    mrn: string;
    phone?: string | null;
  };
  activationCode: string | null;
  activationExpiresAt: string | null;
  encounterId: string | null;
  activationPath: string | null;
};

export const PatientOnboarding = () => {
  const { push } = useToast();
  const [form, setForm] = useState(defaultForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<OnboardingResult | null>(null);

  const updateField = (field: keyof typeof defaultForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetResult = () => {
    setResult(null);
  };

  const handlePrintActivationSlip = () => {
    if (!result) {
      return;
    }

    const printClass = 'print-activation-slip';
    const cleanup = () => {
      document.body.classList.remove(printClass);
      window.removeEventListener('afterprint', cleanup);
    };

    document.body.classList.add(printClass);
    window.addEventListener('afterprint', cleanup);
    window.print();
    window.setTimeout(cleanup, 1000);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetResult();
    setIsSubmitting(true);

    try {
      const registration = await adminApi.createPatient({
        name: form.name.trim(),
        phone: form.phone.trim(),
        dob: form.dob,
        gender: form.gender,
        issueActivationToken: true,
      });

      setResult({
        patient: registration.patient,
        activationCode: registration.activation?.activation_code || null,
        activationExpiresAt: registration.activation?.expires_at || null,
        encounterId: registration.encounterId,
        activationPath: registration.activationPath || null,
      });

      push(
        'success',
        'Patient Registered',
        registration.patientCreated
          ? `${form.name.trim()} is ready for remote activation.`
          : `${form.name.trim()} already existed, and a fresh activation code was issued.`
      );

      setForm(defaultForm);
    } catch (err: any) {
      push(
        'error',
        'Patient Onboarding Failed',
        err.response?.data?.error?.message || err.response?.data?.message || err.message
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <UserRoundPlus size={18} className="text-primary" />
          <span>Patient Onboarding</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1">
              Full Name
            </label>
            <input
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              placeholder="Priya Rajan"
              required
              className="w-full rounded-lg border border-outline bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1">
              Mobile Number
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => updateField('phone', event.target.value)}
              placeholder="98765 43210"
              required
              className="w-full rounded-lg border border-outline bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <p className="mt-1 text-[11px] text-on-surface-variant">
              This becomes the patient-facing login and activation identifier.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1">
                Date Of Birth
              </label>
              <input
                type="date"
                value={form.dob}
                onChange={(event) => updateField('dob', event.target.value)}
                required
                className="w-full rounded-lg border border-outline bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-1">
                Gender
              </label>
              <select
                value={form.gender}
                onChange={(event) => updateField('gender', event.target.value)}
                className="w-full rounded-lg border border-outline bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
                <option>Not specified</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full rounded-lg px-4 py-3 text-sm font-bold text-white transition-colors ${
              isSubmitting ? 'cursor-not-allowed bg-outline' : 'bg-primary hover:brightness-110'
            }`}
          >
            {isSubmitting ? 'Registering...' : 'Register Patient & Issue Activation Code'}
          </button>
        </form>

        <div className="rounded-xl border border-outline/20 bg-surface-container-low p-4 text-xs text-on-surface-variant">
          Use this for real pilot onboarding: the system generates the internal UHID, ensures an active encounter, and issues a one-time activation code for manual sharing.
          <span className="block mt-2">
            In this pilot, admin is temporarily acting as the receptionist proxy. Queue-first consultation remains intentional, and no calendar scheduling is live yet.
          </span>
        </div>

        {result && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-primary">
                <KeyRound size={16} />
                Activation Ready
              </div>
              <button
                type="button"
                onClick={handlePrintActivationSlip}
                className="inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-white px-3 py-2 text-xs font-bold text-primary hover:bg-primary/5"
              >
                <Printer size={14} />
                Print Slip
              </button>
            </div>
            <p className="mt-3 text-sm font-semibold text-on-surface">
              {result.patient.name}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Phone: <span className="font-semibold text-on-surface">{result.patient.phone || form.phone.trim()}</span>
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Internal UHID: <span className="font-semibold text-on-surface">{result.patient.id}</span>
            </p>
            {result.encounterId && (
              <p className="mt-2 text-xs text-on-surface-variant">
                Active encounter: <span className="font-semibold text-on-surface">{result.encounterId}</span>
              </p>
            )}
            {result.activationCode ? (
              <p className="mt-2 text-sm font-semibold text-on-surface">
                Share this activation code with the patient: <span className="font-mono text-primary">{result.activationCode}</span>
              </p>
            ) : (
              <p className="mt-2 text-xs text-on-surface-variant">
                The backend did not return the activation code. Set <code>ACTIVATION_OTP_DELIVERY=api_response</code> for manual remote onboarding.
              </p>
            )}
            {result.activationExpiresAt && (
              <p className="mt-2 text-xs text-on-surface-variant">
                Expires: {new Date(result.activationExpiresAt).toLocaleString('en-IN')}
              </p>
            )}
            {result.activationPath && (
              <p className="mt-2 text-xs text-on-surface-variant">
                Activation path: <span className="font-semibold text-on-surface">{result.activationPath}</span>
              </p>
            )}
            <p className="mt-3 text-xs text-on-surface-variant">
              Patient instruction: open the activation path, enter the mobile number above, then use the one-time code to set a password.
            </p>
          </div>
        )}

        {result && (
          <section className="print-surface print-surface--activation hidden">
            <div className="mx-auto max-w-xl rounded-2xl border border-slate-300 bg-white p-8 text-slate-900 shadow-none">
              <div className="border-b border-slate-300 pb-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Chettinad Care</p>
                <h1 className="mt-2 text-2xl font-bold">Patient Activation Slip</h1>
                <p className="mt-1 text-sm text-slate-600">Chettinad Hospital &amp; Research Institute</p>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Patient Name</p>
                  <p className="mt-1 font-semibold">{result.patient.name}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Mobile Number</p>
                  <p className="mt-1 font-semibold">{result.patient.phone || 'Not recorded'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Internal UHID</p>
                  <p className="mt-1 font-semibold">{result.patient.id}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Activation Code</p>
                  <p className="mt-1 font-mono text-lg font-bold">{result.activationCode || 'See system delivery log'}</p>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-semibold">Activation instructions</p>
                <p className="mt-2">1. Open <span className="font-semibold">{result.activationPath || '/patient/activate'}</span>.</p>
                <p className="mt-1">2. Enter the mobile number above and the activation code.</p>
                <p className="mt-1">3. Create a password to access the patient portal.</p>
                {result.activationExpiresAt && (
                  <p className="mt-3 text-xs text-slate-600">Code expires on {new Date(result.activationExpiresAt).toLocaleString('en-IN')}.</p>
                )}
              </div>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
};
