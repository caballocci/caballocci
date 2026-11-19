import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMultiPostCopy, buildPostCopy, availableParsedFields, CLIPBOARD_PAYLOAD_MARKER, formatHashtagList, groupPayloadPosts, isStructuredPostText, parsePostsFromText, parseSlidesFromText, POST_COPY_PREFERENCE_KEY, readClipboardPayload, readPostCopyOptions, withClipboardPayload } from '../../src/shared/clipboard-payload.ts'

const slides = [
  { kind: 'slide', title: 'Apertura', text: 'Texto de la diapositiva 1' },
  { kind: 'slide', title: 'Cierre con acentos y 🐴', text: 'Línea 1\nLínea 2' },
] as const

test('sin items validos devuelve solo el texto plano, sin html', () => {
  const request = withClipboardPayload('texto visible', [])
  assert.deepEqual(request, { text: 'texto visible' })
})

test('los items inválidos se descartan y el resultado vuelve a ser solo texto', () => {
  const request = withClipboardPayload('texto visible', [
    { kind: 'unknown' } as never,
    { kind: 'slide', title: '', text: '   ' },
  ])
  assert.deepEqual(request, { text: 'texto visible' })
})

test('el texto plano se conserva exacto y el html incluye el texto escapado', () => {
  const text = 'DIAPOSITIVA 01\nApertura\nContenido & <especial>'
  const request = withClipboardPayload(text, slides as unknown as Parameters<typeof withClipboardPayload>[1])
  assert.equal(request.text, text)
  assert.ok(request.html?.includes('Contenido &amp; &lt;especial&gt;'))
  assert.ok(request.html?.includes(`<!--${CLIPBOARD_PAYLOAD_MARKER}:`))
})

test('ida y vuelta: diapositivas con acentos y saltos de línea sobreviven intactas', () => {
  const request = withClipboardPayload('cualquier texto', slides as unknown as Parameters<typeof withClipboardPayload>[1])
  const payload = readClipboardPayload(request.html)
  assert.deepEqual(payload, {
    app: 'caballocci',
    version: 1,
    items: slides.map(slide => ({ ...slide })),
  })
})

test('ida y vuelta: campos de publicación conservan el id de origen', () => {
  const request = withClipboardPayload('caption', [
    { kind: 'field', field: 'caption', text: 'Texto para publicar', sourceId: 'post-123' },
  ])
  const payload = readClipboardPayload(request.html)
  assert.deepEqual(payload?.items, [{ kind: 'field', field: 'caption', text: 'Texto para publicar', sourceId: 'post-123' }])
})

test('html sin manifiesto, corrupto o de otra app devuelve null', () => {
  assert.equal(readClipboardPayload(undefined), null)
  assert.equal(readClipboardPayload('<div>texto común</div>'), null)
  assert.equal(readClipboardPayload(`<!--${CLIPBOARD_PAYLOAD_MARKER}:!!!!no-es-base64!-->`), null)
  assert.equal(readClipboardPayload(`<!--${CLIPBOARD_PAYLOAD_MARKER}:${btoa('{json roto')}-->`), null)
  assert.equal(readClipboardPayload(`<!--${CLIPBOARD_PAYLOAD_MARKER}:${btoa('{"app":"otra","version":1,"items":[]}')}-->`), null)
  assert.equal(readClipboardPayload(`<!--${CLIPBOARD_PAYLOAD_MARKER}:${btoa('{"app":"caballocci","version":99,"items":[]}')}-->`), null)
  assert.equal(readClipboardPayload(`<!--${CLIPBOARD_PAYLOAD_MARKER}:${btoa('{"app":"caballocci","version":1,"items":[]}')}-->`), null)
})

test('los campos que exceden los límites se descartan por campo, salvando lo válido', () => {
  const oversize = JSON.stringify({
    app: 'caballocci',
    version: 1,
    items: [
      { kind: 'slide', title: 'x'.repeat(161), text: 'valido' },
      { kind: 'slide', title: 'otra', text: 'valido' },
    ],
  })
  const html = `<div>x</div><!--${CLIPBOARD_PAYLOAD_MARKER}:${btoa(oversize)}-->`
  const payload = readClipboardPayload(html)
  assert.deepEqual(payload?.items, [
    { kind: 'slide', title: '', text: 'valido' },
    { kind: 'slide', title: 'otra', text: 'valido' },
  ])
})

