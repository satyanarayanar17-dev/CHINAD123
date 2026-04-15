const bcrypt = require('bcryptjs');

const SEEDED_PASSWORD = 'Password123!';
const SEEDED_ACTIVATION_CODE = '123456';

const SEEDED_PATIENTS = [
  { id: 'pat-1', name: 'John Doe', phone: '+919876543210', dob: '1980-01-01', gender: 'Male' },
  { id: 'pat-2', name: 'Jane Smith', phone: '+919876543211', dob: '1990-05-15', gender: 'Female' },
  { id: 'pat-3', name: 'Ramesh Sivakumar', phone: '+919876543212', dob: '1975-03-22', gender: 'Male' }
];

const SEEDED_USERS = [
  { id: 'nurse_qa', role: 'NURSE', name: 'Nurse QA', patient_id: null },
  { id: 'doc1_qa', role: 'DOCTOR', name: 'Dr. S. Nair', patient_id: null },
  { id: 'doc2_qa', role: 'DOCTOR', name: 'Dr. V. Raman', patient_id: null },
  { id: 'admin_qa', role: 'ADMIN', name: 'Admin QA', patient_id: null },
  { id: 'patient_qa', role: 'PATIENT', name: 'John Doe', patient_id: 'pat-1' }
];

const SEEDED_ENCOUNTERS = [
  {
    id: 'enc-0',
    patient_id: 'pat-1',
    phase: 'DISCHARGED',
    lifecycle_status: 'DISCHARGED',
    is_discharged: 1,
    assigned_doctor_id: 'doc1_qa',
    __v: 2,
    created_at: '2026-03-15T09:00:00.000Z'
  },
  {
    id: 'enc-1',
    patient_id: 'pat-1',
    phase: 'RECEPTION',
    lifecycle_status: 'RECEPTION',
    is_discharged: 0,
    assigned_doctor_id: 'doc2_qa',
    chief_complaint: 'Follow-up review after previous diabetes visit.',
    triage_priority: 'STANDARD',
    handoff_notes: 'Stable vitals on arrival. Review long-term glucose control.',
    triage_vitals_json: JSON.stringify({ height: 175, weight: 81, systolic: 128, diastolic: 82, hr: 76, temp: 36.9, spo2: 99 }),
    triaged_by: 'nurse_qa',
    triaged_at: '2026-04-09T08:02:00.000Z',
    __v: 1,
    created_at: '2026-04-09T08:00:00.000Z'
  },
  {
    id: 'enc-2',
    patient_id: 'pat-2',
    phase: 'IN_CONSULTATION',
    lifecycle_status: 'IN_CONSULTATION',
    is_discharged: 0,
    assigned_doctor_id: 'doc1_qa',
    chief_complaint: 'General fatigue for 3 days with poor appetite.',
    triage_priority: 'URGENT',
    handoff_notes: 'Patient reports worsening fatigue since yesterday evening.',
    triage_vitals_json: JSON.stringify({ height: 164, weight: 68, systolic: 136, diastolic: 88, hr: 102, temp: 37.8, spo2: 98 }),
    triaged_by: 'nurse_qa',
    triaged_at: '2026-04-09T08:20:00.000Z',
    __v: 1,
    created_at: '2026-04-09T08:15:00.000Z'
  },
  {
    id: 'enc-3',
    patient_id: 'pat-3',
    phase: 'AWAITING',
    lifecycle_status: 'AWAITING',
    is_discharged: 0,
    assigned_doctor_id: 'doc1_qa',
    chief_complaint: 'Left knee pain after a slip at home.',
    triage_priority: 'STANDARD',
    handoff_notes: 'Ambulating with mild discomfort. No visible deformity.',
    triage_vitals_json: JSON.stringify({ height: 170, weight: 74, systolic: 122, diastolic: 80, hr: 84, temp: 36.8, spo2: 99 }),
    triaged_by: 'nurse_qa',
    triaged_at: '2026-04-09T08:35:00.000Z',
    __v: 1,
    created_at: '2026-04-09T08:30:00.000Z'
  }
];

