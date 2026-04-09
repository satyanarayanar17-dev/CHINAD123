const express = require('express');
const { run, get } = require('../database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function generateEtag() {
  return `W/"${Date.now()}-${Math.random().toString(36).slice(2, 8)}"`;
}

// GET /api/v1/drafts/:key
router.get('/:key', requireAuth, async (req, res, next) => {
  try {
    const row = await get(`SELECT data, etag FROM drafts WHERE key = ?`, [req.params.key]);
    if (!row) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No draft found.' } });
    }
    res.setHeader('ETag', row.etag);
    res.json(JSON.parse(row.data));
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/drafts/:key — upsert with optional If-Match for OCC
router.put('/:key', requireAuth, async (req, res, next) => {
  try {
    const key = req.params.key;
    const ifMatch = req.headers['if-match'];

    if (ifMatch) {
      const existing = await get(`SELECT etag FROM drafts WHERE key = ?`, [key]);
      if (existing && existing.etag !== ifMatch) {
        return res.status(412).json({
          error: { code: 'PRECONDITION_FAILED', message: 'Draft was modified by another session.' }
        });
      }
    }

    const newEtag = generateEtag();
    const data = JSON.stringify(req.body);
    const userId = req.user?.id || null;
    const now = new Date().toISOString();

    await run(
      `INSERT INTO drafts (key, user_id, data, etag, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET user_id=excluded.user_id, data=excluded.data, etag=excluded.etag, updated_at=excluded.updated_at`,
      [key, userId, data, newEtag, now]
    );

    res.setHeader('ETag', newEtag);
    res.json({ message: 'Draft saved', etag: newEtag });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/drafts/:key
router.delete('/:key', requireAuth, async (req, res, next) => {
  try {
    await run(`DELETE FROM drafts WHERE key = ?`, [req.params.key]);
    res.json({ message: 'Draft cleared' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
