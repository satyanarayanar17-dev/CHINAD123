import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Activity,
  ClipboardList,
  FileText,
  FlaskConical,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { get, Panel, Loading, Empty, Alert, Status, Button, Modal } from "./ui";
import { useI18n, formatDate } from "./i18n";
import type {
  RecordBundle,
  JourneyEvent,
  Patient,
  Prescription,
  LabOrder,
  Session,
} from "./types";
export function PatientHeader({ patient }: { patient: Patient }) {
  const { t } = useI18n();
  const birth = new Date(patient.dob);
  const current = new Date();
  let age = current.getFullYear() - birth.getFullYear();
  if (
    current.getMonth() < birth.getMonth() ||
    (current.getMonth() === birth.getMonth() &&
      current.getDate() < birth.getDate())
  )
    age--;
  return (
    <div className="patient-header">
      <div className="avatar large">
        {patient.name
          .split(" ")
          .slice(0, 2)
          .map((n) => n[0])
          .join("")}
      </div>
      <div>
        <h2>{patient.name}</h2>
        <p>
          {Math.max(0, age)} {t("years")} · {t(patient.gender)}{" "}
          <span className="dot-separator">·</span> {t("mrn")} {patient.mrn}
        </p>
      </div>
      <span className={`allergy ${patient.allergies ? "has-allergy" : ""}`}>
        <ShieldCheck size={15} />
        {patient.allergies
          ? `${t("allergies")}: ${patient.allergies}`
          : t("noAllergies")}
      </span>
    </div>
  );
}
export function Journey({ events }: { events: JourneyEvent[] }) {
  const { t, language } = useI18n();
  return events.length ? (
    <ol className="timeline">
      {events.map((e, i) => (
        <li key={e.id}>
          <span
            className={`timeline-dot ${i === 0 ? "current" : ""}`}
            aria-hidden="true"
          />
          <div className="timeline-content">
            <strong>
              {t(e.code === "CHECKED_IN" ? "CHECKED_IN_EVENT" : e.code)}
            </strong>
            <time dateTime={e.occurred_at}>
              {formatDate(e.occurred_at, language, true)}
            </time>
            <p>
              {e.actor_name}
              {e.context.token && (
                <>
                  {" "}
                  · <b>{e.context.token}</b>
                </>
              )}
              {e.context.test && <> · {e.context.test}</>}
            </p>
            {e.context.reason && <p>{e.context.reason}</p>}
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <Empty />
  );
}
export function Vitals({
  record,
  encounterId,
}: {
  record: RecordBundle;
  encounterId?: string;
}) {
  const { t, language } = useI18n();
  const triage = record.triage.find(
    (r) => !encounterId || r.encounter_id === encounterId,
  );
  if (!triage) return <p className="muted inset">{t("noVitals")}</p>;
  const d = triage.data;
  return (
    <div>
      <div className="vitals-grid">
        {[
          ["systolic", `${d.systolic}/${d.diastolic}`, "mmHg"],
          ["pulse", d.pulse, "bpm"],
          ["temperature", d.temperature, "°C"],
          ["spo2", d.spo2, "%"],
          ["weight", d.weight, "kg"],
          ["height", d.height, "cm"],
          ["bmi", d.bmi, ""],
          ["pain", d.pain, "/10"],
        ].map(([key, value, unit]) => (
          <div key={key} className="vital">
            <small>{t(String(key))}</small>
            <strong>
              {value}
              <span>{unit}</span>
            </strong>
          </div>
        ))}
      </div>
      <p className="attribution">
        {triage.nurse_name} · {formatDate(triage.created_at, language, true)} ·{" "}
        {t("version")} {triage.version}
      </p>
    </div>
  );
}
function snapshotObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function snapshotText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
function ClinicalSnapshot({ data }: { data: unknown }) {
  const { t, language } = useI18n();
  const content = snapshotObject(data);
  const diagnoses = Array.isArray(content.diagnoses)
    ? content.diagnoses.map((d) => snapshotText(snapshotObject(d).name)).filter(Boolean)
    : [];
  const medications = Array.isArray(content.medications)
    ? content.medications.map(snapshotObject)
    : [];
  const followUp = snapshotObject(content.follow_up);
  const followDate = snapshotText(followUp.scheduled_at);
  const fields = ["complaint", "history", "previous_history", "examination", "assessment", "treatment", "advice"];
  return (
    <div className="page-stack">
      <div className="note-summary">
        {fields.filter((field) => field in content).map((field) => (
          <div key={field}>
            <h4>{t(field)}</h4>
            <p className="preserve-lines">{snapshotText(content[field]) || t("notRecorded")}</p>
          </div>
        ))}
        <div>
          <h4>{t("diagnoses")}</h4>
          <p>{diagnoses.join(", ") || t("notRecorded")}</p>
        </div>
      </div>
      <div>
        <h4>{t("medications")}</h4>
        {medications.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr>{["medications", "dose", "frequency", "duration", "instructions"].map((key) => <th key={key} scope="col">{t(key)}</th>)}</tr></thead>
              <tbody>
                {medications.map((medication, index) => (
                  <tr key={index}>
                    <td>
                      <b>{snapshotText(medication.name) || t("notRecorded")}</b>
                      <small>{[medication.strength, medication.form, medication.route].map(snapshotText).filter(Boolean).join(" · ")}</small>
                    </td>
                    {["dose", "frequency", "duration", "instructions"].map((key) => <td key={key}>{snapshotText(medication[key]) || t("notRecorded")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">{t("notRecorded")}</p>}
      </div>
      {followDate && Number.isFinite(Date.parse(followDate)) && (
        <div>
          <h4>{t("followUp")}</h4>
          <p><time dateTime={followDate}>{formatDate(followDate, language, true)}</time></p>
          {typeof followUp.reason === "string" && <p className="preserve-lines">{followUp.reason}</p>}
        </div>
      )}
    </div>
  );
}
export function PrescriptionView({
  prescription,
  patient,
  onClose,
}: {
  prescription: Prescription;
  patient: Patient;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const rx = prescription.rx_content;
  return (
    <Modal title="prescription" onClose={onClose} wide>
      <div className="prescription-document print-document">
        <div className="prescription-masthead">
          <span className="rx-brand">✚</span>
          <div>
            <h2>{t("brand")}</h2>
            <p>{t("hospital")}</p>
          </div>
          <span>{t("prescription")}</span>
        </div>
        <PatientHeader patient={patient} />
        <div className="detail-grid">
          <p>
            <small>{t("issuedBy")}</small>
            {prescription.doctor_name}
          </p>
          <p>
            <small>{t("issuedAt")}</small>
            {formatDate(
              rx.validation?.issued_at || prescription.created_at,
              language,
              true,
            )}
          </p>
        </div>
        <h3>{t("diagnoses")}</h3>
        <p>{rx.diagnoses?.map((d) => d.name).join(", ") || t("notRecorded")}</p>
        <h3>{t("medications")}</h3>
        {rx.medications?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("medications")}</th>
                  <th>{t("dose")}</th>
                  <th>{t("frequency")}</th>
                  <th>{t("duration")}</th>
                  <th>{t("instructions")}</th>
                </tr>
              </thead>
              <tbody>
                {rx.medications.map((m, i) => (
                  <tr key={i}>
                    <td>
                      <b>{m.name}</b>
                      <small>
                        {m.strength} · {m.form} · {m.route}
                      </small>
                    </td>
                    <td>{m.dose}</td>
                    <td>{m.frequency}</td>
                    <td>{m.duration}</td>
                    <td>{m.instructions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>{t("notRecorded")}</p>
        )}
        <h3>{t("advice")}</h3>
        <p className="preserve-lines">{rx.advice}</p>
        {rx.follow_up !== null &&
          typeof rx.follow_up === "object" &&
          "scheduled_at" in rx.follow_up && (
            <>
              <h3>{t("followUp")}</h3>
              <p>
                {formatDate(String(rx.follow_up.scheduled_at), language, true)}
              </p>
            </>
          )}
        <div className="validation">
          <ShieldCheck size={20} />
          <div>
            <strong>{t("validation")}</strong>
            <code>{rx.validation?.sha256 || prescription.id}</code>
            <p>
              {t("version")} {prescription.__v} ·{" "}
              {prescription.authorizing_user_id}
            </p>
          </div>
        </div>
      </div>
      <div className="form-actions no-print">
        <Button onClick={() => window.print()}>
          <Printer size={17} />
          {t("print")}
        </Button>
      </div>
    </Modal>
  );
}
export function ResultCard({
  order,
  action,
}: {
  order: LabOrder;
  action?: React.ReactNode;
}) {
  const { t, language } = useI18n();
  const r = order.result;
  return (
    <div className="result-card">
      <div className="result-heading">
        <div>
          <h3>{order.name}</h3>
          <small>
            {order.code} · {formatDate(order.ordered_at, language)}
          </small>
        </div>
        <Status value={order.status} />
      </div>
      {r ? (
        <>
          <div className="result-value">
            <strong>
              {r.value}
              <span>{r.unit}</span>
            </strong>
            <Status value={r.flag} />
          </div>
          <p className="muted">
            {t("referenceRange")}: {r.reference_range}
          </p>
          <div className="result-meta">
            <span>
              {t("verifiedBy")}: {r.verified_name}
            </span>
            <span>{formatDate(r.resulted_at, language, true)}</span>
            <span>
              {t(r.released ? "released" : "notReleased")} · {t("version")}{" "}
              {r.version}
            </span>
          </div>
          {r.reviewed_at && (
            <p className="attribution">
              {t("reviewedAt")}: {formatDate(r.reviewed_at, language, true)}
            </p>
          )}
        </>
      ) : (
        <p className="muted">{t(order.status)}</p>
      )}
      {action && <div className="form-actions">{action}</div>}
    </div>
  );
}
export function PatientRecord({
  patientId,
  initialTab = "journey",
  onBack,
  session,
}: {
  patientId: string;
  initialTab?: string;
  onBack?: () => void;
  session: Session;
}) {
  const { t, language } = useI18n();
  const [tab, setTab] = useState(initialTab);
  const [rx, setRx] = useState<Prescription | null>(null);
  const q = useQuery({
    queryKey: ["opd", "record", patientId],
    queryFn: () => get<RecordBundle>(`/patients/${patientId}/record`),
    refetchInterval: 10000,
  });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <Alert code="NETWORK_ERROR" />;
  const record = q.data;
  return (
    <div className="page-stack">
      {onBack && (
        <Button variant="ghost" onClick={onBack}>
          ← {t("back")}
        </Button>
      )}
      <PatientHeader patient={record.patient} />
      <nav className="tabs" aria-label={t("records")}>
        {[
          ["journey", Activity],
          ["visits", ClipboardList],
          ["prescriptions", FileText],
          ...(session.role === "NURSE" ? [] : [["laboratory", FlaskConical]]),
        ].map(([name, Icon]) => {
          const key = String(name);
          const I = Icon as typeof Activity;
          return (
            <button
              type="button"
              key={key}
              aria-current={tab === key ? "page" : undefined}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              <I size={17} />
              {t(key === "visits" ? "previousVisits" : key)}
            </button>
          );
        })}
      </nav>
      {tab === "journey" && (
        <Panel title="journey">
          <Journey events={record.journey} />
        </Panel>
      )}
      {tab === "visits" && (
        <div className="page-stack">
          <Panel title="currentVitals">
            <Vitals record={record} />
          </Panel>
          {record.encounters.length ? (
            record.encounters.map((enc) => {
              const note = record.notes.find((n) => n.encounter_id === enc.id);
              const prescriptionIds = record.prescriptions.filter((p) => p.encounter_id === enc.id).map((p) => p.id);
              const versions = record.versions.filter((v) =>
                (v.resource_type === "NOTE" && v.resource_id === note?.id) ||
                (v.resource_type === "PRESCRIPTION" && prescriptionIds.includes(v.resource_id)),
              );
              return (
                <Panel key={enc.id}>
                  <div className="visit-heading">
                    <div>
                      <h3>{enc.doctor_name || t("careTeam")}</h3>
                      <time>{formatDate(enc.created_at, language, true)}</time>
                    </div>
                    <Status
                      value={
                        enc.is_discharged
                          ? "COMPLETED"
                          : enc.queue_status || "CONFIRMED"
                      }
                    />
                  </div>
                  {note && <ClinicalSnapshot data={note.draft_content} />}
                  {versions.length > 0 && <details className="version-history">
                    <summary>{t("amendments")}</summary>
                    <p className="muted">{t("versionHistoryHint")}</p>
                    {versions.map((v) => (
                      <details key={v.id}>
                        <summary>
                          {t(v.resource_type === "NOTE" ? "consultation" : "prescription")} · {t("version")} {v.version}
                          {["FINALIZED", "ISSUED"].includes(v.reason) && <> · {t("originalSigned")}</>}
                        </summary>
                        <p className="attribution">
                          {t("actor")}: {v.actor_id} · <time dateTime={v.created_at}>{formatDate(v.created_at, language, true)}</time>
                        </p>
                        <p className="preserve-lines">{["DRAFT_SAVED", "FINALIZED", "ISSUED"].includes(v.reason) ? t(v.reason) : v.reason}</p>
                        <ClinicalSnapshot data={v.data} />
                      </details>
                    ))}
                  </details>}
                </Panel>
              );
            })
          ) : (
            <Empty />
          )}
        </div>
      )}
      {tab === "prescriptions" && (
        <Panel>
          {record.prescriptions.length ? (
            record.prescriptions.map((p) => (
              <button
                className="record-row"
                key={p.id}
                onClick={() => setRx(p)}
              >
                <span className="record-icon">
                  <FileText size={22} />
                </span>
                <span>
                  <strong>{p.doctor_name}</strong>
                  <small>
                    {formatDate(p.created_at, language)} ·{" "}
                    {p.rx_content.medications?.map((m) => m.name).join(", ")}
                  </small>
                </span>
                <ArrowRight size={18} />
              </button>
            ))
          ) : (
            <Empty />
          )}
        </Panel>
      )}
      {tab === "laboratory" && (
        <div className="card-grid">
          {record.labs.length ? (
            record.labs.map((l) => <ResultCard key={l.id} order={l} />)
          ) : (
            <Panel>
              <Empty />
            </Panel>
          )}
        </div>
      )}
      {rx && (
        <PrescriptionView
          prescription={rx}
          patient={record.patient}
          onClose={() => setRx(null)}
        />
      )}
    </div>
  );
}
