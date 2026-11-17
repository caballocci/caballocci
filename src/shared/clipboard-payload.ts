/**
 * Portapapeles semántico de caballocci.
 *
 * Toda copia escribe en el portapapeles del sistema el texto plano visible
 * (idéntico a lo que siempre se copió) y, además, un manifiesto estructurado
 * embebido como comentario en el canal HTML. Al pegar fuera de la app solo
 * existe el texto plano; al pegar dentro, el manifiesto permite reconstruir
 * la estructura (diapositivas, campos) sin depender de parsear texto.
 *
 * El manifiesto viaja como datos puros: sin ids vivos ni estado de sesión.
 * Los ids de origen son referenciales y se regeneran al pegar.
 */

export const CLIPBOARD_PAYLOAD_MARKER = 'CABALLOCCI-CLIPBOARD'
export const CLIPBOARD_PAYLOAD_VERSION = 1

/** Una diapositiva copiada (título y/o texto; al menos uno no vacío). */
export interface ClipboardSlideItem {
  kind: 'slide'
  title: string
  text: string
  sourceId?: string
}

/** Un campo de publicación copiado (caption, notas, etc.). */
export interface ClipboardFieldItem {
  kind: 'field'
  field: string
  text: string
  sourceId?: string
}

export type ClipboardItem = ClipboardSlideItem | ClipboardFieldItem

export interface ClipboardPayload {
  app: 'caballocci'
  version: number
  items: ClipboardItem[]
}

/** Lo que se entrega al IPC: texto plano siempre, HTML opcional. */
export interface ClipboardRequest {
  text: string
  html?: string
}

// Límites alineados con los maxLength del editor (título de diapositiva 160,
// texto de diapositiva 10 000) para que el filtrado nunca recorte contenido
// que la app pueda haber producido; actúan como defensa contra portapapeles
// ajenos o manipulados.
const SLIDE_TITLE_MAX = 160
const SLIDE_TEXT_MAX = 10_000
const FIELD_NAME_MAX = 64
const FIELD_TEXT_MAX = 50_000
const SOURCE_ID_MAX = 128
const MAX_ITEMS = 500

const MARKER_PATTERN = new RegExp(`<!--${CLIPBOARD_PAYLOAD_MARKER}:([A-Za-z0-9+/=]+)-->`)

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index])
  return btoa(binary)
}