test('el fallback parsea el formato etiquetado DIAPOSITIVA NN', () => {
  const text = 'DIAPOSITIVA 01\nApertura\nTexto 1\nDIAPOSITIVA 02\nCierre\nTexto 2'
  assert.deepEqual(parseSlidesFromText(text), [
    { title: 'Apertura', text: 'Texto 1' },
    { title: 'Cierre', text: 'Texto 2' },
  ])
})

test('una diapositiva etiquetada de una sola línea es texto, no título', () => {
  assert.deepEqual(parseSlidesFromText('DIAPOSITIVA 01\nsolo texto sin título'), [
    { title: '', text: 'solo texto sin título' },
  ])
})

test('el fallback parsea el formato separado por ---', () => {
  const text = 'Titulo A\nTexto A\n---\nTitulo B\nTexto B\n---\nTitulo C\nTexto C'
  assert.deepEqual(parseSlidesFromText(text), [
    { title: 'Titulo A', text: 'Texto A' },
    { title: 'Titulo B', text: 'Texto B' },
    { title: 'Titulo C', text: 'Texto C' },
  ])
})

test('texto sin estructura se parte por líneas en blanco; una línea es texto', () => {
  assert.deepEqual(parseSlidesFromText('Primera\n\nSegunda'), [
    { title: '', text: 'Primera' },
    { title: '', text: 'Segunda' },
  ])
  assert.deepEqual(parseSlidesFromText('solo un texto'), [{ title: '', text: 'solo un texto' }])
  assert.deepEqual(parseSlidesFromText('   \n  \n'), [])
})

const samplePost = {
  title: 'Mi publicación',
  caption: 'Texto para publicar',
  notes: 'Notas internas',
  hashtags: ['contenido', '#campaña'],
  ideaBlocks: [
    { title: 'Apertura', text: 'Diapositiva uno' },
    { title: '', text: 'Solo texto dos' },
    { title: 'Vacía', text: '' },
  ],
  sourceId: 'post-42',
}

test('la copia de publicación arma secciones etiquetadas y resume los campos', () => {
  const result = buildPostCopy(samplePost, { fields: { title: true, caption: true, notes: false, hashtags: false }, slides: { include: false, mode: 'slide', labels: true } })
  assert.equal(result.text, 'TÍTULO:\nMi publicación\n\nTEXTO:\nTexto para publicar')
  assert.equal(result.fieldCount, 2)
  assert.equal(result.slideCount, 0)
  assert.equal(result.summary, '2 campos')
  const payload = readClipboardPayload(result.html)
  assert.deepEqual(payload?.items, [
    { kind: 'field', field: 'title', text: 'Mi publicación', sourceId: 'post-42' },
    { kind: 'field', field: 'caption', text: 'Texto para publicar', sourceId: 'post-42' },
  ])
})

test('la copia de publicación incluye diapositivas con etiquetas y respeta el modo solo texto', () => {
  const result = buildPostCopy(samplePost, { fields: { title: false, caption: false, notes: false, hashtags: false }, slides: { include: true, mode: 'text', labels: true } })
  assert.equal(result.text, 'DIAPOSITIVA 01\nDiapositiva uno\n\nDIAPOSITIVA 02\nSolo texto dos')
  assert.equal(result.summary, '2 diapositivas (solo texto)')
  const payload = readClipboardPayload(result.html)
  assert.deepEqual(payload?.items, [
    { kind: 'slide', title: '', text: 'Diapositiva uno', sourceId: 'post-42' },
    { kind: 'slide', title: '', text: 'Solo texto dos', sourceId: 'post-42' },
  ])
})

test('sin etiquetas y modo completo, el bloque mantiene título y texto y acepta diapositivas de solo título', () => {
  const result = buildPostCopy(samplePost, { fields: { title: false, caption: false, notes: false, hashtags: false }, slides: { include: true, mode: 'slide', labels: false } })
  assert.equal(result.text, 'Apertura\nDiapositiva uno\n\nSolo texto dos\n\nVacía')
  assert.equal(result.summary, '3 diapositivas (título y texto)')
})

