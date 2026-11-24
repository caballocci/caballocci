import { toLocalDateTimeInput } from './schedule-time.ts'

export type ScheduleHistoryEntry = { id: string; scheduledAt: string; confirmedAt: string }

export const scheduleHistoryStorageKey = (historyKey: string) => `caballocci.schedule-history.${historyKey}`

export function loadScheduleHistory(historyKey: string): ScheduleHistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(scheduleHistoryStorageKey(historyKey)) || '[]')
    return Array.isArray(parsed)
      ? parsed.filter(item => item && typeof item.id === 'string' && typeof item.scheduledAt === 'string' && typeof item.confirmedAt === 'string')
      : []
  } catch { return [] }
}

export function recordScheduleHistory(historyKey: string, scheduledAt: string | null) {
  if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) return false
  const current = loadScheduleHistory(historyKey)
  const others = current.filter(item => item.scheduledAt !== scheduledAt)
  if (current[0]?.scheduledAt === scheduledAt && others.length === current.length - 1) return false
  const next = [{ id: crypto.randomUUID(), scheduledAt, confirmedAt: new Date().toISOString() }, ...others].slice(0, 20)
  try { localStorage.setItem(scheduleHistoryStorageKey(historyKey), JSON.stringify(next)); return true } catch { return false }
}

export function removeScheduleHistoryEntry(historyKey: string, id: string) {
  const next = loadScheduleHistory(historyKey).filter(item => item.id !== id)
  try { localStorage.setItem(scheduleHistoryStorageKey(historyKey), JSON.stringify(next)) } catch { /* Historial opcional. */ }
  return next
}

export function historyEntryLabel(entry: ScheduleHistoryEntry) {
  const local = toLocalDateTimeInput(entry.scheduledAt)
  if (!local) return ''
  return new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(local))
}
