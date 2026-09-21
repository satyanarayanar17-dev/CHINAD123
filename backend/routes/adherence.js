const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { get, all, run, withTransaction } = require('../database');
const { writeAuditDirect } = require('../middleware/audit');
const { randomUUID } = require('crypto');

const router = express.Router();

function getTodayString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Ensure today's adherence records are generated for active tasks
async function ensureTodaysAdherence(patientId, tx) {
  const today = getTodayString();
  const plan = await tx.get(`SELECT id FROM care_plans WHERE patient_id = ? AND status = 'ACTIVE' LIMIT 1`, [patientId]);
  if (!plan) return [];

  const tasks = await tx.all(`SELECT * FROM care_plan_tasks WHERE plan_id = ? AND active = 1`, [plan.id]);
  const existingAdherence = await tx.all(`SELECT * FROM care_plan_adherence WHERE patient_id = ? AND due_date = ?`, [patientId, today]);
  const existingTaskIds = new Set(existingAdherence.map(a => a.task_id));

  const newRecords = [];
  for (const task of tasks) {
    // Basic daily rule for now - generates if missing for today
    if (!existingTaskIds.has(task.id)) {
      const adherenceId = `cpa-${Date.now()}-${randomUUID().slice(0, 4)}`;
      await tx.run(
        `INSERT INTO care_plan_adherence (id, task_id, patient_id, due_date, due_time, status) VALUES (?, ?, ?, ?, ?, 'PENDING')`,
        [adherenceId, task.id, patientId, today, task.scheduled_time]
      );
      newRecords.push({
        id: adherenceId, task_id: task.id, patient_id: patientId, due_date: today, due_time: task.scheduled_time, status: 'PENDING'
      });
    }
  }
  
  return [...existingAdherence, ...newRecords];
}

// GET /api/v1/opd/adherence/:patientId/today
router.get('/:patientId/today', requireAuth, async (req, res, next) => {
  const { patientId } = req.params;
  
  if (req.user.role === 'PATIENT' && req.user.patient_id !== patientId) {
    return next({ status: 403, code: 'FORBIDDEN', message: 'You can only access your own adherence.' });
  }

  try {
    const today = getTodayString();
    await withTransaction(async (tx) => {
      await ensureTodaysAdherence(patientId, tx);
    });

    const tasksAndAdherence = await all(`
      SELECT a.*, t.task_type, t.title, t.description, t.target_metric
      FROM care_plan_adherence a
      JOIN care_plan_tasks t ON a.task_id = t.id
      WHERE a.patient_id = ? AND a.due_date = ?
      ORDER BY a.due_time ASC, t.title ASC
    `, [patientId, today]);

    res.json(tasksAndAdherence);
  } catch (err) { next(err); }
});

// GET /api/v1/opd/adherence/:patientId/timeline
router.get('/:patientId/timeline', requireAuth, async (req, res, next) => {
  const { patientId } = req.params;
  
  if (req.user.role === 'PATIENT' && req.user.patient_id !== patientId) {
    return next({ status: 403, code: 'FORBIDDEN', message: 'You can only access your own timeline.' });
  }

  try {
    const timeline = await all(`
      SELECT a.*, t.task_type, t.title
      FROM care_plan_adherence a
      JOIN care_plan_tasks t ON a.task_id = t.id
      WHERE a.patient_id = ? AND a.status IN ('COMPLETED', 'RECORDED', 'MISSED', 'SKIPPED')
      ORDER BY a.recorded_at DESC, a.due_date DESC, a.due_time DESC
      LIMIT 100
    `, [patientId]);
    res.json(timeline);
  } catch (err) { next(err); }
});

// POST /api/v1/opd/adherence/:adherenceId/record
router.post('/:adherenceId/record', requireAuth, async (req, res, next) => {
  const { adherenceId } = req.params;
  const { status, value, note } = req.body;
  
  try {
    let result;
    await withTransaction(async (tx) => {
      const adherence = await tx.get(`SELECT * FROM care_plan_adherence WHERE id = ?`, [adherenceId]);
      if (!adherence) throw { status: 404, code: 'NOT_FOUND' };
      
      if (req.user.role === 'PATIENT' && adherence.patient_id !== req.user.patient_id) {
        throw { status: 403, code: 'FORBIDDEN' };
      }

      const task = await tx.get(`SELECT * FROM care_plan_tasks WHERE id = ?`, [adherence.task_id]);

      await tx.run(
        `UPDATE care_plan_adherence SET status = ?, recorded_value = ?, patient_note = ?, recorded_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, value || null, note || null, adherenceId]
      );

      if (status === 'RECORDED' && task.target_metric && value) {
        const obsId = `obs-${Date.now()}-${randomUUID().slice(0, 4)}`;
        await tx.run(
          `INSERT INTO patient_observations (id, patient_id, metric, value, recorded_at, source, adherence_id) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'PATIENT_APP', ?)`,
          [obsId, adherence.patient_id, task.target_metric, value, adherenceId]
        );
      }
      result = { success: true };
    });
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
