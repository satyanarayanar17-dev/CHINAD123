import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, UserCheck, KeySquare, ArrowRight } from 'lucide-react';
import { api } from '../../api/client';

export const PatientActivation = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setError('Enter the mobile number shared during onboarding.');
      return;
    }
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Activation code must be exactly 6 digits.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.post('/activation/claim', {
        phone: phone.trim(),
        otp: otp.trim(),
        new_password: password
      });
      
      setSuccess('Account activated successfully. You can now log in.');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Activation failed. Please check your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-container flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-xl overflow-hidden border border-outline/30">
        <div className="bg-primary p-6 text-center text-white relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="inline-flex w-12 h-12 bg-white/20 rounded-xl items-center justify-center mb-4">
            <UserCheck size={28} className="text-white" />
          </div>
          <h2 className="text-2xl font-extrabold mb-1">Activate Patient Portal</h2>
          <p className="text-white/80 text-sm">Secure your Chettinad Care clinical identity</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-error/10 text-error text-sm font-semibold rounded-lg border border-error/20">{error}</div>}
          {success && <div className="p-3 bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-lg border border-emerald-200 flex items-center gap-2"><ShieldCheck size={18} /> {success}</div>}
          <div className="rounded-xl border border-outline/20 bg-surface-container-low p-4 text-xs text-on-surface-variant">
            Enter the mobile number and one-time activation code issued during onboarding. Activation only succeeds when the patient identity, active encounter, and unused code all match.
          </div>

          <div>
            <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Mobile Number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 98765 43210"
              required
              disabled={loading || !!success}
              className="w-full bg-surface-container border border-outline rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">6-Digit Activation Code</label>
            <input
              type="text"
              value={otp}
              onChange={e => setOtp(e.target.value)}
              placeholder="XXXXXX"
              maxLength={6}
              required
              disabled={loading || !!success}
              className="w-full bg-surface-container border border-outline rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-mono tracking-widest uppercase"
            />
          </div>

          <div className="pt-2">
            <label className="block text-xs font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Create Permanent Password</label>
            <div className="space-y-3">
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
                disabled={loading || !!success}
                className="w-full bg-surface-container border border-outline rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
                disabled={loading || !!success}
                className="w-full bg-surface-container border border-outline rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
              />
            </div>
            <p className="text-[10px] text-on-surface-variant mt-2 flex items-center gap-1">
              <KeySquare size={12} /> Password will be cryptographically secured using bcrypt encryption.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !!success}
            className={`w-full mt-6 py-3.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm ${
              loading || success ? 'bg-outline cursor-not-allowed opacity-70' : 'bg-primary hover:brightness-110 shadow-primary/20'
            }`}
          >
            {loading ? 'Verifying Identity...' : (success ? 'Activated' : <>Activate Account <ArrowRight size={16} /></>)}
          </button>
        </form>

        <div className="bg-surface-container/50 p-4 border-t border-outline/30 text-center">
          <button 
            type="button" 
            onClick={() => navigate('/login')}
            className="text-xs font-bold text-on-surface-variant hover:text-primary transition-colors"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};
