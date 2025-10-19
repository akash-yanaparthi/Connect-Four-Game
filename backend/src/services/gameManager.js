// backend/src/services/gameManager.js
const { v4: uuidv4 } = require('uuid');
const db = require('../models');
const { pickMove } = require('./bot');

const ROWS = 6;
const COLS = 7;

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0));
}

function cloneBoard(board) {
  return board.map(row => row.slice());
}

function checkWin(board, player) {
  // horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      if (
        board[r][c] === player &&
        board[r][c + 1] === player &&
        board[r][c + 2] === player &&
        board[r][c + 3] === player
      ) return true;
    }
  }
  // vertical
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - 4; r++) {
      if (
        board[r][c] === player &&
        board[r + 1][c] === player &&
        board[r + 2][c] === player &&
        board[r + 3][c] === player
      ) return true;
    }
  }
  // diagonal down-right
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      if (
        board[r][c] === player &&
        board[r + 1][c + 1] === player &&
        board[r + 2][c + 2] === player &&
        board[r + 3][c + 3] === player
      ) return true;
    }
  }
  // diagonal up-right
  for (let r = 3; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      if (
        board[r][c] === player &&
        board[r - 1][c + 1] === player &&
        board[r - 2][c + 2] === player &&
        board[r - 3][c + 3] === player
      ) return true;
    }
  }
  return false;
}

function isBoardFull(board) {
  for (let c = 0; c < COLS; c++) {
    if (board[0][c] === 0) return false;
  }
  return true;
}

function applyMove(board, col, player) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) {
      board[r][col] = player;
      return { success: true, row: r };
    }
  }
  return { success: false };
}

class GameManager {
  constructor(io) {
    this.io = io;
    this.waiting = null; // { username, socketId, timer, playerModel }
    this.activeGames = new Map(); // gameId -> game object
    this.socketToGame = new Map(); // socketId -> gameId
  }

  async findOrCreatePlayer(username) {
    const [player] = await db.Player.findOrCreate({
      where: { username },
      defaults: { username }
    });
    return player;
  }

  async joinQueue(socket, username) {
    const playerModel = await this.findOrCreatePlayer(username);

    socket.data.username = username;
    socket.data.playerModel = playerModel;
    socket.emit('joined', { ok: true });

    if (!this.waiting) {
      this.waiting = {
        username,
        socketId: socket.id,
        createdAt: Date.now(),
        playerModel,
        timer: setTimeout(() => {
          this._startGameWithBot(this.waiting.socketId, this.waiting.username, this.waiting.playerModel).catch(console.error);
          this.waiting = null;
        }, 10000)
      };
      socket.emit('waiting', { message: 'Waiting for opponent (10s before bot).' });
      return;
    }

    clearTimeout(this.waiting.timer);
    const opponent = this.waiting;
    this.waiting = null;

    const player1SocketId = opponent.socketId;
    const player2SocketId = socket.id;

    await this._createGame(player1SocketId, opponent.username, opponent.playerModel, player2SocketId, username, playerModel);
  }

  async _startGameWithBot(socketId, username, playerModel) {
    const socket = this.io.sockets.sockets.get(socketId);
    if (!socket) return;
    await this._createGame(socketId, username, playerModel, null, 'BOT', null, { vsBot: true });
  }

  async _createGame(p1SocketId, p1Username, p1Model, p2SocketId = null, p2Username = 'BOT', p2Model = null, options = {}) {
    const gameId = uuidv4();
    const board = createEmptyBoard();
    const isVsBot = !!options.vsBot || p2SocketId === null;

    const game = {
      gameId,
      board,
      players: {
        1: { username: p1Username, socketId: p1SocketId, model: p1Model },
        2: { username: p2Username, socketId: p2SocketId, model: p2Model }
      },
      createdAt: Date.now(),
      turn: 1,
      status: 'playing',
      result: null,
      disconnectTimers: {},
      isVsBot
    };

    this.activeGames.set(gameId, game);
    this.socketToGame.set(p1SocketId, gameId);
    if (p2SocketId) this.socketToGame.set(p2SocketId, gameId);

    const payload = {
      gameId,
      youAre: 1,
      players: { 1: p1Username, 2: p2Username },
      board: cloneBoard(board),
      turn: game.turn
    };

    const p1Socket = this.io.sockets.sockets.get(p1SocketId);
    if (p1Socket) p1Socket.emit('matchFound', payload);

    if (!isVsBot) {
      const payload2 = { ...payload, youAre: 2 };
      const p2Socket = this.io.sockets.sockets.get(p2SocketId);
      if (p2Socket) p2Socket.emit('matchFound', payload2);
    }

    return;
  }

