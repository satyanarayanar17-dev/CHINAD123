const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { requireAuth, requireRole, clearRevocationCache } = require('../middleware/auth');
const { get, all, run } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { getStaffDepartments, resolveStaffDepartment } = require('../lib/staffDepartments');

const router = express.Router();

const PASSWORD_MIN_LENGTH = 8;
const BCRYPT_COST = 10;
const TEMP_PASSWORD_LENGTH = 18;
const ALLOWED_ROLES = ['NURSE', 'DOCTOR', 'ADMIN'];
const EDITABLE_PROFILE_FIELDS = ['fullName', 'name', 'role', 'department'];

function normalizeWhitespace(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeUserId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isUniqueConstraintError(err) {
  return err?.code === 'SQLITE_CONSTRAINT' || err?.code === '23505';
}

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*+-_=';
  const bytes = crypto.randomBytes(TEMP_PASSWORD_LENGTH);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function toDirectoryUser(user) {
  return {
    ...user,
    status: user.is_active === 1 ? 'ACTIVE' : 'INACTIVE'
  };
}

function normalizeRole(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function hasOwnPayloadField(body, fieldName) {
  return Boolean(body && Object.prototype.hasOwnProperty.call(body, fieldName));
}

async function getStaffDirectoryUser(userId) {
  return get(
    `SELECT id,
            role,
            name,
            department,
            is_active,
            created_at,
            updated_at
     FROM users
     WHERE id = ? AND role IN ('ADMIN', 'DOCTOR', 'NURSE')`,
    [userId]
  );
}

async function countActiveAdmins() {
  const row = await get(
    `SELECT COUNT(*) AS count
     FROM users
     WHERE role = 'ADMIN' AND is_active = 1`
  );
  return Number(row?.count || 0);
}

async function ensureAdminContinuity({ targetUser, nextRole = targetUser.role, nextIsActive = targetUser.is_active }) {
  const isRemovingLastActiveAdmin =
    targetUser.role === 'ADMIN' &&
    targetUser.is_active === 1 &&
    (nextRole !== 'ADMIN' || nextIsActive !== 1);

  if (!isRemovingLastActiveAdmin) {
    return;
  }

  const activeAdminCount = await countActiveAdmins();
  if (activeAdminCount <= 1) {
    throw {
      status: 409,
      code: 'LAST_ACTIVE_ADMIN_PROTECTED',
      message: 'This action would remove the last active administrator account.'
    };
  }
}

async function ensureRoleChangeAllowed({ currentUser, nextRole, actorId }) {
  await ensureAdminContinuity({ targetUser: currentUser, nextRole, nextIsActive: currentUser.is_active });

  if (currentUser.id === actorId && nextRole !== currentUser.role) {
    throw {
      status: 400,
      code: 'SELF_ROLE_CHANGE',
      message: 'Administrators cannot change their own role.'
    };
  }

  if (currentUser.role === 'DOCTOR' && nextRole !== 'DOCTOR') {
    const activeAssignments = await get(
      `SELECT COUNT(*) AS count
       FROM encounters
       WHERE assigned_doctor_id = ? AND is_discharged = 0`,
      [currentUser.id]
    );

    if (Number(activeAssignments?.count || 0) > 0) {
      throw {
        status: 409,
        code: 'ROLE_CHANGE_BLOCKED',
        message: 'Cannot change role while this doctor is assigned to active encounters.'
      };
    }
  }
}

router.get('/departments', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  res.json(getStaffDepartments());
});

/**
 * GET /api/admin/users
 * List all staff accounts (id, role, name, department, is_active — NO password hashes)
 */
router.get('/users', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const users = await all(
      `SELECT id,
              role,
              name,
              department,
              is_active,
              created_at,
              updated_at
       FROM users
       WHERE role IN ('ADMIN', 'DOCTOR', 'NURSE')
       ORDER BY CASE role
         WHEN 'ADMIN' THEN 0
         WHEN 'DOCTOR' THEN 1
         WHEN 'NURSE' THEN 2
         ELSE 3
       END, name`
    );
    res.json(users.map(toDirectoryUser));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/users
 * Create a new staff account with hashed password.
 * Body: { username|loginId|id, role, fullName|name, password, department? }
 */
router.post('/users', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  const userId = normalizeUserId(req.body?.username || req.body?.loginId || req.body?.id);
  const role = typeof req.body?.role === 'string' ? req.body.role.trim().toUpperCase() : '';
  const name = normalizeWhitespace(req.body?.fullName || req.body?.name);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const rawDepartment = normalizeWhitespace(req.body?.department);
  const resolvedDepartment = rawDepartment ? resolveStaffDepartment(rawDepartment) : null;

  // Input validation
  if (!userId || !role || !name || !password) {
    return next({
      status: 400,
      code: 'MISSING_FIELDS',
      message: 'username/login ID, role, full name, and password are all required.'
    });
  }

  if (/\s/.test(userId)) {
    return next({
      status: 400,
      code: 'INVALID_USERNAME',
      message: 'username/login ID cannot contain spaces.'
    });
  }

  if (!ALLOWED_ROLES.includes(role)) {
    return next({ status: 400, code: 'INVALID_ROLE', message: `Role must be one of: ${ALLOWED_ROLES.join(', ')}` });
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return next({ status: 400, code: 'WEAK_PASSWORD', message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` });
  }

  if (role === 'DOCTOR' && !rawDepartment) {
    return next({
      status: 400,
      code: 'DEPARTMENT_REQUIRED',
      message: 'Doctors must be assigned to a department.'
    });
  }

  if (role === 'DOCTOR' && !resolvedDepartment) {
    return next({
      status: 400,
      code: 'INVALID_DEPARTMENT',
      message: 'Selected department is invalid.'
    });
  }

  if (role !== 'DOCTOR' && rawDepartment) {
    return next({
      status: 400,
      code: 'DEPARTMENT_NOT_ALLOWED',
      message: 'Department can only be assigned when creating a doctor account.'
    });
  }

  try {
    // Check for existing user
    const existing = await get(`SELECT id FROM users WHERE id = ?`, [userId]);
    if (existing) {
      return next({ status: 409, code: 'USER_EXISTS', message: 'A user with this username/login ID already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    await run(
      `INSERT INTO users (id, role, name, password_hash, is_active, department, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userId, role, name, passwordHash, resolvedDepartment]
    );

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `ADMIN_USER_CREATE:${userId}:role:${role}:by:${req.user.id}`,
      new_state: JSON.stringify({ user_id: userId, role, name, department: resolvedDepartment })
    });

    res.status(201).json({
      userId,
      username: userId,
      role,
      name,
      department: resolvedDepartment,
      created: true
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return next({ status: 409, code: 'USER_EXISTS', message: 'A user with this username/login ID already exists.' });
    }
    next(err);
  }
});

/**
 * PATCH /api/admin/users/:userId
 * Edit a persisted staff account. Username changes are intentionally blocked
 * because users.id is the current auth primary key.
 */
router.patch('/users/:userId', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  const { userId } = req.params;
  const requestedUsername = normalizeUserId(req.body?.username || req.body?.loginId || req.body?.id);
  const nextName = hasOwnPayloadField(req.body, 'fullName') || hasOwnPayloadField(req.body, 'name')
    ? normalizeWhitespace(req.body?.fullName || req.body?.name)
    : null;
  const nextRole = hasOwnPayloadField(req.body, 'role') ? normalizeRole(req.body?.role) : null;
  const rawDepartment = hasOwnPayloadField(req.body, 'department')
    ? normalizeWhitespace(req.body?.department)
    : null;
  const includesUnsupportedFields = Object.keys(req.body || {}).some((field) => {
    if (['username', 'loginId', 'id'].includes(field)) {
      return false;
    }
    return !EDITABLE_PROFILE_FIELDS.includes(field);
  });

  if (requestedUsername && requestedUsername !== userId) {
    return next({
      status: 400,
      code: 'USERNAME_IMMUTABLE',
      message: 'Username/login ID changes are not supported because the current auth schema uses it as the primary key.'
    });
  }

  if (includesUnsupportedFields) {
    return next({
      status: 400,
      code: 'UNSUPPORTED_FIELDS',
      message: 'Only full name, role, and department can be edited on staff accounts.'
    });
  }

  if (nextName !== null && !nextName) {
    return next({
      status: 400,
      code: 'INVALID_NAME',
      message: 'Full name cannot be empty.'
    });
  }

  if (nextRole !== null && !ALLOWED_ROLES.includes(nextRole)) {
    return next({
      status: 400,
      code: 'INVALID_ROLE',
      message: `Role must be one of: ${ALLOWED_ROLES.join(', ')}`
    });
  }

  try {
    const currentUser = await get(`SELECT * FROM users WHERE id = ? AND role IN ('ADMIN', 'DOCTOR', 'NURSE')`, [userId]);
    if (!currentUser) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'User not found.' });
    }

    const resolvedRole = nextRole || currentUser.role;
    const resolvedDepartment = hasOwnPayloadField(req.body, 'department')
      ? (rawDepartment ? resolveStaffDepartment(rawDepartment) : null)
      : currentUser.department || null;

    if (resolvedRole === 'DOCTOR' && !resolvedDepartment) {
      return next({
        status: 400,
        code: 'DEPARTMENT_REQUIRED',
        message: 'Doctors must be assigned to a department.'
      });
    }

    if (rawDepartment && !resolveStaffDepartment(rawDepartment)) {
      return next({
        status: 400,
        code: 'INVALID_DEPARTMENT',
        message: 'Selected department is invalid.'
      });
    }

    if (resolvedRole !== 'DOCTOR' && hasOwnPayloadField(req.body, 'department') && rawDepartment) {
      return next({
        status: 400,
        code: 'DEPARTMENT_NOT_ALLOWED',
        message: 'Department can only be assigned when the role is DOCTOR.'
      });
    }

    await ensureRoleChangeAllowed({ currentUser, nextRole: resolvedRole, actorId: req.user.id });

    const updatedName = nextName ?? currentUser.name;
    const updatedDepartment = resolvedRole === 'DOCTOR' ? resolvedDepartment : null;

    const hasChanges =
      updatedName !== currentUser.name ||
      resolvedRole !== currentUser.role ||
      updatedDepartment !== (currentUser.department || null);

    if (!hasChanges) {
      const unchangedUser = await getStaffDirectoryUser(userId);
      return res.json({
        user: toDirectoryUser(unchangedUser),
        updated: false
      });
    }

    await run(
      `UPDATE users
       SET name = ?,
           role = ?,
           department = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [updatedName, resolvedRole, updatedDepartment, userId]
    );

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `ADMIN_USER_UPDATE:${userId}:by:${req.user.id}`,
      prior_state: JSON.stringify({
        name: currentUser.name,
        role: currentUser.role,
        department: currentUser.department || null,
        is_active: currentUser.is_active
      }),
      new_state: JSON.stringify({
        name: updatedName,
        role: resolvedRole,
        department: updatedDepartment,
        is_active: currentUser.is_active
      })
    });

    const updatedUser = await getStaffDirectoryUser(userId);
    return res.json({
      user: toDirectoryUser(updatedUser),
      updated: true,
      usernameEditable: false
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/users/:userId/disable
 * Deactivate a staff account. Does not delete the record.
 */
router.patch('/users/:userId/disable', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  const { userId } = req.params;

  try {
    const user = await get(`SELECT id, role, name, department, is_active FROM users WHERE id = ?`, [userId]);
    if (!user) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'User not found.' });
    }

    if (user.is_active === 0) {
      return next({ status: 422, code: 'ALREADY_DISABLED', message: 'Account is already disabled.' });
    }

    await ensureAdminContinuity({ targetUser: user, nextRole: user.role, nextIsActive: 0 });

    // Prevent self-disable after the continuity protection check so the
    // last-admin case returns the stronger lockout-specific error.
    if (userId === req.user.id) {
      return next({ status: 400, code: 'SELF_DISABLE', message: 'Administrators cannot disable their own account.' });
    }

    await run(`UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [userId]);

    // Insert / overwrite a revocation record so any live JWTs for this user
    // are rejected by requireAuth within the 60-second cache TTL window.
    await run(`DELETE FROM revoked_tokens WHERE user_id = ?`, [userId]);
    await run(`INSERT INTO revoked_tokens (user_id, revoked_at) VALUES (?, CURRENT_TIMESTAMP)`, [userId]);

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `ADMIN_USER_DISABLE:${userId}:by:${req.user.id}`,
      prior_state: JSON.stringify({
        role: user.role,
        name: user.name,
        department: user.department || null,
        is_active: 1
      }),
      new_state: JSON.stringify({
        role: user.role,
        name: user.name,
        department: user.department || null,
        is_active: 0
      })
    });

    res.json({ userId, disabled: true });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/users/:userId/enable
 * Re-activate a disabled staff account.
 */
