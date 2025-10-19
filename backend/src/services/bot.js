const ROWS = 6;
const COLS = 7;

function cloneBoard(board) {
  return board.map(row => row.slice());
}

function applyMoveToBoard(board, col, player) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) {
      board[r][col] = player;
      return { success: true, row: r, col };
    }
  }
  return { success: false };
}

function checkWinOnBoard(board, player) {
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
  const center = 3;
  return -Math.abs(center - col);
}

function pickMove(board, botPlayer = 2, opponentPlayer = 1) {
  const cols = validColumns(board);

  // 1) immediate win
  for (const c of cols) {
    const sim = cloneBoard(board);
    const res = applyMoveToBoard(sim, c, botPlayer);
    if (!res.success) continue;
    if (checkWinOnBoard(sim, botPlayer)) return c;
  }

  // 2) block opponent
  for (const c of cols) {
    const sim = cloneBoard(board);
    const res = applyMoveToBoard(sim, c, opponentPlayer);
    if (!res.success) continue;
    if (checkWinOnBoard(sim, opponentPlayer)) return c;
  }

  // 3) fallback heuristic
  let bestCol = null;
  let bestScore = -Infinity;

  for (const c of cols) {
    const sim = cloneBoard(board);
    const res = applyMoveToBoard(sim, c, botPlayer);
    if (!res.success) continue;

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
    if (opponentCanWin) score -= 10;

    if (score > bestScore) {
      bestScore = score;
      bestCol = c;
    }
  }

  if (bestCol === null) {
    return cols[Math.floor(Math.random() * cols.length)];
  }
  return bestCol;
}

module.exports = { pickMove };