  async handleMakeMove(socket, { gameId, col }) {
    const game = this.activeGames.get(gameId);
    if (!game) return socket.emit('error', { message: 'Game not found' });
    if (game.status !== 'playing') return socket.emit('error', { message: 'Game already finished' });

    let playerNum = null;
    if (game.players[1].socketId === socket.id) playerNum = 1;
    else if (game.players[2].socketId === socket.id) playerNum = 2;
    else return socket.emit('error', { message: 'You are not part of this game' });

    if (playerNum !== game.turn) return socket.emit('error', { message: 'Not your turn' });
    if (typeof col !== 'number' || col < 0 || col >= COLS) return socket.emit('error', { message: 'Invalid column' });

    const moveResult = applyMove(game.board, col, playerNum);
    if (!moveResult.success) return socket.emit('error', { message: 'Column is full' });

    // check win
    if (checkWin(game.board, playerNum)) {
      this._broadcastGameUpdate(game, { lastMove: { col, row: moveResult.row, player: playerNum } });
      await this._finishGame(game, { type: 'win', winner: playerNum, reason: 'connect4' });
      return;
    }

    // check draw
    if (isBoardFull(game.board)) {
      this._broadcastGameUpdate(game, { lastMove: { col, row: moveResult.row, player: playerNum } });
      await this._finishGame(game, { type: 'draw', winner: null, reason: 'board_full' });
      return;
    }

    // switch turn
    game.turn = game.turn === 1 ? 2 : 1;

    // broadcast move & new turn
    this._broadcastGameUpdate(game, { lastMove: { col, row: moveResult.row, player: playerNum } });

    // bot move
    if (game.isVsBot && game.turn === 2) {
      setTimeout(() => this._handleBotMove(game), 150);
    }
  }

  _broadcastGameUpdate(game, extras = {}) {
    const payload = {
      gameId: game.gameId,
      board: cloneBoard(game.board),
      turn: game.turn,
      status: game.status,
      ...extras
    };

    for (const pNum of [1, 2]) {
      const p = game.players[pNum];
      if (!p || !p.socketId) continue;
      const sock = this.io.sockets.sockets.get(p.socketId);
      if (sock) sock.emit('gameUpdate', payload);
    }
  }

  async _handleBotMove(game) {
    const botPlayer = game.players[1].username === 'BOT' ? 1 : 2;
    const opponent = botPlayer === 1 ? 2 : 1;

    let col = pickMove(game.board, botPlayer, opponent);
    if (col === null || col === undefined) {
      await this._finishGame(game, { type: 'draw', winner: null, reason: 'no_moves' });
      return;
    }

    let moveRes = applyMove(game.board, col, botPlayer);
    if (!moveRes.success) {
      const validCols = [];
      for (let c = 0; c < COLS; c++) if (game.board[0][c] === 0) validCols.push(c);
      if (!validCols.length) {
        await this._finishGame(game, { type: 'draw', winner: null, reason: 'no_moves2' });
        return;
      }
      moveRes = applyMove(game.board, validCols[0], botPlayer);
    }

    if (checkWin(game.board, botPlayer)) {
      await this._finishGame(game, { type: 'win', winner: botPlayer, reason: 'bot_win' });
      return;
    }
    if (isBoardFull(game.board)) {
      await this._finishGame(game, { type: 'draw', winner: null, reason: 'board_full' });
      return;
    }

    game.turn = opponent;
    this._broadcastGameUpdate(game, { lastMove: { col: moveRes.col, row: moveRes.row, player: botPlayer } });
  }

