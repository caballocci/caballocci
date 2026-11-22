import assert from 'node:assert/strict'
import test from 'node:test'
import type { Database } from 'sql.js'
import { dbAtVersion, emptyDb, freshDb, latestVersion, runMigrations } from '../helpers/database.mts'

function schemaVersion(db: Database): number {
  return Number(db.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0)
}

function hasTable(db: Database, name: string): boolean {
  return db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`).length > 0
}

function capture(run: () => void): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  assert.fail('Se esperaba un error')
}

test('una base nueva aplica todas las migraciones sin pedir backup', async t => {
  const db = await emptyDb(t)
  let backups = 0

  runMigrations(db, false, () => { backups += 1 })

  assert.equal(backups, 0)
  assert.equal(schemaVersion(db), latestVersion)
  assert.equal(hasTable(db, 'posts'), true)
  assert.equal(hasTable(db, 'mobile_usage_events'), true)
})

test('una base existente con migraciones pendientes hace un backup y conserva sus datos', async t => {
  const db = await dbAtVersion(t, 27)
  db.run("INSERT INTO mobile_usage_events VALUES ('old','post-a','instagram','used','2026-10-24T05:30:00.000Z','device-a',1,'now')")
  let backups = 0

  runMigrations(db, true, () => { backups += 1 })

  assert.equal(backups, 1)
  assert.equal(schemaVersion(db), latestVersion)
  assert.equal(db.exec("SELECT action FROM mobile_usage_events WHERE event_id='old'")[0]?.values[0]?.[0], 'used')
  assert.doesNotThrow(() => db.run("INSERT INTO mobile_usage_events VALUES ('new','post-a','instagram','removed','2026-11-24T05:30:00.000Z','device-b',1,'now')"))
})

test('una base ya actualizada no hace backup ni vuelve a ejecutar migraciones', async t => {
  const db = await freshDb(t)
  let backups = 0

  runMigrations(db, true, () => { backups += 1 })

  assert.equal(backups, 0)
  assert.equal(schemaVersion(db), latestVersion)
})

test('un fallo de migración hace rollback y reporta versión y nombre', async t => {
  const db = await emptyDb(t)
  db.run('PRAGMA user_version = 27')
  let backups = 0

  const error = capture(() => runMigrations(db, true, () => { backups += 1 }))

  assert.ok(error instanceof Error)
  assert.match(error.message, /Falló la migración 28 \(mobile_sync_removed_action\)/)
  assert.match(String(error.cause), /mobile_usage_events/)
  assert.equal(backups, 1)
  assert.equal(schemaVersion(db), 27)
  assert.equal(hasTable(db, 'mobile_usage_events_v2'), false)
})

test('un upgrade parcial desde v34 conserva las pilas y añade las columnas posteriores', async t => {
  const db = await dbAtVersion(t, 34)
  db.run("INSERT INTO posts (id,title,caption,created_at,updated_at,stack_id,stack_position) VALUES ('p1','Post','','now','now','s1',1)")

  runMigrations(db, false, () => assert.fail('La base se creó en el test'))

  assert.equal(schemaVersion(db), latestVersion)
  assert.deepEqual(db.exec("SELECT stack_id,stack_position,stack_name FROM posts WHERE id='p1'")[0]?.values[0], ['s1', 1, null])
  const columns = db.exec('PRAGMA table_info(posts)')[0]?.values.map(row => row[1]) ?? []
  assert.ok(columns.includes('stack_name'))
})
