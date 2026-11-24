import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowUpFromLine, CalendarDays, ChevronDown, ChevronUp, FileText, Film, Images, Layers, MoreHorizontal, Pencil } from 'lucide-react'
import { PlatformMark } from '../../components/layout/AppShell'
import { isDefaultPostColor } from '../../shared/postColors'
import type { PostInterestLevel } from '../../shared/post-marks'
import type { ContentType, Post } from '../../shared/types'
import { MobileCardStatus, MobileStackStatus, PostMarks, type BoardCardDetailLevel, type MobilePublicationState } from './BoardCardDecorations'
import type { StackDropHover } from './stack-drop-zone'

export const stackContentIcon = (contentType: ContentType) => contentType === 'reel' ? Film : contentType === 'carousel' ? Images : FileText

/** Acciones que la pila delega en el tablero: render puro, estado y handlers fuera. */
export type StackHandlers = {
  toggleExpand(stackId: string): void
  selectStack(ids: string[]): void
  select(id: string | null): void
  toggle(id: string, range?: boolean, order?: string[]): void
  pickPost?(id: string): boolean
  openContextMenu(event: React.MouseEvent<HTMLElement>, post: Post, ids?: string[]): void
  startDrag(event: React.DragEvent<HTMLElement>, post: Post): void
  endDrag(): void
  dragOver(event: React.DragEvent<HTMLElement>, post: Post, status: Post['status']): void
  dragLeave(postId: string): void
  drop(event: React.DragEvent<HTMLElement>, post: Post, status: Post['status']): void
  startMemberDrag(event: React.DragEvent<HTMLElement>, member: Post, stackId: string): void
  endMemberDrag(): void
  memberDragOver(event: React.DragEvent<HTMLElement>, member: Post, stackId: string): void
  memberDrop(event: React.DragEvent<HTMLElement>, member: Post, stackId: string): void
  containerDragOver(event: React.DragEvent<HTMLElement>, items: Post[], status: Post['status']): void
  containerDragLeave(event: React.DragEvent<HTMLElement>, stackId: string): void
  containerDrop(event: React.DragEvent<HTMLElement>, items: Post[], status: Post['status']): void
  unstack(member: Post): void
  renameStack(stackId: string, name: string): void
}

/** El tooltip animado de un miembro solo tiene sentido si el título está recortado por el line-clamp:
    se marca al entrar/enfocar para que el CSS lo muestre únicamente en ese caso. */
const flagTruncatedTitle = (member: HTMLElement) => {
  const title = member.querySelector<HTMLElement>('.board-stack-member-title')
  member.toggleAttribute('data-truncated', Boolean(title && title.scrollHeight > title.clientHeight + 1))
}

type StackSharedProps = {
  selected: Set<string>
  dragging: Set<string>
  /** Marcas personales: fecha registrada y destacado (> / >> / >>>), por id de publicación. */
  dateMarks: Record<string, string>
  interestLevels: Record<string, PostInterestLevel>
  mobilePublicationState: MobilePublicationState | null
  boardCardDetailLevel: BoardCardDetailLevel
  handlers: StackHandlers
}

/** Card cerrada: unidad organizativa sobria; el contenido es una capa secundaria.
    Hover/foco revela la vista previa; clic abre la lista interactiva. */