const SEEDED_NOTES = [
  {
    id: 'note-history-1',
    encounter_id: 'enc-0',
    draft_content: JSON.stringify({
      soap: {
        S: 'Returning diabetes follow-up after prior visit.',
        O: 'Vitals stable and symptoms improved.',
        A: 'Type 2 diabetes under active management.',
        P: 'Continue current medications and review in 6 weeks.'
      }
    }),
    status: 'FINALIZED',
    author_id: 'doc1_qa',
    __v: 2,
    created_at: '2026-03-15T09:20:00.000Z',
    updated_at: '2026-03-15T09:25:00.000Z'
  },
  {
    id: 'note-1',
    encounter_id: 'enc-2',
    draft_content: 'Patient presents with general fatigue. Vitals stable.',
    status: 'DRAFT',
    author_id: 'doc1_qa',
    __v: 1,
    created_at: '2026-04-09T08:45:00.000Z',
    updated_at: '2026-04-09T08:45:00.000Z'
  }
];

const SEEDED_PRESCRIPTIONS = [
  {
    id: 'rx-history-1',
    encounter_id: 'enc-0',
    rx_content: JSON.stringify({
      newRx: [{ name: 'Metformin 500mg' }, { name: 'Aspirin 75mg' }]
    }),
    status: 'AUTHORIZED',
    authorizing_user_id: 'doc1_qa',
    __v: 2,
    created_at: '2026-03-15T09:30:00.000Z'
  },
  {
    id: 'rx-1',
    encounter_id: 'enc-2',
    rx_content: 'Paracetamol 500mg TDS x 5 days',
    status: 'DRAFT',
    authorizing_user_id: null,
    __v: 1,
    created_at: '2026-04-09T08:50:00.000Z'
  }
];

const SEEDED_NOTIFICATIONS = [
  {
    type: 'critical',
    title: 'Critical Lab: Potassium',
    body: 'John Doe — K+ 6.2 mEq/L (Critical High). Immediate review required.',
    patient_id: 'pat-1',
    actor_id: 'SYSTEM',
    target_role: null,
    read: 0
  },
  {
    type: 'info',
    title: 'Triage Complete',
    body: 'Nurse completed triage for Jane Smith. EWS: L4 — Less Urgent.',
    patient_id: 'pat-2',
    actor_id: 'nurse_qa',
    target_role: 'DOCTOR',
    target_user_id: 'doc1_qa',
    read: 0
  },
  {
    type: 'info',
    title: 'New Patient Check-In',
    body: 'Ramesh Sivakumar has checked in at reception.',
    patient_id: 'pat-3',
    actor_id: 'nurse_qa',
    target_role: null,
    read: 1
  }
];

function buildInsertIgnoreSql(dialect, table, columns, conflictTarget) {
  const columnsSql = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');

  if (dialect === 'postgres') {
    return `INSERT INTO ${table} (${columnsSql}) VALUES (${placeholders}) ON CONFLICT (${conflictTarget}) DO NOTHING`;
  }

  return `INSERT OR IGNORE INTO ${table} (${columnsSql}) VALUES (${placeholders})`;
}

async function upsertByPrimaryKey(context, table, conflictTarget, row, updateColumns) {
  const columns = Object.keys(row);
  const values = columns.map((column) => row[column]);

  await context.run(buildInsertIgnoreSql(context.dialect, table, columns, conflictTarget), values);

  if (updateColumns.length === 0) {
    return;
  }

  const assignments = updateColumns.map((column) => `${column} = ?`).join(', ');
  await context.run(
    `UPDATE ${table} SET ${assignments} WHERE ${conflictTarget} = ?`,
    [...updateColumns.map((column) => row[column]), row[conflictTarget]]
  );
}

