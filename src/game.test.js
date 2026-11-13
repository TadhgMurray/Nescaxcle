import test from 'node:test'
import assert from 'node:assert/strict'
import { compareTile, fmtTime, remaining, dailyAnswer, shareText } from './game.js'

// The three runners from the reference screenshot.
const maru = { id: 'a', name: 'Anand Maru', gender: 'M', college: 'Amherst', state: 'NY', year: 'FR', xc: 1561.0, '5k': null, mile: null, '800': null, rating: 107.3 }
const blumen = { id: 'b', name: 'Alex Blumen', gender: 'M', college: 'Wesleyan', state: 'MA', year: 'SO', xc: 1546.6, '5k': 936.52, mile: 287.35, '800': null, rating: 108 }
const hoffman = { id: 'c', name: 'Max Hoffman', gender: 'M', college: 'Bates', state: 'MA', year: 'JR', xc: 1529.4, '5k': 890.44, mile: 253.62, '800': null, rating: 113.3 }

test('formats times like the screenshot', () => {
  assert.equal(fmtTime(1546.6, 1), '25:46.6')
  assert.equal(fmtTime(1561, 1), '26:01.0')
  assert.equal(fmtTime(890.44, 2), '14:50.44')
  assert.equal(fmtTime(253.62, 2), '4:13.62')
  assert.equal(fmtTime(119.996, 2), '2:00.00')
})

test('matches the colours and arrows in the screenshot', () => {
  assert.deepEqual(compareTile('college', blumen, maru), { color: 'grey' })
  assert.deepEqual(compareTile('state', blumen, maru), { color: 'grey' }) // no partial credit, even for bordering states
  assert.deepEqual(compareTile('year', blumen, maru), { color: 'yellow', dir: 'down' })
  assert.deepEqual(compareTile('xc', blumen, maru), { color: 'yellow', dir: 'up' })
  assert.deepEqual(compareTile('5k', blumen, maru), { color: 'grey' })
  assert.deepEqual(compareTile('800', blumen, maru), { color: 'green' })
  assert.deepEqual(compareTile('year', hoffman, maru), { color: 'grey', dir: 'down' })
  assert.deepEqual(compareTile('xc', hoffman, maru), { color: 'grey', dir: 'up' })
})

test('men and women XC times are not compared', () => {
  const w = { ...maru, id: 'w', gender: 'W', xc: 1300 }
  assert.deepEqual(compareTile('xc', w, maru), { color: 'grey' })
})

test('remaining narrows to the answer once guessed', () => {
  const pool = [maru, blumen, hoffman]
  assert.equal(remaining(pool, [], maru).length, 3)
  assert.deepEqual(remaining(pool, [blumen, hoffman, maru], maru), [maru])
  assert.ok(remaining(pool, [blumen], maru).every((r) => r.id !== 'b'))
})

test('daily answer is stable and cycles through everyone', () => {
  const pool = [maru, blumen, hoffman]
  assert.equal(dailyAnswer(pool, 'M', '2026-11-13').id, dailyAnswer([...pool].reverse(), 'M', '2026-11-13').id)
  const days = ['2026-01-01', '2026-01-02', '2026-01-03'].map((d) => dailyAnswer(pool, 'M', d).id)
  assert.equal(new Set(days).size, 3)
})

test('share text', () => {
  const t = shareText({ mode: 'M', key: '2026-11-13', guesses: [blumen, maru], answer: maru, won: true })
  assert.match(t, /^Nescaxcle 2026-11-13 \(Men's\) 2\/8\n⬛⬛🟨🟨/)
})
