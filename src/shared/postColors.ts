/**
 * Color almacenado cuando la tarjeta no tiene color propio.
 *
 * Se conserva el valor histórico para no migrar las publicaciones existentes:
 * «sin color» se representa con este valor en la base de datos, pero la UI lo
 * muestra como una opción neutra y no como parte de la paleta.
 */
export const DEFAULT_POST_COLOR = '#e76042'

/** Acento neutro para publicaciones sin color en línea de tiempo y calendario. */
export const NEUTRAL_POST_COLOR = '#6b756e'

export const postColors = [
  { value: '#d9534f', label: 'Rojo' },
  { value: '#e9a34b', label: 'Ámbar' },
  { value: '#d8c45b', label: 'Mostaza' },
  { value: '#67b987', label: 'Verde' },
  { value: '#55b9ad', label: 'Turquesa' },
  { value: '#5e9ed2', label: 'Azul' },
  { value: '#8a83d6', label: 'Índigo' },
  { value: '#ca79ae', label: 'Rosa' },
  { value: '#a3aaa5', label: 'Gris' },
] as const

export const isDefaultPostColor = (color: string | null | undefined) => !color || color === DEFAULT_POST_COLOR

/** Color con el que se pinta el acento de una publicación; neutro cuando no eligió uno. */
export const postAccentColor = (color: string | null | undefined) => isDefaultPostColor(color) ? NEUTRAL_POST_COLOR : color as string
