const { runtimeConfig } = require('../config');

function assertPilotDoctor(id, role = 'DOCTOR') {
  if (runtimeConfig.pilotDoctorId && role === 'DOCTOR' && id !== runtimeConfig.pilotDoctorId) {
    throw { status: 403, code: 'PILOT_DOCTOR_ONLY', message: 'This trial is restricted to the assigned trial doctor.' };
  }
}

async function checkPilotEnrollment(tx, doctorId) {
  if (!runtimeConfig.pilotDoctorId) return;
  assertPilotDoctor(doctorId);
  // Patient creation already runs in a transaction. Lock the one clinician row
  // so concurrent registrations cannot both claim the final PostgreSQL place.
  const doctor = await tx.get(`SELECT id FROM users WHERE id=? AND role='DOCTOR' AND is_active=1${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`, [runtimeConfig.pilotDoctorId]);
  if (!doctor) throw { status: 422, code: 'NOT_ASSIGNED', message: 'The trial doctor must be provisioned first.' };
  const count = await tx.get('SELECT COUNT(*) AS n FROM patients');
  if (Number(count.n) >= runtimeConfig.pilotPatientLimit) {
    throw { status: 409, code: 'PILOT_PATIENT_LIMIT', message: 'This trial has reached its patient enrollment limit.' };
  }
}

module.exports = { assertPilotDoctor, checkPilotEnrollment };
