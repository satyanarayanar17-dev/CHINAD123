import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarPlus,
  Search,
  UserPlus,
  ArrowUpRight,
  Users,
  Clock3,
  CheckCircle2,
  Stethoscope,
  Activity,
  ClipboardCheck,
} from "lucide-react";
import { useI18n, today, formatDate, formatTime } from "./i18n";
import {
  get,
  post,
  useAction,
  Panel,
  PageHeader,
  Loading,
  Empty,
  Button,
  Field,
  Select,
  Status,
  Modal,
  Alert,
  Confirm,
  DataForm,
} from "./ui";
import { Booking, PatientForm } from "./booking";
import { Journey, ResultCard } from "./records";
import { Triage } from "./workspace";
import type {
  Session,
  Appointment,
  Patient,
  QueueEntry,
  Dashboard,
  JourneyEvent,
  LabOrder,
} from "./types";
export interface PageProps {
  session: Session;
  navigate: (page: string) => void;
  openRecord: (patientId: string, tab?: string) => void;
  openConsultation: (patientId: string, encounterId: string) => void;
}
export function Overview(props: PageProps) {
  const { session, navigate } = props;
  const { t } = useI18n();
  const dashboard = useQuery({
    queryKey: ["opd", "dashboard"],
    queryFn: () => get<Dashboard>("/dashboard"),
    enabled: session.role === "ADMIN" || session.role === "DOCTOR",
    refetchInterval: 10000,
  });
  const appointments = useQuery({
    queryKey: ["opd", "appointments"],
    queryFn: () => get<Appointment[]>("/appointments"),
    enabled: session.role === "PATIENT",
    refetchInterval: 15000,
  });
  const queue = useQuery({
    queryKey: ["opd", "queue"],
    queryFn: () => get<QueueEntry[]>("/queue"),
    refetchInterval: 5000,
  });
  const journey = useQuery({
    queryKey: ["opd", "journey", session.patient_id],
    queryFn: () =>
      get<JourneyEvent[]>(`/patients/${session.patient_id}/journey`),
    enabled: session.role === "PATIENT" && !!session.patient_id,
    refetchInterval: 10000,
  });
  const [booking, setBooking] = useState(false);
  const isPatient = session.role === "PATIENT";
  const upcoming = appointments.data
    ?.filter(
      (a) =>
        a.status === "CONFIRMED" && a.scheduled_at > new Date().toISOString(),
    )
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
  const d = dashboard.data;
  return (
    <div className="page-stack">
      <PageHeader
        title={isPatient ? "patientOverview" : "goodDay"}
        subtitle={isPatient ? "patientOverviewSub" : "overviewSub"}
        action={
          isPatient ? (
            <Button onClick={() => setBooking(true)}>
              <CalendarPlus size={18} />
              {t("book")}
            </Button>
          ) : (
            <span className="date-pill">
              {formatDate(new Date().toISOString())}
            </span>
          )
        }
      />
      {dashboard.isError && <Alert code="NETWORK_ERROR" />}
      {isPatient ? (
        <>
          <div className="patient-welcome">
            <div>
              <span className="eyebrow">
                {t("welcome")}, {session.name.split(" ")[0]}
              </span>
              <h2>{t("tagline")}</h2>
              <p>{t("intro")}</p>
            </div>
            <div className="care-illustration" aria-hidden="true">
              <span>
                <Activity size={42} />
              </span>
              <span>
                <CheckCircle2 size={26} />
              </span>
              <span>
                <Stethoscope size={28} />
              </span>
              <div />
            </div>
          </div>
          <div className="two-column">
            <Panel
              title="nextAppointment"
              action={
                <Button
                  variant="ghost"
                  onClick={() => navigate("appointments")}
                >
                  {t("view")} <ArrowUpRight size={16} />
                </Button>
              }
            >
              {upcoming ? (
                <div className="upcoming-card">
                  <div className="appointment-date">
                    <strong>{new Date(upcoming.scheduled_at).getDate()}</strong>
                    <span>
                      {new Date(upcoming.scheduled_at).toLocaleString("en-IN", {
                        month: "short",
                      })}
                    </span>
                  </div>
                  <div>
                    <h3>{upcoming.doctor_name}</h3>
                    <p>{upcoming.department_name}</p>
                    <div className="meta-line">
                      <Clock3 size={15} />
                      {formatTime(upcoming.scheduled_at)} · {t("room")}{" "}
                      {upcoming.room}
                    </div>
                  </div>
                </div>
              ) : (
                <Empty title="noData" />
              )}
            </Panel>
            <Panel title="queue">
              {queue.data?.length ? (
                <TokenCard entry={queue.data[0]} />
              ) : (
                <Empty title="noQueue" hint="noQueueHint" />
              )}
            </Panel>
          </div>
          <Panel title="journey">
            <Journey events={(journey.data || []).slice(0, 8)} />
          </Panel>
        </>
      ) : (
        <>
          {dashboard.isLoading ? (
            <Loading />
          ) : (
            d && (
              <>
                <div className="metrics">
                  {[
                    ["appointmentCount", d.appointments, Users],
                    ["waiting", d.waiting, Clock3],
                    ["inConsultation", d.consultation, Stethoscope],
                    ["completed", d.completed, CheckCircle2],
                  ].map(([key, value, Icon], i) => {
                    const I = Icon as typeof Users;
                    return (
                      <div className={`metric metric-${i}`} key={String(key)}>
                        <span className="metric-icon">
                          <I size={21} />
                        </span>
                        <div>
                          <span>{t(String(key))}</span>
                          <strong>
                            {Number(value).toLocaleString("en-IN")}
                          </strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="operational-strip">
                  {[
                    ["checkedIn", d.checked_in],
                    ["inTriage", d.triage],
                    ["noShows", d.no_shows],
                    [
                      "averageWait",
                      d.average_wait == null
                        ? "—"
                        : `${d.average_wait} ${t("minutes")}`,
                    ],
                    ["resultsPending", d.results_pending],
                  ].map(([key, value]) => (
                    <div key={String(key)}>
                      <span>{t(String(key))}</span>
                      <b>{value}</b>
                    </div>
                  ))}
                </div>
                <div className="two-column">
                  <Panel title="departmentFlow">
                    <div className="table-scroll" tabIndex={0}>
                      <table>
                        <thead>
                          <tr>
                            <th>{t("department")}</th>
                            <th>{t("patientCount")}</th>
                            <th>{t("waiting")}</th>
                            <th>{t("longestWait")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.departments.map((dep) => (
                            <tr key={dep.name}>
                              <td>
                                <b>{dep.name}</b>
                              </td>
                              <td>{dep.patients}</td>
                              <td>{dep.waiting}</td>
                              <td>
                                {dep.longest_wait == null
                                  ? "—"
                                  : `${dep.longest_wait} ${t("minutes")}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                  <Panel title="doctorWorkload">
                    <div className="workload-list">
                      {d.doctors.map((doc) => (
                        <div key={doc.name}>
                          <span className="avatar">
                            {doc.name
                              .split(" ")
                              .slice(-2)
                              .map((n) => n[0])
                              .join("")}
                          </span>
                          <div>
                            <b>{doc.name}</b>
                            <small>
                              {doc.appointments} {t("appointments")} ·{" "}
                              {doc.completed} {t("completed")}
                            </small>
                          </div>
                          <span className="workload-number">
                            {doc.waiting}
                            <small>{t("waiting")}</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
              </>
            )
          )}
          <Panel
            title="queue"
            action={
              <Button variant="ghost" onClick={() => navigate("queue")}>
                {t("view")} <ArrowUpRight size={16} />
              </Button>
            }
          >
            <QueueTable entries={(queue.data || []).slice(0, 6)} {...props} />
          </Panel>
        </>
      )}
      {booking && (
        <Booking
          onClose={() => setBooking(false)}
          onDone={() => setBooking(false)}
        />
      )}
    </div>
  );
}
export function TokenCard({ entry }: { entry: QueueEntry }) {
  const { t } = useI18n();
  return (
    <div className="token-card">
      <div>
        <span className="eyebrow">{t("token")}</span>
        <strong>{entry.token}</strong>
        <Status value={entry.status} />
      </div>
      <div className="token-numbers">
        <div>
          <b>{entry.patients_ahead}</b>
          <span>{t("patientsAhead")}</span>
        </div>
        <div>
          <b>
            {entry.estimated_wait}
            <small> {t("minutes")}</small>
          </b>
          <span>{t("estimatedWait")}</span>
        </div>
      </div>
      <p>
        {entry.doctor_name} · {t("room")} {entry.room}
      </p>
      <small>{t("estimateHint")}</small>
    </div>
  );
}
export function AppointmentsPage(props: PageProps) {
  const { session, openRecord, openConsultation, navigate } = props;
  const { t, language } = useI18n();
  const [filter, setFilter] = useState(
    session.role === "PATIENT" ? "" : today(),
  );
  const [clockTime] = useState(() => Date.now());
  const [booking, setBooking] = useState(false);
  const [reschedule, setReschedule] = useState<Appointment | null>(null);
  const [cancel, setCancel] = useState<Appointment | null>(null);
  const [checkIn, setCheckIn] = useState<Appointment | null>(null);
  const [verified, setVerified] = useState(false);
  const action = useAction();
  const q = useQuery({
    queryKey: ["opd", "appointments", filter],
    queryFn: () =>
      get<Appointment[]>(`/appointments${filter ? `?date=${filter}` : ""}`),
    refetchInterval: 10000,
  });
  return (
    <div className="page-stack">
      <PageHeader
        title="appointments"
        subtitle="overviewSub"
        action={
          ["ADMIN", "PATIENT"].includes(session.role) ? (
            <Button
              onClick={() =>
                session.role === "PATIENT"
                  ? setBooking(true)
                  : navigate("patients")
              }
            >
              <CalendarPlus size={18} />
              {t("book")}
            </Button>
          ) : undefined
        }
      />
      <Panel>
        <div className="table-toolbar">
          <Field
            label="date"
            type="date"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <Button variant="ghost" onClick={() => setFilter("")}>
            {t("allVisits")}
          </Button>
          <Button variant="secondary" onClick={() => setFilter(today())}>
            {t("today")}
          </Button>
        </div>
        <Alert code={action.error} />
        {q.isLoading ? (
          <Loading />
        ) : q.isError ? (
          <Alert code="NETWORK_ERROR" />
        ) : q.data?.length ? (
          <div className="table-scroll" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>{t("date")}</th>
                  {session.role !== "PATIENT" && <th>{t("patient")}</th>}
                  <th>{t("doctor")}</th>
                  <th>{t("status")}</th>
                  <th>{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <b>{formatDate(a.scheduled_at, language)}</b>
                      <small>{formatTime(a.scheduled_at)}</small>
                    </td>
                    {session.role !== "PATIENT" && (
                      <td>
                        <b>{a.patient_name}</b>
                        <small>{a.mrn}</small>
                      </td>
                    )}
                    <td>
                      <b>{a.doctor_name}</b>
                      <small>
                        {a.department_name} · {t("room")} {a.room}
                      </small>
                    </td>
                    <td>
                      <Status value={a.queue_status || a.status} />
                      {a.follow_up_of && <small>{t("followUp")}</small>}
                    </td>
                    <td>
                      <div className="row-actions">
                        {a.status === "CONFIRMED" &&
                          ["ADMIN", "PATIENT"].includes(session.role) && (
                            <>
                              <Button
                                variant="ghost"
                                onClick={() => setReschedule(a)}
                              >
                                {t("reschedule")}
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => setCancel(a)}
                              >
                                {t("cancel")}
                              </Button>
                              {session.role === "ADMIN" &&
                                a.scheduled_at.slice(0, 10) <= today() && (
                                  <Button
                                    onClick={() => {
                                      setVerified(false);
                                      setCheckIn(a);
                                    }}
                                  >
                                    {t("checkIn")}
                                  </Button>
                                )}
                              {session.role === "ADMIN" &&
                                new Date(a.ends_at).getTime() < clockTime && (
                                  <Button
                                    variant="ghost"
                                    disabled={action.pending}
                                    onClick={() =>
                                      void action.run(() =>
                                        post(`/appointments/${a.id}/no-show`, {
                                          __v: a.__v,
                                        }),
                                      )
                                    }
                                  >
                                    {t("NO_SHOW")}
                                  </Button>
                                )}
                            </>
                          )}
                        {a.encounter_id && session.role === "DOCTOR" && (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              a.status === "COMPLETED"
                                ? openConsultation(
                                    a.patient_id,
                                    a.encounter_id!,
                                  )
                                : openRecord(a.patient_id)
                            }
                          >
                            {t(
                              a.status === "COMPLETED" ? "amend" : "openRecord",
                            )}
                          </Button>
                        )}
                        {session.role === "PATIENT" && a.encounter_id && (
                          <Button
                            variant="secondary"
                            onClick={() => openRecord(a.patient_id)}
                          >
                            {t("viewJourney")}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </Panel>
      {booking && (
        <Booking
          onClose={() => setBooking(false)}
          onDone={() => setBooking(false)}
        />
      )}
      {reschedule && (
        <Booking
          appointment={reschedule}
          onClose={() => setReschedule(null)}
          onDone={() => setReschedule(null)}
        />
      )}
      {cancel && (
        <Confirm
          title="cancelAppointment"
          text="cancelReason"
          onClose={() => setCancel(null)}
          pending={action.pending}
          error={action.error}
          onConfirm={() =>
            void action.run(
              () =>
                post(`/appointments/${cancel.id}/cancel`, { __v: cancel.__v }),
              () => setCancel(null),
            )
          }
        />
      )}
      {checkIn && (
        <Modal title="checkInTitle" onClose={() => setCheckIn(null)}>
          <div className="patient-strip">
            <b>{checkIn.patient_name}</b>
            <span>
              {checkIn.mrn} · {checkIn.dob}
            </span>
          </div>
          <p>
            {checkIn.doctor_name} · {formatTime(checkIn.scheduled_at)}
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            {t("verifyIdentity")}
          </label>
          <Alert code={action.error} />
          <div className="form-actions">
            <Button
              disabled={!verified || action.pending}
              onClick={() =>
                void action.run(
                  () =>
                    post(`/appointments/${checkIn.id}/check-in`, {
                      identity_verified: true,
                    }),
                  () => setCheckIn(null),
                )
              }
            >
              {t("checkIn")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
export function PatientsPage(props: PageProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<Patient | null>(null);
  const [book, setBook] = useState<Patient | null>(null);
  const [journeyId, setJourneyId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["opd", "patients", search],
    queryFn: () =>
      get<Patient[]>(`/patients?search=${encodeURIComponent(search)}`),
  });
  const j = useQuery({
    queryKey: ["opd", "journey", journeyId],
    queryFn: () => get<JourneyEvent[]>(`/patients/${journeyId}/journey`),
    enabled: !!journeyId,
  });
  return (
    <div className="page-stack">
      <PageHeader
        title="patients"
        subtitle="registerHint"
        action={
          <Button onClick={() => setCreate(true)}>
            <UserPlus size={18} />
            {t("newRegistration")}
          </Button>
        }
      />
      <Panel>
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={18} />
            <input
              aria-label={t("searchPatients")}
              placeholder={t("searchPatients")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {q.isLoading ? (
          <Loading />
        ) : q.isError ? (
          <Alert code="NETWORK_ERROR" />
        ) : q.data?.length ? (
          <div className="table-scroll" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>{t("patient")}</th>
                  <th>{t("mobile")}</th>
                  <th>{t("dob")}</th>
                  <th>{t("city")}</th>
                  <th>{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="person-cell">
                        <span className="avatar">
                          {p.name
                            .split(" ")
                            .slice(0, 2)
                            .map((n) => n[0])
                            .join("")}
                        </span>
                        <span>
                          <b>{p.name}</b>
                          <small>{p.mrn}</small>
                        </span>
                      </div>
                    </td>
                    <td>{p.phone}</td>
                    <td>{p.dob}</td>
                    <td>{p.city || "—"}</td>
                    <td>
                      <div className="row-actions">
                        <Button variant="secondary" onClick={() => setBook(p)}>
                          {t("book")}
                        </Button>
                        <Button variant="ghost" onClick={() => setEdit(p)}>
                          {t("edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setJourneyId(p.id)}
                        >
                          {t("journey")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </Panel>
      {(create || edit) && (
        <PatientForm
          patient={edit || undefined}
          onClose={() => {
            setCreate(false);
            setEdit(null);
          }}
          onDone={() => {
            setCreate(false);
            setEdit(null);
          }}
        />
      )}
      {book && (
        <Booking
          patient={book}
          onClose={() => setBook(null)}
          onDone={() => setBook(null)}
        />
      )}
      {journeyId && (
        <Modal title="journey" onClose={() => setJourneyId(null)}>
          {j.isLoading ? <Loading /> : <Journey events={j.data || []} />}
        </Modal>
      )}
    </div>
  );
}
export function QueueTable({
  entries,
  session,
  openRecord,
  openConsultation,
}: PageProps & { entries: QueueEntry[] }) {
  const { t } = useI18n();
  const action = useAction();
  const [triage, setTriage] = useState<QueueEntry | null>(null);
  const [patientJourney, setPatientJourney] = useState<string | null>(null);
  const journey = useQuery({
    queryKey: ["opd", "journey", patientJourney],
    queryFn: () => get<JourneyEvent[]>(`/patients/${patientJourney}/journey`),
    enabled: !!patientJourney,
  });
  const startTriage = (entry: QueueEntry) =>
    void action.run(async () => {
      await post(`/encounters/${entry.encounter_id}/start-triage`, {
        __v: entry.__v,
      });
      return (await get<QueueEntry[]>("/queue")).find(
        (q) => q.encounter_id === entry.encounter_id,
      )!;
    }, setTriage);
  return (
    <>
      <Alert code={action.error} />
      {entries.length ? (
        <div className="table-scroll" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>{t("token")}</th>
                <th>{t("patient")}</th>
                <th>{t("doctor")}</th>
                <th>{t("waitTime")}</th>
                <th>{t("status")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.encounter_id}>
                  <td>
                    <span className="token-label">{e.token}</span>
                    {e.priority > 0 && (
                      <small className="priority">
                        {t(e.priority === 2 ? "highPriority" : "urgent")}
                      </small>
                    )}
                  </td>
                  <td>
                    <b>{e.patient_name}</b>
                    <small>
                      {e.mrn} · {t(e.gender)}
                    </small>
                  </td>
                  <td>
                    <b>{e.doctor_name}</b>
                    <small>
                      {e.department_name} · {t("room")} {e.room}
                    </small>
                  </td>
                  <td>
                    <span className="wait-number">{e.wait_minutes}</span>{" "}
                    {t("minutes")}
                  </td>
                  <td>
                    <Status value={e.status} />
                  </td>
                  <td>
                    <div className="row-actions">
                      {session.role === "NURSE" &&
                        (e.status === "WAITING" ? (
                          <Button
                            disabled={action.pending}
                            onClick={() => startTriage(e)}
                          >
                            {t("startTriage")}
                          </Button>
                        ) : ["TRIAGE", "WAITING_DOCTOR"].includes(e.status) ? (
                          <Button
                            variant="secondary"
                            onClick={() => setTriage(e)}
                          >
                            {t(
                              e.status === "TRIAGE"
                                ? "triageTitle"
                                : "amendTriage",
                            )}
                          </Button>
                        ) : null)}
                      {session.role === "DOCTOR" &&
                        [
                          "WAITING_DOCTOR",
                          "DOCTOR_READY",
                          "CONSULTATION",
                        ].includes(e.status) && (
                          <>
                            {e.status === "WAITING_DOCTOR" && (
                              <Button
                                variant="ghost"
                                disabled={action.pending}
                                onClick={() =>
                                  void action.run(() =>
                                    post(`/encounters/${e.encounter_id}/call`, {
                                      __v: e.__v,
                                    }),
                                  )
                                }
                              >
                                {t("callPatient")}
                              </Button>
                            )}
                            <Button
                              disabled={action.pending}
                              onClick={() =>
                                e.status === "CONSULTATION"
                                  ? openConsultation(
                                      e.patient_id,
                                      e.encounter_id,
                                    )
                                  : void action.run(
                                      () =>
                                        post(
                                          `/encounters/${e.encounter_id}/start`,
                                          { __v: e.__v },
                                        ),
                                      () =>
                                        openConsultation(
                                          e.patient_id,
                                          e.encounter_id,
                                        ),
                                    )
                              }
                            >
                              {t(
                                e.status === "CONSULTATION"
                                  ? "openConsultation"
                                  : "startConsultation",
                              )}
                            </Button>
                          </>
                        )}
                      {session.role === "ADMIN" ? (
                        <Button
                          variant="ghost"
                          onClick={() => setPatientJourney(e.patient_id)}
                        >
                          {t("journey")}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          onClick={() => openRecord(e.patient_id)}
                        >
                          {t("openRecord")}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="noQueue" hint="noQueueHint" />
      )}
      {triage && <Triage entry={triage} onClose={() => setTriage(null)} />}
      {patientJourney && (
        <Modal title="journey" onClose={() => setPatientJourney(null)}>
          <Journey events={journey.data || []} />
        </Modal>
      )}
    </>
  );
}
export function QueuePage(props: PageProps) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const q = useQuery({
    queryKey: ["opd", "queue"],
    queryFn: () => get<QueueEntry[]>("/queue"),
    refetchInterval: 5000,
  });
  const entries = (q.data || []).filter((e) => !filter || e.status === filter);
  return (
    <div className="page-stack">
      <PageHeader
        title="queue"
        subtitle="overviewSub"
        action={
          <span className="live-pill">
            <span />
            {t("live")}
          </span>
        }
      />
      <Panel>
        <div className="table-toolbar">
          <Select
            label="status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">{t("all")}</option>
            {[
              "WAITING",
              "TRIAGE",
              "WAITING_DOCTOR",
              "DOCTOR_READY",
              "CONSULTATION",
            ].map((s) => (
              <option value={s} key={s}>
                {t(s)}
              </option>
            ))}
          </Select>
          <span className="muted">
            {entries.length} {t("patients")}
          </span>
        </div>
        {q.isLoading ? (
          <Loading />
        ) : q.isError ? (
          <Alert code="NETWORK_ERROR" />
        ) : props.session.role === "PATIENT" ? (
          entries.map((e) => <TokenCard entry={e} key={e.encounter_id} />)
        ) : (
          <QueueTable entries={entries} {...props} />
        )}
      </Panel>
    </div>
  );
}
export function LaboratoryPage({ session }: PageProps) {
  const { t } = useI18n();
  const [edit, setEdit] = useState<LabOrder | null>(null);
  const [filter, setFilter] = useState("");
  const action = useAction();
  const q = useQuery({
    queryKey: ["opd", "labs"],
    queryFn: () => get<LabOrder[]>("/labs"),
    refetchInterval: 10000,
  });
  return (
    <div className="page-stack">
      <PageHeader title="laboratory" subtitle="labOrders" />
      <Alert code={action.error} />
      <Select
        label="status"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      >
        <option value="">{t("all")}</option>
        {["ORDERED", "COLLECTED", "PROCESSING", "AVAILABLE", "REVIEWED"].map(
          (v) => (
            <option key={v} value={v}>
              {t(v)}
            </option>
          ),
        )}
      </Select>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <Alert code="NETWORK_ERROR" />
      ) : q.data?.length ? (
        <div className="card-grid">
          {q.data
            .filter((l) => !filter || filter === l.status)
            .map((l) => (
              <div key={l.id}>
                {session.role !== "PATIENT" && (
                  <p className="lab-patient">{l.patient_name}</p>
                )}
                <ResultCard
                  order={l}
                  action={
                    session.role === "ADMIN" ? (
                      <>
                        {l.status === "ORDERED" && (
                          <Button
                            disabled={action.pending}
                            onClick={() =>
                              void action.run(() =>
                                post(`/labs/${l.id}/collect`, { __v: l.__v }),
                              )
                            }
                          >
                            {t("collect")}
                          </Button>
                        )}
                        {l.status === "COLLECTED" && (
                          <Button
                            disabled={action.pending}
                            onClick={() =>
                              void action.run(() =>
                                post(`/labs/${l.id}/process`, { __v: l.__v }),
                              )
                            }
                          >
                            {t("process")}
                          </Button>
                        )}
                        {["PROCESSING", "AVAILABLE", "REVIEWED"].includes(
                          l.status,
                        ) && (
                          <Button
                            variant="secondary"
                            onClick={() => setEdit(l)}
                          >
                            {t(
                              l.status === "PROCESSING"
                                ? "enterResult"
                                : "amendResult",
                            )}
                          </Button>
                        )}
                      </>
                    ) : session.role === "DOCTOR" &&
                      l.status === "AVAILABLE" ? (
                      <Button
                        disabled={action.pending}
                        onClick={() =>
                          void action.run(() =>
                            post(`/labs/${l.id}/review`, { __v: l.__v }),
                          )
                        }
                      >
                        {t("reviewResult")}
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ))}
        </div>
      ) : (
        <Panel>
          <Empty />
        </Panel>
      )}
      {edit && <ResultForm order={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
function ResultForm({
  order,
  onClose,
}: {
  order: LabOrder;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const action = useAction();
  const [verified, setVerified] = useState(false);
  const [released, setReleased] = useState(order.result?.released === 1);
  return (
    <Modal title="enterResult" onClose={onClose}>
      <h3>{order.name}</h3>
      <p className="muted">{order.patient_name}</p>
      <DataForm
        initial={{
          value: order.result?.value || "",
          unit: order.result?.unit || order.unit,
          reference_range:
            order.result?.reference_range || order.reference_range,
          flag: order.result?.flag || "NORMAL",
        }}
        fields={[
          { name: "value", label: "resultValue", required: true },
          { name: "unit", label: "unit" },
          { name: "reference_range", label: "referenceRange", required: true },
          {
            name: "flag",
            required: true,
            options: ["NORMAL", "HIGH", "LOW", "CRITICAL"].map((v) => ({
              value: v,
              label: v,
            })),
          },
          {
            name: "reason",
            label: "resultReason",
            type: "textarea",
            required: true,
          },
        ]}
        submit="saveResult"
        pending={action.pending || !verified}
        error={action.error}
        onSubmit={(v) =>
          void action.run(
            () =>
              post(`/labs/${order.id}/result`, {
                __v: order.__v,
                data: { ...v, verified, released },
              }),
            onClose,
          )
        }
      >
        <label className="check-label">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
          />
          {t("verified")}
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={released}
            onChange={(e) => setReleased(e.target.checked)}
          />
          {t("release")}
        </label>
      </DataForm>
    </Modal>
  );
}
