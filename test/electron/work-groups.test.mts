import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { Database } from 'sql.js'
import { freshDb } from '../helpers/database.mts'

const require = createRequire(import.meta.url)
const { WorkGroupsRepository } = require('../../dist-electron/database/work-groups-repository.js') as {
  WorkGroupsRepository: new (db: Database, persist: () => void) => {
    list(): Array<Record<string, unknown>>
    save(input: Record<string, unknown>): Record<string, unknown>
    setPosts(id: string, postIds: string[]): Record<string, unknown>
    setArchived(id: string, archived: boolean): Record<string, unknown>
    remove(id: string): void
  }
}

test('persiste la pertenencia muchos a muchos a grupos de trabajo y archiva sin depender del estado del post', async t => {
  const db = await freshDb(t)

  db.run("INSERT INTO posts (id,title,status,created_at,updated_at) VALUES ('post-a','A','draft','now','now'),('post-b','B','approved','now','now')")
  const repository = new WorkGroupsRepository(db, () => {})
  const campaign = repository.save({ name: 'Campaña', description: '', color: '#e76042' })
  const series = repository.save({ name: 'Serie', description: '' })
  assert.equal(campaign.color, '#e76042')
  assert.equal(series.color, '')

  repository.setPosts(String(campaign.id), ['post-a', 'post-b'])
  repository.setPosts(String(series.id), ['post-a'])
  const archived = repository.setArchived(String(campaign.id), true)

  assert.deepEqual(archived.post_ids, ['post-a', 'post-b'])
  assert.equal(archived.color, '#e76042')
  assert.ok(archived.archived_at)
  assert.deepEqual(repository.list().find(group => group.id === series.id)?.post_ids, ['post-a'])
  assert.deepEqual(db.exec('SELECT id,status FROM posts ORDER BY id')[0].values, [['post-a', 'draft'], ['post-b', 'approved']])

  const restored = repository.setArchived(String(campaign.id), false)
  assert.equal(restored.archived_at, null)
  assert.throws(() => repository.setPosts(String(campaign.id), ['missing-post']), /No se encontró una de las publicaciones/)
  assert.deepEqual(repository.list().find(group => group.id === campaign.id)?.post_ids, ['post-a', 'post-b'])

  repository.remove(String(campaign.id))
  assert.equal(repository.list().some(group => group.id === campaign.id), false)
  assert.deepEqual(db.exec('SELECT id,status FROM posts ORDER BY id')[0].values, [['post-a', 'draft'], ['post-b', 'approved']])
  assert.deepEqual(repository.list().find(group => group.id === series.id)?.post_ids, ['post-a'])
})

test('grupos anidados: archivar afecta al subárbol, borrar sube a los hijos y se rechazan ciclos', async t => {
  const db = await freshDb(t)

  db.run("INSERT INTO posts (id,title,status,created_at,updated_at) VALUES ('post-a','A','draft','now','now')")
  const repository = new WorkGroupsRepository(db, () => {})
  const parent = repository.save({ name: 'Verano', description: '', space: '' })
  const child = repository.save({ name: 'Reels', description: '', parentId: parent.id })
  const grandchild = repository.save({ name: 'Versión B', description: '', parentId: child.id })
  assert.equal(child.parent_id, parent.id)
  assert.equal(grandchild.parent_id, child.id)
  assert.equal(repository.list().find(group => group.id === grandchild.id)?.parent_id, child.id)

  // Nesting a collection under one of its descendants would create a cycle.
  assert.throws(() => repository.save({ id: String(parent.id), name: 'Verano', description: '', parentId: grandchild.id }), /descendiente/)
  assert.throws(() => repository.save({ id: String(child.id), name: 'Reels', description: '', parentId: child.id }), /sí misma/)
  assert.throws(() => repository.save({ id: String(child.id), name: 'Reels', description: '', parentId: 'missing-collection' }), /No se encontró la colección de destino/)

  // Archiving a collection archives its whole subtree; restoring lifts it back.
  repository.setPosts(String(grandchild.id), ['post-a'])
  repository.setArchived(String(child.id), true)
  let listed = repository.list()
  assert.ok(listed.find(group => group.id === child.id)?.archived_at)
  assert.ok(listed.find(group => group.id === grandchild.id)?.archived_at)
  assert.equal(listed.find(group => group.id === parent.id)?.archived_at, null)
  repository.setArchived(String(child.id), false)
  listed = repository.list()
  assert.equal(listed.find(group => group.id === child.id)?.archived_at, null)
  assert.equal(listed.find(group => group.id === grandchild.id)?.archived_at, null)

  // Deleting a middle collection moves its children up one level; posts are kept.
  repository.remove(String(child.id))
  listed = repository.list()
  assert.equal(listed.some(group => group.id === child.id), false)
  assert.equal(listed.find(group => group.id === grandchild.id)?.parent_id, parent.id)
  assert.deepEqual(listed.find(group => group.id === grandchild.id)?.post_ids, ['post-a'])

  // A collection cannot be nested inside one that owns another space.
  const spaceA = repository.save({ name: 'Espacio A', description: '', space: 'Espacio A' })
  const spaceB = repository.save({ name: 'Espacio B', description: '', space: 'Espacio B' })
  assert.throws(() => repository.save({ id: String(spaceB.id), name: 'Espacio B', description: '', space: 'Espacio B', parentId: spaceA.id }), /otro espacio/)

  // A collection without a space inherits the parent's space.
  const inheriting = repository.save({ name: 'Hereda', description: '', space: '', parentId: spaceA.id })
  assert.equal(inheriting.space, 'Espacio A')

  // Re-saving without parentId preserves the existing nesting.
  const renamed = repository.save({ id: String(inheriting.id), name: 'Hereda renombrada', description: '', space: 'Espacio A' })
  assert.equal(renamed.parent_id, spaceA.id)
})