function decodeBase64(value: string): string {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function validSlideItem(value: unknown): ClipboardSlideItem | null {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Record<string, unknown>
  if (item.kind !== 'slide') return null
  const title = typeof item.title === 'string' && item.title.length <= SLIDE_TITLE_MAX ? item.title : ''
  const text = typeof item.text === 'string' && item.text.length <= SLIDE_TEXT_MAX ? item.text : ''
  if (!title.trim() && !text.trim()) return null
  return typeof item.sourceId === 'string' && item.sourceId.length > 0 && item.sourceId.length <= SOURCE_ID_MAX
    ? { kind: 'slide', title, text, sourceId: item.sourceId }
    : { kind: 'slide', title, text }
}

function validFieldItem(value: unknown): ClipboardFieldItem | null {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Record<string, unknown>
  if (item.kind !== 'field') return null
  const field = typeof item.field === 'string' && item.field.length > 0 && item.field.length <= FIELD_NAME_MAX ? item.field : ''
  const text = typeof item.text === 'string' && item.text.length <= FIELD_TEXT_MAX ? item.text : ''
  if (!field || !text.trim()) return null
  return typeof item.sourceId === 'string' && item.sourceId.length > 0 && item.sourceId.length <= SOURCE_ID_MAX
    ? { kind: 'field', field, text, sourceId: item.sourceId }
    : { kind: 'field', field, text }
}

/** Descarta items inválidos (tipo desconocido, campo vacío, tamaño excedido). */
function sanitizeItems(items: unknown): ClipboardItem[] {
  if (!Array.isArray(items) || items.length > MAX_ITEMS) return []
  const valid: ClipboardItem[] = []
  for (const candidate of items) {
    const slide = validSlideItem(candidate)
    if (slide) { valid.push(slide); continue }
    const field = validFieldItem(candidate)
    if (field) valid.push(field)
  }
  return valid
}

/**
 * Agrega el manifiesto al contenido a copiar. El texto plano sale idéntico
 * al recibido; el HTML lo muestra (escapado) y añade el manifiesto como
 * comentario. Si ningún item es válido devuelve solo el texto.
 */
export function withClipboardPayload(text: string, items: ClipboardItem[]): ClipboardRequest {
  const validItems = sanitizeItems(items)
  if (!validItems.length) return { text }
  const payload = encodeBase64(JSON.stringify({ app: 'caballocci', version: CLIPBOARD_PAYLOAD_VERSION, items: validItems }))
  if (text.length + payload.length > 1_000_000) return { text }
  const html = `<div style="white-space: pre-wrap">${escapeHtml(text)}</div><!--${CLIPBOARD_PAYLOAD_MARKER}:${payload}-->`
  return { text, html }
}

/**
 * Lee el manifiesto de un HTML de portapapeles. Devuelve null cuando el HTML
 * no viene de esta app, está corrupto o no tiene items válidos: el pegado
 * entonces cae al parseo del texto plano.
 */
export function readClipboardPayload(html: string | null | undefined): ClipboardPayload | null {
  if (typeof html !== 'string' || html.length > 1_000_000) return null
  const match = MARKER_PATTERN.exec(html)
  if (!match) return null
  let payload: unknown
  try {
    payload = JSON.parse(decodeBase64(match[1]))
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null) return null
  const manifest = payload as Record<string, unknown>
  if (manifest.app !== 'caballocci' || manifest.version !== CLIPBOARD_PAYLOAD_VERSION) return null
  const items = sanitizeItems(manifest.items)
  if (!items.length) return null
  return { app: 'caballocci', version: CLIPBOARD_PAYLOAD_VERSION, items }
}

const SLIDE_LABEL_PATTERN = /^DIAPOSITIVA\s+\d{1,3}$/i
const SLIDE_SEPARATOR_PATTERN = /^\s*-{3,}\s*$/
/**
 * Fallback sin manifiesto: convierte texto plano en diapositivas.
 * Reconoce el formato etiquetado ("DIAPOSITIVA 01"), el separado por `---`
 * y, sin ninguna estructura, parte por líneas en blanco. En cada bloque,
 * la primera línea es el título y el resto el texto; un bloque de una sola
 * línea se interpreta como texto.
 */
export function parseSlidesFromText(text: string): Array<{ title: string; text: string }> {
  const trimmed = typeof text === 'string' ? text.trim() : ''
  if (!trimmed) return []
  const lines = trimmed.split(/\r?\n/)
  const labeled = lines.some(line => SLIDE_LABEL_PATTERN.test(line.trim()))
  const separated = lines.some(line => SLIDE_SEPARATOR_PATTERN.test(line))
  let chunks: string[]
  if (labeled || separated) {
    const groups: string[] = []
    let current: string[] = []
    for (const line of lines) {
      if (SLIDE_LABEL_PATTERN.test(line.trim()) || SLIDE_SEPARATOR_PATTERN.test(line)) {
        groups.push(current.join('\n'))
        current = []
        continue
      }
      current.push(line)
    }
    groups.push(current.join('\n'))
    chunks = groups
  } else {
    chunks = trimmed.split(/(?:\r?\n)\s*(?:\r?\n)/)
  }
  const slides: Array<{ title: string; text: string }> = []
  for (const chunk of chunks) {
    const contentLines = chunk.split(/\r?\n/)
    while (contentLines.length && !contentLines[0].trim()) contentLines.shift()
    while (contentLines.length && !contentLines[contentLines.length - 1].trim()) contentLines.pop()
    if (!contentLines.length) continue
    let title = ''
    let bodyLines = contentLines
    if (contentLines.length > 1) {
      title = contentLines[0].trim().slice(0, SLIDE_TITLE_MAX)
      bodyLines = contentLines.slice(1)
    }
    const slideText = bodyLines.join('\n').slice(0, SLIDE_TEXT_MAX)
    if (!title && !slideText.trim()) continue
    slides.push({ title, text: slideText })
    if (slides.length >= MAX_ITEMS) break
  }
  return slides
}

/** Campos de publicación copiables, en el orden en que se escriben. */
export const CLIPBOARD_POST_FIELDS = ['title', 'caption', 'notes', 'hashtags'] as const
export type ClipboardPostField = typeof CLIPBOARD_POST_FIELDS[number]

export interface PostCopyInput {
  title: string
  caption: string
  notes: string
  hashtags: string[]
  ideaBlocks: Array<{ title: string; text: string }>
  sourceId?: string
}

export interface PostCopyOptions {
  fields: Record<ClipboardPostField, boolean>
  slides: { include: boolean; mode: 'slide' | 'text'; labels: boolean }
  /** Antepone una línea "ID:" al texto para volver a actualizar las mismas publicaciones al pegar. */
  includeId?: boolean
}

/** Preferencia que recuerda la última selección del diálogo "Copiar publicación…". */
export const POST_COPY_PREFERENCE_KEY = 'caballocci.clipboard.postCopySelection'

/**
 * Lee (y valida estrictamente) la selección recordada. Cualquier forma
 * inválida devuelve null: el diálogo entonces usa sus valores por defecto.
 */
export function readPostCopyOptions(raw: string | null | undefined): PostCopyOptions | null {
  if (!raw || raw.length > 4_000) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  const fields = candidate.fields
  const slides = candidate.slides
  if (typeof fields !== 'object' || fields === null || typeof slides !== 'object' || slides === null) return null
  const fieldRecord = fields as Record<string, unknown>
  const slideRecord = slides as Record<string, unknown>
  const options: PostCopyOptions = { fields: { title: false, caption: false, notes: false, hashtags: false }, slides: { include: false, mode: 'slide', labels: false }, includeId: false }
  for (const field of CLIPBOARD_POST_FIELDS) {
    if (typeof fieldRecord[field] !== 'boolean') return null
    options.fields[field] = fieldRecord[field] as boolean
  }
  if (typeof slideRecord.include !== 'boolean' || typeof slideRecord.labels !== 'boolean') return null
  if (slideRecord.mode !== 'slide' && slideRecord.mode !== 'text') return null
  options.slides = { include: slideRecord.include, mode: slideRecord.mode, labels: slideRecord.labels }
  // includeId es opcional para seguir aceptando selecciones guardadas antes de que existiera.
  if (candidate.includeId !== undefined) {
    if (typeof candidate.includeId !== 'boolean') return null
    options.includeId = candidate.includeId
  }
  return options
}

export interface PostCopyResult {
  text: string
  html?: string
  postCount: number
  fieldCount: number
  slideCount: number
  /** Resumen legible: "2 campos + 5 diapositivas (solo texto)". */
  summary: string
}

const POST_FIELD_HEADERS: Record<ClipboardPostField, string> = {
  title: 'TÍTULO',
  caption: 'TEXTO',
  notes: 'NOTAS',
  hashtags: 'HASHTAGS',
}

/** Normaliza hashtags a "#tag" separados por espacio. */
export function formatHashtagList(hashtags: string[]): string {
  return hashtags
    .map(tag => tag.trim())
    .filter(Boolean)
    .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
    .join(' ')
}

function summarizeCopy(postCount: number, fieldCount: number, slideCount: number, mode: 'slide' | 'text', includePostCount: boolean): string {
  const detail: string[] = []
  if (fieldCount) detail.push(`${fieldCount} ${fieldCount === 1 ? 'campo' : 'campos'}`)
  if (slideCount) detail.push(`${slideCount} ${slideCount === 1 ? 'diapositiva' : 'diapositivas'} (${mode === 'slide' ? 'título y texto' : 'solo texto'})`)
  const head = includePostCount && postCount ? `${postCount} ${postCount === 1 ? 'publicación' : 'publicaciones'}` : ''
  if (!head) return detail.join(' + ') || 'Nada seleccionado'
  return detail.length ? `${head} · ${detail.join(' + ')}` : head
}

/** Secciones de texto plano + items del manifiesto de una publicación. */
function buildPostSections(post: PostCopyInput, options: PostCopyOptions) {
  const sections: string[] = []
  const items: ClipboardItem[] = []
  let fieldCount = 0
  // El ID viaja siempre en el manifiesto; la línea visible es opcional,
  // para poder volver a actualizar las mismas publicaciones desde el texto.
  if (options.includeId && post.sourceId) sections.push(`ID:\n${post.sourceId}`)
  for (const field of CLIPBOARD_POST_FIELDS) {
    if (!options.fields[field]) continue
    const value = field === 'hashtags' ? formatHashtagList(post.hashtags) : post[field].trim()
    if (!value) continue
    sections.push(`${POST_FIELD_HEADERS[field]}:\n${value}`)
    items.push(post.sourceId ? { kind: 'field', field, text: value, sourceId: post.sourceId } : { kind: 'field', field, text: value })
    fieldCount += 1
  }
  let slideCount = 0
  if (options.slides.include) {
    const withContent = post.ideaBlocks
      .map((block, index) => ({ block, slideNumber: index + 1 }))
      .filter(({ block }) => options.slides.mode === 'slide' ? Boolean(block.title.trim() || block.text.trim()) : Boolean(block.text.trim()))
    for (const { block, slideNumber } of withContent) {
      const content = options.slides.mode === 'slide'
        ? [block.title.trim(), block.text.trim()].filter(Boolean).join('\n')
        : block.text.trim()
      if (!content) continue
      sections.push(options.slides.labels ? `DIAPOSITIVA ${String(slideNumber).padStart(2, '0')}\n${content}` : content)
      const slideItem: ClipboardSlideItem = { kind: 'slide', title: options.slides.mode === 'slide' ? block.title.trim() : '', text: block.text.trim() }
      items.push(post.sourceId ? { ...slideItem, sourceId: post.sourceId } : slideItem)
      slideCount += 1
    }
  }
  return { sections, items, fieldCount, slideCount }
}

/**
 * Arma la copia de una publicación (o de sus partes elegidas): texto plano
 * legible por secciones + manifiesto con cada campo y diapositiva. Igual que
 * en la vista de diapositivas, el manifiesto refleja exactamente lo que
 * muestra el texto; "solo texto" viaja con títulos vacíos.
 */
export function buildPostCopy(post: PostCopyInput, options: PostCopyOptions): PostCopyResult {
  const { sections, items, fieldCount, slideCount } = buildPostSections(post, options)
  const text = sections.join('\n\n')
  if (!text) return { text: '', postCount: 1, fieldCount: 0, slideCount: 0, summary: 'Nada seleccionado' }
  const request = withClipboardPayload(text, items)
  return { text: request.text, html: request.html, postCount: 1, fieldCount, slideCount, summary: summarizeCopy(1, fieldCount, slideCount, options.slides.mode, false) }
}

/**
 * Copia de varias publicaciones: cada una como bloque con separador
 * "=== PUBLICACIÓN NN ===" y el manifiesto agrupando por id de origen.
 */
export function buildMultiPostCopy(posts: PostCopyInput[], options: PostCopyOptions): PostCopyResult {
  if (posts.length === 1) return buildPostCopy(posts[0], options)
  const allItems: ClipboardItem[] = []
  const blocks: string[] = []
  let fieldCount = 0
  let slideCount = 0
  for (const post of posts) {
    const { sections, items, fieldCount: postFields, slideCount: postSlides } = buildPostSections(post, options)
    if (!sections.length) continue
    blocks.push(`=== PUBLICACIÓN ${String(blocks.length + 1).padStart(2, '0')} ===\n${sections.join('\n\n')}`)
    allItems.push(...items)
    fieldCount += postFields
    slideCount += postSlides
  }
  const text = blocks.join('\n\n')
  if (!text) return { text: '', postCount: 0, fieldCount: 0, slideCount: 0, summary: 'Nada seleccionado' }
  const request = withClipboardPayload(text, allItems)
  return { text: request.text, html: request.html, postCount: blocks.length, fieldCount, slideCount, summary: summarizeCopy(blocks.length, fieldCount, slideCount, options.slides.mode, true) }
}

/** Publicación reconstruida desde el portapapeles (manifiesto o texto plano). */
export interface ParsedPost {
  /** Id de origen, desde el manifiesto o la línea "ID:" del texto. */
  id?: string
  title: string
  caption: string
  notes: string
  hashtags: string[]
  slides: Array<{ title: string; text: string }>
}

/** Agrupa items del manifiesto en publicaciones por id de origen. */
export function groupPayloadPosts(items: ClipboardItem[]): ParsedPost[] {
  const groups = new Map<string, ParsedPost>()
  const order: string[] = []
  const groupOf = (key: string) => {
    let group = groups.get(key)
    if (!group) {
      group = { title: '', caption: '', notes: '', hashtags: [], slides: [] }
      // El id de origen del manifiesto es el destino al actualizar por id.
      if (key) group.id = key
      groups.set(key, group)
      order.push(key)
    }
    return group
  }
  for (const item of items) {
    if (item.kind === 'field') {
      const group = groupOf(item.sourceId ?? '')
      if (item.field === 'hashtags') group.hashtags.push(...item.text.split(/\s+/).filter(Boolean))
      else if (item.field === 'title' || item.field === 'caption' || item.field === 'notes') group[item.field] = item.text
    } else if (item.kind === 'slide') {
      groupOf(item.sourceId ?? '').slides.push({ title: item.title, text: item.text })
    }
  }
  return order.map(key => groups.get(key)!)
}

/** Campos con contenido en una publicación reconstruida (para "Aplicar campos a…"). */
export function availableParsedFields(post: ParsedPost): ClipboardPostField[] {
  const available: ClipboardPostField[] = []
  if (post.title.trim()) available.push('title')
  if (post.caption.trim()) available.push('caption')
  if (post.notes.trim()) available.push('notes')
  if (post.hashtags.length) available.push('hashtags')
  return available
}

const POST_FIELD_HEADER_PATTERN = /^(T[ÍI]TULO|TEXTO|NOTAS|HASHTAGS):\s*$/i
const POST_FIELD_KEYS = { TÍTULO: 'title', TITULO: 'title', TEXTO: 'caption', NOTAS: 'notes', HASHTAGS: 'hashtags' } as const
// La línea "ID:" del viaje externo: solo se acepta un id con forma de UUID
// para que un "ID:" cualquiera de un texto ajeno no trague contenido.
const POST_ID_HEADER_PATTERN = /^ID:\s*$/i
const POST_ID_VALUE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const POST_SEPARATOR_PATTERN = /^\s*={3,}(?:\s*PUBLICACI[ÓO]N\s+\d{1,3})?\s*={0,3}\s*$/i

function parsePostBlock(block: string): ParsedPost | null {
  const post: ParsedPost = { title: '', caption: '', notes: '', hashtags: [], slides: [] }
  const slideMaterial: string[] = []
  let current: 'title' | 'caption' | 'notes' | 'hashtags' | 'id' | null = null
  for (const line of block.split(/\r?\n/)) {
    const header = POST_FIELD_HEADER_PATTERN.exec(line.trim())
    if (header) {
      current = POST_FIELD_KEYS[header[1].toUpperCase() as keyof typeof POST_FIELD_KEYS]
      continue
    }
    if (POST_ID_HEADER_PATTERN.test(line.trim())) {
      current = 'id'
      continue
    }
    if (current === 'id') {
      const candidate = line.trim()
      if (!candidate) continue
      current = null
      if (POST_ID_VALUE_PATTERN.test(candidate)) {
        post.id = candidate
        continue
      }
      // Un valor que no es id cae al procesamiento normal (material de diapositivas).
    }
    if (current === 'hashtags') {
      post.hashtags.push(...line.split(/\s+/).filter(Boolean))
      continue
    }
    // Una etiqueta de diapositiva o un separador termina la sección de campo:
    // lo que sigue es material de diapositivas.
    if (current && (SLIDE_LABEL_PATTERN.test(line.trim()) || SLIDE_SEPARATOR_PATTERN.test(line))) current = null
    if (current) {
      post[current] = post[current] ? `${post[current]}\n${line}` : line
      continue
    }
    slideMaterial.push(line)
  }
  post.title = post.title.trim()
  post.caption = post.caption.trim()
  post.notes = post.notes.trim()
  post.slides = parseSlidesFromText(slideMaterial.join('\n'))
  if (!post.title && !post.caption && !post.notes && !post.hashtags.length && !post.slides.length) return null
  return post
}

/**
 * Fallback sin manifiesto para pegar como publicaciones: reconoce las
 * secciones TÍTULO/TEXTO/NOTAS/HASHTAGS y separa varias publicaciones por
 * líneas de "=". El contenido fuera de secciones se trata como diapositivas.
 */
export function parsePostsFromText(text: string): ParsedPost[] {
  const trimmed = typeof text === 'string' ? text.trim() : ''
  if (!trimmed) return []
  const chunks: string[] = []
  let current: string[] = []
  for (const line of trimmed.split(/\r?\n/)) {
    if (POST_SEPARATOR_PATTERN.test(line)) {
      chunks.push(current.join('\n'))
      current = []
      continue
    }
    current.push(line)
  }
  chunks.push(current.join('\n'))
  return chunks.map(parsePostBlock).filter((post): post is ParsedPost => post !== null)
}

/** De dónde salió un pegado: manifiesto propio, texto con formato de la app o texto libre. */
export type ClipboardPasteSource = 'manifest' | 'structured' | 'freeform'

/**
 * ¿El texto sigue el formato de la app? Detecta los encabezados de campo
 * (TÍTULO:, TEXTO:, …), las etiquetas DIAPOSITIVA NN y los separadores
 * (--- y === PUBLICACIÓN NN ===). Sirve para distinguir un pegado
 * estructurado de uno de texto libre y avisar cuando este último puede
 * no interpretarse como se espera.
 */
export function isStructuredPostText(text: string): boolean {
  const trimmed = typeof text === 'string' ? text.trim() : ''
  if (!trimmed) return false
  return trimmed.split(/\r?\n/).some(line => {
    const candidate = line.trim()
    return POST_FIELD_HEADER_PATTERN.test(candidate) || SLIDE_LABEL_PATTERN.test(candidate)
      || SLIDE_SEPARATOR_PATTERN.test(line) || POST_SEPARATOR_PATTERN.test(line)
  })
}
