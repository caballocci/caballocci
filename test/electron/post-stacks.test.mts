import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import initSqlJs from 'sql.js'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { runMigrations } = require('../../dist-electron/database/migration-runner.js') as {
  runMigrations(db: import('sql.js').Database, existedAtStartup: boolean, backup: () => void): void
}
const { PostsRepository } = require('../../dist-electron/database/posts-repository.js') as {
  PostsRepository: new (db: import('sql.js').Database, persist: () => void, event: () => void) => {
    save(input: Record<string, unknown>, ideaLookup: () => undefined): Record<string, unknown>
    get(id: string): Record<string, unknown> | undefined
    list(): Array<Record<string, unknown>>
    reassignProject(fromProject: string, toProject: string, options?: { keepStacks?: boolean }): void
  }
}

test('post stacks round-trip through migration v34 and PostsRepository', async t => {
  const SQL = await initSqlJs({ locateFile: file => path.resolve('node_modules/sql.js/dist', file) })
  const db = new SQL.Database()
  t.after(() => db.close())
  runMigrations(db, false, () => assert.fail('A new database must not require a backup'))

  const columns = db.exec('PRAGMA table_info(posts)')[0].values.map(row => String(row[1]))
  assert.ok(columns.includes('stack_id'), 'posts.stack_id exists after migrations')
  assert.ok(columns.includes('stack_position'), 'posts.stack_position exists after migrations')
  const userVersion = Number(db.exec('PRAGMA user_version')[0].values[0][0])
  assert.equal(userVersion, 34)

  const repository = new PostsRepository(db, () => {}, () => {})
  const noIdea = () => undefined

  repository.save({ id: 'post-a', title: 'Carrusel portada', status: 'draft', project: 'Mi contenido', color: '#ff6b4a', stackId: 'stack-1', stackPosition: 0 }, noIdea)
  repository.save({ id: 'post-b', title: 'Carrusel slide 2', status: 'draft', project: 'Mi contenido', color: '#ff6b4a', stackId: 'stack-1', stackPosition: 1 }, noIdea)
  repository.save({ id: 'post-c', title: 'Suelta', status: 'idea', project: 'Mi contenido', color: '#ff6b4a' }, noIdea)

  assert.equal(repository.get('post-a')?.stack_id, 'stack-1')
  assert.equal(repository.get('post-a')?.stack_position, 0)
  assert.equal(repository.get('post-b')?.stack_position, 1)
  assert.equal(repository.get('post-c')?.stack_id, null)
  assert.equal(repository.get('post-c')?.stack_position, null)

  const listed = repository.list()
  const byId = new Map(listed.map(row => [String(row.id), row]))
  assert.equal(byId.get('post-a')?.stack_id, 'stack-1')
  assert.equal(byId.get('post-b')?.stack_id, 'stack-1')
  assert.equal(byId.get('post-c')?.stack_id, null)

  // Una edición ajena a la pila conserva la membresía.
  repository.save({ id: 'post-a', title: 'Carrusel portada (editado)', project: 'Mi contenido', color: '#ff6b4a', stackId: 'stack-1', stackPosition: 0 }, noIdea)
  assert.equal(repository.get('post-a')?.stack_id, 'stack-1')
  assert.equal(repository.get('post-a')?.title, 'Carrusel portada (editado)')

  // renombrar el espacio conserva las pilas (no es una salida del espacio)
  repository.reassignProject('Mi contenido', 'Campaña', { keepStacks: true })
  assert.equal(repository.get('post-a')?.stack_id, 'stack-1')

  // mover a otro espacio las deshace (salida del espacio, regla 2)
  repository.reassignProject('Campaña', 'Otro espacio', { keepStacks: false })
  assert.equal(repository.get('post-a')?.stack_id, null)
  assert.equal(repository.get('post-a')?.stack_position, null)
  assert.equal(repository.get('post-b')?.stack_id, null)
})
