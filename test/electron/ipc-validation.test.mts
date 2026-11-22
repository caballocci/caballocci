import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateAnalysisTerms,
  validateArgumentCount,
  validateClipboardWrite,
  validateConceptFolderInput,
  validateConceptLinkInput,
  validateConceptNodeInput,
  validateIdeaAnalysisOptions,
  validateIdeaIds,
  validateIdeaInput,
  validateLimit,
  validateNoArguments,
  validatePostInput,
  validateSourceInput,
  validateThreshold,
  validateWorkGroupInput,
  validateWorkGroupPostIds,
} from '../../electron/ipc-validation.ts'

function rejectsField(run: () => unknown, field: string) {
  assert.throws(run, (error: unknown) => error instanceof TypeError && error.message.includes(field))
}

const post = {
  title: 'Mi publicación',
  caption: 'Texto',
  notes: '',
  hashtags: ['#campaña'],
  mentions: [],
  platforms: ['instagram'],
  distribution: [],
  contentType: 'carousel',
  status: 'draft',
  durationMinutes: 15,
  project: 'Mi contenido',
  color: '#ff6b4a',
  media: [],
  ideaBlocks: [],
}

const idea = {
  space: 'Ideas',
  title: 'Idea inicial',
  body: 'Cuerpo',
  tags: [],
  media: [],
  status: 'inbox',
  priority: 'normal',
  dueDate: null,
}

const source = {
  name: 'Fuente',
  baseUrl: 'https://example.com/api',
  method: 'GET',
  format: 'json',
}

test('un post válido conserva sus campos y normaliza los opcionales', () => {
  const result = validatePostInput(post)

  assert.equal(result.scheduledAt, null)
  assert.equal(result.title, 'Mi publicación')
  assert.deepEqual(result.hashtags, ['#campaña'])
  assert.deepEqual(result.media, [])
  assert.equal('stackId' in result, false)

  const stacked = validatePostInput({ ...post, stackId: 's1', stackPosition: 2, stackName: '  Carrusel  ' })
  assert.equal(stacked.stackId, 's1')
  assert.equal(stacked.stackPosition, 2)
  assert.equal(stacked.stackName, 'Carrusel')
})

test('un post rechaza duración, color, fecha, tamaño y posición inválidos', () => {
  rejectsField(() => validatePostInput({ ...post, durationMinutes: 0 }), 'post.durationMinutes')
  rejectsField(() => validatePostInput({ ...post, color: 'rojo' }), 'post.color')
  rejectsField(() => validatePostInput({ ...post, scheduledAt: 'no es fecha' }), 'post.scheduledAt')
  rejectsField(() => validatePostInput({ ...post, media: [{ id: 'a', name: 'a.png', kind: 'image', size: Number.NaN, mode: 'copy' }] }), 'media[0].size')
  rejectsField(() => validatePostInput({ ...post, stackPosition: -1 }), 'post.stackPosition')
  rejectsField(() => validatePostInput({ ...post, hashtags: [''] }), 'post.hashtags[0]')
})

test('una idea válida normaliza sourceName y una fecha de vencimiento', () => {
  const result = validateIdeaInput(idea)
  assert.equal(result.sourceName, '')
  assert.equal(result.dueDate, null)

  const dated = validateIdeaInput({ ...idea, dueDate: '2026-12-31' })
  assert.equal(dated.dueDate, '2026-12-31')
  rejectsField(() => validateIdeaInput({ ...idea, dueDate: 'mañana' }), 'idea.dueDate')
  rejectsField(() => validateIdeaInput({ ...idea, priority: 'urgente' }), 'idea.priority')
})

test('los ids de idea exigen al menos dos y rechazan duplicados o vacíos', () => {
  assert.deepEqual(validateIdeaIds(['a', 'b']), ['a', 'b'])
  rejectsField(() => validateIdeaIds(['a']), 'ideaIds')
  rejectsField(() => validateIdeaIds(['a', 'a']), 'ideaIds')
  rejectsField(() => validateIdeaIds(['a', '  ']), 'ideaIds[1]')
})

test('los límites de análisis tienen valores por defecto y rangos estrictos', () => {
  assert.equal(validateLimit(undefined), 8)
  assert.equal(validateThreshold(undefined), 0.14)
  assert.deepEqual(validateAnalysisTerms(undefined), [])
  assert.deepEqual(validateAnalysisTerms(['  beta  ', ' alfa ']), ['beta', 'alfa'])
  rejectsField(() => validateAnalysisTerms(['  beta  ', '', ' alfa ']), 'analysisTerms[1]')

  rejectsField(() => validateLimit(31), 'limit')
  rejectsField(() => validateThreshold(Number.NaN), 'threshold')
  rejectsField(() => validateAnalysisTerms(new Array(101).fill('x')), 'analysisTerms')

  const defaults = validateIdeaAnalysisOptions(undefined)
  assert.equal(defaults.minTokenLength, 3)
  assert.equal(defaults.genericTermThreshold, 0.08)
  rejectsField(() => validateIdeaAnalysisOptions({ ...defaults, minTokenLength: 0 }), 'ideaAnalysisOptions.minTokenLength')
})

