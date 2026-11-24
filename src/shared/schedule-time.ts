export const TIME_PRESETS = ['09:00', '12:00', '15:00', '18:00', '20:00']
export const STEP_MINUTES = 15
export const CTRL_STEP_MINUTES = 30
export const PLANNER_SCHEDULE_HISTORY_KEY = 'planner'

export const pad = (value: number) => String(value).padStart(2, '0')
export const toDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
export const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next }
export const nextWeekday = (from: Date, weekday: number) => addDays(from, ((weekday - from.getDay() + 7) % 7) || 7)

export function toLocalDateTimeInput(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function fromLocalDateTimeInput(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Acepta "18", "1830", "18:30", "9.15", "6pm", "6:30 pm", "18h". Devuelve "HH:mm" o null. */
export function parseTimeInput(raw: string): string | null {
  const value = raw.trim().toLowerCase().replace(/\s+/g, '').replace('.', ':').replace('h', ':').replace(/:$/, '')
  const match = value.match(/^(\d{1,2})(?::?(\d{2}))?(a|p|am|pm)?$/)
  if (!match) return null
  let hours = Number(match[1])
  const minutes = match[2] ? Number(match[2]) : 0
  const suffix = match[3]
  if (minutes > 59) return null
  if (suffix) {
    if (hours < 1 || hours > 12) return null
    hours = (hours % 12) + (suffix.startsWith('p') ? 12 : 0)
  }
  if (hours > 23) return null
  return `${pad(hours)}:${pad(minutes)}`
}

export const formatMinutes = (total: number) => {
  const day = ((total % 1440) + 1440) % 1440
  return `${pad(Math.floor(day / 60))}:${pad(day % 60)}`
}

export const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** Mueve la hora a la siguiente (delta > 0) o anterior (delta < 0) marca de |delta| minutos. */
export function shiftTime(time: string, delta: number) {
  const step = Math.abs(delta)
  const total = toMinutes(time)
  return formatMinutes(delta > 0 ? (Math.floor(total / step) + 1) * step : (Math.ceil(total / step) - 1) * step)
}
