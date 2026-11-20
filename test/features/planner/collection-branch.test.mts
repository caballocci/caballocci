import assert from 'node:assert/strict'
import test from 'node:test'
import { branchTrail, planCollectionDetach } from '../../../src/features/planner/collection-branch.ts'
import type { WorkGroup } from '../../../src/shared/types.ts'

const group = (id: string, parentId: string | null, postIds: string[] = [], archivedAt?: string): WorkGroup => ({
  id,
  name: id,
  description: '',
  space: 'default',
  parentId,
  postIds,
  ...(archivedAt ? { archivedAt } : {}),
}) as WorkGroup

const tree = [
  group('root', null, ['p1']),
  group('child', 'root', ['p2']),
  group('grandchild', 'child', ['p3']),
  group('sibling', 'root', ['p1', 'p4']),
  group('archived', 'child', ['p1'], '2026-01-01T00:00:00.000Z'),
]

test('branchTrail abre la rama completa cuando no hay nivel actual', () => {
  assert.deepEqual(branchTrail(tree, null, 'grandchild'), ['root', 'child', 'grandchild'])
})

test('branchTrail arranca en el hijo del nivel actual, sin repetirlo', () => {
  assert.deepEqual(branchTrail(tree, 'root', 'grandchild'), ['child', 'grandchild'])
  assert.deepEqual(branchTrail(tree, 'root', 'child'), ['child'])
  assert.deepEqual(branchTrail(tree, 'child', 'grandchild'), ['grandchild'])
})

test('branchTrail no abre nada para el nivel actual ni para colecciones ajenas', () => {
  assert.deepEqual(branchTrail(tree, 'child', 'child'), [])
  assert.deepEqual(branchTrail(tree, 'child', 'sibling'), [])
})

test('planCollectionDetach quita los ids de todas las colecciones activas que los contengan', () => {
  assert.deepEqual(planCollectionDetach(tree, ['p1']), [
    { groupId: 'root', postIds: [] },
    { groupId: 'sibling', postIds: ['p4'] },
  ])
})

test('planCollectionDetach ignora archivadas, colecciones sin cambios y lotes vacíos', () => {
  assert.deepEqual(planCollectionDetach(tree, ['p3']), [{ groupId: 'grandchild', postIds: [] }])
  assert.deepEqual(planCollectionDetach(tree, ['p9']), [])
  assert.deepEqual(planCollectionDetach(tree, []), [])
})
