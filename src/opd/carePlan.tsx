import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Droplets,
  HeartPulse,
  History,
  Pill,
  SkipForward,
} from "lucide-react";
import { useI18n, formatDate, formatTime } from "./i18n";
import {
  Alert,
  Button,
  Empty,
  Field,
  Loading,
  Modal,
  PageHeader,
  Panel,
  Status,
  Textarea,
  get,
  post,
  useAction,
} from "./ui";

type CarePlanTaskType = "MEASUREMENT" | "ACTIVITY" | "MEDICATION" | "INSULIN";
type CarePlanStatus = "UPCOMING" | "DUE" | "COMPLETED" | "MISSED" | "SKIPPED";

interface MedicationSource {
  drug_name: string;
  strength: string;
  form: string;
  route: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
  outdated: boolean;
}

export interface CarePlanOccurrence {
  id: string;
  task_id: string;
  plan_id: string;
  task_type: CarePlanTaskType;
  title: string;
  description: string;
  instruction: string;
  observation_type: string | null;
  timing_relation: string | null;
  target_unit: string | null;
  occurrence_date: string;
  scheduled_for: string;
  status: CarePlanStatus;
  response_status: "RECORDED" | "COMPLETED" | "TAKEN" | "SKIPPED" | null;
  completed_at: string | null;
  recorded_at: string | null;
  recorded_value: number | null;
  patient_note: string | null;
  __v: number;
  medication_source: MedicationSource | null;
}

interface TimelineEntry {
  id: string;
  title: string;
  task_type: CarePlanTaskType;
  occurrence_date: string;
  status: "RECORDED" | "COMPLETED" | "TAKEN" | "SKIPPED";
  recorded_at: string;
  patient_note: string | null;
  observation: {
    components?: Array<{ numeric_value: number; unit: string }>;
  } | null;
}

interface SelfRecord {
  id: string; record_type: string; timing_context: string | null; numeric_value: number | null;
  secondary_numeric_value: number | null; unit: string | null; activity_name: string | null;
  duration_minutes: number | null; observed_at: string; patient_note: string | null;
}

function TaskIcon({ type, size = 21 }: { type: CarePlanTaskType; size?: number }) {
  if (type === "MEASUREMENT") return <Droplets size={size} />;
  if (type === "ACTIVITY") return <Activity size={size} />;
  if (type === "INSULIN") return <HeartPulse size={size} />;
  return <Pill size={size} />;
}

function useTodayCarePlan(patientId: string) {
  return useQuery({
    queryKey: ["opd", "care-plan", "today", patientId],
    queryFn: () => get<CarePlanOccurrence[]>(`/adherence/${patientId}/today`),
    enabled: !!patientId,
    refetchInterval: 30000,
  });
}

function Progress({ tasks }: { tasks: CarePlanOccurrence[] }) {
  const { t } = useI18n();
  const completed = tasks.filter((task) => task.status === "COMPLETED").length;
  const percentage = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  return (
    <div className="care-plan-progress">
      <div>
        <strong>{t("todayProgress")}</strong>
        <span>{completed} {t("of")} {tasks.length} {t("completedLower")}</span>
      </div>
      <div className="progress-track" aria-label={`${percentage}% ${t("completedLower")}`}>
        <span style={{ width: `${percentage}%` }} />
      </div>
      <b>{percentage}%</b>
    </div>
  );
}

export function CarePlanSummary({
  patientId,
  navigate,
}: {
  patientId: string;
  navigate: (page: string) => void;
}) {
  const { t } = useI18n();
  const query = useTodayCarePlan(patientId);
  const tasks = query.data || [];
  const next = tasks.find((task) => task.status === "DUE") || tasks.find((task) => task.status === "UPCOMING");
  return (
    <Panel
      title="carePlan"
      className="care-plan-summary"
      action={
        <Button variant="ghost" onClick={() => navigate("carePlan")}>
          {t("viewCarePlan")} <ArrowUpRight size={16} />
        </Button>
      }
    >
      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <div className="inset"><Alert code="NETWORK_ERROR" /></div>
      ) : !tasks.length ? (
        <Empty title="noCarePlan" hint="noCarePlanHint" />
      ) : (
        <div className="care-plan-summary-body">
          <Progress tasks={tasks} />
          {next ? (
            <div className="care-plan-next">
              <span className="task-icon"><TaskIcon type={next.task_type} size={20} /></span>
              <div>
                <small>{t(next.status === "DUE" ? "dueNow" : "nextTask")}</small>
                <strong>{next.title}</strong>
                <span><Clock3 size={14} /> {formatTime(next.scheduled_for)}</span>
              </div>
              <Status value={next.status} />
            </div>
          ) : (
            <p className="care-plan-all-done"><CheckCircle2 size={18} /> {t("allTasksHandled")}</p>
          )}
        </div>
      )}
    </Panel>
  );
}

