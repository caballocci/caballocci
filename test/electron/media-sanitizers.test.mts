import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

type SafeMediaGroupName = typeof import('../../electron/media-ipc-handlers').safeMediaGroupName
type ValidImageData = typeof import('../../electron/media-ipc-handlers').validImageData

const require = createRequire(import.meta.url)
const { safeMediaGroupName, validImageData } = require('../../dist-electron/media-ipc-handlers.js') as {
  safeMediaGroupName: SafeMediaGroupName
  validImageData: ValidImageData
}

test('safeMediaGroupName conserva nombres normales y elimina caracteres de Windows', () => {
  assert.equal(safeMediaGroupName('Campaña 2026'), 'Campaña 2026')
  assert.equal(safeMediaGroupName('  Carpeta/Sub:carpeta*  '), 'Carpeta-Sub-carpeta-')
  assert.equal(safeMediaGroupName('nombre...   '), 'nombre')
})

test('safeMediaGroupName limita la longitud y rechaza nombres vacíos o relativos', () => {
  assert.equal(safeMediaGroupName('a'.repeat(100)).length, 80)
  assert.throws(() => safeMediaGroupName('   '), /obligatorio/)
  assert.throws(() => safeMediaGroupName(42), /obligatorio/)
  assert.throws(() => safeMediaGroupName('.'), /no valido/)
  assert.throws(() => safeMediaGroupName('..'), /no valido/)
})

test('validImageData acepta los formatos esperados por su cabecera', () => {
  assert.equal(validImageData('.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2])), true)
  assert.equal(validImageData('.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])), true)
  assert.equal(validImageData('.jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])), true)
  assert.equal(validImageData('.gif', Buffer.from('GIF89a contenido')), true)
  assert.equal(validImageData('.webp', Buffer.from('RIFFabcdWEBPVP8 ')), true)
})

test('validImageData rechaza truncamientos, extensiones ajenas y desajustes', () => {
  assert.equal(validImageData('.png', Buffer.from([137, 80, 78, 71])), false)
  assert.equal(validImageData('.jpg', Buffer.from([0xff, 0xd8])), false)
  assert.equal(validImageData('.gif', Buffer.from('GIF89')), false)
  assert.equal(validImageData('.webp', Buffer.from('RIFFabcdWEB')), false)
  assert.equal(validImageData('.txt', Buffer.from('RIFFabcdWEBP')), false)
  assert.equal(validImageData('.PNG', Buffer.from('RIFFabcdWEBP')), false)
  assert.equal(validImageData('.png', Buffer.from('RIFFabcdWEBP')), false)
})
