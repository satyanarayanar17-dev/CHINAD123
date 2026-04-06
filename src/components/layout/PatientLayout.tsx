import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Calendar, Pill, FileText, LogOut, User, Bell } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { to: '/patient/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { to: '/patient/appointments', label: 'Appointments', icon: <Calendar size={18} /> },
  { to: '/patient/prescriptions', label: 'Prescriptions', icon: <Pill size={18} /> },
  { to: '/patient/records', label: 'Records', icon: <FileText size={18} /> },
];

export const PatientLayout = () => {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const username = user || 'Patient';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#F4F6FA] flex flex-col">

      {/* ── Top Navigation ──────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-xs">CC</span>
            </div>
            <div>
              <span className="font-extrabold text-primary text-base tracking-tight">Chettinad Care</span>
              <span className="hidden sm:inline text-on-surface-variant text-xs ml-2">Patient Portal</span>
            </div>
          </div>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-on-surface-variant hover:bg-gray-100 hover:text-on-surface'
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Right utilities */}
          <div className="flex items-center gap-2">
            <button className="p-2 text-on-surface-variant hover:bg-gray-100 rounded-full transition-colors relative">
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full border border-white" />
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-sm font-semibold text-on-surface cursor-pointer hover:bg-gray-200 transition-colors">
              <User size={16} className="text-primary" />
              <span className="hidden sm:block">{username}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-error hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut size={16} />
              <span className="hidden sm:block">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile Bottom Nav ─────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 flex">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-3 gap-1 text-[10px] font-semibold transition-colors ${
                isActive ? 'text-primary' : 'text-on-surface-variant'
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* ── Page Content ─────────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-8">
        <Outlet />
      </main>
    </div>
  );
};
