import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { TestContext } from 'node:test'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'

type RunMigrations = typeof import('../../electron/database/migration-runner').runMigrations
type Migrations = typeof import('../../electron/database/migrations').migrations
type Migration = Migrations[number]

const require = createRequire(import.meta.url)
const { runMigrations: applyMigrations } = require('../../dist-electron/database/migration-runner.js') as { runMigrations: RunMigrations }
const { migrations } = require('../../dist-electron/database/migrations.js') as { migrations: Migration[] }

let sqlPromise: ReturnType<typeof initSqlJs> | undefined

function loadSql() {
  sqlPromise ??= initSqlJs({
    locateFile: file => path.join(path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm')), file),
  })
  return sqlPromise
}

export const latestVersion = migrations[migrations.length - 1].version

export function runMigrations(db: Database, existedAtStartup: boolean, backup: () => void): void {
  applyMigrations(db, existedAtStartup, backup)
}

export async function emptyDb(t: TestContext): Promise<Database> {
  const SQL = await loadSql()
  const db = new SQL.Database()
  t.after(() => db.close())
  return db
}

export async function freshDb(t: TestContext): Promise<Database> {
  const db = await emptyDb(t)
  runMigrations(db, false, () => assert.fail('Una base de datos nueva no debe requerir un backup'))
  return db
}

export async function dbAtVersion(t: TestContext, version: number): Promise<Database> {
  const db = await emptyDb(t)
  for (const migration of migrations.filter(item => item.version <= version)) db.run(migration.up)
  db.run(`PRAGMA user_version = ${version}`)
  return db
}
