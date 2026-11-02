const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { db, transaction, endpoint, parse, now, day, id, fail, roles, actor, patientAccess, audit } = require('../opd/core.ts');
const { patientDocumentStorage } = require('../lib/patientDocumentStorage');

const router = express.Router();
router.use(requireAuth);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 8 },
  fileFilter: (_req, file, callback) => callback(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype))
});
const metadataSchema = z.object({
  document_type: z.enum(['LAB_REPORT', 'SCAN', 'PRESCRIPTION', 'DISCHARGE_SUMMARY', 'REFERRAL', 'OTHER_MEDICAL_RECORD']),
  title: z.string().trim().min(1).max(200),
  clinical_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(new Date(value).getTime()) && new Date(value).toISOString().slice(0, 10) === value && value <= day()),
  appointment_id: z.string().trim().min(1).optional(),
  patient_note: z.string().trim().max(1000).optional(),
}).strict();
const appointmentLinkSchema = z.object({
  appointment_id: z.string().trim().min(1).nullable()
}).strict();

function detectedMime(buffer) {
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  return null;
}

async function resolvePatientId(req) {
  const requested = String(req.params.patientId);
  if (req.user.role !== 'PATIENT' || requested !== req.user.id) return requested;
  return (await actor(req)).patient_id;
}

function publicDocument(row) {
  const { storage_key: _storageKey, storage_provider: _storageProvider, ...safe } = row;
  return { ...safe, content_url: `/api/v1/opd/patient-documents/${row.patient_id}/${row.id}/content` };
}

router.get('/:patientId', endpoint(async (req, res) => {
  roles(req, ['PATIENT', 'DOCTOR', 'NURSE']);
  const patientId = await resolvePatientId(req);
  await patientAccess(req, patientId);
  const rows = await db.all(`SELECT d.id,d.patient_id,d.appointment_id,d.uploaded_by,d.document_type,d.title,d.original_filename,d.mime_type,d.size_bytes,d.patient_note,d.clinical_date,d.created_at,d.updated_at,u.name AS uploaded_by_name
    FROM patient_documents d JOIN users u ON u.id=d.uploaded_by WHERE d.patient_id=? ORDER BY d.clinical_date DESC,d.created_at DESC,d.id DESC`, [patientId]);
  res.json(rows.map(publicDocument));
}));

router.post('/:patientId', (req, res, next) => {
  try {
    roles(req, ['PATIENT']);
    upload.single('file')(req, res, next);
  } catch (error) { next(error); }
}, endpoint(async (req, res) => {
  if (!req.file) fail('DOCUMENT_FILE_REQUIRED_OR_UNSUPPORTED', 422);
  if (detectedMime(req.file.buffer) !== req.file.mimetype) fail('DOCUMENT_CONTENT_TYPE_MISMATCH', 422);
  const input = parse(metadataSchema, req.body);
  const patientId = await resolvePatientId(req);
  await patientAccess(req, patientId);
  const stored = await patientDocumentStorage.put(req.file.buffer);
  try {
    const row = await transaction(async tx => {
      await patientAccess(req, patientId, tx);
      if (input.appointment_id && !await tx.get('SELECT id FROM appointments WHERE id=? AND patient_id=?', [input.appointment_id, patientId])) fail('INVALID_APPOINTMENT', 422);
      const documentId = id('patient-document');
      const timestamp = now();
      await tx.run(`INSERT INTO patient_documents (id,patient_id,appointment_id,uploaded_by,document_type,title,original_filename,mime_type,size_bytes,storage_provider,storage_key,patient_note,clinical_date,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [documentId, patientId, input.appointment_id || null, req.user.id, input.document_type, input.title, req.file.originalname.slice(0, 255), req.file.mimetype, req.file.size, stored.provider, stored.key, input.patient_note || null, input.clinical_date, timestamp, timestamp]);
      await audit(tx, req, 'PATIENT_DOCUMENT_UPLOADED', patientId, { document_id: documentId, appointment_id: input.appointment_id || null, document_type: input.document_type, mime_type: req.file.mimetype, size_bytes: req.file.size });
      return tx.get(`SELECT d.id,d.patient_id,d.appointment_id,d.uploaded_by,d.document_type,d.title,d.original_filename,d.mime_type,d.size_bytes,d.patient_note,d.clinical_date,d.created_at,d.updated_at,u.name AS uploaded_by_name
        FROM patient_documents d JOIN users u ON u.id=d.uploaded_by WHERE d.id=?`, [documentId]);
    });
    res.status(201).json(publicDocument(row));
  } catch (error) {
    await patientDocumentStorage.remove(stored.key);
    throw error;
  }
}));

router.patch('/:patientId/:documentId/appointment', endpoint(async (req, res) => {
  roles(req, ['PATIENT']);
  const input = parse(appointmentLinkSchema, req.body);
  const patientId = await resolvePatientId(req);
  await patientAccess(req, patientId);
  const row = await transaction(async tx => {
    await patientAccess(req, patientId, tx);
    if (!await tx.get('SELECT id FROM patient_documents WHERE id=? AND patient_id=?', [req.params.documentId, patientId])) fail('NOT_FOUND', 404);
    if (input.appointment_id && !await tx.get('SELECT id FROM appointments WHERE id=? AND patient_id=?', [input.appointment_id, patientId])) fail('INVALID_APPOINTMENT', 422);
    const timestamp = now();
    await tx.run('UPDATE patient_documents SET appointment_id=?,updated_at=? WHERE id=? AND patient_id=?', [input.appointment_id, timestamp, req.params.documentId, patientId]);
    await audit(tx, req, input.appointment_id ? 'PATIENT_DOCUMENT_ATTACHED' : 'PATIENT_DOCUMENT_DETACHED', patientId, { document_id: req.params.documentId, appointment_id: input.appointment_id });
    return tx.get(`SELECT d.id,d.patient_id,d.appointment_id,d.uploaded_by,d.document_type,d.title,d.original_filename,d.mime_type,d.size_bytes,d.patient_note,d.clinical_date,d.created_at,d.updated_at,u.name AS uploaded_by_name
      FROM patient_documents d JOIN users u ON u.id=d.uploaded_by WHERE d.id=?`, [req.params.documentId]);
  });
  res.json(publicDocument(row));
}));

router.get('/:patientId/:documentId/content', endpoint(async (req, res) => {
  roles(req, ['PATIENT', 'DOCTOR', 'NURSE']);
  const patientId = await resolvePatientId(req);
  await patientAccess(req, patientId);
  const row = await db.get('SELECT * FROM patient_documents WHERE id=? AND patient_id=?', [req.params.documentId, patientId]);
  if (!row) fail('NOT_FOUND', 404);
  const data = await patientDocumentStorage.read(row.storage_key);
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Content-Length', String(row.size_bytes));
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.original_filename)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(data);
}));

router.use((error, _req, _res, next) => {
  if (error instanceof multer.MulterError) {
    error.status = 422;
    error.code = error.code === 'LIMIT_FILE_SIZE' ? 'DOCUMENT_TOO_LARGE' : 'INVALID_DOCUMENT_UPLOAD';
  }
  next(error);
});

module.exports = router;
