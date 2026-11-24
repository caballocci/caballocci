import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, Smartphone } from 'lucide-react'
import { DEFAULT_POST_COLOR, isDefaultPostColor, postColors } from '../../shared/postColors'
import { formatElapsedSince, formatMarkedAt, interestLevelLabels, interestLevelNames, type PostInterestLevel } from '../../shared/post-marks'
import type { Post } from '../../shared/types'
import './post-marks.css'

export type BoardCardDetailLevel = 'hidden' | 'discreet' | 'full'
export type MobilePublicationProgress = { destinations: number; awaitingConfirmation: number; used: number; retirementPending: number }
export type MobilePublicationState = {
  configured: boolean
  currentPostIds: string[]
  previouslyExportedPostIds: string[]
  progressByPostId: Record<string, MobilePublicationProgress>
}

export function MobileCardStatus({ state, postId, detailLevel }: { state: MobilePublicationState | null; postId: string; detailLevel: BoardCardDetailLevel }) {
  if (detailLevel === 'hidden') return null
  if (!state || !state.configured) {
    if (detailLevel === 'discreet') return null
    return <span className="board-mobile-state unknown"><Smartphone size={11} /> {state ? 'Sin configurar' : 'Consultando'}</span>
  }
  const current = state.currentPostIds.includes(postId)
  const previous = !current && state.previouslyExportedPostIds.includes(postId)
  const progress = state.progressByPostId[postId]
  if (!current && !previous && detailLevel === 'discreet') return null
  const kind = current && progress?.retirementPending
    ? 'retirement-pending'
    : current && progress?.awaitingConfirmation
      ? 'awaiting'
      : current
        ? 'current'
        : previous
          ? 'previous'
          : 'never'
  const label = current
    ? progress?.retirementPending
      ? `Retiro pendiente${progress.retirementPending < progress.destinations ? ` ${progress.retirementPending}/${progress.destinations}` : ''}`
      : progress?.awaitingConfirmation
        ? progress.used
          ? `Confirmadas ${progress.used}/${progress.destinations}`
          : 'Esperando confirmación'
        : progress
          ? 'Uso confirmado'
          : 'En catálogo móvil'
    : previous ? 'Exportada antes' : 'No exportada'
  const title = current && progress?.retirementPending
    ? 'La PC recibió la señal de retiro; falta revisar y confirmar la conciliación del catálogo en Ajustes → App Android de caballocci.'
    : current && progress?.awaitingConfirmation
      ? progress.used
        ? `${progress.used} de ${progress.destinations} destinos confirmados como usados; falta confirmar los restantes en el móvil.`
        : 'Exportación completada; la PC espera una señal de uso o retiro desde el móvil.'
      : current
        ? progress
          ? `El móvil confirmó el uso de ${progress.used || progress.destinations} destino(s). Sigue en el catálogo hasta que se retire.`
          : 'Esta publicación tiene al menos un destino en el catálogo móvil.'
    : previous
      ? 'Se exportó al celular antes, pero ya no está en el catálogo actual.'
      : 'Esta publicación nunca se ha exportado al celular.'
  if (detailLevel === 'discreet') return <span className={`board-mobile-state ${kind} discreet`} title={title} aria-label={label}><Smartphone size={11} /></span>
  return <span className={`board-mobile-state ${kind}`} title={title}><Smartphone size={11} /> {label}</span>
}

type MobileStateKind = 'retirement-pending' | 'awaiting' | 'current' | 'previous' | 'never'

function mobileKindForPost(state: MobilePublicationState, postId: string): MobileStateKind {
  if (state.currentPostIds.includes(postId)) {
    const progress = state.progressByPostId[postId]
    if (progress?.retirementPending) return 'retirement-pending'
    if (progress?.awaitingConfirmation) return 'awaiting'
    return 'current'
  }
  return state.previouslyExportedPostIds.includes(postId) ? 'previous' : 'never'
}

const mobileKindPriority: MobileStateKind[] = ['retirement-pending', 'awaiting', 'current', 'previous']

/**
 * Indicador agregado del catálogo móvil para una pila: resume el estado de todos sus
 * miembros en un solo teléfono (con la cantidad cuando hay más de uno) y deja el
 * desglose en el tooltip. Así la pila no queda ciega a la integración móvil.
 */
