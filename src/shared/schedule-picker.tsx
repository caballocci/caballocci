import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Clock3, History, Minus, Plus, Trash2 } from 'lucide-react'
import './schedule-picker.css'
import { historyEntryLabel, loadScheduleHistory, removeScheduleHistoryEntry, type ScheduleHistoryEntry } from './schedule-picker-history'
import {
  addDays,
  CTRL_STEP_MINUTES,
  formatMinutes,
  nextWeekday,
  parseTimeInput,
  pad,
  STEP_MINUTES,
  shiftTime,
  TIME_PRESETS,
  toDateKey,
  toLocalDateTimeInput,
  toMinutes,
} from './schedule-time'

export { parseTimeInput, PLANNER_SCHEDULE_HISTORY_KEY } from './schedule-time'
export { recordScheduleHistory } from './schedule-picker-history'

function TimeInput({ value, onCommit }: { value: string; onCommit(time: string): void }) {
  const [text, setText] = useState(value)
  const [invalid, setInvalid] = useState(false)
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) { setText(value); setInvalid(false) } }, [value])

  const commit = () => {
    const parsed = parseTimeInput(text)
    if (!parsed) { setInvalid(true); return }
    setInvalid(false)
    setText(parsed)
    if (parsed !== value) onCommit(parsed)
  }

  const isPm = Number(value.slice(0, 2)) >= 12
  return (
    <div className="time-row">
      <div className="time-stepper">
        <button type="button" aria-label={`Restar ${STEP_MINUTES} minutos; con Ctrl, ${CTRL_STEP_MINUTES}`} title={`−${STEP_MINUTES} min · Ctrl: −${CTRL_STEP_MINUTES} min`} onClick={event => onCommit(shiftTime(value, -(event.ctrlKey || event.metaKey ? CTRL_STEP_MINUTES : STEP_MINUTES)))}><Minus size={12} /></button>
        <input
          data-undo-control
          inputMode="numeric"
          autoComplete="off"
          placeholder="18:30"
          value={text}
          aria-label="Hora de publicación"
          aria-invalid={invalid}
          onFocus={event => { focused.current = true; event.currentTarget.select() }}
          onChange={event => { setText(event.target.value); setInvalid(false) }}
          onBlur={() => { focused.current = false; commit() }}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); commit() }
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault()
              const step = event.ctrlKey || event.metaKey ? CTRL_STEP_MINUTES : STEP_MINUTES
              const next = shiftTime(parseTimeInput(text) ?? value, event.key === 'ArrowUp' ? step : -step)
              setText(next)
              setInvalid(false)
              onCommit(next)
            }
          }}
        />
        <button type="button" aria-label={`Sumar ${STEP_MINUTES} minutos; con Ctrl, ${CTRL_STEP_MINUTES}`} title={`+${STEP_MINUTES} min · Ctrl: +${CTRL_STEP_MINUTES} min`} onClick={event => onCommit(shiftTime(value, event.ctrlKey || event.metaKey ? CTRL_STEP_MINUTES : STEP_MINUTES))}><Plus size={12} /></button>
      </div>
      <button type="button" className="time-period" aria-label={`${isPm ? 'PM' : 'AM'}: pulsa para cambiar a ${isPm ? 'AM' : 'PM'}`} title={`Cambiar a ${isPm ? 'AM' : 'PM'}`} onClick={() => onCommit(formatMinutes(toMinutes(value) + 720))}>{isPm ? 'PM' : 'AM'}</button>
    </div>
  )
}

