import type { Database } from 'sql.js'
import { firstRow, rows, sqlString } from './sql'
import type { Row } from './types'

export class WorkGroupsRepository {
  private readonly db: Database
  private readonly persist: () => void

  constructor(db: Database, persist: () => void) {
    this.db = db
    this.persist = persist
  }

  list(): Row[] {
    const members = new Map<string, string[]>()
    rows(this.db, 'SELECT group_id,post_id FROM work_group_posts ORDER BY added_at,post_id').forEach(row => {
      const id = String(row.group_id)
      members.set(id, [...(members.get(id) || []), String(row.post_id)])
    })
    return rows(this.db, 'SELECT * FROM work_groups ORDER BY archived_at IS NOT NULL,created_at DESC,id DESC')
      .map(group => ({ ...group, parent_id: group.parent_id ? String(group.parent_id) : null, post_ids: members.get(String(group.id)) || [] }))
  }

  save(input: Row): Row {
    const now = new Date().toISOString()
    const id = String(input.id || crypto.randomUUID())
    const existing = firstRow(this.db, 'SELECT * FROM work_groups WHERE id = ' + sqlString(id))
    const parentId = this.resolveParentId(id, input.parentId, existing)
    const parent = parentId ? firstRow(this.db, 'SELECT * FROM work_groups WHERE id = ' + sqlString(parentId)) : undefined
    let space = String(input.space || '')
    if (parent) {
      const parentSpace = String(parent.space || '')
      if (!space && parentSpace) space = parentSpace
      else if (space && parentSpace && space !== parentSpace) throw new Error(`La colección de destino pertenece a otro espacio (“${parentSpace}”).`)
    }
    const archivedAt = typeof existing?.archived_at === 'string' ? existing.archived_at : null
    const createdAt = typeof existing?.created_at === 'string' ? existing.created_at : now
    this.db.run(
      `INSERT INTO work_groups (id,name,description,space,color,archived_at,created_at,updated_at,parent_id)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name,description = excluded.description,space = excluded.space,color = excluded.color,parent_id = excluded.parent_id,updated_at = excluded.updated_at`,
      [id, String(input.name).trim(), String(input.description || '').trim(), space, String(input.color ?? existing?.color ?? ''), archivedAt, createdAt, now, parentId],
    )
    this.persist()
    return this.get(id)!
  }

  setPosts(id: string, postIds: string[]): Row {
    if (!firstRow(this.db, 'SELECT id FROM work_groups WHERE id = ' + sqlString(id))) throw new Error('No se encontró el grupo.')
    const validPosts = new Set(rows(this.db, 'SELECT id FROM posts').map(post => String(post.id)))
    const missing = postIds.find(postId => !validPosts.has(postId))
    if (missing) throw new Error('No se encontró una de las publicaciones del grupo.')
    const now = new Date().toISOString()
    this.db.run('BEGIN TRANSACTION')
    try {
      this.db.run('DELETE FROM work_group_posts WHERE group_id = ?', [id])
      postIds.forEach(postId => this.db.run(
        'INSERT INTO work_group_posts (group_id,post_id,added_at) VALUES (?,?,?)',
        [id, postId, now],
      ))
      this.db.run('COMMIT')
      this.persist()
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
    return this.get(id)!
  }

  /** Archiva o restaura la colección y todo su subárbol. */
  setArchived(id: string, archived: boolean): Row {
    if (!firstRow(this.db, 'SELECT id FROM work_groups WHERE id = ' + sqlString(id))) throw new Error('No se encontró el grupo.')
    const ids = this.subtreeIds(id)
    const now = archived ? new Date().toISOString() : null
    const updatedAt = new Date().toISOString()
    this.db.run('BEGIN TRANSACTION')
    try {
      this.db.run(`UPDATE work_groups SET archived_at = ?,updated_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`, [now, updatedAt, ...ids])
      this.db.run('COMMIT')
      this.persist()
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
    return this.get(id)!
  }

  /** Elimina la colección; sus subcolecciones suben un nivel y sus publicaciones se conservan. */
  remove(id: string) {
    const target = firstRow(this.db, 'SELECT id,parent_id FROM work_groups WHERE id = ' + sqlString(id))
    if (!target) throw new Error('No se encontró la colección.')
    const parentId = target.parent_id ? String(target.parent_id) : null
    const now = new Date().toISOString()
    this.db.run('BEGIN TRANSACTION')
    try {
      this.db.run('UPDATE work_groups SET parent_id = ?,updated_at = ? WHERE parent_id = ?', [parentId, now, id])
      this.db.run('DELETE FROM work_group_posts WHERE group_id = ?', [id])
      this.db.run('DELETE FROM work_groups WHERE id = ?', [id])
      this.db.run('COMMIT')
      this.persist()
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
  }

  private resolveParentId(id: string, rawParentId: unknown, existing: Row | undefined): string | null {
    if (rawParentId === undefined) return existing?.parent_id ? String(existing.parent_id) : null
    const parentId = rawParentId == null || String(rawParentId).trim() === '' ? null : String(rawParentId).trim()
    if (!parentId) return null
    if (parentId === id) throw new Error('Una colección no puede contenerse a sí misma.')
    if (!firstRow(this.db, 'SELECT id FROM work_groups WHERE id = ' + sqlString(parentId))) throw new Error('No se encontró la colección de destino.')
    // Walk up from the proposed parent; reaching this node means the move would create a cycle.
    let current = firstRow(this.db, 'SELECT id,parent_id FROM work_groups WHERE id = ' + sqlString(parentId))
    const seen = new Set<string>()
    while (current) {
      const currentId = String(current.id)
      if (currentId === id) throw new Error('No se puede anidar una colección dentro de una descendiente suya.')
      if (seen.has(currentId)) break
      seen.add(currentId)
      const nextParentId = current.parent_id ? String(current.parent_id) : null
      current = nextParentId ? firstRow(this.db, 'SELECT id,parent_id FROM work_groups WHERE id = ' + sqlString(nextParentId)) : undefined
    }
    return parentId
  }

  private subtreeIds(rootId: string): string[] {
    const all = rows(this.db, 'SELECT id,parent_id FROM work_groups')
    const children = new Map<string, string[]>()
    for (const row of all) {
      const parent = row.parent_id ? String(row.parent_id) : null
      if (parent) children.set(parent, [...(children.get(parent) || []), String(row.id)])
    }
    const result: string[] = []
    const walk = (id: string) => {
      if (result.includes(id)) return
      result.push(id)
      for (const child of children.get(id) || []) walk(child)
    }
    walk(rootId)
    return result
  }

  private get(id: string): Row | undefined {
    const group = firstRow(this.db, 'SELECT * FROM work_groups WHERE id = ' + sqlString(id))
    if (!group) return undefined
    return {
      ...group,
      parent_id: group.parent_id ? String(group.parent_id) : null,
      post_ids:       rows(this.db, 'SELECT post_id FROM work_group_posts WHERE group_id = ' + sqlString(id) + ' ORDER BY added_at,post_id')
        .map(row => String(row.post_id)),
    }
  }
}
