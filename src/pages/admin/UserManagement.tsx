import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Shield, UserPlus, ZapOff, CheckCircle, Key, X } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { adminApi } from '../../api/admin';
import type { User } from '../../api/admin';

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

  const resetForm = () => {
    setFormId('');
    setFormName('');
    setFormRole('');
    setFormPassword('');
    setFormError('');
    setTargetUser(null);
    setSubmitting(false);
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
    const pwError = validatePassword(formPassword);
    if (pwError) { setFormError(pwError); return; }

    setSubmitting(true);
    try {
      await adminApi.resetPassword(targetUser.id, formPassword);
      push('success', 'Password Reset', `Password for ${targetUser.name} has been updated.`);
      closeModal();
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
                  title="Reset Password"
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

            <div>
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                {modal === 'create' ? 'Password' : 'New Password'}
              </label>
              <input type="password" value={formPassword} onChange={e => { setFormPassword(e.target.value); setFormError(''); }}
                placeholder="Min 8 chars, at least 1 number" className="w-full border border-outline rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-all" />
            </div>

            <button
              onClick={modal === 'create' ? handleCreateUserSubmit : handleResetPasswordSubmit}
              disabled={submitting}
              className="w-full bg-primary text-white font-bold py-3 rounded-xl text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Processing...' : modal === 'create' ? 'Create Account' : 'Reset Password'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};
