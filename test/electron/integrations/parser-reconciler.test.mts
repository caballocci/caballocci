import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePayload } from '../../../electron/integrations/parser.ts'
import { hashRecord, normalizeRecord, reconcile } from '../../../electron/integrations/reconciler.ts'
import type { ExistingContentRecord, SourceDefinitionConfig } from '../../../electron/integrations/types.ts'

const definition: SourceDefinitionConfig = {
  externalRef: 'meta.id',
  title: 'titulo',
  sourceKindField: 'meta.tipo',
  hashFields: ['titulo', 'cuerpo'],
  contentTypeMap: { video: 'reel', imagen: 'post' },
  customFieldDefaults: { origen: 'api', revisado: false },
}

function existing(ref: string, contentHash: string): ExistingContentRecord {
  return {
    id: `id-${ref}`,
    externalRef: ref,
    contentHash,
    raw: {},
    enriched: {},
    titleManuallyEdited: false,
    lastSeenAt: '2026-11-01T00:00:00.000Z',
  }
}

test('parsePayload lee un array JSON directo y respeta maxRecords', () => {
  const payload = JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }])

  assert.deepEqual(parsePayload(payload, 'json', null), {
    records: [{ id: 1 }, { id: 2 }, { id: 3 }],
    truncated: false,
  })
  assert.deepEqual(parsePayload(payload, 'json', null, 2), {
    records: [{ id: 1 }, { id: 2 }],
    truncated: true,
  })
  assert.throws(() => parsePayload(payload, 'json', null, 0), /entero positivo/)
  assert.throws(() => parsePayload(payload, 'json', null, 1.5), /entero positivo/)
})

test('parsePayload sigue una ruta anidada y solo encuentra arrays de primer nivel sin ruta', () => {
  const nested = JSON.stringify({ meta: { total: 2 }, data: { items: [{ id: 'a' }, { id: 'b' }] } })
  const direct = JSON.stringify({ meta: { total: 2 }, items: [{ id: 'a' }, { id: 'b' }] })

  assert.deepEqual(parsePayload(nested, 'json', 'data.items').records, [{ id: 'a' }, { id: 'b' }])
  assert.deepEqual(parsePayload(direct, 'json', null).records, [{ id: 'a' }, { id: 'b' }])
  assert.throws(() => parsePayload(nested, 'json', null), /No se encontró/)
  assert.throws(() => parsePayload(nested, 'json', 'data.missing'), /No se encontró/)
})

test('parsePayload rechaza JSON inválido y registros que no son objetos', () => {
  assert.throws(() => parsePayload('{roto', 'json', null), /JSON válido/)
  assert.throws(() => parsePayload('[1, "texto"]', 'json', null), /JSON registro 1 no es un objeto/)
})

test('parsePayload procesa NDJSON ignorando líneas vacías y señala la línea defectuosa', () => {
  const payload = '{"id":"a"}\r\n\n  {"id":"b"}  \r\n'

  assert.deepEqual(parsePayload(payload, 'ndjson', null).records, [{ id: 'a' }, { id: 'b' }])
  assert.throws(() => parsePayload('{"id":"a"}\n[1,2]', 'ndjson', null), /NDJSON inválido en línea 2/)
  assert.throws(() => parsePayload('42\n', 'ndjson', null), /NDJSON inválido en línea 1/)
})

test('parsePayload interpreta CSV con comillas, comas internas, CRLF y cabeceras vacías', () => {
  const payload = 'titulo,cuerpo,\r\n"Hola, mundo","Dijo ""sí""",\r\n,,'

  assert.deepEqual(parsePayload(payload, 'csv', null), {
    records: [{ titulo: 'Hola, mundo', cuerpo: 'Dijo "sí"', column_3: '' }],
    truncated: false,
  })
  assert.throws(() => parsePayload('"sin cerrar', 'csv', null), /comillas sin cerrar/)
})

test('normalizeRecord mapea rutas anidadas, aplica el tipo y los defaults', () => {
  const raw = { meta: { id: 42, tipo: 'video' }, titulo: 'Mi reel', cuerpo: 'Texto' }
  const normalized = normalizeRecord(raw, definition)

  assert.equal(normalized.externalRef, '42')
  assert.equal(normalized.title, 'Mi reel')
  assert.equal(normalized.sourceKind, 'video')
  assert.equal(normalized.contentType, 'reel')
  assert.deepEqual(normalized.enriched, { origen: 'api', revisado: false })
  assert.equal(normalized.raw, raw)

  const unknownKind = normalizeRecord({ ...raw, meta: { id: 43, tipo: 'otro' } }, definition)
  assert.equal(unknownKind.contentType, 'post')
  assert.throws(() => normalizeRecord({ ...raw, meta: { tipo: 'video' } }, definition), /externalRef vacío/)
  assert.throws(() => normalizeRecord({ ...raw, titulo: '' }, definition), /title vacío/)
})

test('reconcile clasifica nuevos, iguales, actualizados e inválidos y resume el total', () => {
  const rawNew = { meta: { id: 'n', tipo: 'imagen' }, titulo: 'Nuevo', cuerpo: 'A' }
  const rawSame = { meta: { id: 's', tipo: 'imagen' }, titulo: 'Igual', cuerpo: 'B' }
  const rawUpdated = { meta: { id: 'u', tipo: 'video' }, titulo: 'Actualizado', cuerpo: 'C' }

  const report = reconcile(
    [
      rawNew,
      rawSame,
      { ...rawUpdated, cuerpo: 'D' },
      { meta: { id: 'x', tipo: 'imagen' }, titulo: '' },
      rawNew,
    ],
    [existing('s', hashRecord(rawSame, definition.hashFields)), existing('u', hashRecord(rawUpdated, definition.hashFields))],
    definition,
  )

  assert.deepEqual(report.items.map(item => item.kind), ['new', 'unchanged', 'updated', 'invalid', 'invalid'])
  assert.equal(report.items[3].reason, 'title vacío')
  assert.equal(report.items[4].reason, 'externalRef duplicado en la respuesta')
  assert.deepEqual(report.summary, { new: 1, updated: 1, unchanged: 1, invalid: 2, total: 5 })
})

test('hashRecord es estable ante el orden de campos y sensible a los valores incluidos', () => {
  const left = { titulo: 'Igual', cuerpo: 'Texto', extra: 1 }
  const right = { cuerpo: 'Texto', extra: 2, titulo: 'Igual' }

  assert.equal(hashRecord(left, definition.hashFields), hashRecord(right, definition.hashFields))
  assert.notEqual(hashRecord(left, definition.hashFields), hashRecord({ ...left, cuerpo: 'Otro' }, definition.hashFields))
  assert.notEqual(hashRecord(left, ['extra']), hashRecord(right, ['extra']))
  assert.equal(hashRecord({}, ['noExiste']), hashRecord({ otro: 1 }, ['noExiste']))
})
