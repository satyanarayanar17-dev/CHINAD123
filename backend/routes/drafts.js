const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// In-memory draft store with ETag-based OCC
// Drafts are ephemeral by design — they don't survive server restart
// Production would use Redis or a separate draft table
const drafts = new Map(); // key -> { data, etag }

function generateEtag() {
  return `W/"${Date.now()}-${Math.random().toString(36).slice(2, 8)}"`;
}

// GET /api/drafts/:key
router.get('/:key', requireAuth, (req, res) => {
  const entry = drafts.get(req.params.key);
  if (!entry) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No draft found.' } });
  }
  res.setHeader('ETag', entry.etag);
  res.json(entry.data);
});

// PUT /api/drafts/:key — upsert with optional If-Match for OCC
router.put('/:key', requireAuth, (req, res) => {
  const key = req.params.key;
  const ifMatch = req.headers['if-match'];
  const existing = drafts.get(key);

  // If client sends If-Match and it doesn't match current ETag → 412
  if (ifMatch && existing && existing.etag !== ifMatch) {
    return res.status(412).json({ 
      error: { code: 'PRECONDITION_FAILED', message: 'Draft was modified by another session.' }
    });
  }

  const newEtag = generateEtag();
  drafts.set(key, { data: req.body, etag: newEtag });
  
  res.setHeader('ETag', newEtag);
  res.json({ message: 'Draft saved', etag: newEtag });
});

// DELETE /api/drafts/:key
router.delete('/:key', requireAuth, (req, res) => {
  drafts.delete(req.params.key);
  res.json({ message: 'Draft cleared' });
});

module.exports = router;