test('los hashtags se normalizan con # y la copia completa resume todo', () => {
  const result = buildPostCopy(samplePost, { fields: { title: true, caption: true, notes: true, hashtags: true }, slides: { include: true, mode: 'slide', labels: true } })
  assert.ok(result.text.includes('HASHTAGS:\n#contenido #campaña'))
  assert.ok(result.text.includes('NOTAS:\nNotas internas'))
  assert.equal(result.summary, '4 campos + 3 diapositivas (título y texto)')
})

test('selección vacía o sin contenido produce nada y el resumen lo dice', () => {
  const nothing = buildPostCopy(samplePost, { fields: { title: false, caption: false, notes: false, hashtags: false }, slides: { include: false, mode: 'slide', labels: true } })
  assert.equal(nothing.text, '')
  assert.equal(nothing.summary, 'Nada seleccionado')
  const emptyPost = { ...samplePost, title: '', caption: '', notes: '', hashtags: [] }
  const empties = buildPostCopy(emptyPost, { fields: { title: true, caption: true, notes: true, hashtags: true }, slides: { include: false, mode: 'slide', labels: true } })
  assert.equal(empties.text, '')
  assert.equal(empties.summary, 'Nada seleccionado')
})

const secondPost = {
  title: 'Otra publicación',
  caption: 'Segunda',
  notes: '',
  hashtags: ['#única'],
  ideaBlocks: [{ title: 'Única', text: 'Sola' }],
  sourceId: 'post-b',
}

test('la copia multi-publicación separa por === PUBLICACIÓN NN === y resume el total', () => {
  const result = buildMultiPostCopy([samplePost, secondPost], { fields: { title: true, caption: true, notes: false, hashtags: true }, slides: { include: true, mode: 'slide', labels: true } })
  assert.equal(result.postCount, 2)
  assert.ok(result.text.startsWith('=== PUBLICACIÓN 01 ===\nTÍTULO:\nMi publicación'))
  assert.ok(result.text.includes('=== PUBLICACIÓN 02 ===\nTÍTULO:\nOtra publicación'))
  assert.ok(result.text.includes('#única'))
  assert.equal(result.summary, '2 publicaciones · 6 campos + 4 diapositivas (título y texto)')
})

test('el manifiesto multi-publicación agrupa por id de origen y recupera cada diapositiva', () => {
  const result = buildMultiPostCopy([samplePost, secondPost], { fields: { title: true, caption: true, notes: false, hashtags: false }, slides: { include: true, mode: 'slide', labels: true } })
  const grouped = groupPayloadPosts(readClipboardPayload(result.html)?.items ?? [])
  assert.equal(grouped.length, 2)
  assert.equal(grouped[0].title, 'Mi publicación')
  assert.equal(grouped[0].slides.length, 3)
  assert.equal(grouped[1].title, 'Otra publicación')
  assert.deepEqual(grouped[1].slides[0], { title: 'Única', text: 'Sola' })
})

test('un manifiesto de solo diapositivas agrupa una publicación sin campos', () => {
  const grouped = groupPayloadPosts([{ kind: 'slide', title: 'T', text: 'X' }])
  assert.equal(grouped.length, 1)
  assert.deepEqual(grouped[0], { title: '', caption: '', notes: '', hashtags: [], slides: [{ title: 'T', text: 'X' }] })
})

test('el manifiesto expone el id de origen como id de la publicación', () => {
  const grouped = groupPayloadPosts([
    { kind: 'field', field: 'title', text: 'Con id', sourceId: '8f3a2b1c-1111-4222-8333-444455556666' },
    { kind: 'slide', title: '', text: 'Sola', sourceId: '8f3a2b1c-1111-4222-8333-444455556666' },
  ])
  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].id, '8f3a2b1c-1111-4222-8333-444455556666')
  assert.equal(grouped[0].title, 'Con id')
})

