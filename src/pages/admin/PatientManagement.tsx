import React, { useMemo, useState } from 'react';
import { Pencil, Search, UserCog, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { useToast } from '../../components/ui/Toast';
import { useSearchPatients } from '../../hooks/queries/usePatients';
import { PatientsAPI } from '../../api/patients';
import type { Patient } from '../../types/clinical';

type EditingPatient = Patient | null;

export const PatientManagement = () => {
  const { push } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPatient, setEditingPatient] = useState<EditingPatient>(null);
  const [form, setForm] = useState({ name: '', dob: '', gender: '', phone: '' });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: matchingPatients = [], isLoading } = useSearchPatients(searchQuery);

  const visiblePatients = useMemo(() => {
    if (searchQuery.trim().length < 2) {
      return [];
    }
    return matchingPatients;
  }, [matchingPatients, searchQuery]);

  const openEditor = (patient: Patient) => {
    setEditingPatient(patient);
    setForm({
      name: patient.name,
      dob: patient.dob || '',
      gender: patient.gender,
      phone: patient.phone || '',
    });
    setFormError('');
  };

  const closeEditor = () => {
    setEditingPatient(null);
    setFormError('');
    setIsSubmitting(false);
  };

  const handleSave = async () => {
    if (!editingPatient) {
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const result = await PatientsAPI.updatePatient(editingPatient.id, {
        name: form.name.trim(),
        dob: form.dob,
        gender: form.gender,
        phone: form.phone.trim() || null,
      });

      push('success', 'Patient Updated', `${result.patient.name} demographics were corrected successfully.`);
      closeEditor();
      setSearchQuery(editingPatient.id);
    } catch (err: any) {
      setFormError(err.response?.data?.error?.message || err.message || 'Could not update patient demographics.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCog size={18} className="text-primary" />
            <span>Patient Demographics</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-on-surface-variant" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search patient by name, phone, or UHID"
              className="w-full rounded-lg border border-outline bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="rounded-xl border border-outline/20 bg-surface-container-low">
            {searchQuery.trim().length < 2 ? (
              <p className="p-4 text-sm text-on-surface-variant">
                Search the registry to correct patient demographics safely.
              </p>
            ) : isLoading ? (
              <div className="p-4 text-sm font-semibold text-on-surface-variant">Searching registry...</div>
            ) : visiblePatients.length === 0 ? (
              <p className="p-4 text-sm text-on-surface-variant">No matching patients found.</p>
            ) : (
              visiblePatients.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between gap-3 border-b border-outline/10 px-4 py-3 last:border-b-0"
                >
                  <div>
                    <p className="font-bold text-on-surface">{patient.name}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {patient.id} · {patient.dob || `${patient.age}Y`} · {patient.gender} · {patient.phone || 'No phone'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEditor(patient)}
                    className="inline-flex items-center gap-2 rounded-lg border border-outline bg-white px-3 py-2 text-xs font-bold text-primary hover:bg-primary/5"
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="rounded-xl border border-outline/20 bg-surface-container-low p-4 text-xs text-on-surface-variant">
            Admin acts as the temporary receptionist proxy in this pilot. Demographic corrections are audited and do not change the internal patient ID.
          </div>
        </CardContent>
      </Card>

      {editingPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-on-surface">Edit Patient Demographics</h2>
                <p className="text-sm text-on-surface-variant">{editingPatient.id}</p>
              </div>
              <button type="button" onClick={closeEditor} className="text-on-surface-variant hover:text-on-surface">
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="mb-4 rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">Name</label>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-lg border border-outline bg-white px-4 py-2.5 text-sm outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">DOB</label>
                  <input
                    type="date"
                    value={form.dob}
                    onChange={(event) => setForm((current) => ({ ...current, dob: event.target.value }))}
                    className="w-full rounded-lg border border-outline bg-white px-4 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">Gender</label>
                  <select
                    value={form.gender}
                    onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}
                    className="w-full rounded-lg border border-outline bg-white px-4 py-2.5 text-sm outline-none focus:border-primary"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                    <option value="Not specified">Not specified</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-on-surface-variant">Phone</label>
                <input
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="+91 9876543210"
                  className="w-full rounded-lg border border-outline bg-white px-4 py-2.5 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeEditor}
                className="flex-1 rounded-lg border border-outline px-4 py-3 text-sm font-bold hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSubmitting}
                className="flex-1 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
