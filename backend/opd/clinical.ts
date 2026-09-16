import { createHash } from "node:crypto";
import { z } from "zod";
import {
  db,
  transaction,
  parse,
  text,
  optionalText,
  now,
  id,
  fail,
  roles,
  actor,
  patientAccess,
  encounterAccess,
  event,
  audit,
} from "./core.ts";
import type { DB, Req } from "./core.ts";
import type {
  QueueEntry,
  TriageRecord,
  ConsultationData,
  Note,
  Prescription,
  Drug,
  Diagnosis,
  LabOrder,
  LabResult,
  Encounter,
  RecordBundle,
  JourneyEvent,
} from "../../src/opd/types.ts";
import { book } from "./scheduling.ts";

export const triageSchema = z
  .object({
    temperature: z.number().min(25).max(45),
    systolic: z.number().int().min(40).max(300),
    diastolic: z.number().int().min(20).max(200),
    pulse: z.number().int().min(20).max(250),
    spo2: z.number().min(1).max(100),
    weight: z.number().min(0.5).max(500),
    height: z.number().min(20).max(250),
    glucose: z.number().positive().max(1500).nullable().optional(),
    complaint: text.max(2000),
    allergies: optionalText,
    pain: z.number().int().min(0).max(10),
    notes: optionalText,
    priority: z.number().int().min(0).max(2),
  })
  .refine((v) => v.systolic > v.diastolic);
export const consultationSchema = z.object({
  complaint: optionalText,
  history: optionalText,
  previous_history: optionalText,
  examination: optionalText,
  assessment: optionalText,
  diagnosis_ids: z.array(text).max(20),
  treatment: optionalText,
  advice: optionalText,
  medications: z
    .array(
      z.object({
        drug_id: text,
        dose: text.max(100),
        frequency: text.max(100),
        duration: text.max(100),
        instructions: optionalText,
      }),
    )
    .max(30),
  follow_up: z
    .object({ doctor_id: text, scheduled_at: z.iso.datetime(), reason: text })
    .nullable()
    .optional(),
});