test('la línea ID del texto se reconoce como id de origen cuando tiene forma de uuid', () => {
  const parsed = parsePostsFromText('ID:\n8f3a2b1c-1111-4222-8333-444455556666\nTÍTULO:\nCon id\n\nTEXTO:\nresto')
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].id, '8f3a2b1c-1111-4222-8333-444455556666')
  assert.equal(parsed[0].title, 'Con id')
  assert.equal(parsed[0].caption, 'resto')
})

test('la línea ID con un valor que no es uuid se ignora y no rompe el parseo', () => {
  const parsed = parsePostsFromText('ID:\nno es un id\nTÍTULO:\nAlgo')
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].id, undefined)
  assert.equal(parsed[0].title, 'Algo')
  assert.deepEqual(parsed[0].slides, [{ title: '', text: 'no es un id' }])
})

test('includeId escribe la línea ID y el texto vuelve a parsear al mismo id', () => {
  const source = { ...samplePost, sourceId: '8f3a2b1c-1111-4222-8333-444455556666' }
  const result = buildPostCopy(source, { fields: { title: true, caption: true, notes: false, hashtags: false }, slides: { include: false, mode: 'slide', labels: true }, includeId: true })
  assert.ok(result.text.startsWith('ID:\n8f3a2b1c-1111-4222-8333-444455556666\n\nTÍTULO:\nMi publicación'))
  const parsed = parsePostsFromText(result.text)
  assert.equal(parsed[0].id, '8f3a2b1c-1111-4222-8333-444455556666')
  assert.equal(parsed[0].title, 'Mi publicación')
  assert.equal(parsed[0].caption, 'Texto para publicar')
})

test('sin includeId el texto queda como siempre (byte a byte)', () => {
  const result = buildPostCopy(samplePost, { fields: { title: true, caption: true, notes: false, hashtags: false }, slides: { include: false, mode: 'slide', labels: true }, includeId: false })
  assert.equal(result.text, 'TÍTULO:\nMi publicación\n\nTEXTO:\nTexto para publicar')
})

test('la copia multi-publicación con includeId antepone la línea ID a cada bloque', () => {
  const idA = '8f3a2b1c-1111-4222-8333-444455556666'
  const idB = '9b4c3d2e-5555-4666-8777-888899990000'
  const result = buildMultiPostCopy([{ ...samplePost, sourceId: idA }, { ...secondPost, sourceId: idB }], { fields: { title: true, caption: false, notes: false, hashtags: false }, slides: { include: false, mode: 'slide', labels: true }, includeId: true })
  assert.ok(result.text.includes(`=== PUBLICACIÓN 01 ===\nID:\n${idA}\n\nTÍTULO:\nMi publicación`))
  assert.ok(result.text.includes(`=== PUBLICACIÓN 02 ===\nID:\n${idB}\n\nTÍTULO:\nOtra publicación`))
  const parsed = parsePostsFromText(result.text)
  assert.deepEqual(parsed.map(post => post.id), [idA, idB])
})

test('el fallback parsea secciones TÍTULO/TEXTO/NOTAS/HASHTAGS y separa publicaciones por ===', () => {
  const text = [
    '=== PUBLICACIÓN 01 ===',
    'TÍTULO:',
    'Primera',
    'TEXTO:',
    'Caption de la primera',
    '=== PUBLICACIÓN 02 ===',
    'TEXTO:',
    'Solo caption segunda',
    'DIAPOSITIVA 01',
    'Diapositiva segunda',
  ].join('\n')
  const parsed = parsePostsFromText(text)
  assert.equal(parsed.length, 2)
  assert.deepEqual(parsed[0], { title: 'Primera', caption: 'Caption de la primera', notes: '', hashtags: [], slides: [] })
  assert.equal(parsed[1].title, '')
  assert.equal(parsed[1].caption, 'Solo caption segunda')
  assert.deepEqual(parsed[1].slides, [{ title: '', text: 'Diapositiva segunda' }])
})

test('el texto de una sola publicación sin separadores también se parsea', () => {
  const parsed = parsePostsFromText('TÍTULO:\nSolo\n\nTEXTO:\ncaption')
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].title, 'Solo')
  assert.equal(parsed[0].caption, 'caption')
})

