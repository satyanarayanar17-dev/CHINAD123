import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, CalendarClock, ShieldCheck, Laptop, LogOut } from "lucide-react";
import { api } from "../api/client";
import {
  get,
  post,
  useAction,
  Panel,
  PageHeader,
  Button,
  DataForm,
  Modal,
  Loading,
  Empty,
  Alert,
  Success,
  Select,
  Confirm,
} from "./ui";
import type { FormField } from "./ui";
import { useI18n, formatDate } from "./i18n";
import { PatientForm } from "./booking";
import type {
  Department,
  Doctor,
  Schedule,
  Staff,
  Patient,
  Session,
  Drug,
  Diagnosis,
  LabTest,
} from "./types";

const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export function SchedulesPage() {
  const { t } = useI18n();
  const [actionType, setActionType] = useState<"schedule" | "leave" | null>(
    null,
  );
  const [edit, setEdit] = useState<Schedule | null>(null);
  const action = useAction();
  const directory = useQuery({
    queryKey: ["opd", "directory"],
    queryFn: () =>
      get<{ departments: Department[]; doctors: Doctor[] }>("/directory"),
  });
  const leave = useQuery({
    queryKey: ["opd", "unavailability"],
    queryFn: () =>
      get<{ id: string; doctor_id: string; date: string; reason: string }[]>(
        "/unavailability",
      ),
  });
  const doctors = directory.data?.doctors || [];
  const fields: FormField[] = [
    {
      name: "doctor_id",
      label: "doctor",
      required: true,
      options: doctors.map((d) => ({
        value: d.id,
        label: d.name,
        literal: true,
      })),
      disabled: !!edit,
    },
    ...(actionType === "leave"
      ? [
          { name: "date", label: "date", type: "date", required: true },
          { name: "reason", required: true },
        ]
      : [
          {
            name: "department_id",
            label: "department",
            required: true,
            options:
              directory.data?.departments.map((d) => ({
                value: d.id,
                label: d.name,
                literal: true,
              })) || [],
          },
          {
            name: "weekday",
            required: true,
            options: weekdays.map((v, i) => ({ value: String(i), label: v })),
            disabled: !!edit,
          },
          { name: "room", required: true },
          { name: "start_time", type: "time", required: true },
          { name: "end_time", type: "time", required: true },
          {
            name: "slot_minutes",
            type: "number",
            min: 5,
            max: 120,
            required: true,
          },
          { name: "break_start", type: "time" },
          { name: "break_end", type: "time" },
        ]),
  ];
  return (
    <div className="page-stack">
      <PageHeader
        title="schedules"
        subtitle="scheduleHint"
        action={
          <Button
            onClick={() => {
              setEdit(null);
              setActionType("schedule");
            }}
          >
            <Plus size={18} />
            {t("addSchedule")}
          </Button>
        }
      />
      <Alert code={action.error} />
      {directory.isLoading ? (
        <Loading />
      ) : (
        <Panel>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("doctor")}</th>
                  <th>{t("weekday")}</th>
                  <th>{t("time")}</th>
                  <th>{t("room")}</th>
                  <th>{t("slot_minutes")}</th>
                  <th>{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {doctors.flatMap((d) =>
                  d.schedules.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <b>{d.name}</b>
                        <small>
                          {
                            directory.data?.departments.find(
                              (dep) => dep.id === s.department_id,
                            )?.name
                          }
                        </small>
                      </td>
                      <td>{t(weekdays[s.weekday])}</td>
                      <td>
                        {s.start_time}–{s.end_time}
                        {s.break_start && (
                          <small>
                            {t("break_start")}: {s.break_start}–{s.break_end}
                          </small>
                        )}
                      </td>
                      <td>{s.room}</td>
                      <td>{s.slot_minutes}</td>
                      <td>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEdit(s);
                            setActionType("schedule");
                          }}
                        >
                          {t("edit")}
                        </Button>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          {!doctors.some((d) => d.schedules.length) && <Empty />}
        </Panel>
      )}
      <Panel
        title="unavailability"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setEdit(null);
              setActionType("leave");
            }}
          >
            <CalendarClock size={16} />
            {t("addLeave")}
          </Button>
        }
      >
        {leave.data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("doctor")}</th>
                  <th>{t("date")}</th>
                  <th>{t("reason")}</th>
                  <th>{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {leave.data.map((l) => (
                  <tr key={l.id}>
                    <td>{doctors.find((d) => d.id === l.doctor_id)?.name}</td>
                    <td>{l.date}</td>
                    <td>{l.reason}</td>
                    <td>
                      <Button
                        variant="ghost"
                        disabled={action.pending}
                        onClick={() =>
                          void action.run(() =>
                            api.delete(`/opd/unavailability/${l.id}`),
                          )
                        }
                      >
                        {t("restore")}
                      </Button>
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
      {actionType && (
        <Modal
          title={actionType === "leave" ? "addLeave" : "addSchedule"}
          onClose={() => setActionType(null)}
        >
          <DataForm
            fields={fields}
            initial={
              edit
                ? { ...edit }
                : { slot_minutes: 15, start_time: "09:00", end_time: "17:00" }
            }
            error={action.error}
            pending={action.pending}
            onSubmit={(v) =>
              void action.run(
                () =>
                  actionType === "leave"
                    ? post("/unavailability", v)
                    : post("/schedules", {
                        ...v,
                        doctor_id: edit?.doctor_id || v.doctor_id,
                        weekday: edit?.weekday ?? Number(v.weekday),
                        slot_minutes: Number(v.slot_minutes),
                        break_start: v.break_start || null,
                        break_end: v.break_end || null,
                        __v: edit?.__v,
                      }),
                () => setActionType(null),
              )
            }
          />
        </Modal>
      )}
    </div>
  );
}
export function Administration() {
  const { t } = useI18n();
  const [staffForm, setStaffForm] = useState(false);
  const [catalogueForm, setCatalogueForm] = useState(false);
  const [kind, setKind] = useState("departments");
  const action = useAction();
  const staff = useQuery({
    queryKey: ["opd", "staff"],
    queryFn: () => get<Staff[]>("/staff"),
  });
  const directory = useQuery({
    queryKey: ["opd", "directory"],
    queryFn: () => get<{ departments: Department[] }>("/directory"),
  });
  const catalogues = useQuery({
    queryKey: ["opd", "catalogues"],
    queryFn: () =>
      get<{ drugs: Drug[]; diagnoses: Diagnosis[]; tests: LabTest[] }>(
        "/catalogues",
      ),
  });
  const catalogFields: Record<string, FormField[]> = {
    departments: [
      { name: "name", required: true },
      { name: "prefix", required: true, pattern: "[A-Z]{2,6}" },
    ],
    drugs: [
      { name: "name", required: true },
      { name: "strength", required: true },
      { name: "form", required: true },
      { name: "route", required: true },
    ],
    diagnoses: [{ name: "name", required: true }],
    tests: [
      { name: "name", required: true },
      { name: "code", label: "testCode", required: true },
      { name: "department", required: true },
      { name: "unit" },
      { name: "reference_range", label: "referenceRange", required: true },
    ],
  };
  return (
    <div className="page-stack">
      <PageHeader
        title="administration"
        subtitle="connected"
        action={
          <Button onClick={() => setStaffForm(true)}>
            <Plus size={18} />
            {t("addStaff")}
          </Button>
        }
      />
      <Alert code={action.error} />
      <Panel title="staffDirectory">
        {staff.isLoading ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("staffName")}</th>
                  <th>{t("staffId")}</th>
                  <th>{t("role")}</th>
                  <th>{t("department")}</th>
                  <th>{t("status")}</th>
                  <th>{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {staff.data?.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.name}</b>
                    </td>
                    <td>{s.id}</td>
                    <td>{t(s.role)}</td>
                    <td>{s.department || "—"}</td>
                    <td>{t(s.is_active ? "active" : "inactive")}</td>
                    <td>
                      <Button
                        variant="ghost"
                        disabled={action.pending}
                        onClick={() =>
                          void action.run(() =>
                            api.patch(`/opd/staff/${s.id}`, {
                              active: !s.is_active,
                            }),
                          )
                        }
                      >
                        {t(s.is_active ? "disable" : "enable")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel
        title="catalogues"
        action={
          <Button variant="secondary" onClick={() => setCatalogueForm(true)}>
            <Plus size={16} />
            {t("addItem")}
          </Button>
        }
      >
        <div className="catalogue-grid">
          {[
            ["departments", directory.data?.departments],
            ["drugs", catalogues.data?.drugs],
            ["diagnoses", catalogues.data?.diagnoses],
            ["tests", catalogues.data?.tests],
          ].map(([label, items]) => (
            <div key={String(label)}>
              <h3>{t(String(label))}</h3>
              <ul>
                {(
                  items as
                    | { id: string; name: string; strength?: string }[]
                    | undefined
                )?.map((i) => (
                  <li key={i.id}>
                    {i.name} {i.strength}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
      {staffForm && (
        <Modal title="addStaff" onClose={() => setStaffForm(false)}>
          <p className="muted">{t("staffPasswordHint")}</p>
          <DataForm
            fields={[
              { name: "name", label: "staffName", required: true },
              {
                name: "id",
                label: "staffId",
                required: true,
                pattern: "[a-zA-Z0-9_.-]{3,60}",
              },
              {
                name: "role",
                required: true,
                options: ["DOCTOR", "NURSE", "ADMIN"].map((v) => ({
                  value: v,
                  label: v,
                })),
              },
              {
                name: "department",
                required: true,
                options:
                  directory.data?.departments.map((d) => ({
                    value: d.name,
                    label: d.name,
                    literal: true,
                  })) || [],
              },
              {
                name: "password",
                label: "temporaryPassword",
                type: "password",
                required: true,
                autoComplete: "new-password",
              },
            ]}
            error={action.error}
            pending={action.pending}
            onSubmit={(v) =>
              void action.run(
                () => post("/staff", v),
                () => setStaffForm(false),
              )
            }
          />
        </Modal>
      )}
      {catalogueForm && (
        <Modal title="addItem" onClose={() => setCatalogueForm(false)}>
          <Select
            label="catalogueKind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {Object.keys(catalogFields).map((k) => (
              <option key={k} value={k}>
                {t(k)}
              </option>
            ))}
          </Select>
          <DataForm
            key={kind}
            fields={catalogFields[kind]}
            error={action.error}
            pending={action.pending}
            onSubmit={(v) =>
              void action.run(
                () => post(`/catalogues/${kind}`, v),
                () => setCatalogueForm(false),
              )
            }
          />
        </Modal>
      )}
    </div>
  );
}
export function AuditPage() {
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ["opd", "audit"],
    queryFn: () =>
      get<
        {
          id: number;
          timestamp: string;
          actor_id: string;
          patient_id: string;
          action: string;
          new_state: string;
        }[]
      >("/audit"),
    refetchInterval: 15000,
  });
  return (
    <div className="page-stack">
      <PageHeader title="audit" subtitle="auditSub" />
      <Panel>
        {q.isLoading ? (
          <Loading />
        ) : q.isError ? (
          <Alert code="NETWORK_ERROR" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("timestamp")}</th>
                  <th>{t("actor")}</th>
                  <th>{t("action")}</th>
                  <th>{t("patient")}</th>
                  <th>{t("resource")}</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">
                      {formatDate(e.timestamp, "en", true)}
                    </td>
                    <td>{e.actor_id}</td>
                    <td>{t(e.action)}</td>
                    <td>{e.patient_id || "—"}</td>
                    <td>
                      <details>
                        <summary>{t("view")}</summary>
                        <pre className="audit-context">
                          {JSON.stringify(
                            JSON.parse(e.new_state || "{}"),
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
export function SettingsPage({
  session,
  onLogout,
}: {
  session: Session;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const [edit, setEdit] = useState(false);
  const [revoke, setRevoke] = useState<{ id: string; current: boolean } | null>(
    null,
  );
  const action = useAction();
  const profile = useQuery({
    queryKey: ["opd", "profile"],
    queryFn: () => get<Patient>("/profile"),
    enabled: session.role === "PATIENT",
  });
  const sessions = useQuery({
    queryKey: ["opd", "sessions"],
    queryFn: () =>
      api
        .get<
          {
            id: string;
            device_name: string;
            created_at: string;
            expires_at: string;
            current: boolean;
          }[]
        >("/auth/opd/sessions")
        .then((r) => r.data),
  });
  return (
    <div className="page-stack">
      <PageHeader title="settings" />
      <Alert code={action.error} />
      {session.role === "PATIENT" && (
        <Panel
          title="profile"
          action={
            <Button variant="secondary" onClick={() => setEdit(true)}>
              {t("edit")}
            </Button>
          }
        >
          {profile.data && (
            <div className="detail-grid inset">
              {(
                [
                  "name",
                  "phone",
                  "dob",
                  "gender",
                  "address",
                  "city",
                  "state",
                  "pin_code",
                  "emergency_contact",
                  "preferred_language",
                ] as const
              ).map((key) => (
                <p key={key}>
                  <small>{t(key === "phone" ? "mobile" : key)}</small>
                  {profile.data[key]}
                </p>
              ))}
            </div>
          )}
        </Panel>
      )}
      <Panel title="sessions">
        <div className="session-list">
          {sessions.data?.map((s) => (
            <div key={s.id}>
              <Laptop size={25} />
              <div>
                <b>{s.current ? t("thisDevice") : t("device")}</b>
                <p>{s.device_name || t("unknownDevice")}</p>
                <small>
                  {t("expires")}: {formatDate(s.expires_at)}
                </small>
              </div>
              <Button variant="ghost" onClick={() => setRevoke(s)}>
                {t("revoke")}
              </Button>
            </div>
          ))}
        </div>
      </Panel>
      {session.role !== "PATIENT" && (
        <Panel title="changePassword">
          <div className="inset">
            <PasswordForm />
          </div>
        </Panel>
      )}
      {edit && profile.data && (
        <PatientForm
          patient={profile.data}
          onClose={() => setEdit(false)}
          onDone={() => setEdit(false)}
        />
      )}
      {revoke && (
        <Confirm
          title="revoke"
          text="revoke"
          onClose={() => setRevoke(null)}
          pending={action.pending}
          error={action.error}
          onConfirm={() =>
            void action.run(
              () => api.delete(`/auth/opd/sessions/${revoke.id}`),
              () => {
                if (revoke.current) onLogout();
                setRevoke(null);
              },
            )
          }
        />
      )}
    </div>
  );
}
export function PasswordForm({ onDone }: { onDone?: () => void }) {
  const action = useAction();
  return (
    <>
      <DataForm
        fields={[
          {
            name: "currentPassword",
            type: "password",
            required: true,
            autoComplete: "current-password",
          },
          {
            name: "newPassword",
            type: "password",
            required: true,
            autoComplete: "new-password",
          },
        ]}
        submit="changePassword"
        error={action.error}
        pending={action.pending}
        onSubmit={(v) =>
          void action.run(
            () => api.post("/auth/change-password", v),
            () => onDone?.(),
          )
        }
      />
      <Success show={action.success} />
    </>
  );
}