async function queueWrite(tx: DB, req: Req) {
  const encounter = await encounterAccess(req, String(req.params.id), tx);
  const q = await tx.get<QueueEntry>(
    `SELECT * FROM queue_entries WHERE encounter_id=?${tx.dialect === "postgres" ? " FOR UPDATE" : ""}`,
    [req.params.id],
  );
  if (!q) fail("NOT_FOUND", 404);
  if (req.body.__v !== q!.__v) fail("STALE_STATE", 409);
  if (encounter.is_discharged) fail("ENCOUNTER_COMPLETED", 409);
  return { q: q!, encounter };
}
export async function transition(
  req: Req,
  target: "TRIAGE" | "DOCTOR_READY" | "CONSULTATION",
) {
  roles(req, target === "TRIAGE" ? ["NURSE"] : ["DOCTOR"]);
  return transaction(async (tx) => {
    const { q, encounter } = await queueWrite(tx, req);
    if (
      req.user.role === "DOCTOR" &&
      encounter.assigned_doctor_id !== req.user.id
    )
      fail("NOT_ASSIGNED", 403);
    const permitted =
      target === "TRIAGE"
        ? ["WAITING"]
        : target === "DOCTOR_READY"
          ? ["WAITING_DOCTOR"]
          : ["WAITING_DOCTOR", "DOCTOR_READY"];
    if (!permitted.includes(q.status)) fail("INVALID_TRANSITION", 409);
    if (target === "CONSULTATION") {
      if (tx.dialect === "postgres")
        await tx.get("SELECT id FROM users WHERE id=? FOR UPDATE", [
          req.user.id,
        ]);
      if (
        await tx.get(
          "SELECT q.encounter_id FROM queue_entries q JOIN encounters e ON e.id=q.encounter_id WHERE e.assigned_doctor_id=? AND q.status='CONSULTATION'",
          [req.user.id],
        )
      )
        fail("CONSULTATION_IN_PROGRESS", 409);
    }
    const column =
      target === "TRIAGE"
        ? ",triage_started_at=?"
        : target === "CONSULTATION"
          ? ",consultation_started_at=?"
          : "";
    const values: unknown[] = [target];
    if (column) values.push(now());
    values.push(q.encounter_id, q.__v);
    const updated = await tx.run(
      `UPDATE queue_entries SET status=?,__v=__v+1${column} WHERE encounter_id=? AND __v=?`,
      values,
    );
    if (!updated.changes) fail("STALE_STATE", 409);
    if (target === "CONSULTATION")
      await tx.run(
        "UPDATE encounters SET phase='IN_CONSULTATION',lifecycle_status='IN_CONSULTATION',__v=__v+1 WHERE id=?",
        [encounter.id],
      );
    await event(
      tx,
      req,
      encounter.patient_id,
      target === "TRIAGE"
        ? "TRIAGE_STARTED"
        : target === "CONSULTATION"
          ? "CONSULTATION_STARTED"
          : "DOCTOR_READY",
      { token: q.token },
      encounter.id,
      q!.appointment_id,
    );
    return { success: true };
  });
}
export async function triage(req: Req) {
  roles(req, ["NURSE"]);
  const value = parse(triageSchema, req.body.data);
  return transaction(async (tx) => {
    const { q, encounter } = await queueWrite(tx, req);
    if (!["TRIAGE", "WAITING_DOCTOR"].includes(q.status))
      fail("INVALID_TRANSITION", 409);
    const previous = await tx.get<TriageRecord>(
      "SELECT * FROM triage_records WHERE encounter_id=? ORDER BY version DESC LIMIT 1",
      [encounter.id],
    );
    const reason = previous ? parse(text, req.body.reason) : "";
    const data = {
      ...value,
      bmi: Number((value.weight / (value.height / 100) ** 2).toFixed(1)),
    };
    await tx.run(
      "INSERT INTO triage_records (id,encounter_id,version,data,nurse_id,created_at,amendment_reason) VALUES (?,?,?,?,?,?,?)",
      [
        id("triage"),
        encounter.id,
        (previous?.version || 0) + 1,
        JSON.stringify(data),
        req.user.id,
        now(),
        reason,
      ],
    );
    const changed = await tx.run(
      "UPDATE queue_entries SET status='WAITING_DOCTOR',priority=?,__v=__v+1 WHERE encounter_id=? AND __v=?",
      [data.priority, encounter.id, q.__v],
    );
    if (!changed.changes) fail("STALE_STATE", 409);
    await tx.run(
      "UPDATE encounters SET chief_complaint=?,triage_vitals_json=?,triaged_by=?,triaged_at=?,__v=__v+1 WHERE id=?",
      [
        data.complaint,
        JSON.stringify({
          height: data.height,
          weight: data.weight,
          systolic: data.systolic,
          diastolic: data.diastolic,
          hr: data.pulse,
          temp: data.temperature,
          spo2: data.spo2,
        }),
        req.user.id,
        now(),
        encounter.id,
      ],
    );
    await tx.run("UPDATE patients SET allergies=?,__v=__v+1 WHERE id=?", [
      data.allergies,
      encounter.patient_id,
    ]);
    await event(
      tx,
      req,
      encounter.patient_id,
      previous ? "TRIAGE_AMENDED" : "TRIAGE_COMPLETED",
      { version: (previous?.version || 0) + 1, reason },
      encounter.id,
      q!.appointment_id,
    );
    await tx.run(
      "INSERT INTO opd_notifications (id,user_id,patient_id,code,context,created_at) VALUES (?,?,?,?,?,?)",
      [
        id("notice"),
        encounter.assigned_doctor_id,
        encounter.patient_id,
        "TRIAGE_COMPLETED",
        JSON.stringify({ token: q.token }),
        now(),
      ],
    );
    return { success: true };
  });
}
async function enrich(tx: DB, data: ConsultationData) {
  const diagnoses: Diagnosis[] = [];
  for (const diagnosisId of [...new Set(data.diagnosis_ids)]) {
    const diagnosis = await tx.get<Diagnosis>(
      "SELECT * FROM diagnosis_catalog WHERE id=?",
      [diagnosisId],
    );
    if (!diagnosis) fail("INVALID_DIAGNOSIS");
    diagnoses.push(diagnosis!);
  }
  const medications: ConsultationData["medications"] = [];
  for (const medication of data.medications) {
    const drug = await tx.get<Drug>(
      "SELECT * FROM drug_catalog WHERE id=? AND active=1",
      [medication.drug_id],
    );
    if (!drug) fail("INVALID_DRUG");
    medications.push({
      ...medication,
      name: drug!.name,
      strength: drug!.strength,
      form: drug!.form,
      route: drug!.route,
    });
  }
  return { ...data, diagnoses, medications };
}
async function snapshot(
  tx: DB,
  req: Req,
  type: string,
  resourceId: string,
  encounterId: string,
  version: number,
  data: unknown,
  reason: string,
) {
  await tx.run(
    "INSERT INTO clinical_versions (id,resource_type,resource_id,encounter_id,version,data,actor_id,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [
      id("version"),
      type,
      resourceId,
      encounterId,
      version,
      JSON.stringify(data),
      req.user.id,
      reason,
      now(),
    ],
  );
}
export async function saveConsultation(req: Req, complete: boolean) {
  roles(req, ["DOCTOR"]);
  const value = parse(consultationSchema, req.body.data);
  if (
    complete &&
    (!value.history ||
      !value.examination ||
      !value.assessment ||
      !value.diagnosis_ids.length ||
      !value.advice)
  )
    fail("CONSULTATION_INCOMPLETE");
  return transaction(async (tx) => {
    const encounter = await encounterAccess(
      req,
      String(req.params.id),
      tx,
      true,
    );
    if (tx.dialect === "postgres")
      await tx.get("SELECT id FROM encounters WHERE id=? FOR UPDATE", [
        encounter.id,
      ]);
    const q = await tx.get<QueueEntry>(
      "SELECT * FROM queue_entries WHERE encounter_id=?",
      [encounter.id],
    );
    if (q?.status !== "CONSULTATION") fail("CONSULTATION_NOT_STARTED", 409);
    const existing = await tx.get<Note>(
      "SELECT * FROM clinical_notes WHERE encounter_id=? ORDER BY created_at DESC LIMIT 1",
      [encounter.id],
    );
    if ((existing?.__v || 0) !== req.body.__v) fail("STALE_STATE", 409);
    if (existing?.status === "FINALIZED") fail("ENCOUNTER_COMPLETED", 409);
    const data = await enrich(tx, value);
    const noteId = existing?.id || id("note");
    const version = (existing?.__v || 0) + 1;
    if (existing) {
      const changed = await tx.run(
        "UPDATE clinical_notes SET draft_content=?,status=?,updated_at=?,__v=__v+1 WHERE id=? AND __v=?",
        [
          JSON.stringify(data),
          complete ? "FINALIZED" : "DRAFT",
          now(),
          noteId,
          existing.__v,
        ],
      );
      if (!changed.changes) fail("STALE_STATE", 409);
    } else
      await tx.run(
        "INSERT INTO clinical_notes (id,encounter_id,draft_content,status,author_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
        [
          noteId,
          encounter.id,
          JSON.stringify(data),
          complete ? "FINALIZED" : "DRAFT",
          req.user.id,
          now(),
          now(),
        ],
      );
    await snapshot(
      tx,
      req,
      "NOTE",
      noteId,
      encounter.id,
      version,
      data,
      complete ? "FINALIZED" : "DRAFT_SAVED",
    );
    await event(
      tx,
      req,
      encounter.patient_id,
      complete ? "DIAGNOSIS_RECORDED" : "CONSULTATION_SAVED",
      { version },
      encounter.id,
      q!.appointment_id,
    );
    if (complete) {
      let followUp = null;
      if (data.follow_up)
        followUp = await book(
          tx,
          req,
          { ...data.follow_up, patient_id: encounter.patient_id },
          encounter.id,
        );
      const rxId = id("rx");
      const issuedAt = now();
      const prescription = {
        medications: data.medications,
        diagnoses: data.diagnoses,
        advice: data.advice,
        follow_up: followUp,
        validation: {
          issued_at: issuedAt,
          signed_by: req.user.id,
          sha256: createHash("sha256")
            .update(
              JSON.stringify({
                encounter: encounter.id,
                doctor: req.user.id,
                issuedAt,
                data,
              }),
            )
            .digest("hex"),
        },
      };
      await tx.run(
        "INSERT INTO prescriptions (id,encounter_id,rx_content,status,authorizing_user_id,created_at) VALUES (?,?,?,'AUTHORIZED',?,?)",
        [
          rxId,
          encounter.id,
          JSON.stringify(prescription),
          req.user.id,
          issuedAt,
        ],
      );
      await snapshot(
        tx,
        req,
        "PRESCRIPTION",
        rxId,
        encounter.id,
        1,
        prescription,
        "ISSUED",
      );
      await event(
        tx,
        req,
        encounter.patient_id,
        "PRESCRIPTION_ISSUED",
        { prescription_id: rxId },
        encounter.id,
        q!.appointment_id,
      );
      await tx.run(
        "UPDATE queue_entries SET status='COMPLETED',__v=__v+1 WHERE encounter_id=?",
        [encounter.id],
      );
      await tx.run(
        "UPDATE appointments SET status='COMPLETED',__v=__v+1 WHERE id=?",
        [q!.appointment_id],
      );
      await tx.run(
        "UPDATE encounters SET phase='DISCHARGED',lifecycle_status='DISCHARGED',is_discharged=1,completed_at=?,__v=__v+1 WHERE id=?",
        [now(), encounter.id],
      );
      await event(
        tx,
        req,
        encounter.patient_id,
        "CONSULTATION_COMPLETED",
        {},
        encounter.id,
        q!.appointment_id,
      );
    }
    return { id: noteId, __v: version };
  });
}
export async function amend(req: Req) {
  roles(req, ["DOCTOR"]);
  const reason = parse(text, req.body.reason);
  const value = parse(consultationSchema, req.body.data);
  return transaction(async (tx) => {
    const encounter = await encounterAccess(req, String(req.params.id), tx);
    if (
      encounter.assigned_doctor_id !== req.user.id ||
      !encounter.is_discharged
    )
      fail("AMENDMENT_NOT_ALLOWED", 403);
    if (tx.dialect === "postgres")
      await tx.get("SELECT id FROM encounters WHERE id=? FOR UPDATE", [
        encounter.id,
      ]);
    const note = await tx.get<Note>(
      "SELECT * FROM clinical_notes WHERE encounter_id=? AND status=? ORDER BY created_at DESC LIMIT 1",
      [encounter.id, "FINALIZED"],
    );
    if (!note || note.__v !== req.body.__v) fail("STALE_STATE", 409);
    if (
      !value.diagnosis_ids.length ||
      !value.history ||
      !value.examination ||
      !value.assessment ||
      !value.advice
    )
      fail("CONSULTATION_INCOMPLETE");
    const original = JSON.parse(note!.draft_content as unknown as string) as ConsultationData;
    if (JSON.stringify(value.follow_up ?? null) !== JSON.stringify(original.follow_up ?? null))
      fail("FOLLOW_UP_AMENDMENT", 409);
    const data = await enrich(tx, value);
    // Append a version; signed source content remains immutable.
    await snapshot(
      tx,
      req,
      "NOTE",
      note!.id,
      encounter.id,
      note!.__v + 1,
      data,
      reason,
    );
    await tx.run("UPDATE clinical_notes SET __v=__v+1 WHERE id=? AND __v=?", [
      note!.id,
      note!.__v,
    ]);
    const rx = await tx.get<Prescription>(
      "SELECT * FROM prescriptions WHERE encounter_id=? ORDER BY created_at DESC LIMIT 1",
      [encounter.id],
    );
    if (rx) {
      const issuedAt = now();
      const content = {
        medications: data.medications,
        diagnoses: data.diagnoses,
        advice: data.advice,
        follow_up: JSON.parse(rx.rx_content as unknown as string).follow_up,
        validation: {
          issued_at: issuedAt,
          signed_by: req.user.id,
          sha256: createHash("sha256")
            .update(JSON.stringify(data) + issuedAt)
            .digest("hex"),
        },
      };
      await snapshot(
        tx,
        req,
        "PRESCRIPTION",
        rx.id,
        encounter.id,
        rx.__v + 1,
        content,
        reason,
      );
      await tx.run("UPDATE prescriptions SET __v=__v+1 WHERE id=? AND __v=?", [
        rx.id,
        rx.__v,
      ]);
    }
    await event(
      tx,
      req,
      encounter.patient_id,
      "CONSULTATION_AMENDED",
      { reason, version: note!.__v + 1 },
      encounter.id,
    );
    return { success: true };
  });
}
export async function orderLab(req: Req) {
  roles(req, ["DOCTOR"]);
  const testId = parse(text, req.body.test_id);
  return transaction(async (tx) => {
    const encounter = await encounterAccess(
      req,
      String(req.params.id),
      tx,
      true,
    );
    const q = await tx.get<QueueEntry>(
      "SELECT * FROM queue_entries WHERE encounter_id=?",
      [encounter.id],
    );
    if (q?.status !== "CONSULTATION") fail("CONSULTATION_NOT_STARTED", 409);
    const test = await tx.get<{ name: string }>(
      "SELECT name FROM lab_test_catalog WHERE id=? AND active=1",
      [testId],
    );
    if (!test) fail("INVALID_TEST");
    if (tx.dialect === "postgres")
      await tx.get("SELECT id FROM encounters WHERE id=? FOR UPDATE", [
        encounter.id,
      ]);
    if (
      await tx.get(
        "SELECT id FROM lab_orders WHERE encounter_id=? AND test_id=?",
        [encounter.id, testId],
      )
    )
      fail("TEST_ALREADY_ORDERED", 409);
    const orderId = id("lab");
    await tx.run(
      "INSERT INTO lab_orders (id,encounter_id,test_id,ordered_by,ordered_at,status) VALUES (?,?,?,?,?,'ORDERED')",
      [orderId, encounter.id, testId, req.user.id, now()],
    );
    await event(
      tx,
      req,
      encounter.patient_id,
      "LAB_ORDERED",
      { test: test!.name, order_id: orderId },
      encounter.id,
    );
    return { id: orderId };
  });
}
export async function labs(
  req: Req,
  patientId?: string,
  tx = db,
): Promise<LabOrder[]> {
  const user = await actor(req, tx);
  const params: unknown[] = [];
  let where = "1=1";
  if (patientId) {
    where += " AND e.patient_id=?";
    params.push(patientId);
  }
  if (user.role === "PATIENT") {
    where += " AND e.patient_id=?";
    params.push(user.patient_id);
  }
  if (user.role === "DOCTOR") {
    where += " AND e.assigned_doctor_id=?";
    params.push(user.id);
  }
  if (user.role === "NURSE") fail("FORBIDDEN_ROLE", 403);
  const rows = await tx.all<LabOrder>(
    `SELECT l.*,e.patient_id,p.name AS patient_name,t.name,t.code,t.unit,t.reference_range FROM lab_orders l JOIN encounters e ON e.id=l.encounter_id JOIN patients p ON p.id=e.patient_id JOIN lab_test_catalog t ON t.id=l.test_id WHERE ${where} ORDER BY l.ordered_at DESC LIMIT 500`,
    params,
  );
  for (const row of rows) {
    row.result =
      (await tx.get<LabResult>(
        `SELECT r.*,u.name AS entered_name,v.name AS verified_name FROM lab_results r JOIN users u ON u.id=r.entered_by JOIN users v ON v.id=r.verified_by WHERE r.order_id=? ${user.role === "PATIENT" ? "AND r.released=1" : ""} ORDER BY r.version DESC LIMIT 1`,
        [row.id],
      )) || null;
  }
  return rows;
}
export async function changeLab(req: Req, action: string) {
  roles(req, action === "review" ? ["DOCTOR"] : ["ADMIN"]);
  return transaction(async (tx) => {
    const lab = await tx.get<
      LabOrder & { patient_id: string; assigned_doctor_id: string }
    >(
      `SELECT l.*,e.patient_id,e.assigned_doctor_id FROM lab_orders l JOIN encounters e ON e.id=l.encounter_id WHERE l.id=?${tx.dialect === "postgres" ? " FOR UPDATE OF l" : ""}`,
      [req.params.id],
    );
    if (!lab) fail("NOT_FOUND", 404);
    if (req.body.__v !== lab!.__v) fail("STALE_STATE", 409);
    let status: LabOrder["status"];
    let code: string;
    if (action === "collect" && lab!.status === "ORDERED") {
      status = "COLLECTED";
      code = "SAMPLE_COLLECTED";
    } else if (action === "process" && lab!.status === "COLLECTED") {
      status = "PROCESSING";
      code = "LAB_PROCESSING";
    } else if (
      action === "result" &&
      ["PROCESSING", "AVAILABLE", "REVIEWED"].includes(lab!.status)
    ) {
      const result = parse(
        z.object({
          value: text,
          unit: z.string().trim().max(60),
          reference_range: text,
          flag: z.enum(["NORMAL", "HIGH", "LOW", "CRITICAL"]),
          verified: z.literal(true),
          released: z.boolean(),
          reason: text,
        }),
        req.body.data,
      );
      const previous = await tx.get<LabResult>(
        "SELECT * FROM lab_results WHERE order_id=? ORDER BY version DESC LIMIT 1",
        [lab!.id],
      );
      await tx.run(
        "INSERT INTO lab_results (id,order_id,version,value,unit,reference_range,flag,entered_by,verified_by,resulted_at,released,reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          id("result"),
          lab!.id,
          (previous?.version || 0) + 1,
          result.value,
          result.unit,
          result.reference_range,
          result.flag,
          req.user.id,
          req.user.id,
          now(),
          result.released ? 1 : 0,
          result.reason,
        ],
      );
      status = "AVAILABLE";
      code = result.released ? "RESULT_RELEASED" : "RESULT_RECORDED";
      await tx.run(
        "INSERT INTO opd_notifications (id,user_id,patient_id,code,context,created_at) VALUES (?,?,?,?,?,?)",
        [
          id("notice"),
          lab!.assigned_doctor_id,
          lab!.patient_id,
          code,
          JSON.stringify({ order_id: lab!.id, flag: result.flag }),
          now(),
        ],
      );
    } else if (action === "review" && lab!.status === "AVAILABLE") {
      if (lab!.assigned_doctor_id !== req.user.id) fail("NOT_ASSIGNED", 403);
      const result = await tx.get<LabResult>(
        "SELECT * FROM lab_results WHERE order_id=? ORDER BY version DESC LIMIT 1",
        [lab!.id],
      );
      if (!result) fail("NOT_FOUND", 404);
      await tx.run(
        "UPDATE lab_results SET reviewed_by=?,reviewed_at=? WHERE id=?",
        [req.user.id, now(), result!.id],
      );
      status = "REVIEWED";
      code = "RESULT_REVIEWED";
    } else fail("INVALID_TRANSITION", 409);
    const changed = await tx.run(
      "UPDATE lab_orders SET status=?,__v=__v+1 WHERE id=? AND __v=?",
      [status!, lab!.id, lab!.__v],
    );
    if (!changed.changes) fail("STALE_STATE", 409);
    await event(
      tx,
      req,
      lab!.patient_id,
      code!,
      { order_id: lab!.id },
      lab!.encounter_id,
    );
    return { success: true };
  });
}
export async function record(
  req: Req,
  patientId: string,
): Promise<RecordBundle> {
  const patient = await patientAccess(req, patientId);
  await audit(db, req, "PATIENT_RECORD_ACCESSED", patientId, {
    resource: patientId,
  });
  const encounters = await db.all<Encounter>(
    `SELECT e.*,u.name AS doctor_name,q.status AS queue_status FROM encounters e LEFT JOIN users u ON u.id=e.assigned_doctor_id LEFT JOIN queue_entries q ON q.encounter_id=e.id WHERE e.patient_id=? ORDER BY e.created_at DESC`,
    [patientId],
  );
  const triage = await db.all<TriageRecord & { data: string }>(
    `SELECT t.*,u.name AS nurse_name FROM triage_records t JOIN encounters e ON e.id=t.encounter_id JOIN users u ON u.id=t.nurse_id WHERE e.patient_id=? ORDER BY t.created_at DESC`,
    [patientId],
  );
  const notes = await db.all<Note & { draft_content: string }>(
    `SELECT n.*,u.name AS author_name FROM clinical_notes n JOIN encounters e ON e.id=n.encounter_id LEFT JOIN users u ON u.id=n.author_id WHERE e.patient_id=? ${req.user.role === "PATIENT" ? "AND n.status='FINALIZED'" : ""} ORDER BY n.created_at DESC`,
    [patientId],
  );
  const prescriptions = await db.all<Prescription & { rx_content: string }>(
    `SELECT r.*,u.name AS doctor_name FROM prescriptions r JOIN encounters e ON e.id=r.encounter_id LEFT JOIN users u ON u.id=r.authorizing_user_id WHERE e.patient_id=? AND r.status='AUTHORIZED' ORDER BY r.created_at DESC`,
    [patientId],
  );
  const versions = await db.all<
    RecordBundle["versions"][number] & { data: string }
  >(
    "SELECT v.* FROM clinical_versions v JOIN encounters e ON e.id=v.encounter_id WHERE e.patient_id=? ORDER BY v.version DESC",
    [patientId],
  );
  const patientVersions =
    req.user.role === "PATIENT"
      ? versions.filter(
          (v) =>
            v.reason !== "DRAFT_SAVED" &&
            (notes.some((n) => n.id === v.resource_id) ||
              prescriptions.some((r) => r.id === v.resource_id)),
        )
      : versions;
  return {
    patient,
    encounters,
    triage: triage.map((t) => ({ ...t, data: JSON.parse(t.data) })),
    notes: notes.map((n) => ({
      ...n,
      draft_content: JSON.parse(
        versions.find((v) => v.resource_id === n.id)?.data ||
          n.draft_content ||
          "{}",
      ),
    })),
    prescriptions: prescriptions.map((r) => ({
      ...r,
      rx_content: JSON.parse(
        versions.find((v) => v.resource_id === r.id)?.data ||
          r.rx_content ||
          "{}",
      ),
    })),
    versions: patientVersions.map((v) => ({ ...v, data: JSON.parse(v.data) })),
    labs: req.user.role === "NURSE" ? [] : await labs(req, patientId),
    journey: await journey(req, patientId),
  };
}
export async function journey(
  req: Req,
  patientId: string,
): Promise<JourneyEvent[]> {
  await patientAccess(req, patientId, db, false);
  const rows = await db.all<JourneyEvent & { context: string }>(
    "SELECT j.*,u.name AS actor_name FROM journey_events j JOIN users u ON u.id=j.actor_id WHERE j.patient_id=? ORDER BY j.occurred_at DESC,j.id DESC",
    [patientId],
  );
  return rows.map((r) => ({ ...r, context: JSON.parse(r.context) }));
}