test('una fuente válida aplica defaults y acepta un token Bearer por alias', () => {
  const result = validateSourceInput(source)
  assert.equal(result.recordsPath, null)
  assert.equal(result.bodyTemplate, null)
  assert.equal(result.authType, 'none')
  assert.deepEqual(result.headers, {})
  assert.equal(result.maxRecords, 500)
  assert.equal(result.targetProject, 'Mi contenido')
  assert.equal(result.importMode, 'post')
  assert.equal(result.initialStatus, 'idea')

  const bearer = validateSourceInput({ ...source, authType: 'bearer', authConfig: { access_token: 'secreto' } })
  const authConfig = bearer.authConfig as Record<string, string>
  assert.equal(authConfig.token, 'secreto')
})

test('una fuente exige credenciales coherentes y un bodyTemplate JSON válido', () => {
  assert.throws(() => validateSourceInput({ ...source, authType: 'bearer' }), /Bearer/)
  assert.throws(() => validateSourceInput({ ...source, authType: 'apiKey' }), /API key/)
  assert.throws(() => validateSourceInput({ ...source, authType: 'basic', authConfig: { username: 'u' } }), /Basic/)
  rejectsField(() => validateSourceInput({ ...source, bodyTemplate: '{roto' }), 'source.bodyTemplate')
  rejectsField(() => validateSourceInput({ ...source, maxRecords: 0 }), 'source.maxRecords')

  const withHeader = validateSourceInput({ ...source, authType: 'bearer', headers: { Authorization: 'Bearer abc' } })
  assert.equal(withHeader.authType, 'bearer')
})

test('los nodos y carpetas del mapa rechazan coordenadas y autoreferencias', () => {
  const node = {
    folderId: null,
    kind: 'idea',
    sourceId: null,
    title: 'Idea',
    body: '',
    x: 10,
    y: -20,
  }
  assert.equal(validateConceptNodeInput(node).x, 10)
  rejectsField(() => validateConceptNodeInput({ ...node, x: Number.NaN }), 'conceptMap.node.x')
  rejectsField(() => validateConceptNodeInput({ ...node, y: 1_000_001 }), 'conceptMap.node.y')

  const folder = validateConceptFolderInput({ name: 'Carpeta', parentId: null, space: 'X' })
  assert.equal(folder.space, 'X')
  rejectsField(() => validateConceptFolderInput({ id: 'c1', name: 'Carpeta', parentId: 'c1' }), 'conceptMap.folder.parentId')
})

test('un enlace conceptual nunca puede unir un nodo consigo mismo', () => {
  const link = validateConceptLinkInput({ fromNodeId: 'a', toNodeId: 'b' })
  assert.equal(link.relation, null)
  assert.equal(validateConceptLinkInput({ fromNodeId: 'a', toNodeId: 'b', relation: 'related' }).relation, 'related')
  rejectsField(() => validateConceptLinkInput({ fromNodeId: 'a', toNodeId: 'a' }), 'conceptMap.link')
})

test('el portapapeles acepta texto y HTML opcional, pero no argumentos sueltos', () => {
  assert.deepEqual(validateClipboardWrite(['texto']), { text: 'texto' })
  assert.deepEqual(validateClipboardWrite(['texto', '<b>html</b>']), { text: 'texto', html: '<b>html</b>' })
  assert.deepEqual(validateClipboardWrite(['texto', '']), { text: 'texto' })
  rejectsField(() => validateClipboardWrite([]), 'count')
  rejectsField(() => validateClipboardWrite(['a', 'b', 'c']), 'count')
  rejectsField(() => validateClipboardWrite([42]), 'text')
})

test('los grupos de trabajo validan color, espacio y listas de posts', () => {
  const group = validateWorkGroupInput({ name: '  Campaña  ', description: '', space: '', color: '#e76042', parentId: null })
  assert.equal(group.name, 'Campaña')
  assert.equal(group.color, '#e76042')
  assert.equal(group.parentId, null)
  rejectsField(() => validateWorkGroupInput({ name: 'X', color: 'naranja' }), 'workGroup.color')
  assert.deepEqual(validateWorkGroupPostIds(['a', 'b']), ['a', 'b'])
  rejectsField(() => validateWorkGroupPostIds(['a', 'a']), 'workGroup.postIds')
})

test('validateNoArguments y validateArgumentCount protegen los handlers', () => {
  assert.doesNotThrow(() => validateNoArguments([]))
  rejectsField(() => validateNoArguments(['extra']), 'unexpected')
  assert.doesNotThrow(() => validateArgumentCount(['a'], 1))
  rejectsField(() => validateArgumentCount(['a'], 2), 'count')
})
