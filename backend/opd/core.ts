import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import type { Request, Response, RequestHandler } from "express";
import type { ZodType } from "zod";
import type {
  Patient,
  Session,
  Encounter,
  Department,
} from "../../src/opd/types.ts";
const crypto = require("node:crypto") as typeof import("node:crypto");
const z = (require("zod") as typeof import("zod")).z;
const { runtimeConfig } = require("../config");

export interface DB {
  dialect: string;
  get<T>(sql: string, values?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, values?: unknown[]): Promise<T[]>;
  run(sql: string, values?: unknown[]): Promise<{ changes: number }>;
}
const database = require("../database");
export const db: DB = { ...database, dialect: database.dbDialect };
export const transaction: <T>(work: (tx: DB) => Promise<T>) => Promise<T> =
  database.withTransaction;
export type Req = Request & {
  user: { id: string; role: Session["role"]; session_iat_ms?: number };
  correlationId: string;
};
export const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const now = () => new Date().toISOString();
export const day = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const fail = (code: string, status = 422): never => {
  throw { status, code, message: code };
};
export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw {
      status: 422,
      code: "VALIDATION_ERROR",
      message: "VALIDATION_ERROR",
      details: result.error.flatten(),
    };
  return result.data;
}
export const text = z.string().trim().min(1).max(500);
export const optionalText = z.string().trim().max(3000).default("");
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  });
export const phone = z
  .string()
  .trim()
  .transform((v) =>
    v.replace(/[\s()-]/g, "").replace(/^(?:\+91|91)?([6-9]\d{9})$/, "+91$1"),
  )
  .refine((v) => /^\+91[6-9]\d{9}$/.test(v));
