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
  /**
   * @param {SocketIO.Server} io
   */
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

  // Called when a client emits 'join' with username
  async joinQueue(socket, username) {
    const playerModel = await this.findOrCreatePlayer(username);

    socket.data.username = username;
    socket.data.playerModel = playerModel;
    socket.emit('joined', { ok: true });

    if (!this.waiting) {
      // no one waiting — place current player in waiting slot and start 10s timer
      this.waiting = {
        username,
        socketId: socket.id,
        createdAt: Date.now(),
        playerModel,
        timer: setTimeout(() => {
          // timer expired — start vs bot
          this._startGameWithBot(this.waiting.socketId, this.waiting.username, this.waiting.playerModel).catch(console.error);
          this.waiting = null;
        }, 10000)
      };

      socket.emit('waiting', { message: 'Waiting for opponent (10s before bot).' });
      return;
    }

    // match found: cancel waiting timer and start human vs human
    clearTimeout(this.waiting.timer);
    const opponent = this.waiting;
    this.waiting = null;

    // create game with socket (player2) and opponent (player1)
    const player1SocketId = opponent.socketId;
    const player2SocketId = socket.id;

    await this._createGame(player1SocketId, opponent.username, opponent.playerModel, player2SocketId, username, playerModel);
  }

  async _startGameWithBot(socketId, username, playerModel) {
    // create a game where player is player1 and bot is player2
    const socket = this.io.sockets.sockets.get(socketId);
    if (!socket) {
      // user disconnected before bot started
      return;
    }
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
      turn: 1, // player1 starts
      status: 'playing', // 'playing' | 'finished'
      result: null, // { type: 'win'|'draw'|'forfeit', winner: 1|2|null, reason }
      disconnectTimers: {}, // socketId -> timer
      isVsBot
    };

    this.activeGames.set(gameId, game);
    this.socketToGame.set(p1SocketId, gameId);
    if (p2SocketId) this.socketToGame.set(p2SocketId, gameId);

    // notify both players
    const payload = {
      gameId,
      youAre: 1,
      players: { 1: p1Username, 2: p2Username },
      board: cloneBoard(board),
      turn: game.turn
    };

    const p1Socket = this.io.sockets.sockets.get(p1SocketId);
    if (p1Socket) p1Socket.emit('matchFound', payload);

    if (isVsBot) {
      // start bot vs human; if bot starts second, nothing to do.
      // But if we want bot to be second by default, fine.
      // Also if desired, we can send p1 info only.
      return;
    }

    // human vs human: notify second player with youAre:2
    const payload2 = { ...payload, youAre: 2 };
    const p2Socket = this.io.sockets.sockets.get(p2SocketId);
    if (p2Socket) p2Socket.emit('matchFound', payload2);

    return;
  }

  // public API used by server on 'makeMove' event
  async handleMakeMove(socket, { gameId, col }) {
    const game = this.activeGames.get(gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    if (game.status !== 'playing') {
      socket.emit('error', { message: 'Game already finished' });
      return;
    }

    // determine player number from socket id
    let playerNum = null;
    if (game.players[1].socketId === socket.id) playerNum = 1;
    else if (game.players[2].socketId === socket.id) playerNum = 2;
    else {
      socket.emit('error', { message: 'You are not part of this game' });
      return;
    }

    if (playerNum !== game.turn) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }

    // validate col
    if (typeof col !== 'number' || col < 0 || col >= COLS) {
      socket.emit('error', { message: 'Invalid column' });
      return;
    }

    const moveResult = applyMove(game.board, col, playerNum);
    if (!moveResult.success) {
      socket.emit('error', { message: 'Column is full' });
      return;
    }

    // broadcast update
    this._broadcastGameUpdate(game, { lastMove: { col, row: moveResult.row, player: playerNum } });

    // check win
    if (checkWin(game.board, playerNum)) {
      await this._finishGame(game, { type: 'win', winner: playerNum, reason: 'connect4' });
      return;
    }

    // check draw
    if (isBoardFull(game.board)) {
      await this._finishGame(game, { type: 'draw', winner: null, reason: 'board_full' });
      return;
    }

    // switch turn
    game.turn = game.turn === 1 ? 2 : 1;

    // If playing against bot and it's bot's turn, make bot move immediately (simulate quick response)
    if (game.isVsBot && game.turn === 2) {
      // small delay to mimic thinking (and allow client to render)
      setTimeout(async () => {
        try {
          await this._handleBotMove(game);
        } catch (err) {
          console.error('bot move error', err);
        }
      }, 150); // 150ms
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

    // send to both real sockets if connected
    for (const pNum of [1, 2]) {
      const p = game.players[pNum];
      if (!p) continue;
      if (p.socketId) {
        const sock = this.io.sockets.sockets.get(p.socketId);
        if (sock) sock.emit('gameUpdate', payload);
      }
    }
  }

  async _handleBotMove(game) {
    // bot assumes player numbers: bot is player 2
    const botPlayer = 2;
    const opponent = 1;

    const col = pickMove(game.board, botPlayer, opponent);
    if (col === null || col === undefined) {
      // no valid move => draw
      await this._finishGame(game, { type: 'draw', winner: null, reason: 'no_moves' });
      return;
    }
    const res = applyMove(game.board, col, botPlayer);
    if (!res.success) {
      // column full (unexpected), choose fallback
      const validCols = [];
      for (let c = 0; c < COLS; c++) if (game.board[0][c] === 0) validCols.push(c);
      if (validCols.length === 0) {
        await this._finishGame(game, { type: 'draw', winner: null, reason: 'no_moves2' });
        return;
      }
      const fallback = validCols[0];
      applyMove(game.board, fallback, botPlayer);
    }

    // broadcast
    this._broadcastGameUpdate(game, { lastMove: { col, row: res ? res.row : null, player: botPlayer } });

    // check win/draw
    if (checkWin(game.board, botPlayer)) {
      await this._finishGame(game, { type: 'win', winner: botPlayer, reason: 'bot_win' });
      return;
    }
    if (isBoardFull(game.board)) {
      await this._finishGame(game, { type: 'draw', winner: null, reason: 'board_full' });
      return;
    }

    // switch turn back to player
    game.turn = 1;
    this._broadcastGameUpdate(game);
  }

  async _finishGame(game, result) {
    game.status = 'finished';
    game.result = result;

    // notify clients
    const payload = {
      gameId: game.gameId,
      finalBoard: cloneBoard(game.board),
      result
    };
    for (const pNum of [1, 2]) {
      const p = game.players[pNum];
      if (!p) continue;
      if (p.socketId) {
        const sock = this.io.sockets.sockets.get(p.socketId);
        if (sock) sock.emit('gameOver', payload);
      }
    }

    // persist completed game to DB (player ids, winner, moves)
    try {
      const moves = []; // we didn't store moves history per se; derive from board? Better to store sequence — for now store final board snapshot.
      // Convert final board to JSON and save as moves (compact)
      const boardSnapshot = cloneBoard(game.board);

      // get player ids from models if available
      let player1_id = game.players[1].model ? game.players[1].model.id : null;
      let player2_id = game.players[2].model ? game.players[2].model.id : null;

      const winner_id = result.winner === 1 ? player1_id
        : result.winner === 2 ? player2_id
        : null;

      await db.Game.create({
        game_id: game.gameId,
        player1_id,
        player2_id,
        winner_id,
        result: result.type === 'win' ? (result.winner === 1 ? 'player1' : 'player2') : (result.type === 'draw' ? 'draw' : 'forfeit'),
        moves: { board: boardSnapshot }
      });

      // update players stats
      if (player1_id) {
        const p1 = await db.Player.findByPk(player1_id);
        if (p1) {
          if (result.type === 'win' && result.winner === 1) p1.increment('wins');
          else if (result.type === 'win' && result.winner === 2) p1.increment('losses');
          else if (result.type === 'draw') p1.increment('draws');
        }
      }
      if (player2_id) {
        const p2 = await db.Player.findByPk(player2_id);
        if (p2) {
          if (result.type === 'win' && result.winner === 2) p2.increment('wins');
          else if (result.type === 'win' && result.winner === 1) p2.increment('losses');
          else if (result.type === 'draw') p2.increment('draws');
        }
      }
    } catch (err) {
      console.error('Error persisting finished game', err);
    }

    // cleanup in-memory maps and socketToGame
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

  // handle socket disconnects (start 30s timer)
  handleDisconnect(socket) {
    const gameId = this.socketToGame.get(socket.id);
    if (!gameId) return;

    const game = this.activeGames.get(gameId);
    if (!game) return;

    // mark socket as disconnected
    // start 30s timer
    console.log('player disconnected, starting 30s grace', socket.id);
    const timer = setTimeout(async () => {
      // not rejoined in 30s -> forfeit
      console.log('player failed to reconnect within 30s', socket.id);
      // determine which player disconnected
      let disconnectedPlayerNum = null;
      if (game.players[1].socketId === socket.id) disconnectedPlayerNum = 1;
      else if (game.players[2].socketId === socket.id) disconnectedPlayerNum = 2;

      const winner = disconnectedPlayerNum === 1 ? 2 : 1;
      await this._finishGame(game, { type: 'forfeit', winner, reason: 'disconnect_timeout' });
    }, 30000);

    // store timer so that rejoin can clear it
    game.disconnectTimers = game.disconnectTimers || {};
    game.disconnectTimers[socket.id] = timer;

    // remove socketToGame mapping
    this.socketToGame.delete(socket.id);
    // also nullify player's socketId to mark as disconnected
    for (const pNum of [1, 2]) {
      if (game.players[pNum] && game.players[pNum].socketId === socket.id) {
        game.players[pNum].socketId = null;
      }
    }

    // notify remaining player that opponent disconnected and has 30s to rejoin
    for (const pNum of [1, 2]) {
      const p = game.players[pNum];
      if (!p || !p.socketId) continue;
      const sock = this.io.sockets.sockets.get(p.socketId);
      if (sock) sock.emit('opponentDisconnected', { message: 'Opponent disconnected. Waiting 30s for reconnection.' });
    }
  }

  // handle rejoin attempt: username and/or gameId
  async handleRejoin(socket, { username, gameId }) {
    // find an active game where the username matches and player has null socketId
    let foundGame = null;
    if (gameId) {
      const g = this.activeGames.get(gameId);
      if (g) {
        // try to match username to a player slot
        for (const pNum of [1, 2]) {
          const p = g.players[pNum];
          if (p && p.username === username && !p.socketId) {
            foundGame = g;
            break;
          }
        }
      }
    } else {
      // find by username
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

    // rebind socket
    let playerNum = null;
    for (const pNum of [1, 2]) {
      if (foundGame.players[pNum] && foundGame.players[pNum].username === username && !foundGame.players[pNum].socketId) {
        playerNum = pNum;
        break;
      }
    }
    if (!playerNum) {
      socket.emit('error', { message: 'No available player slot for reconnection' });
      return;
    }

    foundGame.players[playerNum].socketId = socket.id;
    this.socketToGame.set(socket.id, foundGame.gameId);

    // clear any disconnect timer
    const timers = foundGame.disconnectTimers || {};
    for (const key of Object.keys(timers)) {
      try { clearTimeout(timers[key]); } catch (e) {}
    }
    foundGame.disconnectTimers = {};

    // send game state to rejoined socket
    const youAre = playerNum;
    socket.emit('rejoined', {
      gameId: foundGame.gameId,
      youAre,
      players: { 1: foundGame.players[1].username, 2: foundGame.players[2].username },
      board: cloneBoard(foundGame.board),
      turn: foundGame.turn,
      status: foundGame.status
    });

    // notify other player that opponent reconnected
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