export function StackClosedCard({ items, stackId, columnStatus, selected, dragging, dateMarks, interestLevels, mobilePublicationState, boardCardDetailLevel, handlers }: StackSharedProps & {
  items: Post[]
  stackId: string
  columnStatus: Post['status']
}) {
  const memberIds = items.map(member => member.id)
  const stackCount = items.length
  const top = items[0]
  const memberSelected = memberIds.every(id => selected.has(id))
  const memberSomeSelected = memberIds.some(id => selected.has(id))
  const isCustomColor = !isDefaultPostColor(top.color)
  const cardClass = `board-card board-stack-card board-stack-summary${isCustomColor ? ' has-custom-color' : ''}${memberSelected ? ' selected' : ''}${memberIds.some(id => dragging.has(id)) || dragging.has(top.id) ? ' is-dragging' : ''}`
  const scheduled = items.filter(member => member.scheduledAt).map(member => ({ post: member, time: parseISO(member.scheduledAt as string).getTime() })).sort((a, b) => a.time - b.time)
  const nextScheduled = scheduled[0] ?? null
  const overdue = nextScheduled !== null && (columnStatus === 'idea' || columnStatus === 'draft') && nextScheduled.time < Date.now()
  const typeCounts = new Map<ContentType, number>()
  for (const member of items) typeCounts.set(member.contentType, (typeCounts.get(member.contentType) ?? 0) + 1)
  const platformUnion: string[] = []
  for (const member of items) for (const platform of member.platforms) if (!platformUnion.includes(platform)) platformUnion.push(platform)
  // Colores de portada: una franja con el color de cada miembro apilado, única vez cada uno.
  const memberColors: string[] = []
  for (const member of items) if (!isDefaultPostColor(member.color) && !memberColors.includes(member.color)) memberColors.push(member.color)
  return <article
    data-area-select-id={top.id}
    tabIndex={0}
    className={cardClass}
    style={{ '--post-color': top.color } as React.CSSProperties}
    draggable
    onDragStart={event => handlers.startDrag(event, top)}
    onDragEnd={handlers.endDrag}
    onDragOver={event => handlers.dragOver(event, top, columnStatus)}
    onDragEnter={event => handlers.dragOver(event, top, columnStatus)}
    onDragLeave={() => handlers.dragLeave(top.id)}
    onDrop={event => handlers.drop(event, top, columnStatus)}
    onContextMenu={event => handlers.openContextMenu(event, top, memberIds)}
    onClick={() => handlers.toggleExpand(stackId)}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handlers.toggleExpand(stackId) } }}
    aria-expanded={false}
    aria-label={top.stackName
      ? `Pila «${top.stackName}» de ${stackCount} publicaciones: ${items.map(member => member.title || 'Publicación sin título').join('; ')}`
      : `Pila de ${stackCount} publicaciones: ${items.map(member => member.title || 'Publicación sin título').join('; ')}`}
  >
    <label className="board-select-hit" onClick={event => event.stopPropagation()}>
      <input type="checkbox" checked={memberSelected} ref={input => { if (input) input.indeterminate = memberSomeSelected && !memberSelected }} onChange={() => handlers.selectStack(memberIds)} aria-label={`Seleccionar pila de ${stackCount}`} />
    </label>
    <div className="board-stack-summary-row">
      <span className="board-stack-summary-badge"><Layers size={14} aria-hidden="true" /><b>{stackCount}</b></span>
      <span className="board-stack-summary-types">{[...typeCounts].map(([type, count]) => { const Icon = stackContentIcon(type); return <span key={type} className="board-stack-summary-type"><Icon size={12} aria-hidden="true" />{count > 1 && <i>×{count}</i>}</span> })}</span>
      <span className="board-stack-summary-platforms">{platformUnion.slice(0, 5).map(platform => <PlatformMark key={platform} platform={platform} small />)}</span>
    </div>
    {/* El título del miembro superior hace identificable la pila sin abrirla.
        Los títulos completos los revela el preview del hover; el tooltip animado vive en los miembros de la pila expandida. */}
    <div className={`board-stack-summary-title${top.stackName ? ' named' : ''}`}>
      <span>{top.stackName || top.title || 'Publicación sin título'}</span>
      {top.stackName && <small className="board-stack-summary-subtitle">{top.title || 'Publicación sin título'}</small>}
      {stackCount > 1 && <em>+{stackCount - 1}</em>}
    </div>
    <div className="board-stack-summary-foot">
      {nextScheduled && <span className={`board-stack-summary-date${overdue ? ' overdue' : ''}`}><CalendarDays size={11} aria-hidden="true" /><span>{format(nextScheduled.time, 'd MMM', { locale: es })}</span><time dateTime={nextScheduled.post.scheduledAt ?? undefined}>{format(nextScheduled.time, 'HH:mm')}</time>{overdue && <b>Atrasada</b>}</span>}
      {(dateMarks[top.id] || interestLevels[top.id]) && <PostMarks dateMark={dateMarks[top.id]} interestLevel={interestLevels[top.id]} />}
      <MobileStackStatus state={mobilePublicationState} postIds={memberIds} detailLevel={boardCardDetailLevel === 'hidden' ? 'hidden' : 'discreet'} />
    </div>
    {memberColors.length > 0 && <div className="board-stack-color-strip" aria-hidden="true" title={memberColors.length === 1 ? '1 color en la pila' : `${memberColors.length} colores en la pila`}>
      {memberColors.map(color => <span key={color} className="board-stack-color-chip" style={{ backgroundColor: color }} />)}
    </div>}
    <div className="board-stack-preview" aria-hidden="true">
      {items.map(member => { const Icon = stackContentIcon(member.contentType); const customColor = !isDefaultPostColor(member.color); return <div key={member.id} className={`board-stack-preview-item${customColor ? ' has-custom-color' : ''}`} style={{ '--post-color': member.color } as React.CSSProperties}><Icon size={11} aria-hidden="true" /><span>{member.title || 'Publicación sin título'}</span></div> })}
    </div>
  </article>
}

