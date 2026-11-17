import { useState } from 'react'
import { TriangleAlert, X } from 'lucide-react'
import { CLIPBOARD_POST_FIELDS, type ClipboardPostField, type ParsedPost } from '../../shared/clipboard-payload'
import type { Post } from '../../shared/types'

const FIELD_LABELS: Record<ClipboardPostField, string> = {
  title: 'Título',
  caption: 'Texto de publicación',
  notes: 'Notas',
  hashtags: 'Hashtags',
}

/**
 * Pegado con mapeo por id: cada bloque del portapapeles muestra su destino.
 * Los que matchean publicaciones existentes pueden actualizarlas (la parte
 * destructiva, con confirmación y deshacer propios); todos los bloques
 * pueden pegarse como publicaciones nuevas (el pegado nunca destruye).
 */
export function PastePostsDialog({ blocks, text, posts, onCreate, onUpdate, onClose }: {
  blocks: ParsedPost[]
  /** Texto tal como se recibió del portapapeles, para la preview exacta. */
  text: string
  /** Todas las publicaciones del workspace, para resolver los ids de destino. */
  posts: Post[]
  onCreate(blocks: ParsedPost[]): Promise<void>
  onUpdate(pairs: Array<{ block: ParsedPost; target: Post }>, fields: ClipboardPostField[], includeSlides: boolean, replaceSlides: boolean): Promise<void>
  onClose(): void
}) {
  const byId = new Map(posts.map(post => [post.id, post]))
  const destinations = blocks.map(block => ({ block, target: block.id ? byId.get(block.id) ?? null : null }))
  const [checked, setChecked] = useState<Set<number>>(() => new Set(blocks.map((_, index) => index)))
  const [fields, setFields] = useState<Set<ClipboardPostField>>(() => new Set(CLIPBOARD_POST_FIELDS))
  const [includeSlides, setIncludeSlides] = useState(true)
  const [replaceSlides, setReplaceSlides] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const chosen = destinations.filter((_, index) => checked.has(index))
  const updatable = chosen.filter(({ block, target }) => target && (fields.size > 0 || (includeSlides && block.slides.length > 0)))
  const originalsCount = destinations.filter(({ target }) => target).length
  const anyUpdatable = destinations.some(({ block, target }) => target && (fields.size > 0 || (includeSlides && block.slides.length > 0)))
  const create = async () => {
    if (busy || !chosen.length) return
    setBusy(true)
    try {
      await onCreate(chosen.map(({ block }) => block))
      setFeedback(`Pegadas: ${chosen.length} ${chosen.length === 1 ? 'publicación nueva' : 'publicaciones nuevas'}`)
    } finally {
      setBusy(false)
    }
  }
  const update = async () => {
    if (busy || !updatable.length) return
    setBusy(true)
    try {
      const pairs = updatable.flatMap(({ block, target }) => target ? [{ block, target }] : [])
      await onUpdate(pairs, CLIPBOARD_POST_FIELDS.filter(field => fields.has(field)), includeSlides, replaceSlides)
      setFeedback(`Actualizadas: ${pairs.length} ${pairs.length === 1 ? 'publicación' : 'publicaciones'}`)
    } finally {
      setBusy(false)
    }
  }
  return <div className="space-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="space-dialog paste-posts-dialog" role="dialog" aria-label="Pegar publicaciones">
      <header><div><span>PEGAR</span><h2>{blocks.length > 1 ? `Pegar ${blocks.length} publicaciones` : 'Pegar publicación'}</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={18} /></button></header>
      <div className="paste-posts-rows" role="group" aria-label="Destino de cada bloque">
        {destinations.map(({ block, target }, index) => (
          <label key={index} className="paste-posts-row">
            <input type="checkbox" checked={checked.has(index)} onChange={event => setChecked(current => {
              const next = new Set(current)
              if (event.target.checked) next.add(index)
              else next.delete(index)
              return next
            })} />
            <span className="paste-posts-name">{`PUBLICACIÓN ${String(index + 1).padStart(2, '0')}`}</span>
            <span className={`paste-posts-target${target ? ' is-original' : block.id ? ' is-missing' : ''}`}>
              {target ? `→ “${target.title || 'Publicación sin título'}” (actualiza original)` : block.id ? '→ el id no existe; solo como nueva' : '→ publicación nueva'}
            </span>
            {block.slides.length > 0 && <span className="paste-posts-slides">{block.slides.length} {block.slides.length === 1 ? 'diap.' : 'diaps.'}</span>}
          </label>
        ))}
      </div>
      {originalsCount > 0 && <>
        <p className="apply-fields-warning"><TriangleAlert size={14} /> {originalsCount} {originalsCount === 1 ? 'bloque coincide con una publicación existente: actualizar reemplaza sus valores' : 'bloques coinciden con publicaciones existentes: actualizar reemplaza sus valores'}{replaceSlides ? ' y sus diapositivas' : ''}. Se puede deshacer con Ctrl+Z.</p>
        <div className="post-copy-fields" role="group" aria-label="Campos a actualizar en las originales">
          {CLIPBOARD_POST_FIELDS.map(field => (
            <label key={field} className="post-copy-option">
              <input type="checkbox" checked={fields.has(field)} onChange={event => setFields(current => {
                const next = new Set(current)
                if (event.target.checked) next.add(field)
                else next.delete(field)
                return next
              })} />
              <span>{FIELD_LABELS[field]}</span>
            </label>
          ))}
        </div>
        <div className="post-copy-slide-options" role="group" aria-label="Diapositivas de las originales">
          <label><input type="radio" name="paste-posts-slides-mode" checked={!replaceSlides} onChange={() => setReplaceSlides(false)} /> Anexar al final</label>
          <label><input type="radio" name="paste-posts-slides-mode" checked={replaceSlides} onChange={() => setReplaceSlides(true)} /> Reemplazar existentes</label>
        </div>
      </>}
      <label className="post-copy-option">
        <input type="checkbox" checked={includeSlides} onChange={event => setIncludeSlides(event.target.checked)} />
        <span>Incluir diapositivas ({blocks.reduce((total, block) => total + block.slides.length, 0)})</span>
      </label>
      <div className="apply-fields-text-block">
        <p className="apply-fields-text-label">Texto tal como se recibió</p>
        <pre className="apply-fields-text-preview">{text || '(portapapeles vacío)'}</pre>
      </div>
      <p className={`post-copy-summary${feedback ? ' confirmed' : ''}`} role="status" aria-live="polite">{feedback || 'Revisá el destino de cada bloque'}</p>
      <footer>
        <button type="button" className="ghost-button" onClick={onClose}>{feedback ? 'Listo' : 'Cancelar'}</button>
        {anyUpdatable && <button type="button" className="save-button" disabled={busy || !updatable.length} onClick={() => void update()}>Actualizar {updatable.length} {updatable.length === 1 ? 'original' : 'originales'}</button>}
        <button type="button" className="save-button" disabled={busy || !chosen.length} onClick={() => void create()}>Pegar {chosen.length} {chosen.length === 1 ? 'nueva' : 'nuevas'}</button>
      </footer>
    </div>
  </div>
}
