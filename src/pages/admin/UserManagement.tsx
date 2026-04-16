import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { CheckCircle, Key, Pencil, Shield, UserPlus, X, ZapOff } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { adminApi } from '../../api/admin';
import type { ResetPasswordResponse, User } from '../../api/admin';

type ModalMode = null | 'create' | 'edit' | 'reset-password';
type StaffRole = User['role'];

function getErrorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'error' in error.response.data &&
    typeof error.response.data.error === 'object' &&
    error.response.data.error !== null &&
    'message' in error.response.data.error &&
    typeof error.response.data.error.message === 'string'
  ) {
    return error.response.data.error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred.';
}

export const UserManagement = () => {
  const { push } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal] = useState<ModalMode>(null);
  const [targetUser, setTargetUser] = useState<User | null>(null);

  const [formLoginId, setFormLoginId] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<StaffRole | ''>('');
  const [formPassword, setFormPassword] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetPasswordResult, setResetPasswordResult] = useState<ResetPasswordResponse | null>(null);

  const resetForm = () => {
    setFormLoginId('');
    setFormName('');
    setFormRole('');
    setFormPassword('');
    setFormDepartment('');
    setFormError('');
    setTargetUser(null);
    setSubmitting(false);
    setResetPasswordResult(null);
  };

  const closeModal = () => {
    setModal(null);
    resetForm();
  };

  const fetchUsers = useCallback(async () => {
    const data = await adminApi.getUsers();
    setUsers(data);
  }, []);

  const fetchInitialData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [userData, departmentData] = await Promise.all([
        adminApi.getUsers(),
        adminApi.getDepartments()
      ]);
      setUsers(userData);
      setDepartments(departmentData);
    } catch (error: unknown) {
      push('error', 'Failed to load users', getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [push]);

  useEffect(() => {
    void fetchInitialData();
  }, [fetchInitialData]);

  const handleToggleActive = async (user: User) => {
    try {
      if (user.is_active) {
        await adminApi.disableUser(user.id);
        push('success', 'User Disabled', `${user.name} has been deactivated.`);
      } else {
        await adminApi.enableUser(user.id);
        push('success', 'User Enabled', `${user.name} has been activated.`);
      }
      await fetchUsers();
    } catch (error: unknown) {
      push('error', 'Action Failed', getErrorMessage(error));
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
    setFormError('');
    try {
      const result = await adminApi.resetPassword(targetUser.id);
      setResetPasswordResult(result);
      push('success', 'Password Reset', `Temporary password generated for ${targetUser.name}.`);
    } catch (error: unknown) {
      setFormError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateUserSubmit = async () => {
    if (!formLoginId.trim()) {
      setFormError('Username / login ID is required.');
      return;
    }
    if (!formName.trim()) {
      setFormError('Full name is required.');
      return;
    }
    if (!formRole || !['NURSE', 'DOCTOR', 'ADMIN'].includes(formRole)) {
      setFormError('Role must be NURSE, DOCTOR, or ADMIN.');
      return;
    }
    if (formRole === 'DOCTOR' && !formDepartment) {
      setFormError('Department is required for doctor accounts.');
      return;
    }

    const pwError = validatePassword(formPassword);
    if (pwError) {
      setFormError(pwError);
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      await adminApi.createUser({
        username: formLoginId.trim(),
        fullName: formName.trim(),
        role: formRole,
        password: formPassword,
        department: formRole === 'DOCTOR' ? formDepartment : null
      });
      await fetchUsers();
      push('success', 'User Created', `${formName.trim()} has been provisioned.`);
      closeModal();
    } catch (error: unknown) {
      setFormError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const openResetPassword = (user: User) => {
    resetForm();
    setTargetUser(user);
    setModal('reset-password');
  };

  const openEditUser = (user: User) => {
    resetForm();
    setTargetUser(user);
    setFormLoginId(user.id);
    setFormName(user.name);
    setFormRole(user.role);
    setFormDepartment(user.role === 'DOCTOR' ? (user.department || '') : '');
    setModal('edit');
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

  const handleEditUserSubmit = async () => {
    if (!targetUser) {
      return;
    }
    if (!formName.trim()) {
      setFormError('Full name is required.');
      return;
    }
    if (!formRole || !['NURSE', 'DOCTOR', 'ADMIN'].includes(formRole)) {
      setFormError('Role must be NURSE, DOCTOR, or ADMIN.');
      return;
    }
    if (formRole === 'DOCTOR' && !formDepartment) {
      setFormError('Department is required for doctor accounts.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      const result = await adminApi.updateUser(targetUser.id, {
        fullName: formName.trim(),
        role: formRole,
        department: formRole === 'DOCTOR' ? formDepartment : null
      });
      await fetchUsers();
      push(
        'success',
        result.updated ? 'User Updated' : 'No Changes',
        result.updated
          ? `${formName.trim()} has been updated.`
          : `${targetUser.name} already matches the saved profile.`
      );
      closeModal();
    } catch (error: unknown) {
      setFormError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
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
            <div className="text-sm text-on-surface-variant flex justify-center p-4">No users created yet.</div>
          ) : (
            users.map((user) => (
              <div key={user.id} className="flex justify-between items-center border-b border-outline/20 pb-2 gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold flex items-center gap-2 flex-wrap">
                    <span className={user.is_active ? 'text-on-surface' : 'text-on-surface-variant line-through'}>{user.name}</span>
                    <span className={`text-[9px] px-1 py-0.5 rounded uppercase font-bold ${
                      user.role === 'ADMIN' ? 'bg-tertiary/10 text-tertiary' :
                      user.role === 'DOCTOR' ? 'bg-primary/10 text-primary' :
                      'bg-secondary/10 text-secondary'
                    }`}>
                      {user.role}
                    </span>
                    <span className={`text-[9px] px-1 py-0.5 rounded uppercase font-bold border ${
                      user.is_active
                        ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                        : 'border-error text-error bg-error/5'
                    }`}>
                      {user.status}
                    </span>
                  </div>
                  <div className="text-xs text-on-surface-variant">Username: {user.id}</div>
                  {user.role === 'DOCTOR' && (
                    <div className="text-xs text-on-surface-variant">Department: {user.department || 'Unassigned'}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openEditUser(user)}
                    title="Edit User"
                    className="p-1.5 bg-outline/10 text-on-surface hover:text-primary rounded"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => openResetPassword(user)}
                    title="Generate & Reset Password"
                    className="p-1.5 bg-outline/10 text-on-surface hover:text-primary rounded"
                  >
                    <Key size={14} />
                  </button>
                  <button
                    onClick={() => handleToggleActive(user)}
                    title={user.is_active ? 'Disable User' : 'Enable User'}
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

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-extrabold text-on-surface">
                {modal === 'create'
                  ? 'Create Staff Account'
                  : modal === 'edit'
                    ? `Edit Staff Account — ${targetUser?.name}`
                    : `Reset Password — ${targetUser?.name}`}
              </h2>
              <button onClick={closeModal} className="text-on-surface-variant hover:text-on-surface transition-colors">
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-error/10 border border-error/30 rounded-xl text-sm text-error font-medium">{formError}</div>
            )}

            <div className="space-y-4">
              {(modal === 'create' || modal === 'edit') && (
                <>
                  <div>
                    <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Username / Login ID</label>
                    <input
                      value={formLoginId}
                      onChange={(e) => { setFormLoginId(e.target.value); setFormError(''); }}
                      placeholder="Unique staff login identifier"
                      disabled={modal === 'edit'}
                      className={`w-full border border-outline rounded-xl px-4 py-2.5 text-sm outline-none transition-all ${modal === 'edit' ? 'bg-surface-container-low text-on-surface-variant cursor-not-allowed' : 'focus:border-primary'}`}
                    />
                    {modal === 'edit' && (
                      <p className="mt-1 text-[11px] text-on-surface-variant">
                        Login ID is read-only because the current auth schema uses it as the primary key.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Full Name</label>
                    <input
                      value={formName}
                      onChange={(e) => { setFormName(e.target.value); setFormError(''); }}
                      placeholder="Enter full legal name"
                      className="w-full border border-outline rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Role</label>
                    <select
                      value={formRole}
                      onChange={(e) => {
                        const nextRole = e.target.value as StaffRole | '';
                        setFormRole(nextRole);
                        if (nextRole !== 'DOCTOR') {
                          setFormDepartment('');
                        }
                        setFormError('');
                      }}
                      className="w-full border border-outline rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-all bg-white"
                    >
                      <option value="">Select role…</option>
                      <option value="DOCTOR">Doctor</option>
                      <option value="NURSE">Nurse</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  {formRole === 'DOCTOR' && (
                    <div>
                      <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Department</label>
                      <select
                        value={formDepartment}
                        onChange={(e) => { setFormDepartment(e.target.value); setFormError(''); }}
                        className="w-full border border-outline rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-all bg-white"
                      >
                        <option value="">Select department…</option>
                        {departments.map((department) => (
                          <option key={department} value={department}>{department}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              {modal === 'create' ? (
                <>
                  <div>
                    <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-1">Password</label>
                    <input
                      type="password"
                      value={formPassword}
                      onChange={(e) => { setFormPassword(e.target.value); setFormError(''); }}
                      placeholder="Min 8 chars, at least 1 number"
                      className="w-full border border-outline rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-all"
                    />
                  </div>

                  <button
                    onClick={handleCreateUserSubmit}
                    disabled={submitting}
                    className="w-full bg-primary text-white font-bold py-3 rounded-xl text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Processing...' : 'Create Account'}
                  </button>
                </>
              ) : modal === 'edit' ? (
                <button
                  onClick={handleEditUserSubmit}
                  disabled={submitting}
                  className="w-full bg-primary text-white font-bold py-3 rounded-xl text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Processing...' : 'Save Changes'}
                </button>
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
                        This temporary password is shown only for this reset action. Copy it now and share it securely with the staff member.
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
