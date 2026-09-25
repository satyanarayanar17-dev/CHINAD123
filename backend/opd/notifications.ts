import { createRequire } from 'node:module';
import { audit, id, transaction } from './core.ts';
import type { DB, Req } from './core.ts';
import { sendSms } from './auth.ts';

const require = createRequire(import.meta.url);
const { logEvent } = require('../lib/logger');
const { dateInZone, addDays, scheduledOn, scheduledFor } = require('../lib/carePlanSchedule');
const MAX_ATTEMPTS = 5;
const LEASE_MS = 120_000;
const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
const TEMPLATES = new Set([
  'APPOINTMENT_CONFIRMED', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_CANCELLED',
  'APPOINTMENT_REMINDER', 'FOLLOW_UP_BOOKED', 'FOLLOW_UP_REMINDER', 'CHECKED_IN',
  'TOKEN_ISSUED', 'TRIAGE_STARTED', 'TRIAGE_COMPLETED', 'DOCTOR_READY',
  'PRESCRIPTION_ISSUED', 'RESULT_RELEASED',
]);
type OutboxRow = { id: string; patient_id: string; code: string; context: string; attempts: number; status: string };
type Reminder = { id: string; patient_id: string; scheduled_at: string; follow_up_of: string | null };
type Sender = (mobile: string, template: string, variables: Record<string, string>) => Promise<void>;
export interface NotificationCycleOptions {
  /** Deterministic clock and injected transport for isolated tests. */
  at?: Date;
  send?: Sender;
  deliveryEnabled?: boolean;
  batchSize?: number;
}

function systemRequest(): Req {
  return { user: { id: 'SYSTEM_NOTIFICATION_WORKER', role: 'ADMIN' }, correlationId: id('notification-cycle') } as Req;
}
function configured() {
  // Development OTP mode and test imports must never contact a real provider.
  return process.env.NODE_ENV !== 'test' && process.env.OPD_DEMO_OTP !== 'true' &&
    Boolean(process.env.SMS_WEBHOOK_URL?.startsWith('https://') && process.env.SMS_WEBHOOK_TOKEN);
}

async function queueReminders(tx: DB, req: Req, at: Date) {
  const timestamp = at.toISOString();
  const horizon = new Date(at.getTime() + REMINDER_WINDOW_MS).toISOString();
  const upcoming = await tx.all<Reminder>(
    "SELECT id,patient_id,scheduled_at,follow_up_of FROM appointments WHERE status='CONFIRMED' AND scheduled_at>? AND scheduled_at<=?",
    [timestamp, horizon],
  );
  let queued = 0;
  for (const appointment of upcoming) {
    const code = appointment.follow_up_of ? 'FOLLOW_UP_REMINDER' : 'APPOINTMENT_REMINDER';
    // Including the scheduled time permits one fresh reminder after a reschedule.
    const dedupeKey = `${code}:${appointment.id}:${appointment.scheduled_at}`;
    const context = JSON.stringify({ appointment_id: appointment.id, scheduled_at: appointment.scheduled_at });
    const patientUser = await tx.get<{ id: string }>("SELECT id FROM users WHERE patient_id=? AND role='PATIENT' AND is_active=1", [appointment.patient_id]);
    if (patientUser) await tx.run(
      'INSERT INTO opd_notifications (id,user_id,patient_id,code,context,created_at,dedupe_key) VALUES (?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING',
      [id('notice'), patientUser.id, appointment.patient_id, code, context, timestamp, dedupeKey],
    );
    const inserted = await tx.run(
      'INSERT INTO sms_outbox (id,patient_id,code,context,created_at,next_attempt_at,dedupe_key) VALUES (?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING',
      [id('sms'), appointment.patient_id, code, context, timestamp, timestamp, dedupeKey],
    );
    if (inserted.changes) {
      queued++;
      await audit(tx, req, 'REMINDER_QUEUED', appointment.patient_id, { appointment_id: appointment.id, code });
    }
  }
  const careTasks = await tx.all<any>(
    `SELECT t.*,p.patient_id FROM care_plan_tasks t JOIN care_plans p ON p.id=t.plan_id
     WHERE p.status='ACTIVE' AND t.status='ACTIVE' AND t.reminder_enabled=1`,
  );
  const firstDate = dateInZone(at);
  for (const task of careTasks) {
    for (const occurrenceDate of [firstDate, addDays(firstDate, 1)]) {
      if (!scheduledOn(task, occurrenceDate)) continue;
      const due = scheduledFor(occurrenceDate, task.scheduled_time);
      if (due <= timestamp || due > horizon) continue;
      if (await tx.get('SELECT id FROM care_plan_adherence WHERE task_id=? AND occurrence_date=?', [task.id, occurrenceDate])) continue;
      const patientUser = await tx.get<{ id: string }>("SELECT id FROM users WHERE patient_id=? AND role='PATIENT' AND is_active=1", [task.patient_id]);
      if (!patientUser) continue;
      const dedupeKey = `CARE_TASK_REMINDER:${task.id}:${due}`;
      const inserted = await tx.run(
        'INSERT INTO opd_notifications (id,user_id,patient_id,code,context,created_at,dedupe_key) VALUES (?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING',
        [id('notice'), patientUser.id, task.patient_id, 'CARE_TASK_REMINDER', JSON.stringify({ task_id: task.id, occurrence_date: occurrenceDate, scheduled_for: due, task_type: task.task_type, title: task.title }), timestamp, dedupeKey],
      );
      if (inserted.changes) {
        queued++;
        await audit(tx, req, 'CARE_TASK_REMINDER_QUEUED', task.patient_id, { task_id: task.id, occurrence_date: occurrenceDate });
      }
    }
  }
  return queued;
}

