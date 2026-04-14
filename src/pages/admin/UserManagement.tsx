import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Shield, UserPlus, ZapOff, CheckCircle, Key, X } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { adminApi } from '../../api/admin';
import type { ResetPasswordResponse, User } from '../../api/admin';

type ModalMode = null | 'create' | 'reset-password';

export const UserManagement = () => {
  const { push } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal] = useState<ModalMode>(null);
  const [targetUser, setTargetUser] = useState<User | null>(null);

  // Form fields
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetPasswordResult, setResetPasswordResult] = useState<ResetPasswordResponse | null>(null);

  const resetForm = () => {
    setFormId('');
    setFormName('');
    setFormRole('');
    setFormPassword('');
    setFormError('');
    setTargetUser(null);
    setSubmitting(false);
    setResetPasswordResult(null);
  };

  const closeModal = () => {
    setModal(null);
    resetForm();
  };

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const data = await adminApi.getUsers();
      setUsers(data);
    } catch (err: any) {
      push('error', 'Failed to load users', err.response?.data?.error?.message || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleActive = async (user: User) => {
    try {
      if (user.is_active) {
        await adminApi.disableUser(user.id);
        push('success', 'User Disabled', `${user.name} has been deactivated.`);
      } else {
        await adminApi.enableUser(user.id);
        push('success', 'User Enabled', `${user.name} has been activated.`);
      }
      fetchUsers();
    } catch (err: any) {
      push('error', 'Action Failed', err.response?.data?.error?.message || err.message);
    }
  };

  const validatePassword = (pw: string): string | null => {
    if (pw.length < 8) return 'Password must be at least 8 characters.';
    if (!/\d/.test(pw)) return 'Password must contain at least 1 number.';
    return null;
  };

  const handleResetPasswordSubmit = async () => {
    if (!targetUser) return;

    setSubmitting(true);
    try {
      const result = await adminApi.resetPassword(targetUser.id);
      setResetPasswordResult(result);
      push('success', 'Password Reset', `Temporary password generated for ${targetUser.name}.`);
    } catch (err: any) {
      setFormError(err.response?.data?.error?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateUserSubmit = async () => {
    if (!formId.trim()) { setFormError('User ID is required.'); return; }
    if (!formName.trim()) { setFormError('Full name is required.'); return; }
    if (!formRole || !['NURSE', 'DOCTOR', 'ADMIN'].includes(formRole)) { setFormError('Role must be NURSE, DOCTOR, or ADMIN.'); return; }
    const pwError = validatePassword(formPassword);
    if (pwError) { setFormError(pwError); return; }

    setSubmitting(true);
    try {
      await adminApi.createUser({ id: formId.trim(), name: formName.trim(), role: formRole, password: formPassword });
      push('success', 'User Created', `${formName.trim()} has been provisioned.`);
      closeModal();
      fetchUsers();
    } catch (err: any) {
      setFormError(err.response?.data?.error?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openResetPassword = (user: User) => {
    resetForm();
    setTargetUser(user);
    setModal('reset-password');
  };

  const handleCopyTemporaryPassword = async () => {
    if (!resetPasswordResult?.temporaryPassword) {
      return;
    }

    try {
      await navigator.clipboard.writeText(resetPasswordResult.temporaryPassword);
      push('success', 'Copied', 'Temporary password copied to clipboard.');
    } catch {
      push('error', 'Copy Failed', 'Clipboard access was unavailable. Please copy the temporary password manually.');
    }
  };

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center w-full">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-tertiary" />
            <span>Staff Directory & Access</span>
          </div>
          <button
            onClick={() => { resetForm(); setModal('create'); }}
            className="flex items-center gap-1 text-[10px] uppercase font-bold bg-primary text-white px-2 py-1 rounded hover:bg-primary-dark transition"
          >
            <UserPlus size={12} />
            <span>Add Staff</span>
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-sm text-on-surface-variant flex justify-center p-4">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="text-sm text-on-surface-variant flex justify-center p-4">No users found.</div>
        ) : (
          users.map(user => (
            <div key={user.id} className="flex justify-between items-center border-b border-outline/20 pb-2">
              <div>
                <div className="text-sm font-bold flex items-center gap-2">
                  <span className={user.is_active ? 'text-on-surface' : 'text-on-surface-variant line-through'}>{user.name}</span>
                  <span className={`text-[9px] px-1 py-0.5 rounded uppercase font-bold ${
                    user.role === 'ADMIN' ? 'bg-tertiary/10 text-tertiary' :
                    user.role === 'DOCTOR' ? 'bg-primary/10 text-primary' :
                    'bg-secondary/10 text-secondary'
                  }`}>{user.role}</span>
                  {!user.is_active && <span className="text-[9px] text-error font-bold border border-error px-1 rounded uppercase">Disabled</span>}
                </div>
                <div className="text-xs text-on-surface-variant">ID: {user.id}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openResetPassword(user)}
                  title="Generate & Reset Password"
                  className="p-1.5 bg-outline/10 text-on-surface hover:text-primary rounded"
                >
                  <Key size={14} />
                </button>
                <button
                  onClick={() => handleToggleActive(user)}
                  title={user.is_active ? "Disable User" : "Enable User"}
                  className={`p-1.5 rounded ${user.is_active ? 'bg-error/10 text-error hover:bg-error hover:text-white' : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'}`}
                >
                  {user.is_active ? <ZapOff size={14} /> : <CheckCircle size={14} />}
                </button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>

    {/* Modal overlay */}
    {modal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
        <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-extrabold text-on-surface">
              {modal === 'create' ? 'Create Staff Account' : `Reset Password — ${targetUser?.name}`}
            </h2>
            <button onClick={closeModal} className="text-on-surface-variant hover:text-on-surface transition-colors">
              <X size={20} />
            </button>
          </div>

          {formError && (
            <div className="mb-4 p-3 bg-error/10 border border-error/30 rounded-xl text-sm text-error font-medium">{formError}</div>
          )}

          <div className="space-y-4">
            {modal === 'create' && (
              <>
                <div>
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">User ID</label>
                  <input value={formId} onChange={e => { setFormId(e.target.value); setFormError(''); }}
                    placeholder="e.g. doc3_qa" className="w-full border border-outline rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-all" />
                </div>
                <div>
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Full Name</label>
                  <input value={formName} onChange={e => { setFormName(e.target.value); setFormError(''); }}
                    placeholder="Dr. Full Name" className="w-full border border-outline rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-all" />
                </div>
                <div>
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Role</label>
                  <select value={formRole} onChange={e => { setFormRole(e.target.value); setFormError(''); }}
                    className="w-full border border-outline rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-all bg-white">
                    <option value="">Select role…</option>
                    <option value="DOCTOR">Doctor</option>
                    <option value="NURSE">Nurse</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </>
            )}

            {modal === 'create' ? (
              <>
                <div>
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                    Password
                  </label>
                  <input type="password" value={formPassword} onChange={e => { setFormPassword(e.target.value); setFormError(''); }}
                    placeholder="Min 8 chars, at least 1 number" className="w-full border border-outline rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-all" />
                </div>

                <button
                  onClick={handleCreateUserSubmit}
                  disabled={submitting}
                  className="w-full bg-primary text-white font-bold py-3 rounded-xl text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Processing...' : 'Create Account'}
                </button>
              </>
            ) : (
              <div className="space-y-4">
                {!resetPasswordResult ? (
                  <>
                    <div className="rounded-xl border border-outline/20 bg-surface-container-low p-4 text-sm text-on-surface-variant">
                      Generate a one-time temporary password for <span className="font-bold text-on-surface">{targetUser?.name}</span>.
                    </div>
                    <button
                      onClick={handleResetPasswordSubmit}
                      disabled={submitting}
                      className="w-full bg-primary text-white font-bold py-3 rounded-xl text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Processing...' : 'Generate & Reset Password'}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-primary">Temporary Password</p>
                      <p className="mt-2 rounded-lg border border-outline/30 bg-white px-3 py-3 font-mono text-sm font-bold text-on-surface break-all">
                        {resetPasswordResult.temporaryPassword}
                      </p>
                      <button
                        type="button"
                        onClick={handleCopyTemporaryPassword}
                        className="mt-3 text-xs font-bold text-primary hover:underline"
                      >
                        Copy to clipboard
                      </button>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      Copy this temporary password and share it securely with the staff member.
                    </div>
                    <div className="rounded-xl border border-outline/20 bg-surface-container-low p-4 text-sm text-on-surface-variant">
                      The user will be required to change password on next login.
                    </div>
                    <button
                      onClick={closeModal}
                      className="w-full bg-primary text-white font-bold py-3 rounded-xl text-sm hover:brightness-110 transition-all"
                    >
                      Done
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
};
