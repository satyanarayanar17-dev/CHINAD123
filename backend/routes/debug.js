const express = require('express');
const router = express.Router();
const { get, all } = require('../database');

router.get('/users', async (req, res) => {
  try {
    const users = await all('SELECT id, name, role FROM users');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
