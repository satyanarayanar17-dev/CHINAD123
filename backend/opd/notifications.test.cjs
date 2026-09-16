const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'restricted_web_pilot') throw Error('Local tests only');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-notification-test-'));
Object.assign(process.env, { NODE_ENV: 'test', DB_DIALECT: 'sqlite', SQLITE_PATH: path.join(directory, 'test.db'), SMS_WEBHOOK_URL: 'https://synthetic.invalid/sms', SMS_WEBHOOK_TOKEN: 'synthetic-test-token' });
let networkCalls = 0;
global.fetch = async () => { networkCalls++; throw Error('A test tried to send an external SMS'); };
const db = require('../database');
const { runNotificationCycle } = require('./notifications.ts');
const at = new Date('2030-01-15T00:00:00.000Z');
const later = minutes => new Date(at.getTime() + minutes * 60_000);
async function run() {
  await db.migrateDatabase();
  await db.run("INSERT INTO patients (id,mrn,name,phone,dob,gender) VALUES ('p','SYN-P','Synthetic Patient','+919000000001','1980-01-01','Female')");
  await db.run("INSERT INTO users (id,name,role,patient_id) VALUES ('p-user','Synthetic Patient','PATIENT','p')");
  await db.run("INSERT INTO users (id,name,role) VALUES ('doc','Synthetic Doctor','DOCTOR')");
  await db.run("INSERT INTO departments (id,name,prefix) VALUES ('d','Synthetic Department','SY')");
  await db.run("INSERT INTO encounters (id,patient_id,phase,lifecycle_status,is_discharged) VALUES ('historic','p','DISCHARGED','DISCHARGED',1)");
  for (const [appointment, offset, followUp] of [['ordinary',120,null],['follow-up',180,'historic']]) {
    await db.run("INSERT INTO appointments (id,patient_id,doctor_id,department_id,scheduled_at,ends_at,room,status,reason,follow_up_of,created_by,created_at) VALUES (?,'p','doc','d',?,?,'Synthetic room','CONFIRMED','Synthetic visit',?,'doc',?)", [appointment,later(offset).toISOString(),later(offset+15).toISOString(),followUp,at.toISOString()]);
  }
  const local = await runNotificationCycle({ at });
  assert.equal(local.deliveryEnabled, false);
  assert.equal(local.remindersQueued, 2);
  assert.equal((await runNotificationCycle({ at })).remindersQueued, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM opd_notifications')).n, 2);
  assert.deepEqual((await db.all('SELECT DISTINCT code FROM sms_outbox ORDER BY code')).map(x=>x.code), ['APPOINTMENT_REMINDER','FOLLOW_UP_REMINDER']);
  assert.equal((await db.get('SELECT SUM(attempts) AS n FROM sms_outbox')).n, 0);
  console.log('PASS local delivery guard and deduped appointment/follow-up reminders');

  const failed = await runNotificationCycle({ at, send: async () => { throw Error('Synthetic provider failure containing private data'); } });
  assert.equal(failed.retried, 2);
  assert.equal((await runNotificationCycle({ at, send: async () => assert.fail('Retry before due time') })).sent, 0);
  const sent = [];
  const concurrent = await Promise.all([1,2].map(() => runNotificationCycle({ at: later(1), send: async (...args) => { sent.push(args); } })));
  assert.equal(concurrent.reduce((n,r)=>n+r.sent,0), 2);
  assert.equal(new Set(sent.map(args=>args[2].delivery_id)).size, 2);
  assert.ok(sent.every(args=>Object.keys(args[2]).sort().join(',') === 'delivery_id,scheduled_at'));
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM sms_outbox WHERE status='SENT' AND attempts=2")).n, 2);
  console.log('PASS persistent retry timing, competing workers, minimal transport payload');

  await db.run("UPDATE appointments SET scheduled_at=?,ends_at=? WHERE id='ordinary'", [later(240).toISOString(),later(255).toISOString()]);
  assert.equal((await runNotificationCycle({ at })).remindersQueued, 1);
  await db.run("UPDATE appointments SET status='CANCELLED' WHERE id='ordinary'");
  assert.equal((await runNotificationCycle({ at, send: async () => assert.fail('Cancelled reminder sent') })).skipped, 1);
  await db.run("INSERT INTO sms_outbox (id,patient_id,code,context,status,attempts,next_attempt_at,created_at,dedupe_key) VALUES ('crashed','p','PRESCRIPTION_ISSUED','{}','PROCESSING',1,?,?, 'crashed')", [at.toISOString(),at.toISOString()]);
  assert.equal((await runNotificationCycle({ at, send: async () => {} })).sent, 1);
  await db.run("INSERT INTO sms_outbox (id,patient_id,code,context,status,attempts,next_attempt_at,created_at,dedupe_key) VALUES ('exhausted','p','RESULT_RELEASED','{}','PROCESSING',5,?,?,'exhausted')", [at.toISOString(),at.toISOString()]);
  assert.equal((await runNotificationCycle({ at, send: async () => assert.fail('Exhausted row sent') })).failed, 1);
  const audit = await db.all('SELECT action,new_state FROM audit_logs');
  assert.ok(audit.some(row=>row.action==='SMS_RECIPIENT_ACCESSED'));
  assert.ok(!JSON.stringify(audit).includes('+919000000001'));
  assert.ok(!JSON.stringify(audit).includes('private data'));
  assert.equal(networkCalls, 0);
  console.log('PASS reschedule/cancel handling, abandoned lease recovery, retry cap and PHI-free audit');
}
run().then(() => { db.db.close(() => fs.rmSync(directory, { recursive: true, force: true })); }).catch(error => { console.error(error); db.db.close(); process.exitCode = 1; });
