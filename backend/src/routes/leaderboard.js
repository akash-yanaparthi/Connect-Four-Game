// backend/src/routes/leaderboard.js
const express = require('express');
const router = express.Router();
const db = require('../models');

/**
 * GET /leaderboard/top
 * Returns top players ordered by wins (descending).
 * Optional query: ?limit=20 (default 50)
 */
router.get('/top', async (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit || '50', 10));
    const players = await db.Player.findAll({
      order: [['wins', 'DESC'], ['created_at', 'ASC']],
      attributes: ['id', 'username', 'wins', 'losses', 'draws', 'created_at'],
      limit
    });
    res.json({ ok: true, players });
  } catch (err) {
    console.error('leaderboard/top error', err);
    res.status(500).json({ ok: false, message: 'internal' });
  }
});

/**
 * GET /leaderboard/player/:username
 * Return stats for a single player.
 */
router.get('/player/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const player = await db.Player.findOne({
      where: { username },
      attributes: ['id', 'username', 'wins', 'losses', 'draws', 'created_at']
    });
    if (!player) return res.status(404).json({ ok: false, message: 'player not found' });
    res.json({ ok: true, player });
  } catch (err) {
    console.error('leaderboard/player error', err);
    res.status(500).json({ ok: false, message: 'internal' });
  }
});

/**
 * POST /leaderboard/reset-dev
 * DEV-only: reset all players stats to zero. Useful for testing.
 * IMPORTANT: Keep this route protected or remove in production.
 */
router.post('/reset-dev', async (req, res) => {
  try {
    // simple safety: require ?confirm=yes
    if (req.query.confirm !== 'yes') {
      return res.status(400).json({ ok: false, message: 'add ?confirm=yes to run reset (dev only)' });
    }
    await db.Player.update({ wins: 0, losses: 0, draws: 0 }, { where: {} });
    res.json({ ok: true, message: 'player stats reset' });
  } catch (err) {
    console.error('leaderboard/reset error', err);
    res.status(500).json({ ok: false, message: 'internal' });
  }
});

module.exports = router;
