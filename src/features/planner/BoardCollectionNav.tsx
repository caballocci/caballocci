import { useEffect, useState, type DragEvent, type ReactNode } from 'react'
import { Archive, ArchiveRestore, ArrowLeft, Eraser, FolderOpen, FolderPlus, Inbox, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Post, WorkGroup } from '../../shared/types'
import { childrenByParent, groupPath, isDescendant, subtreePostIds } from '../../shared/work-group-tree'
import { postColors } from '../../shared/postColors'
import { BoardContextMenu } from './BoardContextMenu'
import { useWorkGroupNesting, applyCollectionDropClasses, clearCollectionDropClasses, collectionDropZoneX, type CollectionDropZone } from './useWorkGroupNesting'

const workGroupDragType = 'application/x-caballocci-work-group-id'

export function BoardCollectionNav({ groups, posts, selectedWorkGroup, setActiveWorkGroup, openGroupForm, onDropPosts, onEditGroup, onColor, onGroupAction, groupUncompressedMediaCount, setPendingMediaCompression, restoreGroupMedia, trailing }: {
  groups: WorkGroup[]
  posts: Post[]
  selectedWorkGroup: WorkGroup | null
  setActiveWorkGroup(id: string | null): void
  openGroupForm(group?: WorkGroup | null, parent?: WorkGroup | null): void
  onDropPosts(groupId: string, ids: string[]): void
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
  const { nestWorkGroup, reorderSibling } = useWorkGroupNesting()
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

  const activeGroups = groups.filter(group => !group.archivedAt)
  const path = groupPath(groups, selectedWorkGroup?.id ?? null)
  const children = childrenByParent(activeGroups)
  const levelGroups = children.get(selectedWorkGroup?.id ?? null) ?? []
  const draggingCollection = draggingCollectionId ? groups.find(group => group.id === draggingCollectionId) ?? null : null
  const subtreeSets = new Map(activeGroups.map(group => [group.id, new Set(subtreePostIds(activeGroups, group.id))]))
  const countPostsIn = (group: WorkGroup) => posts.filter(post => post.status !== 'archived' && subtreeSets.get(group.id)?.has(post.id)).length
  const unassignedCount = posts.filter(post => post.status !== 'archived' && !activeGroups.some(group => group.postIds.includes(post.id))).length
  const collectionDropProps = (group: WorkGroup) => ({
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      const types = Array.from(event.dataTransfer.types)
      const isPostDrag = types.includes('application/x-caballocci-post-ids')
      if (isPostDrag) {
        event.preventDefault()
        event.currentTarget.classList.add('drag-over', 'post-drag-over')
        setDraggingPosts(true)
        return
      }
      if (!draggingCollectionId) return
      const zone = collectionDropZoneX(event.clientX, event.currentTarget)
      if (zone === 'nest' && isDescendant(groups, draggingCollectionId, group.id)) { applyCollectionDropClasses(event.currentTarget, null); return }
      event.preventDefault()
      applyCollectionDropClasses(event.currentTarget, zone)
      event.currentTarget.dataset.dropZone = zone
    },
    onDragLeave: (event: DragEvent<HTMLDivElement>) => {
      clearCollectionDropClasses(event.currentTarget)
      event.currentTarget.classList.remove('drag-over', 'post-drag-over')
      delete event.currentTarget.dataset.dropZone
      if (event.relatedTarget instanceof Node && event.currentTarget.parentElement?.contains(event.relatedTarget)) return
      setDraggingPosts(false)
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault(); clearCollectionDropClasses(event.currentTarget); setDraggingPosts(false)
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
      const raw = event.dataTransfer.getData('application/x-caballocci-post-ids')
      let ids: string[] = []
      try { ids = JSON.parse(raw) as string[] } catch { const singleId = event.dataTransfer.getData('text/plain'); if (singleId) ids = [singleId] }
      onDropPosts(group.id, ids)
    },
  })
  return <nav className="board-collection-nav" aria-label="Colecciones">
    {selectedWorkGroup && <div className="board-collection-breadcrumb" role="navigation" aria-label="Nivel de colección">
      <button type="button" onClick={() => setActiveWorkGroup(null)}>Colecciones</button>
      {path.map((crumb, index) => <span key={crumb.id}><em aria-hidden="true">›</em><button type="button" className={index === path.length - 1 ? 'active' : ''} onClick={() => setActiveWorkGroup(crumb.id)}>{crumb.name}</button></span>)}
    </div>}
    <div className="board-collection-tabs" onWheel={event => { if (event.deltaY && !event.shiftKey) event.currentTarget.scrollLeft += event.deltaY }}>
      {!selectedWorkGroup && <button type="button" className="board-collection-tab" aria-current="page" onClick={() => setActiveWorkGroup(null)}>
        <Inbox size={14} /><span className="board-collection-tab-name">Sin colección</span><em>{unassignedCount}</em>
      </button>}
      {!selectedWorkGroup && activeGroups.length > 0 && <span className="board-collection-divider" aria-hidden="true" />}
      {selectedWorkGroup && <button type="button" className="board-collection-back board-collection-chip" aria-label="Volver al nivel anterior" title="Volver al nivel anterior" onClick={() => setActiveWorkGroup(path.at(-2)?.id ?? null)}><ArrowLeft size={17} /></button>}
      {selectedWorkGroup && <span className="board-collection-divider" aria-hidden="true" />}
      {levelGroups.map(group => {
        const count = countPostsIn(group)
        return <div className="board-collection-item" key={group.id} {...collectionDropProps(group)}>
          <button type="button" draggable className={`board-collection-tab board-collection-chip${group.color ? ' has-custom-color' : ''}`} aria-current={selectedWorkGroup?.id === group.id ? 'page' : undefined} onClick={() => setActiveWorkGroup(group.id)} onDragStart={event => { event.dataTransfer.setData(workGroupDragType, group.id); setDraggingCollectionId(group.id) }} onDragEnd={() => setDraggingCollectionId(null)} style={{ '--collection-color': group.color } as React.CSSProperties} title={`${group.name} · ${count} publicación(es) incluidas subcolecciones`}>
            <FolderOpen size={14} /><span className="board-collection-tab-name">{group.name}</span><em>{count}</em>
          </button>
          <button type="button" className="board-collection-item-menu" aria-label={`Opciones de ${group.name}`} onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect()
            setCollectionMenu({ group, x: rect.right, y: rect.bottom + 4 })
          }}><MoreHorizontal size={14} /></button>
        </div>
      })}
      {draggingCollection?.parentId != null && <button type="button" className="board-collection-root-drop" onDragOver={event => { event.preventDefault(); event.currentTarget.classList.add('drag-over') }} onDragLeave={event => event.currentTarget.classList.remove('drag-over')} onDrop={event => { event.preventDefault(); event.currentTarget.classList.remove('drag-over'); const draggedId = event.dataTransfer.getData(workGroupDragType); if (draggedId) nestWorkGroup(draggedId, null); setDraggingCollectionId(null) }}>Mover al nivel superior</button>}
      <button type="button" className="board-collection-add board-collection-chip" onClick={() => openGroupForm(undefined, selectedWorkGroup)} aria-label={selectedWorkGroup ? 'Nueva subcolección' : 'Nueva colección'} title={selectedWorkGroup ? 'Nueva subcolección' : 'Nueva colección'}><Plus size={17} /></button>
      {draggingPosts && <span className="board-collection-drop-guidance" role="status">Soltá una publicación sobre una colección para añadirla</span>}
    </div>
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