export const profileSchema = z.object({
  name: text.max(120),
  phone,
  dob: date.refine((v) => v <= day() && v >= "1900-01-01"),
  gender: z.enum(["Female", "Male", "Other", "Not specified"]),
  email: z.union([z.email(), z.literal("")]).default(""),
  address: text,
  city: text.max(80),
  state: text.max(80),
  pin_code: z.string().regex(/^[1-9]\d{5}$/),
  emergency_contact: phone,
  preferred_language: z.enum(["en", "ta", "te"]).default("en"),
  existing_mrn: optionalText,
  allergies: optionalText,
});
export const versionSchema = z.object({ __v: z.number().int().positive() });
export async function actor(req: Req, tx = db): Promise<Session> {
  const user = await tx.get<Session>(
    "SELECT id, name, role, department, patient_id, must_change_password FROM users WHERE id = ? AND is_active = 1",
    [req.user.id],
  );
  return user || fail("ACCOUNT_DISABLED", 401);
}
export function roles(req: Req, allowed: Session["role"][]) {
  if (!allowed.includes(req.user.role)) fail("FORBIDDEN_ROLE", 403);
}
export async function pilotDepartment(tx = db) {
  if (!runtimeConfig.ogPilotOnly) return null;
  const department = await tx.get<Department>(
    "SELECT * FROM departments WHERE prefix=?",
    [runtimeConfig.pilotDepartmentPrefix],
  );
  if (!department || department.name !== "Obstetrics & Gynaecology")
    fail("OG_DEPARTMENT_NOT_CONFIGURED", 503);
  return department;
}
export async function enforcePilotDepartment(
  tx: DB,
  departmentId: string,
) {
  const department = await pilotDepartment(tx);
  if (department && department.id !== departmentId)
    fail("PILOT_DEPARTMENT_ONLY", 422);
  return department;
}
export async function patientAccess(
  req: Req,
  patientId: string,
  tx = db,
  clinical = true,
) {
  const user = await actor(req, tx);
  const patient = await tx.get<Patient>("SELECT * FROM patients WHERE id = ?", [
    patientId,
  ]);
  if (!patient) fail("NOT_FOUND", 404);
  if (user.role === "PATIENT" && user.patient_id !== patientId)
    fail("NOT_FOUND", 404);
  if (user.role === "DOCTOR") {
    const linked = await tx.get(
      "SELECT id FROM encounters WHERE patient_id = ? AND assigned_doctor_id = ? UNION SELECT id FROM appointments WHERE patient_id = ? AND doctor_id = ? AND status IN ('PENDING_CONFIRMATION','CONFIRMED','CHECKED_IN','IN_TRIAGE','READY_FOR_DOCTOR','IN_CONSULTATION')",
      [patientId, user.id, patientId, user.id],
    );
    if (!linked) fail("NOT_FOUND", 404);
  }
  if (user.role === "NURSE") {
    const linked = await tx.get(
      `SELECT q.encounter_id FROM queue_entries q JOIN encounters e ON e.id=q.encounter_id JOIN departments d ON d.id=q.department_id WHERE e.patient_id=? AND d.name=? AND q.status != 'COMPLETED' UNION SELECT id FROM appointments WHERE patient_id=? AND assigned_nurse_id=? AND status IN ('PENDING_CONFIRMATION','CONFIRMED','CHECKED_IN','IN_TRIAGE','READY_FOR_DOCTOR','IN_CONSULTATION')`,
      [patientId, user.department, patientId, user.id],
    );
    if (!linked) fail("NOT_FOUND", 404);
  }
  if (clinical && user.role === "ADMIN") fail("CLINICAL_ACCESS_DENIED", 403);
  return patient!;
}
export async function encounterAccess(
  req: Req,
  encounterId: string,
  tx = db,
  writable = false,
) {
  const row = await tx.get<Encounter>(
    `SELECT * FROM encounters WHERE id = ?${tx !== db && tx.dialect === "postgres" ? " FOR UPDATE" : ""}`,
    [encounterId],
  );
  if (!row) fail("NOT_FOUND", 404);
  await patientAccess(req, row!.patient_id, tx);
  if (writable) {
    roles(req, ["DOCTOR"]);
    if (row!.assigned_doctor_id !== req.user.id) fail("NOT_ASSIGNED", 403);
    if (row!.is_discharged) fail("ENCOUNTER_COMPLETED", 409);
  }
  return row!;
}
export async function audit(
  tx: DB,
  req: Req,
  action: string,
  patientId: string | null = null,
  context: unknown = {},
  outcome = "success",
) {
  await tx.run(
    "INSERT INTO audit_logs (timestamp, correlation_id, actor_id, patient_id, action, new_state) VALUES (?, ?, ?, ?, ?, ?)",
    [
      now(),
      req.correlationId,
      req.user?.id || "ANONYMOUS",
      patientId,
      action,
      JSON.stringify({ outcome, context }),
    ],
  );
}
export async function event(
  tx: DB,
  req: Req,
  patientId: string,
  code: string,
  context: Record<string, string | number> = {},
  encounterId: string | null = null,
  appointmentId: string | null = null,
) {
  const eventId = id("evt");
  await tx.run(
    "INSERT INTO journey_events (id, patient_id, encounter_id, appointment_id, code, actor_id, occurred_at, context) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      eventId,
      patientId,
      encounterId,
      appointmentId,
      code,
      req.user.id,
      now(),
      JSON.stringify(context),
    ],
  );
  await audit(tx, req, code, patientId, {
    ...context,
    event_id: eventId,
    encounter_id: encounterId,
    appointment_id: appointmentId,
  });
  const patientUser = await tx.get<{ id: string }>(
    "SELECT id FROM users WHERE patient_id = ?",
    [patientId],
  );
  if (patientUser)
    await tx.run(
      "INSERT INTO opd_notifications (id, user_id, patient_id, code, context, created_at, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        id("notice"),
        patientUser.id,
        patientId,
        code,
        JSON.stringify(context),
        now(),
        eventId,
      ],
    );
  if (
    [
      "APPOINTMENT_CONFIRMED",
      "APPOINTMENT_RESCHEDULED",
      "APPOINTMENT_CANCELLED",
      "CHECKED_IN",
      "TOKEN_ISSUED",
      "TRIAGE_COMPLETED",
      "DOCTOR_READY",
      "PRESCRIPTION_ISSUED",
      "RESULT_RELEASED",
      "FOLLOW_UP_BOOKED",
    ].includes(code)
  ) {
    await tx.run(
      "INSERT INTO sms_outbox (id, patient_id, code, context, created_at, next_attempt_at, dedupe_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id("sms"), patientId, code, "{}", now(), now(), eventId],
    );
  }
}
export async function createPatient(tx: DB, req: Req, input: unknown) {
  const data = parse(profileSchema, input);
  if (await tx.get("SELECT id FROM patients WHERE phone = ?", [data.phone]))
    fail("PATIENT_EXISTS", 409);
  const patientId = id("pat");
  const mrn = `CC-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const fields = Object.keys(data);
  await tx.run(
    `INSERT INTO patients (id, mrn, ${fields.join(",")}) VALUES (?, ?, ${fields.map(() => "?").join(",")})`,
    [patientId, mrn, ...Object.values(data)],
  );
  await audit(tx, req, "PATIENT_REGISTERED", patientId, {
    resource: patientId,
  });
  return (await tx.get<Patient>("SELECT * FROM patients WHERE id = ?", [
    patientId,
  ]))!;
}
export const endpoint =
  (fn: (req: Req, res: Response) => Promise<unknown>): RequestHandler =>
  async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      await fn(req as Req, res);
    } catch (error) {
      const err = error as { code?: string; status?: number; message?: string };
      if (err.code === "23505" || err.code === "SQLITE_CONSTRAINT")
        return next({ status: 409, code: "CONFLICT", message: "CONFLICT" });
      if (err.status && (req as Req).user)
        await audit(
          db,
          req as Req,
          "OPD_REQUEST_DENIED",
          null,
          { path: req.path, code: err.code },
          "denied",
        ).catch(() => {});
      next(error);
    }
  };
