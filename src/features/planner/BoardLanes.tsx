import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { MobileCardStatus, type BoardCardDetailLevel, type MobilePublicationState } from './BoardCardDecorations'
import { StackClosedCard, StackExpandedList, type StackHandlers } from './BoardStacks'
import { withClipboardPayload } from '../../shared/clipboard-payload'
import { BoardContextMenu, BoardContextSelectionActions } from './BoardContextMenu'
import { PostCopyDialog } from './PostCopyDialog'
import { ApplyFieldsDialog } from './ApplyFieldsDialog'
import { PasteFormatHint } from './PasteFormatHint'
import { availableParsedFields, groupPayloadPosts, isStructuredPostText, parsePostsFromText, readClipboardPayload, type ClipboardPasteSource, type ClipboardPostField, type ParsedPost } from '../../shared/clipboard-payload'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, ChevronRight, ClipboardCopy, ClipboardPaste, Copy, FileText, Film, FolderOpen, FolderPlus, Images, Layers3, MoreHorizontal, Network, Plus, Replace, Trash2 } from 'lucide-react'
import { contentLabels, stages, statusMeta } from '../../shared/constants'
import { postColors } from '../../shared/postColors'
import { runWithErrorReporting } from '../../app/errors'
import { usePlanner } from '../../app/store'
import { PlatformMark } from '../../components/layout/AppShell'
import type { ContentType, Post, PostStatus, WorkGroup } from '../../shared/types'

const POST_IDS_MIME = 'application/x-caballocci-post-ids'

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

