import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { formatElapsedSince } from '../../shared/post-marks'
import { ignoreReminderThisSession, markReminderShown, readIgnoredThisSession, readTemporaryNote, reminderShouldShow, writeTemporaryNote } from '../../shared/note-reminder'
import './note-reminder.css'

/** Aviso no invasivo junto a “Nueva publicación”: reaparece 24 h después de haberse mostrado. */
export function NoteReminder() {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(readTemporaryNote)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const evaluate = () => {
      if (readIgnoredThisSession() || !reminderShouldShow()) return
      markReminderShown()
      setOpen(true)
    }
    evaluate()
    const reminderTimer = window.setInterval(evaluate, 60_000)
    const clockTimer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => { window.clearInterval(reminderTimer); window.clearInterval(clockTimer) }
  }, [])

  const changeText = (text: string) => {
    const writtenAt = text.trim() ? (note.writtenAt || new Date().toISOString()) : null
    const next = { text, writtenAt }
    setNote(next)
    writeTemporaryNote(next)
  }
  const ignore = () => { ignoreReminderThisSession(); setOpen(false) }

  const writtenAt = note.writtenAt
  const writtenTime = writtenAt ? new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date(writtenAt)) : null

  return <div className="note-reminder-anchor">
    {open && <section className="note-reminder" role="region" aria-label="Recordador de notas">
      <header><strong>NOTA RÁPIDA</strong><button type="button" className="icon-button" aria-label="Cerrar recordador" title="Cerrar" onClick={() => setOpen(false)}><X size={14} /></button></header>
      <textarea value={note.text} onChange={event => changeText(event.target.value)} placeholder="Escribí lo que no querés olvidar..." rows={3} aria-label="Nota rápida" />
      <p className="note-reminder-hint">{writtenAt && writtenTime
        ? `Escribiste esto a las ${writtenTime}, pasaron ${formatElapsedSince(writtenAt, now)}`
        : 'Se guarda en este equipo, incluso al cerrar la app.'}</p>
      <footer><button type="button" className="note-reminder-ignore" onClick={ignore}>Ignorar por esta sesión</button><button type="button" className="save-button" onClick={() => setOpen(false)}>Listo</button></footer>
    </section>}
  </div>
}
