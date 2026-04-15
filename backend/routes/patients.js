const express = require('express');
const crypto = require('crypto');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, all, run, withTransaction } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { writeNotification } = require('./notifications');
const {
  buildPatientReadModel,
  generateNumericOTP,
  isIsoDateOnly,
  normalizePatientGender,
  normalizePatientPhone,
  validatePatientRegistrationPayload,
  validatePatientRecord,
  validateEncounterLifecycle
} = require('../lib/clinicalIntegrity');
const {
  assertPatientRecord,
  buildIntegrityError,
  ensureActiveEncounter,
  loadPatientRecord
} = require('../lib/careFlow');
const { logEvent } = require('../lib/logger');

const router = express.Router();

const BREAK_GLASS_MIN_LENGTH = 50;
const activationOtpDelivery =
  process.env.ACTIVATION_OTP_DELIVERY ||
  (process.env.NODE_ENV === 'production' ? 'console' : 'api_response');

function generateActivationCode() {
  return generateNumericOTP(6);
}

function buildActivationEnvelope(otp, expiresAt) {
  const activation = {
    expires_at: expiresAt,
    delivery_mode: activationOtpDelivery
  };

  if (activationOtpDelivery === 'api_response') {
    activation.activation_code = otp;
  }

  return activation;
}

function isPhoneUniqueConstraint(err) {
  const message = String(err?.message || '');
  const detail = String(err?.detail || '');
  return message.includes('idx_patients_phone_unique') || detail.includes('idx_patients_phone_unique');
}

async function findPatientByPhone(context, phone) {
  if (!phone) {
    return null;
  }

  return context.get(
    `SELECT id, name, phone, dob, gender
     FROM patients
     WHERE phone = ?`,
    [phone]
  );
}

async function generatePatientId(context) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `pat-${crypto.randomBytes(4).toString('hex')}`;
    const existing = await context.get(`SELECT id FROM patients WHERE id = ?`, [candidate]);
    if (!existing) {
      return candidate;
    }
  }

  throw {
    status: 500,
    code: 'PATIENT_ID_GENERATION_FAILED',
    message: 'Could not generate a stable patient identifier. Please retry.'
  };
}

function summarizeNoteContent(rawContent) {
  let display = rawContent || 'No content recorded.';

  try {
    const parsed = JSON.parse(rawContent);
    if (parsed.soap) {
      const parts = [];
      if (parsed.soap.S) parts.push(`S: ${parsed.soap.S}`);
      if (parsed.soap.A) parts.push(`A: ${parsed.soap.A}`);
      if (parsed.soap.P) parts.push(`P: ${parsed.soap.P}`);
      if (parts.length > 0) {
        display = parts.join(' | ');
      }
    }
  } catch (_) {
    // Preserve raw content when it is not JSON.
  }

  return display.length > 300 ? `${display.substring(0, 300)}...` : display;
}

function summarizePrescriptionContent(rawContent) {
  let display = rawContent || 'Prescription details not available.';

  try {
    const parsed = JSON.parse(rawContent);
    if (Array.isArray(parsed.newRx) && parsed.newRx.length > 0) {
      display = parsed.newRx.map((medication) => medication.name).filter(Boolean).join(', ') || display;
    }
  } catch (_) {
    // Preserve raw content when it is not JSON.
  }

  return display;
}

function validatePatientUpdatePayload(payload = {}) {
  const has = (field) => Object.prototype.hasOwnProperty.call(payload, field);
  const value = {};
  const errors = [];

  if (has('name')) {
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) {
      errors.push({ field: 'name', message: 'Patient name is required.' });
    } else {
      value.name = name;
    }
  }

  if (has('dob')) {
    const dob = typeof payload.dob === 'string' ? payload.dob.trim() : '';
    if (!isIsoDateOnly(dob)) {
      errors.push({ field: 'dob', message: 'Patient DOB must be a valid YYYY-MM-DD date.' });
    } else {
      value.dob = dob;
    }
  }

  if (has('gender')) {
    const gender = normalizePatientGender(payload.gender);
    if (!gender) {
      errors.push({ field: 'gender', message: 'Gender must be one of: Male, Female, Other, Not specified.' });
    } else {
      value.gender = gender;
    }
  }

  if (has('phone')) {
    const rawPhone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
    if (!rawPhone) {
      value.phone = null;
    } else {
      const normalizedPhone = normalizePatientPhone(rawPhone);
      if (!normalizedPhone) {
        errors.push({ field: 'phone', message: 'Patient phone must be a valid mobile number.' });
      } else {
        value.phone = normalizedPhone;
      }
    }
  }

  if (Object.keys(value).length === 0 && errors.length === 0) {
    errors.push({ field: 'payload', message: 'At least one editable patient field must be provided.' });
  }

  return {
    valid: errors.length === 0,
    value,
    errors
  };
}

