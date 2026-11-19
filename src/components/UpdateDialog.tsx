import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, ExternalLink, RotateCw } from 'lucide-react'
import type { UpdateState } from '../shared/types'
import { prepareReleaseNotes } from '../shared/release-notes'
import { reportAppError, runWithErrorReporting } from '../app/errors'
import { ReleaseNotesMarkdown } from './ReleaseNotesMarkdown'
import './update-dialog.css'

export function UpdateDialog() {
  const [update, setUpdate] = useState<UpdateState | null>(null)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const unsubscribe = window.planner.updates.onStateChange(setUpdate)
    void window.planner.updates.getState().then(setUpdate).catch(error => reportAppError(error, 'No se pudo consultar el estado de las actualizaciones'))
    return unsubscribe
  }, [])

  const version = update?.availableVersion
  const visible = Boolean(update?.status === 'installing' || (version && version !== dismissedVersion && ['available', 'downloading', 'downloaded', 'updated', 'error'].includes(update?.status || '')))
  const busy = update?.status === 'downloading' || update?.status === 'installing'

  const prepared = useMemo(
    () => prepareReleaseNotes({ version: update?.availableVersion, notes: update?.releaseNotes, url: update?.releaseUrl }),
    [update?.availableVersion, update?.releaseNotes, update?.releaseUrl],
  )

  useEffect(() => { setExpanded(false) }, [prepared.version])

  useEffect(() => {
    if (!visible) return
    if (primaryRef.current) primaryRef.current.focus()
    else dialogRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!busy && version) setDismissedVersion(version)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'))
      if (!focusable.length) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, version, visible, update?.status])

  if (!visible || !update || (!version && update.status !== 'installing')) return null

  const installing = update.status === 'installing'
  const downloaded = update.status === 'downloaded'
  const updated = update.status === 'updated'
  const downloading = update.status === 'downloading'
  const errored = update.status === 'error'

  const displayVersion = prepared.version
  const title = installing
    ? 'Instalando la actualización…'
    : updated
      ? 'Así termina la actualización'
      : downloading
        ? 'Descargando la actualización…'
        : downloaded
          ? `Actualización ${displayVersion ?? ''} lista para instalar`.trim()
          : errored
            ? 'No se pudo completar la actualización'
            : `Hay una nueva versión: ${displayVersion ?? ''}`.trim()

  const hasNotes = prepared.hasNotes
  const showToggle = hasNotes && prepared.fullNotes !== prepared.summary
  const summaryId = 'update-dialog-summary'

  return <div className="update-dialog-backdrop" role="presentation">
    <section
      ref={dialogRef}
      tabIndex={-1}
      className={`update-dialog${installing ? ' installing' : ''}${updated ? ' updated' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-dialog-title"
      aria-describedby={hasNotes && prepared.summary ? summaryId : undefined}
    >
      <h2 id="update-dialog-title">{title}</h2>

      {installing && (
        <>
          <p className="update-dialog-message">{update.message}</p>
          <p className="update-dialog-guidance">{update.preview ? 'Esta secuencia es una simulación: la aplicación no se cerrará ni se ejecutará ningún instalador.' : 'caballocci se cerrará y se abrirá el instalador de Windows con el progreso visible. Si Windows solicita permiso, confírmalo. Al terminar, caballocci volverá a abrirse automáticamente.'}</p>
          <div className="update-install-progress" role="progressbar" aria-label="Preparando la instalación"><span /></div>
        </>
      )}

      {updated && (
        <p className="update-dialog-guidance">En una actualización real, caballocci volvería a abrirse con la nueva versión. Esta vista previa no instaló ningún archivo.</p>
      )}

      {!installing && !updated && (
        <>
          {hasNotes && prepared.summary
            ? <div id={summaryId} className="update-dialog-summary"><ReleaseNotesMarkdown markdown={prepared.summary} /></div>
            : <p id={summaryId} className="update-dialog-message">No se publicaron notas para esta versión. Puedes consultar la publicación en GitHub.</p>}
          {showToggle && (
            <button
              type="button"
              className="update-dialog-toggle"
              aria-expanded={expanded}
              aria-controls="update-dialog-notes"
              onClick={() => setExpanded(value => !value)}
            >{expanded ? 'Ocultar novedades' : 'Ver todas las novedades'}</button>
          )}
          {expanded && prepared.fullNotes && (
            <div id="update-dialog-notes" className="update-dialog-notes">
              <ReleaseNotesMarkdown markdown={prepared.fullNotes} />
            </div>
          )}
          {downloading && <div className="update-dialog-progress"><progress max="100" value={update.percent || 0} /><span>{Math.round(update.percent || 0)}%</span></div>}
          {errored && update.message && <p className="update-dialog-message">{update.message}</p>}
        </>
      )}

      <footer>
        {!installing && !updated && version && (
          <div className="update-dialog-secondary">
            {!busy && <button type="button" className="settings-button quiet" onClick={() => setDismissedVersion(version)}>Más tarde</button>}
            {!update.preview && prepared.url && (
              <button
                type="button"
                className="update-dialog-link"
                onClick={() => void runWithErrorReporting(() => window.planner.updates.openReleaseNotes(), 'No se pudieron abrir las notas de versión')}
              ><ExternalLink size={13} /> Ver en GitHub</button>
            )}
          </div>
        )}
        {updated && <button ref={primaryRef} type="button" className="settings-button primary" onClick={() => setDismissedVersion(version || null)}>Cerrar vista previa</button>}
        {!updated && update.status === 'available' && (
          <button ref={primaryRef} type="button" className="settings-button primary" onClick={() => void runWithErrorReporting(() => window.planner.updates.download(), 'No se pudo descargar la actualización')}><Download size={15} /> Descargar actualización</button>
        )}
        {!updated && errored && (
          <button ref={primaryRef} type="button" className="settings-button primary" onClick={() => void runWithErrorReporting(() => window.planner.updates.download(), 'No se pudo descargar la actualización')}><Download size={15} /> Reintentar descarga</button>
        )}
        {!updated && downloaded && (
          <button ref={primaryRef} type="button" className="settings-button primary" onClick={() => void runWithErrorReporting(() => window.planner.updates.install(), 'No se pudo instalar la actualización')}><RotateCw size={15} /> Reiniciar y actualizar</button>
        )}
      </footer>
    </section>
  </div>
}
