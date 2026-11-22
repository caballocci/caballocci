import assert from 'node:assert/strict'
import test from 'node:test'
import {
  POST_DATE_MARKS_KEY,
  POST_INTEREST_KEY,
  formatElapsedSince,
  formatMarkedAt,
  interestLevelLabels,
  interestLevelNames,
  readPostDateMarks,
  readPostInterestLevels,
  writePostDateMarks,
  writePostInterestLevels,
} from '../../src/shared/post-marks.ts'
import { installStorageMocks } from '../helpers/storage.mts'

const NOW = Date.parse('2026-11-22T12:00:00.000Z')
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()

test('las marcas se guardan y se recuperan descartando valores inválidos', t => {
  const { local } = installStorageMocks(t)

  writePostDateMarks({ p1: '2026-11-20T10:00:00.000Z', p2: 'no-fecha' })
  writePostInterestLevels({ p1: 2 })

  assert.deepEqual(readPostDateMarks(), { p1: '2026-11-20T10:00:00.000Z' })
  assert.deepEqual(readPostInterestLevels(), { p1: 2 })
  assert.deepEqual(JSON.parse(local.getItem(POST_DATE_MARKS_KEY) || 'null'), { p1: '2026-11-20T10:00:00.000Z', p2: 'no-fecha' })
  assert.deepEqual(JSON.parse(local.getItem(POST_INTEREST_KEY) || 'null'), { p1: 2 })
})

test('un mapa corrupto o que no es objeto se lee como vacío', t => {
  const { local } = installStorageMocks(t)

  local.setItem(POST_DATE_MARKS_KEY, '[]')
  local.setItem(POST_INTEREST_KEY, '{roto')
  assert.deepEqual(readPostDateMarks(), {})
  assert.deepEqual(readPostInterestLevels(), {})

  local.setItem(POST_INTEREST_KEY, '{ "ok": 2, "bad": 9 }')
  assert.deepEqual(readPostInterestLevels(), { ok: 2 })
})

test('los niveles de interés tienen etiqueta y nombre', () => {
  assert.deepEqual(interestLevelLabels, { 1: '>', 2: '>>', 3: '>>>' })
  assert.equal(interestLevelNames[1], 'Interés')
  assert.equal(interestLevelNames[3], 'Interés especial')
})

test('formatElapsedSince resume minutos, horas y días', () => {
  assert.equal(formatElapsedSince(minutesAgo(0), NOW), 'ahora')
  assert.equal(formatElapsedSince(minutesAgo(25), NOW), '25 min')
  assert.equal(formatElapsedSince(minutesAgo(125), NOW), '2 h 5 min')
  assert.equal(formatElapsedSince(minutesAgo(50 * 60 + 1), NOW), '2 d 2 h 1 min')
  assert.equal(formatElapsedSince(new Date(NOW + 60_000).toISOString(), NOW), 'ahora')
})

test('formatMarkedAt combina la fecha local con el tiempo transcurrido', () => {
  const text = formatMarkedAt(minutesAgo(50 * 60), NOW)

  assert.match(text, /^Marcada el .+ · pasaron 2 d 2 h 0 min$/)
})
