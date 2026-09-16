import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Clock3, MapPin } from "lucide-react";
import { api } from "../api/client";
import { useI18n, today, formatTime, formatDate } from "./i18n";
import {
  get,
  post,
  Modal,
  Field,
  Select,
  Textarea,
  Button,
  Alert,
  Loading,
  useAction,
  DataForm,
} from "./ui";
import type { FormField } from "./ui";
import type { Department, Doctor, Slot, Patient, Appointment } from "./types";
export const profileFields: FormField[] = [
  { name: "name", required: true, autoComplete: "name" },
  {
    name: "phone",
    label: "mobile",
    type: "tel",
    required: true,
    pattern: "(?:\\+91)?[6-9][0-9]{9}",
    autoComplete: "tel",
  },
  {
    name: "dob",
    type: "date",
    required: true,
    max: today(),
    min: "1900-01-01",
  },
  {
    name: "gender",
    required: true,
    options: ["Female", "Male", "Other", "Not specified"].map((v) => ({
      value: v,
      label: v,
    })),
  },
  { name: "email", type: "email", autoComplete: "email" },
  {
    name: "preferred_language",
    required: true,
    options: ["en", "ta", "te"].map((v) => ({ value: v, label: v })),
  },
  { name: "address", required: true, autoComplete: "street-address" },
  { name: "city", required: true, autoComplete: "address-level2" },
  { name: "state", required: true, autoComplete: "address-level1" },
  {
    name: "pin_code",
    required: true,
    pattern: "[1-9][0-9]{5}",
    autoComplete: "postal-code",
  },
  {
    name: "emergency_contact",
    type: "tel",
    required: true,
    pattern: "(?:\\+91)?[6-9][0-9]{9}",
  },
  { name: "existing_mrn" },
  { name: "allergies", type: "textarea" },
];
export function PatientForm({
  patient,
  onDone,
  onClose,
}: {
  patient?: Patient;
  onDone: () => void;
  onClose: () => void;
}) {
  const action = useAction();
  const { t } = useI18n();
  return (
    <Modal
      title={patient ? "profile" : "newRegistration"}
      onClose={onClose}
      wide
    >
      <p className="muted">{t("registerHint")}</p>
      <DataForm
        fields={profileFields.map((f) => ({
          ...f,
          disabled: patient && f.name === "phone" ? true : f.disabled,
        }))}
        initial={
          patient
            ? { ...patient }
            : { preferred_language: "en", gender: "Female" }
        }
        submit={patient ? "save" : "register"}
        error={action.error}
        pending={action.pending}
        onSubmit={(v) =>
          void action.run(
            () =>
              patient
                ? api.patch(`/opd/patients/${patient.id}`, {
                    data: { ...v, phone: patient.phone },
                    __v: patient.__v,
                  })
                : post("/patients", v),
            onDone,
          )
        }
      />
    </Modal>
  );
}
export function SlotPicker({
  doctorId,
  onSelect,
  selected,
  initialDate,
}: {
  doctorId: string;
  onSelect: (slot: Slot) => void;
  selected: string;
  initialDate?: string;
}) {
  const { t } = useI18n();
  const [date, setDate] = useState(initialDate || today());
  const q = useQuery({
    queryKey: ["opd", "slots", doctorId, date],
    queryFn: () =>
      get<Slot[]>(
        `/slots?doctor_id=${encodeURIComponent(doctorId)}&date=${date}`,
      ),
    enabled: !!doctorId,
  });
  return (
    <div className="slot-picker">
      <Field
        label="date"
        type="date"
        value={date}
        min={today()}
        onChange={(e) => {
          setDate(e.target.value);
          onSelect({
            scheduled_at: "",
            ends_at: "",
            room: "",
            department_id: "",
          });
        }}
      />
      <label className="field-label">{t("chooseSlot")}</label>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <Alert code="NETWORK_ERROR" />
      ) : q.data?.length ? (
        <div className="slot-grid">
          {q.data.map((s) => (
            <button
              type="button"
              key={s.scheduled_at}
              className={`slot ${selected === s.scheduled_at ? "selected" : ""}`}
              aria-pressed={selected === s.scheduled_at}
              onClick={() => onSelect(s)}
            >
              {formatTime(s.scheduled_at)}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted inset">{t("noSlots")}</p>
      )}
    </div>
  );
}
export function Booking({
  patient,
  appointment,
  onClose,
  onDone,
}: {
  patient?: Patient;
  appointment?: Appointment;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const action = useAction();
  const directory = useQuery({
    queryKey: ["opd", "directory"],
    queryFn: () =>
      get<{ departments: Department[]; doctors: Doctor[] }>("/directory"),
  });
  const [department, setDepartment] = useState(
    appointment?.department_id || "",
  );
  const [doctor, setDoctor] = useState(appointment?.doctor_id || "");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState(appointment?.reason || "");
  return (
    <Modal
      title={appointment ? "reschedule" : "bookFor"}
      onClose={onClose}
      wide
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!slot?.scheduled_at) return;
          void action.run(
            () =>
              appointment
                ? post(`/appointments/${appointment.id}/reschedule`, {
                    scheduled_at: slot.scheduled_at,
                    __v: appointment.__v,
                  })
                : post("/appointments", {
                    patient_id: patient?.id,
                    doctor_id: doctor,
                    scheduled_at: slot.scheduled_at,
                    reason,
                  }),
            onDone,
          );
        }}
      >
        <Alert code={action.error} />
        {patient && (
          <div className="patient-strip">
            <strong>{patient.name}</strong>
            <span>{patient.mrn}</span>
          </div>
        )}
        <div className="form-grid">
          <Select
            label="chooseDepartment"
            required
            value={department}
            disabled={!!appointment}
            onChange={(e) => {
              setDepartment(e.target.value);
              setDoctor("");
              setSlot(null);
            }}
          >
            <option value="">{t("noSelection")}</option>
            {directory.data?.departments.map((d) => (
              <option value={d.id} key={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select
            label="chooseDoctor"
            required
            value={doctor}
            disabled={!department || !!appointment}
            onChange={(e) => {
              setDoctor(e.target.value);
              setSlot(null);
            }}
          >
            <option value="">{t("noSelection")}</option>
            {directory.data?.doctors
              .filter((d) =>
                d.schedules.some((s) => s.department_id === department),
              )
              .map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name}
                </option>
              ))}
          </Select>
        </div>
        {doctor && (
          <SlotPicker
            key={doctor}
            doctorId={doctor}
            selected={slot?.scheduled_at || ""}
            onSelect={setSlot}
          />
        )}
        <Textarea
          label="reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
        />
        {slot?.scheduled_at && (
          <div className="booking-summary">
            <CalendarPlus size={22} />
            <div>
              <strong>{formatDate(slot.scheduled_at, "en", true)}</strong>
              <span>
                <MapPin size={14} />
                {t("room")} {slot.room}
              </span>
            </div>
          </div>
        )}
        <div className="form-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={action.pending || !slot?.scheduled_at}>
            <Clock3 size={16} />
            {t(appointment ? "reschedule" : "confirmBooking")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
