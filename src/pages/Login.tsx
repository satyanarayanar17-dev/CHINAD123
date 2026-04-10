import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, User, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import type { AccountType } from '../auth/roleBoundary';
import { getHomeRouteForSession } from '../auth/roleBoundary';

export const Login = () => {
  const navigate = useNavigate();
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType>(null);
  const [id, setId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!id.trim() || !pin.trim()) {
      setError('Please enter your credentials to continue.');
      return;
    }

    if (!selectedAccountType) {
      setError('Select patient or staff login first.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const finalRole = await login({
        username: id.trim(),
        password: pin.trim(),
        accountType: selectedAccountType
      });
      navigate(getHomeRouteForSession(finalRole, selectedAccountType));
    } catch (e: any) {
      if (e.response?.status === 401) {
        setError('Invalid credentials.');
      } else if (e.response?.status === 403 || e.message === 'ACCOUNT_TYPE_MISMATCH') {
        setError(
          selectedAccountType === 'patient'
            ? 'This account is not allowed on the patient login path.'
            : 'This account is not allowed on the staff login path.'
        );
      } else {
        setError('Network Error. Backend unresponsive.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-container flex">

      {/* ── Left Panel — Branding ─────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-5/12 bg-primary flex-col justify-between p-12 relative overflow-hidden">
        {/* Background texture circles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-white/5 rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-white/5 rounded-full pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <ShieldCheck size={22} className="text-white" />
            </div>
            <span className="text-white font-bold text-xl tracking-tight">Chettinad Care</span>
          </div>
          <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Chettinad Hospital<br />& Research Institute
          </h1>
          <p className="text-white/70 text-base leading-relaxed max-w-xs">
            A secure, role-based platform for digitising clinical and patient care workflows within the institution.
          </p>
        </div>

        <div className="relative z-10 space-y-4">
          {[
            'Appointment booking & scheduling',
            'Prescription management & reminders',
            'Lab reports & scan access',
            'Clinical notes & follow-up tracking',
          ].map(feat => (
            <div key={feat} className="flex items-center gap-3 text-white/80 text-sm">
              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>
              {feat}
            </div>
          ))}
        </div>
      </div>

      {/* ── Right Panel — Login Form ──────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">

          {/* Mobile wordmark */}
          <div className="lg:hidden flex items-center gap-2 mb-8 text-primary font-bold text-xl">
            <ShieldCheck size={24} />
            Chettinad Care
          </div>

          <h2 className="text-2xl font-extrabold text-on-surface mb-1">Welcome back</h2>
          <p className="text-sm text-on-surface-variant mb-8">
            Sign in to your Chettinad Care account.
          </p>

          {/* Role Selector */}
          {!selectedAccountType ? (
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">
                Select your role
              </p>
              <button
                onClick={() => setSelectedAccountType('staff')}
                className="w-full flex items-center gap-4 p-4 bg-white border-2 border-outline rounded-xl hover:border-primary hover:bg-primary/5 transition-all group shadow-sm"
              >
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Stethoscope size={24} className="text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-bold text-on-surface">Doctor / Staff Login</div>
                  <div className="text-xs text-on-surface-variant">Clinical staff, nurses, admin</div>
                </div>
                <ArrowRight size={18} className="text-on-surface-variant group-hover:text-primary transition-colors" />
              </button>

              {/* Patient login enabled for Phase 2 Patient Foundation */}
              <button
                onClick={() => setSelectedAccountType('patient')}
                className="w-full flex items-center gap-4 p-4 bg-white border-2 border-outline rounded-xl hover:border-tertiary hover:bg-tertiary/5 transition-all group shadow-sm"
              >
                <div className="w-12 h-12 bg-tertiary/10 rounded-xl flex items-center justify-center group-hover:bg-tertiary/20 transition-colors">
                  <User size={24} className="text-tertiary" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-bold text-on-surface">Patient Login</div>
                  <div className="text-xs text-on-surface-variant">Access your clinical records</div>
                </div>
                <ArrowRight size={18} className="text-on-surface-variant group-hover:text-tertiary transition-colors" />
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Back to role selection */}
              <button
                onClick={() => { setSelectedAccountType(null); setError(''); setId(''); setPin(''); }}
                className="text-xs font-bold text-on-surface-variant hover:text-on-surface flex items-center gap-1 mb-2 transition-colors"
              >
                ← Change role
              </button>

              {/* Role badge */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                selectedAccountType === 'staff'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-tertiary/10 text-tertiary'
              }`}>
                {selectedAccountType === 'staff' ? <Stethoscope size={16} /> : <User size={16} />}
                {selectedAccountType === 'staff' ? 'Doctor / Staff Login' : 'Patient Login'}
              </div>

              {/* Credential fields */}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  {selectedAccountType === 'staff' ? 'Staff ID' : 'Patient UHID'}
                </label>
                <input
                  type="text"
                  value={id}
                  onChange={e => setId(e.target.value)}
                  placeholder={selectedAccountType === 'staff' ? 'e.g. CHRI-DOC-001' : 'e.g. CC-99821'}
                  className="w-full bg-white border border-outline rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Password
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  className="w-full bg-white border border-outline rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>

              {selectedAccountType === 'patient' && (
                <div className="text-center w-full pt-1 pb-1">
                  <button 
                    onClick={() => navigate('/patient/activate')}
                    className="text-xs font-bold text-tertiary hover:underline"
                  >
                    First time bridging account? Activate here.
                  </button>
                </div>
              )}

              {error && (
                <p className="text-xs text-error font-semibold">{error}</p>
              )}

              <button
                onClick={handleLogin}
                disabled={loading}
                className={`w-full py-3.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm ${
                  selectedAccountType === 'staff'
                    ? 'bg-primary hover:brightness-110 shadow-primary/20'
                    : 'bg-tertiary hover:brightness-110 shadow-tertiary/20'
                } ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {loading ? (
                  <span className="animate-pulse">Signing in…</span>
                ) : (
                  <>Sign In <ArrowRight size={16} /></>
                )}
              </button>

              <p className="text-center text-xs text-on-surface-variant pt-2">
                Need help? Contact{' '}
                <span className="text-primary font-semibold cursor-pointer hover:underline">
                  IT Support — Ext. 1800
                </span>
              </p>
            </div>
          )}

          <div className="mt-12 pt-6 border-t border-outline/30 text-center text-[11px] text-on-surface-variant">
            Chettinad Hospital And Research Institute · Internal Platform · Confidential
          </div>
        </div>
      </div>
    </div>
  );
};