/** Lista expandida e interactiva de la pila, con acciones sobre el conjunto en el header. */
export function StackExpandedList({ items, stackId, columnStatus, selected, dragging, dateMarks, interestLevels, mobilePublicationState, boardCardDetailLevel, hoverZone, unstackable, handlers }: StackSharedProps & {
  items: Post[]
  stackId: string
  columnStatus: Post['status']
  /** Zona bajo el puntero, ya filtrada a esta pila: decide el marco de desapilado y el reordenamiento. */
  hoverZone: StackDropHover | null
  /** Hay un miembro de esta pila arrastrándose: el marco de desapilado se muestra como affordance. */
  unstackable: boolean
}) {
  const orderIds = items.map(member => member.id)
  const allSelected = orderIds.every(id => selected.has(id))
  const someSelected = orderIds.some(id => selected.has(id))
  const hoveringUnstack = hoverZone?.kind === 'unstack'
  const hoveringStack = hoverZone?.kind === 'stack'
  const stackName = items[0]?.stackName ?? null
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const submitName = () => { handlers.renameStack(stackId, draftName); setRenaming(false) }
  return <div
    className={`board-stack-expanded${hoveringStack ? ' stack-drop-target' : ''}${unstackable ? ' stack-unstack-armed' : ''}${hoveringUnstack ? ' stack-unstack-target' : ''}`}
    role="list"
    aria-label={`Pila de ${items.length} publicaciones`}
    onDragOver={event => handlers.containerDragOver(event, items, columnStatus)}
    onDragEnter={event => handlers.containerDragOver(event, items, columnStatus)}
    onDragLeave={event => handlers.containerDragLeave(event, stackId)}
    onDrop={event => handlers.containerDrop(event, items, columnStatus)}
  >
    <div className="board-stack-expanded-header">
      <span className="board-stack-count"><Layers size={13} aria-hidden="true" /><strong>{items.length}</strong></span>
      <button type="button" className="board-stack-options-toggle" aria-expanded={optionsOpen} onClick={() => setOptionsOpen(open => !open)}><ChevronDown size={12} aria-hidden="true" /> Opciones</button>
      <button type="button" className="board-stack-collapse" aria-label="Colapsar pila" title="Colapsar pila" onClick={() => handlers.toggleExpand(stackId)}><ChevronUp size={14} /></button>
    </div>
    {optionsOpen && <div className="board-stack-options">
      {renaming
        ? <form className="board-stack-rename" onSubmit={event => { event.preventDefault(); submitName() }}>
          <input autoFocus value={draftName} maxLength={120} placeholder="Nombre de la pila" aria-label="Nombre de la pila" onChange={event => setDraftName(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setRenaming(false) } }} />
          <button type="submit" title="Guardar nombre">Guardar</button>
        </form>
        : <button type="button" className={`board-stack-name${stackName ? '' : ' unnamed'}`} title={stackName ? `Pila «${stackName}». Clic para renombrar` : 'Nombrar esta pila'} onClick={() => { setDraftName(stackName ?? ''); setRenaming(true) }}><Pencil size={11} aria-hidden="true" />{stackName || 'Nombrar pila'}</button>}
      <div className="board-stack-option-actions">
        <label className="board-stack-select-all" title="Seleccionar toda la pila" onClick={event => event.stopPropagation()}>
          <input type="checkbox" checked={allSelected} ref={input => { if (input) input.indeterminate = someSelected && !allSelected }} onChange={() => handlers.selectStack(orderIds)} aria-label={`Seleccionar pila de ${items.length}`} />
          <span>Seleccionar todas</span>
        </label>
        <button type="button" className="board-stack-actions" aria-label="Acciones de la pila" title="Acciones de la pila" onClick={event => handlers.openContextMenu(event, items[0], orderIds)}><MoreHorizontal size={14} /></button>
      </div>
    </div>}
    <div className="board-stack-unstack-label" aria-hidden="true">Sacar de la pila</div>
    {items.map(member => <div
      key={member.id}
      role="listitem"
      className={`board-stack-member${!isDefaultPostColor(member.color) ? ' has-custom-color' : ''}${selected.has(member.id) ? ' selected' : ''}${dragging.has(member.id) ? ' is-dragging' : ''}${hoverZone?.kind === 'insert' && hoverZone.targetId === member.id && hoverZone.before ? ' reorder-over-top' : ''}${hoverZone?.kind === 'insert' && hoverZone.targetId === member.id && !hoverZone.before ? ' reorder-over-bottom' : ''}`}
      data-area-select-id={member.id}
      tabIndex={0}
      draggable
      style={{ '--post-color': member.color } as React.CSSProperties}
      onDragStart={event => handlers.startMemberDrag(event, member, stackId)}
      onDragEnd={handlers.endMemberDrag}
      onDragOver={event => handlers.memberDragOver(event, member, stackId)}
      onDragEnter={event => handlers.memberDragOver(event, member, stackId)}
      onDrop={event => handlers.memberDrop(event, member, stackId)}
      onContextMenu={event => handlers.openContextMenu(event, member)}
      onMouseEnter={event => flagTruncatedTitle(event.currentTarget)}
      onFocus={event => flagTruncatedTitle(event.currentTarget)}
      onClick={event => { if (handlers.pickPost?.(member.id)) return; if (event.shiftKey || event.ctrlKey || event.metaKey || selected.size > 0) handlers.toggle(member.id, event.shiftKey, orderIds); else handlers.select(member.id) }}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (handlers.pickPost?.(member.id)) return; handlers.select(member.id) } }}
    >
      <label className="board-select-hit" onClick={event => event.stopPropagation()}>
        <input type="checkbox" checked={selected.has(member.id)} onChange={event => handlers.toggle(member.id, event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey, orderIds)} aria-label={`Seleccionar ${member.title || 'publicación'}`} />
      </label>
      <span className="board-stack-member-icons" aria-hidden="true">{(() => { const Icon = stackContentIcon(member.contentType); return <Icon size={12} /> })()}{member.platforms[0] && <PlatformMark platform={member.platforms[0]} small />}</span>
      <span className="board-stack-member-title">{member.title || 'Publicación sin título'}</span>
      {member.title && <span className="board-stack-member-tip" aria-hidden="true">{member.title}</span>}
      <div className="board-stack-member-meta">
        {member.scheduledAt && <span className="board-stack-member-date"><CalendarDays size={11} aria-hidden="true" />{format(parseISO(member.scheduledAt), 'd MMM', { locale: es })}</span>}
        {(dateMarks[member.id] || interestLevels[member.id]) && <PostMarks dateMark={dateMarks[member.id]} interestLevel={interestLevels[member.id]} />}
        <MobileCardStatus state={mobilePublicationState} postId={member.id} detailLevel={boardCardDetailLevel === 'hidden' ? 'hidden' : 'discreet'} />
      </div>
      <button type="button" className="board-stack-member-unstack" aria-label={`Sacar de la pila: ${member.title || 'publicación'}`} title="Sacar de la pila" onClick={event => { event.stopPropagation(); handlers.unstack(member) }}><ArrowUpFromLine size={13} /></button>
    </div>)}
  </div>
}
