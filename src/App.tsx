import React from 'react'
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Prevent refetching mock data
      retry: false,
    },
  },
})

// Layouts
import { BaseLayout } from './components/layout/BaseLayout'
import { PatientLayout } from './components/layout/PatientLayout'

// Auth / Login / External
import { Login } from './pages/Login'
import { PatientActivation } from './pages/patient/PatientActivation'
import { PublicLayout } from './components/layout/PublicLayout'
import { Home } from './pages/public/Home'
import { About } from './pages/public/About'
import { Specialties } from './pages/public/Specialties'
import { Contact } from './pages/public/Contact'

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
  const { role, status } = useAuth()
  const location = useLocation()
  
  if (status === 'bootstrapping') return <div className="min-h-screen bg-surface-container flex items-center justify-center text-primary font-bold">Loading session...</div>;
  if (!role || status === 'unauthenticated') return <Navigate to="/login" state={{ from: location }} replace />
  if (!allowed.includes(role)) return <Navigate to="/login" replace />
  return <Outlet />
}

const StaffGuard = () => <RequireRole allowed={['doctor', 'nurse', 'admin']} />
const PatientGuard = () => <RequireRole allowed={['patient']} />

// ── Root Redirect ────────────────────────────────────────────────────────────

const RootRedirect = () => {
  const { role, status } = useAuth()
  if (status === 'bootstrapping') return <div className="min-h-screen bg-surface-container flex items-center justify-center text-primary font-bold">Loading session...</div>;
  if (role === 'patient') return <Navigate to="/patient/dashboard" replace />
  if (role === 'doctor') return <Navigate to="/clinical/command-center" replace />
  if (role === 'admin') return <Navigate to="/admin/dashboard" replace />
  if (role === 'nurse') return <Navigate to="/operations/nurse-triage" replace />
  return <Navigate to="/login" replace />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
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
        <Route element={<StaffGuard />}>
          <Route element={<BaseLayout />}>
            <Route path="/settings" element={<InstitutionalSettings />} />
            <Route path="/clinical/patient/:patientId/dossier" element={<PatientDossier />} />
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
