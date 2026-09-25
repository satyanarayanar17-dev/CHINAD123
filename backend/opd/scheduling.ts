import { z } from "zod";
import {
  db,
  transaction,
  parse,
  text,
  date,
  now,
  day,
  id,
  fail,
  roles,
  actor,
  patientAccess,
  pilotDepartment,
  enforcePilotDepartment,
  event,
  audit,
} from "./core.ts";
import type { DB, Req } from "./core.ts";
import type {
  Appointment,
  Schedule,
  Slot,
  QueueEntry,
  Department,
  Staff,
} from "../../src/opd/types.ts";

const appointmentSelect = `SELECT a.*, p.name AS patient_name, p.mrn, p.dob, p.gender, u.name AS doctor_name, d.name AS department_name, q.token, q.status AS queue_status FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=a.doctor_id JOIN departments d ON d.id=a.department_id LEFT JOIN queue_entries q ON q.appointment_id=a.id`;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const scheduleSchema = z
  .object({
    doctor_id: text,
    department_id: text,
    weekday: z.number().int().min(0).max(6),
    start_time: time,
    end_time: time,
    slot_minutes: z.number().int().min(5).max(120),
    room: text.max(60),
    break_start: time.nullable().default(null),
    break_end: time.nullable().default(null),
  })
  .refine(
    (v) =>
      v.start_time < v.end_time &&
      ((!v.break_start && !v.break_end) ||
        (v.break_start &&
          v.break_end &&
          v.break_start >= v.start_time &&
          v.break_end <= v.end_time &&
          v.break_start < v.break_end)),
  );
const bookingSchema = z.object({
  patient_id: text.optional(),
  doctor_id: text,
  scheduled_at: z.iso.datetime(),
  reason: text.max(1000),
});

