import type { WorkGroup } from '../../shared/types'
import { groupPath } from '../../shared/work-group-tree.ts'

/**
 * Cadena de colecciones que hay que abrir para llegar a `groupId` desde el nivel actual.
 * Devuelve los ids desde el hijo directo de `navRootId` hasta `groupId`, incluido.
 * Un resultado vacío significa "no hay nada que abrir": o `groupId` es el nivel actual,
 * o no cuelga de él.
 */
export function branchTrail(groups: WorkGroup[], navRootId: string | null, groupId: string): string[] {
  const ids = groupPath(groups, groupId).map(group => group.id)
  if (!navRootId) return ids
  const rootIndex = ids.lastIndexOf(navRootId)
  return rootIndex === -1 ? [] : ids.slice(rootIndex + 1)
}

export type CollectionDetach = { groupId: string; postIds: string[] }

/**
 * Plan para dejar publicaciones "sin colección": cada colección activa que las contenga
 * recibe la lista resultante. Las colecciones archivadas no se tocan.
 */
export function planCollectionDetach(groups: WorkGroup[], postIds: Iterable<string>): CollectionDetach[] {
  const ids = new Set(postIds)
  if (!ids.size) return []
  return groups
    .filter(group => !group.archivedAt && group.postIds.some(id => ids.has(id)))
    .map(group => ({ groupId: group.id, postIds: group.postIds.filter(id => !ids.has(id)) }))
}
