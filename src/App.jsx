import { useEffect, useMemo, useRef, useState } from 'react'
import data from './data/runners.json'
import {
  MAX_GUESSES, MODES, MODE_LABEL, TILES, compareAll, dailyAnswer, displayValue,
  poolFor, remaining, shareText, todayKey,
} from './game.js'

const RUNNERS = data.runners
const BY_ID = Object.fromEntries(RUNNERS.map((r) => [r.id, r]))
const STORE = 'nescaxcle:v1'

function load(key, fallback) {
  try {
    const v = localStorage.getItem(`${STORE}:${key}`)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}
function save(key, value) {
  try {
    localStorage.setItem(`${STORE}:${key}`, JSON.stringify(value))
  } catch { /* storage unavailable */ }
}

const emptyStats = () => ({ played: 0, won: 0, streak: 0, best: 0, dist: Array(MAX_GUESSES).fill(0), last: null })

function recordResult(mode, key, won, n) {
  const s = load(`stats:${mode}`, emptyStats())
  if (s.last === key) return
  s.played += 1
  if (won) {
    s.won += 1
    s.dist[n - 1] += 1
  }
  const yesterday = new Date(Date.parse(key + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10)
  s.streak = won ? (s.lastWon === yesterday ? s.streak + 1 : 1) : 0
  if (won) s.lastWon = key
  s.best = Math.max(s.best, s.streak)
  s.last = key
  save(`stats:${mode}`, s)
}

function untilMidnightET() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, +p.value]),
  )
  const left = 86400 - (parts.hour * 3600 + parts.minute * 60 + parts.second)
  const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function App() {
  const [mode, setMode] = useState(() => load('mode', 'M'))
  const [day, setDay] = useState(todayKey)
  const pool = useMemo(() => poolFor(RUNNERS, mode), [mode])
  const answer = useMemo(() => dailyAnswer(pool, mode, day), [pool, mode, day])
  const [guessIds, setGuessIds] = useState(() => load(`game:${mode}:${day}`, []))
  const [menu, setMenu] = useState(null) // 'help' | 'stats' | null
  const [showLeft, setShowLeft] = useState(false)

  useEffect(() => save('mode', mode), [mode])
  useEffect(() => setGuessIds(load(`game:${mode}:${day}`, [])), [mode, day])
  useEffect(() => {
    const t = setInterval(() => setDay(todayKey()), 30000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (!load('seenHelp', false)) {
      setMenu('help')
      save('seenHelp', true)
    }
  }, [])

  const guesses = guessIds.map((id) => BY_ID[id]).filter(Boolean)
  const won = guesses.some((g) => g.id === answer.id)
  const over = won || guesses.length >= MAX_GUESSES
  const left = useMemo(() => remaining(pool, guesses, answer), [pool, guessIds, answer])

  function guess(r) {
    if (over || guessIds.includes(r.id)) return
    const next = [...guessIds, r.id]
    setGuessIds(next)
    save(`game:${mode}:${day}`, next)
    const nowWon = r.id === answer.id
    if (nowWon || next.length >= MAX_GUESSES) recordResult(mode, day, nowWon, next.length)
  }

  return (
    <div className="app">
      <header className="top">
        <button className="icon-btn" aria-label="How to play" onClick={() => setMenu('help')}>?</button>
        <h1 className="logo">NESCAXCLE</h1>
        <button className="icon-btn" aria-label="Stats" onClick={() => setMenu('stats')}>•••</button>
      </header>

      <nav className="modes" role="tablist" aria-label="Pool">
        {MODES.map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </nav>

      <section className="counts">
        <div>
          <span className="lbl">Guesses left</span>
          <span className="num">{MAX_GUESSES - guesses.length}</span>
        </div>
        {over ? (
          <button className="left-btn" onClick={() => setShowLeft((v) => !v)} aria-expanded={showLeft}>
            <span className="lbl">Runners left <span className="caret">{showLeft ? '▴' : '▾'}</span></span>
            <span className="num">{left.length}</span>
          </button>
        ) : (
          <div>
            <span className="lbl">Runners left</span>
            <span className="num">{left.length}</span>
          </div>
        )}
      </section>

      {over && showLeft && (
        <ul className="left-list">
          {left.slice(0, 200).map((r) => (
            <li key={r.id}>
              <a href={`https://racecast.co/athlete/${r.id}`} target="_blank" rel="noreferrer">
                <span>{r.name}</span><span className="muted">{r.college}</span>
              </a>
            </li>
          ))}
          {left.length > 200 && <li className="muted more">+{left.length - 200} more</li>}
        </ul>
      )}

      <GuessInput pool={pool} taken={guessIds} disabled={over} onPick={guess} />

      <div className="guesses">
        {[...guesses].reverse().map((g, i) => (
          <GuessRow key={g.id} runner={g} answer={answer} fresh={i === 0} />
        ))}
      </div>

      {over && <Result answer={answer} won={won} guesses={guesses} mode={mode} day={day} />}

      <footer className="foot">
        Speed ratings, PRs and rosters from <a href="https://racecast.co" target="_blank" rel="noreferrer">racecast.co</a>
        {' '}· {data.season} season · updated {data.updated}
      </footer>

      {menu && (
        <Modal onClose={() => setMenu(null)}>
          {menu === 'help' ? <Help /> : <Stats mode={mode} />}
        </Modal>
      )}
    </div>
  )
}

function GuessInput({ pool, taken, disabled, onPick }) {
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const ref = useRef(null)
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return pool
      .filter((r) => !taken.includes(r.id))
      .filter((r) => r.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(s)) || r.name.toLowerCase().startsWith(s))
      .slice(0, 8)
  }, [q, pool, taken])

  function pick(r) {
    onPick(r)
    setQ('')
    setHi(0)
    ref.current?.focus()
  }

  return (
    <div className="input-wrap">
      <input
        ref={ref}
        className="guess-input"
        placeholder={disabled ? 'Game over' : 'Guess a runner…'}
        disabled={disabled}
        value={q}
        autoComplete="off"
        spellCheck="false"
        onChange={(e) => { setQ(e.target.value); setHi(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
          if (e.key === 'Enter' && matches[hi]) pick(matches[hi])
          if (e.key === 'Escape') setQ('')
        }}
      />
      {matches.length > 0 && (
        <ul className="suggest" role="listbox">
          {matches.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === hi}>
              <button className={i === hi ? 'hi' : ''} onMouseEnter={() => setHi(i)} onClick={() => pick(r)}>
                <span>{r.name}</span>
                <span className="muted">{r.college} · {r.year ?? '–'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const ARROW = { up: '↑', down: '↓' }

function GuessRow({ runner, answer, fresh }) {
  const fb = compareAll(runner, answer)
  return (
    <article className="guess">
      <h2 className="gname">{runner.name}</h2>
      <div className="tiles">
        {TILES.map((t, i) => (
          <div
            key={t.key}
            className={`tile ${fb[i].color} ${t.time || t.key === 'rating' ? 'numeric' : ''} ${fresh ? 'flip' : ''}`}
            style={fresh ? { animationDelay: `${i * 90}ms` } : undefined}
          >
            <span className="tl">{t.label(runner)}</span>
            <span className="tv">{displayValue(runner, t.key)}</span>
            {fb[i].dir && <span className="ta">{ARROW[fb[i].dir]}</span>}
          </div>
        ))}
      </div>
    </article>
  )
}

function Result({ answer, won, guesses, mode, day }) {
  const [copied, setCopied] = useState(false)
  const [clock, setClock] = useState(untilMidnightET)
  useEffect(() => {
    const t = setInterval(() => setClock(untilMidnightET()), 1000)
    return () => clearInterval(t)
  }, [])

  async function share() {
    const url = location.origin
    const text = shareText({ mode, key: day, guesses, answer, won, url })
    // Rich-text version so editors that accept HTML paste a real link.
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const lines = text.split('\n')
    const html = [...lines.slice(0, -1).map(esc), `<a href="${url}">${esc(location.host)}</a>`].join('<br>')
    try {
      if (window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        })])
      } else {
        await navigator.clipboard.writeText(text)
      }
    } catch {
      // Older browsers: copy via a hidden textarea.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section className="result">
      <h2 className="rname">{answer.name}</h2>
      <p className="rsub">{won ? `Got it in ${guesses.length} of ${MAX_GUESSES}.` : 'Out of guesses.'}</p>
      <p className="rmeta">
        {answer.college} · {answer.year ?? '–'} · {answer.state ?? '–'} · Speed rating {answer.rating?.toFixed(1) ?? '–'}
      </p>
      <div className="ractions">
        <button className="btn primary" onClick={share}>{copied ? 'Copied!' : 'Share'}</button>
        <a className="btn" href={`https://racecast.co/athlete/${answer.id}`} target="_blank" rel="noreferrer">Racecast profile</a>
      </div>
      <p className="next">Next runner in <span className="mono">{clock}</span></p>
    </section>
  )
}

function Modal({ children, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn close" aria-label="Close" onClick={onClose}>✕</button>
        {children}
      </div>
    </div>
  )
}

function Help() {
  return (
    <div className="help">
      <h2>How to play</h2>
      <p>Guess today's mystery NESCAC cross country runner in {MAX_GUESSES} tries. Pick men's, women's or combined; each has its own daily runner.</p>
      <div className="legend">
        <div className="tile green"><span className="tl">Green</span><span className="tv">Exact</span></div>
        <div className="tile yellow"><span className="tl">Yellow</span><span className="tv">Close</span></div>
        <div className="tile grey"><span className="tl">Grey</span><span className="tv">Off</span></div>
      </div>
      <ul>
        <li><b>Year</b> is yellow when one class away.</li>
        <li><b>XC</b> (8K men / 6K women) is yellow within 20s / 15s.</li>
        <li><b>5K</b> within 10s, <b>Mile</b> within 3s, <b>800</b> within 1.5s.</li>
        <li><b>Speed Rtg</b> is the racecast.co 2026 XC rating; yellow within 1.5.</li>
        <li><b>↑ / ↓</b> mean the mystery runner's value is higher / lower (a higher time is slower).</li>
        <li><b>–</b> means no college PR. Two dashes match (green).</li>
        <li>PRs are college-only; State is home state from high school.</li>
      </ul>
      <p className="muted"><b>Runners left</b> counts everyone still consistent with your clues. When the game ends, tap it to see who they were.</p>
    </div>
  )
}

function Stats({ mode }) {
  const s = load(`stats:${mode}`, emptyStats())
  const max = Math.max(1, ...s.dist)
  return (
    <div className="stats">
      <h2>{MODE_LABEL[mode]} stats</h2>
      <div className="stat-row">
        <div><b>{s.played}</b><span>Played</span></div>
        <div><b>{s.played ? Math.round((100 * s.won) / s.played) : 0}</b><span>Win %</span></div>
        <div><b>{s.streak}</b><span>Streak</span></div>
        <div><b>{s.best}</b><span>Best</span></div>
      </div>
      <h3>Guess distribution</h3>
      <div className="dist">
        {s.dist.map((n, i) => (
          <div key={i} className="bar-row">
            <span>{i + 1}</span>
            <div className="bar" style={{ width: `${Math.max(6, (100 * n) / max)}%` }}>{n}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