test("los campos aplicables salen de la publicación reconstruida; 'Aplicar campos' exige exactamente una", () => {
  assert.deepEqual(availableParsedFields({ title: '', caption: 'hola', notes: '', hashtags: ['x'], slides: [] }), ['caption', 'hashtags'])
  assert.deepEqual(availableParsedFields({ title: 'Con todo', caption: 'y más', notes: 'notas', hashtags: ['#a', 'b'], slides: [] }), ['title', 'caption', 'notes', 'hashtags'])
  assert.deepEqual(availableParsedFields({ title: '', caption: '', notes: '', hashtags: [], slides: [{ title: 'solo', text: 'diapositivas' }] }), [])
})

test('formatHashtagList normaliza la lista para el preview de aplicar campos', () => {
  assert.equal(formatHashtagList(['contenido', '#campaña', '  ']), '#contenido #campaña')
})

test('isStructuredPostText detecta el formato de la app en todas sus variantes', () => {
  assert.equal(isStructuredPostText('=== PUBLICACIÓN 01 ===\nTÍTULO:\nAlgo\n\nTEXTO:\nresto\n\nDIAPOSITIVA 01\ncontenido'), true)
  assert.equal(isStructuredPostText('titulo:\nen minúsculas'), true)
  assert.equal(isStructuredPostText('TEXTO:\nsolo texto'), true)
  assert.equal(isStructuredPostText('DIAPOSITIVA 01\ncontenido'), true)
  assert.equal(isStructuredPostText('bloque uno\n---\nbloque dos'), true)
  assert.equal(isStructuredPostText('=== PUBLICACIÓN 02 ==='), true)
  assert.equal(isStructuredPostText('  TÍTULO:  '), true)
})

test('isStructuredPostText descarta el texto libre', () => {
  assert.equal(isStructuredPostText(''), false)
  assert.equal(isStructuredPostText('   \n  '), false)
  assert.equal(isStructuredPostText('Un párrafo cualquiera\nsin estructura'), false)
  // Encabezado con contenido en la misma línea: es texto, no sección.
  assert.equal(isStructuredPostText('TEXTO: en la misma línea'), false)
  assert.equal(isStructuredPostText('DIAPOSITIVA: etiqueta incompleta'), false)
})

test('la selección recordada del diálogo copiar sobrevive al ir y venir', () => {
  const options = {
    fields: { title: false, caption: true, notes: true, hashtags: false },
    slides: { include: true, mode: 'text' as const, labels: false },
    includeId: true,
  }
  const stored = JSON.stringify(options)
  assert.equal(POST_COPY_PREFERENCE_KEY, 'caballocci.clipboard.postCopySelection')
  assert.deepEqual(readPostCopyOptions(stored), options)
  assert.deepEqual(readPostCopyOptions(`\n${stored}\n`), options)
})

test('la selección recordada sin includeId sigue siendo válida (compatibilidad)', () => {
  assert.deepEqual(readPostCopyOptions('{"fields":{"title":true,"caption":true,"notes":false,"hashtags":false},"slides":{"include":true,"mode":"slide","labels":true}}'), {
    fields: { title: true, caption: true, notes: false, hashtags: false },
    slides: { include: true, mode: 'slide', labels: true },
    includeId: false,
  })
  assert.equal(readPostCopyOptions('{"fields":{"title":true,"caption":true,"notes":true,"hashtags":true},"slides":{"include":true,"mode":"slide","labels":true},"includeId":"sí"}'), null)
})

test('la selección recordada inválida se rechaza y cae a los valores por defecto', () => {
  assert.equal(readPostCopyOptions(undefined), null)
  assert.equal(readPostCopyOptions(''), null)
  assert.equal(readPostCopyOptions('{roto'), null)
  assert.equal(readPostCopyOptions('42'), null)
  assert.equal(readPostCopyOptions('{"fields":{},"slides":{"include":true,"mode":"slide","labels":true}}'), null)
  assert.equal(readPostCopyOptions('{"fields":{"title":true,"caption":true,"notes":true,"hashtags":true},"slides":{"include":true,"mode":"otro","labels":true}}'), null)
  assert.equal(readPostCopyOptions('{"fields":{"title":"sí","caption":true,"notes":true,"hashtags":true},"slides":{"include":true,"mode":"slide","labels":true}}'), null)
})
