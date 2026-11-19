import { useCallback, useEffect, useRef, useState } from 'react'
import { MobileCardStatus, type BoardCardDetailLevel, type MobilePublicationState } from './BoardCardDecorations'
import { withClipboardPayload } from '../../shared/clipboard-payload'
import { BoardContextMenu, BoardContextSelectionActions } from './BoardContextMenu'
import { PostCopyDialog } from './PostCopyDialog'
import { ApplyFieldsDialog } from './ApplyFieldsDialog'
import { PasteFormatHint } from './PasteFormatHint'
import { availableParsedFields, groupPayloadPosts, isStructuredPostText, parsePostsFromText, readClipboardPayload, type ClipboardPasteSource, type ClipboardPostField, type ParsedPost } from '../../shared/clipboard-payload'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowDown, ArrowUp, ArrowUpFromLine, CalendarDays, ChevronDown, ChevronRight, ChevronUp, ClipboardCopy, ClipboardPaste, Copy, FileText, Film, FolderOpen, FolderPlus, Images, Layers, Layers3, MoreHorizontal, Network, Replace, Trash2 } from 'lucide-react'
import { contentLabels, stages, statusMeta } from '../../shared/constants'
import { postColors } from '../../shared/postColors'
import { runWithErrorReporting } from '../../app/errors'
import { usePlanner } from '../../app/store'
import { PlatformMark } from '../../components/layout/AppShell'
import type { ContentType, Post, WorkGroup } from '../../shared/types'

const POST_IDS_MIME = 'application/x-caballocci-post-ids'
const stackContentIcon = (contentType: ContentType) => contentType === 'reel' ? Film : contentType === 'carousel' ? Images : FileText

export type BoardLane = { id: string; name: string; postIds: string[]; group: WorkGroup | null }

/** Solo reaccionamos a arrastres de publicaciones, no a archivos u otros elementos externos. */
const carriesPosts = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes(POST_IDS_MIME)

/**
 * Reemplaza el "fantasma" por defecto del navegador por un clon de la tarjeta (con borde dorado y sombra),
 * y si se arrastran varias muestra un contador. El clon vive un instante dentro del mismo carril
 * para heredar los estilos de `.board-lane-cell article`.
 */
function setCardDragImage(event: React.DragEvent<HTMLElement>, count: number) {
  const card = event.currentTarget
  const host = card.parentElement
  if (!host) return
  const rect = card.getBoundingClientRect()
  const ghost = card.cloneNode(true) as HTMLElement
  ghost.classList.add('board-drag-ghost')
  ghost.classList.remove('is-dragging')
  ;['data-area-select-id', 'draggable', 'tabindex'].forEach(name => ghost.removeAttribute(name))
  if (count > 1) ghost.dataset.count = String(count)
  host.appendChild(ghost)
  event.dataTransfer.setDragImage(ghost, event.clientX - rect.left, event.clientY - rect.top)
  setTimeout(() => ghost.remove(), 0)
}