function TaskCard({ task }: { task: CarePlanOccurrence }) {
  const { t } = useI18n();
  const action = useAction();
  const [measurementOpen, setMeasurementOpen] = useState(false);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const canRecord = task.status === "DUE";
  const record = (status: "RECORDED" | "COMPLETED" | "TAKEN" | "SKIPPED") =>
    void action.run(
      () => post<CarePlanOccurrence>(`/adherence/${task.id}/record`, {
        __v: task.__v,
        date: task.occurrence_date,
        status,
        ...(status === "RECORDED"
          ? { value: Number(value), ...(task.target_unit ? { unit: task.target_unit } : {}), note }
          : {}),
      }),
      () => {
        setMeasurementOpen(false);
        setValue("");
        setNote("");
      },
    );
  const primaryStatus = task.task_type === "MEASUREMENT"
    ? "RECORDED"
    : task.task_type === "ACTIVITY"
      ? "COMPLETED"
      : "TAKEN";
  return (
    <article className={`care-task care-task-${task.status.toLowerCase()}`}>
      <span className="task-icon"><TaskIcon type={task.task_type} /></span>
      <div className="care-task-content">
        <div className="care-task-heading">
          <div>
            <small>{t(task.task_type)} · {formatTime(task.scheduled_for)}</small>
            <h3>{task.title}</h3>
          </div>
          <Status value={task.status} />
        </div>
        {task.instruction && <p>{task.instruction}</p>}
        {task.medication_source && (
          <div className="medication-source">
            <strong>{task.medication_source.drug_name} {task.medication_source.strength}</strong>
            <span>{task.medication_source.dose} · {task.medication_source.frequency} · {task.medication_source.duration}</span>
            {task.medication_source.instructions && <span>{task.medication_source.instructions}</span>}
            {task.medication_source.outdated && <Alert code="PRESCRIPTION_UPDATED" />}
          </div>
        )}
        {task.status === "COMPLETED" && task.recorded_value != null && (
          <p className="recorded-reading"><CheckCircle2 size={16} /> {t("recordedReading")}: <b>{task.recorded_value} {task.target_unit}</b></p>
        )}
        <Alert code={action.error} />
        {canRecord && (
          <div className="care-task-actions">
            <Button
              disabled={action.pending}
              onClick={() => task.task_type === "MEASUREMENT" ? setMeasurementOpen(true) : record(primaryStatus)}
            >
              <CheckCircle2 size={16} />
              {t(task.task_type === "MEASUREMENT" ? "recordReading" : task.task_type === "ACTIVITY" ? "markCompleted" : "markTaken")}
            </Button>
            <Button variant="ghost" disabled={action.pending} onClick={() => record("SKIPPED")}>
              <SkipForward size={16} /> {t("skipTask")}
            </Button>
          </div>
        )}
      </div>
      {measurementOpen && (
        <Modal title="recordReading" onClose={() => setMeasurementOpen(false)}>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (value !== "") record("RECORDED");
            }}
          >
            <p className="muted">{task.title} · {formatTime(task.scheduled_for)}</p>
            <div className="measurement-entry">
              <Field
                label="readingValue"
                type="number"
                step="any"
                required
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
              <div className="measurement-unit"><span>{t("unit")}</span><strong>{task.target_unit || t("notRecorded")}</strong></div>
            </div>
            <Textarea label="patientNote" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
            <Alert code={action.error} />
            <div className="form-actions">
              <Button type="button" variant="secondary" onClick={() => setMeasurementOpen(false)}>{t("cancel")}</Button>
              <Button disabled={action.pending || value === ""}>{t("saveReading")}</Button>
            </div>
          </form>
        </Modal>
      )}
    </article>
  );
}

