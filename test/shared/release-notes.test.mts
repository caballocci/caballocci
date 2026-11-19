import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareReleaseNotes } from '../../src/shared/release-notes.ts'

test('normaliza la versión quitando la v inicial (tag v)', () => {
  const prepared = prepareReleaseNotes({ version: 'v0.5.0', notes: 'Cambio menor.', url: null })
  assert.equal(prepared.version, '0.5.0')
})

test('normaliza la versión sin v, con espacios alrededor', () => {
  const prepared = prepareReleaseNotes({ version: '  0.5.0 ', notes: 'Cambio menor.', url: null })
  assert.equal(prepared.version, '0.5.0')
})

test('elimina un encabezado ATX inicial que repite la versión', () => {
  const body = '# caballocci 0.5.0\n\nPlanificador offline-first.\n\n## Correcciones\n- Algo arreglado.'
  const prepared = prepareReleaseNotes({ version: 'v0.5.0', notes: body, url: null })
  assert.equal(prepared.summary, 'Planificador offline-first.')
  assert.equal(prepared.fullNotes, 'Planificador offline-first.\n\n## Correcciones\n- Algo arreglado.')
})

test('elimina un encabezado genérico inicial tras el título', () => {
  const body = '# v0.5.0\n\n## Novedades\n\nPrimer párrafo con la novedad.'
  const prepared = prepareReleaseNotes({ version: '0.5.0', notes: body, url: null })
  assert.equal(prepared.fullNotes, 'Primer párrafo con la novedad.')
  assert.equal(prepared.summary, 'Primer párrafo con la novedad.')
})

test('elimina "What’s new" y "Changelog" como encabezado inicial (case-insensitive)', () => {
  for (const heading of ['## What’s new', '## WHAT\'S NEW', '# Changelog', '## Notas de la versión']) {
    const body = `${heading}\n\nParrafo real de la versión.`
    const prepared = prepareReleaseNotes({ version: '0.5.0', notes: body, url: null })
    assert.equal(prepared.summary, 'Parrafo real de la versión.', `encabezado no eliminado: ${heading}`)
  }
})

test('body con solo el título queda vacío: la sección se oculta', () => {
  const prepared = prepareReleaseNotes({ version: '0.5.0', notes: '# caballocci 0.5.0\n', url: null })
  assert.equal(prepared.hasNotes, false)
  assert.equal(prepared.fullNotes, null)
  assert.equal(prepared.summary, null)
})

test('body solo con encabezado genérico también queda vacío', () => {
  const prepared = prepareReleaseNotes({ version: '0.5.0', notes: '## Novedades\n\n---\n', url: null })
  assert.equal(prepared.hasNotes, false)
  assert.equal(prepared.fullNotes, null)
})

test('body null o undefined produce un Release vacío sin lanzar', () => {
  for (const notes of [null, undefined]) {
    const prepared = prepareReleaseNotes({ version: '0.5.0', notes, url: null })
    assert.equal(prepared.hasNotes, false)
    assert.equal(prepared.fullNotes, null)
    assert.equal(prepared.summary, null)
  }
})

test('body vacío produce un Release vacío', () => {
  const prepared = prepareReleaseNotes({ version: '0.5.0', notes: '   \n\n  ', url: null })
  assert.equal(prepared.hasNotes, false)
})

test('body sin encabezados: resumen = primer párrafo', () => {
  const body = 'Primer párrafo con **markdown** y `código`.\n\nSegundo párrafo con más detalle.'
  const prepared = prepareReleaseNotes({ version: '0.5.0', notes: body, url: null })
  assert.equal(prepared.summary, 'Primer párrafo con **markdown** y `código`.')
  assert.equal(prepared.hasNotes, true)
  assert.ok(prepared.fullNotes?.includes('Segundo párrafo'))
})

test('body que empieza por lista: resumen = hasta 3 viñetas', () => {
  const body = '- Primera viñeta destacada\n- Segunda viñeta destacada\n- Tercera viñeta destacada\n- Cuarta viñeta no incluida en el resumen\n\nTexto adicional.'
  const prepared = prepareReleaseNotes({ version: '0.5.0', notes: body, url: null })
  assert.equal(prepared.summary, '- Primera viñeta destacada\n- Segunda viñeta destacada\n- Tercera viñeta destacada')
  assert.ok(prepared.fullNotes?.includes('Cuarta viñeta'))
})

