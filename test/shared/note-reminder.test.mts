import assert from 'node:assert/strict'
import test from 'node:test'
import {
  NOTE_REMINDER_IGNORED_KEY,
  NOTE_REMINDER_INTERVAL_MS,
  NOTE_REMINDER_NOTE_KEY,
  NOTE_REMINDER_SHOWN_KEY,
  ignoreReminderThisSession,
  markReminderShown,
  readIgnoredThisSession,
  readReminderShownAt,
  readTemporaryNote,
  reminderShouldShow,
  writeTemporaryNote,
} from '../../src/shared/note-reminder.ts'
import { installStorageMocks } from '../helpers/storage.mts'

test('la nota temporal arranca vacía y sobrevive a una escritura', t => {
  const { local } = installStorageMocks(t)
  const note = { text: 'Comprar leche', writtenAt: '2026-11-20T10:00:00.000Z' }

  assert.deepEqual(readTemporaryNote(), { text: '', writtenAt: null })
  writeTemporaryNote(note)
  assert.deepEqual(readTemporaryNote(), note)
  assert.equal(local.getItem(NOTE_REMINDER_NOTE_KEY), JSON.stringify(note))
})

test('los datos corruptos o con tipos inesperados se descartan', t => {
  const { local } = installStorageMocks(t)

  local.setItem(NOTE_REMINDER_NOTE_KEY, '{roto')
  assert.deepEqual(readTemporaryNote(), { text: '', writtenAt: null })

  local.setItem(NOTE_REMINDER_NOTE_KEY, JSON.stringify({ text: 42, writtenAt: 'no-fecha' }))
  assert.deepEqual(readTemporaryNote(), { text: '', writtenAt: null })

  local.setItem(NOTE_REMINDER_SHOWN_KEY, '"no-fecha"')
  assert.equal(readReminderShownAt(), null)
})

test('el recordatorio respeta la cadencia de 24 horas', t => {
  installStorageMocks(t)

  assert.equal(reminderShouldShow(Date.parse('2026-11-22T12:00:00.000Z')), true)
  markReminderShown()

  const shownAt = readReminderShownAt()
  assert.ok(shownAt)
  const moment = Date.parse(shownAt)
  assert.equal(reminderShouldShow(moment + NOTE_REMINDER_INTERVAL_MS - 1), false)
  assert.equal(reminderShouldShow(moment + NOTE_REMINDER_INTERVAL_MS), true)
})

test('ignorar el recordatorio solo afecta a la sesión actual', t => {
  const { session } = installStorageMocks(t)

  assert.equal(readIgnoredThisSession(), false)
  ignoreReminderThisSession()
  assert.equal(readIgnoredThisSession(), true)
  assert.equal(session.getItem(NOTE_REMINDER_IGNORED_KEY), '1')
})

test('un almacenamiento bloqueado no rompe las preferencias opcionales', t => {
  installStorageMocks(t)
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: () => { throw new Error('bloqueado') },
      setItem: () => { throw new Error('bloqueado') },
    },
    configurable: true,
    writable: true,
  })

  assert.doesNotThrow(() => writeTemporaryNote({ text: 'x', writtenAt: null }))
  assert.doesNotThrow(() => markReminderShown())
  assert.deepEqual(readTemporaryNote(), { text: '', writtenAt: null })
})