export function BoardLanes({ lanes, posts, activeGroups, selected, collapsedLanes, toggleLane, reorderLane, visiblePerColumn, mobilePublicationState, boardCardDetailLevel, dragIds, onToggle, onSelect, onPickPost, pickedPostIds = new Set<string>(), onColor, onMove, onSelectStatus, onDuplicate, onPastePosts, onOpenPasteDialog, allPosts, onApplyFields, onDelete, onStatus, onEditSelection, onArchive, scheduleAt, scheduleWarning, onScheduleAtChange, onSchedule, onClearSchedule, onFormat }: {
  lanes: BoardLane[]; posts: Post[]; activeGroups: WorkGroup[]; selected: Set<string>; collapsedLanes: Set<string>
  toggleLane(id: string): void; reorderLane(id: string, delta: number): void; visiblePerColumn: number
  mobilePublicationState: MobilePublicationState | null; boardCardDetailLevel: BoardCardDetailLevel
  dragIds: React.MutableRefObject<string[]>
  onToggle(id: string, range?: boolean, order?: string[]): void; onSelect(id: string | null): void; onPickPost?(id: string): boolean; pickedPostIds?: Set<string>
  onColor(post: Post, color: string): void; onMove(status: Post['status']): void; onSelectStatus(ids: string[]): void
  onDuplicate(post: Post): Promise<Post | undefined>; onDelete(post: Post): void; onStatus(post: Post, status: Post['status']): void
  onPastePosts(target: Post): Promise<Post[] | undefined>; onOpenPasteDialog(target: Post): void; allPosts: Post[]; onApplyFields(targets: Post[], fields: ClipboardPostField[], includeSlides: boolean): Promise<void>
  onEditSelection(): void
  scheduleAt: string; scheduleWarning: string; onScheduleAtChange(value: string): void
  onArchive(ids: string[]): void; onSchedule(ids: string[]): void; onClearSchedule(ids: string[]): void; onFormat(ids: string[], contentType: ContentType): void
}) {
  const [context, setContext] = useState<{ post: Post; ids: string[]; x: number; y: number } | null>(null)
  const [showStatuses, setShowStatuses] = useState(false)
  const [showColors, setShowColors] = useState(false)
  const [copyPosts, setCopyPosts] = useState<Post[]>([])
  const [pastePreview, setPastePreview] = useState(0)
  const [pasteSource, setPasteSource] = useState<ClipboardPasteSource>('freeform')
  const [pasteMatch, setPasteMatch] = useState(0)
  const [showPasteHint, setShowPasteHint] = useState(false)
  const [applyPreview, setApplyPreview] = useState<ParsedPost | null>(null)
  const [applyText, setApplyText] = useState('')
  const [applyTargets, setApplyTargets] = useState<Post[]>([])
  const [justPastedIds, setJustPastedIds] = useState<Set<string>>(() => new Set())
  const pastedFeedbackTimer = useRef<number | null>(null)
  const [openCells, setOpenCells] = useState<Set<string>>(new Set())
  const [duplicatedPostId, setDuplicatedPostId] = useState<string | null>(null)
  const duplicateFeedbackTimer = useRef<number | null>(null)
  // Pilas: vista expandida, huella de destino para apilar y estado del drag de reordenamiento/desapile.
  const [expandedStacks, setExpandedStacks] = useState<Set<string>>(new Set())
  const [stackDropTarget, setStackDropTarget] = useState<string | null>(null)
  const [stackReorder, setStackReorder] = useState<{ stackId: string; index: number } | null>(null)
  const [stackDragMember, setStackDragMember] = useState<{ id: string; stackId: string } | null>(null)
  // Feedback del drag & drop: tarjetas que se están moviendo y destino bajo el cursor.
  const [dragging, setDragging] = useState<Set<string>>(new Set())
  const [dropTarget, setDropTarget] = useState<{ key: string; status: Post['status'] } | null>(null)
  const showBand = lanes.length > 1
  const CELL_LIMIT = 8
  const postById = new Map(posts.map(post => [post.id, post]))
  const statusIds = new Map(stages.map(status => [status, posts.filter(post => post.status === status).map(post => post.id)]))

  const resetDrag = useCallback(() => {
    setDragging(current => current.size ? new Set() : current)
    setDropTarget(null)
    setStackDropTarget(null)
    setStackReorder(null)
    setStackDragMember(null)
  }, [])

  // Si la tarjeta de origen se desmonta al moverse, su `dragend` no llega: usamos también `drop` global.
  useEffect(() => {
    window.addEventListener('dragend', resetDrag)
    window.addEventListener('drop', resetDrag)
    return () => { window.removeEventListener('dragend', resetDrag); window.removeEventListener('drop', resetDrag) }
  }, [resetDrag])

  useEffect(() => {
    if (!context) return
    const dismiss = () => { setContext(null); setShowStatuses(false); setShowColors(false) }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss() }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', onKeyDown) }
  }, [context])

  useEffect(() => () => {
    if (duplicateFeedbackTimer.current !== null) window.clearTimeout(duplicateFeedbackTimer.current)
    if (pastedFeedbackTimer.current !== null) window.clearTimeout(pastedFeedbackTimer.current)
  }, [])

  // Al abrir el menú contextual miramos qué hay en el portapapeles para
  // habilitar "Pegar como publicaciones" (cantidad exacta), "Aplicar
  // contenido copiado" (una publicación con campos o diapositivas) y saber
  // cuántos bloques matchean publicaciones existentes por id: con
  // coincidencias, pegar abre el diálogo con destino por bloque.
  useEffect(() => {
    if (!context) return
    let cancelled = false
    setPastePreview(0)
    setPasteSource('freeform')
    setPasteMatch(0)
    setApplyPreview(null)
    setApplyText('')
    void runWithErrorReporting(async () => {
      const payload = readClipboardPayload(await window.planner.clipboard.readHtml())
      const text = await window.planner.clipboard.readText()
      const parsed = payload ? groupPayloadPosts(payload.items) : parsePostsFromText(text)
      if (cancelled) return
      setPastePreview(parsed.length)
      setPasteSource(payload ? 'manifest' : isStructuredPostText(text) ? 'structured' : 'freeform')
      setApplyText(text.trim())
      setPasteMatch(parsed.reduce((total, post) => total + (post.id && allPosts.some(candidate => candidate.id === post.id) ? 1 : 0), 0))
      // "Aplicar" también procede cuando el portapapeles solo trae
      // diapositivas: se anexan al final (aditivo); los campos se
      // reemplazan con confirmación propia en el diálogo.
      setApplyPreview(parsed.length === 1 && (availableParsedFields(parsed[0]).length || parsed[0].slides.length) ? parsed[0] : null)
    }, 'No se pudo leer el portapapeles')
    return () => { cancelled = true }
  }, [context, allPosts])

  const pastePosts = async (target: Post) => {
    const created = await onPastePosts(target)
    if (!created?.length) return
    setJustPastedIds(new Set(created.map(post => post.id)))
    // Si el texto no venía con el formato de la app, la acción se hizo igual
    // (pegar nunca destruye), pero avisamos por si esperaba otra cosa.
    if (pasteSource === 'freeform') setShowPasteHint(true)
    if (pastedFeedbackTimer.current !== null) window.clearTimeout(pastedFeedbackTimer.current)
    pastedFeedbackTimer.current = window.setTimeout(() => setJustPastedIds(new Set()), 2500)
  }

  const duplicatePost = async (post: Post) => {
    const duplicate = await onDuplicate(post)
    if (!duplicate) return
    setDuplicatedPostId(duplicate.id)
    if (duplicateFeedbackTimer.current !== null) window.clearTimeout(duplicateFeedbackTimer.current)
    duplicateFeedbackTimer.current = window.setTimeout(() => setDuplicatedPostId(null), 2500)
  }

  // Vista previa al pasar el mouse sobre la pila cerrada: cuántos miembros se listan antes de «+N más».
  const STACK_PREVIEW_LIMIT = 3

  const toggleStackExpand = (stackId: string) => setExpandedStacks(current => { const next = new Set(current); if (next.has(stackId)) next.delete(stackId); else next.add(stackId); return next })

  /** Las publicaciones de la celda objetivo están en la misma columna que las arrastradas; si alguna arrastrada está en otra columna, nunca apila: mueve. */
  const canStackOn = (targetStatus: Post['status']) => {
    const ids = dragIds.current
    if (!ids.length) return false
    return ids.every(id => posts.find(item => item.id === id)?.status === targetStatus)
  }

  /** Zona de apilado: toda la tarjeta de la misma columna (es la única acción posible sobre ella).
      El drop en el espacio libre de la celda sigue moviendo como siempre. */
  const collapsedCardDragOver = (event: React.DragEvent<HTMLElement>, post: Post, columnStatus: Post['status']) => {
    if (!carriesPosts(event)) return
    if (post.status !== columnStatus || !canStackOn(columnStatus)) return // otra columna: la tarjeta nunca apila, mueve
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    if (stackDropTarget !== post.id) setStackDropTarget(post.id)
  }

  const collapsedCardDrop = (event: React.DragEvent<HTMLElement>, post: Post, columnStatus: Post['status']) => {
    if (!carriesPosts(event)) return
    if (post.status !== columnStatus || !canStackOn(columnStatus)) return // destino/arrastre de otra columna: deja pasar a la celda
    event.preventDefault()
    event.stopPropagation()
    const ids = dragIds.current
    if (!ids.length) return
    void runWithErrorReporting(() => usePlanner.getState().stackPosts(post.id, ids), 'No se pudo apilar')
    resetDrag()
  }

  /** Arrastre de una tarjeta dentro de la lista expandida (reordenar o desapilar). */
  const memberDragStart = (event: React.DragEvent<HTMLElement>, member: Post, stackId: string) => {
    event.stopPropagation()
    setStackDragMember({ id: member.id, stackId })
    dragIds.current = [member.id]
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', member.id)
    event.dataTransfer.setData(POST_IDS_MIME, JSON.stringify([member.id]))
    setCardDragImage(event, 1)
    requestAnimationFrame(() => setDragging(new Set([member.id])))
  }

  const memberDragOver = (event: React.DragEvent<HTMLElement>, member: Post, stackId: string, index: number) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (stackDragMember?.stackId === stackId) {
      // Reordenamiento dentro de la pila: si es otro miembro de la misma pila.
      event.preventDefault()
      event.stopPropagation()
      const before = event.clientY < rect.top + rect.height / 2
      const insertionIndex = before ? index : index + 1
      if (stackReorder?.stackId !== stackId || stackReorder.index !== insertionIndex) setStackReorder({ stackId, index: insertionIndex })
      return
    }
    // Soltar algo sobre un miembro de la pila abierta lo añade a la pila al final.
    if (!carriesPosts(event)) return
    if (!canStackOn(member.status)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    if (stackDropTarget !== member.id) setStackDropTarget(member.id)
  }

  const memberDrop = (event: React.DragEvent<HTMLElement>, member: Post, stackId: string) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const dragged = stackDragMember
    event.preventDefault()
    event.stopPropagation()
    if (dragged && dragged.stackId === stackId && dragged.id !== member.id) {
      // Reordenar dentro de la pila.
      const before = event.clientY < rect.top + rect.height / 2
      const members = posts.filter(item => item.stackId === stackId).sort((a, b) => (a.stackPosition ?? 0) - (b.stackPosition ?? 0))
      const draggedItem = members.find(item => item.id === dragged.id)
      const filtered = members.filter(item => item.id !== dragged.id)
      const targetPosition = filtered.findIndex(item => item.id === member.id)
      if (draggedItem && targetPosition >= 0) filtered.splice(before ? targetPosition : targetPosition + 1, 0, draggedItem)
      void runWithErrorReporting(() => usePlanner.getState().reorderStack(stackId, filtered.map(item => item.id)), 'No se pudo reordenar la pila')
      resetDrag()
      return
    }
    // Añadir a la pila abierta (miembros de otras pilas o publicaciones sueltas).
    const ids = dragIds.current
    if (!ids.length) { resetDrag(); return }
    void runWithErrorReporting(() => usePlanner.getState().stackPosts(member.id, ids), 'No se pudo apilar')
    resetDrag()
  }

  const openContextMenu = (event: React.MouseEvent<HTMLElement>, post: Post, stackIds?: string[]) => {
    event.preventDefault()
    event.stopPropagation()
    setShowStatuses(false)
    setShowColors(false)
    // En una pila, el menú contextual actúa sobre toda la pila; si no, sobre la selección o la publicación.
    const ids = stackIds ?? (selected.has(post.id) ? [...selected] : [post.id])
    setContext({ post, ids, x: event.clientX, y: event.clientY })
  }

  const startDrag = (event: React.DragEvent<HTMLElement>, post: Post) => {
    // Al arrastrar la tarjeta superior de una pila cerrada, la pila entera se mueve como unidad.
    const ids = selected.has(post.id)
      ? [...selected]
      : post.stackId
        ? posts.filter(item => item.stackId === post.stackId).sort((a, b) => (a.stackPosition ?? 0) - (b.stackPosition ?? 0)).map(item => item.id)
        : [post.id]
    dragIds.current = ids
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', post.id)
    event.dataTransfer.setData(POST_IDS_MIME, JSON.stringify(ids))
    setCardDragImage(event, ids.length)
    // Se atenúan las tarjetas de origen DESPUÉS de que el navegador captura la imagen, para que el fantasma no salga apagado.
    requestAnimationFrame(() => setDragging(new Set(ids)))
  }

  return <><div className={`board-lanes${selected.size ? ' selection-active' : ''}${dragging.size ? ' is-dragging-cards' : ''}`} role="grid" aria-label="Tablero Kanban por etapas">
    {stages.map(status => {
      const ids = statusIds.get(status) || []
      const selectedCount = ids.filter(id => selected.has(id)).length
      return <div className={`board-status-heading status-${status}${dropTarget?.status === status ? ' drop-target' : ''}`} role="columnheader" key={status} style={{ '--status-color': statusMeta[status].color } as React.CSSProperties}>
        <label title={`Seleccionar todas las publicaciones en ${statusMeta[status].label}`}>
          <input type="checkbox" checked={ids.length > 0 && selectedCount === ids.length} ref={input => { if (input) input.indeterminate = selectedCount > 0 && selectedCount < ids.length }} disabled={!ids.length} onChange={() => onSelectStatus(ids)} aria-label={`Seleccionar todas las publicaciones en ${statusMeta[status].label}`} />
          <span>{statusMeta[status].label}</span><em>{ids.length}</em>
        </label>
      </div>
    })}
    {lanes.map((lane, laneIndex) => {
      const isCollapsed = showBand && collapsedLanes.has(lane.id)
      const lanePosts = [...new Set(lane.postIds)].map(id => postById.get(id)).filter((post): post is Post => Boolean(post))
      return <div className={`board-lane-row${isCollapsed ? ' collapsed' : ''}`} role="row" key={lane.id}>
        {showBand && <div className="board-lane-band" role="rowheader">
          <button type="button" className="board-lane-toggle" aria-expanded={!isCollapsed} onClick={() => toggleLane(lane.id)}>
            {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}{lane.group ? <FolderOpen size={15} /> : <FolderPlus size={15} />}
            <strong>{lane.name}</strong><em>{lanePosts.length}</em>
          </button>
          {isCollapsed && <div className="board-lane-pips">
            {stages.map(status => {
              const n = lanePosts.filter(post => post.status === status).length
              return n ? <span key={status} title={`${n} en ${statusMeta[status].label}`}><i className={`status-mark ${status}`} style={{ background: statusMeta[status].color }} />{n}</span> : null
            })}
          </div>}
          <div className="board-lane-order"><button type="button" aria-label={`Subir ${lane.name}`} title="Subir carril" disabled={laneIndex === 0} onClick={() => reorderLane(lane.id, -1)}><ArrowUp size={12} /></button><button type="button" aria-label={`Bajar ${lane.name}`} title="Bajar carril" disabled={laneIndex === lanes.length - 1} onClick={() => reorderLane(lane.id, 1)}><ArrowDown size={12} /></button></div>
        </div>}
        {!isCollapsed && stages.map(status => {
          const columnPosts = lanePosts.filter(post => post.status === status)
          const order = columnPosts.map(post => post.id)
          const cellKey = `${lane.id}-${status}`
          const limit = openCells.has(cellKey) ? visiblePerColumn : Math.min(CELL_LIMIT, visiblePerColumn)
          // Las pilas se pintan en la posición de su tarjeta superior; los miembros ocultos solo aparecen en la vista expandida.
          // Si la búsqueda/visibility solo deja 1 miembro visible de una pila, se pinta como tarjeta suelta (nunca «pila de 1»).
          const stackSizes = new Map<string, number>()
          for (const post of columnPosts) if (post.stackId) stackSizes.set(post.stackId, (stackSizes.get(post.stackId) || 0) + 1)
          const seenStacks = new Set<string>()
          const renderItems: Array<{ key: string; stackId?: string; items: Post[] }> = []
          for (const post of columnPosts) {
            if (post.stackId && (stackSizes.get(post.stackId) ?? 0) >= 2) {
              if (seenStacks.has(post.stackId)) continue
              seenStacks.add(post.stackId)
              renderItems.push({ key: `stack-${post.stackId}`, stackId: post.stackId, items: columnPosts.filter(member => member.stackId === post.stackId).sort((a, b) => (a.stackPosition ?? 0) - (b.stackPosition ?? 0)) })
            } else {
              renderItems.push({ key: post.id, items: [post] })
            }
          }
          const visibleRenderItems = renderItems.slice(0, limit)
          const inDropColumn = dropTarget?.status === status
          const cellClass = `board-lane-cell${columnPosts.length ? '' : ' empty'}${inDropColumn ? ' drop-column' : ''}${dropTarget?.key === cellKey ? ' drop-over' : ''}`
          const selectStack = (memberIds: string[]) => onSelectStatus(memberIds)
          const renderPostArticle = (post: Post) => {
            const otherMemberships = activeGroups.filter(group => group.id !== lane.group?.id && group.postIds.includes(post.id)).map(group => group.name)
            const overdue = (post.status === 'idea' || post.status === 'draft') && post.scheduledAt && parseISO(post.scheduledAt).getTime() < Date.now()
            const ContentIcon = post.contentType === 'reel' ? Film : post.contentType === 'carousel' ? Images : FileText
            const cardClass = `board-card${selected.has(post.id) ? ' selected' : ''}${pickedPostIds.has(post.id) ? ' session-picked' : ''}${post.color !== postColors[0].value ? ' has-custom-color' : ''}${dragging.has(post.id) ? ' is-dragging' : ''}${duplicatedPostId === post.id || justPastedIds.has(post.id) ? ' just-duplicated' : ''}`
            return <article
              data-area-select-id={post.id}
              tabIndex={0}
              className={cardClass}
              style={{ '--post-color': post.color } as React.CSSProperties}
              draggable
              onDragStart={event => startDrag(event, post)}
              onDragEnd={() => { dragIds.current = []; resetDrag() }}
              onDragOver={event => collapsedCardDragOver(event, post, status)}
              onDragLeave={() => setStackDropTarget(current => current === post.id ? null : current)}
              onDrop={event => collapsedCardDrop(event, post, status)}
              onContextMenu={event => openContextMenu(event, post)}
              onClick={event => { if (onPickPost?.(post.id)) return; if (event.shiftKey || event.ctrlKey || event.metaKey || selected.size > 0) onToggle(post.id, event.shiftKey, order); else onSelect(post.id) }}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (onPickPost?.(post.id)) return; onSelect(post.id) } }}
            >
              <div className="board-card-top">
                <label className="board-select-hit" onClick={event => event.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(post.id)} onChange={event => onToggle(post.id, event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey, order)} aria-label={`Seleccionar ${post.title || 'publicación'}`} />
                </label>
                <span className="board-platforms">{post.platforms.map(platform => <PlatformMark key={platform} platform={platform} small />)}</span>
                {otherMemberships.length > 0 && <span className="board-duplicate-marker" role="img" title={`La misma publicación también está en: ${otherMemberships.join(', ')}`} aria-label={`También en ${otherMemberships.join(', ')}`}><Layers3 size={12} /><span>{otherMemberships.length + 1}</span></span>}
                <span className="board-content-type" title={contentLabels[post.contentType]}><ContentIcon size={12} /><span>{contentLabels[post.contentType].slice(0, 5)}</span></span>
                <div className="board-card-mobile-slot"><MobileCardStatus state={mobilePublicationState} postId={post.id} detailLevel={boardCardDetailLevel} /></div>
              </div>
              <h3>{post.title || 'Publicación sin título'}</h3>
              <div className="board-card-meta">
                {post.scheduledAt && <small className={overdue ? 'overdue' : ''} title={format(parseISO(post.scheduledAt), 'd MMMM yyyy · HH:mm', { locale: es })}>
                  <CalendarDays size={12} /><span>{format(parseISO(post.scheduledAt), 'd MMM', { locale: es })}</span><time dateTime={post.scheduledAt}>{format(parseISO(post.scheduledAt), 'HH:mm')}</time>{overdue && <b>Atrasada</b>}
                </small>}
              </div>
            </article>
          }
          /** Card cerrada de la pila: unidad organizativa sobria; el contenido es una capa secundaria.
              Hover/foco expande una vista previa (sin desplazar la columna); clic abre la lista interactiva. */
          const renderStackClosed = (items: Post[], stackId: string, columnStatus: Post['status']) => {
            const memberIds = items.map(member => member.id)
            const stackCount = items.length
            const top = items[0]
            const memberSelected = memberIds.every(id => selected.has(id))
            const memberSomeSelected = memberIds.some(id => selected.has(id))
            const cardClass = `board-card board-stack-card board-stack-summary${memberSelected ? ' selected' : ''}${memberIds.some(id => dragging.has(id)) || dragging.has(top.id) ? ' is-dragging' : ''}`
            const scheduled = items.filter(member => member.scheduledAt).map(member => ({ post: member, time: parseISO(member.scheduledAt as string).getTime() })).sort((a, b) => a.time - b.time)
            const nextScheduled = scheduled[0] ?? null
            const overdue = nextScheduled !== null && (columnStatus === 'idea' || columnStatus === 'draft') && nextScheduled.time < Date.now()
            const typeCounts = new Map<ContentType, number>()
            for (const member of items) typeCounts.set(member.contentType, (typeCounts.get(member.contentType) ?? 0) + 1)
            const platformUnion: string[] = []
            for (const member of items) for (const platform of member.platforms) if (!platformUnion.includes(platform)) platformUnion.push(platform)
            const previewItems = items.slice(0, STACK_PREVIEW_LIMIT)
            const extraCount = items.length - previewItems.length
            return <article
              data-area-select-id={top.id}
              tabIndex={0}
              className={cardClass}
              draggable
              onDragStart={event => startDrag(event, top)}
              onDragEnd={() => { dragIds.current = []; resetDrag() }}
              onDragOver={event => collapsedCardDragOver(event, top, columnStatus)}
              onDragLeave={() => setStackDropTarget(current => current === top.id ? null : current)}
              onDrop={event => collapsedCardDrop(event, top, columnStatus)}
              onContextMenu={event => openContextMenu(event, top, memberIds)}
              onClick={() => toggleStackExpand(stackId)}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleStackExpand(stackId) } }}
              aria-expanded={false}
              aria-label={`Pila de ${stackCount} publicaciones`}
            >
              <label className="board-select-hit" onClick={event => event.stopPropagation()}>
                <input type="checkbox" checked={memberSelected} ref={input => { if (input) input.indeterminate = memberSomeSelected && !memberSelected }} onChange={() => selectStack(memberIds)} aria-label={`Seleccionar pila de ${stackCount}`} />
              </label>
              <div className="board-stack-summary-row">
                <span className="board-stack-summary-badge"><Layers size={14} aria-hidden="true" /><b>{stackCount}</b></span>
                <span className="board-stack-summary-types">{[...typeCounts].map(([type, count]) => { const Icon = stackContentIcon(type); return <span key={type} className="board-stack-summary-type"><Icon size={12} aria-hidden="true" />{count > 1 && <i>×{count}</i>}</span> })}</span>
                <span className="board-stack-summary-platforms">{platformUnion.slice(0, 5).map(platform => <PlatformMark key={platform} platform={platform} small />)}</span>
              </div>
              <div className="board-stack-summary-foot">
                {nextScheduled
                  ? <span className={`board-stack-summary-date${overdue ? ' overdue' : ''}`}><CalendarDays size={11} aria-hidden="true" /><span>{format(nextScheduled.time, 'd MMM', { locale: es })}</span><time dateTime={nextScheduled.post.scheduledAt ?? undefined}>{format(nextScheduled.time, 'HH:mm')}</time>{overdue && <b>Atrasada</b>}</span>
                  : <span className="board-stack-summary-nodate">Sin fecha</span>}
              </div>
              <div className="board-stack-preview" aria-hidden="true">
                {previewItems.map(member => { const Icon = stackContentIcon(member.contentType); return <div key={member.id} className="board-stack-preview-item"><Icon size={11} aria-hidden="true" /><span>{member.title || 'Publicación sin título'}</span></div> })}
                {extraCount > 0 && <div className="board-stack-preview-more">+{extraCount} más</div>}
              </div>
            </article>
          }
          const renderStackExpanded = (items: Post[], stackId: string) => {
            const orderIds = items.map(member => member.id)
            return <div className="board-stack-expanded" role="list" aria-label={`Pila de ${items.length} publicaciones`} key={`expanded-${stackId}`}>
              <div className="board-stack-expanded-header">
                <Layers size={13} aria-hidden="true" /><strong>{items.length} publicaciones</strong>
                <button type="button" className="board-stack-collapse" aria-label="Colapsar pila" title="Colapsar pila" onClick={() => toggleStackExpand(stackId)}><ChevronUp size={14} /></button>
              </div>
              {items.map((member, index) => <div
                key={member.id}
                role="listitem"
                className={`board-stack-member${selected.has(member.id) ? ' selected' : ''}${dragging.has(member.id) ? ' is-dragging' : ''}${stackDropTarget === member.id ? ' stack-drop-target' : ''}${stackReorder?.stackId === stackId && stackReorder.index === index ? ' reorder-over-top' : ''}${stackReorder?.stackId === stackId && stackReorder.index === index + 1 ? ' reorder-over-bottom' : ''}`}
                data-area-select-id={member.id}
                tabIndex={0}
                draggable
                onDragStart={event => memberDragStart(event, member, stackId)}
                onDragEnd={resetDrag}
                onDragOver={event => memberDragOver(event, member, stackId, index)}
                onDrop={event => memberDrop(event, member, stackId)}
                onContextMenu={event => openContextMenu(event, member)}
                onClick={event => { if (onPickPost?.(member.id)) return; if (event.shiftKey || event.ctrlKey || event.metaKey || selected.size > 0) onToggle(member.id, event.shiftKey, orderIds); else onSelect(member.id) }}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (onPickPost?.(member.id)) return; onSelect(member.id) } }}
              >
                <span className="board-stack-member-index" aria-hidden="true">{index + 1}</span>
                <label className="board-select-hit" onClick={event => event.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(member.id)} onChange={event => onToggle(member.id, event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey, orderIds)} aria-label={`Seleccionar ${member.title || 'publicación'}`} />
                </label>
                <span className="board-stack-member-icons" aria-hidden="true">{(() => { const Icon = stackContentIcon(member.contentType); return <Icon size={12} /> })()}{member.platforms[0] && <PlatformMark platform={member.platforms[0]} small />}</span>
                <span className="board-stack-member-title">{member.title || 'Publicación sin título'}</span>
                {member.scheduledAt && <span className="board-stack-member-date"><CalendarDays size={11} aria-hidden="true" />{format(parseISO(member.scheduledAt), 'd MMM', { locale: es })}</span>}
                <button type="button" className="board-stack-member-unstack" aria-label={`Sacar de la pila: ${member.title || 'publicación'}`} title="Sacar de la pila" onClick={event => { event.stopPropagation(); void runWithErrorReporting(() => usePlanner.getState().unstackPost(member.id), 'No se pudo desapilar') }}><ArrowUpFromLine size={13} /></button>
              </div>)}
            </div>
          }
          return <div
            className={cellClass}
            style={{ '--status-color': statusMeta[status].color } as React.CSSProperties}
            role="gridcell"
            key={cellKey}
            onDragOver={event => {
              event.preventDefault()
              if (!carriesPosts(event)) return
              event.dataTransfer.dropEffect = 'move'
              if (dropTarget?.key !== cellKey) setDropTarget({ key: cellKey, status })
            }}
            onDragLeave={event => {
              // dragleave también se dispara al pasar sobre hijos: solo limpiamos si realmente salimos de la celda.
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(current => current?.key === cellKey ? null : current)
            }}
            onDrop={() => { const member = stackDragMember; resetDrag(); onMove(status); if (member) void runWithErrorReporting(() => usePlanner.getState().unstackPost(member.id), 'No se pudo desapilar') }}
          >
            {visibleRenderItems.map(item => {
              const top = item.items[0]
              if (!item.stackId) return <div className={`board-card-slot board-stack-slot${stackDropTarget === top.id ? ' stack-drop-target' : ''}`} key={top.id}>
                {stackDropTarget === top.id && <><div className="board-stack-layer board-stack-layer-1" aria-hidden="true" /><div className="board-stack-layer board-stack-layer-2" aria-hidden="true" /></>}
                {renderPostArticle(top)}
              </div>
              if (expandedStacks.has(item.stackId)) return <div className="board-card-slot board-stack-slot expanded" key={item.key}>{renderStackExpanded(item.items, item.stackId)}</div>
              return <div className={`board-card-slot board-stack-slot stack-closed${stackDropTarget === top.id ? ' stack-drop-target' : ''}`} key={item.key}>
                <div className="board-stack-layer board-stack-layer-1" aria-hidden="true" />
                <div className="board-stack-layer board-stack-layer-2" aria-hidden="true" />
                {renderStackClosed(item.items, item.stackId, status)}
              </div>
            })}
            {!columnPosts.length && <div className="board-drop-hint">{inDropColumn ? 'Soltá acá' : 'Arrastrá una publicación acá'}</div>}
            {renderItems.length > visibleRenderItems.length && <button type="button" className="board-more-btn" onClick={() => setOpenCells(current => new Set(current).add(cellKey))}>Ver {renderItems.length - visibleRenderItems.length} más</button>}
          </div>
        })}
      </div>
    })}
  </div>
  {context && (() => {
    const actionIds = context.ids
    const hasScheduledPosts = actionIds.some(id => postById.get(id)?.scheduledAt)
    const close = () => setContext(null)
    return <BoardContextMenu x={context.x} y={context.y} label={`Acciones para ${context.post.title || 'publicación'}`}>
      <BoardContextSelectionActions
        count={actionIds.length}
        canArchive={actionIds.some(id => postById.get(id)?.status !== 'archived')}
        hasScheduledPosts={hasScheduledPosts}
        scheduleAt={scheduleAt}
        scheduleWarning={scheduleWarning}
        onArchive={() => { close(); onArchive(actionIds) }}
        onScheduleAtChange={onScheduleAtChange}
        onSchedule={() => { close(); onSchedule(actionIds) }}
        onClearSchedule={() => { close(); onClearSchedule(actionIds) }}
        onFormat={contentType => { close(); onFormat(actionIds, contentType) }}
      />
      <button type="button" role="menuitem" onClick={() => { onSelect(context.post.id); close() }}>{actionIds.length > 1 ? 'Editar esta publicación' : 'Abrir / editar publicación'}</button>
      <button type="button" role="menuitem" onClick={() => { usePlanner.getState().requestConceptMapPost(context.post.id); close() }}><Network size={14} />Referenciar en mapa conceptual</button>
      {actionIds.length > 1 && <button type="button" role="menuitem" onClick={() => { onEditSelection(); close() }}>Editar selección en pestañas</button>}
      <button type="button" role="menuitem" onClick={() => { void duplicatePost(context.post); close() }}><Copy size={14} />Duplicar publicación</button>
      <button type="button" role="menuitem" onClick={() => { void runWithErrorReporting(() => window.planner.media.openFolder(context.post.id, context.post.project), 'No se pudo abrir la carpeta de media'); close() }}><FolderOpen size={14} />Abrir en el Explorador Windows</button>
      <button type="button" role="menuitem" onClick={() => { onDelete(context.post); close() }}><Trash2 size={14} />Eliminar publicación</button>
      <button type="button" role="menuitem" disabled={!context.post.caption.trim()} onClick={() => { const request = withClipboardPayload(context.post.caption, [{ kind: 'field', field: 'caption', text: context.post.caption, sourceId: context.post.id }]); void runWithErrorReporting(() => window.planner.clipboard.write(request.text, request.html), 'No se pudo copiar el texto'); close() }}><ClipboardCopy size={14} />Copiar texto</button>
      <button type="button" role="menuitem" onClick={() => { setCopyPosts(actionIds.map(id => postById.get(id)).filter(post => post !== undefined)); close() }}><ClipboardCopy size={14} />{actionIds.length > 1 ? `Copiar ${actionIds.length} publicaciones…` : 'Copiar publicación…'}</button>
      <button type="button" role="menuitem" disabled={!pastePreview} title={pasteMatch > 0 ? 'Cada bloque vuelve a su publicación original; también podés pegarlas como nuevas' : undefined} onClick={() => { if (pasteMatch > 0) onOpenPasteDialog(context.post); else void pastePosts(context.post); close() }}><ClipboardPaste size={14} />{pastePreview ? `Pegar ${pastePreview} ${pastePreview === 1 ? 'publicación' : 'publicaciones'}${pasteMatch > 0 ? '…' : ''}` : 'Pegar publicación'}</button>
      <button type="button" role="menuitem" disabled={!applyPreview} title="Reemplaza los campos y anexa diapositivas de lo copiado" onClick={() => { setApplyTargets(actionIds.map(id => postById.get(id)).filter((post): post is Post => post !== undefined)); close() }}><Replace size={14} />{actionIds.length > 1 ? `Aplicar contenido a ${actionIds.length} publicaciones…` : 'Aplicar contenido copiado…'}</button>
      <button type="button" role="menuitem" aria-expanded={showStatuses} onClick={() => setShowStatuses(value => !value)}><MoreHorizontal size={14} />Cambiar etapa…</button>
      {showStatuses && <div className="board-context-statuses" role="group" aria-label="Cambiar etapa">{stages.filter(status => status !== context.post.status && (status !== 'scheduled' || Boolean(context.post.scheduledAt))).map(status => <button type="button" key={status} onClick={() => { onStatus(context.post, status); close(); setShowStatuses(false) }}>{statusMeta[status].label}</button>)}</div>}
      <button type="button" role="menuitem" aria-expanded={showColors} onClick={() => setShowColors(value => !value)}><span className="board-context-color-icon" style={{ backgroundColor: context.post.color }} />Cambiar color…</button>
      {showColors && <div className="board-context-color-options" role="group" aria-label="Colores de tarjeta">
        {postColors.map(color => <button type="button" key={color.value} aria-label={color.label} title={color.label} aria-pressed={context.post.color === color.value} style={{ backgroundColor: color.value }} onClick={() => { onColor(context.post, color.value); close() }} />)}
        <button type="button" className="board-context-color-reset" aria-pressed={context.post.color === postColors[0].value} onClick={() => { onColor(context.post, postColors[0].value); close() }}>Predeterminado</button>
      </div>}
    </BoardContextMenu>
  })()}
  {copyPosts.length > 0 && <PostCopyDialog posts={copyPosts.map(post => ({ title: post.title, caption: post.caption, notes: post.notes, hashtags: post.hashtags, ideaBlocks: post.ideaBlocks, sourceId: post.id }))} onClose={() => setCopyPosts([])} />}
  {applyTargets.length > 0 && applyPreview && <ApplyFieldsDialog targets={applyTargets.map(post => ({ title: post.title, caption: post.caption, notes: post.notes, hashtags: post.hashtags }))} incoming={applyPreview} text={applyText} onApply={(fields, includeSlides) => onApplyFields(applyTargets, fields, includeSlides)} onClose={() => setApplyTargets([])} />}
  {showPasteHint && <PasteFormatHint onClose={() => setShowPasteHint(false)} />}
</>
}
