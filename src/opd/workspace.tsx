import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Check,
  Plus,
  Send,
  Trash2,
  Save,
  FlaskConical,
  HeartPulse,
} from "lucide-react";
import { api } from "../api/client";
import { useI18n, formatDate } from "./i18n";
import {
  get,
  post,
  useAction,
  Panel,
  Modal,
  Button,
  Field,
  Select,
  Textarea,
  Alert,
  Loading,
  DataForm,
  Status,
} from "./ui";
import { PatientHeader, Vitals, Journey, ResultCard } from "./records";
import { DoctorCarePlanManager } from "./carePlan";
import { SlotPicker } from "./booking";
import type { FormField } from "./ui";
import type {
  RecordBundle,
  QueueEntry,
  ConsultationData,
  Drug,
  Diagnosis,
  LabTest,
  Session,
} from "./types";

export function Triage({
  entry,
  onClose,
}: {
  entry: QueueEntry;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const action = useAction();
  const q = useQuery({
    queryKey: ["opd", "record", entry.patient_id],
    queryFn: () => get<RecordBundle>(`/patients/${entry.patient_id}/record`),
  });
  const previous = q.data?.triage.find(
    (t) => t.encounter_id === entry.encounter_id,
  );
  const fields: FormField[] = [
    {
      name: "temperature",
      type: "number",
      min: 25,
      max: 45,
      step: 0.1,
      required: true,
    },
    { name: "systolic", type: "number", min: 40, max: 300, required: true },
    { name: "diastolic", type: "number", min: 20, max: 200, required: true },
    { name: "pulse", type: "number", min: 20, max: 250, required: true },
    { name: "spo2", type: "number", min: 1, max: 100, required: true },
    {
      name: "weight",
      type: "number",
      min: 0.5,
      max: 500,
      step: 0.1,
      required: true,
    },
    {
      name: "height",
      type: "number",
      min: 20,
      max: 250,
      step: 0.1,
      required: true,
    },
    { name: "glucose", type: "number", min: 1, max: 1500, step: 0.1 },
    { name: "pain", type: "number", min: 0, max: 10, required: true },
    {
      name: "priority",
      required: true,
      options: [
        { value: "0", label: "routine" },
        { value: "1", label: "urgent" },
        { value: "2", label: "highPriority" },
      ],
    },
    { name: "complaint", type: "textarea", required: true },
    { name: "allergies", type: "textarea" },
    { name: "notes", type: "textarea" },
    ...(previous
      ? [{ name: "amendReason", required: true, type: "textarea" }]
      : []),
  ];
  return (
    <Modal
      title={previous ? "amendTriage" : "triageTitle"}
      onClose={onClose}
      wide
    >
      {q.isLoading ? (
        <Loading />
      ) : q.data ? (
        <>
          <PatientHeader patient={q.data.patient} />
          <p className="muted">{t("triageSub")}</p>
          <DataForm
            fields={fields}
            initial={
              previous
                ? { ...previous.data }
                : { priority: 0, allergies: q.data.patient.allergies }
            }
            pending={action.pending}
            error={action.error}
            submit="sendDoctor"
            onSubmit={(v) => {
              const data: Record<string, unknown> = { ...v };
              for (const key of [
                "temperature",
                "systolic",
                "diastolic",
                "pulse",
                "spo2",
                "weight",
                "height",
                "pain",
                "priority",
              ])
                data[key] = Number(v[key]);
              data.glucose = v.glucose ? Number(v.glucose) : null;
              void action.run(
                () =>
                  post(`/encounters/${entry.encounter_id}/triage`, {
                    __v: entry.__v,
                    data,
                    reason: v.amendReason,
                  }),
                onClose,
              );
            }}
          />
        </>
      ) : (
        <Alert code="NETWORK_ERROR" />
      )}
    </Modal>
  );
}
export function Consultation({
  patientId,
  encounterId,
  onClose,
  session,
  onDirtyChange,
}: {
  patientId: string;
  encounterId: string;
  onClose: () => void;
  session: Session;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const q = useQuery({
    queryKey: ["opd", "record", patientId],
    queryFn: () => get<RecordBundle>(`/patients/${patientId}/record`),
  });
  const catalog = useQuery({
    queryKey: ["opd", "catalogues"],
    queryFn: () =>
      get<{ drugs: Drug[]; diagnoses: Diagnosis[]; tests: LabTest[] }>(
        "/catalogues",
      ),
  });
  if (q.isLoading || catalog.isLoading) return <Loading />;
  if (!q.data || !catalog.data) return <Alert code="NETWORK_ERROR" />;
  return (
    <ConsultationForm
      key={encounterId}
      record={q.data}
      catalogue={catalog.data}
      encounterId={encounterId}
      onClose={onClose}
      session={session}
      onDirtyChange={onDirtyChange}
    />
  );
}
function ConsultationForm({
  record,
  catalogue,
  encounterId,
  onClose,
  session,
  onDirtyChange,
}: {
  record: RecordBundle;
  catalogue: { drugs: Drug[]; diagnoses: Diagnosis[]; tests: LabTest[] };
  encounterId: string;
  onClose: () => void;
  session: Session;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t, language } = useI18n();
  const action = useAction();
  const labAction = useAction();
  const note = record.notes.find((n) => n.encounter_id === encounterId);
  const encounter = record.encounters.find((e) => e.id === encounterId);
  const triage = record.triage.find((tr) => tr.encounter_id === encounterId);
  const [version, setVersion] = useState(note?.__v || 0);
  const [tab, setTab] = useState("consultation");
  const [amendReason, setAmendReason] = useState("");
  const [followUp, setFollowUp] = useState(!!note?.draft_content.follow_up);
  const [test, setTest] = useState("");
  const [confirmComplete, setConfirmComplete] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    getValues,
    reset,
    formState: { isDirty },
  } = useForm<ConsultationData>({
    defaultValues: note?.draft_content || {
      complaint: triage?.data.complaint || "",
      history: "",
      previous_history: "",
      examination: "",
      assessment: "",
      diagnosis_ids: [],
      treatment: "",
      advice: "",
      medications: [],
      follow_up: null,
    },
  });
  useEffect(() => {
    onDirtyChange(isDirty);
    const warn = (event: BeforeUnloadEvent) => {
      if (isDirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      onDirtyChange(false);
      window.removeEventListener("beforeunload", warn);
    };
  }, [isDirty, onDirtyChange]);
  const meds = useFieldArray({ control, name: "medications" });
  const selectedDiagnoses = watch("diagnosis_ids");
  const selectedFollowUp = watch("follow_up");
  const complete = !!encounter?.is_discharged;
  const save = (data: ConsultationData, finalize = false) =>
    void action.run(
      () =>
        complete
          ? post(`/encounters/${encounterId}/amend`, {
              data,
              reason: amendReason,
              __v: version,
            })
          : finalize
            ? post(`/encounters/${encounterId}/complete`, {
                data,
                __v: version,
              })
            : api
                .put<{ __v: number }>(
                  `/opd/encounters/${encounterId}/consultation`,
                  { data, __v: version },
                )
                .then((r) => r.data),
      (res) => {
        reset(data);
        onDirtyChange(false);
        if (finalize || complete) onClose();
        else setVersion((res as { __v: number }).__v);
      },
    );
  return (
    <div className="workspace">
      <div className="workspace-toolbar">
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft size={17} />
          {t("back")}
        </Button>
        <span>
          <Status value={complete ? "FINALIZED" : "DRAFT"} /> · {t("version")}{" "}
          {version}
        </span>
      </div>
      <PatientHeader patient={record.patient} />
      <div className="workspace-columns">
        <aside className="clinical-summary">
          <Panel title="currentVitals">
            <Vitals record={record} encounterId={encounterId} />
          </Panel>
          <Panel title="complaint">
            <p className="inset preserve-lines">
              {triage?.data.complaint || t("notRecorded")}
            </p>
          </Panel>
          <Panel title="previousVisits">
            {record.encounters.filter((e) => e.id !== encounterId).length ? (
              record.encounters
                .filter((e) => e.id !== encounterId)
                .map((e) => (
                  <details className="history-entry" key={e.id}>
                    <summary>
                      {formatDate(e.created_at)} <span>{e.doctor_name}</span>
                    </summary>
                    {record.notes
                      .filter((n) => n.encounter_id === e.id)
                      .map((n) => (
                        <div key={n.id}>
                          <p>
                            {n.draft_content.diagnoses
                              ?.map((d) => d.name)
                              .join(", ")}
                          </p>
                          <p>{n.draft_content.assessment}</p>
                          <p>{n.draft_content.advice}</p>
                        </div>
                      ))}
                  </details>
                ))
            ) : (
              <p className="muted inset">{t("noData")}</p>
            )}
          </Panel>
          <Panel title="prescriptions">
            {record.prescriptions.slice(0, 3).map((p) => (
              <div className="inset" key={p.id}>
                <b>{formatDate(p.created_at)}</b>
                {p.rx_content.medications?.map((m, i) => (
                  <p className="muted" key={i}>
                    {m.name} {m.strength} · {m.dose} · {m.frequency}
                  </p>
                ))}
              </div>
            ))}
          </Panel>
        </aside>
        <div className="clinical-editor">
          <nav className="tabs" aria-label={t("consultation")}>
            {[
              ["consultation", Activity],
              ["laboratory", FlaskConical],
              ["journey", Check],
              ["carePlan", HeartPulse],
            ].map(([name, Icon]) => {
              const key = String(name);
              const I = Icon as typeof Activity;
              return (
                <button
                  key={key}
                  type="button"
                  className={tab === key ? "active" : ""}
                  aria-current={tab === key ? "page" : undefined}
                  onClick={() => setTab(key)}
                >
                  <I size={17} />
                  {t(key)}
                </button>
              );
            })}
          </nav>
          <div hidden={tab !== "consultation"}>
            <form
              className="form-stack"
              onSubmit={handleSubmit((data) => save(data))}
            >
              <Alert code={action.error} />
              {complete && (
                <div className="alert info">
                  {t("amendment")} · {t("completeHint")}
                </div>
              )}
              <Panel title="consultation">
                <div className="form-grid inset">
                  {[
                    "complaint",
                    "history",
                    "previous_history",
                    "examination",
                    "assessment",
                  ].map((key) => (
                    <div
                      key={key}
                      className={key === "complaint" ? "full" : ""}
                    >
                      <Textarea
                        label={key}
                        {...register(key as keyof ConsultationData)}
                        maxLength={3000}
                      />
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="diagnoses">
                <div className="diagnosis-options">
                  {catalogue.diagnoses.map((d) => (
                    <label
                      key={d.id}
                      className={`choice-chip ${selectedDiagnoses.includes(d.id) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        value={d.id}
                        {...register("diagnosis_ids")}
                      />
                      {d.name}
                    </label>
                  ))}
                </div>
              </Panel>
              <Panel
                title="medications"
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      meds.append({
                        drug_id: "",
                        dose: "",
                        frequency: "",
                        duration: "",
                        instructions: "",
                      })
                    }
                  >
                    <Plus size={15} />
                    {t("addMedicine")}
                  </Button>
                }
              >
                <div className="medication-list">
                  {meds.fields.map((field, index) => (
                    <div className="medication-editor" key={field.id}>
                      <div className="medication-number">{index + 1}</div>
                      <div className="form-grid">
                        <Select
                          label="selectDrug"
                          required
                          {...register(`medications.${index}.drug_id`)}
                        >
                          <option value="">{t("noSelection")}</option>
                          {catalogue.drugs.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} — {d.strength} · {d.form} · {d.route}
                            </option>
                          ))}
                        </Select>
                        <Field
                          label="dose"
                          required
                          {...register(`medications.${index}.dose`)}
                        />
                        <Field
                          label="frequency"
                          required
                          {...register(`medications.${index}.frequency`)}
                        />
                        <Field
                          label="duration"
                          required
                          {...register(`medications.${index}.duration`)}
                        />
                        <div className="full">
                          <Field
                            label="instructions"
                            {...register(`medications.${index}.instructions`)}
                          />
                        </div>
                      </div>
                      <button
                        aria-label={`${t("remove")} ${index + 1}`}
                        type="button"
                        className="icon-button"
                        onClick={() => meds.remove(index)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="advice">
                <div className="form-grid inset">
                  <Textarea label="treatment" {...register("treatment")} />
                  <Textarea label="advice" {...register("advice")} />
                </div>
              </Panel>
              {!complete && (
                <Panel title="followUp">
                  <div className="inset">
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={followUp}
                        onChange={(e) => {
                          setFollowUp(e.target.checked);
                          if (!e.target.checked) setValue("follow_up", null, { shouldDirty: true });
                        }}
                      />
                      {t("scheduleFollowUp")}
                    </label>
                    {followUp && (
                      <SlotPicker
                        doctorId={session.id}
                        selected={selectedFollowUp?.scheduled_at || ""}
                        onSelect={(slot) =>
                          setValue(
                            "follow_up",
                            slot.scheduled_at
                              ? {
                                  doctor_id: session.id,
                                  scheduled_at: slot.scheduled_at,
                                  reason: t("followUp"),
                                }
                              : null,
                            { shouldDirty: true },
                          )
                        }
                      />
                    )}
                  </div>
                </Panel>
              )}
              {complete && (
                <Textarea
                  label="amendReason"
                  required
                  value={amendReason}
                  onChange={(e) => setAmendReason(e.target.value)}
                />
              )}
              <div className="editor-footer">
                <p>{t("completeHint")}</p>
                <div className="form-actions">
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={action.pending || (complete && !amendReason)}
                  >
                    <Save size={17} />
                    {t(complete ? "amend" : "saveDraft")}
                  </Button>
                  {!complete && (
                    <Button
                      type="button"
                      disabled={
                        action.pending || (followUp && !selectedFollowUp)
                      }
                      onClick={() =>
                        void handleSubmit(() => setConfirmComplete(true))()
                      }
                    >
                      <Send size={17} />
                      {t("completeEncounter")}
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </div>
          {tab === "laboratory" && (
            <div className="page-stack">
              <Alert code={labAction.error} />
              {!complete && (
                <Panel title="orderTest">
                  <form
                    className="inline-form inset"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void labAction.run(
                        () =>
                          post(`/encounters/${encounterId}/labs`, {
                            test_id: test,
                          }),
                        () => setTest(""),
                      );
                    }}
                  >
                    <Select
                      label="selectTest"
                      required
                      value={test}
                      onChange={(e) => setTest(e.target.value)}
                    >
                      <option value="">{t("noSelection")}</option>
                      {catalogue.tests.map((test) => (
                        <option key={test.id} value={test.id}>
                          {test.name} · {test.code}
                        </option>
                      ))}
                    </Select>
                    <Button disabled={!test || labAction.pending}>
                      <Plus size={17} />
                      {t("orderTest")}
                    </Button>
                  </form>
                </Panel>
              )}
              {record.labs
                .filter((l) => l.encounter_id === encounterId)
                .map((l) => (
                  <ResultCard
                    key={l.id}
                    order={l}
                    action={
                      l.status === "AVAILABLE" ? (
                        <Button
                          disabled={labAction.pending}
                          onClick={() =>
                            void labAction.run(() =>
                              post(`/labs/${l.id}/review`, { __v: l.__v }),
                            )
                          }
                        >
                          {t("reviewResult")}
                        </Button>
                      ) : undefined
                    }
                  />
                ))}
            </div>
          )}
          {tab === "journey" && (
            <Panel title="journey">
              <Journey
                events={record.journey.filter(
                  (e) => e.encounter_id === encounterId,
                )}
              />
            </Panel>
          )}
          {tab === "carePlan" && (
            <div className="page-stack">
              <DoctorCarePlanManager patientId={record.patient.id} />
            </div>
          )}
        </div>
      </div>
      {confirmComplete && (
        <Modal
          title="completeEncounter"
          onClose={() => setConfirmComplete(false)}
        >
          <p>{t("completeHint")}</p>
          <div className="follow-up-confirmation">
            <strong>{t("nextAppointment")}</strong>
            {selectedFollowUp ? (
              <span>{formatDate(selectedFollowUp.scheduled_at, language, true)}</span>
            ) : (
              <span>{t("noFollowUpSelected")}</span>
            )}
          </div>
          <Alert code={action.error} />
          <div className="form-actions">
            <Button
              variant="secondary"
              onClick={() => setConfirmComplete(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              disabled={action.pending}
              onClick={() => save(getValues(), true)}
            >
              {t(selectedFollowUp ? "completeAndBookFollowUp" : "confirmComplete")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
