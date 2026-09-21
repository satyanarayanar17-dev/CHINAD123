const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, all, run, withTransaction } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { randomUUID } = require('crypto');

const router = express.Router();

function getTodayString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Ensure patient has an active care plan
async function ensureCarePlan(patientId, doctorId, tx) {
  let plan = await tx.get(`SELECT * FROM care_plans WHERE patient_id = ? AND status = 'ACTIVE' LIMIT 1`, [patientId]);
  if (!plan) {
    const planId = `cp-${Date.now()}-${randomUUID().slice(0, 4)}`;
    await tx.run(
      `INSERT INTO care_plans (id, patient_id, doctor_id, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [planId, patientId, doctorId]
    );
    plan = { id: planId, patient_id: patientId, doctor_id: doctorId };
  }
  return plan;
}

// GET /api/v1/opd/care-plans/:patientId
router.get('/:patientId', requireAuth, async (req, res, next) => {
  const { patientId } = req.params;
  
  if (req.user.role === 'PATIENT' && req.user.patient_id !== patientId) {
    return next({ status: 403, code: 'FORBIDDEN', message: 'You can only access your own care plan.' });
  }

  try {
    const plan = await get(`SELECT * FROM care_plans WHERE patient_id = ? AND status = 'ACTIVE' LIMIT 1`, [patientId]);
    if (!plan) return res.json({ tasks: [] });

    const tasks = await all(`SELECT * FROM care_plan_tasks WHERE plan_id = ? AND active = 1 ORDER BY scheduled_time ASC`, [plan.id]);
    res.json({ plan, tasks });
  } catch (err) { next(err); }
});

// POST /api/v1/opd/care-plans/:patientId/tasks
router.post('/:patientId/tasks', requireAuth, requireRole(['DOCTOR']), async (req, res, next) => {
  const { patientId } = req.params;
  const { task_type, title, description, target_metric, frequency_rule, scheduled_time, start_date, end_date } = req.body;
  
  try {
    const taskId = `cpt-${Date.now()}`;
    await withTransaction(async (tx) => {
      const plan = await ensureCarePlan(patientId, req.user.id, tx);
      await tx.run(
        `INSERT INTO care_plan_tasks (id, plan_id, task_type, title, description, target_metric, frequency_rule, scheduled_time, start_date, end_date, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [taskId, plan.id, task_type, title, description, target_metric, frequency_rule, scheduled_time, start_date, end_date]
      );
    });

    await writeAuditDirect({
      correlation_id: req.correlationId,
      actor_id: req.user.id,
      patient_id: patientId,
      action: `CARE_PLAN_TASK_ADDED`,
      new_state: JSON.stringify({ task_id: taskId, type: task_type })
    });

    res.json({ success: true, taskId });
  } catch (err) { next(err); }
});

module.exports = router;
