import { create } from 'zustand'
import type { ConceptMapLink, ConceptMapNode, Idea, IdeaAnalysisOptions, IdeaAnalysisProgress, IdeaCluster, IdeaInput, IdeaNeighbor, Post, PostInput, PostStatus, WorkGroup, WorkGroupInput } from '../shared/types'
import { subtreeGroupIds } from '../shared/work-group-tree'
import { readPostDateMarks, readPostInterestLevels, writePostDateMarks, writePostInterestLevels, type PostInterestLevel } from '../shared/post-marks'

export type PlannerView = 'timeline' | 'calendar' | 'board' | 'concept-map' | 'ideas' | 'library' | 'sources' | 'about'

export interface QuickWrite {
  id: string
  name: string
  text: string
}

type ConceptMapState = { nodes: ConceptMapNode[]; links: ConceptMapLink[] }
type ConceptMapSnapshot = ConceptMapState & { nodeIds: string[]; linkIds: string[] }
type WorkspaceUndoLeaf =
  | { kind: 'post'; id: string; before: Post | null; after: Post | null; label: string; view: PlannerView }
  | { kind: 'idea'; id: string; before: Idea | null; after: Idea | null; label: string; view: PlannerView }
  | { kind: 'group'; id: string; before: WorkGroup | null; after: WorkGroup | null; label: string; view: PlannerView }
  | { kind: 'concept-map'; before: ConceptMapSnapshot; after: ConceptMapSnapshot; label: string; view: 'concept-map' }
type WorkspaceUndoAction = WorkspaceUndoLeaf | { kind: 'batch'; actions: WorkspaceUndoLeaf[]; label: string; view: PlannerView }

export function postMatchesQuery(post: Post, query: string) {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return true
  return [post.title, post.caption, post.notes, post.project, ...post.hashtags, ...post.mentions]
    .join(' ')
    .toLocaleLowerCase()
    .includes(normalized)
}

export function ideaMatchesQuery(idea: Idea, query: string) {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return true
  if (!normalized) return true
  return [idea.title, idea.body, idea.space, ...idea.tags].join(' ').toLocaleLowerCase().includes(normalized)
}

interface PlannerState {
  posts: Post[]
  ideas: Idea[]
  workGroups: WorkGroup[]
  activeWorkGroupId: string | null
  undoHistory: WorkspaceUndoAction[]
  redoHistory: WorkspaceUndoAction[]
  undoNotice: string | null
  loading: boolean
  loadError: string | null
  view: PlannerView
  selectedId: string | null
  selectedIdeaId: string | null
  pendingConceptMapPostIds: string[]
  /** Fecha registrada (una por publicación) y destacado (> / >> / >>>), guardados como preferencias. */
  postDateMarks: Record<string, string>
  postInterestLevels: Record<string, PostInterestLevel>
  query: string
  activeSpace: string | null
  customSpaces: string[]
  hiddenSpaces: string[]
  load(): Promise<void>
  save(post: PostInput, options?: { recordHistory?: boolean; keepStack?: boolean }): Promise<Post>
  stackPosts(targetId: string, ids: string[], options?: { recordHistory?: boolean }): Promise<void>
  unstackPost(id: string, options?: { recordHistory?: boolean }): Promise<void>
  reorderStack(stackId: string, orderedIds: string[], options?: { recordHistory?: boolean }): Promise<void>
  renameStack(stackId: string, name: string, options?: { recordHistory?: boolean }): Promise<void>
  moveWithStacks(ids: string[], status: PostStatus, options?: { groupLabel?: string; recordHistory?: boolean }): Promise<void>
  saveWorkGroup(group: WorkGroupInput, options?: { recordHistory?: boolean }): Promise<WorkGroup>
  setWorkGroupPosts(id: string, postIds: string[], options?: { recordHistory?: boolean }): Promise<WorkGroup>
  setWorkGroupArchived(id: string, archived: boolean, options?: { recordHistory?: boolean }): Promise<WorkGroup>
  removeWorkGroup(id: string, options?: { recordHistory?: boolean }): Promise<void>
  remove(id: string, options?: { recordHistory?: boolean }): Promise<void>
  move(id: string, status: PostStatus, options?: { recordHistory?: boolean; keepStack?: boolean }): Promise<void>
  movePostsToSpace(postIds: string[], space: string): Promise<number>
  saveIdea(idea: IdeaInput, options?: { recordHistory?: boolean }): Promise<Idea>
  refreshIdeas(): Promise<void>
  saveIdeasMany(ideas: IdeaInput[]): Promise<{ created: Idea[]; skipped: number; duplicates: Array<{ title: string; sourceName: string; existingId: string; existingTitle: string; existingSourceName: string }> }>
  removeIdea(id: string, options?: { recordHistory?: boolean }): Promise<void>
  convertIdea(id: string): Promise<Post>
  combineIdeas(ids: string[]): Promise<{ ideas: Idea[]; post: Post }>
  uncombinePost(id: string): Promise<{ ideas: Idea[]; post: Post }>
  undoSavedChange(): Promise<void>
  redoSavedChange(): Promise<void>
  groupRecentUndoActions(count: number, label: string): void
  clearUndoNotice(): void
  recordConceptMapChange(before: { nodes: ConceptMapNode[]; links: ConceptMapLink[] }, after: { nodes: ConceptMapNode[]; links: ConceptMapLink[] }, label: string): void
  ideaNeighbors(id: string, limit?: number, ignoredTerms?: string[], options?: IdeaAnalysisOptions): Promise<IdeaNeighbor[]>
  refreshEmbeddings(ids?: string[], ignoredTerms?: string[], options?: IdeaAnalysisOptions): Promise<{ updated: number; model: string; modelVersion: string }>
  proposeClusters(threshold?: number, ignoredTerms?: string[], options?: IdeaAnalysisOptions, ideaIds?: string[], onProgress?: (progress: IdeaAnalysisProgress) => void): Promise<IdeaCluster[]>
  previewIdeaAnalysis(ignoredTerms?: string[], options?: IdeaAnalysisOptions): Promise<{ automaticTerms: string[] }>
  listIdeaClusters(): Promise<IdeaCluster[]>
  setView(view: PlannerView): void
  select(id: string | null): void
  selectIdea(id: string | null): void
  requestConceptMapPost(id: string): void
  /** Pide al mapa conceptual referenciar varias publicaciones (sin moverlas del tablero). */
  requestConceptMapPosts(ids: string[]): void
  clearConceptMapPostRequest(): void
  /** Marca con fecha; cada llamada reemplaza la marca anterior de esas publicaciones. */
  markPostsDate(ids: string[]): void
  clearPostsDateMark(ids: string[]): void
  setPostsInterest(ids: string[], level: PostInterestLevel | null): void
  setQuery(query: string): void
  setActiveSpace(space: string | null): void
  setActiveWorkGroup(id: string | null): void
  addSpace(space: string): void
  renameSpace(space: string, nextName: string): Promise<void>
  removeSpace(space: string, movePosts: boolean): Promise<void>
  spaceNotes: Record<string, string>
  quickWrites: Record<string, QuickWrite[]>
  spaceKeys: Record<string, string>
  spaceKey(space: string): string
  saveSpaceNotes(space: string, notes: string): void
  saveQuickWrites(space: string, quickWrites: QuickWrite[]): void
}

