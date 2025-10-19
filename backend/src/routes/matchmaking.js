// backend/src/routes/matchmaking.js
const express = require('express');
const router = express.Router();

/**
 * GET /matchmaking/waiting
 * Returns info about the current waiting player (for debug).
 */
router.get('/waiting', (req, res) => {
  const gm = req.app.locals.gameManager;
  if (!gm) return res.status(500).json({ ok: false, message: 'game manager not available' });

  const waiting = gm.waiting;
  if (!waiting) return res.json({ ok: true, waiting: null });

  // return only non-sensitive info
  res.json({
    ok: true,
    waiting: {
      username: waiting.username,
      socketId: waiting.socketId,
      waitingSinceMs: Date.now() - waiting.createdAt
    }
  });
});

/**
 * POST /matchmaking/force-bot
 * Body: { username }
 *
 * Force-start a game vs the bot for the specified username if they are currently connected.
 * Useful for testing without using the client UI.
 */
router.post('/force-bot', async (req, res) => {
  const gm = req.app.locals.gameManager;
  const io = req.app.locals.io;
  if (!gm || !io) return res.status(500).json({ ok: false, message: 'game manager not available' });

  const username = (req.body.username || '').trim();
  if (!username) return res.status(400).json({ ok: false, message: 'username required' });

  // find a connected socket for this username (we expect the client to have set socket.data.username on 'join' or earlier)
  const sockets = Array.from(io.sockets.sockets.values());
  const sock = sockets.find(s => (s.data && s.data.username) === username);

  if (!sock) {
    return res.status(404).json({ ok: false, message: 'no connected socket found for username. Have they connected via socket.io?' });
  }

  try {
    // call private method to start game with bot for this socket (safe here because same process).
    // gameManager._startGameWithBot(socketId, username, playerModel)
    const playerModel = sock.data.playerModel || null;
    await gm._startGameWithBot(sock.id, username, playerModel);
    return res.json({ ok: true, message: 'started game vs bot' });
  } catch (err) {
    console.error('force-bot error', err);
    return res.status(500).json({ ok: false, message: 'failed to start bot game' });
  }
});

module.exports = router;