export function BoardLanes({ lanes, posts, activeGroups, selected, collapsedLanes, toggleLane, reorderLane, visiblePerColumn, mobilePublicationState, boardCardDetailLevel, dragIds, onToggle, onSelect, onPickPost, pickedPostIds = new Set<string>(), onColor, onMove, onSelectStatus, onDuplicate, onPastePosts, onOpenPasteDialog, allPosts, onApplyFields, onDelete, onStatus, onEditSelection, onArchive, scheduleAt, scheduleWarning, onScheduleAtChange, onSchedule, onClearSchedule, onFormat, onNewPost }: {
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
  onNewPost?(status: PostStatus): void;
}) {
  const [context, setContext] = useState<{ post: Post; ids: string[]; x: number; y: number } | null>(null)
  const [statusMenu, setStatusMenu] = useState<{ status: PostStatus; x: number; y: number } | null>(null)
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
  // Las pilas abiertas se recuerdan entre recargas; los ids que ya no existen se ignoran al renderizar.
  const [expandedStacks, setExpandedStacks] = useState<Set<string>>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('caballocci.expanded-stacks') || '[]')
      return new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [])
    } catch { return new Set() }
  })
  const [stackDropTarget, setStackDropTarget] = useState<string | null>(null)
  const [stackContainerTarget, setStackContainerTarget] = useState<string | null>(null)
  const [stackReorder, setStackReorder] = useState<{ stackId: string; index: number } | null>(null)
  const [stackDragMember, setStackDragMember] = useState<{ id: string; stackId: string } | null>(null)
  // Toast de deshacer para apilar/desapilar: guardamos la acción exacta que produjo el cambio.
  const [stackUndo, setStackUndo] = useState<{ label: string; action: unknown } | null>(null)
  const stackUndoTimer = useRef<number | null>(null)
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
    setStackContainerTarget(null)
    setStackReorder(null)
    setStackDragMember(null)
  }, [])

  // Recordar qué pilas quedaron abiertas entre recargas y cambios de vista.
  useEffect(() => {
    try { localStorage.setItem('caballocci.expanded-stacks', JSON.stringify([...expandedStacks])) } catch { /* almacenamiento no disponible */ }
  }, [expandedStacks])

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
    if (stackUndoTimer.current !== null) window.clearTimeout(stackUndoTimer.current)
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

  /** Muestra el toast de deshacer solo si la operación realmente agregó historial. */
  const runStackUndoable = (label: string, errorMessage: string, operation: () => Promise<void>) => {
    void runWithErrorReporting(async () => {
      const before = usePlanner.getState().undoHistory.length
      await operation()
      if (usePlanner.getState().undoHistory.length <= before) return
      const action = usePlanner.getState().undoHistory.at(-1)
      if (!action) return
      if (stackUndoTimer.current !== null) window.clearTimeout(stackUndoTimer.current)
      setStackUndo({ label, action })
      stackUndoTimer.current = window.setTimeout(() => setStackUndo(null), 6000)
    }, errorMessage)
  }

  const undoStackChange = () => {
    const pending = stackUndo
    if (stackUndoTimer.current !== null) { window.clearTimeout(stackUndoTimer.current); stackUndoTimer.current = null }
    setStackUndo(null)
    // Si hubo otro cambio después, no deshacemos algo distinto de lo anunciado.
    if (!pending || usePlanner.getState().undoHistory.at(-1) !== pending.action) return
    void runWithErrorReporting(() => usePlanner.getState().undoSavedChange(), 'No se pudo deshacer')
  }

  /** Expande/colapsa con View Transitions: el slot se transforma en la pila abierta en vez de reemplazarse de golpe. */
  const runStackTransition = (update: () => void) => {
    const doc = document as Document & { startViewTransition?: (callback: () => void) => unknown }
    if (typeof doc.startViewTransition !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { update(); return }
    doc.startViewTransition(() => { flushSync(update) })
  }

  const toggleStackExpand = (stackId: string) => runStackTransition(() => setExpandedStacks(current => { const next = new Set(current); if (next.has(stackId)) next.delete(stackId); else next.add(stackId); return next }))

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
    runStackUndoable('Publicaciones apiladas', 'No se pudo apilar', () => usePlanner.getState().stackPosts(post.id, ids))
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
      runStackUndoable('Pila reordenada', 'No se pudo reordenar la pila', () => usePlanner.getState().reorderStack(stackId, filtered.map(item => item.id)))
      resetDrag()
      return
    }
    // Añadir a la pila abierta (miembros de otras pilas o publicaciones sueltas).
    const ids = dragIds.current
    if (!ids.length) { resetDrag(); return }
    runStackUndoable('Publicaciones apiladas', 'No se pudo apilar', () => usePlanner.getState().stackPosts(member.id, ids))
    resetDrag()
  }

  /** Soltar sobre el encabezado, los huecos o el fondo de la pila expandida añade al final. */
  const stackContainerDragOver = (event: React.DragEvent<HTMLElement>, items: Post[], columnStatus: Post['status']) => {
    if (!carriesPosts(event) || !canStackOn(columnStatus)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    const stackId = items[0]?.stackId
    if (stackId && stackContainerTarget !== stackId) setStackContainerTarget(stackId)
  }

  const stackContainerDragLeave = (event: React.DragEvent<HTMLElement>, stackId: string) => {
    // dragleave también se dispara al pasar sobre hijos: solo limpiamos si realmente salimos de la pila.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setStackContainerTarget(current => current === stackId ? null : current)
  }

  const stackContainerDrop = (event: React.DragEvent<HTMLElement>, items: Post[], columnStatus: Post['status']) => {
    if (!carriesPosts(event) || !canStackOn(columnStatus)) return
    event.preventDefault()
    event.stopPropagation()
    const target = items[0]
    const dragged = stackDragMember
    // Reordenar dentro de la misma pila se resuelve soltando sobre un miembro, no sobre el fondo.
    if (!target || (dragged && dragged.stackId === target.stackId)) { resetDrag(); return }
    const ids = dragIds.current
    if (!ids.length) { resetDrag(); return }
    void runStackUndoable('Publicaciones apiladas', 'No se pudo apilar', () => usePlanner.getState().stackPosts(target.id, ids))
    resetDrag()
  }

  const openContextMenu = (event: React.MouseEvent<HTMLElement>, post: Post, stackIds?: string[]) => {
    event.preventDefault()
    event.stopPropagation()
    setShowStatuses(false)
    setShowColors(false)
    setStatusMenu(null)
    // En una pila, el menú contextual actúa sobre toda la pila; si no, sobre la selección o la publicación.
    const ids = stackIds ?? (selected.has(post.id) ? [...selected] : [post.id])
    setContext({ post, ids, x: event.clientX, y: event.clientY })
  }

  const openStatusMenu = (event: React.MouseEvent<HTMLElement>, status: PostStatus) => {
    event.preventDefault()
    event.stopPropagation()
    setContext(null)
    setShowStatuses(false)
    setShowColors(false)
    setStatusMenu({ status, x: event.clientX, y: event.clientY })
  }

  const closeStatusMenu = () => setStatusMenu(null)

  // Cerrar el menú de etapa al hacer clic fuera de él.
  useEffect(() => {
    if (!statusMenu) return
    const dismiss = () => closeStatusMenu()
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', event => { if (event.key === 'Escape') dismiss() })
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss) }
  }, [statusMenu])

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

  // La pila queda como componente aparte: el tablero le pasa sus acciones ya ligadas al estado.
  const stackHandlers: StackHandlers = {
    toggleExpand: toggleStackExpand,
    selectStack: memberIds => onSelectStatus(memberIds),
    select: id => onSelect(id),
    toggle: (id, range, order) => onToggle(id, range, order),
    pickPost: onPickPost,
    openContextMenu,
    startDrag,
    endDrag: () => { dragIds.current = []; resetDrag() },
    dragOver: collapsedCardDragOver,
    dragLeave: postId => setStackDropTarget(current => current === postId ? null : current),
    drop: collapsedCardDrop,
    startMemberDrag: memberDragStart,
    endMemberDrag: resetDrag,
    memberDragOver,
    memberDrop,
    containerDragOver: stackContainerDragOver,
    containerDragLeave: stackContainerDragLeave,
    containerDrop: stackContainerDrop,
    unstack: member => runStackUndoable('Publicación desapilada', 'No se pudo desapilar', () => usePlanner.getState().unstackPost(member.id)),
  }

  return <><div className={`board-lanes${selected.size ? ' selection-active' : ''}${dragging.size ? ' is-dragging-cards' : ''}`} role="grid" aria-label="Tablero Kanban por etapas">
    {stages.map(status => {
      const ids = statusIds.get(status) || []
      const selectedCount = ids.filter(id => selected.has(id)).length
      return <div className={`board-status-heading status-${status}${dropTarget?.status === status ? ' drop-target' : ''}`} role="columnheader" key={status} style={{ '--status-color': statusMeta[status].color } as React.CSSProperties} onContextMenu={event => openStatusMenu(event, status)}>
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
              // Nombre único por celda y pila para que View Transitions anime solo este slot.
              const stackViewName = item.stackId ? `stack-${cellKey}-${item.stackId}`.replace(/[^a-zA-Z0-9_-]/g, '-') : undefined
              if (!item.stackId) return <div className={`board-card-slot board-stack-slot${stackDropTarget === top.id ? ' stack-drop-target' : ''}`} key={top.id}>
                {stackDropTarget === top.id && <><div className="board-stack-layer board-stack-layer-1" aria-hidden="true" /><div className="board-stack-layer board-stack-layer-2" aria-hidden="true" /></>}
                {renderPostArticle(top)}
              </div>
              if (expandedStacks.has(item.stackId)) return <div className="board-card-slot board-stack-slot expanded" key={item.key} style={{ viewTransitionName: stackViewName }}><StackExpandedList items={item.items} stackId={item.stackId} columnStatus={status} selected={selected} dragging={dragging} mobilePublicationState={mobilePublicationState} boardCardDetailLevel={boardCardDetailLevel} containerTarget={stackContainerTarget === item.stackId} dropTarget={stackDropTarget} reorder={stackReorder} handlers={stackHandlers} /></div>
              // Las capas de atrás usan el color de los miembros 2 y 3 (si tienen uno propio), y su cantidad refleja el tamaño real.
              const layerColor1 = item.items[1] && item.items[1].color !== postColors[0].value ? item.items[1].color : undefined
              const layerColor2 = item.items[2] && item.items[2].color !== postColors[0].value ? item.items[2].color : undefined
              return <div
                className={`board-card-slot board-stack-slot stack-closed${stackDropTarget === top.id ? ' stack-drop-target' : ''}`}
                key={item.key}
                style={{ '--stack-layer-1': layerColor1, '--stack-layer-2': layerColor2, viewTransitionName: stackViewName } as React.CSSProperties}
              >
                {item.items.length >= 2 && <div className="board-stack-layer board-stack-layer-1" aria-hidden="true" />}
                {item.items.length >= 3 && <div className="board-stack-layer board-stack-layer-2" aria-hidden="true" />}
                <StackClosedCard items={item.items} stackId={item.stackId} columnStatus={status} selected={selected} dragging={dragging} mobilePublicationState={mobilePublicationState} boardCardDetailLevel={boardCardDetailLevel} handlers={stackHandlers} />
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
  {statusMenu && <BoardContextMenu x={statusMenu.x} y={statusMenu.y} label={`Nueva publicación en ${statusMeta[statusMenu.status].label}`}>
    <button type="button" role="menuitem" onClick={() => { closeStatusMenu(); onNewPost?.(statusMenu.status) }}><Plus size={14} />Nueva publicación en {statusMeta[statusMenu.status].label}</button>
  </BoardContextMenu>}
  {copyPosts.length > 0 && <PostCopyDialog posts={copyPosts.map(post => ({ title: post.title, caption: post.caption, notes: post.notes, hashtags: post.hashtags, ideaBlocks: post.ideaBlocks, sourceId: post.id }))} onClose={() => setCopyPosts([])} />}
  {applyTargets.length > 0 && applyPreview && <ApplyFieldsDialog targets={applyTargets.map(post => ({ title: post.title, caption: post.caption, notes: post.notes, hashtags: post.hashtags }))} incoming={applyPreview} text={applyText} onApply={(fields, includeSlides) => onApplyFields(applyTargets, fields, includeSlides)} onClose={() => setApplyTargets([])} />}
  {showPasteHint && <PasteFormatHint onClose={() => setShowPasteHint(false)} />}
  {stackUndo && <div className="board-stack-undo" role="status" aria-live="polite">
    <span>{stackUndo.label}</span>
    <button type="button" onClick={undoStackChange}>Deshacer</button>
  </div>}
</>
}