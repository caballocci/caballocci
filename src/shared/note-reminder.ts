/** Recordador de notas temporales: cadencia de 24 h y nota persistente como preferencia. */

export const NOTE_REMINDER_NOTE_KEY = 'caballocci.note-reminder-note'
export const NOTE_REMINDER_SHOWN_KEY = 'caballocci.note-reminder-shown-at'
export const NOTE_REMINDER_IGNORED_KEY = 'caballocci.note-reminder-ignored-session'
export const NOTE_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000

export type TemporaryNote = { text: string; writtenAt: string | null }

function readJson(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}

export function readTemporaryNote(): TemporaryNote {
  const stored = readJson(NOTE_REMINDER_NOTE_KEY)
  if (!stored || typeof stored !== 'object') return { text: '', writtenAt: null }
  const { text, writtenAt } = stored as Record<string, unknown>
  const validDate = typeof writtenAt === 'string' && Number.isFinite(Date.parse(writtenAt))
  return { text: typeof text === 'string' ? text : '', writtenAt: validDate ? writtenAt as string : null }
}

export function writeTemporaryNote(note: TemporaryNote) {
  try { localStorage.setItem(NOTE_REMINDER_NOTE_KEY, JSON.stringify(note)) } catch { /* La nota es una preferencia opcional. */ }
}

export function readReminderShownAt(): string | null {
  const value = readJson(NOTE_REMINDER_SHOWN_KEY)
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null
}

export function markReminderShown() {
  try { localStorage.setItem(NOTE_REMINDER_SHOWN_KEY, JSON.stringify(new Date().toISOString())) } catch { /* Preferencia opcional. */ }
}

export function reminderShouldShow(now = Date.now()) {
  const shownAt = readReminderShownAt()
  return !shownAt || now - Date.parse(shownAt) >= NOTE_REMINDER_INTERVAL_MS
}

export function readIgnoredThisSession() {
  try { return sessionStorage.getItem(NOTE_REMINDER_IGNORED_KEY) === '1' } catch { return false }
}

export function ignoreReminderThisSession() {
  try { sessionStorage.setItem(NOTE_REMINDER_IGNORED_KEY, '1') } catch { /* El estado de sesión es opcional. */ }
}
