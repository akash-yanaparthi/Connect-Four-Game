const express = require('express');
const router = express.Router();


router.get('/waiting', (req, res) => {
  const gm = req.app.locals.gameManager;
  if (!gm) return res.status(500).json({ ok: false, message: 'game manager not available' });

  const waiting = gm.waiting;
  if (!waiting) return res.json({ ok: true, waiting: null });

  
  res.json({
    ok: true,
    waiting: {
      username: waiting.username,
      socketId: waiting.socketId,
      waitingSinceMs: Date.now() - waiting.createdAt
    }
  });
});


router.post('/force-bot', async (req, res) => {
  const gm = req.app.locals.gameManager;
  const io = req.app.locals.io;
  if (!gm || !io) return res.status(500).json({ ok: false, message: 'game manager not available' });

  const username = (req.body.username || '').trim();
  if (!username) return res.status(400).json({ ok: false, message: 'username required' });


  const sockets = Array.from(io.sockets.sockets.values());
  const sock = sockets.find(s => (s.data && s.data.username) === username);

  if (!sock) {
    return res.status(404).json({ ok: false, message: 'no connected socket found for username. Have they connected via socket.io?' });
  }

  try {
    const playerModel = sock.data.playerModel || null;
    await gm._startGameWithBot(sock.id, username, playerModel);
    return res.json({ ok: true, message: 'started game vs bot' });
  } catch (err) {
    console.error('force-bot error', err);
    return res.status(500).json({ ok: false, message: 'failed to start bot game' });
  }
});

module.exports = router;
