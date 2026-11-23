import assert from 'node:assert/strict'
import test from 'node:test'
import {
  blankPost,
  errorMessage,
  formatTitle,
  fromLocalDateTimeInput,
  inferredVisual,
  itemsToNotes,
  notesToItems,
  parseMasterSlides,
  parseTitleCandidates,
  toLocalDateTimeInput,
  visualSequence,
} from '../../../src/features/editor/editor-utils.ts'
import type { MediaAsset } from '../../../src/shared/types.ts'

const asset = (name: string, extra: Partial<MediaAsset> = {}): MediaAsset => ({
  id: name,
  name,
  kind: 'image',
  size: 1,
  mode: 'copy',
  ...extra,
})

test('blankPost crea una publicación vacía con valores por defecto', () => {
  const post = blankPost('Mi espacio')

  assert.equal(post.project, 'Mi espacio')
  assert.equal(post.status, 'idea')
  assert.deepEqual(post.platforms, ['instagram'])
  assert.deepEqual(post.ideaBlocks, [])
  assert.equal(post.media, undefined)
  assert.ok(post.id)
})

test('parseTitleCandidates prefiere los títulos entre comillas y quita duplicados', () => {
  const value = 'Contexto que no sirve\n- "Primera opción"\n* "Segunda opción"\n1. "Primera opción"'

  assert.deepEqual(parseTitleCandidates(value), ['Primera opción', 'Segunda opción'])
})

test('parseTitleCandidates usa líneas largas cuando no hay comillas', () => {
  const value = 'nota\nEste es un título con más de ocho caracteres\nEsto puede sonar mejor'

  assert.deepEqual(parseTitleCandidates(value), ['Este es un título con más de ocho caracteres'])
})

test('parseMasterSlides extrae títulos y textos y descarta el cierre', () => {
  const blocks = parseMasterSlides('Slide 1: Portada\nTexto uno\n\n## Diapositiva 2 — Cuerpo\nTexto dos\n\nFinal: cierre')

  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].title, 'Portada')
  assert.equal(blocks[0].text, 'Texto uno')
  assert.equal(blocks[1].title, 'Cuerpo')
  assert.equal(blocks[1].text, 'Texto dos')
  assert.ok(blocks.every(block => block.id))
})

test('parseMasterSlides reconoce el título etiquetado en negrita', () => {
  const blocks = parseMasterSlides('Slide 1\n**TITULO:** Mi título\n**BAJADA:** Texto de apoyo')

  assert.equal(blocks[0].title, 'Mi título')
})

test('formatTitle respeta los cuatro modos y los signos españoles', () => {
  assert.equal(formatTitle('  hOLA MUNDO  ', 'upper'), 'HOLA MUNDO')
  assert.equal(formatTitle('  HOLA MUNDO  ', 'lower'), 'hola mundo')
  assert.equal(formatTitle('hOLA MUNDO', 'title'), 'Hola Mundo')
  assert.equal(formatTitle('hOLA MUNDO', 'sentence'), 'Hola mundo')
  assert.equal(formatTitle('¿cómo va? ¡bien!', 'title'), '¿Cómo Va? ¡Bien!')
  assert.equal(formatTitle('', 'sentence'), '')
})

test('las fechas locales hacen ida y vuelta y descartan valores inválidos', () => {
  const input = toLocalDateTimeInput('2026-06-15T10:20:00.000Z')

  assert.match(input, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  assert.equal(fromLocalDateTimeInput(input), new Date(input).toISOString())
  assert.equal(toLocalDateTimeInput('no-fecha'), '')
  assert.equal(toLocalDateTimeInput(null), '')
  assert.equal(fromLocalDateTimeInput(''), null)
  assert.equal(fromLocalDateTimeInput('no-fecha'), null)
})

test('notesToItems e itemsToNotes conservan títulos, textos y separadores', () => {
  const value = '[Título]\nTexto uno\n\n---\n\nTexto dos'
  const items = notesToItems(value)

  assert.equal(items.length, 2)
  assert.equal(items[0].title, 'Título')
  assert.equal(items[0].text, 'Texto uno')
  assert.equal(items[1].title, '')
  assert.equal(items[1].text, 'Texto dos')
  assert.equal(itemsToNotes(items), value)
  assert.equal(notesToItems('   ')[0].text, '')
  assert.equal(itemsToNotes([{ id: 'x', title: ' ', text: ' ' }]), '')
})

test('inferredVisual prioriza roles por nombre antes que por metadatos', () => {
  assert.deepEqual(inferredVisual(asset('representativa.png', { presentationRole: 'cover' })), { role: 'representative', sequence: undefined })
  assert.deepEqual(inferredVisual(asset('R03-C01.png')), { role: 'slide', sequence: 2 })
  assert.deepEqual(inferredVisual(asset('03_portada.png')), { role: 'cover', sequence: 0 })
  assert.deepEqual(inferredVisual(asset('cierre.png')), { role: 'closing', sequence: 10000 })
  assert.deepEqual(inferredVisual(asset('otro.png', { presentationRole: 'slide', sequence: 4 })), { role: 'slide', sequence: 4 })
})

test('visualSequence respeta un null explícito y deduce la secuencia del nombre', () => {
  assert.equal(visualSequence(asset('05.png', { sequence: null })), null)
  assert.equal(visualSequence(asset('05.png')), 5)
  assert.equal(visualSequence(asset('otro.png', { sequence: 7, presentationRole: 'slide' })), 7)
})

test('errorMessage extrae mensajes, strings y JSON, incluso con referencias circulares', () => {
  const circular: Record<string, unknown> = {}
  circular.self = circular

  assert.equal(errorMessage(new Error('boom')), 'boom')
  assert.equal(errorMessage('texto'), 'texto')
  assert.equal(errorMessage({ code: 42 }), '{"code":42}')
  assert.equal(errorMessage(circular), '[object Object]')
})
