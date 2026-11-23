import assert from 'node:assert/strict'
import test from 'node:test'
import { distanceToRect, nearestDropCell, type BoardDropCell } from '../../../src/features/planner/board-drop-magnet.ts'

const rect = (left: number, top: number, width = 180, height = 300) => ({ left, right: left + width, top, bottom: top + height })
const cells: BoardDropCell[] = [
  { key: 'idea', status: 'idea', rect: rect(0, 0) },
  { key: 'draft', status: 'draft', rect: rect(188, 0) },
]

test('distanceToRect es cero dentro de la celda y crece fuera', () => {
  assert.equal(distanceToRect(rect(0, 0), 90, 150), 0)
  assert.equal(distanceToRect(rect(0, 0), 200, 150), 20)
  assert.equal(distanceToRect(rect(0, 0), 90, -10), 10)
  assert.equal(distanceToRect(rect(0, 0), 200, -10), Math.hypot(20, 10))
})

test('el imán elige la celda cubierta por el puntero', () => {
  assert.deepEqual(nearestDropCell(cells, 20, 40), { key: 'idea', status: 'idea' })
  assert.deepEqual(nearestDropCell(cells, 200, 40), { key: 'draft', status: 'draft' })
})

test('en el hueco entre columnas gana la celda más cercana y luego el orden del DOM', () => {
  // Hueco de 8px entre 180 y 188: en la mitad exacta gana la primera.
  assert.deepEqual(nearestDropCell(cells, 184, 40), { key: 'idea', status: 'idea' })
  assert.deepEqual(nearestDropCell(cells, 187, 40), { key: 'draft', status: 'draft' })
})

test('por debajo de las celdas sigue eligiendo la columna correcta', () => {
  assert.deepEqual(nearestDropCell(cells, 50, 380), { key: 'idea', status: 'idea' })
  assert.deepEqual(nearestDropCell(cells, 260, 380), { key: 'draft', status: 'draft' })
})

test('sin celdas renderizadas no hay destino', () => {
  assert.equal(nearestDropCell([], 100, 100), null)
})