  async _finishGame(game, result) {
  game.status = 'finished';
  game.result = result;

  const payload = {
    gameId: game.gameId,
    finalBoard: cloneBoard(game.board),
    result
  };
  for (const pNum of [1, 2]) {
    const p = game.players[pNum];
    if (!p || !p.socketId) continue;
    const sock = this.io.sockets.sockets.get(p.socketId);
    if (sock) sock.emit('gameOver', payload);
  }

  try {
    const boardSnapshot = cloneBoard(game.board);

    const player1_id = game.players[1].model ? game.players[1].model.id : null;
    const player2_id = game.players[2].model ? game.players[2].model.id : null;

    const winner_id = result.winner === 1 ? player1_id
      : result.winner === 2 ? player2_id
      : null;

    // Save game record
    await db.Game.create({
      game_id: game.gameId,
      player1_id,
      player2_id,
      winner_id,
      result: result.type === 'win'
        ? (result.winner === 1 ? 'player1' : 'player2')
        : (result.type === 'draw' ? 'draw' : 'forfeit'),
      moves: { board: boardSnapshot }
    });

    // Update player stats
    if (player1_id) {
      const p1 = await db.Player.findByPk(player1_id);
      if (p1) {
        if (result.type === 'win' && result.winner === 1) await p1.increment('wins');
        else if (result.type === 'win' && result.winner === 2) await p1.increment('losses');
        else if (result.type === 'draw') await p1.increment('draws');
      }
    }
    if (player2_id) {
      const p2 = await db.Player.findByPk(player2_id);
      if (p2) {
        if (result.type === 'win' && result.winner === 2) await p2.increment('wins');
        else if (result.type === 'win' && result.winner === 1) await p2.increment('losses');
        else if (result.type === 'draw') await p2.increment('draws');
      }
    }

    // --- NEW: Emit updated leaderboard ---
    const topPlayers = await db.Player.findAll({
      order: [['wins', 'DESC']],
      limit: 10,
      attributes: ['id', 'username', 'wins', 'losses', 'draws']
    });
    this.io.emit('leaderboardUpdate', topPlayers);

  } catch (err) {
    console.error('Error persisting finished game', err);
  }

  // Clean up
  this.activeGames.delete(game.gameId);
  for (const pNum of [1, 2]) {
    const p = game.players[pNum];
    if (!p) continue;
    if (p.socketId) this.socketToGame.delete(p.socketId);
    if (p.socketId && this.disconnectTimers && this.disconnectTimers[p.socketId]) {
      clearTimeout(this.disconnectTimers[p.socketId]);
    }
  }
}



  handleDisconnect(socket) {
    const gameId = this.socketToGame.get(socket.id);
    if (!gameId) return;

    const game = this.activeGames.get(gameId);
    if (!game) return;

    const timer = setTimeout(async () => {
      let disconnectedPlayerNum = null;
      if (game.players[1].socketId === socket.id) disconnectedPlayerNum = 1;
      else if (game.players[2].socketId === socket.id) disconnectedPlayerNum = 2;

      const winner = disconnectedPlayerNum === 1 ? 2 : 1;
      await this._finishGame(game, { type: 'forfeit', winner, reason: 'disconnect_timeout' });
    }, 30000);

    game.disconnectTimers = game.disconnectTimers || {};
    game.disconnectTimers[socket.id] = timer;

    this.socketToGame.delete(socket.id);
    for (const pNum of [1, 2]) {
      if (game.players[pNum] && game.players[pNum].socketId === socket.id) {
        game.players[pNum].socketId = null;
      }
    }

    for (const pNum of [1, 2]) {
      const p = game.players[pNum];
      if (!p || !p.socketId) continue;
      const sock = this.io.sockets.sockets.get(p.socketId);
      if (sock) sock.emit('opponentDisconnected', { message: 'Opponent disconnected. Waiting 30s for reconnection.' });
    }
  }

  async handleRejoin(socket, { username, gameId }) {
    let foundGame = null;
    if (gameId) {
      const g = this.activeGames.get(gameId);
      if (g) {
        for (const pNum of [1, 2]) {
          const p = g.players[pNum];
          if (p && p.username === username && !p.socketId) {
            foundGame = g;
            break;
          }
        }
      }
    } else {
      for (const [id, g] of this.activeGames.entries()) {
        for (const pNum of [1, 2]) {
          const p = g.players[pNum];
          if (p && p.username === username && !p.socketId) {
            foundGame = g;
            break;
          }
        }
        if (foundGame) break;
      }
    }

    if (!foundGame) {
      socket.emit('error', { message: 'No reconnectable game found' });
      return;
    }

    let playerNum = null;
    for (const pNum of [1, 2]) {
      if (foundGame.players[pNum] && foundGame.players[pNum].username === username && !foundGame.players[pNum].socketId) {
        playerNum = pNum;
        break;
      }
    }
    if (!playerNum) return socket.emit('error', { message: 'No available player slot for reconnection' });

    foundGame.players[playerNum].socketId = socket.id;
    this.socketToGame.set(socket.id, foundGame.gameId);

    const timers = foundGame.disconnectTimers || {};
    for (const key of Object.keys(timers)) try { clearTimeout(timers[key]); } catch {}
    foundGame.disconnectTimers = {};

    socket.emit('rejoined', {
      gameId: foundGame.gameId,
      youAre: playerNum,
      players: { 1: foundGame.players[1].username, 2: foundGame.players[2].username },
      board: cloneBoard(foundGame.board),
      turn: foundGame.turn,
      status: foundGame.status
    });

    for (const pNum of [1, 2]) {
      if (pNum === playerNum) continue;
      const p = foundGame.players[pNum];
      if (p && p.socketId) {
        const sock = this.io.sockets.sockets.get(p.socketId);
        if (sock) sock.emit('opponentReconnected', { message: `${username} rejoined the game.` });
      }
    }
  }
}

module.exports = GameManager;
