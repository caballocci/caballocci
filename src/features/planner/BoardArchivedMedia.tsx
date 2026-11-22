import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Archive, ArchiveRestore, FolderOpen, Layers } from 'lucide-react'
import { statusMeta } from '../../shared/constants'
import type { Post, PostStatus, WorkGroup } from '../../shared/types'

type PendingMediaCompression = { target: 'group' | 'post'; id: string; name: string; mediaCount: number }

type BoardArchivedMediaProps = {
  archivedPosts: Post[]
  archivedGroups: WorkGroup[]
  collectionPosts: Post[]
  compressedPosts: Post[]
  showArchivedPosts: boolean
  showCompressedPosts: boolean
  setShowCompressedPosts: Dispatch<SetStateAction<boolean>>
  select(id: string): void
  setPendingMediaCompression: Dispatch<SetStateAction<PendingMediaCompression | null>>
  restorePostMedia(post: Post): void
  restoreGroup(group: WorkGroup): void
  restoreStack(ids: string[], status: PostStatus): void
  openGroup(group: WorkGroup): void
}

const ARCHIVED_PAGE_SIZE = 6
const restoreStages: PostStatus[] = ['idea', 'draft', 'review', 'approved']
type ArchivedEntry = { kind: 'stack'; stackId: string; posts: Post[] } | { kind: 'post'; post: Post }

function ArchivedStackCard({ posts, select, restoreStack }: { posts: Post[]; select(id: string): void; restoreStack(ids: string[], status: PostStatus): void }) {
  const [status, setStatus] = useState<PostStatus>('draft')
  const name = posts[0].stackName
  return <article className="board-archived-collection board-archived-stack">
    <header>
      <div>
        <span className="board-archived-stack-title"><Layers size={14} aria-hidden="true" /><strong>{name || posts[0].title || 'Pila sin título'}</strong></span>
        <span>{posts.length} {posts.length === 1 ? 'publicación' : 'publicaciones'}</span>
      </div>
      <div className="board-archived-stack-actions">
        <label className="board-archived-stack-stage">Restaurar en<select value={status} onChange={event => setStatus(event.target.value as PostStatus)} aria-label="Etapa al restaurar la pila">{restoreStages.map(stage => <option key={stage} value={stage}>{statusMeta[stage].label}</option>)}</select></label>
        <button type="button" className="settings-button" onClick={() => restoreStack(posts.map(post => post.id), status)}><ArchiveRestore size={13} /> Restaurar pila</button>
      </div>
    </header>
    {name && posts[0].title && <p className="board-archived-stack-subtitle">{posts[0].title}</p>}
    <div className="board-archived-collection-posts">{posts.map(post => <button type="button" className="board-archived-collection-post" key={post.id} onClick={() => select(post.id)}><strong>{post.title || 'Publicación sin título'}</strong></button>)}</div>
  </article>
}