test('CRLF y BOM se normalizan', () => {
  const body = '\uFEFFPrimer párrafo.\r\n\r\nSegundo párrafo.\r\n'
  const prepared = prepareReleaseNotes({ version: '0.5.0', notes: body, url: null })
  assert.equal(prepared.summary, 'Primer párrafo.')
  assert.equal(prepared.fullNotes, 'Primer párrafo.\n\nSegundo párrafo.')
})

test('cuerpo de una sola línea: resumen y fullNotes coinciden', () => {
  const prepared = prepareReleaseNotes({ version: '0.5.0', notes: 'Arreglo menor de sincronización.', url: null })
  assert.equal(prepared.summary, 'Arreglo menor de sincronización.')
  assert.equal(prepared.fullNotes, prepared.summary)
})

test('long body: el resumen se trunca con … y el fullNotes conserva todo', () => {
  const intro = 'Frase larga. '.repeat(60).trim()
  const body = `${intro}\n\n## Correcciones\n- Algo.`
  const prepared = prepareReleaseNotes({ version: '0.5.0', notes: body, url: null })
  assert.ok(prepared.summary && prepared.summary.endsWith('…'))
  assert.ok(prepared.fullNotes?.includes('## Correcciones'))
})

test('el HTML crudo pasa al renderer (que lo escapa) sin romper el parseo', () => {
  const body = 'Intro con <img src=x onerror=alert(1)> y <script>alert(2)</script>.\n\n## Sección\n- Ítem'
  const prepared = prepareReleaseNotes({ version: '0.5.0', notes: body, url: null })
  assert.equal(prepared.hasNotes, true)
  assert.ok(prepared.fullNotes?.includes('<script>'))
})

test('url válida https se conserva; javascript: y texto basura se descartan', () => {
  const good = prepareReleaseNotes({ version: '0.5.0', notes: 'x', url: 'https://github.com/gattocci/caballocci/releases/tag/v0.5.0' })
  assert.equal(good.url, 'https://github.com/gattocci/caballocci/releases/tag/v0.5.0')
  const evil = prepareReleaseNotes({ version: '0.5.0', notes: 'x', url: 'javascript:alert(1)' })
  assert.equal(evil.url, null)
  const junk = prepareReleaseNotes({ version: '0.5.0', notes: 'x', url: 'nota url con espacios' })
  assert.equal(junk.url, null)
  const missing = prepareReleaseNotes({ version: '0.5.0', notes: 'x', url: null })
  assert.equal(missing.url, null)
})

test('encabezado con el nombre del release se elimina aunque no sea H1', () => {
  const body = '### caballocci 0.5.0\n\nPrimer párrafo de verdad.'
  const prepared = prepareReleaseNotes({ version: '0.5.0', notes: body, url: null })
  assert.equal(prepared.fullNotes, 'Primer párrafo de verdad.')
})

test('v0.5.0 real (cuerpo completo) conserva estructura y pierde solo título y Novedades', () => {
  const body = [
    '# caballocci 0.5.0',
    '',
    'Planificador de contenido **offline-first** para Instagram, Facebook y X.',
    '',
    '## Novedades',
    '',
    '## Pilas de publicaciones en el tablero',
    '- Pilas colapsadas.',
    '',
    '## Correcciones',
    '- Fixes.',
  ].join('\n')
  const prepared = prepareReleaseNotes({ version: 'v0.5.0', notes: body, url: 'https://github.com/gattocci/caballocci/releases/tag/v0.5.0' })
  assert.equal(prepared.version, '0.5.0')
  assert.equal(prepared.summary, 'Planificador de contenido **offline-first** para Instagram, Facebook y X.')
  assert.ok(prepared.fullNotes?.startsWith('Planificador de contenido'))
  assert.ok(prepared.fullNotes?.includes('## Pilas de publicaciones'))
  assert.ok(!prepared.fullNotes?.includes('# caballocci'))
})
