import React, { useState } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Building2, User as UserIcon, Bell, Shield, Save } from 'lucide-react';
import { useToast, ToastContainer } from '../components/ui/Toast';
import { useAuth } from '../hooks/useAuth';

export const InstitutionalSettings = () => {
  const { toasts, push, dismiss } = useToast();
  const { role, user } = useAuth();
  const displayRole = role?.toUpperCase() || 'STAFF';
  
  const [activeTab, setActiveTab] = useState('profile');

  const handleSave = () => {
    push('error', 'Settings Offline', 'The institutional preferences API is not globally mounted. Changes cannot be saved.');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      
      <div>
        <h3 className="text-on-surface-variant font-semibold text-sm tracking-wider uppercase">App Configuration</h3>
        <h1 className="text-3xl font-bold tracking-tight text-on-surface">Institutional Settings</h1>
      </div>

      <div className="flex gap-6">
        {/* Sidebar Tabs */}
        <div className="w-64 shrink-0 space-y-1">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${activeTab === 'profile' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
          >
            <UserIcon size={18} /> My Profile
          </button>
          <button 
            onClick={() => setActiveTab('notifications')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${activeTab === 'notifications' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
          >
            <Bell size={18} /> Notification Preferences
          </button>
          <button 
            onClick={() => setActiveTab('hospital')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${activeTab === 'hospital' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
          >
            <Building2 size={18} /> Facility Context
          </button>
          <button 
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-colors ${activeTab === 'security' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
          >
            <Shield size={18} /> Access & Security
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1">
          {activeTab === 'profile' && (
            <Card>
              <CardHeader>My Profile & Role</CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center font-extrabold text-2xl">
                    CC
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">{user || 'Chettinad Care User'}</h2>
                    <span className="text-xs font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded">{displayRole}</span>
                  </div>
                </div>
                
                <hr className="border-outline/20" />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant block mb-1">Full Name</label>
                    <input type="text" disabled value={user || 'Default User'} className="w-full bg-surface-container-low border border-outline/30 rounded p-2 text-sm text-on-surface-variant" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant block mb-1">Staff ID</label>
                    <input type="text" disabled value="CC-STAFF-902" className="w-full bg-surface-container-low border border-outline/30 rounded p-2 text-sm text-on-surface-variant" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'notifications' && (
            <Card>
              <CardHeader>Notification Preferences</CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 border border-outline/30 rounded-lg">
                  <div>
                    <h4 className="font-bold text-sm text-on-surface">Critical Pathway Alerts</h4>
                    <p className="text-xs text-on-surface-variant">Sound alarm for Critical Lab Values & Urgent Triage</p>
                  </div>
                  <input type="checkbox" defaultChecked className="w-4 h-4 accent-primary" />
                </div>
                <div className="flex items-center justify-between p-3 border border-outline/30 rounded-lg">
                  <div>
                    <h4 className="font-bold text-sm text-on-surface">Routine Queue Updates</h4>
                    <p className="text-xs text-on-surface-variant">Silent notification for general waitbox progression</p>
                  </div>
                  <input type="checkbox" defaultChecked className="w-4 h-4 accent-primary" />
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'hospital' && (
            <Card>
              <CardHeader>Facility Context</CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant block mb-1">Current Facility</label>
                  <select className="w-full p-2 border border-outline rounded bg-white text-sm outline-none focus:border-primary">
                    <option>Chettinad Hospital & Research Institute (Main Campus)</option>
                    <option>Chettinad Urban Health Center (Kelambakkam)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant block mb-1">Default Department</label>
                  <select className="w-full p-2 border border-outline rounded bg-white text-sm outline-none focus:border-primary">
                    <option>General Medicine</option>
                    <option>Cardiology</option>
                    <option>Emergency Room</option>
                  </select>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'security' && (
            <Card>
              <CardHeader>Access & Security</CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-on-surface-variant">Security settings are managed centrally by the IT administrator.</p>
                <div className="p-4 bg-tertiary/10 border border-tertiary/20 rounded-lg flex gap-3">
                  <Shield size={20} className="text-tertiary shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm text-tertiary">2FA Active</h4>
                    <p className="text-xs text-tertiary/80 mt-1">Multi-factor authentication is enforced across the clinical network.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="mt-6 flex justify-end">
            <button 
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white font-bold rounded-lg hover:brightness-110 transition-all shadow-sm shadow-primary/20"
            >
              <Save size={18} /> Save Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
