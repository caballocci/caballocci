import { useEffect, useRef, useState } from 'react'
import { CheckSquare, ChevronDown, ChevronUp, Clipboard, ClipboardCopy, ClipboardPaste, Lightbulb, Plus, Trash2 } from 'lucide-react'
import type { IdeaBlock } from '../../shared/types'
import type { UndoableChange } from '../../app/useUndoableState'
import { runWithErrorReporting } from '../../app/errors'
import { parseSlidesFromText, readClipboardPayload, withClipboardPayload, type ClipboardItem, type ClipboardSlideItem } from '../../shared/clipboard-payload'
import { formatTitle } from './editor-utils'

export function EditorIdeaBlocks({ blocks, onChange }: { blocks: IdeaBlock[]; onChange(blocks: IdeaBlock[], change: UndoableChange): void }) {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [selectionFeedback, setSelectionFeedback] = useState('')
  const [pasteFeedback, setPasteFeedback] = useState('')
  const [includeSlideLabels, setIncludeSlideLabels] = useState(true)
  const selectedBlocks = blocks
    .map((block, index) => ({ block, slideNumber: index + 1 }))
    .filter(({ block }) => selectedIds.has(block.id))
  const copyableBlocks = selectedBlocks.filter(({ block }) => block.title.trim() || block.text.trim())

  useEffect(() => {
    if (!selectionFeedback) return
    const timeout = window.setTimeout(() => setSelectionFeedback(''), 1800)
    return () => window.clearTimeout(timeout)
  }, [selectionFeedback])

  useEffect(() => {
    if (!pasteFeedback) return
    const timeout = window.setTimeout(() => setPasteFeedback(''), 2600)
    return () => window.clearTimeout(timeout)
  }, [pasteFeedback])

  const add = () => onChange([...blocks, { id: crypto.randomUUID(), title: '', text: '' }], { label: 'Añadir diapositiva' })
  const update = (id: string, patch: Partial<IdeaBlock>, change: UndoableChange) => onChange(blocks.map(block => block.id === id ? { ...block, ...patch } : block), change)
  const format = (id: string, mode: 'upper' | 'lower' | 'title' | 'sentence') => {
    const block = blocks.find(item => item.id === id)
    if (block) update(id, { title: formatTitle(block.title, mode) }, { label: 'Formatear título de diapositiva' })
  }
  const toggleSelection = (id: string) => setSelectedIds(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const selectAll = () => setSelectedIds(current => blocks.every(block => current.has(block.id))
    ? new Set()
    : new Set(blocks.map(block => block.id)))
  const copySelected = async (mode: 'slide' | 'text') => {
    // El manifiesto copia exactamente lo que muestra el texto plano: "solo
    // texto" viaja con título vacío, así el pegado reconstruye lo copiado.
    const items: ClipboardItem[] = copyableBlocks
      .filter(({ block }) => mode === 'slide' || block.text.trim())
      .map(({ block }) => ({ kind: 'slide', title: mode === 'slide' ? block.title.trim() : '', text: block.text.trim() }))
    const parts = copyableBlocks.map(({ block, slideNumber }) => {
      const content = mode === 'slide' ? [block.title.trim(), block.text.trim()].filter(Boolean).join('\n') : block.text.trim()
      if (!content) return null
      return includeSlideLabels ? `DIAPOSITIVA ${String(slideNumber).padStart(2, '0')}\n${content}` : content
    }).filter(part => part !== null)
    const text = parts.join('\n\n')
    if (!text) {
      setSelectionFeedback(mode === 'text' ? 'Ninguna diapositiva seleccionada tiene texto' : 'Nada que copiar')
      return
    }
    await runWithErrorReporting(async () => {
      const request = withClipboardPayload(text, items)
      await window.planner.clipboard.write(request.text, request.html)
      setSelectionFeedback(mode === 'slide' ? 'Diapositivas copiadas' : 'Texto copiado')
    }, 'No se pudieron copiar las diapositivas')
  }
  const remove = (id: string) => onChange(blocks.filter(block => block.id !== id), { label: 'Eliminar diapositiva' })

  const appendPasted = (slides: Array<{ title: string; text: string }>, label: string, feedback: string) => {
    onChange([...blocks, ...slides.map(slide => ({ id: crypto.randomUUID(), title: slide.title, text: slide.text }))], { label })
    setPasteFeedback(feedback)
  }

  const pluralize = (count: number, singular: string) => `${count} ${count === 1 ? singular : `${singular}s`}`

  /** Regla: pegar nunca destruye — solo crea o anexa. Un pegado = un paso de deshacer. */
  const pasteFromClipboard = async () => {
    await runWithErrorReporting(async () => {
      const payload = readClipboardPayload(await window.planner.clipboard.readHtml())
      if (payload) {
        const slides = payload.items.filter((item): item is ClipboardSlideItem => item.kind === 'slide')
        const skipped = payload.items.length - slides.length
        if (!slides.length) {
          setPasteFeedback(skipped ? `Nada pegable aquí · ${pluralize(skipped, 'campo de publicación')} ignorado${skipped === 1 ? '' : 's'}` : 'Nada pegable en el portapapeles')
          return
        }
        appendPasted(slides, `Pegar ${pluralize(slides.length, 'diapositiva')}`, `Pegadas ${pluralize(slides.length, 'diapositiva')}${skipped ? ` · ${pluralize(skipped, 'campo')} ignorado${skipped === 1 ? '' : 's'}` : ''}`)
        return
      }
      const parsed = parseSlidesFromText(await window.planner.clipboard.readText())
      if (!parsed.length) {
        setPasteFeedback('No hay texto pegable en el portapapeles')
        return
      }
      appendPasted(parsed, `Pegar ${pluralize(parsed.length, 'diapositiva')}`, `Pegadas ${pluralize(parsed.length, 'diapositiva')} (desde texto plano)`)
    }, 'No se pudo pegar en las diapositivas')
  }

  const pasteRef = useRef(pasteFromClipboard)
  pasteRef.current = pasteFromClipboard

  // Ctrl+V interceptado solo fuera de campos de texto: el pegado nativo
  // en título/texto/notas manda siempre.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return
      if (event.key.toLowerCase() !== 'v') return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      event.preventDefault()
      void pasteRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= blocks.length) return
    const reordered = [...blocks]
    const [block] = reordered.splice(index, 1)
    reordered.splice(target, 0, block)
    onChange(reordered, { label: offset < 0 ? 'Subir diapositiva' : 'Bajar diapositiva' })
  }

  return <section className="idea-blocks">
    <header><div><span>DIAPOSITIVAS</span><strong>{blocks.length} {blocks.length === 1 ? 'diapositiva' : 'diapositivas'}</strong></div><div className="idea-blocks-actions">
      <button type="button" className={`idea-selection-toggle${selectionMode ? ' active' : ''}`} aria-pressed={selectionMode} disabled={!selectionMode && blocks.length === 0} onClick={() => { setSelectionMode(mode => !mode); setSelectedIds(new Set()); setSelectionFeedback('') }}><CheckSquare size={13} /> {selectionMode ? 'Cancelar' : 'Seleccionar'}</button>
      <button type="button" className="idea-paste-toggle" onClick={() => void pasteFromClipboard()}><ClipboardPaste size={13} /> Pegar</button>
      <button type="button" className="new-button" onClick={add}><Plus size={15} /> Nueva diapositiva</button>
    </div></header>
    {pasteFeedback && <p className="idea-paste-feedback" role="status" aria-live="polite">{pasteFeedback}</p>}
    {selectionMode && <div className="idea-selection-toolbar" role="toolbar" aria-label="Acciones para las diapositivas">
      <div><span>{selectedBlocks.length} de {blocks.length} seleccionadas</span><button type="button" onClick={selectAll}>{selectedBlocks.length === blocks.length ? 'Quitar selección' : 'Seleccionar todas'}</button></div>
      <div>
        <label className="idea-label-option" title="Antepone DIAPOSITIVA NN a cada diapositiva copiada"><input type="checkbox" checked={includeSlideLabels} onChange={event => setIncludeSlideLabels(event.target.checked)} /> DIAPOSITIVA NN</label>
        <button type="button" disabled={!copyableBlocks.length} onClick={() => void copySelected('slide')}><ClipboardCopy size={13} /> Copiar diapositivas</button>
        <button type="button" disabled={!copyableBlocks.length} onClick={() => void copySelected('text')}><Clipboard size={13} /> Copiar solo texto</button>
      </div>
      {selectionFeedback && <span className="idea-selection-feedback" role="status" aria-live="polite">{selectionFeedback}</span>}
    </div>}
    {blocks.length === 0 && <button type="button" className="empty-ideas" onClick={add}><Lightbulb size={24} /><span>Añadir primera idea</span></button>}
    {blocks.map((block, index) => <article className={`idea-block${selectedIds.has(block.id) ? ' selected' : ''}`} key={block.id}>
      <header><span>DIAPOSITIVA {String(index + 1).padStart(2, '0')}</span><div>
        {selectionMode && <input type="checkbox" className="idea-selection-checkbox" aria-label={`Seleccionar diapositiva ${index + 1}`} checked={selectedIds.has(block.id)} onChange={() => toggleSelection(block.id)} />}
        <button type="button" title="Subir idea" aria-label="Subir idea" disabled={index === 0} onClick={() => move(index, -1)}><ChevronUp size={15} /></button>
        <button type="button" title="Bajar idea" aria-label="Bajar idea" disabled={index === blocks.length - 1} onClick={() => move(index, 1)}><ChevronDown size={15} /></button>
        <button type="button" title="Eliminar idea" aria-label="Eliminar idea" onClick={() => remove(block.id)}><Trash2 size={14} /></button>
      </div></header>
      <label>Título<input data-undo-control value={block.title} maxLength={160} onChange={event => update(block.id, { title: event.target.value }, { label: 'Editar título de diapositiva', groupKey: `slide:${block.id}:title` })} placeholder="Ej. Apertura, argumento, cierre" /></label>
      <div className="title-format-actions"><span>Formato rápido</span><button type="button" onClick={() => format(block.id, 'upper')}>MAYÚS</button><button type="button" onClick={() => format(block.id, 'lower')}>minús</button><button type="button" onClick={() => format(block.id, 'title')}>Título</button><button type="button" onClick={() => format(block.id, 'sentence')}>Oración</button></div>
      <label>Texto<textarea data-undo-control value={block.text} maxLength={10_000} onChange={event => update(block.id, { text: event.target.value }, { label: 'Editar texto de diapositiva', groupKey: `slide:${block.id}:text` })} placeholder="Texto que luego irá en la imagen" /></label>
    </article>)}
  </section>
}
