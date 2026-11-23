import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Database } from 'sql.js'
import { freshDb } from '../helpers/database.mts'

const require = createRequire(import.meta.url)
const { MediaCompressionRepository } = require('../../dist-electron/database/media-compression-repository.js') as {
  MediaCompressionRepository: new (db: Database, persist: () => void) => {
    compress(
      targetType: 'group' | 'post',
      targetId: string,
      candidates: Array<{ id: string; name: string; kind: string; path: string; size: number; mode: string }>,
      references: Map<string, Set<string>>,
      includedPostIds: Set<string>,
      archiveDirectory: string,
      managedRoot: string,
    ): Promise<{ compressed: number; skipped: number; releasedBytes: number }>
    restore(assetIds: string[], managedRoot: string): { restored: number }
    state(assetId: string): { archivePath: string; entryName: string } | undefined
  }
}

test('comprime el multimedia gestionado no compartido en un ZIP interno y restaura el archivo original', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caballocci-compression-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const db = await freshDb(t)

  const originalPath = path.join(root, 'managed', 'Spaces', 'Campaign', 'Posts', 'post-a', 'photo.png')
  const archiveDirectory = path.join(root, 'managed', 'Media', 'Archives')
  const originalBytes = Buffer.alloc(100_000, 'x')
  fs.mkdirSync(path.dirname(originalPath), { recursive: true })
  fs.writeFileSync(originalPath, originalBytes)
  db.run("INSERT INTO posts (id,title,status,created_at,updated_at) VALUES ('post-a','A','archived','now','now')")
  db.run('INSERT INTO media_assets (id,name,path,kind,size,mode,created_at) VALUES (?,?,?,?,?,?,?)', [
    'asset-a', 'photo.png', originalPath, 'image', originalBytes.length, 'copy', 'now',
  ])
  const repository = new MediaCompressionRepository(db, () => {})
  const candidate = { id: 'asset-a', name: 'photo.png', kind: 'image', path: originalPath, size: originalBytes.length, mode: 'copy' }

  const compressed = await repository.compress('post', 'post-a', [candidate], new Map([['asset-a', new Set(['post-a'])]]), new Set(['post-a']), archiveDirectory, path.join(root, 'managed'))
  assert.equal(compressed.compressed, 1)
  assert.ok(compressed.releasedBytes > 0)
  assert.equal(fs.existsSync(originalPath), false)
  const state = repository.state('asset-a')
  assert.ok(state)
  assert.ok(fs.existsSync(state.archivePath))

  const restored = repository.restore(['asset-a'], path.join(root, 'managed'))
  assert.equal(restored.restored, 1)
  assert.deepEqual(fs.readFileSync(originalPath), originalBytes)
  assert.equal(repository.state('asset-a'), undefined)
  assert.equal(fs.existsSync(state.archivePath), false)
})

test('no borra multimedia compartido ni referenciado externamente durante la compresión', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caballocci-compression-safety-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const db = await freshDb(t)

  const managedPath = path.join(root, 'managed', 'shared.png')
  const externalPath = path.join(root, 'external', 'reference.png')
  fs.mkdirSync(path.dirname(managedPath), { recursive: true })
  fs.mkdirSync(path.dirname(externalPath), { recursive: true })
  fs.writeFileSync(managedPath, 'shared')
  fs.writeFileSync(externalPath, 'external')
  const repository = new MediaCompressionRepository(db, () => {})
  const candidates = [
    { id: 'shared', name: 'shared.png', kind: 'image', path: managedPath, size: 6, mode: 'copy' },
    { id: 'external', name: 'reference.png', kind: 'image', path: externalPath, size: 8, mode: 'reference' },
  ]
  const references = new Map([
    ['shared', new Set(['post-a', 'post-b'])],
    ['external', new Set(['post-a'])],
  ])
  const result = await repository.compress('group', 'group-a', candidates, references, new Set(['post-a']), path.join(root, 'managed', 'Archives'), path.join(root, 'managed'))

  assert.deepEqual(result, { compressed: 0, skipped: 2, releasedBytes: 0 })
  assert.equal(fs.readFileSync(managedPath, 'utf8'), 'shared')
  assert.equal(fs.readFileSync(externalPath, 'utf8'), 'external')
})
