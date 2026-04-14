import React, { useState } from 'react';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';
import { useAuth } from '../hooks/useAuth';
import { getHomeRouteForSession } from '../auth/roleBoundary';

export const ChangePassword = () => {
  const navigate = useNavigate();
  const { role, accountType, clearMustChangePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Fill in all password fields to continue.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await authApi.changePassword({ currentPassword, newPassword });
      clearMustChangePassword();
      navigate(getHomeRouteForSession(role, accountType), { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to change password. Please verify your current password and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-container flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-outline/30 bg-white shadow-xl overflow-hidden">
        <div className="bg-primary p-6 text-center text-white">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
            <ShieldCheck size={28} />
          </div>
          <h1 className="text-2xl font-extrabold">Change Temporary Password</h1>
          <p className="mt-1 text-sm text-white/85">
            You must update your password before entering Chettinad Care.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && (
            <div className="rounded-xl border border-error/20 bg-error/10 p-3 text-sm font-semibold text-error">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={submitting}
              className="w-full rounded-xl border border-outline bg-surface-container px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={submitting}
              className="w-full rounded-xl border border-outline bg-surface-container px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={submitting}
              className="w-full rounded-xl border border-outline bg-surface-container px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white transition-all ${
              submitting ? 'cursor-not-allowed bg-outline opacity-70' : 'bg-primary hover:brightness-110'
            }`}
          >
            {submitting ? 'Updating Password...' : <>Continue <ArrowRight size={16} /></>}
          </button>
        </form>
      </div>
    </div>
  );
};
