import React from 'react'
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getHomeRouteForSession, isRouteAllowedForSession, isSessionBoundaryValid } from './auth/roleBoundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Prevent refetching mock data
      retry: false,
    },
  },
})

const SessionResetRedirect = ({ to, state }: { to: string; state?: unknown }) => {
  const { logout } = useAuth()

  React.useEffect(() => {
    logout()
  }, [logout])

  return <Navigate to={to} replace state={state} />
}

const SessionBoundaryWatcher = () => {
  const { role, accountType, status, logout } = useAuth()
  const location = useLocation()

  React.useEffect(() => {
    if (status !== 'authenticated') {
      return
    }

    if (!isRouteAllowedForSession(location.pathname, role, accountType)) {
      logout()
    }
  }, [accountType, location.pathname, logout, role, status])

  return null
}

// Layouts
import { BaseLayout } from './components/layout/BaseLayout'
import { PatientLayout } from './components/layout/PatientLayout'

// Auth / Login / External
import { Login } from './pages/Login'
import { PatientActivation } from './pages/patient/PatientActivation'
import { PublicLayout } from './components/layout/PublicLayout'
import { Home } from './pages/public/Home'
import { About } from './pages/public/about'
import { Specialties } from './pages/public/specialties'
import { Contact } from './pages/public/contact'

// Clinical Staff Pages
import { DoctorCommandCenter } from './pages/DoctorCommandCenter'
import { DoctorAppointments } from './pages/DoctorAppointments'
import { AdminDashboard } from './pages/AdminDashboard'
import { PatientDossier } from './pages/PatientDossier'
import { NurseTriage } from './pages/NurseTriage'
import { ClinicalNoteEditor } from './pages/ClinicalNoteEditor'
import { PrescriptionBuilder } from './pages/PrescriptionBuilder'
import { InstitutionalSettings } from './pages/InstitutionalSettings'

// Patient Portal Pages
import { PatientDashboard } from './pages/patient/PatientDashboard'
import { PatientAppointments } from './pages/patient/PatientAppointments'
import { PatientPrescriptions } from './pages/patient/PatientPrescriptions'
import { PatientRecords } from './pages/patient/PatientRecords'

// ── Role Guards ──────────────────────────────────────────────────────────────

const RequireRole = ({ allowed }: { allowed: string[] }) => {
  const { role, accountType, status } = useAuth()
  const location = useLocation()
  
  if (status === 'bootstrapping') return <div className="min-h-screen bg-surface-container flex items-center justify-center text-primary font-bold">Loading session...</div>;
  if (!role || status === 'unauthenticated') return <Navigate to="/login" state={{ from: location }} replace />
  if (!isSessionBoundaryValid(role, accountType) || !allowed.includes(role)) {
    return <SessionResetRedirect to="/login" state={{ from: location }} />
  }
  return <Outlet />
}

const StaffGuard = () => <RequireRole allowed={['doctor', 'nurse', 'admin']} />
const PatientGuard = () => <RequireRole allowed={['patient']} />

// ── Root Redirect ────────────────────────────────────────────────────────────

const RootRedirect = () => {
  const { role, accountType, status } = useAuth()
  if (status === 'bootstrapping') return <div className="min-h-screen bg-surface-container flex items-center justify-center text-primary font-bold">Loading session...</div>;
  if (!role) return <Navigate to="/login" replace />
  if (!isSessionBoundaryValid(role, accountType)) return <SessionResetRedirect to="/login" />
  return <Navigate to={getHomeRouteForSession(role, accountType)} replace />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionBoundaryWatcher />
        <Routes>

        {/* ── Public Website ── */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/specialties" element={<Specialties />} />
          <Route path="/contact" element={<Contact />} />
        </Route>

        {/* ── Entry (Decoupled from PublicLayout) ── */}
        <Route path="/login" element={<Login />} />
        <Route path="/patient/activate" element={<PatientActivation />} />

        {/* ── Clinical Staff (Shared Dossier/Access) ── */}
        <Route element={<RequireRole allowed={['doctor', 'nurse', 'admin']} />}>
          <Route element={<BaseLayout />}>
            <Route path="/settings" element={<InstitutionalSettings />} />
          </Route>
        </Route>

        <Route element={<RequireRole allowed={['doctor', 'nurse']} />}>
          <Route element={<BaseLayout />}>
            <Route path="/clinical/patient/:patientId/dossier" element={<PatientDossier />} />
          </Route>
        </Route>

        <Route element={<RequireRole allowed={['doctor']} />}>
          <Route element={<BaseLayout />}>
            <Route path="/clinical/patient/:patientId/note/:consultationId?" element={<ClinicalNoteEditor />} />
            <Route path="/clinical/patient/:patientId/prescription/:prescriptionId?" element={<PrescriptionBuilder />} />
          </Route>
        </Route>

        {/* ── Doctor Specific ── */}
        <Route element={<RequireRole allowed={['doctor']} />}>
          <Route element={<BaseLayout />}>
            <Route path="/clinical/command-center" element={<DoctorCommandCenter />} />
            <Route path="/clinical/appointments" element={<DoctorAppointments />} />
          </Route>
        </Route>

        {/* ── Nurse Specific ── */}
        <Route element={<RequireRole allowed={['nurse']} />}>
          <Route element={<BaseLayout />}>
            <Route path="/operations/nurse-triage" element={<NurseTriage />} />
          </Route>
        </Route>

        {/* ── Admin Specific ── */}
        <Route element={<RequireRole allowed={['admin']} />}>
          <Route element={<BaseLayout />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
          </Route>
        </Route>

        {/* ── Patient Portal ── */}
        <Route element={<PatientGuard />}>
          <Route element={<PatientLayout />}>
            <Route path="/patient/dashboard" element={<PatientDashboard />} />
            <Route path="/patient/appointments" element={<PatientAppointments />} />
            <Route path="/patient/prescriptions" element={<PatientPrescriptions />} />
            <Route path="/patient/records" element={<PatientRecords />} />
          </Route>
        </Route>

        {/* ── 404 ── */}
        <Route path="*" element={
          <div className="min-h-screen flex flex-col items-center justify-center text-on-surface-variant gap-4 bg-surface-container">
            <p className="text-6xl font-black opacity-10">404</p>
            <p className="text-xl font-bold">Page not found</p>
            <a href="/login" className="text-primary text-sm font-semibold hover:underline">← Return to Login</a>
          </div>
        } />

      </Routes>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
