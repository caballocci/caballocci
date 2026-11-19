/** Marcas personales separadas de Post: no cambian estado, programación ni prioridad. */

export const POST_DATE_MARKS_KEY = 'caballocci.post-date-marks'
export const POST_INTEREST_KEY = 'caballocci.post-interest'

export type PostInterestLevel = 1 | 2 | 3

export const interestLevelLabels: Record<PostInterestLevel, string> = { 1: '>', 2: '>>', 3: '>>>' }
export const interestLevelNames: Record<PostInterestLevel, string> = {
  1: 'Interés',
  2: 'Mucho interés',
  3: 'Interés especial',
}

function readMap<T>(key: string, isValid: (value: unknown) => value is T): Record<string, T> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) || '{}')
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    return Object.fromEntries(Object.entries(stored).filter(([, value]) => isValid(value))) as Record<string, T>
  } catch {
    return {}
  }
}

const isDateMark = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const isInterestLevel = (value: unknown): value is PostInterestLevel => value === 1 || value === 2 || value === 3

export function readPostDateMarks() { return readMap(POST_DATE_MARKS_KEY, isDateMark) }
export function readPostInterestLevels() { return readMap(POST_INTEREST_KEY, isInterestLevel) }

function writeMap<T>(key: string, values: Record<string, T>) {
  try { localStorage.setItem(key, JSON.stringify(values)) } catch { /* Las preferencias son opcionales. */ }
}

export function writePostDateMarks(values: Record<string, string>) { writeMap(POST_DATE_MARKS_KEY, values) }
export function writePostInterestLevels(values: Record<string, PostInterestLevel>) { writeMap(POST_INTEREST_KEY, values) }

/** Tiempo transcurrido en forma compacta: “2 d 2 h 1 min”. */
export function formatElapsedSince(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000))
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${minutes % 60} min`
  const days = Math.floor(hours / 24)
  return `${days} d ${hours % 24} h ${minutes % 60} min`
}

export function formatMarkedAt(iso: string, now = Date.now()) {
  const date = new Date(iso)
  const when = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
  return `Marcada el ${when} · pasaron ${formatElapsedSince(iso, now)}`
}
