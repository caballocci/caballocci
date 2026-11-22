import assert from 'node:assert/strict'
import test from 'node:test'
import {
  arrangeNodes,
  descendantFolderIds,
  findFreeSlot,
  isUnpublishedIdea,
  opportunityGroups,
  relationLabel,
  relationOptions,
  sameTitle,
} from '../../../src/features/concept-map/conceptMapModel.ts'
import type { ConceptMapFolder, ConceptMapLink, ConceptMapNode, Idea } from '../../../src/shared/types.ts'

const node = (id: string, kind: ConceptMapNode['kind'] = 'idea', extra: Partial<ConceptMapNode> = {}): ConceptMapNode => ({
  id,
  folderId: null,
  kind,
  sourceId: null,
  title: id,
  body: '',
  x: 0,
  y: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})

const idea = (status: Idea['status'], extra: Partial<Idea> = {}): Idea => ({
  id: 'i',
  space: 'Ideas',
  title: 'Idea',
  body: '',
  tags: [],
  media: [],
  status,
  priority: 'normal',
  dueDate: null,
  postId: null,
  combinedPostId: null,
  combinedPostIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})

const link = (id: string, fromNodeId: string, toNodeId: string): ConceptMapLink => ({
  id,
  fromNodeId,
  toNodeId,
  relation: 'related',
  createdAt: '2026-01-01T00:00:00.000Z',
})

test('sameTitle compara con el título de origen y reconoce el marcador sin título', () => {
  assert.equal(sameTitle('Igual', ' Igual '), true)
  assert.equal(sameTitle('Sin título', ''), true)
  assert.equal(sameTitle('Otro', ''), false)
})

test('isUnpublishedIdea solo acepta ideas abiertas sin publicación asociada', () => {
  assert.equal(isUnpublishedIdea(idea('inbox')), true)
  assert.equal(isUnpublishedIdea(idea('ready')), true)
  assert.equal(isUnpublishedIdea(idea('converted')), false)
  assert.equal(isUnpublishedIdea(idea('archived')), false)
  assert.equal(isUnpublishedIdea(idea('inbox', { postId: 'p' })), false)
  assert.equal(isUnpublishedIdea(undefined), false)
})

test('findFreeSlot evita huecos ocupados por nodos movidos', () => {
  const first = findFreeSlot([])

  assert.deepEqual(first, { x: 52, y: 92 })
  assert.deepEqual(findFreeSlot([node('a', 'idea', { x: first.x, y: first.y })]), { x: 322, y: 92 })
})

test('arrangeNodes por cuadrícula respeta el orden de creación', () => {
  const nodes = [
    node('b', 'post', { createdAt: '2026-01-02', title: 'B' }),
    node('a', 'idea', { createdAt: '2026-01-01', title: 'A' }),
  ]

  assert.deepEqual(Object.fromEntries(arrangeNodes(nodes, 'grid', () => '')), {
    a: { x: 52, y: 92 },
    b: { x: 322, y: 92 },
  })
})

test('arrangeNodes agrupa por tipo en columnas y pasa a la siguiente tras seis filas', () => {
  const nodes = [
    node('b', 'post', { title: 'B' }),
    node('a', 'idea', { title: 'A' }),
  ]
  const grouped = arrangeNodes(nodes, 'kind', current => current.kind)

  assert.equal(grouped.get('a')?.x, 52)
  assert.equal(grouped.get('b')?.x, 322)

  const many = Array.from({ length: 7 }, (_, index) => node(`i${index}`, 'idea', { title: `i${index}` }))
  const wrapped = arrangeNodes(many, 'kind', () => 'idea')

  assert.equal(wrapped.get('i5')?.y, 92 + 5 * 160)
  assert.equal(wrapped.get('i6')?.x, 52 + 270)
  assert.equal(wrapped.get('i6')?.y, 92)
})

test('opportunityGroups detecta componentes de tres ideas y excluye los que ya publicaron', () => {
  const nodes = ['a', 'b', 'c'].map(id => node(id))
  const links = [link('l1', 'a', 'b'), link('l2', 'b', 'c')]

  const groups = opportunityGroups(nodes, links, () => false)
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].map(item => item.id), ['a', 'b', 'c'])

  assert.equal(opportunityGroups(nodes, links, item => item.id === 'b').length, 0)

  const withPost = [...nodes, node('p', 'post')]
  const linksWithPost = [...links, link('l3', 'c', 'p')]
  assert.equal(opportunityGroups(withPost, linksWithPost, () => false).length, 0)
})

test('descendantFolderIds incluye la raíz, toda su profundidad y las globales sin raíz', () => {
  const folders: ConceptMapFolder[] = [
    { id: 'root', parentId: null, space: null, name: 'Root', createdAt: '', updatedAt: '' },
    { id: 'child', parentId: 'root', space: null, name: 'Child', createdAt: '', updatedAt: '' },
    { id: 'grand', parentId: 'child', space: null, name: 'Grand', createdAt: '', updatedAt: '' },
    { id: 'other', parentId: null, space: 'Otro', name: 'Other', createdAt: '', updatedAt: '' },
  ]

  assert.deepEqual([...descendantFolderIds(folders, 'root')].sort(), ['child', 'grand', 'root'])
  assert.deepEqual([...descendantFolderIds(folders, null)].sort(), ['child', 'grand', 'other', 'root'])
})

test('todas las relaciones del mapa tienen etiqueta visible', () => {
  for (const relation of relationOptions) assert.ok(relationLabel(relation).length > 0)
})