router.post('/', requireAuth, requireRole(['ADMIN', 'NURSE']), async (req, res, next) => {
  const issueActivationToken = req.body?.issueActivationToken === true;
  const validation = validatePatientRegistrationPayload(req.body, {
    requirePhone: issueActivationToken
  });
  if (!validation.valid) {
    logEvent('warn', 'patient_write_rejected', {
      correlationId: req.correlationId,
      actorId: req.user.id,
      code: 'INVALID_PATIENT_PAYLOAD',
      details: validation.errors
    });
    return next({
      status: 400,
      code: 'INVALID_PATIENT_PAYLOAD',
      message: validation.errors.map((error) => error.message).join(' '),
      details: validation.errors
    });
  }

  const {
    id: requestedId,
    name,
    phone,
    dob,
    gender,
    createEncounter
  } = validation.value;

  if (issueActivationToken && req.user.role !== 'ADMIN') {
    return next({
      status: 403,
      code: 'FORBIDDEN_ROLE',
      message: 'Only administrators can issue activation tokens during onboarding.'
    });
  }

  try {
    const result = await withTransaction(async (tx) => {
      const patientByPhone = await findPatientByPhone(tx, phone);
      const patientById = requestedId ? await loadPatientRecord(tx, requestedId) : null;
      let patient = patientByPhone || patientById;
      let patientCreated = false;

      if (patientByPhone && patientById && patientByPhone.id !== patientById.id) {
        throw {
          status: 409,
          code: 'PATIENT_IDENTITY_CONFLICT',
          message: 'This phone number is already linked to a different patient record.'
        };
      }

      if (patient) {
        assertPatientRecord(patient);

        if (patient.name !== name || patient.dob !== dob || patient.gender !== gender) {
          throw {
            status: 409,
            code: patient.phone === phone ? 'PHONE_ALREADY_REGISTERED' : 'PATIENT_CONFLICT',
            message: patient.phone === phone
              ? 'This phone number is already registered to a different patient profile.'
              : 'A patient with this identifier already exists with different demographic data.'
          };
        }

        if (!patient.phone && patientById && !patientByPhone) {
          await tx.run(`UPDATE patients SET phone = ? WHERE id = ?`, [phone, patient.id]);
          patient = { ...patient, phone };
        } else if (patient.phone !== phone) {
          throw {
            status: 409,
            code: 'PHONE_ALREADY_REGISTERED',
            message: 'This phone number does not match the existing patient record.'
          };
        }
      } else {
        const patientId = requestedId || await generatePatientId(tx);
        await tx.run(
          `INSERT INTO patients (id, name, phone, dob, gender) VALUES (?, ?, ?, ?, ?)`,
          [patientId, name, phone, dob, gender]
        );
        patientCreated = true;
        patient = { id: patientId, name, phone, dob, gender };
      }

      let activeEncounter = null;
      let encounterCreated = false;

      if (createEncounter !== false) {
        const ensuredEncounter = await ensureActiveEncounter(tx, patient.id, {
          encounterId: `enc-${Date.now()}`
        });
        activeEncounter = ensuredEncounter.encounter;
        encounterCreated = ensuredEncounter.created;
      }

      let activation = null;

      if (issueActivationToken) {
        if (!activeEncounter) {
          throw {
            status: 422,
            code: 'NO_ACTIVE_ENCOUNTER',
            message: 'Patient onboarding requires an active encounter before activation can be issued.'
          };
        }

        const existingUser = await tx.get(`SELECT id FROM users WHERE patient_id = ?`, [patient.id]);
        if (existingUser) {
          throw {
            status: 409,
            code: 'ACCOUNT_EXISTS',
            message: 'A portal account already exists for this phone number.'
          };
        }

        const otp = generateActivationCode();
        const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();

        await tx.run(`DELETE FROM patient_activation_tokens WHERE patient_id = ?`, [patient.id]);
        await tx.run(
          `INSERT INTO patient_activation_tokens (patient_id, otp, expires_at) VALUES (?, ?, ?)`,
          [patient.id, otp, expiresAt]
        );

        activation = buildActivationEnvelope(otp, expiresAt);
      }

      return {
        patient,
        patientCreated,
        activeEncounter,
        encounterCreated,
        activation
      };
    });

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: result.patient.id,
      action: `PATIENT_REGISTER:${result.patientCreated ? 'CREATED' : 'REUSED'}:${result.encounterCreated ? 'ENCOUNTER_CREATED' : 'ENCOUNTER_REUSED'}${result.activation ? ':ACTIVATION_ISSUED' : ''}`,
      new_state: JSON.stringify({
        patient_name: name,
        phone,
        patientCreated: result.patientCreated,
        encounterCreated: result.encounterCreated,
        encounterId: result.activeEncounter?.id || null,
        activationIssued: Boolean(result.activation)
      })
    });

    if (result.activation?.activation_code) {
      console.log(`\n---------------------------------------------------------`);
      console.log(`[SYS: MOCK SMS] To: Patient ${result.patient.phone || result.patient.id}`);
      console.log(`[SYS: MOCK SMS] Your Chettinad Care activation code is: ${result.activation.activation_code}. Valid for 20 mins.`);
      console.log(`---------------------------------------------------------\n`);
    }

    res.status(result.patientCreated ? 201 : 200).json({
      patient: buildPatientReadModel(result.patient),
      encounterId: result.activeEncounter?.id || null,
      patientCreated: result.patientCreated,
      encounterCreated: result.encounterCreated,
      activation: result.activation,
      activationPath: result.activation ? '/patient/activate' : null
    });
  } catch (err) {
    if (isPhoneUniqueConstraint(err)) {
      return next({
        status: 409,
        code: 'PHONE_ALREADY_REGISTERED',
        message: 'This phone number is already linked to another patient record.'
      });
    }
    next(err);
  }
});

