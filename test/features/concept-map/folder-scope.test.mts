import assert from 'node:assert/strict'
import test from 'node:test'
import { buildExport, foldersInScope, nodeIdsInScope } from '../../../src/features/concept-map/conceptMapModel.ts'
import type { ConceptMapFolder, ConceptMapLink, ConceptMapNode } from '../../../src/shared/types.ts'

const stamp = '2026-01-01T00:00:00.000Z'
const folder = (id: string, parentId: string | null, space: string | null): ConceptMapFolder => ({ id, parentId, space, name: id, createdAt: stamp, updatedAt: stamp })
const node = (id: string, folderId: string | null): ConceptMapNode => ({ id, folderId, kind: 'idea', sourceId: null, title: id, body: '', x: 0, y: 0, createdAt: stamp, updatedAt: stamp })
const link = (id: string, fromNodeId: string, toNodeId: string): ConceptMapLink => ({ id, fromNodeId, toNodeId, relation: 'related', createdAt: stamp })

const folders = [
  folder('general', null, null),
  folder('x', 'general', 'X'),
  folder('x-detail', 'x', 'X'),
  folder('y', 'general', 'Y'),
]
const nodes = [node('root', null), node('in-x', 'x'), node('in-x-detail', 'x-detail'), node('in-y', 'y')]

test('el ámbito de carpetas y nodos oculta otros espacios pero mantiene accesible el contenido global', () => {
  const inX = foldersInScope(folders, 'X')
  assert.deepEqual(inX.map(item => item.id), ['general', 'x', 'x-detail'])
  assert.deepEqual(foldersInScope(folders, null).map(item => item.id), ['general', 'x', 'x-detail', 'y'])
  assert.deepEqual([...nodeIdsInScope(inX, nodes)], ['root', 'in-x', 'in-x-detail'])
})

test('exportar una carpeta de espacio incluye sus subcarpetas pero nunca otro espacio', () => {
  const scoped = foldersInScope(folders, 'X')
  const payload = buildExport(scoped, nodes, [link('cross', 'in-x', 'in-y'), link('inside', 'in-x', 'in-x-detail')], 'x', 'X / general')

  // Los ancestros globales no se exportan como carpetas: solo aparecen en el nombre del ámbito.
  assert.deepEqual(payload.folders.map(item => item.id), ['x', 'x-detail'])
  assert.deepEqual(payload.nodes.map(item => item.id), ['in-x', 'in-x-detail'])
  assert.deepEqual(payload.links.map(item => item.id), ['inside'])
  assert.equal(payload.scope, 'X / general')
})
