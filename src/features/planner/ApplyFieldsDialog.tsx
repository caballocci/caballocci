import { useState } from 'react'
import { TriangleAlert, X } from 'lucide-react'
import { availableParsedFields, formatHashtagList, type ClipboardPostField, type ParsedPost } from '../../shared/clipboard-payload'

const FIELD_LABELS: Record<ClipboardPostField, string> = {
  title: 'Título',
  caption: 'Texto de publicación',
  notes: 'Notas',
  hashtags: 'Hashtags',
}

function previewValue(value: string): string {
  return value.length > 64 ? `${value.slice(0, 64)}…` : value || '(vacío)'
}

/**
 * Operación hermana del pegado: reemplaza campos existentes y puede anexar
 * diapositivas al final, así que muestra qué entra (preview exacta, sin
 * recortes), qué sale y exige confirmación explícita. Acepta una publicación
 * o un lote: en el lote, "(varios)" marca campos cuyos valores actuales
 * difieren entre las publicaciones elegidas. El truncado queda solo para
 * los valores actuales.
 */
export function ApplyFieldsDialog({ targets, incoming, text, onApply, onClose }: {
  targets: Array<{ title: string; caption: string; notes: string; hashtags: string[] }>
  incoming: ParsedPost
  /** Texto tal como se recibió del portapapeles, para la preview exacta. */
  text: string
  onApply(fields: ClipboardPostField[], includeSlides: boolean): Promise<void>
  onClose(): void
}) {
  const available = availableParsedFields(incoming)
  const [selected, setSelected] = useState<Set<ClipboardPostField>>(() => new Set(available))
  const [includeSlides, setIncludeSlides] = useState(incoming.slides.length > 0)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const rows: Array<{ field: ClipboardPostField; current: string; next: string }> = available.map(field => {
    const incomingText = field === 'hashtags' ? formatHashtagList(incoming.hashtags) : incoming[field]
    const currentTexts = targets.map(target => field === 'hashtags' ? formatHashtagList(target.hashtags) : target[field])
    return {
      field,
      current: new Set(currentTexts).size === 1 ? previewValue(currentTexts[0]) : '(varios)',
      next: incomingText,
    }
  })
  const fieldCount = available.filter(field => selected.has(field)).length
  const slideCount = incoming.slides.length
  const annexing = includeSlides && slideCount > 0
  const apply = async (event: React.FormEvent) => {
    event.preventDefault()
    const fields = available.filter(field => selected.has(field))
    if (busy || (!fields.length && !annexing)) return
    setBusy(true)
    try {
      await onApply(fields, annexing)
      const applied = [
        fields.length ? `${fields.length} ${fields.length === 1 ? 'campo' : 'campos'}` : '',
        annexing ? `${slideCount} ${slideCount === 1 ? 'diapositiva' : 'diapositivas'}` : '',
      ].filter(Boolean).join(' + ')
      setFeedback(`Aplicado: ${applied}${targets.length > 1 ? ` en ${targets.length} publicaciones` : ''}`)
    } finally {
      setBusy(false)
    }
  }
  const applyLabel = feedback ? 'Aplicado ✓' : [
    fieldCount ? `Aplicar ${fieldCount} ${fieldCount === 1 ? 'campo' : 'campos'}` : '',
    annexing ? `anexar ${slideCount} ${slideCount === 1 ? 'diapositiva' : 'diapositivas'}` : '',
  ].filter(Boolean).join(' + ') || 'Elegí qué aplicar'
  const heading = targets.length > 1 ? `Aplicar a ${targets.length} publicaciones` : `Aplicar a “${targets[0].title || 'Publicación sin título'}”`
  const warningParts: string[] = []
  if (available.length) warningParts.push(`Reemplaza los valores ${targets.length > 1 ? `de las ${targets.length} publicaciones` : 'actuales'} por los copiados`)
  if (slideCount) warningParts.push('anexa las diapositivas al final de cada publicación')
  return <div className="space-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <form className="space-dialog apply-fields-dialog" onSubmit={event => void apply(event)}>
      <header><div><span>APLICAR CONTENIDO</span><h2>{heading}</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={18} /></button></header>
      <p className="apply-fields-warning"><TriangleAlert size={14} /> {warningParts.join(' y ') || 'No hay nada que aplicar'}. Se puede deshacer con Ctrl+Z.</p>
      <div className="apply-fields-rows" role="group" aria-label="Contenido a aplicar">
        {rows.map(row => (
          <label key={row.field} className="apply-fields-row">
            <input type="checkbox" checked={selected.has(row.field)} onChange={event => setSelected(current => {
              const next = new Set(current)
              if (event.target.checked) next.add(row.field)
              else next.delete(row.field)
              return next
            })} />
            <span className="apply-fields-name">{FIELD_LABELS[row.field]}</span>
            <span className="apply-fields-values"><span className="apply-fields-current">{row.current}</span><span className="apply-fields-arrow">→</span><span className="apply-fields-next">{row.next}</span></span>
          </label>
        ))}
        {slideCount > 0 && (
          <label className="apply-fields-row">
            <input type="checkbox" checked={includeSlides} onChange={event => setIncludeSlides(event.target.checked)} />
            <span className="apply-fields-name">Diapositivas</span>
            <span className="apply-fields-values"><span className="apply-fields-slides-note">Anexar {slideCount} {slideCount === 1 ? 'diapositiva' : 'diapositivas'} al final (no reemplaza las existentes)</span></span>
          </label>
        )}
      </div>
      <div className="apply-fields-text-block">
        <p className="apply-fields-text-label">Texto tal como se recibió</p>
        <pre className="apply-fields-text-preview">{text || '(portapapeles vacío)'}</pre>
      </div>
      <p className={`post-copy-summary${feedback ? ' confirmed' : ''}`} role="status" aria-live="polite">{feedback || 'Elegí qué reemplazar o anexar'}</p>
      <footer>
        <button type="button" className="ghost-button" onClick={onClose}>{feedback ? 'Listo' : 'Cancelar'}</button>
        <button className="save-button" disabled={busy || (!fieldCount && !annexing)}>{applyLabel}</button>
      </footer>
    </form>
  </div>
}