function readStoredSpaces() {
  try { return JSON.parse(localStorage.getItem('caballocci.spaces') || '[]') as string[] }
  catch { return [] }
}

function isQuickWrite(value: unknown): value is QuickWrite {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.text === 'string'
}

function readStoredQuickWrites() {
  try {
    const stored = JSON.parse(localStorage.getItem('caballocci.quick-writes') || '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(stored).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.filter(isQuickWrite) : [],
    ]))
  } catch {
    return {}
  }
}

function postChangeLabel(before: Post, after: Post) {
  if (before.status !== after.status) return 'Cambiar estado de publicación'
  if (before.scheduledAt !== after.scheduledAt) return 'Cambiar fecha de publicación'
  if (before.color !== after.color) return 'Cambiar color de publicación'
  if (before.title !== after.title) return 'Editar título de publicación'
  if (before.caption !== after.caption) return 'Editar texto de publicación'
  if (before.notes !== after.notes) return 'Editar notas de publicación'
  if (JSON.stringify(before.hashtags) !== JSON.stringify(after.hashtags)) return 'Editar hashtags'
  if (JSON.stringify(before.mentions) !== JSON.stringify(after.mentions)) return 'Editar menciones'
  if (JSON.stringify(before.platforms) !== JSON.stringify(after.platforms)) return 'Cambiar destinos de publicación'
  if (JSON.stringify(before.distribution) !== JSON.stringify(after.distribution)) return 'Cambiar estados por destino'
  if (JSON.stringify(before.media) !== JSON.stringify(after.media)) return 'Cambiar medios de publicación'
  if (before.project !== after.project) return 'Cambiar proyecto de publicación'
  if (JSON.stringify(before.ideaBlocks) !== JSON.stringify(after.ideaBlocks)) return 'Editar diapositivas'
  return 'Editar publicación'
}

function ideaChangeLabel(before: Idea, after: Idea) {
  if (before.status !== after.status) return 'Cambiar estado de idea'
  if (before.priority !== after.priority) return 'Cambiar prioridad de idea'
  if (before.space !== after.space) return 'Cambiar espacio de idea'
  if (before.title !== after.title) return 'Editar título de idea'
  if (before.body !== after.body) return 'Editar texto de idea'
  if (JSON.stringify(before.tags) !== JSON.stringify(after.tags)) return 'Editar etiquetas de idea'
  if (JSON.stringify(before.media) !== JSON.stringify(after.media)) return 'Cambiar medios de idea'
  return 'Editar idea'
}

function pushUndo(history: WorkspaceUndoAction[], action: WorkspaceUndoAction) {
  return [...history.slice(-99), action]
}

/** Renumera los miembros de una pila a 0..n-1; si queda uno solo, lo desapila. */
async function renumberStackMembers(get: () => PlannerState, stackId: string) {
  const members = get().posts.filter(item => item.stackId === stackId).sort((a, b) => (a.stackPosition ?? 0) - (b.stackPosition ?? 0))
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]
    if (members.length === 1) {
      if (member.stackId !== null || member.stackPosition !== null || member.stackName) await get().save({ ...member, stackId: null, stackPosition: null, stackName: null })
      continue
    }
    if (member.stackPosition !== index) await get().save({ ...member, stackPosition: index })
  }
}

async function applyConceptMapSnapshot(snapshot: ConceptMapSnapshot) {
  const current = await window.planner.conceptMap.list()
  const nodeIds = new Set(snapshot.nodeIds)
  const linkIds = new Set(snapshot.linkIds)
  const targetNodes = new Map(snapshot.nodes.map(node => [node.id, node]))
  const targetLinks = new Map(snapshot.links.map(link => [link.id, link]))
  for (const node of snapshot.nodes) await window.planner.conceptMap.saveNode({ id: node.id, folderId: node.folderId, kind: node.kind, sourceId: node.sourceId, title: node.title, body: node.body, x: node.x, y: node.y })
  for (const link of current.links) if (linkIds.has(link.id) && !targetLinks.has(link.id)) await window.planner.conceptMap.removeLink(link.id)
  for (const node of current.nodes) if (nodeIds.has(node.id) && !targetNodes.has(node.id)) await window.planner.conceptMap.removeNode(node.id)
  for (const link of snapshot.links) await window.planner.conceptMap.saveLink({ id: link.id, fromNodeId: link.fromNodeId, toNodeId: link.toNodeId, relation: link.relation })
}

