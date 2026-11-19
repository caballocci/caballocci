/** Formatea una fecha ISO como «18 nov 2026» (locale es). Devuelve '' si el valor no es válido. */
export function formatLocalDate(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}
