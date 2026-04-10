import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { UserRoundPlus, KeyRound } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { adminApi } from '../../api/admin';

const defaultForm = {
  id: '',
  name: '',
  dob: '',
  gender: 'Female'
};

export const PatientOnboarding = () => {
  const { push } = useToast();
  const [form, setForm] = useState(defaultForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activationCode, setActivationCode] = useState<string | null>(null);
  const [activationExpiresAt, setActivationExpiresAt] = useState<string | null>(null);
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [activationPath, setActivationPath] = useState<string | null>(null);

  const updateField = (field: keyof typeof defaultForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetResult = () => {
    setActivationCode(null);
    setActivationExpiresAt(null);
    setEncounterId(null);
    setActivationPath(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetResult();
    setIsSubmitting(true);

    try {
      const registration = await adminApi.createPatient({
        id: form.id.trim(),
        name: form.name.trim(),
        dob: form.dob,
        gender: form.gender,
        issueActivationToken: true,
      });

      setActivationCode(registration.activation?.activation_code || null);
      setActivationExpiresAt(registration.activation?.expires_at || null);
      setEncounterId(registration.encounterId);
      setActivationPath(registration.activationPath || null);

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
              Patient UHID
            </label>
            <input
              value={form.id}
              onChange={(event) => updateField('id', event.target.value)}
              placeholder="pat-4"
              required
              className="w-full rounded-lg border border-outline bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

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
          Use this for real pilot onboarding: the patient record is created or reused, an active encounter is ensured, and a one-time activation code is issued for manual sharing.
        </div>

        {(activationCode || encounterId) && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-primary">
              <KeyRound size={16} />
              Activation Ready
            </div>
            {encounterId && (
              <p className="mt-2 text-xs text-on-surface-variant">
                Active encounter: <span className="font-semibold text-on-surface">{encounterId}</span>
              </p>
            )}
            {activationCode ? (
              <p className="mt-2 text-sm font-semibold text-on-surface">
                Share this activation code with the patient: <span className="font-mono text-primary">{activationCode}</span>
              </p>
            ) : (
              <p className="mt-2 text-xs text-on-surface-variant">
                The backend did not return the activation code. Set <code>ACTIVATION_OTP_DELIVERY=api_response</code> for manual remote onboarding.
              </p>
            )}
            {activationExpiresAt && (
              <p className="mt-2 text-xs text-on-surface-variant">
                Expires: {new Date(activationExpiresAt).toLocaleString('en-IN')}
              </p>
            )}
            {activationPath && (
              <p className="mt-2 text-xs text-on-surface-variant">
                Activation path: <span className="font-semibold text-on-surface">{activationPath}</span>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