export function MobileStackStatus({ state, postIds, detailLevel }: { state: MobilePublicationState | null; postIds: string[]; detailLevel: BoardCardDetailLevel }) {
  if (detailLevel === 'hidden') return null
  if (!state || !state.configured) {
    if (detailLevel === 'discreet') return null
    return <span className="board-mobile-state unknown"><Smartphone size={11} /> {state ? 'Sin configurar' : 'Consultando'}</span>
  }
  const counts = new Map<MobileStateKind, number>()
  for (const postId of postIds) {
    const kind = mobileKindForPost(state, postId)
    if (kind !== 'never') counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
  if (!total) return null
  const kind = mobileKindPriority.find(candidate => counts.has(candidate)) ?? 'current'
  const label = total === 1 ? '1 publicación en la app móvil' : `${total} publicaciones en la app móvil`
  const parts: string[] = []
  const pending = counts.get('retirement-pending') ?? 0
  const awaiting = counts.get('awaiting') ?? 0
  const current = counts.get('current') ?? 0
  const previous = counts.get('previous') ?? 0
  if (pending) parts.push(`${pending} con retiro pendiente`)
  if (awaiting) parts.push(`${awaiting} esperando confirmación`)
  if (current) parts.push(`${current} con uso confirmado`)
  if (previous) parts.push(`${previous} exportada${previous === 1 ? '' : 's'} antes`)
  const title = `${label}. ${parts.join(', ')}.`
  if (detailLevel === 'full') return <span className={`board-mobile-state ${kind}`} title={title}><Smartphone size={11} /> {label}</span>
  return <span className={`board-mobile-state ${kind} discreet board-mobile-stack`} title={title} aria-label={title}><Smartphone size={11} />{total > 1 && <b>{total}</b>}</span>
}

export function BoardCardColorPicker({ post, onColor }: { post: Post; onColor(color: string): void }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)
  const usesDefaultColor = isDefaultPostColor(post.color)
  const close = () => { setOpen(false); setPosition(null) }
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && (triggerRef.current?.contains(target) || optionsRef.current?.contains(target))) return
      close()
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])
  const toggle = () => {
    if (open) { close(); return }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = 145
    const height = 94
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
    const top = rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 5 : Math.max(8, rect.top - height - 5)
    setPosition({ top, left })
    setOpen(true)
  }
  return <div className="board-card-color-picker" onClick={event => event.stopPropagation()}>
    <button ref={triggerRef} type="button" className={`board-card-color-trigger${usesDefaultColor ? ' is-default' : ''}`} aria-label="Cambiar color de tarjeta" aria-expanded={open} title={usesDefaultColor ? 'Sin color' : 'Color de tarjeta'} style={{ backgroundColor: usesDefaultColor ? 'transparent' : post.color }} onClick={toggle} />
    {open && position && createPortal(<div ref={optionsRef} className="board-card-color-options" role="group" aria-label="Colores de tarjeta" style={{ top: position.top, left: position.left }} onClick={event => event.stopPropagation()}>
      {postColors.map(color => <button type="button" key={color.value} aria-label={color.label} title={color.label} aria-pressed={post.color === color.value} style={{ backgroundColor: color.value }} onClick={() => { onColor(color.value); setOpen(false) }} />)}
      <button type="button" className="board-card-color-reset" aria-label="Quitar color de tarjeta" title="Sin color" aria-pressed={usesDefaultColor} onClick={() => { onColor(DEFAULT_POST_COLOR); close() }}><i aria-hidden="true" />Sin color</button>
    </div>, document.body)}
  </div>
}

// Un solo temporizador para todas las marcas del tablero, no uno por tarjeta.
const clockListeners = new Set<() => void>()
let clockTimer: number | undefined
function subscribeClock(listener: () => void) {
  clockListeners.add(listener)
  if (clockTimer === undefined) clockTimer = window.setInterval(() => { for (const notify of clockListeners) notify() }, 60_000)
  return () => {
    clockListeners.delete(listener)
    if (!clockListeners.size && clockTimer !== undefined) { window.clearInterval(clockTimer); clockTimer = undefined }
  }
}
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => subscribeClock(() => setNow(Date.now())), [])
  return now
}

/** Marcas personales de la tarjeta: tiempo desde la fecha registrada y destacado. */
export function PostMarks({ dateMark, interestLevel }: { dateMark?: string; interestLevel?: PostInterestLevel }) {
  const now = useNow()
  if (!dateMark && !interestLevel) return null
  return <div className="board-card-marks">
    {dateMark && <span className="board-date-mark" title={formatMarkedAt(dateMark, now)}><CalendarClock size={11} /><span>{formatElapsedSince(dateMark, now)}</span></span>}
    {interestLevel && <span className={`board-interest-mark level-${interestLevel}`} title={`Destacado: ${interestLevelLabels[interestLevel]} · ${interestLevelNames[interestLevel]}`}>{interestLevelLabels[interestLevel]}</span>}
  </div>
}
