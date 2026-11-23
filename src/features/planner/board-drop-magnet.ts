import type { PostStatus } from '../../shared/types'

type CellRect = { left: number; right: number; top: number; bottom: number }
export type BoardDropCell = { key: string; status: PostStatus; rect: CellRect }
export type BoardDropTarget = { key: string; status: PostStatus }

/** Distancia desde el puntero al rect de una celda: 0 si está dentro. */
export function distanceToRect(rect: CellRect, x: number, y: number): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right)
  const dy = Math.max(rect.top - y, 0, y - rect.bottom)
  return Math.hypot(dx, dy)
}

/**
 * El DnD nativo solo dispara `drop` donde alguien hizo `preventDefault` en `dragover`.
 * En los huecos entre columnas no hay receptor: elegimos la celda más cercana para que
 * el tablero se comporte como si todo el area de columnas fuera soltable.
 * En empate gana la primera del DOM (de izquierda a derecha), por estabilidad.
 */
export function nearestDropCell(cells: BoardDropCell[], x: number, y: number): BoardDropTarget | null {
  let best: BoardDropTarget | null = null
  let bestDistance = Infinity
  for (const cell of cells) {
    const distance = distanceToRect(cell.rect, x, y)
    if (distance < bestDistance) {
      best = { key: cell.key, status: cell.status }
      bestDistance = distance
    }
  }
  return best
}