async function claim(req: Req, timestamp: string) {
  return transaction(async tx => {
    const row = await tx.get<OutboxRow>(
      `SELECT * FROM sms_outbox WHERE status IN ('PENDING','PROCESSING') AND next_attempt_at<=? ORDER BY next_attempt_at,created_at,id LIMIT 1${tx.dialect === 'postgres' ? ' FOR UPDATE SKIP LOCKED' : ''}`,
      [timestamp],
    );
    if (!row) return null;
    if (row.attempts >= MAX_ATTEMPTS) {
      await tx.run("UPDATE sms_outbox SET status='FAILED' WHERE id=?", [row.id]);
      await audit(tx, req, 'SMS_DELIVERY_FAILED', row.patient_id, { outbox_id: row.id, code: row.code, reason: 'ATTEMPTS_EXHAUSTED' }, 'failed');
      return { exhausted: true as const };
    }
    const lease = new Date(new Date(timestamp).getTime() + LEASE_MS).toISOString();
    const changed = await tx.run(
      "UPDATE sms_outbox SET status='PROCESSING',attempts=attempts+1,next_attempt_at=? WHERE id=? AND attempts=? AND status IN ('PENDING','PROCESSING') AND next_attempt_at<=?",
      [lease, row.id, row.attempts, timestamp],
    );
    if (!changed.changes) return null;
    row.attempts++;
    await audit(tx, req, 'SMS_DELIVERY_ATTEMPTED', row.patient_id, { outbox_id: row.id, code: row.code, attempt: row.attempts });
    return { row };
  });
}

