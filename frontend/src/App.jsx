import React, { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'
import axios from 'axios'

const SERVER_URL = 'http://localhost:3000'

export default function App() {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState('idle')
  const [youAre, setYouAre] = useState(null)
  const [gameId, setGameId] = useState(null)
  const [players, setPlayers] = useState({1: null, 2: null})
  const [board, setBoard] = useState(Array.from({length:6}, () => Array.from({length:7}, () => 0)))
  const [turn, setTurn] = useState(1)
  const [messages, setMessages] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const socketRef = useRef(null)

  useEffect(() => {
    const s = io(SERVER_URL)
    socketRef.current = s
    setSocket(s)

    s.on('connect', () => { setConnected(true); addMsg('socket connected: ' + s.id) })
    s.on('disconnect', () => { setConnected(false); addMsg('socket disconnected') })
    s.on('joined', () => addMsg('joined queue'))
    s.on('waiting', (d) => addMsg(d.message))
    s.on('matchFound', (payload) => {
      addMsg('match found')
      setGameId(payload.gameId)
      setYouAre(payload.youAre)
      setPlayers(payload.players)
      setBoard(payload.board)
      setTurn(payload.turn)
      setStatus('playing')
    })
    s.on('gameUpdate', (payload) => {
      setBoard(payload.board)
      setTurn(payload.turn)
      if (payload.lastMove) addMsg(`Move: P${payload.lastMove.player} -> col ${payload.lastMove.col}`)
    })
    s.on('gameOver', (payload) => {
      setBoard(payload.finalBoard)
      setStatus('finished')
      if (payload.result.type === 'win') addMsg('Winner: P' + payload.result.winner)
      else if (payload.result.type === 'draw') addMsg('Draw')
      else if (payload.result.type === 'forfeit') addMsg('Forfeit')
      fetchLeaderboard()
    })
    s.on('rejoined', (payload) => {
      setGameId(payload.gameId)
      setYouAre(payload.youAre)
      setPlayers(payload.players)
      setBoard(payload.board)
      setTurn(payload.turn)
      setStatus(payload.status || 'playing')
      addMsg('rejoined game')
    })
    s.on('opponentDisconnected', (d) => addMsg(d.message))
    s.on('opponentReconnected', (d) => addMsg(d.message))
    s.on('error', (e) => addMsg('error: ' + (e.message || JSON.stringify(e))))

    fetchLeaderboard()

    return () => { s.disconnect() }
  }, [])

  function addMsg(m) {
    setMessages(prev => [...prev.slice(-30), `[${new Date().toLocaleTimeString()}] ${m}`])
  }

  async function handleJoin() {
    if (!socket) return
    if (!username.trim()) return alert('enter username')
    socket.emit('join', { username })
    localStorage.setItem('cf_username', username)
  }

  function renderCell(r, c) {
    const v = board[r][c]
    const cls = v === 0 ? 'cell' : v === 1 ? 'cell p1' : 'cell p2'
    return <div key={`c${r}-${c}`} className={cls}></div>
  }

  function columnClick(c) {
    if (!gameId || status !== 'playing') return
    if ((youAre === 1 && turn !== 1) || (youAre === 2 && turn !== 2)) { addMsg('not your turn'); return }
    socket.emit('makeMove', { gameId, col: c })
  }

  async function fetchLeaderboard() {
    try {
      const res = await axios.get(SERVER_URL + '/leaderboard/top?limit=10')
      if (res.data && res.data.players) setLeaderboard(res.data.players)
    } catch (err) { console.error(err) }
  }

  return (
    <div className="app">
      <div className="sidebar">
        <h2>Connect Four (Realtime)</h2>
        <div>Server: {SERVER_URL}</div>
        <div>Socket: {connected ? 'connected' : 'disconnected'}</div>

        <div className="join">
          <input placeholder="username" value={username} onChange={e=>setUsername(e.target.value)} />
          <button onClick={handleJoin}>Join Queue</button>
          <button onClick={() => {
            const saved = localStorage.getItem('cf_username')
            if (!saved) return alert('no saved username')
            socket.emit('rejoin', { username: saved, gameId: null })
          }}>Rejoin (saved)</button>
        </div>

        <div className="info">
          <div><strong>Players</strong></div>
          <div>1: {players[1] || '-'}</div>
          <div>2: {players[2] || '-'}</div>
          <div>GameId: {gameId || '-'}</div>
          <div>Turn: {turn}</div>
          <div>Status: {status}</div>
        </div>

        <div className="leaderboard">
          <h3>Leaderboard</h3>
          <button onClick={fetchLeaderboard}>Refresh</button>
          <ol>
            {leaderboard.map(p => (
              <li key={p.id}>{p.username} — {p.wins}W / {p.losses}L / {p.draws}D</li>
            ))}
          </ol>
        </div>

        <div className="messages">
          <h3>Logs</h3>
          <div className="logbox">{messages.map((m,i) => <div key={i}>{m}</div>)}</div>
        </div>
      </div>

      <div className="main">
        <div className="board">
          {Array.from({length:7}).map((_, c) => (
            <div key={`col-${c}`} className="col" onClick={() => columnClick(c)}>
              {Array.from({length:6}).map((_, rIdx) => renderCell(rIdx, c))}
            </div>
          ))}
        </div>
        <div className="controls">
          <button onClick={() => { fetchLeaderboard(); addMsg('refreshed leaderboard') }}>Refresh Leaderboard</button>
        </div>
      </div>
    </div>
  )
}