async function doctorLock(tx: DB, doctorId: string) {
  const doc = await tx.get<Staff>(
    `SELECT * FROM users WHERE id=? AND role='DOCTOR' AND is_active=1${tx.dialect === "postgres" ? " FOR UPDATE" : ""}`,
    [doctorId],
  );
  if (!doc) fail("DOCTOR_UNAVAILABLE", 409);
  return doc!;
}
export async function slots(
  doctorId: string,
  requestedDay: string,
  tx = db,
  excludeAppointment = "",
): Promise<Slot[]> {
  parse(date, requestedDay);
  const requested = new Date(`${requestedDay}T00:00:00+05:30`);
  if (requestedDay < day() || requested.getTime() > Date.now() + 181 * 86400000)
    return [];
  if (
    await tx.get(
      "SELECT id FROM practitioner_unavailability WHERE doctor_id=? AND date=?",
      [doctorId, requestedDay],
    )
  )
    return [];
  const doctor = await tx.get<Staff>(
    "SELECT * FROM users WHERE id=? AND role='DOCTOR' AND is_active=1",
    [doctorId],
  );
  if (!doctor) return [];
  const pilot = await pilotDepartment(tx);
  if (pilot && doctor.department !== pilot.name) return [];
  const weekday = new Date(`${requestedDay}T12:00:00Z`).getUTCDay();
  const schedule = await tx.get<Schedule>(
    "SELECT * FROM practitioner_schedules WHERE doctor_id=? AND weekday=?",
    [doctorId, weekday],
  );
  if (!schedule) return [];
  if (pilot && schedule.department_id !== pilot.id) return [];
  const occupied = await tx.all<Appointment>(
    "SELECT * FROM appointments WHERE doctor_id=? AND status NOT IN ('CANCELLED','NO_SHOW') AND id != ?",
    [doctorId, excludeAppointment],
  );
  const minute = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  const result: Slot[] = [];
  for (
    let m = minute(schedule.start_time);
    m + schedule.slot_minutes <= minute(schedule.end_time);
    m += schedule.slot_minutes
  ) {
    if (
      schedule.break_start &&
      schedule.break_end &&
      m < minute(schedule.break_end) &&
      m + schedule.slot_minutes > minute(schedule.break_start)
    )
      continue;
    const start = new Date(requested.getTime() + m * 60000).toISOString();
    const end = new Date(
      requested.getTime() + (m + schedule.slot_minutes) * 60000,
    ).toISOString();
    if (new Date(start).getTime() <= Date.now()) continue;
    if (occupied.some((a) => a.scheduled_at < end && a.ends_at > start))
      continue;
    result.push({
      scheduled_at: start,
      ends_at: end,
      room: schedule.room,
      department_id: schedule.department_id,
    });
  }
  return result;
}
export async function saveSchedule(req: Req) {
  roles(req, ["ADMIN", "DOCTOR"]);
  const value = parse(scheduleSchema, req.body);
  if (req.user.role === "DOCTOR" && req.user.id !== value.doctor_id) fail("UNAUTHORIZED", 403);
  return transaction(async (tx) => {
    await doctorLock(tx, value.doctor_id);
    await enforcePilotDepartment(tx, value.department_id);
    const existing = await tx.get<Schedule>(
      "SELECT * FROM practitioner_schedules WHERE doctor_id=? AND weekday=?",
      [value.doctor_id, value.weekday],
    );
    if (existing && existing.__v !== req.body.__v) fail("STALE_STATE", 409);
    // Existing bookings retain their room and duration; overlap protection applies to future bookings.
    if (existing)
      await tx.run(
        "UPDATE practitioner_schedules SET department_id=?,start_time=?,end_time=?,slot_minutes=?,room=?,break_start=?,break_end=?,__v=__v+1 WHERE id=?",
        [
          value.department_id,
          value.start_time,
          value.end_time,
          value.slot_minutes,
          value.room,
          value.break_start,
          value.break_end,
          existing.id,
        ],
      );
    else
      await tx.run(
        "INSERT INTO practitioner_schedules (id,doctor_id,department_id,weekday,start_time,end_time,slot_minutes,room,break_start,break_end) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [
          id("schedule"),
          value.doctor_id,
          value.department_id,
          value.weekday,
          value.start_time,
          value.end_time,
          value.slot_minutes,
          value.room,
          value.break_start,
          value.break_end,
        ],
      );
    await audit(tx, req, "SCHEDULE_CONFIGURED", null, value);
    return { success: true };
  });
}
export async function book(
  tx: DB,
  req: Req,
  input: unknown,
  followUpOf: string | null = null,
) {
  const data = parse(bookingSchema, input);
  const user = await actor(req, tx);
  if (!followUpOf) roles(req, ["ADMIN", "PATIENT"]);
  const patientId = user.role === "PATIENT" ? user.patient_id : data.patient_id;
  if (!patientId) fail("PATIENT_REQUIRED");
  await patientAccess(req, patientId!, tx, false);
  await doctorLock(tx, data.doctor_id);
  // Patient row lock also prevents concurrent overlapping bookings with different doctors.
  if (tx.dialect === "postgres")
    await tx.get("SELECT id FROM patients WHERE id=? FOR UPDATE", [patientId]);
  const offered = await slots(
    data.doctor_id,
    day(new Date(data.scheduled_at)),
    tx,
  );
  const slot = offered.find((s) => s.scheduled_at === data.scheduled_at);
  if (!slot) fail("SLOT_UNAVAILABLE", 409);
  if (
    await tx.get(
      "SELECT id FROM appointments WHERE patient_id=? AND status NOT IN ('CANCELLED','NO_SHOW') AND scheduled_at < ? AND ends_at > ?",
      [patientId, slot!.ends_at, slot!.scheduled_at],
    )
  )
    fail("PATIENT_BOOKING_CONFLICT", 409);
  
  const assignment = await tx.get<{nurse_id: string}>("SELECT nurse_id FROM doctor_nurse_assignments WHERE doctor_id=? LIMIT 1", [data.doctor_id]);
  const assignedNurseId = assignment ? assignment.nurse_id : null;
  const appointmentId = id("apt");
  
  const isDoctor = req.user.role === 'DOCTOR';
  const status = isDoctor ? 'CONFIRMED' : 'PENDING_CONFIRMATION';
  const confirmedAt = isDoctor ? now() : null;
  const confirmedBy = isDoctor ? req.user.id : null;
  const confirmedRole = isDoctor ? req.user.role : null;
  
  await tx.run(
    "INSERT INTO appointments (id,patient_id,doctor_id,department_id,scheduled_at,ends_at,room,status,reason,created_by,created_at,follow_up_of,requested_at,requested_by_patient_id,assigned_nurse_id,confirmed_at,confirmed_by_user_id,confirmed_by_role) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      appointmentId,
      patientId,
      data.doctor_id,
      slot!.department_id,
      slot!.scheduled_at,
      slot!.ends_at,
      slot!.room,
      status,
      data.reason,
      req.user.id,
      now(),
      followUpOf,
      now(),
      patientId,
      assignedNurseId,
      confirmedAt,
      confirmedBy,
      confirmedRole
    ],
  );
  
  let eventType = "APPOINTMENT_REQUESTED";
  if (isDoctor) {
    eventType = followUpOf ? "FOLLOW_UP_BOOKED" : "APPOINTMENT_CONFIRMED";
  }
  
  await event(
    tx,
    req,
    patientId!,
    eventType,
    { scheduled_at: data.scheduled_at },
    followUpOf,
    appointmentId,
  );
  
  // Notify assigned Doctor and Nurse
  const pData = await tx.get<{name: string}>("SELECT name FROM patients WHERE id=?", [patientId]);
  const msg = `${pData!.name} has requested an appointment on ${data.scheduled_at}`;
  await tx.run(
    "INSERT INTO notifications (type,title,body,patient_id,actor_id,target_role,target_user_id,created_at) VALUES ('info','New appointment request',?,?,null,null,?,?)",
    [msg, patientId, data.doctor_id, now()]
  );
  if (assignedNurseId) {
    await tx.run(
      "INSERT INTO notifications (type,title,body,patient_id,actor_id,target_role,target_user_id,created_at) VALUES ('info','New appointment request',?,?,null,null,?,?)",
      [msg, patientId, assignedNurseId, now()]
    );
  }

  return (await tx.get<Appointment>(`${appointmentSelect} WHERE a.id=?`, [
    appointmentId,
  ]))!;
}

