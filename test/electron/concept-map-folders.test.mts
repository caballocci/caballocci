import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'

const require = createRequire(import.meta.url)
const { runMigrations } = require('../../dist-electron/database/migration-runner.js') as {
  runMigrations(db: Database, existedAtStartup: boolean, backup: () => void): void
}
const { ConceptLinksRepository } = require('../../dist-electron/database/concept-links-repository.js') as {
  ConceptLinksRepository: new (db: Database, persist: () => void) => {
    list(): { nodes: Array<Record<string, unknown>>; links: Array<Record<string, unknown>>; folders: Array<Record<string, unknown>> }
    saveNode(input: Record<string, unknown>): Record<string, unknown>
    saveFolder(input: Record<string, unknown>): Record<string, unknown>
    removeFolder(id: string): { parentId: string | null }
  }
}

test('concept map folders carry a space and nest space folders only under global or matching folders', async t => {
  const SQL = await initSqlJs({ locateFile: file => path.resolve('node_modules/sql.js/dist', file) })
  const db = new SQL.Database()
  t.after(() => db.close())
  runMigrations(db, false, () => assert.fail('A new database must not require a backup'))

  assert.ok(Number(db.exec('PRAGMA user_version')[0].values[0][0]) >= 35, 'concept map folder migrations are applied')
  const columns = db.exec('PRAGMA table_info(concept_map_folders)')[0].values.map(row => String(row[1]))
  assert.ok(columns.includes('space'))

  const repository = new ConceptLinksRepository(db, () => {})
  const globalFolder = repository.saveFolder({ name: 'General', space: null })
  const campaign = repository.saveFolder({ name: 'Campaña X', parentId: globalFolder.id, space: 'X' })
  const subfolder = repository.saveFolder({ name: 'Guiones', parentId: campaign.id, space: 'X' })
  const other = repository.saveFolder({ name: 'Campaña Y', parentId: globalFolder.id, space: 'Y' })

  assert.equal(globalFolder.space, null)
  assert.equal(campaign.space, 'X')
  assert.equal(subfolder.space, 'X')
  assert.equal(other.space, 'Y')

  // Una global no puede colgar de una carpeta de espacio, ni una carpeta de otro espacio.
  assert.throws(() => repository.saveFolder({ name: 'Global anidada', parentId: campaign.id, space: null }), /mismo espacio/)
  assert.throws(() => repository.saveFolder({ name: 'Y dentro de X', parentId: campaign.id, space: 'Y' }), /mismo espacio/)
  assert.throws(() => repository.saveFolder({ id: campaign.id, name: 'Campaña X', parentId: campaign.id, space: 'X' }), /propia carpeta padre/)

  const node = repository.saveNode({ folderId: campaign.id, kind: 'idea', sourceId: null, title: 'Idea X', body: '', x: 0, y: 0 })
  const removed = repository.removeFolder(String(campaign.id))
  assert.deepEqual(removed, { parentId: globalFolder.id })
  const after = repository.list()
  assert.equal(after.nodes.find(item => item.id === node.id)?.folder_id, globalFolder.id)
  assert.equal(after.folders.find(item => item.id === subfolder.id)?.parent_id, globalFolder.id)
  assert.equal(after.folders.find(item => item.id === subfolder.id)?.space, 'X')
  assert.equal(after.folders.some(item => item.id === campaign.id), false)
})
