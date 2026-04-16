const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createRateLimiter } = require('../middleware/rateLimit');
const { requireAuth, requireRole, clearRevocationCache, setRevocationCache } = require('../middleware/auth');
const { get, all, run, withTransaction } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { getStaffDepartments, resolveStaffDepartment } = require('../lib/staffDepartments');

const router = express.Router();

const PASSWORD_MIN_LENGTH = 8;
const BCRYPT_COST = 10;
const TEMP_PASSWORD_LENGTH = 18;
const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;
const ALLOWED_ROLES = ['NURSE', 'DOCTOR', 'ADMIN'];
const EDITABLE_PROFILE_FIELDS = ['fullName', 'name', 'role', 'department'];

const passwordResetRateLimit = createRateLimiter({
  max: 3,
  windowMs: 15 * 60 * 1000,
  keyFn: (req) => {
    const actorId = req.user?.id || 'unknown-admin';
    const targetId = normalizeUserId(req.params?.userId) || 'unknown-user';
    return [
      `admin:password-reset:actor:${actorId}`,
      `admin:password-reset:target:${targetId}`
    ];
  },
  message: 'Too many password reset requests. Please wait before trying again.'
});

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

function passwordResetCooldownSeconds(passwordResetAt) {
  if (!passwordResetAt) {
    return 0;
  }

  const retryAfterMs = (new Date(passwordResetAt).getTime() + PASSWORD_RESET_COOLDOWN_MS) - Date.now();
  return retryAfterMs > 0 ? Math.ceil(retryAfterMs / 1000) : 0;
}

async function countActiveAdmins(context = { get }) {
  const row = await context.get(
    `SELECT COUNT(*) AS count
     FROM users
     WHERE role = 'ADMIN' AND is_active = 1`
  );
  return Number(row?.count || 0);
}

async function ensureAdminContinuity({
  context = { get },
  targetUser,
  nextRole = targetUser.role,
  nextIsActive = targetUser.is_active
}) {
  const isRemovingLastActiveAdmin =
    targetUser.role === 'ADMIN' &&
    targetUser.is_active === 1 &&
    (nextRole !== 'ADMIN' || nextIsActive !== 1);

  if (!isRemovingLastActiveAdmin) {
    return;
  }

  const activeAdminCount = await countActiveAdmins(context);
  if (activeAdminCount <= 1) {
    throw {
      status: 409,
      code: 'LAST_ACTIVE_ADMIN_PROTECTED',
      message: 'This action would remove the last active administrator account.'
    };
  }
}

