// backend/src/services/bot.js
// Board is rows x cols (6 x 7), 0 = empty, 1 = player1, 2 = player2 (bot usually 2).
const ROWS = 6;
const COLS = 7;

function cloneBoard(board) {
  return board.map(row => row.slice());
}

function applyMoveToBoard(board, col, player) {
  // returns { success: bool, row: index } or { success:false }
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) {
      board[r][col] = player;
      return { success: true, row: r };
    }
  }
  return { success: false };
}

function checkWinOnBoard(board, player) {
  // check 4 in a row for player on given board (same logic as main checkWin)
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

function validColumns(board) {
  const cols = [];
  for (let c = 0; c < COLS; c++) {
    if (board[0][c] === 0) cols.push(c);
  }
  return cols;
}

function scoreColumnHeuristic(col) {
  // prefer center columns: 3, then 2/4, then 1/5, then 0/6
  const center = 3;
  return -Math.abs(center - col);
}

/**
 * Decide bot move.
 * @param {*} board - rows x cols 2D array
 * @param {*} botPlayer - integer (1 or 2) assigned to bot
 * @param {*} opponentPlayer - integer of opponent
 * @returns integer column index 0..6
 */
function pickMove(board, botPlayer = 2, opponentPlayer = 1) {
  const cols = validColumns(board);

  // 1) If any move gives immediate win, take it.
  for (const c of cols) {
    const sim = cloneBoard(board);
    const res = applyMoveToBoard(sim, c, botPlayer);
    if (!res.success) continue;
    if (checkWinOnBoard(sim, botPlayer)) return c;
  }

  // 2) If opponent has immediate winning move next, block it.
  for (const c of cols) {
    const sim = cloneBoard(board);
    const res = applyMoveToBoard(sim, c, opponentPlayer);
    if (!res.success) continue;
    if (checkWinOnBoard(sim, opponentPlayer)) return c;
  }

  // 3) Fallback heuristic: prefer center, avoid moves that allow opponent to win immediately next.
  // Evaluate columns by heuristic score and safety.
  let bestCol = null;
  let bestScore = -Infinity;

  for (const c of cols) {
    const sim = cloneBoard(board);
    const res = applyMoveToBoard(sim, c, botPlayer);
    if (!res.success) continue;

    // check if opponent could win after this move (simulate opponent best response)
    let opponentCanWin = false;
    const oppCols = validColumns(sim);
    for (const oc of oppCols) {
      const sim2 = cloneBoard(sim);
      const r2 = applyMoveToBoard(sim2, oc, opponentPlayer);
      if (!r2.success) continue;
      if (checkWinOnBoard(sim2, opponentPlayer)) {
        opponentCanWin = true;
        break;
      }
    }

    let score = scoreColumnHeuristic(c);
    if (opponentCanWin) score -= 10; // penalize unsafe moves

    if (score > bestScore) {
      bestScore = score;
      bestCol = c;
    }
  }

  // if nothing chosen (shouldn't happen), pick random valid column
  if (bestCol === null) {
    if (cols.length === 0) return null;
    return cols[Math.floor(Math.random() * cols.length)];
  }
  return bestCol;
}

module.exports = { pickMove };