export function CarePlanPage({ patientId }: { patientId: string }) {
  const { language } = useI18n();
  const todayQuery = useTodayCarePlan(patientId);
  const timelineQuery = useQuery({
    queryKey: ["opd", "care-plan", "timeline", patientId],
    queryFn: () => get<TimelineEntry[]>(`/adherence/${patientId}/timeline`),
    enabled: !!patientId,
  });
  const selfRecordsQuery = useQuery({ queryKey: ["opd", "self-records", patientId], queryFn: () => get<SelfRecord[]>(`/patient-self-records/${patientId}`), enabled: !!patientId });
  const [addRecord, setAddRecord] = useState(false);
  const tasks = todayQuery.data || [];
  const timeline = useMemo(() => (timelineQuery.data || []).slice(0, 20), [timelineQuery.data]);
  return (
    <div className="page-stack">
      <PageHeader title="carePlan" subtitle="carePlanSub" action={<Button onClick={() => setAddRecord(true)}>+ Add Record</Button>} />
      {todayQuery.isError && <Alert code="NETWORK_ERROR" />}
      {todayQuery.isLoading ? (
        <Loading />
      ) : !tasks.length ? (
        <Panel><Empty title="noCarePlan" hint="noCarePlanHint" /></Panel>
      ) : (
        <>
          <Panel><Progress tasks={tasks} /></Panel>
          <Panel title="todaysTasks">
            <div className="care-task-list">{tasks.map((task) => <TaskCard key={task.task_id} task={task} />)}</div>
          </Panel>
        </>
      )}
      <Panel title="carePlanHistory" action={<History size={18} />}>
        {timelineQuery.isLoading ? (
          <Loading />
        ) : timelineQuery.isError ? (
          <div className="inset"><Alert code="NETWORK_ERROR" /></div>
        ) : timeline.length ? (
          <div className="care-plan-history">
            {timeline.map((entry) => {
              const component = entry.observation?.components?.[0];
              return (
                <div key={entry.id}>
                  <span className="task-icon"><TaskIcon type={entry.task_type} size={17} /></span>
                  <div>
                    <strong>{entry.title}</strong>
                    <small>{formatDate(entry.recorded_at, language, true)}{component ? ` · ${component.numeric_value} ${component.unit}` : ""}</small>
                    {entry.patient_note && <p>{entry.patient_note}</p>}
                  </div>
                  <Status value={entry.status} />
                </div>
              );
            })}
          </div>
        ) : (
          <Empty title="noCarePlanHistory" hint="noCarePlanHistoryHint" />
        )}
      </Panel>
      <Panel title="Patient self-recorded">
        {selfRecordsQuery.isLoading ? <Loading /> : selfRecordsQuery.data?.length ? (
          <div className="care-plan-history">{selfRecordsQuery.data.slice(0, 20).map((record) => <div key={record.id}><span className="task-icon"><Activity size={17} /></span><div><strong>{record.record_type.replaceAll("_", " ")}</strong><small>{formatDate(record.observed_at, language, true)} · Patient self-recorded</small><p>{record.record_type === "ACTIVITY" ? `${record.activity_name} · ${record.duration_minutes} min` : record.record_type === "BLOOD_PRESSURE" ? `${record.numeric_value}/${record.secondary_numeric_value} mmHg` : `${record.numeric_value} ${record.unit || ""}`}</p></div></div>)}</div>
        ) : <Empty title="No self-recorded observations" hint="Use Add Record to record a measurement or activity." />}
      </Panel>
      {addRecord && <SelfRecordModal patientId={patientId} onClose={() => setAddRecord(false)} onSaved={() => { setAddRecord(false); void selfRecordsQuery.refetch(); }} />}
    </div>
  );
}