function actionReferencesPost(action: WorkspaceUndoAction, id: string): boolean {
  if (action.kind === 'batch') return action.actions.some(item => actionReferencesPost(item, id))
  if (action.kind === 'concept-map') return [...action.before.nodes, ...action.after.nodes].some(node => node.kind === 'post' && node.sourceId === id)
  if (action.kind === 'post') return action.id === id
  if (action.kind === 'idea') return false
  return Boolean(action.before?.postIds.includes(id) || action.after?.postIds.includes(id))
}

function actionReferencesIdea(action: WorkspaceUndoAction, id: string): boolean {
  if (action.kind === 'batch') return action.actions.some(item => actionReferencesIdea(item, id))
  if (action.kind === 'concept-map') return [...action.before.nodes, ...action.after.nodes].some(node => node.kind === 'idea' && node.sourceId === id)
  if (action.kind === 'idea') return action.id === id
  return action.kind === 'post' && (action.before?.sourceIdeaId === id || action.after?.sourceIdeaId === id)
}

export const usePlanner = create<PlannerState>((set, get) => ({
  posts: [],
  ideas: [],
  workGroups: [],
  activeWorkGroupId: null,
  undoHistory: [],
  redoHistory: [],
  undoNotice: null,
  loading: true,
  loadError: null,
  view: 'timeline',
  selectedId: null,
  selectedIdeaId: null,
  pendingConceptMapPostIds: [],
  postDateMarks: readPostDateMarks(),
  postInterestLevels: readPostInterestLevels(),
  query: '',
  activeSpace: null,
  customSpaces: readStoredSpaces(),
  hiddenSpaces: (() => {
    try { return JSON.parse(localStorage.getItem('caballocci.hidden-spaces') || '[]') as string[] }
    catch { return [] }
  })(),
  spaceNotes: (() => { try { return JSON.parse(localStorage.getItem('caballocci.space-notes') || '{}') as Record<string, string> } catch { return {} } })(),
  quickWrites: readStoredQuickWrites(),
  spaceKeys: (() => { try { return JSON.parse(localStorage.getItem('caballocci.space-keys') || '{}') as Record<string, string> } catch { return {} } })(),
  spaceKey: (space) => get().spaceKeys[space] || space,
  load: async () => {
    let watchdog: number | undefined
    try {
      if (!window.planner) throw new Error('La API de Electron no esta disponible. Inicia la aplicacion con npm.cmd run dev.')
      const timeout = new Promise<never>((_resolve, reject) => {
        watchdog = window.setTimeout(() => reject(new Error('El workspace esta tardando demasiado en responder. Cierra los programas que esten saturando el disco y pulsa Reintentar.')), 120_000)
      })
      const [posts, ideas, workGroups] = await Promise.race([
        Promise.all([window.planner.posts.list(), window.planner.ideas.list(), window.planner.workGroups.list()]),
        timeout,
      ])
      set(state => ({
        posts,
        ideas,
        workGroups,
        activeWorkGroupId: state.activeWorkGroupId && workGroups.some(group => group.id === state.activeWorkGroupId && !group.archivedAt) ? state.activeWorkGroupId : null,
        loading: false,
        loadError: null,
        selectedId: state.selectedId && posts.some(post => post.id === state.selectedId) ? state.selectedId : null,
        selectedIdeaId: state.selectedIdeaId && ideas.some(idea => idea.id === state.selectedIdeaId) ? state.selectedIdeaId : null,
      }))
    } catch (error) {
      set({ loading: false, loadError: error instanceof Error ? error.message : 'No se pudo cargar el workspace local.' })
    } finally {
      window.clearTimeout(watchdog)
    }
  },
  save: async (post, options) => {
    const sourceView = get().view
    const before = get().posts.find(item => item.id === post.id) || null
    const historyStart = get().undoHistory.length
    const statusChanged = Boolean(before && (before.status !== post.status || before.project !== post.project))
    const stackExit = Boolean(statusChanged && before?.stackId && !options?.keepStack)
    const saved = await window.planner.posts.save(stackExit ? { ...post, stackId: null, stackPosition: null, stackName: null } : post)
    set(state => {
      const changed = JSON.stringify(before) !== JSON.stringify(saved)
      return {
        posts: state.posts.some(item => item.id === saved.id) ? state.posts.map(item => item.id === saved.id ? saved : item) : [...state.posts, saved],
        undoHistory: options?.recordHistory === false || !changed ? state.undoHistory : pushUndo(state.undoHistory, { kind: 'post', id: saved.id, before, after: saved, label: before ? postChangeLabel(before, saved) : 'Crear publicación', view: sourceView }),
        redoHistory: options?.recordHistory === false || !changed ? state.redoHistory : [],
        undoNotice: null,
      }
    })
    if (before && before.project !== saved.project) {
      const groups = get().workGroups.filter(group => group.space && group.space !== saved.project && group.postIds.includes(saved.id))
      for (const group of groups) {
        await get().setWorkGroupPosts(group.id, group.postIds.filter(id => id !== saved.id), { recordHistory: options?.recordHistory === false ? false : undefined })
      }
    }
    if (stackExit && before?.stackId) await renumberStackMembers(get, before.stackId)
    const actionCount = get().undoHistory.length - historyStart
    if (options?.recordHistory !== false && actionCount > 1) {
      if (stackExit) get().groupRecentUndoActions(actionCount, 'Mover publicación fuera de la pila')
      else if (before && before.project !== saved.project) get().groupRecentUndoActions(actionCount, 'Mover publicación a otro espacio')
    }
    return saved
  },
  movePostsToSpace: async (postIds, space) => {
    const start = get().undoHistory.length
    let moved = 0
    for (const id of [...new Set(postIds)]) {
      const post = get().posts.find(item => item.id === id)
      if (!post || post.project === space) continue
      await get().save({ ...post, project: space })
      moved += 1
    }
    const actionCount = get().undoHistory.length - start
    if (actionCount > 1) get().groupRecentUndoActions(actionCount, `Mover ${moved} ${moved === 1 ? 'publicación' : 'publicaciones'} de espacio`)
    return moved
  },
  saveWorkGroup: async (group, options) => {
    const sourceView = get().view
    const before = get().workGroups.find(item => item.id === group.id) || null
    const saved = await window.planner.workGroups.save(group)
    set(state => {
      const top = state.undoHistory.at(-1)
      const history = options?.recordHistory === false && top?.kind === 'group' && top.id === saved.id
        ? [...state.undoHistory.slice(0, -1), { ...top, after: saved }]
        : options?.recordHistory === false || JSON.stringify(before) === JSON.stringify(saved) ? state.undoHistory : pushUndo(state.undoHistory, { kind: 'group', id: saved.id, before, after: saved, label: before ? 'Editar colección' : 'Crear colección', view: sourceView })
      return {
      workGroups: [...state.workGroups.filter(item => item.id !== saved.id), saved],
      undoHistory: history,
      redoHistory: options?.recordHistory === false || JSON.stringify(before) === JSON.stringify(saved) ? state.redoHistory : [],
      undoNotice: null,
      }
    })
    return saved
  },
  setWorkGroupPosts: async (id, postIds, options) => {
    const sourceView = get().view
    const before = get().workGroups.find(item => item.id === id) || null
    const saved = await window.planner.workGroups.setPosts(id, postIds)
    set(state => {
      const top = state.undoHistory.at(-1)
      const history = options?.recordHistory === false && top?.kind === 'group' && top.id === saved.id
        ? [...state.undoHistory.slice(0, -1), { ...top, after: saved }]
        : options?.recordHistory === false || JSON.stringify(before) === JSON.stringify(saved) ? state.undoHistory : pushUndo(state.undoHistory, { kind: 'group', id: saved.id, before, after: saved, label: 'Cambiar publicaciones de la colección', view: sourceView })
      return {
      workGroups: [...state.workGroups.filter(item => item.id !== saved.id), saved],
      undoHistory: history,
      redoHistory: options?.recordHistory === false || JSON.stringify(before) === JSON.stringify(saved) ? state.redoHistory : [],
      undoNotice: null,
      }
    })
    return saved
  },
  setWorkGroupArchived: async (id, archived, options) => {
    const sourceView = get().view
    const before = get().workGroups.find(item => item.id === id) || null
    const saved = await window.planner.workGroups.setArchived(id, archived)
    // The backend archives/restores the whole subtree; mirror that in state and clear a selection that just became archived.
    const subtree = subtreeGroupIds(get().workGroups, id)
    const archivedAt = archived ? saved.archivedAt : null
    set(state => ({
      workGroups: state.workGroups.map(group => subtree.has(group.id) ? { ...group, archivedAt } : group), activeWorkGroupId: archived && state.activeWorkGroupId && subtree.has(state.activeWorkGroupId) ? null : state.activeWorkGroupId,
      undoHistory: options?.recordHistory === false || JSON.stringify(before) === JSON.stringify(saved) ? state.undoHistory : pushUndo(state.undoHistory, { kind: 'group', id: saved.id, before, after: saved, label: archived ? 'Archivar colección' : 'Restaurar colección', view: sourceView }),
      redoHistory: options?.recordHistory === false || JSON.stringify(before) === JSON.stringify(saved) ? state.redoHistory : [],
      undoNotice: null,
    }))
    return saved
  },
  removeWorkGroup: async (id, options) => {
    const sourceView = get().view
    const before = get().workGroups.find(item => item.id === id) || null
    await window.planner.workGroups.remove(id)
    // The backend moves subcollections up one level; keep state consistent.
    const parentId = before?.parentId ?? null
    set(state => ({
      workGroups: state.workGroups.filter(group => group.id !== id).map(group => group.parentId === id ? { ...group, parentId } : group), activeWorkGroupId: state.activeWorkGroupId === id ? null : state.activeWorkGroupId,
      undoHistory: options?.recordHistory === false || !before ? state.undoHistory : pushUndo(state.undoHistory, { kind: 'group', id, before, after: null, label: 'Eliminar colección', view: sourceView }),
      redoHistory: options?.recordHistory === false || !before ? state.redoHistory : [],
      undoNotice: null,
    }))
  },
  remove: async (id, options) => {
    const before = get().posts.find(post => post.id === id) || null
    await window.planner.posts.remove(id)
    set(state => {
      const workGroups = state.workGroups.map(group => ({ ...group, postIds: group.postIds.filter(postId => postId !== id) }))
      const ideas = state.ideas.map(idea => {
        if (idea.postId === id) return { ...idea, postId: null, status: 'ready' as const }
        if (idea.combinedPostIds.includes(id) || idea.combinedPostId === id) {
          const combinedPostIds = idea.combinedPostIds.filter(postId => postId !== id)
          return { ...idea, combinedPostId: combinedPostIds[0] || null, combinedPostIds, tags: combinedPostIds.length ? idea.tags : idea.tags.filter(tag => tag.toLocaleLowerCase() !== 'combinada') }
        }
        return idea
      })
      // Las marcas no entran en el historial, pero no deben quedar huérfanas tras eliminar la publicación.
      const postDateMarks = { ...state.postDateMarks }
      const postInterestLevels = { ...state.postInterestLevels }
      delete postDateMarks[id]
      delete postInterestLevels[id]
      writePostDateMarks(postDateMarks)
      writePostInterestLevels(postInterestLevels)
      return {
        posts: state.posts.filter(post => post.id !== id), workGroups, ideas, selectedId: null,
        postDateMarks, postInterestLevels,
        undoHistory: options?.recordHistory === false ? state.undoHistory : state.undoHistory.filter(action => !actionReferencesPost(action, id)),
        redoHistory: options?.recordHistory === false ? state.redoHistory : state.redoHistory.filter(action => !actionReferencesPost(action, id)),
        undoNotice: null,
      }
    })
  },
  move: async (id, status, options) => {
    const post = get().posts.find((item) => item.id === id)
    if (post) await get().save({ ...post, status }, options)
  },
  stackPosts: async (targetId, ids, options) => {
    const start = get().undoHistory.length
    const target = get().posts.find(item => item.id === targetId)
    if (!target) return
    const stackId = target.stackId ?? crypto.randomUUID()
    const dragged = [...new Set(ids)]
      .map(id => get().posts.find(item => item.id === id))
      .filter((item): item is Post => Boolean(item) && item!.id !== targetId)
    if (!dragged.length) return
    const inTargetStack = new Set(target.stackId ? get().posts.filter(item => item.stackId === stackId).map(item => item.id) : [targetId])
    const newMembers = dragged.filter(item => !inTargetStack.has(item.id))
    if (!newMembers.length) return
    const sourceStacks = new Set(newMembers.map(item => item.stackId).filter((id): id is string => Boolean(id)))
    const existing = target.stackId
      ? get().posts.filter(item => item.stackId === stackId).sort((a, b) => (a.stackPosition ?? 0) - (b.stackPosition ?? 0)).map(item => item.id)
      : [targetId]
    const sequence = [...existing, ...newMembers.map(item => item.id)]
    const stackName = target.stackName ?? newMembers.find(item => item.stackName)?.stackName ?? null
    for (let index = 0; index < sequence.length; index += 1) {
      const member = get().posts.find(item => item.id === sequence[index])
      if (!member) continue
      if (member.stackId === stackId && member.stackPosition === index && (member.stackName ?? null) === stackName) continue
      await get().save({ ...member, stackId, stackPosition: index, stackName }, options)
    }
    for (const otherStack of sourceStacks) if (otherStack !== stackId) await renumberStackMembers(get, otherStack)
    const count = get().undoHistory.length - start
    if (options?.recordHistory !== false && count > 1) get().groupRecentUndoActions(count, 'Apilar publicaciones')
  },
  unstackPost: async (id, options) => {
    const post = get().posts.find(item => item.id === id)
    if (!post?.stackId) return
    const stackId = post.stackId
    const start = get().undoHistory.length
    await get().save({ ...post, stackId: null, stackPosition: null, stackName: null }, options)
    await renumberStackMembers(get, stackId)
    const count = get().undoHistory.length - start
    if (options?.recordHistory !== false && count > 1) get().groupRecentUndoActions(count, 'Desapilar publicación')
  },
  reorderStack: async (stackId, orderedIds, options) => {
    const start = get().undoHistory.length
    const members = get().posts.filter(item => item.stackId === stackId)
    if (members.length < 2) return
    const ordered = [...new Set(orderedIds.filter(id => members.some(member => member.id === id)))]
    const rest = members.filter(member => !ordered.includes(member.id)).sort((a, b) => (a.stackPosition ?? 0) - (b.stackPosition ?? 0)).map(item => item.id)
    const sequence = [...ordered, ...rest]
    for (let index = 0; index < sequence.length; index += 1) {
      const member = get().posts.find(item => item.id === sequence[index])
      if (member && member.stackPosition !== index) await get().save({ ...member, stackPosition: index }, options)
    }
    const count = get().undoHistory.length - start
    if (options?.recordHistory !== false && count > 1) get().groupRecentUndoActions(count, 'Reordenar pila')
  },
  renameStack: async (stackId, name, options) => {
    const members = get().posts.filter(item => item.stackId === stackId)
    if (members.length < 2) return
    const normalized = name.trim().slice(0, 120) || null
    if (members.every(member => (member.stackName ?? null) === normalized)) return
    const start = get().undoHistory.length
    for (const member of members) await get().save({ ...member, stackName: normalized }, options)
    const count = get().undoHistory.length - start
    if (options?.recordHistory !== false && count > 1) get().groupRecentUndoActions(count, 'Renombrar pila')
  },
  moveWithStacks: async (ids, status, options) => {
    const start = get().undoHistory.length
    const unique = [...new Set(ids)]
    const posts = get().posts
    const membersOf = new Map<string, string[]>()
    for (const post of posts) if (post.stackId) membersOf.set(post.stackId, [...(membersOf.get(post.stackId) || []), post.id])
    const preserved = new Set<string>()
    for (const id of unique) {
      const post = posts.find(item => item.id === id)
      if (post?.stackId) {
        const members = membersOf.get(post.stackId) || []
        if (members.length > 1 && members.every(member => unique.includes(member))) preserved.add(id)
      }
    }
    for (const id of unique) {
      if (preserved.has(id)) {
        const post = get().posts.find(item => item.id === id)
        if (post) await get().save({ ...post, status }, { keepStack: true })
      } else {
        await get().move(id, status)
      }
    }
    const count = get().undoHistory.length - start
    if (options?.recordHistory !== false && count > 1) get().groupRecentUndoActions(count, options?.groupLabel ?? (preserved.size ? 'Mover pila a otra columna' : `Mover ${count} ${count === 1 ? 'publicación' : 'publicaciones'}`))
  },
  saveIdea: async (idea, options) => {
    const sourceView = get().view
    const before = get().ideas.find(item => item.id === idea.id) || null
    const saved = await window.planner.ideas.save(idea)
    set(state => ({
      ideas: [...state.ideas.filter(item => item.id !== saved.id), saved],
      undoHistory: options?.recordHistory === false || JSON.stringify(before) === JSON.stringify(saved) ? state.undoHistory : pushUndo(state.undoHistory, { kind: 'idea', id: saved.id, before, after: saved, label: before ? ideaChangeLabel(before, saved) : 'Crear idea', view: sourceView }),
      redoHistory: options?.recordHistory === false || JSON.stringify(before) === JSON.stringify(saved) ? state.redoHistory : [],
      undoNotice: null,
    }))
    return saved
  },
  refreshIdeas: async () => {
    const ideas = await window.planner.ideas.list()
    set(state => ({
      ideas,
      selectedIdeaId: state.selectedIdeaId && ideas.some(idea => idea.id === state.selectedIdeaId) ? state.selectedIdeaId : null,
    }))
  },
  saveIdeasMany: async (ideas) => {
    const sourceView = get().view
    const result = await window.planner.ideas.saveMany(ideas)
    set(state => {
      const actions: WorkspaceUndoLeaf[] = result.created.map(idea => ({ kind: 'idea', id: idea.id, before: null, after: idea, label: 'Importar ideas', view: sourceView }))
      const importAction: WorkspaceUndoAction | null = !actions.length ? null : actions.length === 1
        ? { ...actions[0], label: 'Importar idea' }
        : { kind: 'batch', actions, label: `Importar ${actions.length} ideas`, view: sourceView }
      return {
        ideas: [...state.ideas, ...result.created],
        undoHistory: importAction ? pushUndo(state.undoHistory, importAction) : state.undoHistory,
        redoHistory: importAction ? [] : state.redoHistory,
        undoNotice: null,
      }
    })
    return result
  },
  removeIdea: async (id, options) => {
    await window.planner.ideas.remove(id)
    set(state => ({
      ideas: state.ideas.filter(idea => idea.id !== id),
      posts: state.posts.map(post => post.sourceIdeaId === id ? { ...post, sourceIdeaId: null } : post),
      selectedIdeaId: null,
      undoHistory: options?.recordHistory === false ? state.undoHistory : state.undoHistory.filter(action => !actionReferencesIdea(action, id)),
      redoHistory: options?.recordHistory === false ? state.redoHistory : state.redoHistory.filter(action => !actionReferencesIdea(action, id)),
      undoNotice: null,
    }))
  },
  convertIdea: async (id) => {
    const converted = await window.planner.ideas.convert(id)
    set({
      ideas: [...get().ideas.filter(idea => idea.id !== id), converted.idea],
      posts: [...get().posts.filter(post => post.id !== converted.post.id), converted.post],
      undoHistory: get().undoHistory.filter(action => !actionReferencesIdea(action, id) && !actionReferencesPost(action, converted.post.id)),
      redoHistory: get().redoHistory.filter(action => !actionReferencesIdea(action, id) && !actionReferencesPost(action, converted.post.id)),
      undoNotice: null,
    })
    return converted.post
  },
  combineIdeas: async (ids) => {
    const combined = await window.planner.ideas.combine(ids)
    set({
      ideas: [...get().ideas.filter(idea => !ids.includes(idea.id)), ...combined.ideas],
      posts: [...get().posts.filter(post => post.id !== combined.post.id), combined.post],
      undoHistory: get().undoHistory.filter(action => !ids.some(id => actionReferencesIdea(action, id)) && !actionReferencesPost(action, combined.post.id)),
      redoHistory: get().redoHistory.filter(action => !ids.some(id => actionReferencesIdea(action, id)) && !actionReferencesPost(action, combined.post.id)),
      undoNotice: null,
    })
    return combined
  },
  uncombinePost: async (id) => {
    const result = await window.planner.posts.uncombine(id)
    set({
      ideas: [...get().ideas.filter(idea => !result.ideas.some(item => item.id === idea.id)), ...result.ideas],
      posts: [...get().posts.filter(post => post.id !== result.post.id), result.post],
      undoHistory: get().undoHistory.filter(action => !actionReferencesPost(action, id) && !result.ideas.some(idea => actionReferencesIdea(action, idea.id))),
      redoHistory: get().redoHistory.filter(action => !actionReferencesPost(action, id) && !result.ideas.some(idea => actionReferencesIdea(action, idea.id))),
      undoNotice: null,
    })
    return result
  },
  undoSavedChange: async () => {
    const action = get().undoHistory.at(-1)
    if (!action) return
    const actions = action.kind === 'batch' ? [...action.actions].reverse() : [action]
    for (const item of actions) {
      if (item.kind === 'post') {
        if (item.before) await get().save(item.before, { recordHistory: false })
        else await get().remove(item.id, { recordHistory: false })
      } else if (item.kind === 'idea') {
        if (item.before) await get().saveIdea(item.before, { recordHistory: false })
        else await get().removeIdea(item.id, { recordHistory: false })
      } else if (item.kind === 'concept-map') {
        await applyConceptMapSnapshot(item.before)
      } else {
        if (item.before) {
          await get().saveWorkGroup(item.before, { recordHistory: false })
          await get().setWorkGroupPosts(item.id, item.before.postIds, { recordHistory: false })
          await get().setWorkGroupArchived(item.id, Boolean(item.before.archivedAt), { recordHistory: false })
        } else await get().removeWorkGroup(item.id, { recordHistory: false })
      }
    }
    set(state => ({ undoHistory: state.undoHistory.slice(0, -1), redoHistory: [...state.redoHistory, action], undoNotice: `Deshecho y guardado: ${action.label}` }))
  },
  redoSavedChange: async () => {
    const action = get().redoHistory.at(-1)
    if (!action) return
    const actions = action.kind === 'batch' ? action.actions : [action]
    for (const item of actions) {
      if (item.kind === 'post') {
        if (item.after) await get().save(item.after, { recordHistory: false })
        else await get().remove(item.id, { recordHistory: false })
      } else if (item.kind === 'idea') {
        if (item.after) await get().saveIdea(item.after, { recordHistory: false })
        else await get().removeIdea(item.id, { recordHistory: false })
      } else if (item.kind === 'concept-map') {
        await applyConceptMapSnapshot(item.after)
      } else {
        if (item.after) {
          await get().saveWorkGroup(item.after, { recordHistory: false })
          await get().setWorkGroupPosts(item.id, item.after.postIds, { recordHistory: false })
          await get().setWorkGroupArchived(item.id, Boolean(item.after.archivedAt), { recordHistory: false })
        } else await get().removeWorkGroup(item.id, { recordHistory: false })
      }
    }
    set(state => ({ redoHistory: state.redoHistory.slice(0, -1), undoHistory: pushUndo(state.undoHistory, action), undoNotice: `Rehecho y guardado: ${action.label}` }))
  },
  groupRecentUndoActions: (count, label) => {
    if (count < 1) return
    set(state => {
      const recent = state.undoHistory.slice(-count)
      if (!recent.length) return state
      const start = state.undoHistory.length - recent.length
      const actions = recent.flatMap(action => action.kind === 'batch' ? action.actions : [action])
      const grouped: WorkspaceUndoAction = actions.length === 1 ? { ...actions[0], label } : { kind: 'batch', actions, label, view: actions[0].view }
      return { undoHistory: [...state.undoHistory.slice(0, start), grouped] }
    })
  },
  clearUndoNotice: () => set({ undoNotice: null }),
  recordConceptMapChange: (before, after, label) => set(state => {
    const changedIds = <T extends { id: string }>(left: T[], right: T[]) => {
      const leftById = new Map(left.map(item => [item.id, item]))
      const rightById = new Map(right.map(item => [item.id, item]))
      const signature = (item: T | undefined) => {
        if (!item) return undefined
        const meaningfulFields = { ...item } as T & { updatedAt?: string }
        delete meaningfulFields.updatedAt
        return JSON.stringify(meaningfulFields)
      }
      return [...new Set([...leftById.keys(), ...rightById.keys()])].filter(id => signature(leftById.get(id)) !== signature(rightById.get(id)))
    }
    const nodeIds = changedIds(before.nodes, after.nodes)
    const linkIds = changedIds(before.links, after.links)
    if (!nodeIds.length && !linkIds.length) return state
    const changedNodes = new Set(nodeIds); const changedLinks = new Set(linkIds)
    const beforeSnapshot: ConceptMapSnapshot = { nodeIds, linkIds, nodes: before.nodes.filter(node => changedNodes.has(node.id)), links: before.links.filter(link => changedLinks.has(link.id)) }
    const afterSnapshot: ConceptMapSnapshot = { nodeIds, linkIds, nodes: after.nodes.filter(node => changedNodes.has(node.id)), links: after.links.filter(link => changedLinks.has(link.id)) }
    return {
      undoHistory: pushUndo(state.undoHistory, { kind: 'concept-map', before: beforeSnapshot, after: afterSnapshot, label, view: 'concept-map' }),
      redoHistory: [],
      undoNotice: null,
    }
  }),
  ideaNeighbors: (id, limit, ignoredTerms, options) => window.planner.ideas.neighbors(id, limit, ignoredTerms, options),
  refreshEmbeddings: (ids, ignoredTerms, options) => window.planner.ideas.refreshEmbeddings(ids, ignoredTerms, options),
  proposeClusters: async (threshold, ignoredTerms, options, ideaIds, onProgress) => window.planner.ideas.clusters(threshold, ignoredTerms, options, ideaIds, onProgress),
  previewIdeaAnalysis: (ignoredTerms, options) => window.planner.ideas.analysisPreview(ignoredTerms, options),
  listIdeaClusters: () => window.planner.ideas.clustersList(),
  setView: (view) => set({ view }),
  select: (selectedId) => set({ selectedId }),
  selectIdea: (selectedIdeaId) => set({ selectedIdeaId }),
  requestConceptMapPost: (id) => set({ pendingConceptMapPostIds: [id], view: 'concept-map' }),
  requestConceptMapPosts: (ids) => { const unique = [...new Set(ids)]; if (unique.length) set({ pendingConceptMapPostIds: unique, view: 'concept-map' }) },
  clearConceptMapPostRequest: () => set({ pendingConceptMapPostIds: [] }),
  markPostsDate: (ids) => set(state => {
    const markedAt = new Date().toISOString()
    const next = { ...state.postDateMarks }
    for (const id of ids) next[id] = markedAt
    writePostDateMarks(next)
    return { postDateMarks: next }
  }),
  clearPostsDateMark: (ids) => set(state => {
    const next = { ...state.postDateMarks }
    for (const id of ids) delete next[id]
    writePostDateMarks(next)
    return { postDateMarks: next }
  }),
  setPostsInterest: (ids, level) => set(state => {
    const next = { ...state.postInterestLevels }
    for (const id of ids) {
      if (level) next[id] = level
      else delete next[id]
    }
    writePostInterestLevels(next)
    return { postInterestLevels: next }
  }),
  setQuery: (query) => set({ query }),
  setActiveSpace: (activeSpace) => set({ activeSpace, activeWorkGroupId: null, selectedId: null, selectedIdeaId: null }),
  setActiveWorkGroup: (activeWorkGroupId) => {
    const group = get().workGroups.find(item => item.id === activeWorkGroupId)
    if (group?.space && get().hiddenSpaces.includes(group.space)) {
      const hiddenSpaces = get().hiddenSpaces.filter(space => space !== group.space)
      localStorage.setItem('caballocci.hidden-spaces', JSON.stringify(hiddenSpaces))
      set({ activeWorkGroupId, activeSpace: group.space, hiddenSpaces, selectedId: null, selectedIdeaId: null })
      return
    }
    set({ activeWorkGroupId, ...(group ? { activeSpace: group.space || null } : {}), selectedId: null, selectedIdeaId: null })
  },
  addSpace: (space) => {
    const name = space.trim()
    if (!name) return
    const customSpaces = Array.from(new Set([...get().customSpaces, name]))
    localStorage.setItem('caballocci.spaces', JSON.stringify(customSpaces))
    const hiddenSpaces = get().hiddenSpaces.filter(item => item !== name)
    localStorage.setItem('caballocci.hidden-spaces', JSON.stringify(hiddenSpaces))
    set({ customSpaces, hiddenSpaces, activeSpace: name })
  },
  renameSpace: async (space, nextName) => {
    const name = nextName.trim()
    if (!name || name === space) return
    await window.planner.posts.reassignProject(space, name, { keepStacks: true })
    for (const group of get().workGroups.filter(item => item.space === space)) {
      await get().saveWorkGroup({ id: group.id, name: group.name, description: group.description, space: name }, { recordHistory: false })
    }
    const customSpaces = Array.from(new Set([...get().customSpaces.filter(item => item !== space), name]))
    const oldKey = get().spaceKey(space)
    const newKey = get().spaceKeys[space] || crypto.randomUUID()
    const spaceKeys = { ...get().spaceKeys, [name]: newKey }
    delete spaceKeys[space]
    const spaceNotes = { ...get().spaceNotes }
    if (spaceNotes[oldKey] !== undefined) spaceNotes[newKey] = spaceNotes[oldKey]
    if (oldKey !== newKey) delete spaceNotes[oldKey]
    const quickWrites = { ...get().quickWrites }
    if (quickWrites[oldKey] !== undefined) quickWrites[newKey] = quickWrites[oldKey]
    if (oldKey !== newKey) delete quickWrites[oldKey]
    const hiddenSpaces = Array.from(new Set([...get().hiddenSpaces.filter(item => item !== name), space]))
    localStorage.setItem('caballocci.spaces', JSON.stringify(customSpaces))
    localStorage.setItem('caballocci.hidden-spaces', JSON.stringify(hiddenSpaces))
    localStorage.setItem('caballocci.space-keys', JSON.stringify(spaceKeys))
    localStorage.setItem('caballocci.space-notes', JSON.stringify(spaceNotes))
    localStorage.setItem('caballocci.quick-writes', JSON.stringify(quickWrites))
    set({
      posts: get().posts.map(post => post.project === space ? { ...post, project: name } : post),
      ideas: get().ideas.map(idea => idea.space === space ? { ...idea, space: name } : idea),
      customSpaces, hiddenSpaces, spaceKeys, spaceNotes, quickWrites, activeSpace: get().activeSpace === space ? name : get().activeSpace,
    })
  },
  removeSpace: async (space, movePosts) => {
    if (movePosts) {
      await window.planner.posts.reassignProject(space, 'Mi contenido', { keepStacks: false })
      for (const group of get().workGroups.filter(item => item.space === space)) {
        await get().saveWorkGroup({ id: group.id, name: group.name, description: group.description, space: '' }, { recordHistory: false })
      }
      set({
        posts: get().posts.map(post => post.project === space ? { ...post, project: 'Mi contenido', stackId: null, stackPosition: null, stackName: null } : post),
        ideas: get().ideas.map(idea => idea.space === space ? { ...idea, space: 'Mi contenido' } : idea),
      })
    }
    const customSpaces = get().customSpaces.filter(item => item !== space)
    const hiddenSpaces = Array.from(new Set([...get().hiddenSpaces, space]))
    localStorage.setItem('caballocci.spaces', JSON.stringify(customSpaces))
    localStorage.setItem('caballocci.hidden-spaces', JSON.stringify(hiddenSpaces))
    set({ customSpaces, hiddenSpaces, activeSpace: get().activeSpace === space ? null : get().activeSpace })
  },
  saveSpaceNotes: (space, notes) => {
    const existingKey = get().spaceKeys[space]
    const stableKey = existingKey || crypto.randomUUID()
    const spaceKeys = existingKey ? get().spaceKeys : { ...get().spaceKeys, [space]: stableKey }
    if (!existingKey) { localStorage.setItem('caballocci.space-keys', JSON.stringify(spaceKeys)); set({ spaceKeys }) }
    const spaceNotes = { ...get().spaceNotes, [stableKey]: notes }
    localStorage.setItem('caballocci.space-notes', JSON.stringify(spaceNotes))
    set({ spaceNotes })
  },
  saveQuickWrites: (space, writes) => {
    const existingKey = get().spaceKeys[space]
    const stableKey = existingKey || crypto.randomUUID()
    const spaceKeys = existingKey ? get().spaceKeys : { ...get().spaceKeys, [space]: stableKey }
    if (!existingKey) { localStorage.setItem('caballocci.space-keys', JSON.stringify(spaceKeys)); set({ spaceKeys }) }
    const quickWrites = { ...get().quickWrites, [stableKey]: writes }
    localStorage.setItem('caballocci.quick-writes', JSON.stringify(quickWrites))
    set({ quickWrites })
  },
}))
