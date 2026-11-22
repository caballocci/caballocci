import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { TestContext } from 'node:test'
import { exportPostForPhone, orderPhoneFiles, phoneExportFolderName } from '../../electron/media-export.ts'
import type { PhoneFile, PhonePost } from '../../electron/media-export.ts'

const post = (id: string, title: string): PhonePost => ({
  id,
  title,
  caption: 'Hola',
  hashtags: [],
  mentions: [],
  platforms: ['instagram'],
  scheduledAt: null,
})

function tempRoot(t: TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caballocci-export-edges-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test('phoneExportFolderName normaliza fechas, títulos vacíos y espacios por defecto', () => {
  assert.equal(phoneExportFolderName({ title: '', scheduledAt: '2026-06-15T10:20:00' }), '2026-06-15_1020_sin-titulo')
  assert.equal(phoneExportFolderName({ title: 'Nota', scheduledAt: 'no-fecha' }), 'sin-fecha_nota')
  assert.equal(phoneExportFolderName({ title: '¡Hola, mundo!', scheduledAt: null }), 'sin-fecha_hola-mundo')

  const batch = { title: 'Nota', scheduledAt: null, batch: 'A', spaceName: '' }
  assert.equal(phoneExportFolderName({ ...batch, spaceOrder: 0 }), 'A-general-1-nota-sin-fecha')
  assert.equal(phoneExportFolderName({ ...batch, spaceOrder: -3 }), 'A-general-1-nota-sin-fecha')
  assert.equal(phoneExportFolderName({ ...batch, spaceOrder: 1.5 }), 'A-general-1-nota-sin-fecha')
  assert.equal(phoneExportFolderName({ ...batch, spaceOrder: Number.NaN }), 'A-general-1-nota-sin-fecha')
  assert.equal(phoneExportFolderName({ ...batch, spaceName: '   ' }), 'A-sin-titulo-1-nota-sin-fecha')
})

test('orderPhoneFiles deja fijas las portadas y las etiquetadas como otras, y ordena el resto', () => {
  const files: PhoneFile[] = [
    { name: 'extra.png', sourcePath: 'extra' },
    { name: 'portada.png', sourcePath: 'cover', sequence: 99 },
    { name: '05.png', sourcePath: 'five' },
    { name: '02.png', sourcePath: 'two' },
    { name: 'final.png', sourcePath: 'closing' },
    { name: 'nota.png', sourcePath: 'other', presentationRole: 'other' },
    { name: 'sinSecuencia.png', sourcePath: 'last', presentationRole: 'slide', sequence: null },
  ]

  assert.deepEqual(orderPhoneFiles(files).map(file => file.sourcePath), [
    'extra', 'cover', 'two', 'five', 'closing', 'other', 'last',
  ])
})

test('orderPhoneFiles respeta un rol explícito aunque el nombre sugiera otra cosa', () => {
  const files: PhoneFile[] = [
    { name: '01-portada.png', sourcePath: 'representative', presentationRole: 'representative' },
    { name: '02.png', sourcePath: 'two' },
    { name: '01.png', sourcePath: 'one' },
  ]

  assert.deepEqual(orderPhoneFiles(files).map(file => file.sourcePath), ['representative', 'one', 'two'])
})

test('un post sin archivos exporta solo el manifiesto y normaliza etiquetas vacías', t => {
  const root = tempRoot(t)
  const result = exportPostForPhone(root, {
    ...post('post-vacio', 'Sin media'),
    caption: '  Hola  ',
    hashtags: ['#uno', '  ', 'dos'],
    mentions: ['amiga', ''],
  }, [])

  const folder = path.join(root, result.folderName)
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8')) as { files: string[] }

  assert.equal(result.folderName, 'sin-fecha_sin-media')
  assert.equal(result.exported, 0)
  assert.deepEqual(result.warnings, [])
  assert.deepEqual(manifest.files, [])
  assert.equal(fs.readFileSync(path.join(folder, 'caption.txt'), 'utf8'), 'Hola\n\n#uno #dos @amiga')
})

test('exportPostForPhone usa tres dígitos con cien archivos y avisa de los GIF', t => {
  const root = tempRoot(t)
  const files: PhoneFile[] = Array.from({ length: 100 }, (_, index) => {
    const name = index === 50 ? 'anim.gif' : ` foto-${index}.png`
    const sourcePath = path.join(root, `source-${index}`)
    fs.writeFileSync(sourcePath, `file-${index}`)
    return { name, sourcePath }
  })

  const result = exportPostForPhone(root, post('post-cien', 'Cien fotos'), files)
  const folder = path.join(root, result.folderName)

  assert.equal(result.exported, 100)
  assert.deepEqual(result.warnings, [{ name: 'anim.gif', reason: 'format-may-not-upload' }])
  assert.equal(fs.readFileSync(path.join(folder, '001.png'), 'utf8'), 'file-0')
  assert.equal(fs.readFileSync(path.join(folder, '051.gif'), 'utf8'), 'file-50')
  assert.equal(fs.readFileSync(path.join(folder, '100.png'), 'utf8'), 'file-99')
})

test('un manifiesto corrupto o una carpeta llamada manifest.json no impiden reexportar', t => {
  const root = tempRoot(t)
  const sourcePath = path.join(root, 'source.png')
  fs.writeFileSync(sourcePath, 'image')
  const files = [{ name: 'photo.png', sourcePath }]
  const first = exportPostForPhone(root, post('post-123', 'Primero'), files)

  const broken = path.join(root, 'roto')
  fs.mkdirSync(broken)
  fs.writeFileSync(path.join(broken, 'manifest.json'), '{roto')
  const fake = path.join(root, 'falso')
  fs.mkdirSync(path.join(fake, 'manifest.json'), { recursive: true })

  const second = exportPostForPhone(root, post('post-123', 'Segundo'), files)
  const folders = fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => {
      if (!entry.isDirectory()) return false
      const manifest = path.join(root, entry.name, 'manifest.json')
      if (!fs.existsSync(manifest) || !fs.statSync(manifest).isFile()) return false
      try {
        return (JSON.parse(fs.readFileSync(manifest, 'utf8')) as { postId?: unknown }).postId === 'post-123'
      } catch {
        return false
      }
    })
    .map(entry => entry.name)

  assert.notEqual(first.folderName, second.folderName)
  assert.deepEqual(folders, [second.folderName])
})

test('el sufijo de colisión se sanitiza, se reutiliza y cae a post con id vacío', t => {
  const root = tempRoot(t)
  const sourcePath = path.join(root, 'source.png')
  fs.writeFileSync(sourcePath, 'image')
  const files = [{ name: 'photo.png', sourcePath }]

  const first = exportPostForPhone(root, post('post-a-1', 'Título'), files)
  const second = exportPostForPhone(root, post('post-a-2', 'Título'), files)
  const third = exportPostForPhone(root, post('post-a-3', 'Título'), files)
  const anonymous = exportPostForPhone(root, post('', 'Título'), files)

  assert.equal(first.folderName, 'sin-fecha_titulo')
  assert.equal(second.folderName, 'sin-fecha_titulo-post-a')
  assert.equal(third.folderName, 'sin-fecha_titulo-post-a-2')
  assert.equal(anonymous.folderName, 'sin-fecha_titulo-post')
})
