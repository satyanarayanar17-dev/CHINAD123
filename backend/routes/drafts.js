const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { get, run } = require('../database');

const router = express.Router();

function generateEtag() {
  return `W/"${Date.now()}-${Math.random().toString(36).slice(2, 8)}"`;
}

// GET /api/drafts/:key
router.get('/:key', requireAuth, async (req, res, next) => {
  try {
    const entry = await get(
      `SELECT data, etag FROM clinical_drafts WHERE key = ?`,
      [req.params.key]
    );
    if (!entry) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No draft found.' } });
    }
    res.setHeader('ETag', entry.etag);
    let parsed;
    try { parsed = JSON.parse(entry.data); } catch { parsed = entry.data; }
    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

// PUT /api/drafts/:key — upsert with If-Match OCC (412 on mismatch)
router.put('/:key', requireAuth, async (req, res, next) => {
  const key = req.params.key;
  const ifMatch = req.headers['if-match'];
  try {
    const existing = await get(
      `SELECT etag FROM clinical_drafts WHERE key = ?`,
      [key]
    );
    // Only enforce ETag when a draft already exists
    if (ifMatch && existing && existing.etag !== ifMatch) {
      return res.status(412).json({
        error: { code: 'PRECONDITION_FAILED', message: 'Draft was modified by another session.' }
      });
    }
    const newEtag = generateEtag();
    const dataStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (existing) {
      await run(
        `UPDATE clinical_drafts SET data = ?, etag = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?`,
        [dataStr, newEtag, key]
      );
    } else {
      await run(
        `INSERT INTO clinical_drafts (key, data, etag) VALUES (?, ?, ?)`,
        [key, dataStr, newEtag]
      );
    }
    res.setHeader('ETag', newEtag);
    res.json({ message: 'Draft saved', etag: newEtag });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/drafts/:key
router.delete('/:key', requireAuth, async (req, res, next) => {
  try {
    await run(`DELETE FROM clinical_drafts WHERE key = ?`, [req.params.key]);
    res.json({ message: 'Draft cleared' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;