export function BoardArchivedMedia({ archivedPosts, archivedGroups, collectionPosts, compressedPosts, showArchivedPosts, showCompressedPosts, setShowCompressedPosts, select, setPendingMediaCompression, restorePostMedia, restoreGroup, restoreStack, openGroup }: BoardArchivedMediaProps) {
  const [page, setPage] = useState(0)
  const archivedGroupPostIds = new Set(archivedGroups.flatMap(group => group.postIds))
  const ungroupedArchivedPosts = archivedPosts.filter(post => !archivedGroupPostIds.has(post.id))
  // Solo se agrupa una pila si están todas sus miembros archivadas visibles: así restaurar la tarjeta
  // no deja una parte fuera (por búsqueda, colección o espacio) ni la disuelve por la mitad.
  const archivedMembersPerStack = new Map<string, number>()
  for (const post of archivedPosts) if (post.stackId) archivedMembersPerStack.set(post.stackId, (archivedMembersPerStack.get(post.stackId) ?? 0) + 1)
  const stackMembers = new Map<string, Post[]>()
  const loosePosts: Post[] = []
  for (const post of ungroupedArchivedPosts) {
    if (post.stackId) stackMembers.set(post.stackId, [...(stackMembers.get(post.stackId) ?? []), post])
    else loosePosts.push(post)
  }
  const entries: ArchivedEntry[] = []
  for (const [stackId, members] of stackMembers) {
    if (members.length >= 2 && members.length === archivedMembersPerStack.get(stackId)) entries.push({ kind: 'stack', stackId, posts: [...members].sort((a, b) => (a.stackPosition ?? 0) - (b.stackPosition ?? 0)) })
    else for (const post of members) entries.push({ kind: 'post', post })
  }
  for (const post of loosePosts) entries.push({ kind: 'post', post })
  const pageCount = Math.max(1, Math.ceil(entries.length / ARCHIVED_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visibleEntries = entries.slice(currentPage * ARCHIVED_PAGE_SIZE, (currentPage + 1) * ARCHIVED_PAGE_SIZE)
  useEffect(() => { setPage(0) }, [showArchivedPosts, archivedPosts.length, archivedGroups.length])
  return <>
    {showArchivedPosts && archivedGroups.length > 0 && <section className="board-archived-posts board-archived-collections" aria-label="Colecciones archivadas"><div className="board-archived-post-list">{archivedGroups.map(group => {
      const posts = collectionPosts.filter(post => group.postIds.includes(post.id))
      return <article className="board-archived-collection" key={group.id}>
        <header><div><button type="button" className="board-archived-collection-open" onClick={() => openGroup(group)} title={`Abrir colección ${group.name}`}><FolderOpen size={14} /><strong>{group.name}</strong></button><span>{posts.length} {posts.length === 1 ? 'publicación' : 'publicaciones'}</span></div><button type="button" className="settings-button" onClick={() => restoreGroup(group)}><ArchiveRestore size={13} /> Restaurar colección</button></header>
        {posts.length > 0
          ? <div className="board-archived-collection-posts">{posts.map(post => <button type="button" className="board-archived-collection-post" key={post.id} onClick={() => select(post.id)}><strong>{post.title || 'Publicación sin título'}</strong></button>)}</div>
          : <p className="board-archived-collection-empty">No hay publicaciones que coincidan con la búsqueda actual.</p>}
      </article>
    })}</div></section>}
    {entries.length > 0 && showArchivedPosts && <section className="board-archived-posts" aria-label="Publicaciones archivadas">
      <header>
        <div><Archive size={13} aria-hidden="true" /><strong>Publicaciones archivadas</strong><span>{entries.length}</span></div>
        {pageCount > 1 && <div className="board-archived-pager">
          <button type="button" className="settings-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="Página anterior de archivadas">‹ Anterior</button>
          <span>Página {currentPage + 1} de {pageCount}</span>
          <button type="button" className="settings-button" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} aria-label="Página siguiente de archivadas">Siguiente ›</button>
        </div>}
      </header>
      <div className="board-archived-post-list">{visibleEntries.map(entry => {
        if (entry.kind === 'stack') return <ArchivedStackCard key={`stack-${entry.stackId}`} posts={entry.posts} select={select} restoreStack={restoreStack} />
        const post = entry.post
        const compressedCount = post.media.filter(asset => asset.compressed).length
        return <article key={post.id}><button type="button" className="board-archived-post-title" onClick={() => select(post.id)}><strong>{post.title || 'Publicación sin título'}</strong><span>{post.media.length} medios · {compressedCount} comprimidos</span></button><div>{post.media.length > compressedCount && <button type="button" className="settings-button" onClick={() => setPendingMediaCompression({ target: 'post', id: post.id, name: post.title || 'Publicación sin título', mediaCount: post.media.length - compressedCount })}><Archive size={13} /> Comprimir medios</button>}{compressedCount > 0 && <button type="button" className="settings-button" onClick={() => void restorePostMedia(post)}><ArchiveRestore size={13} /> Restaurar medios</button>}</div></article>
      })}</div>
    </section>}
    {compressedPosts.length > 0 && <section className="board-archived-posts"><header><div><strong>Medios comprimidos</strong><span>{compressedPosts.length}</span></div><button type="button" className="settings-button" onClick={() => setShowCompressedPosts(current => !current)}>{showCompressedPosts ? 'Ocultar' : 'Mostrar'}</button></header>{showCompressedPosts && <div className="board-archived-post-list">{compressedPosts.map(post => <article key={post.id}><div className="board-archived-post-title"><strong>{post.title || 'Publicación sin título'}</strong><span>{post.media.filter(asset => asset.compressed).length} medios dentro de archivo ZIP · {statusMeta[post.status].label}</span></div><div><button type="button" className="settings-button" onClick={() => void restorePostMedia(post)}><ArchiveRestore size={13} /> Restaurar medios</button></div></article>)}</div>}</section>}
  </>
}