export function SchedulePicker({ historyKey, historyVersion, value, onChange, compact = false }: {
  historyKey: string
  historyVersion?: number
  value: string
  onChange(value: string, label: string): void
  compact?: boolean
}) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<ScheduleHistoryEntry[]>(() => loadScheduleHistory(historyKey))
  const date = value.slice(0, 10)
  const hasDate = Boolean(date)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (hasDate) return
    const timer = window.setInterval(() => setTick(tick => tick + 1), 15000)
    return () => window.clearInterval(timer)
  }, [hasDate])

  const now = new Date()
  const today = toDateKey(now)
  const tomorrow = toDateKey(addDays(now, 1))
  const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  // Sin programación (o tras quitarla), la hora propuesta es la hora actual del usuario.
  const time = value.slice(11, 16) || nowTime

  const quickDates = [
    { label: 'Hoy', day: now },
    { label: 'Mañana', day: addDays(now, 1) },
    { label: 'Sábado', day: nextWeekday(now, 6) },
    { label: 'Lunes', day: nextWeekday(now, 1) },
  ]
    .map(item => ({ ...item, value: toDateKey(item.day) }))
    .filter((item, index, all) => all.findIndex(other => other.value === item.value) === index)

  useEffect(() => { setHistory(loadScheduleHistory(historyKey)); setHistoryOpen(false) }, [historyKey])
  useEffect(() => { setHistory(loadScheduleHistory(historyKey)) }, [historyKey, historyVersion])

  const commit = (nextDate: string, nextTime: string, label: string) => {
    if (nextDate === date && nextTime === time) return
    onChange(nextDate ? `${nextDate}T${nextTime}` : '', label)
  }

  const applyHistory = (item: ScheduleHistoryEntry) => {
    const local = toLocalDateTimeInput(item.scheduledAt)
    if (!local) return
    commit(local.slice(0, 10), local.slice(11, 16), 'Elegir fecha de publicación')
    setHistoryOpen(false)
  }

  // Sin fecha, elegir una hora ya programa: hoy si la hora aún no pasó, si no mañana.
  const pickTime = (nextTime: string) => commit(hasDate ? date : nextTime > nowTime ? today : tomorrow, nextTime, 'Cambiar hora de publicación')

  const parsed = value ? new Date(value) : null
  const valid = Boolean(parsed && !Number.isNaN(parsed.getTime()))
  const isPast = valid && parsed!.getTime() < now.getTime()
  const relative = date === today ? 'Hoy · ' : date === tomorrow ? 'Mañana · ' : ''
  const summary = valid
    ? relative + new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(parsed!)
    : 'Todavía no está programada'

  return (
    <section className={`schedule-field${compact ? ' schedule-field-compact' : ''}`} aria-label="Programación de la publicación">
      <header>
        <span><CalendarDays size={14} /> Programación</span>
        {hasDate && <button type="button" onClick={() => commit('', time, 'Quitar fecha')}>Quitar</button>}
      </header>

      <div className="schedule-quick" role="group" aria-label="Fechas rápidas">
        <div className="schedule-quick-dates">{quickDates.map(item => (
          <button type="button" key={item.value} aria-pressed={date === item.value} title={new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(item.day)} onClick={() => commit(item.value, time, 'Elegir fecha de publicación')}>
            {item.label}
          </button>
        ))}</div>
        <button type="button" className="schedule-history-trigger" aria-expanded={historyOpen} onClick={() => setHistoryOpen(open => !open)}><History size={12} /> Historial{history.length ? ` (${history.length})` : ''}</button>
      </div>

      {historyOpen && <section className="schedule-history" aria-label="Historial de programaciones"><header><strong>Programaciones confirmadas</strong><button type="button" onClick={() => setHistoryOpen(false)} aria-label="Cerrar historial">×</button></header>{history.length ? <ol>{history.filter(item => !Number.isNaN(new Date(item.scheduledAt).getTime())).map(item => <li key={item.id}><button type="button" className="schedule-history-apply" title="Usar esta programación" onClick={() => applyHistory(item)}>{historyEntryLabel(item)}</button><button type="button" className="schedule-history-remove" aria-label="Borrar esta programación del historial" title="Borrar del historial" onClick={() => setHistory(removeScheduleHistoryEntry(historyKey, item.id))}><Trash2 size={12} /></button></li>)}</ol> : <p>Aún no hay programaciones confirmadas.</p>}</section>}

      <div className="schedule-inputs">
        <label>Fecha
          <input data-undo-control type="date" lang="es-AR" value={date} onClick={event => { try { event.currentTarget.showPicker?.() } catch { /* showPicker needs a user gesture. */ } }} onChange={event => commit(event.target.value, time, event.target.value ? 'Elegir fecha de publicación' : 'Quitar fecha')} />
        </label>
        <label>Hora
          <TimeInput value={time} onCommit={pickTime} />
        </label>
      </div>

      <div className="schedule-presets" role="group" aria-label="Horas sugeridas">
        {TIME_PRESETS.map(preset => (
          <button type="button" key={preset} aria-pressed={hasDate && time === preset} onClick={() => pickTime(preset)}>{preset}</button>
        ))}
      </div>

      <p className={`schedule-summary${hasDate ? '' : ' empty'}${isPast ? ' past' : ''}`} role="status">
        <Clock3 size={13} />{summary}{isPast && ' · ya pasó'}
      </p>
    </section>
  )
}