function normalizeContext(db) {
  if (!db || typeof db.run !== 'function') {
    throw new Error('seedDevelopmentDatabase requires a db object with a run(sql, params) function.');
  }

  return {
    run: db.run,
    dialect: db.dialect || db.dbDialect || process.env.DB_DIALECT || 'sqlite'
  };
}

async function seedPatients(context) {
  for (const patient of SEEDED_PATIENTS) {
    await upsertByPrimaryKey(context, 'patients', 'id', patient, ['name', 'phone', 'dob', 'gender']);
  }
}

async function seedUsers(context, passwordHash) {
  for (const user of SEEDED_USERS) {
    await upsertByPrimaryKey(
      context,
      'users',
      'id',
      {
        id: user.id,
        role: user.role,
        name: user.name,
        password_hash: passwordHash,
        is_active: 1,
        patient_id: user.patient_id,
        failed_attempts: 0,
        locked_until: null
      },
      ['role', 'name', 'password_hash', 'is_active', 'patient_id', 'failed_attempts', 'locked_until']
    );
  }
}

async function seedEncounters(context) {
  for (const encounter of SEEDED_ENCOUNTERS) {
    await upsertByPrimaryKey(
      context,
      'encounters',
      'id',
      encounter,
      ['patient_id', 'phase', 'lifecycle_status', 'is_discharged', 'assigned_doctor_id', 'chief_complaint', 'triage_priority', 'handoff_notes', 'triage_vitals_json', 'triaged_by', 'triaged_at', '__v', 'created_at']
    );
  }
}

async function seedNotes(context) {
  for (const note of SEEDED_NOTES) {
    await upsertByPrimaryKey(
      context,
      'clinical_notes',
      'id',
      note,
      ['encounter_id', 'draft_content', 'status', 'author_id', '__v', 'created_at', 'updated_at']
    );
  }
}

async function seedPrescriptions(context) {
  for (const prescription of SEEDED_PRESCRIPTIONS) {
    await upsertByPrimaryKey(
      context,
      'prescriptions',
      'id',
      prescription,
      ['encounter_id', 'rx_content', 'status', 'authorizing_user_id', '__v', 'created_at']
    );
  }
}

async function seedActivationTokens(context) {
  const testOtpExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  await upsertByPrimaryKey(
    context,
    'patient_activation_tokens',
    'patient_id',
    {
      patient_id: 'pat-2',
      otp: SEEDED_ACTIVATION_CODE,
      expires_at: testOtpExpiry
    },
    ['otp', 'expires_at']
  );
}

async function seedNotifications(context) {
  let counter = 1;

  for (const notification of SEEDED_NOTIFICATIONS) {
    await upsertByPrimaryKey(
      context,
      'notifications',
      'id',
      {
        id: counter,
        ...notification
      },
      ['type', 'title', 'body', 'patient_id', 'actor_id', 'target_role', 'target_user_id', 'read']
    );
    counter += 1;
  }

  if (context.dialect === 'postgres') {
    await context.run(
      `SELECT setval(
        pg_get_serial_sequence('notifications', 'id'),
        GREATEST(COALESCE((SELECT MAX(id) FROM notifications), 0), 1),
        true
      )`
    );
  }
}

async function seedDevelopmentDatabase(db, options = {}) {
  const context = normalizeContext(db);
  const passwordHash = await bcrypt.hash(SEEDED_PASSWORD, 10);

  await seedPatients(context);
  await seedUsers(context, passwordHash);
  await seedEncounters(context);
  await seedNotes(context);
  await seedPrescriptions(context);
  await seedActivationTokens(context);
  await seedNotifications(context);

  return {
    mode: options.mode || 'local-demo',
    seededPassword: SEEDED_PASSWORD,
    activationCode: SEEDED_ACTIVATION_CODE
  };
}

module.exports = {
  SEEDED_PASSWORD,
  SEEDED_ACTIVATION_CODE,
  seedDevelopmentDatabase,
  seedDatabase: seedDevelopmentDatabase
};