router.get('/', requireAuth, requireRole(['DOCTOR', 'NURSE', 'ADMIN']), async (req, res, next) => {
  try {
    const q = req.query.q || '';
    const normalizedQueryPhone = normalizePatientPhone(q);
    const patients = q.length >= 2
      ? await all(
        `SELECT id,name,phone,dob,gender
         FROM patients
         WHERE name LIKE ? OR id LIKE ? OR phone LIKE ? OR (? IS NOT NULL AND phone = ?)
         LIMIT 20`,
        [`%${q}%`, `%${q}%`, `%${q}%`, normalizedQueryPhone, normalizedQueryPhone]
      )
      : await all(`SELECT id,name,phone,dob,gender FROM patients LIMIT 20`);

    const safePatients = patients.flatMap((patient) => {
      const patientState = validatePatientRecord(patient);
      if (!patientState.valid) {
        logEvent('warn', 'invalid_patient_read_skipped', {
          correlationId: req.correlationId,
          patientId: patient.id,
          reasons: patientState.errors
        });
        return [];
      }

      const readModel = buildPatientReadModel(patient);
      return readModel ? [readModel] : [];
    });

    res.json(safePatients);
  } catch (err) { next(err); }
});

router.get('/:patientId', requireAuth, requireRole(['DOCTOR', 'NURSE', 'ADMIN']), async (req, res, next) => {
  try {
    const p = await get(`SELECT id,name,phone,dob,gender FROM patients WHERE id = ?`, [req.params.patientId]);
    if (!p) return next({ status: 404, code: 'NOT_FOUND', message: 'Patient not found.' });

    const patientState = validatePatientRecord(p);
    if (!patientState.valid) {
      return next(buildIntegrityError(
        'Patient demographics are malformed and must be repaired before the chart can be opened.',
        patientState.errors
      ));
    }

    res.json(buildPatientReadModel(p));
  } catch (err) { next(err); }
});