async function ensureRoleChangeAllowed({ context = { get }, currentUser, nextRole, actorId }) {
  await ensureAdminContinuity({
    context,
    targetUser: currentUser,
    nextRole,
    nextIsActive: currentUser.is_active
  });

  if (currentUser.id === actorId && nextRole !== currentUser.role) {
    throw {
      status: 400,
      code: 'SELF_ROLE_CHANGE',
      message: 'Administrators cannot change their own role.'
    };
  }

  if (currentUser.role === 'DOCTOR' && nextRole !== 'DOCTOR') {
    const activeAssignments = await context.get(
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
    const result = await withTransaction(async (tx) => {
      const currentUser = await tx.get(
        `SELECT * FROM users WHERE id = ? AND role IN ('ADMIN', 'DOCTOR', 'NURSE')`,
        [userId]
      );
      if (!currentUser) {
        throw { status: 404, code: 'NOT_FOUND', message: 'User not found.' };
      }

      const resolvedRole = nextRole || currentUser.role;
      const resolvedDepartment = hasOwnPayloadField(req.body, 'department')
        ? (rawDepartment ? resolveStaffDepartment(rawDepartment) : null)
        : currentUser.department || null;

      if (resolvedRole === 'DOCTOR' && !resolvedDepartment) {
        throw {
          status: 400,
          code: 'DEPARTMENT_REQUIRED',
          message: 'Doctors must be assigned to a department.'
        };
      }

      if (rawDepartment && !resolveStaffDepartment(rawDepartment)) {
        throw {
          status: 400,
          code: 'INVALID_DEPARTMENT',
          message: 'Selected department is invalid.'
        };
      }

      if (resolvedRole !== 'DOCTOR' && hasOwnPayloadField(req.body, 'department') && rawDepartment) {
        throw {
          status: 400,
          code: 'DEPARTMENT_NOT_ALLOWED',
          message: 'Department can only be assigned when the role is DOCTOR.'
        };
      }

      await ensureRoleChangeAllowed({
        context: tx,
        currentUser,
        nextRole: resolvedRole,
        actorId: req.user.id
      });

      const updatedName = nextName ?? currentUser.name;
      const updatedDepartment = resolvedRole === 'DOCTOR' ? resolvedDepartment : null;

      const hasChanges =
        updatedName !== currentUser.name ||
        resolvedRole !== currentUser.role ||
        updatedDepartment !== (currentUser.department || null);

      if (!hasChanges) {
        return {
          currentUser,
          updated: false,
          user: await tx.get(
            `SELECT id, role, name, department, is_active, created_at, updated_at
             FROM users
             WHERE id = ? AND role IN ('ADMIN', 'DOCTOR', 'NURSE')`,
            [userId]
          )
        };
      }

      let updateQuery = `UPDATE users
        SET name = ?,
            role = ?,
            department = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`;
      const updateParams = [updatedName, resolvedRole, updatedDepartment, userId];

      if (currentUser.role === 'DOCTOR' && resolvedRole !== 'DOCTOR') {
        updateQuery += `
          AND NOT EXISTS (
            SELECT 1 FROM encounters
            WHERE assigned_doctor_id = ?
              AND is_discharged = 0
          )`;
        updateParams.push(userId);
      }

      if (currentUser.role === 'ADMIN' && resolvedRole !== 'ADMIN') {
        updateQuery += `
          AND EXISTS (
            SELECT 1 FROM users
            WHERE role = 'ADMIN'
              AND is_active = 1
              AND id != ?
          )`;
        updateParams.push(userId);
      }

      const updateResult = await tx.run(updateQuery, updateParams);
      if (updateResult.changes === 0) {
        if (currentUser.role === 'ADMIN' && resolvedRole !== 'ADMIN') {
          throw {
            status: 409,
            code: 'LAST_ACTIVE_ADMIN_PROTECTED',
            message: 'This action would remove the last active administrator account.'
          };
        }
        throw {
          status: 409,
          code: 'ROLE_CHANGE_BLOCKED',
          message: 'Cannot change role while this doctor is assigned to active encounters.'
        };
      }

      const updatedUser = await tx.get(
        `SELECT id, role, name, department, is_active, created_at, updated_at
         FROM users
         WHERE id = ? AND role IN ('ADMIN', 'DOCTOR', 'NURSE')`,
        [userId]
      );

      return {
        currentUser,
        updated: true,
        user: updatedUser
      };
    });

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      action: `ADMIN_USER_UPDATE:${userId}:by:${req.user.id}`,
      prior_state: JSON.stringify({
        name: result.currentUser.name,
        role: result.currentUser.role,
        department: result.currentUser.department || null,
        is_active: result.currentUser.is_active
      }),
      new_state: JSON.stringify({
        name: result.user.name,
        role: result.user.role,
        department: result.user.department || null,
        is_active: result.user.is_active
      })
    });

    return res.json({
      user: toDirectoryUser(result.user),
      updated: result.updated,
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
    const { user, revokedAt } = await withTransaction(async (tx) => {
      const currentUser = await tx.get(
        `SELECT id, role, name, department, is_active
         FROM users
         WHERE id = ? AND role IN ('ADMIN', 'DOCTOR', 'NURSE')`,
        [userId]
      );
      if (!currentUser) {
        throw { status: 404, code: 'NOT_FOUND', message: 'User not found.' };
      }

      if (currentUser.is_active === 0) {
        throw { status: 422, code: 'ALREADY_DISABLED', message: 'Account is already disabled.' };
      }

      await ensureAdminContinuity({
        context: tx,
        targetUser: currentUser,
        nextRole: currentUser.role,
        nextIsActive: 0
      });

      if (userId === req.user.id) {
        throw { status: 400, code: 'SELF_DISABLE', message: 'Administrators cannot disable their own account.' };
      }

      const disableQuery = currentUser.role === 'ADMIN'
        ? `UPDATE users
           SET is_active = 0, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?
             AND is_active = 1
             AND EXISTS (
               SELECT 1 FROM users
               WHERE role = 'ADMIN'
                 AND is_active = 1
                 AND id != ?
             )`
        : `UPDATE users
           SET is_active = 0, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND is_active = 1`;
      const disableParams = currentUser.role === 'ADMIN'
        ? [userId, userId]
        : [userId];
      const updateResult = await tx.run(disableQuery, disableParams);

      if (updateResult.changes === 0) {
        if (currentUser.role === 'ADMIN') {
          throw {
            status: 409,
            code: 'LAST_ACTIVE_ADMIN_PROTECTED',
            message: 'This action would remove the last active administrator account.'
          };
        }
        throw { status: 409, code: 'STATE_CHANGED', message: 'Account state changed concurrently. Please reload and try again.' };
      }

      const revokedAtValue = new Date().toISOString();
      await tx.run(`UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0`, [userId]);
      await tx.run(`DELETE FROM revoked_tokens WHERE user_id = ?`, [userId]);
      await tx.run(`INSERT INTO revoked_tokens (user_id, revoked_at) VALUES (?, ?)`, [userId, revokedAtValue]);

      return {
        user: currentUser,
        revokedAt: revokedAtValue
      };
    });

    setRevocationCache(userId, revokedAt);

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
    const user = await withTransaction(async (tx) => {
      const currentUser = await tx.get(
        `SELECT id, role, name, department, is_active
         FROM users
         WHERE id = ? AND role IN ('ADMIN', 'DOCTOR', 'NURSE')`,
        [userId]
      );
      if (!currentUser) {
        throw { status: 404, code: 'NOT_FOUND', message: 'User not found.' };
      }

      if (currentUser.is_active === 1) {
        throw { status: 422, code: 'ALREADY_ACTIVE', message: 'Account is already active.' };
      }

      const updateResult = await tx.run(
        `UPDATE users
         SET is_active = 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND is_active = 0`,
        [userId]
      );

      if (updateResult.changes === 0) {
        throw { status: 409, code: 'STATE_CHANGED', message: 'Account state changed concurrently. Please reload and try again.' };
      }

      await tx.run(`DELETE FROM revoked_tokens WHERE user_id = ?`, [userId]);
      return currentUser;
    });

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
router.post('/users/:userId/reset-password', requireAuth, requireRole(['ADMIN']), passwordResetRateLimit, async (req, res, next) => {
  const { userId } = req.params;

  try {
    const temporaryPassword = generateTemporaryPassword();
    const newHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);
    const { user, revokedAt } = await withTransaction(async (tx) => {
      const currentUser = await tx.get(
        `SELECT id, role, name, department, must_change_password, password_reset_at
         FROM users
         WHERE id = ? AND role IN ('ADMIN', 'DOCTOR', 'NURSE')`,
        [userId]
      );

      if (!currentUser) {
        throw { status: 404, code: 'NOT_FOUND', message: 'User not found.' };
      }

      const retryAfterSeconds = passwordResetCooldownSeconds(currentUser.password_reset_at);
      if (retryAfterSeconds > 0) {
        throw {
          status: 409,
          code: 'PASSWORD_RESET_PENDING',
          message: 'A password reset was issued moments ago. Share the existing temporary password or wait before generating another one.',
          retry_after_seconds: retryAfterSeconds
        };
      }

      const issuedAt = new Date().toISOString();
      const updateQuery = currentUser.password_reset_at
        ? `UPDATE users
           SET password_hash = ?,
               must_change_password = 1,
               password_reset_at = ?,
               updated_at = ?
           WHERE id = ? AND password_reset_at = ?`
        : `UPDATE users
           SET password_hash = ?,
               must_change_password = 1,
               password_reset_at = ?,
               updated_at = ?
           WHERE id = ? AND password_reset_at IS NULL`;
      const updateParams = currentUser.password_reset_at
        ? [newHash, issuedAt, issuedAt, userId, currentUser.password_reset_at]
        : [newHash, issuedAt, issuedAt, userId];
      const updateResult = await tx.run(
        updateQuery,
        updateParams
      );

      if (updateResult.changes === 0) {
        throw {
          status: 409,
          code: 'PASSWORD_RESET_PENDING',
          message: 'A password reset is already being processed for this account. Share the existing temporary password or retry shortly.'
        };
      }

      await tx.run(`UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0`, [userId]);
      const revokedAtValue = new Date().toISOString();
      await tx.run(`DELETE FROM revoked_tokens WHERE user_id = ?`, [userId]);
      await tx.run(`INSERT INTO revoked_tokens (user_id, revoked_at) VALUES (?, ?)`, [userId, revokedAtValue]);

      return {
        user: currentUser,
        revokedAt: revokedAtValue
      };
    });

    setRevocationCache(userId, revokedAt);

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
