const express = require('express');
const router = express.Router();
const db = require('../models');


router.post('/register', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    if (!username) return res.status(400).json({ ok: false, message: 'username required' });

    const [player, created] = await db.Player.findOrCreate({
      where: { username },
      defaults: { username }
    });

    res.json({ ok: true, player, created });
  } catch (err) {
    console.error('players/register error', err);
    res.status(500).json({ ok: false, message: 'internal' });
  }
});


router.get('/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const player = await db.Player.findOne({ where: { username }, attributes: ['id', 'username', 'wins', 'losses', 'draws', 'created_at'] });
    if (!player) return res.status(404).json({ ok: false, message: 'player not found' });
    res.json({ ok: true, player });
  } catch (err) {
    console.error('players/get error', err);
    res.status(500).json({ ok: false, message: 'internal' });
  }
});

module.exports = router;
