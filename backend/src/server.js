// backend/src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./models');
const GameManager = require('./services/gameManager');

const app = express();
app.use(cors());
app.use(express.json());

// simple health route
app.get('/health', (req, res) => res.json({ ok: true }));

// leaderboard route
app.use('/leaderboard', require('./routes/leaderboard'));

// new matchmaking & players routes (we'll add these files)
app.use('/players', require('./routes/players'));
app.use('/matchmaking', require('./routes/matchmaking'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// instantiate GameManager and attach to io
const gameManager = new GameManager(io);

// expose to routes via app.locals
app.locals.gameManager = gameManager;
app.locals.io = io;

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('join', async ({ username }) => {
    if (!username) {
      socket.emit('error', { message: 'username required to join' });
      return;
    }
    try {
      await gameManager.joinQueue(socket, username);
    } catch (err) {
      console.error('join error', err);
      socket.emit('error', { message: 'join failed' });
    }
  });

  socket.on('makeMove', async (data) => {
    try {
      await gameManager.handleMakeMove(socket, data);
    } catch (err) {
      console.error('makeMove error', err);
      socket.emit('error', { message: 'move failed' });
    }
  });

  socket.on('rejoin', async (data) => {
    try {
      await gameManager.handleRejoin(socket, data);
    } catch (err) {
      console.error('rejoin error', err);
      socket.emit('error', { message: 'rejoin failed' });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('socket disconnected', socket.id, reason);
    try {
      gameManager.handleDisconnect(socket);
    } catch (err) {
      console.error('disconnect handling error', err);
    }
  });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await db.sequelize.authenticate();
    console.log('DB connection OK');
    server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();
