import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Search, Bell, HelpCircle, Settings, LayoutDashboard, Stethoscope, ClipboardPlus, LogOut, Calendar, Plus, ChevronRight } from 'lucide-react';
import { NotificationDrawer } from '../ui/NotificationDrawer';
import { useToast, ToastContainer } from '../ui/Toast';
import { useNotifications } from '../../hooks/queries/useNotifications';
import { useSearchPatients } from '../../hooks/queries/usePatients';
import { useAuth } from '../../hooks/useAuth';
import { getDisplayRoleLabel, getNavigationItemsForRole } from '../../auth/roleBoundary';

export const BaseLayout = () => {
  const navigate = useNavigate();
  const { toasts, push, dismiss } = useToast();
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  const { unreadCount, isLive } = useNotifications();
  const { logout, user, role } = useAuth();
  const navigationItems = getNavigationItemsForRole(role);
  const canSearchPatients = role === 'doctor' || role === 'nurse';
  const groupedNavigation = navigationItems.reduce<Record<string, typeof navigationItems>>((acc, item) => {
    acc[item.section] = [...(acc[item.section] || []), item];
    return acc;
  }, {});

  const handleLogout = () => {
    logout();
    push('info', 'Logged Out', 'You have been securely signed out of Chettinad Care.');
    navigate('/login');
  };

  const handleSettings = () => {
    navigate('/settings');
  };

  const handleHelp = () => {
    push('error', 'Helpdesk Offline', 'IT support routing is not currently provisioned for this terminal.');
  };

  const { data: filteredPatients = [], isLoading: isSearchLoading } = useSearchPatients(searchQuery);

  return (
    <div className="flex h-screen bg-surface-container overflow-hidden relative">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      {/* Sidebar */}
      <aside className="w-64 bg-surface border-r border-outline flex flex-col justify-between flex-shrink-0">
        <div className="p-4 pt-6">
          {/* Wordmark */}
          <div className="flex items-center gap-2 px-2 mb-8 text-primary font-headline font-bold text-xl tracking-tight">
            Chettinad Care
          </div>

          {Object.entries(groupedNavigation).map(([section, items]) => (
            <div key={section} className="mb-6">
              <p className="px-4 mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant/60">
                {section}
              </p>
              <nav className="space-y-1">
                {items.map((item) => (
                  <SideNavItem
                    key={item.to}
                    icon={
                      item.section === 'doctor' ? (item.to.includes('appointments') ? <Calendar size={18} /> : <Stethoscope size={18} />)
                        : item.section === 'nurse' ? <ClipboardPlus size={18} />
                        : <LayoutDashboard size={18} />
                    }
                    label={item.label}
                    to={item.to}
                  />
                ))}
              </nav>
            </div>
          ))}

          {/* Contextual hint */}
          <div className="mx-2 mt-4 p-3 bg-surface-container rounded-lg border border-outline/30">
            <p className="text-[10px] font-semibold text-on-surface-variant leading-relaxed">
              {canSearchPatients
                ? 'Patient records, notes, and prescriptions open contextually from within each workflow.'
                : 'Admin access is limited to onboarding, staffing, and pilot operations controls.'}
            </p>
          </div>
          
          <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 bg-surface-container rounded-full mt-4 mx-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              {user?.name?.charAt(0)?.toUpperCase() || 'C'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-on-surface truncate">{user?.name || 'Chettinad Care'}</p>
              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">{getDisplayRoleLabel(role)}</p>
            </div>
          </div>
        </div>

        {/* Bottom utilities */}
        <div className="p-4 space-y-1 border-t border-outline/20">
          <button 
            onClick={handleSettings}
            className="flex items-center gap-3 px-4 py-3 w-full text-left text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all duration-200 rounded-lg font-medium"
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full text-left text-error hover:bg-error/5 transition-all duration-200 rounded-lg font-medium"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Stage */}
      <main className="flex-1 flex flex-col min-w-0 pr-4 pb-4">
        {/* Topbar */}
        <header className="h-20 flex items-center justify-between px-6 bg-surface-container z-10 sticky top-0">
          {canSearchPatients ? (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
              <input
                type="text"
                placeholder="Search patient registry by name, phone, or UHID..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchResults(e.target.value.length > 0);
                }}
                onFocus={() => searchQuery.length > 0 && setShowSearchResults(true)}
                className="bg-surface-container-high border-none rounded-lg pl-10 pr-4 py-2 text-sm w-80 focus:ring-2 focus:ring-primary focus:outline-none transition-all placeholder:text-on-surface-variant font-medium"
              />
              {showSearchResults && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-outline rounded-xl shadow-2xl overflow-hidden z-20">
                  <div className="p-2 border-b border-outline/10 bg-surface-container-low">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest pl-2">Patient Registry Match</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {isSearchLoading ? (
                      <div className="p-8 flex justify-center items-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      </div>
                    ) : filteredPatients.length === 0 ? (
                      <div className="p-4 text-center text-xs text-on-surface-variant italic">No matches found in the patient registry.</div>
                    ) : (
                      filteredPatients.map(p => (
                        <button 
                          key={p.id}
                          onClick={() => {
                            setShowSearchResults(false);
                            setSearchQuery('');
                            navigate(`/clinical/patient/${p.id}/dossier`);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-primary/5 border-b border-outline/5 last:border-0 flex items-center justify-between group"
                        >
                          <div>
                            <span className="font-bold text-sm block text-on-surface group-hover:text-primary transition-colors">{p.name}</span>
                            <span className="text-[10px] text-on-surface-variant font-medium">{p.phone || p.mrn} · {p.age}Y · {p.gender}</span>
                          </div>
                          <ChevronRight size={14} className="text-on-surface-variant group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all mr-1" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
              {showSearchResults && (
                <div className="fixed inset-0 z-10" onClick={() => setShowSearchResults(false)}></div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-outline/30 bg-surface-container-low px-4 py-2 text-xs font-semibold text-on-surface-variant">
              Restricted pilot operations console
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowNotifications(true)}
                className="p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors rounded-full relative"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-error text-white text-[9px] font-black rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
              {isLive && (
                <span
                  className="text-[9px] font-bold text-green-500 flex items-center gap-0.5 select-none"
                  title="Real-time notifications active"
                >
                  ● Live
                </span>
              )}
            </div>
            <button 
              onClick={handleHelp}
              className="p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors rounded-full"
            >
              <HelpCircle size={20} />
            </button>
          </div>
        </header>

        {/* Dynamic Route Content */}
        <div className="flex-1 overflow-auto bg-surface rounded-xl border border-outline/30 shadow-sm">
          <div className="p-8">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Notification Drawer */}
      {showNotifications && (
        <NotificationDrawer onClose={() => setShowNotifications(false)} />
      )}
    </div>
  );
};

const SideNavItem = ({
  icon, label, to,
}: {
  icon: React.ReactNode;
  label: string;
  to: string;
}) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `flex items-center gap-3 px-4 py-3 w-full text-left transition-all duration-200 ease-in-out rounded-lg font-medium ${
        isActive
          ? 'text-primary border-r-2 border-primary bg-primary/5'
          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`
    }
  >
    <span className="opacity-80">{icon}</span>
    <span>{label}</span>
  </NavLink>
);
