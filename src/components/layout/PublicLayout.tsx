import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { ShieldCheck, Menu, X, ArrowRight } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getHomeRouteForRole } from '../../auth/roleBoundary';

export const PublicLayout = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const location = useLocation();
  const { role } = useAuth();
  
  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'About Us', path: '/about' },
    { name: 'Specialties', path: '/specialties' },
    { name: 'Contact', path: '/contact' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-surface-container-low font-body">
      {/* ── Navbar ── */}
      <header className="bg-white border-b border-outline/30 sticky top-0 z-50 shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 shrink-0 group">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center group-hover:bg-primary transition-colors">
                <ShieldCheck size={24} className="text-primary group-hover:text-white transition-colors" />
              </div>
              <div>
                <div className="font-extrabold text-lg text-on-surface leading-none tracking-tight mb-0.5">Chettinad Care</div>
                <div className="text-[10px] uppercase font-bold text-on-surface-variant tracking-widest leading-none">Clinical Excellence</div>
              </div>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`text-sm font-semibold transition-colors ${
                    location.pathname === link.path 
                      ? 'text-primary' 
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {link.name}
                </Link>
              ))}
            </nav>

            {/* CTA / Contextual Action */}
            <div className="hidden md:flex items-center gap-4">
              <Link
                to={role ? getHomeRouteForRole(role) : '/login'}
                className="bg-primary text-white font-bold text-sm px-6 py-2.5 rounded-full hover:bg-primary/90 hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-1.5"
              >
                {role ? 'Go to Dashboard' : 'Portal Login'}
                <ArrowRight size={16} />
              </Link>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-on-surface hover:text-primary transition-colors p-2"
              >
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-outline/30 shadow-lg absolute w-full left-0 animate-slide-in-right">
            <div className="px-4 pt-2 pb-6 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`block px-3 py-4 text-base font-bold border-b border-outline/10 ${
                    location.pathname === link.path ? 'text-primary' : 'text-on-surface-variant'
                  }`}
                >
                  {link.name}
                </Link>
              ))}
              <div className="pt-4">
                <Link
                  to={role ? getHomeRouteForRole(role) : '/login'}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full flex justify-center items-center gap-2 bg-primary text-white font-bold text-sm px-6 py-4 rounded-xl shadow-md"
                >
                  {role ? 'Go to Dashboard' : 'Portal Login'}
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── Main Content Area ── */}
      <main className="flex-1 flex flex-col items-center">
         <Outlet />
      </main>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-outline/40 pb-8 pt-16 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-2 mb-6">
                <ShieldCheck size={24} className="text-primary" />
                <span className="font-extrabold text-lg text-on-surface tracking-tight">Chettinad Care</span>
              </div>
              <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
                Advancing regional healthcare through secure, structured, and compassionate clinical integration.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-on-surface mb-6 uppercase tracking-wider text-xs">Patients & Visitors</h3>
              <ul className="space-y-4 text-sm font-medium text-on-surface-variant">
                <li><Link to="/contact" className="hover:text-primary transition-colors">Find a Doctor</Link></li>
                <li><Link to="/specialties" className="hover:text-primary transition-colors">Clinical Departments</Link></li>
                <li><Link to="/contact" className="hover:text-primary transition-colors">Emergency Services</Link></li>
                <li><Link to="/patient/activate" className="hover:text-primary transition-colors">Activate Portal Access</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-on-surface mb-6 uppercase tracking-wider text-xs">Institutional</h3>
              <ul className="space-y-4 text-sm font-medium text-on-surface-variant">
                <li><Link to="/about" className="hover:text-primary transition-colors">About Us</Link></li>
                <li><Link to="#" className="hover:text-primary transition-colors">Digital Governance (Phase 2)</Link></li>
                <li><Link to="#" className="hover:text-primary transition-colors">Terms of Service</Link></li>
                <li><Link to="#" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-on-surface mb-6 uppercase tracking-wider text-xs">Contact</h3>
              <ul className="space-y-4 text-sm font-medium text-on-surface-variant">
                <li className="flex items-start gap-2">
                   <div className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-error" />
                   <div>Emergency: <span className="text-on-surface font-bold">Ext 1800</span></div>
                </li>
                <li>IT Support: Ext 1999</li>
                <li>chettinad-care@internal.local</li>
              </ul>
            </div>
            
          </div>
          
          <div className="border-t border-outline/20 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-semibold text-on-surface-variant">
            <p>© {new Date().getFullYear()} Chettinad Health City. All Rights Reserved.</p>
            <p>Phase 2 End-to-End Restricted Pilot</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
