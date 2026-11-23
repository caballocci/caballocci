import assert from 'node:assert/strict'
import test from 'node:test'
import { hashExportRecord, toCsv } from '../../../electron/integrations/exporter.ts'
import type { ExportColumn } from '../../../electron/integrations/exporter.ts'

const columns: ExportColumn[] = [
  { header: 'Título', source: 'meta.titulo', order: 2 },
  { header: 'ID', source: 'id', order: 1 },
  { header: 'Notas', source: 'notas', order: 3 },
]

test('toCsv ordena columnas, antepone BOM y usa CRLF', () => {
  const csv = toCsv([{ id: 'a', meta: { titulo: 'Uno' }, notas: 'sin' }], columns)

  assert.equal(csv, '\ufeff"ID","Título","Notas"\r\n"a","Uno","sin"\r\n')
})

test('toCsv escapa comillas, serializa objetos y deja vacíos los caminos ausentes', () => {
  const csv = toCsv([{ id: 'a,"B"', meta: { titulo: 'Dijo "sí"' }, notas: { a: 1 } }], columns)

  assert.equal(csv, '\ufeff"ID","Título","Notas"\r\n"a,""B""","Dijo ""sí""","{""a"":1}"\r\n')
  assert.equal(toCsv([{}], columns), '\ufeff"ID","Título","Notas"\r\n"","",""\r\n')
})

test('toCsv sin registros solo escribe la cabecera', () => {
  assert.equal(toCsv([], [{ header: 'A', source: 'a', order: 0 }]), '\ufeff"A"\r\n')
})

test('hashExportRecord ignora el orden de las columnas y cambia con los valores', () => {
  const record = { id: 'a', meta: { titulo: 'Uno' }, notas: 'sin' }

  assert.equal(hashExportRecord(record, columns), hashExportRecord(record, [...columns].reverse()))
  assert.notEqual(hashExportRecord(record, columns), hashExportRecord({ ...record, notas: 'otro' }, columns))
  assert.equal(hashExportRecord(record, columns).length, 64)
})
