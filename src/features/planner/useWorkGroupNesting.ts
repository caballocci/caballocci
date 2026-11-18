import { useCallback } from 'react'
import { usePlanner } from '../../app/store'
import { runWithErrorReporting } from '../../app/errors'
import { useWorkGroupOrder } from './useWorkGroupOrder'
import { isDescendant } from '../../shared/work-group-tree'

/** Acciones sobre el árbol de colecciones: anidar, reordenar como hermano y sacar a la raíz. */
export function useWorkGroupNesting() {
  const { orderedGroups, moveGroup } = useWorkGroupOrder()

  const nestWorkGroup = useCallback((draggedId: string, targetParentId: string | null) => {
    void runWithErrorReporting(async () => {
      const state = usePlanner.getState()
      const dragged = state.workGroups.find(group => group.id === draggedId)
      if (!dragged || (dragged.parentId ?? null) === targetParentId) return
      if (targetParentId && isDescendant(state.workGroups, draggedId, targetParentId)) throw new Error('No se puede anidar una colección dentro de una descendiente suya.')
      await state.saveWorkGroup({ ...dragged, parentId: targetParentId })
    }, 'No se pudo mover la colección')
  }, [])

  const reorderSibling = useCallback((draggedId: string, targetId: string, position: 'before' | 'after') => {
    if (draggedId === targetId) return
    void runWithErrorReporting(async () => {
      const state = usePlanner.getState()
      const dragged = state.workGroups.find(group => group.id === draggedId)
      const target = state.workGroups.find(group => group.id === targetId)
      if (!dragged || !target) return
      const targetParent = target.parentId ?? null
      if ((dragged.parentId ?? null) !== targetParent) await state.saveWorkGroup({ ...dragged, parentId: targetParent })
      const current = usePlanner.getState()
      const siblings = orderedGroups(current.workGroups.filter(group => !group.archivedAt && (!current.activeSpace || group.space === current.activeSpace) && (group.parentId ?? null) === targetParent))
      moveGroup(siblings, draggedId, targetId, position)
    }, 'No se pudo mover la colección')
  }, [moveGroup, orderedGroups])

  return { nestWorkGroup, reorderSibling }
}

/** Zona de destino de un drop sobre una colección: bordes = reordenar como hermano, centro = anidar dentro. */
export type CollectionDropZone = 'before' | 'after' | 'nest'
export function collectionDropZone(clientY: number, element: HTMLElement): CollectionDropZone {
  const rect = element.getBoundingClientRect()
  const ratio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5
  return ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'nest'
}
/** Variante horizontal: bordes izquierdo/derecho = reordenar, centro = anidar. */
export function collectionDropZoneX(clientX: number, element: HTMLElement): CollectionDropZone {
  const rect = element.getBoundingClientRect()
  const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5
  return ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'nest'
}
export function applyCollectionDropClasses(element: HTMLElement, zone: CollectionDropZone | null) {
  element.classList.toggle('drop-before', zone === 'before')
  element.classList.toggle('drop-after', zone === 'after')
  element.classList.toggle('drag-over', zone === 'nest')
}
export function clearCollectionDropClasses(element: HTMLElement) {
  applyCollectionDropClasses(element, null)
  element.classList.remove('post-drag-over')
}