export async function confirmRequest(req: Req, appointmentId: string) {
  roles(req, ["ADMIN", "DOCTOR", "NURSE"]);
  return transaction(async (tx) => {
    const user = await actor(req, tx);
    const apt = await tx.get<Appointment>(`${appointmentSelect} WHERE a.id=?`, [appointmentId]);
    if (!apt) fail("NOT_FOUND", 404);
    if (apt.status !== "PENDING_CONFIRMATION") return apt; // Idempotent

    if (user.role === "DOCTOR" && apt.doctor_id !== user.id) fail("UNAUTHORIZED", 403);
    if (user.role === "NURSE" && apt.assigned_nurse_id !== user.id && apt.department_id !== user.department) fail("UNAUTHORIZED", 403);

    const updated = await tx.run(
      "UPDATE appointments SET status='CONFIRMED', confirmed_at=?, confirmed_by_user_id=?, confirmed_by_role=?, __v=__v+1 WHERE id=? AND status='PENDING_CONFIRMATION' AND __v=?",
      [now(), user.id, user.role, appointmentId, apt.__v]
    );

    if (!updated.changes) return (await tx.get<Appointment>(`${appointmentSelect} WHERE a.id=?`, [appointmentId]))!;

    await event(tx, req, apt.patient_id, "APPOINTMENT_CONFIRMED", {}, null, appointmentId);
    return (await tx.get<Appointment>(`${appointmentSelect} WHERE a.id=?`, [appointmentId]))!;
  });
}
export async function appointments(req: Req, dateOverride?: string) {
  const user = await actor(req);
  let where = "1=1";
  const values: unknown[] = [];
  if (user.role === "PATIENT") {
    where = "a.patient_id=?";
    values.push(user.patient_id);
  }
  if (user.role === "DOCTOR") {
    where = "a.doctor_id=?";
    values.push(user.id);
  }
  if (user.role === "NURSE") {
    where = "d.name=?";
    values.push(user.department);
  }
  const pilot = await pilotDepartment(db);
  if (pilot) {
    where += " AND a.department_id=?";
    values.push(pilot.id);
  }
  const requestedDate = dateOverride || req.query.date;
  if (typeof requestedDate === "string") {
    parse(date, requestedDate);
    where += " AND a.scheduled_at >= ? AND a.scheduled_at < ?";
    const start = new Date(`${requestedDate}T00:00:00+05:30`);
    values.push(
      start.toISOString(),
      new Date(start.getTime() + 86400000).toISOString(),
    );
  }
  const limit = Math.min(parseInt(String(req.query?.limit)) || 500, 1000);
  const offset = parseInt(String(req.query?.offset)) || 0;
  return db.all<Appointment>(
    `${appointmentSelect} WHERE ${where} ORDER BY a.scheduled_at DESC, a.id DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  );
}
export async function changeAppointment(req: Req, action: string) {
  roles(req, ["ADMIN", "PATIENT"]);
  const version = parse(z.number().int().positive(), req.body.__v);
  return transaction(async (tx) => {
    const apt = await tx.get<Appointment>(
      "SELECT * FROM appointments WHERE id=?",
      [req.params.id],
    );
    if (!apt) fail("NOT_FOUND", 404);
    await patientAccess(req, apt!.patient_id, tx, false);
    await doctorLock(tx, apt!.doctor_id);
    if (apt!.__v !== version) fail("STALE_STATE", 409);
    if (apt!.status !== "CONFIRMED" && apt!.status !== "PENDING_CONFIRMATION") fail("APPOINTMENT_LOCKED", 409);
    if (action === "reschedule") {
      const requested = parse(z.iso.datetime(), req.body.scheduled_at);
      const offered = await slots(
        apt!.doctor_id,
        day(new Date(requested)),
        tx,
        apt!.id,
      );
      const slot = offered.find((s) => s.scheduled_at === requested);
      if (!slot) fail("SLOT_UNAVAILABLE", 409);
      if (tx.dialect === "postgres")
        await tx.get("SELECT id FROM patients WHERE id=? FOR UPDATE", [
          apt!.patient_id,
        ]);
      if (
        await tx.get(
          "SELECT id FROM appointments WHERE patient_id=? AND id!=? AND status NOT IN ('CANCELLED','NO_SHOW') AND scheduled_at < ? AND ends_at > ?",
          [apt!.patient_id, apt!.id, slot!.ends_at, requested],
        )
      )
        fail("PATIENT_BOOKING_CONFLICT", 409);
      const updated = await tx.run(
        "UPDATE appointments SET scheduled_at=?,ends_at=?,room=?,department_id=?,__v=__v+1 WHERE id=? AND __v=?",
        [
          requested,
          slot!.ends_at,
          slot!.room,
          slot!.department_id,
          apt!.id,
          version,
        ],
      );
      if (!updated.changes) fail("STALE_STATE", 409);
      await event(
        tx,
        req,
        apt!.patient_id,
        "APPOINTMENT_RESCHEDULED",
        { scheduled_at: requested },
        null,
        apt!.id,
      );
    } else {
      if (!["cancel", "no-show"].includes(action)) fail("INVALID_ACTION");
      if (action === "no-show") {
        roles(req, ["ADMIN"]);
        if (new Date(apt!.ends_at).getTime() > Date.now())
          fail("APPOINTMENT_NOT_DUE");
      }
      const updated = await tx.run(
        "UPDATE appointments SET status=?,__v=__v+1 WHERE id=? AND __v=?",
        [action === "cancel" ? "CANCELLED" : "NO_SHOW", apt!.id, version],
      );
      if (!updated.changes) fail("STALE_STATE", 409);
      await event(
        tx,
        req,
        apt!.patient_id,
        action === "cancel" ? "APPOINTMENT_CANCELLED" : "NO_SHOW",
        {},
        null,
        apt!.id,
      );
    }
    return { success: true };
  });
}
export async function checkIn(req: Req) {
  roles(req, ["ADMIN", "DOCTOR"]);
  if (req.body.identity_verified !== true) fail("VERIFY_IDENTITY");
  return transaction(async (tx) => {
    const apt = await tx.get<Appointment>(
      `SELECT * FROM appointments WHERE id=?${tx.dialect === "postgres" ? " FOR UPDATE" : ""}`,
      [req.params.id],
    );
    if (!apt) fail("NOT_FOUND", 404);
    await enforcePilotDepartment(tx, apt!.department_id);
    if (apt!.status === "CHECKED_IN")
      return tx.get<QueueEntry>(
        "SELECT * FROM queue_entries WHERE appointment_id=?",
        [apt!.id],
      );
    if (
      apt!.status !== "CONFIRMED" ||
      day(new Date(apt!.scheduled_at)) !== day()
    )
      fail("CHECK_IN_NOT_AVAILABLE", 409);
    if (tx.dialect === "postgres")
      await tx.get("SELECT id FROM patients WHERE id=? FOR UPDATE", [
        apt!.patient_id,
      ]);
    if (
      await tx.get(
        "SELECT id FROM encounters WHERE patient_id=? AND is_discharged=0",
        [apt!.patient_id],
      )
    )
      fail("ACTIVE_ENCOUNTER_EXISTS", 409);
    const encounterId = id("enc");
    await tx.run(
      "INSERT INTO encounters (id,patient_id,phase,lifecycle_status,assigned_doctor_id,created_at) VALUES (?,?,'RECEPTION','RECEPTION',?,?)",
      [encounterId, apt!.patient_id, apt!.doctor_id, now()],
    );
    await tx.run(
      "INSERT INTO token_counters (department_id,date,value) VALUES (?,?,1) ON CONFLICT(department_id,date) DO UPDATE SET value=token_counters.value+1",
      [apt!.department_id, day()],
    );
    const counter = await tx.get<{ value: number }>(
      "SELECT value FROM token_counters WHERE department_id=? AND date=?",
      [apt!.department_id, day()],
    );
    const department = await tx.get<Department>(
      "SELECT * FROM departments WHERE id=?",
      [apt!.department_id],
    );
    const token = `${department!.prefix}-${String(counter!.value).padStart(3, "0")}`;
    await tx.run(
      "INSERT INTO queue_entries (encounter_id,appointment_id,department_id,token,date,status,checked_in_at,checked_in_by,identity_verified) VALUES (?,?,?,?,?,'WAITING',?,?,1)",
      [
        encounterId,
        apt!.id,
        apt!.department_id,
        token,
        day(),
        now(),
        req.user.id,
      ],
    );
    const updated = await tx.run(
      "UPDATE appointments SET status='CHECKED_IN',encounter_id=?,__v=__v+1 WHERE id=? AND __v=?",
      [encounterId, apt!.id, apt!.__v],
    );
    if (!updated.changes) fail("STALE_STATE", 409);
    await event(
      tx,
      req,
      apt!.patient_id,
      "CHECKED_IN",
      {},
      encounterId,
      apt!.id,
    );
    await event(
      tx,
      req,
      apt!.patient_id,
      "TOKEN_ISSUED",
      { token },
      encounterId,
      apt!.id,
    );
    return tx.get<QueueEntry>(
      "SELECT * FROM queue_entries WHERE encounter_id=?",
      [encounterId],
    );
  });
}
export async function queue(req: Req): Promise<QueueEntry[]> {
  const user = await actor(req);
  const pilot = await pilotDepartment(db);
  // Compute positions against the whole doctor queue before scoping returned identities.
  const all = await db.all<QueueEntry & { ends_at: string }>(
    `SELECT q.*, e.patient_id, p.name AS patient_name,p.mrn,p.dob,p.gender,e.chief_complaint,a.doctor_id,u.name AS doctor_name,d.name AS department_name,a.room,a.scheduled_at,a.ends_at FROM queue_entries q JOIN encounters e ON e.id=q.encounter_id JOIN patients p ON p.id=e.patient_id JOIN appointments a ON a.id=q.appointment_id JOIN users u ON u.id=a.doctor_id JOIN departments d ON d.id=q.department_id WHERE q.status!='COMPLETED'${pilot ? ' AND q.department_id=?' : ''} ORDER BY CASE q.status WHEN 'CONSULTATION' THEN 0 WHEN 'DOCTOR_READY' THEN 1 ELSE 2 END,q.priority DESC,q.checked_in_at,q.encounter_id`,
    pilot ? [pilot.id] : [],
  );
  const completed = await db.all<{
    doctor_id: string;
    consultation_started_at: string;
    completed_at: string;
  }>(
    `SELECT a.doctor_id,q.consultation_started_at,e.completed_at FROM queue_entries q JOIN encounters e ON e.id=q.encounter_id JOIN appointments a ON a.id=q.appointment_id WHERE q.status='COMPLETED' AND q.date=?${pilot ? ' AND q.department_id=?' : ''}`,
    pilot ? [day(), pilot.id] : [day()],
  );
  return all
    .map((entry, index) => {
      const prior = all
        .slice(0, index)
        .filter((q) => q.doctor_id === entry.doctor_id);
      const observations = completed.filter(
        (c) =>
          c.doctor_id === entry.doctor_id &&
          c.completed_at &&
          c.consultation_started_at,
      );
      const measured = observations.map((c) =>
        Math.max(
          1,
          (new Date(c.completed_at).getTime() -
            new Date(c.consultation_started_at).getTime()) /
            60000,
        ),
      );
      const scheduled = Math.max(1, (new Date(entry.ends_at).getTime() - new Date(entry.scheduled_at).getTime()) / 60000);
      return {
        ...entry,
        patients_ahead: prior.length,
        estimated_wait: Math.ceil(
          prior.length *
            (measured.length
              ? measured.reduce((a, b) => a + b, 0) / measured.length
              : scheduled),
        ),
        wait_minutes: Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(entry.checked_in_at).getTime()) / 60000,
          ),
        ),
      };
    })
    .filter(
      (e) =>
        user.role === "ADMIN" ||
        (user.role === "PATIENT"
          ? e.patient_id === user.patient_id
          : user.role === "DOCTOR"
            ? e.doctor_id === user.id
            : e.department_name === user.department),
    );
}
