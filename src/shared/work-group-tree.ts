import type { WorkGroup } from './types'

/** Mapa parentId → hijos, preservando el orden del array de entrada. Los padres inexistentes se tratan como raíces. */
export function childrenByParent(groups: WorkGroup[]): Map<string | null, WorkGroup[]> {
  const ids = new Set(groups.map(group => group.id))
  const children = new Map<string | null, WorkGroup[]>()
  for (const group of groups) {
    const key = group.parentId && ids.has(group.parentId) ? group.parentId : null
    children.set(key, [...(children.get(key) ?? []), group])
  }
  return children
}

/** Ruta desde la raíz hasta `id` (incluido). Tolera ciclos y padres inexistentes. */
export function groupPath(groups: WorkGroup[], id: string | null): WorkGroup[] {
  if (!id) return []
  const byId = new Map(groups.map(group => [group.id, group]))
  const path: WorkGroup[] = []
  const seen = new Set<string>()
  let current = byId.get(id)
  while (current && !seen.has(current.id)) {
    path.unshift(current)
    seen.add(current.id)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return path
}

/** Ids de la colección y de todas sus descendientes (el propio id incluido). */
export function subtreeGroupIds(groups: WorkGroup[], rootId: string): Set<string> {
  const children = childrenByParent(groups)
  const result = new Set<string>()
  const walk = (id: string) => {
    if (result.has(id)) return
    result.add(id)
    for (const child of children.get(id) ?? []) walk(child.id)
  }
  walk(rootId)
  return result
}

/** Ids de publicaciones de la colección y su subárbol: sin duplicados, raíz primero, hijos en orden estable. */
export function subtreePostIds(groups: WorkGroup[], rootId: string): string[] {
  const byId = new Map(groups.map(group => [group.id, group]))
  const children = childrenByParent(groups)
  const result: string[] = []
  const seenPosts = new Set<string>()
  const walked = new Set<string>()
  const walk = (id: string) => {
    if (walked.has(id)) return
    walked.add(id)
    const group = byId.get(id)
    if (group) for (const postId of group.postIds) {
      if (!seenPosts.has(postId)) { seenPosts.add(postId); result.push(postId) }
    }
    for (const child of children.get(id) ?? []) walk(child.id)
  }
  walk(rootId)
  return result
}

/** ¿`id` cuelga de `ancestorId` (o es el mismo)? Útil para validar destinos de anidado en la UI. */
export function isDescendant(groups: WorkGroup[], ancestorId: string, id: string): boolean {
  return subtreeGroupIds(groups, ancestorId).has(id)
}
