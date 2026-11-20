import { useEffect, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react'
import { Archive, ArchiveRestore, ArrowLeft, ChevronDown, ChevronRight, CornerDownRight, Eraser, FolderOpen, FolderPlus, Inbox, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Post, WorkGroup } from '../../shared/types'
import { childrenByParent, groupPath, isDescendant, subtreePostIds } from '../../shared/work-group-tree'
import { postColors } from '../../shared/postColors'
import { BoardContextMenu } from './BoardContextMenu'
import { branchTrail } from './collection-branch'
import { useWorkGroupNesting, applyCollectionDropClasses, clearCollectionDropClasses, collectionDropZoneX, type CollectionDropZone } from './useWorkGroupNesting'

const workGroupDragType = 'application/x-caballocci-work-group-id'
const postDragType = 'application/x-caballocci-post-ids'

export function BoardCollectionNav({ groups, posts, selectedWorkGroup, setActiveWorkGroup, openGroupForm, onDropPosts, onDropPostsUnassigned, onEditGroup, onColor, onGroupAction, groupUncompressedMediaCount, setPendingMediaCompression, restoreGroupMedia, trailing }: {
  groups: WorkGroup[]
  posts: Post[]
  selectedWorkGroup: WorkGroup | null
  setActiveWorkGroup(id: string | null): void
  openGroupForm(group?: WorkGroup | null, parent?: WorkGroup | null): void
  onDropPosts(groupId: string, ids: string[]): void
  onDropPostsUnassigned(ids: string[]): void
  onEditGroup(group: WorkGroup): void
  onColor(group: WorkGroup, color: string): void
  onGroupAction(type: 'archive' | 'restore' | 'delete', group: WorkGroup): void
  groupUncompressedMediaCount: number
  setPendingMediaCompression(id: string, name: string, mediaCount: number): void
  restoreGroupMedia(): void
  trailing?: ReactNode
}) {
  const [collectionMenu, setCollectionMenu] = useState<{ group: WorkGroup; x: number; y: number } | null>(null)
  const [draggingPosts, setDraggingPosts] = useState(false)
  const [draggingCollectionId, setDraggingCollectionId] = useState<string | null>(null)
  // Rama abierta durante un arrastre: ids desde el nivel actual hasta la colección
  // señalada. Su último id decide qué subcolecciones se ofrecen como destino.
  const [branchTrailIds, setBranchTrailIds] = useState<string[]>([])
  const { nestWorkGroup, reorderSibling } = useWorkGroupNesting()
  // La affordance de colecciones se enciende desde el `dragstart`, no desde el primer
  // `dragover` de una pestaña: con colecciones anidadas, el destino tiene que verse
  // mientras se busca, no recién cuando el puntero ya está encima.
  useEffect(() => {
    const isPostDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes(postDragType)
    const onDragStart = (event: DragEvent) => { if (isPostDrag(event)) setDraggingPosts(true) }
    const onDragEnd = () => { setDraggingPosts(false); setBranchTrailIds([]) }
    document.addEventListener('dragstart', onDragStart)
    document.addEventListener('dragend', onDragEnd)
    document.addEventListener('drop', onDragEnd)
    return () => {
      document.removeEventListener('dragstart', onDragStart)
      document.removeEventListener('dragend', onDragEnd)
      document.removeEventListener('drop', onDragEnd)
    }
  }, [])
  useEffect(() => {
    if (!collectionMenu) return
    const dismiss = () => setCollectionMenu(null)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss() }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [collectionMenu])
  useEffect(() => { setBranchTrailIds([]) }, [selectedWorkGroup?.id])

  const activeGroups = groups.filter(group => !group.archivedAt)
  const path = groupPath(groups, selectedWorkGroup?.id ?? null)
  const children = childrenByParent(activeGroups)
  const levelGroups = children.get(selectedWorkGroup?.id ?? null) ?? []
  // Una fila por nivel abierto: al descender se agrega la fila de la nueva colección
  // sin quitar la anterior, así el chip bajo el puntero no desaparece a mitad del gesto.
  const branchRows = branchTrailIds.flatMap(id => {
    const parent = activeGroups.find(group => group.id === id)
    const groupsAtLevel = children.get(id) ?? []
    return parent && groupsAtLevel.length ? [{ parent, groups: groupsAtLevel }] : []
  })
  const draggingCollection = draggingCollectionId ? groups.find(group => group.id === draggingCollectionId) ?? null : null
  const subtreeSets = new Map(activeGroups.map(group => [group.id, new Set(subtreePostIds(activeGroups, group.id))]))
  const countPostsIn = (group: WorkGroup) => posts.filter(post => post.status !== 'archived' && subtreeSets.get(group.id)?.has(post.id)).length
  const unassignedCount = posts.filter(post => post.status !== 'archived' && !activeGroups.some(group => group.postIds.includes(post.id))).length

  const isPostDragEvent = (event: ReactDragEvent<HTMLElement>) => Array.from(event.dataTransfer.types).includes(postDragType)
  const readDraggedPostIds = (event: ReactDragEvent<HTMLElement>) => {
    const raw = event.dataTransfer.getData(postDragType)
    if (raw) {
      try { return JSON.parse(raw) as string[] } catch { /* Vale el texto plano como respaldo. */ }
    }
    const singleId = event.dataTransfer.getData('text/plain')
    return singleId ? [singleId] : []
  }
  const expandTo = (group: WorkGroup | null) => {
    if (!group) { setBranchTrailIds([]); return }
    if (!(children.get(group.id)?.length)) return
    const trail = branchTrail(activeGroups, selectedWorkGroup?.id ?? null, group.id)
    setBranchTrailIds(current => current.join('\u0000') === trail.join('\u0000') ? current : trail)
  }
  const toggleBranch = (group: WorkGroup) => {
    setBranchTrailIds(current => current[current.length - 1] === group.id
      ? []
      : branchTrail(activeGroups, selectedWorkGroup?.id ?? null, group.id))
  }
  const goTo = (id: string | null) => { setBranchTrailIds([]); setActiveWorkGroup(id) }

  // Destinos de publicaciones: una colección concreta o `null` = sin colección.
  // El mismo par de handlers sirve para chips, breadcrumb y la zona "Sin colección".
  const postDropProps = (group: WorkGroup | null, options: { expand?: boolean } = {}) => ({
    onDragOver: (event: ReactDragEvent<HTMLElement>) => {
      if (!isPostDragEvent(event)) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.classList.add('drag-over', 'post-drag-over')
      setDraggingPosts(true)
      if (options.expand !== false) expandTo(group)
    },
    onDragLeave: (event: ReactDragEvent<HTMLElement>) => {
      event.currentTarget.classList.remove('drag-over', 'post-drag-over')
    },
    onDrop: (event: ReactDragEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.classList.remove('drag-over', 'post-drag-over')
      setDraggingPosts(false)
      setBranchTrailIds([])
      const ids = readDraggedPostIds(event)
      if (!ids.length) return
      if (group) onDropPosts(group.id, ids)
      else onDropPostsUnassigned(ids)
    },
  })

  const collectionDropProps = (group: WorkGroup) => ({
    onDragOver: (event: ReactDragEvent<HTMLDivElement>) => {
      const types = Array.from(event.dataTransfer.types)
      const isPostDrag = types.includes(postDragType)
      if (isPostDrag) {
        event.preventDefault()
        event.currentTarget.classList.add('drag-over', 'post-drag-over')
        setDraggingPosts(true)
        expandTo(group)
        return
      }
      if (!draggingCollectionId) return
      const zone = collectionDropZoneX(event.clientX, event.currentTarget)
      if (zone === 'nest' && isDescendant(groups, draggingCollectionId, group.id)) { applyCollectionDropClasses(event.currentTarget, null); return }
      event.preventDefault()
      applyCollectionDropClasses(event.currentTarget, zone)
      event.currentTarget.dataset.dropZone = zone
    },
    onDragLeave: (event: ReactDragEvent<HTMLDivElement>) => {
      clearCollectionDropClasses(event.currentTarget)
      event.currentTarget.classList.remove('drag-over', 'post-drag-over')
      delete event.currentTarget.dataset.dropZone
    },
    onDrop: (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault(); clearCollectionDropClasses(event.currentTarget); setDraggingPosts(false); setBranchTrailIds([])
      const target = event.currentTarget
      const draggedId = event.dataTransfer.getData(workGroupDragType)
      if (draggedId) {
        const zone = (target.dataset.dropZone as CollectionDropZone | undefined) ?? collectionDropZoneX(event.clientX, target)
        delete target.dataset.dropZone
        setDraggingCollectionId(null)
        if (zone === 'nest') {
          if (isDescendant(groups, draggedId, group.id) || draggedId === group.id) return
          nestWorkGroup(draggedId, group.id)
          return
        }
        reorderSibling(draggedId, group.id, zone)
        return
      }
      const ids = readDraggedPostIds(event)
      if (ids.length) onDropPosts(group.id, ids)
    },
  })

  const renderGroupItem = (group: WorkGroup, variant: 'level' | 'branch') => {
    const count = countPostsIn(group)
    const hasChildren = (children.get(group.id)?.length ?? 0) > 0
    const open = hasChildren && branchTrailIds[branchTrailIds.length - 1] === group.id
    return <div className={`board-collection-item${variant === 'branch' ? ' board-collection-branch-item' : ''}`} key={`${variant}:${group.id}`} {...collectionDropProps(group)}>
      <button type="button" draggable className={`board-collection-tab board-collection-chip${group.color ? ' has-custom-color' : ''}`} aria-current={selectedWorkGroup?.id === group.id ? 'page' : undefined} onClick={() => goTo(group.id)} onDragStart={event => { event.dataTransfer.setData(workGroupDragType, group.id); setDraggingCollectionId(group.id) }} onDragEnd={() => setDraggingCollectionId(null)} style={{ '--collection-color': group.color } as React.CSSProperties} title={`${group.name} · ${count} publicación(es) incluidas subcolecciones`}>
        <FolderOpen size={14} /><span className="board-collection-tab-name">{group.name}</span><em>{count}</em>
      </button>
      {hasChildren && <button type="button" className="board-collection-branch-toggle" aria-expanded={open} aria-label={`Subcolecciones de ${group.name}`} title={open ? 'Ocultar subcolecciones' : 'Ver subcolecciones'} onClick={() => toggleBranch(group)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>}
      <button type="button" className="board-collection-item-menu" aria-label={`Opciones de ${group.name}`} onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect()
        setCollectionMenu({ group, x: rect.right, y: rect.bottom + 4 })
      }}><MoreHorizontal size={14} /></button>
    </div>
  }

  return <nav className={`board-collection-nav${draggingPosts ? ' post-drag-active' : ''}${branchRows.length ? ' branch-open' : ''}`} aria-label="Colecciones">
    {selectedWorkGroup && <div className="board-collection-breadcrumb" role="navigation" aria-label="Nivel de colección">
      <button type="button" {...postDropProps(null)} onClick={() => goTo(null)}>Colecciones</button>
      {path.map((crumb, index) => <span key={crumb.id}><em aria-hidden="true">›</em><button type="button" className={index === path.length - 1 ? 'active' : ''} {...postDropProps(crumb, { expand: false })} onClick={() => goTo(crumb.id)}>{crumb.name}</button></span>)}
    </div>}
    <div className="board-collection-tabs" onWheel={event => { if (event.deltaY && !event.shiftKey) event.currentTarget.scrollLeft += event.deltaY }}>
      {!selectedWorkGroup && <div className="board-collection-item board-collection-unassigned" {...postDropProps(null)}>
        <button type="button" className="board-collection-tab board-collection-chip" aria-current="page" onClick={() => goTo(null)}>
          <Inbox size={14} /><span className="board-collection-tab-name">Sin colección</span><em>{unassignedCount}</em>
        </button>
      </div>}
      {!selectedWorkGroup && activeGroups.length > 0 && <span className="board-collection-divider" aria-hidden="true" />}
      {selectedWorkGroup && <button type="button" className="board-collection-back board-collection-chip" aria-label="Volver al nivel anterior" title="Volver al nivel anterior" onClick={() => goTo(path.at(-2)?.id ?? null)}><ArrowLeft size={17} /></button>}
      {selectedWorkGroup && <span className="board-collection-divider" aria-hidden="true" />}
      {levelGroups.map(group => renderGroupItem(group, 'level'))}
      {draggingCollection?.parentId != null && <button type="button" className="board-collection-root-drop" onDragOver={event => { event.preventDefault(); event.currentTarget.classList.add('drag-over') }} onDragLeave={event => event.currentTarget.classList.remove('drag-over')} onDrop={event => { event.preventDefault(); event.currentTarget.classList.remove('drag-over'); const draggedId = event.dataTransfer.getData(workGroupDragType); if (draggedId) nestWorkGroup(draggedId, null); setDraggingCollectionId(null) }}>Mover al nivel superior</button>}
      <button type="button" className="board-collection-add board-collection-chip" onClick={() => openGroupForm(undefined, selectedWorkGroup)} aria-label={selectedWorkGroup ? 'Nueva subcolección' : 'Nueva colección'} title={selectedWorkGroup ? 'Nueva subcolección' : 'Nueva colección'}><Plus size={17} /></button>
      {draggingPosts && <span className="board-collection-drop-guidance" role="status">Soltá sobre una colección para añadir; en «Sin colección» o «Colecciones» para quitar</span>}
    </div>
    {branchRows.length > 0 && <div className="board-collection-branch" role="group" aria-label="Subcolecciones">
      {branchRows.map((row, depth) => <div className="board-collection-branch-row" key={row.parent.id} style={{ '--branch-depth': depth } as React.CSSProperties}>
        <span className="board-collection-branch-label"><CornerDownRight size={12} aria-hidden="true" />{row.parent.name}</span>
        {row.groups.map(group => renderGroupItem(group, 'branch'))}
      </div>)}
    </div>}
    <div className="board-collection-aside">
      {selectedWorkGroup && <div className="board-collection-header-actions">
        <button type="button" className="settings-button" onClick={() => onEditGroup(selectedWorkGroup)}><Pencil size={13} /> Editar</button>
        <button type="button" className="settings-button" onClick={() => openGroupForm(undefined, selectedWorkGroup)}><FolderPlus size={13} /> Nueva subcolección</button>
        <button type="button" className="settings-button" onClick={() => onGroupAction(selectedWorkGroup.archivedAt ? 'restore' : 'archive', selectedWorkGroup)}>{selectedWorkGroup.archivedAt ? <ArchiveRestore size={13} /> : <Archive size={13} />}{selectedWorkGroup.archivedAt ? 'Restaurar colección' : 'Archivar colección'}</button>
        <details className="board-collection-menu"><summary aria-label="Más opciones de la colección" title="Más opciones"><MoreHorizontal size={16} /></summary><div>
          {selectedWorkGroup.archivedAt && groupUncompressedMediaCount > 0 && <button type="button" onClick={() => setPendingMediaCompression(selectedWorkGroup.id, selectedWorkGroup.name, groupUncompressedMediaCount)}><Archive size={14} /> Comprimir medios</button>}
          {selectedWorkGroup.archivedAt && selectedWorkGroup.compressedMediaCount > 0 && <button type="button" onClick={restoreGroupMedia}><ArchiveRestore size={14} /> Restaurar {selectedWorkGroup.compressedMediaCount} medios</button>}
          <button type="button" className="danger-menu-item" onClick={() => onGroupAction('delete', selectedWorkGroup)}><Trash2 size={14} /> Borrar colección</button>
        </div></details>
      </div>}
      {trailing}
    </div>
    {collectionMenu && <BoardContextMenu x={collectionMenu.x} y={collectionMenu.y} label={`Opciones de ${collectionMenu.group.name}`}>
      <button type="button" role="menuitem" onClick={() => { setCollectionMenu(null); onEditGroup(collectionMenu.group) }}><Pencil size={14} />Editar colección</button>
      <button type="button" role="menuitem" onClick={() => { setCollectionMenu(null); openGroupForm(undefined, collectionMenu.group) }}><FolderPlus size={14} />Nueva subcolección</button>
      {collectionMenu.group.parentId && <button type="button" role="menuitem" onClick={() => { setCollectionMenu(null); nestWorkGroup(collectionMenu.group.id, null) }}><ArrowLeft size={14} />Sacar al nivel superior</button>}
      <div className="board-collection-color-options" role="group" aria-label="Color de colección">
        <span>Color de colección</span>
        <div>
          <button type="button" className="no-color" aria-label="Sin color" title="Sin color" aria-pressed={!collectionMenu.group.color} onClick={() => { onColor(collectionMenu.group, ''); setCollectionMenu(null) }}><Eraser size={13} /></button>
          {postColors.map(color => <button type="button" key={color.value} aria-label={color.label} title={color.label} aria-pressed={collectionMenu.group.color === color.value} style={{ backgroundColor: color.value }} onClick={() => { onColor(collectionMenu.group, color.value); setCollectionMenu(null) }} />)}
        </div>
      </div>
      <button type="button" role="menuitem" onClick={() => { setCollectionMenu(null); onGroupAction('archive', collectionMenu.group) }}><Archive size={14} />Archivar colección y subcolecciones</button>
      <button type="button" role="menuitem" className="danger-menu-item" onClick={() => { setCollectionMenu(null); onGroupAction('delete', collectionMenu.group) }}><Trash2 size={14} />Borrar colección…</button>
    </BoardContextMenu>}
  </nav>
}
