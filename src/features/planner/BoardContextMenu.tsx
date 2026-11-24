import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronDown, ChevronRight, Eraser } from 'lucide-react'
import { contentLabels } from '../../shared/constants'
import type { ContentType } from '../../shared/types'

export function BoardContextMenu({ x, y, label, children }: { x: number; y: number; label: string; children: ReactNode }) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return

    const positionMenu = () => {
      const { width, height } = menu.getBoundingClientRect()
      setPosition({
        left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
      })
    }

    const observer = new ResizeObserver(positionMenu)
    observer.observe(menu)
    window.addEventListener('resize', positionMenu)
    positionMenu()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', positionMenu)
    }
  }, [x, y])

  return createPortal(<div
    ref={menuRef}
    className="board-context-menu"
    role="menu"
    aria-label={label}
    style={{ left: position?.left ?? x, top: position?.top ?? y, visibility: position ? 'visible' : 'hidden' }}
    onPointerDown={event => event.stopPropagation()}
  >{children}</div>, document.body)
}

export function BoardContextSeparator() {
  return <div className="board-context-separator" role="separator" />
}

export function BoardContextSubmenu({ label, icon, children, ariaLabel }: {
  label: string
  icon?: ReactNode
  children: ReactNode
  ariaLabel?: string
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const focusedRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) { setPosition(null); return }
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!trigger || !panel) return

    const place = () => {
      const anchor = trigger.getBoundingClientRect()
      const { width, height } = panel.getBoundingClientRect()
      const right = anchor.right + 4
      const left = right + width <= window.innerWidth - 8 ? right : Math.max(8, anchor.left - width - 4)
      setPosition({
        left: Math.max(8, left),
        top: Math.max(8, Math.min(anchor.top, window.innerHeight - height - 8)),
      })
    }
    const observer = new ResizeObserver(place)
    observer.observe(panel)
    window.addEventListener('resize', place)
    place()
    return () => { observer.disconnect(); window.removeEventListener('resize', place) }
  }, [open])

  useEffect(() => {
    if (!open) { focusedRef.current = false; return }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !position || focusedRef.current) return
    focusedRef.current = true
    panelRef.current?.querySelector<HTMLElement>('button:not(:disabled), input')?.focus()
  }, [open, position])

  return <>
    <button
      ref={triggerRef}
      type="button"
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={open}
      onKeyDown={event => {
        if (event.key === 'ArrowRight') { event.preventDefault(); setOpen(true) }
        if (event.key === 'ArrowLeft') { event.preventDefault(); setOpen(false) }
      }}
      onClick={() => setOpen(value => !value)}
    >{icon}{label}<ChevronRight className="board-context-submenu-chevron" size={14} /></button>
    {open && createPortal(<div
      ref={panelRef}
      className="board-context-menu board-context-submenu"
      role="menu"
      aria-label={ariaLabel ?? label}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
      onPointerDown={event => event.stopPropagation()}
    >{children}</div>, document.body)}
  </>
}

export function BoardContextSelectionActions({ count, hasScheduledPosts, scheduleAt, scheduleWarning, onScheduleAtChange, onSchedule, onClearSchedule, onFormat }: {
  count: number
  hasScheduledPosts: boolean
  scheduleAt: string
  scheduleWarning: string
  onScheduleAtChange(value: string): void
  onSchedule(): void
  onClearSchedule(): void
  onFormat(contentType: ContentType): void
}) {
  const [showFormats, setShowFormats] = useState(false)

  return <>
    {count > 1 && <div className="board-context-selection-note">{count} publicaciones seleccionadas</div>}
    <button type="button" role="menuitem" aria-expanded={showFormats} onClick={() => setShowFormats(value => !value)}>
      {showFormats ? <ChevronDown size={14} /> : <ChevronRight size={14} />}Formato…
    </button>
    {showFormats && <div className="board-context-statuses" role="group" aria-label="Formato">{(Object.keys(contentLabels) as ContentType[]).map(contentType =>
      <button type="button" role="menuitem" key={contentType} onClick={() => onFormat(contentType)}>{contentLabels[contentType]}</button>,
    )}</div>}
    <BoardContextSubmenu label="Programar publicación…" icon={<CalendarDays size={14} />} ariaLabel="Programar publicación">
      <div className="board-context-schedule">
        <label>Fecha y hora<input type="datetime-local" value={scheduleAt} onChange={event => onScheduleAtChange(event.target.value)} /></label>
        <button type="button" role="menuitem" disabled={!scheduleAt} onClick={onSchedule}><CalendarDays size={14} />Programar {count > 1 ? 'selección' : 'publicación'}</button>
        {hasScheduledPosts && <button type="button" role="menuitem" onClick={onClearSchedule}><Eraser size={14} />Quitar fecha y hora</button>}
        {scheduleWarning && <span className="bulk-schedule-warning" role="alert">{scheduleWarning}</span>}
      </div>
    </BoardContextSubmenu>
  </>
}
