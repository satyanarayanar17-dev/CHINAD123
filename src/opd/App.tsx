import { useCallback, useEffect, useRef, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  FileClock,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  api, setAccessToken, clearAccessToken, acceptBrowserSession, prepareBrowserSignIn,
  isSessionRestoreBlocked, beginBrowserLogout, finishBrowserLogout, SESSION_ENDED_EVENT,
  getSessionGeneration,
} from "../api/client";
import { I18nProvider, LanguageSelect, useI18n, formatDate } from "./i18n";
import {
  get,
  Alert,
  Loading,
  Button,
  Field,
  DataForm,
  useAction,
  Panel,
  errorCode,
  Empty,
} from "./ui";
import { profileFields } from "./booking";
import {
  Overview,
  AppointmentsPage,
  PatientsPage,
  QueuePage,
  LaboratoryPage,
} from "./operations";
import type { PageProps } from "./operations";
import {
  SchedulesPage,
  Administration,
  AuditPage,
  SettingsPage,
  PasswordForm,
} from "./admin";
import { PatientRecord } from "./records";
import { Consultation } from "./workspace";
import { CarePlanPage } from "./carePlan";
import type { Session, Notification } from "./types";
import "./styles.css";

const client = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: true, staleTime: 5000 },
  },
});
async function restoreSession(): Promise<Session | null | undefined> {
  const generation = getSessionGeneration();
  if (isSessionRestoreBlocked()) {
    await finishBrowserLogout();
    return generation === getSessionGeneration() ? null : undefined;
  }
  try {
    const refreshed = await api.post<{ access_token: string }>(
      "/auth/refresh",
      {},
    );
    if (generation !== getSessionGeneration() || isSessionRestoreBlocked()) return undefined;
    setAccessToken(refreshed.data.access_token);
    const restored = await get<Session>("/session");
    return generation === getSessionGeneration() && !isSessionRestoreBlocked() ? restored : undefined;
  } catch (e) {
    // A previous auth request must not clear or replace a newer session.
    if (generation !== getSessionGeneration()) return undefined;
    clearAccessToken();
    if ((e as { response?: { status: number } }).response?.status === 401)
      return null;
    throw e;
  }
}
const navigation: Record<Session["role"], string[]> = {
  PATIENT: [
    "overview",
    "appointments",
    "carePlan",
    "queue",
    "records",
    "laboratory",
    "settings",
  ],
  ADMIN: [
    "overview",
    "appointments",
    "queue",
    "patients",
    "schedules",
    "laboratory",
    "administration",
    "audit",
    "settings",
  ],
  NURSE: ["queue", "appointments", "laboratory", "settings"],
  DOCTOR: ["overview", "queue", "appointments", "laboratory", "schedules", "settings"],
};
const icons: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  appointments: CalendarDays,
  carePlan: HeartPulse,
  queue: Activity,
  patients: Users,
  schedules: CalendarDays,
  laboratory: FlaskConical,
  records: ClipboardList,
  administration: ShieldCheck,
  audit: FileClock,
  settings: Settings,
};
function Brand() {
  const { t } = useI18n();
  return (
    <div className="brand">
      <img src="/logo.png" className="brand-logo" alt="Chettinad Health City" style={{ height: "40px", objectFit: "contain", marginRight: "12px" }} />
    </div>
  );
}
function Login({
  onLogin,
  error: bootstrapError,
  onRetry,
}: {
  onLogin: (token: string, generation: number) => Promise<void>;
  error: string;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"patient" | "staff">("patient");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [developmentCode, setDevelopmentCode] = useState("");
  const [newPatient, setNewPatient] = useState(false);
  const action = useAction();
  const config = useQuery({
    queryKey: ["opd", "public-config"],
    queryFn: () =>
      api
        .get<{ demo_otp: boolean; sms_available: boolean }>("/auth/opd/config")
        .then((r) => r.data),
  });
  const signIn = async (endpoint: string, payload: unknown) => {
    const generation = getSessionGeneration();
    let token: string;
    try {
      await prepareBrowserSignIn();
      if (generation !== getSessionGeneration()) return;
      const r = await api.post<{ access_token: string }>(endpoint, payload);
      if (generation !== getSessionGeneration()) return;
      token = r.data.access_token;
    } catch (e) {
      if (generation !== getSessionGeneration()) return;
      throw e;
    }
    await onLogin(token, generation);
  };
  const patientSignIn = (profile?: Record<string, string>) =>
    void action.run(() => signIn("/auth/opd/otp/verify", { phone, code, ...(newPatient ? { profile } : {}) }));
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand />
        <div className="story-main">
          <span className="story-kicker">{t("connected")}</span>
          <h1>{t("tagline")}</h1>
          <p>{t("intro")}</p>
          <div className="journey-art" aria-hidden="true">
            <div className="art-path" />
            {[CalendarDays, Activity, Stethoscope, ClipboardList].map(
              (Icon, i) => (
                <div className={`art-node node-${i}`} key={i}>
                  <Icon size={27} />
                </div>
              ),
            )}
            <span className="art-center">
              <HeartPulse size={52} />
            </span>
          </div>
          <div className="story-steps">
            <span>01 · {t("appointments")}</span>
            <span>02 · {t("consultation")}</span>
            <span>03 · {t("followUp")}</span>
          </div>
        </div>
        <p className="story-footer">{t("hospital")}</p>
      </section>
      <section className="login-main">
        <div className="login-top">
          <LanguageSelect />
        </div>
        <div className="login-card">
          <div className="mobile-brand">
            <Brand />
          </div>
          <p className="eyebrow">{t("welcome")}</p>
          <h2>{t(mode === "patient" ? "patientLogin" : "staffLogin")}</h2>
          <p className="muted">{t("secureAccess")}</p>
          <div className="login-tabs">
            <button
              onClick={() => {
                setMode("patient");
                action.setError("");
              }}
              className={mode === "patient" ? "active" : ""}
              aria-pressed={mode === "patient"}
            >
              {t("patient")}
            </button>
            <button
              onClick={() => {
                setMode("staff");
                action.setError("");
              }}
              className={mode === "staff" ? "active" : ""}
              aria-pressed={mode === "staff"}
            >
              {t("staff")}
            </button>
          </div>
          <Alert code={bootstrapError || action.error} />
          {bootstrapError && (
            <Button variant="secondary" onClick={onRetry}>
              {t("retry")}
            </Button>
          )}
          {mode === "staff" ? (
            <DataForm
              fields={[
                { name: "username", required: true, autoComplete: "username" },
                {
                  name: "password",
                  type: "password",
                  required: true,
                  autoComplete: "current-password",
                },
              ]}
              submit="login"
              pending={action.pending}
              onSubmit={(v) =>
                void action.run(() => signIn("/auth/login/staff", v))
              }
            />
          ) : (
            <>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action.run(async () => {
                    const r = await api.post<{ development_code?: string }>(
                      "/auth/opd/otp/request",
                      { phone },
                    );
                    setDevelopmentCode(r.data.development_code || "");
                    setSent(true);
                  });
                }}
              >
                <Field
                  label="mobile"
                  type="tel"
                  required
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setSent(false);
                  }}
                  pattern="(?:\+91)?[6-9][0-9]{9}"
                  placeholder="+91"
                />
                <Button disabled={action.pending}>
                  {t("sendOtp")}
                  <ChevronRight size={17} />
                </Button>
              </form>
              {config.data &&
                !config.data.demo_otp &&
                !config.data.sms_available && (
                  <p className="muted">{t("smsUnavailable")}</p>
                )}
              {sent && (
                <div className="otp-panel">
                  <p>{t("otpHint")}</p>
                  {developmentCode && (
                    <div className="demo-code">
                      <small>{t("demoOtp")}</small>
                      <strong>{developmentCode}</strong>
                    </div>
                  )}
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={newPatient}
                      onChange={(e) => setNewPatient(e.target.checked)}
                    />
                    {t("newPatient")}
                  </label>
                  <DataForm
                    key={String(newPatient)}
                    fields={
                      newPatient
                        ? profileFields.filter((f) => f.name !== "phone")
                        : []
                    }
                    initial={{ preferred_language: "en", gender: "Female" }}
                    submit="verify"
                    pending={action.pending}
                    onSubmit={(v) => patientSignIn(v)}
                  >
                    <Field
                      label="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </DataForm>
                </div>
              )}
            </>
          )}
          <div className="login-security">
            <ShieldCheck size={16} />
            {t("secureAccess")}
          </div>
        </div>
      </section>
    </main>
  );
}
function WorkspaceApp() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const bootstrap = useRef<Promise<Session | null | undefined> | null>(null);
  const clinicalDirty = useRef(false);
  const setClinicalDirty = useCallback((dirty: boolean) => { clinicalDirty.current = dirty; }, []);
  const canLeave = () => {
    if (clinicalDirty.current && !window.confirm(t("discardChanges"))) return false;
    clinicalDirty.current = false;
    return true;
  };
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [record, setRecord] = useState<{
    patientId: string;
    tab?: string;
  } | null>(null);
  const [consultation, setConsultation] = useState<{
    patientId: string;
    encounterId: string;
  } | null>(null);
  const noticeAction = useAction();
  const notices = useQuery({
    queryKey: ["opd", "notifications", session?.id],
    queryFn: () => get<Notification[]>("/notifications"),
    enabled: !!session && !session.must_change_password,
    refetchInterval: 15000,
  });
  useEffect(() => {
    let active = true;
    if (!bootstrap.current) bootstrap.current = restoreSession();
    bootstrap.current
      .then((s) => {
        if (active) {
          if (s !== undefined) setSession(s);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorCode(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const endSession = () => {
      clearAccessToken();
      client.clear();
      bootstrap.current = null;
      setSession(null);
      setRecord(null);
      setConsultation(null);
      setNoticesOpen(false);
      setLoading(false);
      navigate("/login", { replace: true });
    };
    const changed = (event: StorageEvent) => {
      if (event.key === "cc-session-signed-out" && event.newValue !== null) endSession();
    };
    window.addEventListener(SESSION_ENDED_EVENT, endSession);
    window.addEventListener("storage", changed);
    return () => {
      window.removeEventListener(SESSION_ENDED_EVENT, endSession);
      window.removeEventListener("storage", changed);
    };
  }, [navigate]);
  useEffect(() => {
    if (loading) return;
    const routes = session ? navigation[session.role] : [];
    const currentPage = location.pathname.split("/")[2];
    if (!session && location.pathname !== "/login") navigate("/login", { replace: true });
    else if (session && (!location.pathname.startsWith("/app/") || !routes.includes(currentPage)))
      navigate("/app/" + routes[0], { replace: true });
  }, [loading, session, location.pathname, navigate]);
  const onLogin = async (token: string, requestedGeneration: number) => {
    if (requestedGeneration !== getSessionGeneration()) return;
    client.clear();
    acceptBrowserSession(token);
    const generation = getSessionGeneration();
    let s: Session;
    try {
      s = await get<Session>("/session");
    } catch (e) {
      if (generation !== getSessionGeneration() || isSessionRestoreBlocked()) return;
      clearAccessToken();
      throw e;
    }
    if (generation !== getSessionGeneration() || isSessionRestoreBlocked()) return;
    setSession(s);
    setError("");
    setRecord(null);
    setConsultation(null);
    navigate(`/app/${navigation[s.role][0]}`, { replace: true });
  };
  const reloadSession = async (generation: number) => {
    if (generation !== getSessionGeneration() || isSessionRestoreBlocked()) return;
    try {
      const refreshed = await get<Session>("/session");
      if (generation === getSessionGeneration() && !isSessionRestoreBlocked()) {
        setSession(refreshed);
        setError("");
      }
    } catch (e) {
      if (generation === getSessionGeneration() && !isSessionRestoreBlocked()) setError(errorCode(e));
    }
  };
  const logout = () => {
    if (!canLeave()) return;
    beginBrowserLogout();
    void finishBrowserLogout().catch(() => setError("LOGOUT_PENDING"));
    client.clear();
    bootstrap.current = null;
    setSession(null);
    setRecord(null);
    setConsultation(null);
    navigate("/login", { replace: true });
  };
  const to = (page: string) => {
    if (!canLeave()) return;
    setRecord(null);
    setConsultation(null);
    setMobileOpen(false);
    navigate(`/app/${page}`);
  };
  const page = location.pathname.split("/")[2] || "overview";
  const allowed = session ? navigation[session.role] : [];
  const actual = allowed.includes(page) ? page : allowed[0];
  if (loading)
    return (
      <div className="boot-screen">
        <Brand />
        <Loading />
      </div>
    );
  if (!session)
    return (
      <Login
        onLogin={onLogin}
        error={error}
        onRetry={() => {
          setLoading(true);
          bootstrap.current = restoreSession();
          bootstrap.current
            .then((s) => {
              if (s === undefined) return;
              setSession(s);
              setError("");
            })
            .catch((e) => setError(errorCode(e)))
            .finally(() => setLoading(false));
        }}
      />
    );
  const passwordGateGeneration = getSessionGeneration();
  if (session.must_change_password)
    return (
      <div className="password-gate">
        <Brand />
        <Panel title="passwordRequired">
          <p className="muted">{t("passwordHint")}</p>
          <Alert code={error} />
          <PasswordForm
            onDone={() => void reloadSession(passwordGateGeneration)}
          />
          <Button variant="ghost" onClick={logout}>
            {t("logout")}
          </Button>
        </Panel>
      </div>
    );
  const props: PageProps = {
    session,
    navigate: to,
    openRecord: (patientId, tab) => {
      setRecord({ patientId, tab });
      setConsultation(null);
    },
    openConsultation: (patientId, encounterId) => {
      setConsultation({ patientId, encounterId });
      setRecord(null);
    },
  };
  const current = consultation ? "consultation" : record ? "records" : actual;
  const unread = notices.data?.filter((n) => !n.read_at).length || 0;
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        {t("skip")}
      </a>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label={t("close")}
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <Brand />
        <div className="hospital-label">
          <span className="hospital-symbol">✚</span>
          <div>
            <b>{t("hospital")}</b>
            <small>{t("connected")}</small>
          </div>
        </div>
        <nav aria-label={t("navigation")}>
          {allowed.map((p) => {
            const Icon = icons[p];
            return (
              <button
                key={p}
                className={actual === p ? "nav-item active" : "nav-item"}
                aria-current={actual === p ? "page" : undefined}
                onClick={() => to(p)}
              >
                <Icon size={19} />
                <span>{t(p)}</span>
                {p === "queue" && (
                  <span className="nav-live" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="care-team-mark">
            <ShieldCheck size={20} />
            <div>
              <b>{t("tagline")}</b>
              <small>{t("secureAccess")}</small>
            </div>
          </div>
          <button className="sidebar-user" onClick={() => to("settings")}>
            <span className="avatar">
              {session.name
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")}
            </span>
            <span>
              <b>{session.name}</b>
              <small>{t(session.role)}</small>
            </span>
            <Settings size={17} />
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label={t("openMenu")}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span>{t(session.role)}</span>
            <ChevronRight size={14} />
            <b>{t(current)}</b>
          </div>
          <div className="topbar-actions">
            <LanguageSelect />
            <button
              className={`icon-button notification-button ${noticesOpen ? "selected" : ""}`}
              aria-label={`${t("notifications")}${unread ? ` (${unread})` : ""}`}
              aria-expanded={noticesOpen}
              onClick={() => setNoticesOpen(!noticesOpen)}
            >
              <Bell size={20} />
              {unread > 0 && <span>{unread > 9 ? "9+" : unread}</span>}
            </button>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              aria-label={t("logout")}
              onClick={logout}
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>
        {noticesOpen && (
          <section
            className="notifications-panel"
            aria-label={t("notifications")}
          >
            <div className="panel-heading">
              <h2>{t("notifications")}</h2>
              <button
                className="icon-button"
                aria-label={t("close")}
                onClick={() => setNoticesOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <Button
              variant="ghost"
              disabled={noticeAction.pending}
              onClick={() => void noticeAction.run(() => api.post("/opd/notifications/read"))}
            >
              {t("markRead")}
            </Button>
            <Alert code={noticeAction.error || (notices.error ? errorCode(notices.error) : "")} />
            {notices.data?.length ? (
              notices.data.map((n) => (
                <div
                  className={`notification ${n.read_at ? "" : "unread"}`}
                  key={n.id}
                >
                  <strong>{t(n.code)}</strong>
                  <p>{formatDate(n.created_at, "en", true)}</p>
                  {n.context.token && <b>{n.context.token}</b>}
                </div>
              ))
            ) : (
              <Empty title="noNotifications" />
            )}
          </section>
        )}
        <main id="main-content" className="main-content" tabIndex={-1}>
          {consultation ? (
            <Consultation
              {...consultation}
              session={session}
              onDirtyChange={setClinicalDirty}
              onClose={() => { if (canLeave()) setConsultation(null); }}
            />
          ) : record ? (
            <PatientRecord
              patientId={record.patientId}
              initialTab={record.tab}
              onBack={() => setRecord(null)}
              session={session}
            />
          ) : actual === "overview" ? (
            <Overview {...props} />
          ) : actual === "appointments" ? (
            <AppointmentsPage {...props} />
          ) : actual === "carePlan" ? (
            <CarePlanPage patientId={session.patient_id!} />
          ) : actual === "queue" ? (
            <QueuePage {...props} />
          ) : actual === "patients" ? (
            <PatientsPage {...props} />
          ) : actual === "schedules" ? (
            <SchedulesPage session={session} />
          ) : actual === "laboratory" ? (
            <LaboratoryPage {...props} />
          ) : actual === "records" ? (
            <PatientRecord patientId={session.patient_id!} session={session} />
          ) : actual === "administration" ? (
            <Administration />
          ) : actual === "audit" ? (
            <AuditPage />
          ) : (
            <SettingsPage session={session} onLogout={logout} />
          )}
        </main>
        <footer className="app-footer">
          <span>
            {t("brand")} <span>·</span> {t("connected")}
          </span>
          <span>
            <ShieldCheck size={13} />
            {t("secureAccess")}
          </span>
        </footer>
      </div>
    </div>
  );
}
export default function App() {
  return (
    <QueryClientProvider client={client}>
      <I18nProvider>
        <WorkspaceApp />
      </I18nProvider>
    </QueryClientProvider>
  );
}
