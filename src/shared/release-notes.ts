/**
 * Procesa las notas de una versión tal como viajan desde la Release de GitHub
 * (`body` markdown) y devuelve un objeto listo para presentar:
 * { version, summary, fullNotes, url, hasNotes }.
 *
 * Reglas (ver docs/RELEASE-NOTES.md):
 * - La versión se normaliza quitando la "v" inicial y se muestra una sola vez.
 * - Se elimina un encabezado ATX inicial que repita la etiqueta/el nombre de
 *   la release (p. ej. "# caballocci 0.5.0") y un encabezado inicial genérico
 *   ("Novedades", "What's new", "Changelog", ...).
 * - El resumen es el primer bloque con contenido (párrafo, o las primeras 3
 *   viñetas si el cuerpo empieza por una lista).
 * - fullNotes es el cuerpo limpiado completo (incluye el resumen: al
 *   expandirlo el usuario ve todo, sin contenido oculto).
 * - El cuerpo es contenido externo: aquí NO se genera HTML; se renderiza con
 *   un renderer markdown sin HTML crudo (react-markdown).
 */

export interface PreparedRelease {
  /** Versión normalizada sin la "v" inicial (p. ej. "0.5.0"). null si no hay. */
  version: string | null
  /** Primer bloque con contenido (párrafo o hasta 3 viñetas). null si no hay. */
  summary: string | null
  /** Cuerpo limpiado completo (markdown). null si está vacío o no hay notas. */
  fullNotes: string | null
  /** URL del release (solo https). null si falta o no es válida. */
  url: string | null
  /** true si hay contenido de notas que la UI puede mostrar. */
  hasNotes: boolean
}

export interface PrepareReleaseInput {
  version?: string | null
  notes?: string | null
  url?: string | null
}

const BOM = /^\uFEFF/
const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/
const HR = /^(?:-{3,}|\*{3,}|_{3,})[ \t]*$/
const LIST_ITEM = /^(?:[-*+]|\d+[.)])[ \t]+/
const GENERIC_HEADING = /^(novedades|what'?s new|whats new|what’s new|cambios en esta versi[oó]n|changelog|cambios|release notes|notas( de (la )?versi[oó]n)?)$/i

function stripBom(text: string) {
  return text.replace(BOM, '')
}

function normalizeNewlines(text: string) {
  return text.replace(/\r\n?|\u2028|\u2029/g, '\n')
}

function trimLines(text: string) {
  return text
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Texto normalizado para comparaciones de encabezados. */
function normalizeHeadingText(text: string) {
  return text
    .toLowerCase()
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeVersion(version: string | null | undefined) {
  const raw = String(version ?? '').trim().replace(/\s+/g, '')
  if (!raw) return null
  return raw.replace(/^[vV](?=\d)/, '')
}

function looksLikeVersionTitle(headingText: string, version: string | null) {
  if (/^caballocci(\s|$)/i.test(headingText)) return true
  if (/^v?\d+(\.\d+)+/.test(headingText)) {
    if (!version) return true
    return normalizeHeadingText(headingText).includes(normalizeHeadingText(version))
  }
  if (version && normalizeHeadingText(headingText).includes(normalizeHeadingText(version))) return true
  return false
}

function isGenericHeading(headingText: string) {
  return GENERIC_HEADING.test(normalizeHeadingText(headingText).replace(/\s+$/, ''))
}

/** Elimina encabezados ATX iniciales que dupliquen el título del release o sean genéricos. */
function stripDuplicateLead(text: string, version: string | null) {
  let current = text
  for (;;) {
    const lines = current.split('\n')
    let i = 0
    while (i < lines.length && !lines[i]!.trim()) i += 1
    if (i >= lines.length) return ''
    const line = lines[i]!
    const heading = line.match(HEADING)
    if (heading) {
      const headingText = heading[2]!.trim()
      if (looksLikeVersionTitle(headingText, version) || isGenericHeading(headingText)) {
        lines.splice(i, 1)
        // quita una regla horizontal o líneas en blanco justo después
        let j = i
        while (j < lines.length && (!lines[j]!.trim() || HR.test(lines[j]!.trim()))) lines.splice(j, 1)
        current = lines.join('\n').trim()
        continue
      }
    }
    if (HR.test(line.trim())) {
      lines.splice(i, 1)
      current = lines.join('\n').trim()
      continue
    }
    return current
  }
}

function leadingBlocks(text: string) {
  return text.split(/\n\s*\n/).map(block => block.trim()).filter(Boolean)
}

function listItems(block: string) {
  return block.split('\n').map(line => line.trim()).filter(line => LIST_ITEM.test(line))
}

function highlightBlock(block: string) {
  const items = listItems(block)
  if (items.length > 0 && items.length >= block.split('\n').filter(line => line.trim()).length * 0.6) {
    return items.slice(0, 3).join('\n')
  }
  return block
}

const MAX_SUMMARY_LENGTH = 400

function truncateSummary(summary: string) {
  if (summary.length <= MAX_SUMMARY_LENGTH) return summary
  const cut = summary.slice(0, MAX_SUMMARY_LENGTH - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > 80 ? cut.slice(0, lastSpace) : cut}…`
}

function summaryFrom(text: string) {
  const blocks = leadingBlocks(text)
  if (blocks.length === 0) return null
  const content = blocks.find(block => !HEADING.test(block.split('\n')[0]!.trim()) || block.split('\n').length > 1)
  if (content) return truncateSummary(highlightBlock(content))
  // Solo encabezados: usa el primero como contexto mínimo.
  return truncateSummary(blocks[0]!.split('\n').slice(0, 2).join('\n'))
}

function normalizeUrl(url: string | null | undefined) {
  const raw = String(url ?? '').trim()
  if (!raw) return null
  if (/[\u0000-\u0020]/.test(raw)) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:') return null
    return parsed.href
  } catch {
    return null
  }
}

export function prepareReleaseNotes(input: PrepareReleaseInput): PreparedRelease {
  const version = normalizeVersion(input.version)
  const url = normalizeUrl(input.url)
  const notes = input.notes
  if (notes === null || notes === undefined) {
    return { version, summary: null, fullNotes: null, url, hasNotes: false }
  }
  const cleaned = stripDuplicateLead(trimLines(stripBom(normalizeNewlines(String(notes)))), version)
  if (!cleaned) {
    return { version, summary: null, fullNotes: null, url, hasNotes: false }
  }
  return { version, summary: summaryFrom(cleaned), fullNotes: cleaned, url, hasNotes: true }
}
