import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { buildMultiPostCopy, CLIPBOARD_POST_FIELDS, POST_COPY_PREFERENCE_KEY, readPostCopyOptions, type ClipboardPostField, type PostCopyInput, type PostCopyOptions } from '../../shared/clipboard-payload'
import { runWithErrorReporting } from '../../app/errors'

const FIELD_LABELS: Record<ClipboardPostField, string> = {
  title: 'Título',
  caption: 'Texto de publicación',
  notes: 'Notas',
  hashtags: 'Hashtags',
}

const DEFAULT_OPTIONS: PostCopyOptions = {
  fields: { title: true, caption: true, notes: false, hashtags: false },
  slides: { include: true, mode: 'slide', labels: true },
  includeId: false,
}

/** Diálogo "Copiar publicación(es)…": elegís qué partes llevar y el resumen confirma lo copiado. */
export function PostCopyDialog({ posts, onClose }: { posts: PostCopyInput[]; onClose(): void }) {
  const [options, setOptions] = useState<PostCopyOptions>(DEFAULT_OPTIONS)
  const [feedback, setFeedback] = useState('')
  // La última selección copiada con éxito se recuerda entre sesiones vía preferencias.
  useEffect(() => {
    let active = true
    void window.planner.preferences.sync({})
      .then(preferences => {
        const stored = readPostCopyOptions(preferences[POST_COPY_PREFERENCE_KEY])
        if (active && stored) setOptions(stored)
      })
      .catch(() => { /* Preferencias opcionales: ante error quedan los valores por defecto. */ })
    return () => { active = false }
  }, [])
  const update = (next: (current: PostCopyOptions) => PostCopyOptions) => {
    setOptions(next)
  }
  const result = buildMultiPostCopy(posts, options)
  const presets: Array<{ label: string; apply(): void }> = [
    { label: 'Todo', apply: () => update(current => ({ ...current, fields: { title: true, caption: true, notes: true, hashtags: true }, slides: { ...current.slides, include: true } })) },
    { label: 'Solo contenido', apply: () => update(current => ({ ...current, fields: { title: true, caption: true, notes: false, hashtags: false }, slides: { ...current.slides, include: false } })) },
    { label: 'Solo diapositivas', apply: () => update(current => ({ ...current, fields: { title: false, caption: false, notes: false, hashtags: false }, slides: { ...current.slides, include: true } })) },
  ]
  const copy = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!result.text) return
    await runWithErrorReporting(async () => {
      await window.planner.clipboard.write(result.text, result.html)
      // Recuerda la última selección que terminó en un copiar exitoso (no los cambios intermedios).
      await window.planner.preferences.sync({ [POST_COPY_PREFERENCE_KEY]: JSON.stringify(options) }).catch(() => { /* Opcional. */ })
      setFeedback(`Copiado: ${result.summary}`)
    }, 'No se pudo copiar la publicación')
  }
  return <div className="space-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <form className="space-dialog post-copy-dialog" onSubmit={event => void copy(event)}>
      <header><div><span>COPIAR</span><h2>{posts.length > 1 ? `Copiar ${posts.length} publicaciones` : 'Copiar publicación'}</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={18} /></button></header>
      <div className="post-copy-presets" role="group" aria-label="Selecciones rápidas">
        {presets.map(preset => <button type="button" key={preset.label} onClick={preset.apply}>{preset.label}</button>)}
      </div>
      <div className="post-copy-fields" role="group" aria-label="Campos de la publicación">
        {CLIPBOARD_POST_FIELDS.map(field => (
          <label key={field} className="post-copy-option">
            <input type="checkbox" checked={options.fields[field]} onChange={event => update(current => ({ ...current, fields: { ...current.fields, [field]: event.target.checked } }))} />
            <span>{FIELD_LABELS[field]}</span>
          </label>
        ))}
      </div>
      <label className="post-copy-option post-copy-id-option">
        <input type="checkbox" checked={options.includeId} onChange={event => update(current => ({ ...current, includeId: event.target.checked }))} />
        <span>Incluir ID (para actualizar las mismas publicaciones al pegar)</span>
      </label>
      <div className="post-copy-slides">
        <label className="post-copy-option">
          <input type="checkbox" checked={options.slides.include} onChange={event => update(current => ({ ...current, slides: { ...current.slides, include: event.target.checked } }))} />
          <span>Diapositivas ({posts.reduce((total, post) => total + post.ideaBlocks.length, 0)})</span>
        </label>
        {options.slides.include && <div className="post-copy-slide-options" role="group" aria-label="Opciones de diapositivas">
          <label><input type="radio" name="post-copy-slide-mode" checked={options.slides.mode === 'slide'} onChange={() => update(current => ({ ...current, slides: { ...current.slides, mode: 'slide' } }))} /> Título y texto</label>
          <label><input type="radio" name="post-copy-slide-mode" checked={options.slides.mode === 'text'} onChange={() => update(current => ({ ...current, slides: { ...current.slides, mode: 'text' } }))} /> Solo texto</label>
          <label><input type="checkbox" checked={options.slides.labels} onChange={event => update(current => ({ ...current, slides: { ...current.slides, labels: event.target.checked } }))} /> DIAPOSITIVA NN</label>
        </div>}
      </div>
      <p className={`post-copy-summary${feedback ? ' confirmed' : ''}`} role="status" aria-live="polite">{feedback || result.summary}</p>
      <footer>
        <button type="button" className="ghost-button" onClick={onClose}>{feedback ? 'Listo' : 'Cancelar'}</button>
        <button className="save-button" disabled={!result.text}>{feedback ? 'Copiado ✓' : 'Copiar selección'}</button>
      </footer>
    </form>
  </div>
}