function SelfRecordModal({ patientId, onClose, onSaved }: { patientId: string; onClose: () => void; onSaved: () => void }) {
  const action = useAction();
  const [type, setType] = useState("GLUCOSE");
  const [timing, setTiming] = useState("FASTING");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [activity, setActivity] = useState("");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const unit: Record<string, string> = { GLUCOSE: "mg/dL", BLOOD_PRESSURE: "mmHg", WEIGHT: "kg", TEMPERATURE: "°C", PULSE: "bpm", SPO2: "%" };
  const types = ["GLUCOSE", "BLOOD_PRESSURE", "WEIGHT", "TEMPERATURE", "PULSE", "SPO2", "ACTIVITY"];
  const timings = ["FASTING", "BEFORE_BREAKFAST", "AFTER_BREAKFAST", "BEFORE_LUNCH", "AFTER_LUNCH", "BEFORE_DINNER", "POST_DINNER", "BEDTIME", "RANDOM"];
  return <Modal title="Add Record" onClose={onClose}><form className="form-stack" onSubmit={(event) => { event.preventDefault(); const payload = type === "ACTIVITY" ? { record_type: type, activity_name: activity, duration_minutes: Number(duration), observed_at: new Date().toISOString(), patient_note: note || undefined } : { record_type: type, numeric_value: Number(primary), ...(type === "BLOOD_PRESSURE" ? { secondary_numeric_value: Number(secondary) } : {}), unit: unit[type], ...(type === "GLUCOSE" ? { timing_context: timing } : {}), observed_at: new Date().toISOString(), patient_note: note || undefined }; void action.run(() => post(`/patient-self-records/${patientId}`, payload), onSaved); }}>
    <label className="field-label">Type<select value={type} onChange={(event) => setType(event.target.value)}>{types.map((value) => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
    {type === "GLUCOSE" && <label className="field-label">Timing<select value={timing} onChange={(event) => setTiming(event.target.value)}>{timings.map((value) => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select></label>}
    {type === "ACTIVITY" ? <><Field label="Activity" required value={activity} onChange={(event) => setActivity(event.target.value)} /><Field label="Duration (minutes)" type="number" required min="1" value={duration} onChange={(event) => setDuration(event.target.value)} /></> : <><Field label={type === "BLOOD_PRESSURE" ? "Systolic" : `Value (${unit[type]})`} type="number" step="any" required value={primary} onChange={(event) => setPrimary(event.target.value)} />{type === "BLOOD_PRESSURE" && <Field label="Diastolic" type="number" step="any" required value={secondary} onChange={(event) => setSecondary(event.target.value)} />}</>}
    <Textarea label="Patient note" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} /><p className="muted">Stored as Patient self-recorded. This does not change diagnosis or treatment.</p><Alert code={action.error} /><div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={action.pending}>Save</Button></div>
  </form></Modal>;
}

export function DoctorCarePlanManager({ patientId }: { patientId: string }) {
  const { t } = useI18n();
  const action = useAction();
  const [taskType, setTaskType] = useState<"MEASUREMENT" | "ACTIVITY">("MEASUREMENT");
  const [observationType, setObservationType] = useState("BLOOD_GLUCOSE_FASTING");
  const [frequency, setFrequency] = useState("DAILY");
  const [scheduledTime, setScheduledTime] = useState("08:00");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  const planQuery = useQuery({
    queryKey: ["opd", "care-plans", patientId],
    queryFn: () => get<any>(`/care-plans/${patientId}`)
  });

  const createPlanAndTask = async () => {
    let plan = planQuery.data?.plan;
    if (!plan) {
      const res = await post<any>(`/care-plans/${patientId}`, { start_date: startDate });
      plan = res.care_plan;
    }
    
    const taskPayload: any = {
      task_type: taskType,
      title: observationType.replace(/_/g, " "),
      frequency_type: frequency,
      scheduled_time: scheduledTime,
      start_date: startDate,
    };
    
    if (taskType === "MEASUREMENT") {
      taskPayload.observation_type = observationType;
      taskPayload.timing_relation = "FASTING";
      taskPayload.target_unit = observationType === "WEIGHT" ? "kg" : observationType === "BLOOD_PRESSURE" ? "mmHg" : "mg/dL";
    } else {
      taskPayload.instruction = "Please perform this activity as prescribed.";
    }

    await post(`/care-plans/${patientId}/tasks`, {
      __v: plan.__v,
      task: taskPayload
    });
    
    planQuery.refetch();
    action.setError("");
  };

  return (
    <div className="form-stack">
      <Panel title="Active Care Plan">
        {planQuery.isLoading ? <Loading /> : planQuery.data?.tasks?.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Task</th><th>Frequency</th><th>Status</th></tr></thead>
              <tbody>
                {planQuery.data.tasks.map((t: any) => (
                  <tr key={t.id}>
                    <td><b>{t.title}</b><br/><small>{t.task_type}</small></td>
                    <td>{t.frequency_type} at {t.scheduled_time}</td>
                    <td><Status value={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No active care plan" hint="Create a care plan to monitor patient vitals remotely." />}
      </Panel>
      
      <Panel title="Push Care Plan Task">
        <form onSubmit={(e) => { e.preventDefault(); action.run(createPlanAndTask); }} className="form-grid">
          <label className="field-label">Task Type
    <select value={taskType} onChange={(e) => setTaskType(e.target.value as any)}>
      <option value="MEASUREMENT">Measurement</option>
      <option value="ACTIVITY">Activity</option>
    </select>
  </label>
          <label className="field-label">Observation
    <select value={observationType} onChange={(e) => setObservationType(e.target.value)}>
      <option value="BLOOD_GLUCOSE_FASTING">Fasting Blood Sugar</option>
      <option value="BLOOD_GLUCOSE_PP">Post-Prandial Blood Sugar</option>
      <option value="BLOOD_PRESSURE">Blood Pressure</option>
      <option value="WEIGHT">Weight</option>
      <option value="ACTIVITY">Exercise / Activity</option>
    </select>
  </label>
          <label className="field-label">Frequency
    <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
      <option value="DAILY">Daily</option>
      <option value="WEEKLY">Weekly</option>
    </select>
  </label>
          <Field label="Scheduled Time" type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} required />
          <Field label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          
          <div className="form-actions" style={{ gridColumn: "1 / -1" }}>
            <Button disabled={action.pending} type="submit">{action.pending ? "Pushing..." : "Push to Patient"}</Button>
            <Alert code={action.error} />
          </div>
        </form>
      </Panel>
    </div>
  );
}
