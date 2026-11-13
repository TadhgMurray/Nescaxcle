// Core Nescaxcle rules: tile comparison, daily answer, remaining candidates.

export const MAX_GUESSES = 8
export const MODES = ['M', 'W', 'ALL']
export const MODE_LABEL = { M: "Men's", W: "Women's", ALL: 'Combined' }

const YEARS = ['FR', 'SO', 'JR', 'SR']

// "Close" window for yellow tiles, in seconds (rating: points).
export const CLOSE = {
  xcM: 20, // 8K
  xcW: 15, // 6K
  '5k': 10,
  mile: 3,
  '800': 1.5,
  rating: 1.5,
}

export function fmtTime(s, decimals = 2) {
  if (s == null) return '–'
  const scale = 10 ** decimals
  const total = Math.round(s * scale) / scale
  const m = Math.floor(total / 60)
  const rest = (total - m * 60).toFixed(decimals)
  return `${m}:${rest.padStart(decimals ? 3 + decimals : 2, '0')}`
}

export const xcLabel = (r) => (r.gender === 'W' ? '6K XC' : '8K XC')

// Compare a numeric attribute. dir: 'up' means the answer's value is higher.
function numeric(g, a, close, eps = 0.005) {
  if (g == null && a == null) return { color: 'green' }
  if (g == null || a == null) return { color: 'grey' }
  if (Math.abs(g - a) < eps) return { color: 'green' }
  return {
    color: Math.abs(g - a) <= close ? 'yellow' : 'grey',
    dir: a > g ? 'up' : 'down',
  }
}

// The tiles shown for each guess, in display order.
export const TILES = [
  { key: 'college', label: () => 'College' },
  { key: 'state', label: () => 'State' },
  { key: 'year', label: () => 'Year' },
  { key: 'xc', label: (r) => xcLabel(r), time: true },
  { key: 'rating', label: () => 'Speed Rtg' },
  { key: '5k', label: () => '5K', time: true },
  { key: 'mile', label: () => 'Mile', time: true },
  { key: '800', label: () => '800', time: true },
]

export function displayValue(r, key) {
  const v = r[key]
  if (v == null) return '–'
  if (key === 'rating') return v.toFixed(1)
  if (key === 'xc') return fmtTime(v, 1)
  if (['5k', 'mile', '800'].includes(key)) return fmtTime(v, 2)
  return String(v)
}

export function compareTile(key, guess, answer) {
  switch (key) {
    case 'college':
      return { color: guess.college === answer.college ? 'green' : 'grey' }
    case 'state':
      return { color: guess.state === answer.state ? 'green' : 'grey' }
    case 'year': {
      const gi = YEARS.indexOf(guess.year), ai = YEARS.indexOf(answer.year)
      if (gi < 0 || ai < 0) return { color: gi === ai ? 'green' : 'grey' }
      return numeric(gi, ai, 1)
    }
    case 'xc': {
      // Men's 8K and women's 6K aren't comparable as raw times.
      if (guess.gender !== answer.gender) {
        return { color: guess.xc == null && answer.xc == null ? 'green' : 'grey' }
      }
      return numeric(guess.xc, answer.xc, answer.gender === 'W' ? CLOSE.xcW : CLOSE.xcM)
    }
    case 'rating':
      return numeric(guess.rating, answer.rating, CLOSE.rating, 0.05)
    default:
      return numeric(guess[key], answer[key], CLOSE[key])
  }
}

export const compareAll = (guess, answer) =>
  TILES.map((t) => compareTile(t.key, guess, answer))

const sig = (fb) => fb.map((f) => f.color + (f.dir || '')).join(',')

// Runners in the pool consistent with every clue so far.
export function remaining(pool, guesses, answer) {
  const clues = guesses.map((g) => [g, sig(compareAll(g, answer))])
  return pool.filter((c) =>
    clues.every(([g, s]) => (g.id === answer.id) === (g.id === c.id) && sig(compareAll(g, c)) === s),
  )
}

export function poolFor(runners, mode) {
  return mode === 'ALL' ? runners : runners.filter((r) => r.gender === mode)
}

// ---- Daily answer -------------------------------------------------------

// Puzzle day in US Eastern time (NESCAC time zone).
export function todayKey(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  return p // YYYY-MM-DD
}

const EPOCH = Date.UTC(2026, 0, 1)
export const dayNumber = (key) => Math.round((Date.parse(key + 'T00:00:00Z') - EPOCH) / 86400000)

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed) {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Walk a fixed shuffle of the pool so nobody repeats until everyone has been used.
export function dailyAnswer(pool, mode, key) {
  const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : 1))
  const n = dayNumber(key)
  const cycle = Math.floor(n / sorted.length)
  const rand = rng(hash(`nescaxcle:${mode}:${cycle}`))
  for (let i = sorted.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
  }
  return sorted[((n % sorted.length) + sorted.length) % sorted.length]
}

// ---- Share text ---------------------------------------------------------

const EMOJI = { green: '🟩', yellow: '🟨', grey: '⬛' }

export function shareText({ mode, key, guesses, answer, won, url }) {
  const head = `Nescaxcle ${key} (${MODE_LABEL[mode]}) ${won ? guesses.length : 'X'}/${MAX_GUESSES}`
  const rows = guesses.map((g) => compareAll(g, answer).map((f) => EMOJI[f.color]).join(''))
  return [head, ...rows, url].filter(Boolean).join('\n')
}