router.patch('/:patientId', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  const validation = validatePatientUpdatePayload(req.body);
  if (!validation.valid) {
    return next({
      status: 400,
      code: 'INVALID_PATIENT_UPDATE',
      message: validation.errors.map((error) => error.message).join(' '),
      details: validation.errors
    });
  }

  try {
    const updatedPatient = await withTransaction(async (tx) => {
      const existingPatient = await loadPatientRecord(tx, req.params.patientId);
      assertPatientRecord(existingPatient);

      const nextPatient = {
        ...existingPatient,
        ...validation.value,
      };

      const collision = nextPatient.phone
        ? await findPatientByPhone(tx, nextPatient.phone)
        : null;

      if (collision && collision.id !== existingPatient.id) {
        throw {
          status: 409,
          code: 'PHONE_ALREADY_REGISTERED',
          message: 'This phone number is already linked to another patient record.'
        };
      }

      await tx.run(
        `UPDATE patients
         SET name = ?, phone = ?, dob = ?, gender = ?
         WHERE id = ?`,
        [nextPatient.name, nextPatient.phone, nextPatient.dob, nextPatient.gender, existingPatient.id]
      );

      return {
        before: existingPatient,
        after: nextPatient
      };
    });

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: req.params.patientId,
      action: `PATIENT_DEMOGRAPHICS_UPDATE:${req.params.patientId}`,
      prior_state: JSON.stringify(updatedPatient.before),
      new_state: JSON.stringify(updatedPatient.after)
    });

    res.json({
      patient: buildPatientReadModel(updatedPatient.after),
      updated: true
    });
  } catch (err) {
    if (isPhoneUniqueConstraint(err)) {
      return next({
        status: 409,
        code: 'PHONE_ALREADY_REGISTERED',
        message: 'This phone number is already linked to another patient record.'
      });
    }
    next(err);
  }
});