router.patch('/users/:userId/enable', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  const { userId } = req.params;

  try {
    const user = await get(`SELECT id, role, name, department, is_active FROM users WHERE id = ?`, [userId]);
    if (!user) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'User not found.' });
    }

    if (user.is_active === 1) {
      return next({ status: 422, code: 'ALREADY_ACTIVE', message: 'Account is already active.' });
    }

    await run(`UPDATE users SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [userId]);

    // Remove the revocation record and clear the in-process cache so that
    // freshly-issued tokens for this user are accepted immediately.
    await run(`DELETE FROM revoked_tokens WHERE user_id = ?`, [userId]);
    clearRevocationCache(userId);

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `ADMIN_USER_ENABLE:${userId}:by:${req.user.id}`,
      prior_state: JSON.stringify({
        role: user.role,
        name: user.name,
        department: user.department || null,
        is_active: 0
      }),
      new_state: JSON.stringify({
        role: user.role,
        name: user.name,
        department: user.department || null,
        is_active: 1
      })
    });

    res.json({ userId, enabled: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/users/:userId/reset-password
 * Admin-driven password reset. Replaces password hash immediately.
 */
router.post('/users/:userId/reset-password', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  const { userId } = req.params;

  try {
    const user = await get(`SELECT id, role, name, department, must_change_password FROM users WHERE id = ?`, [userId]);
    if (!user) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'User not found.' });
    }

    const temporaryPassword = generateTemporaryPassword();
    const newHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);
    await run(
      `UPDATE users
       SET password_hash = ?, must_change_password = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newHash, userId]
    );

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `ADMIN_PASS_RESET:${userId}:by:${req.user.id}`,
      prior_state: JSON.stringify({
        role: user.role,
        name: user.name,
        department: user.department || null,
        must_change_password: user.must_change_password === 1
      }),
      new_state: JSON.stringify({
        role: user.role,
        name: user.name,
        department: user.department || null,
        must_change_password: true
      })
    });

    res.json({
      userId,
      reset: true,
      temporaryPassword,
      must_change_password: true,
      message: 'Temporary password generated. Share it securely with the staff member.'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/encounters/:encounterId/reassign
 *
 * Admin-only emergency encounter reassignment. Transfers ownership of any
 * active encounter to a different doctor regardless of lifecycle phase.
 * This is the legitimate escape valve for cases where a patient is
 * IN_CONSULTATION and the assigned doctor becomes unavailable — the normal
 * nurse triage handoff path blocks reassignment in that phase.
 *
 * Full audit trail: prior and new assigned_doctor_id are both recorded.
 * OCC: uses __v to detect concurrent modifications.
 */
router.post('/encounters/:encounterId/reassign', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  const { encounterId } = req.params;
  const { doctorId } = req.body;

  if (!doctorId || typeof doctorId !== 'string' || !doctorId.trim()) {
    return next({ status: 400, code: 'DOCTOR_ID_REQUIRED', message: 'doctorId is required.' });
  }

  try {
    const encounter = await get(`SELECT * FROM encounters WHERE id = ?`, [encounterId]);
    if (!encounter) {
      return next({ status: 404, code: 'NOT_FOUND', message: 'Encounter not found.' });
    }

    if (encounter.is_discharged) {
      return next({ status: 422, code: 'ENCOUNTER_CLOSED', message: 'Cannot reassign a discharged encounter.' });
    }

    const doctor = await get(
      `SELECT id, name, role, is_active FROM users WHERE id = ?`,
      [doctorId.trim()]
    );

    if (!doctor || doctor.role !== 'DOCTOR') {
      return next({ status: 404, code: 'DOCTOR_NOT_FOUND', message: 'Target doctor not found.' });
    }

    if (doctor.is_active !== 1) {
      return next({ status: 422, code: 'DOCTOR_UNAVAILABLE', message: 'Target doctor account is inactive.' });
    }

    const previousDoctorId = encounter.assigned_doctor_id || null;

    const result = await run(
      `UPDATE encounters SET assigned_doctor_id = ?, __v = __v + 1 WHERE id = ? AND __v = ?`,
      [doctor.id, encounterId, encounter.__v]
    );

    if (result.changes === 0) {
      return next({ status: 409, code: 'STALE_STATE', message: 'Encounter was modified concurrently. Please retry.' });
    }

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: encounter.patient_id,
      action: `ADMIN_ENCOUNTER_REASSIGN:${encounterId}:from:${previousDoctorId || 'UNASSIGNED'}:to:${doctor.id}:by:${req.user.id}`,
      prior_state: JSON.stringify({ assigned_doctor_id: previousDoctorId, __v: encounter.__v }),
      new_state: JSON.stringify({ assigned_doctor_id: doctor.id, __v: encounter.__v + 1 })
    });

    res.json({
      encounterId,
      previousDoctorId,
      newDoctorId: doctor.id,
      newDoctorName: doctor.name,
      reassigned: true
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