async function recipient(req: Req, row: OutboxRow, at: Date) {
  return transaction(async tx => {
    if (!TEMPLATES.has(row.code)) return null;
    const variables: Record<string, string> = { delivery_id: row.id };
    if (row.code === 'APPOINTMENT_REMINDER' || row.code === 'FOLLOW_UP_REMINDER') {
      let context: { appointment_id?: string; scheduled_at?: string };
      try { context = JSON.parse(row.context); } catch { return null; }
      const appointment = await tx.get<Reminder & { status: string }>('SELECT id,patient_id,scheduled_at,follow_up_of,status FROM appointments WHERE id=? AND patient_id=?', [context?.appointment_id, row.patient_id]);
      if (!appointment || appointment.status !== 'CONFIRMED' || appointment.scheduled_at !== context?.scheduled_at || appointment.scheduled_at <= at.toISOString()) return null;
      variables.scheduled_at = appointment.scheduled_at;
    }
    const patient = await tx.get<{ phone: string }>('SELECT phone FROM patients WHERE id=?', [row.patient_id]);
    await audit(tx, req, 'SMS_RECIPIENT_ACCESSED', row.patient_id, { outbox_id: row.id, code: row.code });
    if (!patient || !/^\+91[6-9]\d{9}$/.test(patient.phone)) return null;
    // Never forward diagnosis, medication, result, patient name, or arbitrary event context.
    return { mobile: patient.phone, variables };
  });
}

async function settle(req: Req, row: OutboxRow, status: 'SENT' | 'PENDING' | 'FAILED' | 'SKIPPED', at: Date) {
  const retryAt = status === 'PENDING' ? new Date(at.getTime() + Math.min(60_000 * 2 ** (row.attempts - 1), 3_600_000)) : at;
  await transaction(async tx => {
    const changed = await tx.run("UPDATE sms_outbox SET status=?,next_attempt_at=? WHERE id=? AND status='PROCESSING' AND attempts=?", [status, retryAt.toISOString(), row.id, row.attempts]);
    if (changed.changes) await audit(tx, req, `SMS_${status === 'SENT' ? 'ADAPTER_ACCEPTED' : status === 'PENDING' ? 'RETRY_SCHEDULED' : status === 'SKIPPED' ? 'DELIVERY_SKIPPED' : 'DELIVERY_FAILED'}`, row.patient_id, { outbox_id: row.id, code: row.code, attempt: row.attempts }, status === 'FAILED' || status === 'PENDING' ? 'failed' : 'success');
  });
}

/** The queue is durable. Transport is at-least-once; adapters must dedupe variables.delivery_id. */
export async function runNotificationCycle(options: NotificationCycleOptions = {}) {
  const at = options.at || new Date();
  const req = systemRequest();
  const deliveryEnabled = options.send ? options.deliveryEnabled !== false : configured() && options.deliveryEnabled !== false;
  const stats = { remindersQueued: await transaction(tx => queueReminders(tx, req, at)), sent: 0, retried: 0, failed: 0, skipped: 0, deliveryEnabled };
  if (!deliveryEnabled) return stats; // Keep pending rows intact until an adapter is configured.
  const sender = options.send || sendSms;
  const batchSize = Math.max(1, Math.min(100, options.batchSize || 25));
  for (let index = 0; index < batchSize; index++) {
    const claimed = await claim(req, at.toISOString());
    if (!claimed) break;
    if ('exhausted' in claimed) { stats.failed++; continue; }
    const { row } = claimed;
    const target = await recipient(req, row, at);
    if (!target) { await settle(req, row, 'SKIPPED', at); stats.skipped++; continue; }
    try {
      await sender(target.mobile, row.code, target.variables);
      await settle(req, row, 'SENT', at);
      stats.sent++;
    } catch {
      // Provider response bodies and exceptions can contain PHI or credentials: never log them.
      const status = row.attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING';
      await settle(req, row, status, at);
      if (status === 'FAILED') stats.failed++; else stats.retried++;
    }
  }
  return stats;
}

/** Start after migrations. Importing the server for tests does not start the worker. */
export function startNotificationWorker() {
  if (process.env.NODE_ENV === 'test' || process.env.OPD_NOTIFICATION_WORKER === 'false') return () => {};
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    try {
      const stats = await runNotificationCycle();
      if (stats.remindersQueued || stats.sent || stats.retried || stats.failed || stats.skipped) logEvent('info', 'opd_notification_cycle', stats);
    } catch {
      logEvent('error', 'opd_notification_cycle_failed', { code: 'NOTIFICATION_CYCLE_FAILED' });
    }
    if (!stopped) { timer = setTimeout(tick, 60_000); timer.unref(); }
  };
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