router.get('/:patientId/timeline', requireAuth, requireRole(['DOCTOR', 'NURSE']), async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const patient = await loadPatientRecord({ get }, patientId);
    assertPatientRecord(patient);

    const encounters = await all(
      `SELECT id, phase, lifecycle_status, is_discharged, __v, created_at
       FROM encounters
       WHERE patient_id = ?
       ORDER BY created_at DESC, id DESC`,
      [patientId]
    );

    const notes = await all(
      `SELECT cn.id, cn.draft_content, cn.status, cn.author_id, cn.created_at, cn.encounter_id,
              e.phase AS encounter_phase, e.lifecycle_status, e.is_discharged
       FROM clinical_notes cn
       JOIN encounters e ON cn.encounter_id = e.id
       WHERE e.patient_id = ? AND cn.status = 'FINALIZED'
       ORDER BY cn.created_at DESC`,
      [patientId]
    );

    const rxRows = await all(
      `SELECT p.id, p.rx_content, p.status, p.authorizing_user_id, p.created_at, p.encounter_id,
              e.phase AS encounter_phase, e.lifecycle_status, e.is_discharged
       FROM prescriptions p
       JOIN encounters e ON p.encounter_id = e.id
       WHERE e.patient_id = ? AND p.status = 'AUTHORIZED'
       ORDER BY p.created_at DESC`,
      [patientId]
    );

    const timeline = [];

    for (const enc of encounters) {
      const encounterState = validateEncounterLifecycle(enc);
      if (!encounterState.valid) {
        logEvent('warn', 'timeline_encounter_skipped', {
          correlationId: req.correlationId,
          patientId,
          encounterId: enc.id,
          reasons: encounterState.errors
        });
        continue;
      }

      const occurredAt = enc.created_at || new Date().toISOString();
      timeline.push({
        id: `tl-enc-${enc.id}`,
        patientId,
        date: occurredAt,
        occurredAt,
        type: enc.is_discharged ? 'discharge' : 'encounter',
        title: enc.is_discharged ? 'Patient Discharged' : `Encounter — ${enc.lifecycle_status}`,
        summary: enc.is_discharged
          ? 'Encounter completed and closed cleanly.'
          : `Encounter currently active in ${enc.lifecycle_status}.`,
        verifiedBy: 'System',
        encounterId: enc.id
      });
    }

    for (const note of notes) {
      const encounterState = validateEncounterLifecycle({
        patient_id: patientId,
        phase: note.encounter_phase,
        lifecycle_status: note.lifecycle_status,
        is_discharged: note.is_discharged
      });
      if (!encounterState.valid) {
        logEvent('warn', 'timeline_note_skipped', {
          correlationId: req.correlationId,
          patientId,
          noteId: note.id,
          reasons: encounterState.errors
        });
        continue;
      }

      timeline.push({
        id: `tl-note-${note.id}`,
        patientId,
        date: note.created_at || new Date().toISOString(),
        occurredAt: note.created_at || new Date().toISOString(),
        type: 'consultation',
        title: 'Clinical Consultation Note',
        summary: summarizeNoteContent(note.draft_content),
        verifiedBy: note.author_id || 'Attending Physician',
        noteId: note.id,
        encounterId: note.encounter_id
      });
    }

    for (const rx of rxRows) {
      const encounterState = validateEncounterLifecycle({
        patient_id: patientId,
        phase: rx.encounter_phase,
        lifecycle_status: rx.lifecycle_status,
        is_discharged: rx.is_discharged
      });
      if (!encounterState.valid) {
        logEvent('warn', 'timeline_prescription_skipped', {
          correlationId: req.correlationId,
          patientId,
          prescriptionId: rx.id,
          reasons: encounterState.errors
        });
        continue;
      }

      timeline.push({
        id: `tl-rx-${rx.id}`,
        patientId,
        date: rx.created_at || new Date().toISOString(),
        occurredAt: rx.created_at || new Date().toISOString(),
        type: 'prescription',
        title: 'Prescription Authorized',
        summary: summarizePrescriptionContent(rx.rx_content),
        verifiedBy: rx.authorizing_user_id || 'Attending Physician',
        rxId: rx.id,
        encounterId: rx.encounter_id
      });
    }

    timeline.sort((a, b) => new Date(b.occurredAt || b.date).getTime() - new Date(a.occurredAt || a.date).getTime());
    res.json(timeline);
  } catch (err) { next(err); }
});

router.post('/:patientId/break-glass', requireAuth, requireRole(['DOCTOR', 'NURSE']), async (req, res, next) => {
  const { patientId } = req.params;
  const { justification } = req.body;

  if (!justification || justification.trim().length < BREAK_GLASS_MIN_LENGTH) {
    return next({
      status: 400,
      code: 'INSUFFICIENT_JUSTIFICATION',
      message: `Break-glass requires a clinical justification of at least ${BREAK_GLASS_MIN_LENGTH} characters.`
    });
  }

  try {
    const patient = await get(`SELECT id, name FROM patients WHERE id = ?`, [patientId]);
    if (!patient) return next({ status: 404, code: 'NOT_FOUND' });

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: patientId,
      action: `BREAK_GLASS:patient:${patientId}:reason:${justification.substring(0, 200)}`,
      new_state: JSON.stringify({ justification: justification.substring(0, 200) })
    });

    // Notify admin of break-glass
    await writeNotification({
      type: 'critical',
      title: '⚠️ Break-Glass Override Used',
      body: `${req.user.id} invoked emergency override for ${patient.name}: "${justification.substring(0, 80)}"`,
      patient_id: patientId,
      actor_id: req.user.id,
      target_role: 'ADMIN'
    });

    res.json({
      acknowledged: true,
      message: 'Emergency access request recorded and admin notified. Finalized records are visible in the patient dossier. To transfer active case ownership, ask admin to reassign this encounter.',
      patientId, actor: req.user.id, timestamp: new Date().toISOString()
    });
  } catch (err) { next(err); }
});

module.exports = router;
