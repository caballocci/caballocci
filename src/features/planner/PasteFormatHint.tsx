import { X } from 'lucide-react'

/**
 * Aviso después de pegar texto libre: la acción se hizo igual (pegar nunca
 * destruye, se puede deshacer con Ctrl+Z), pero el texto no seguía el
 * formato de la app, así que puede que el resultado no sea el esperado.
 * Muestra un ejemplo mínimo de formato aceptado y cómo conseguirlo desde
 * la app sin escribirlo a mano.
 */
export function PasteFormatHint({ onClose }: { onClose(): void }) {
  return <div className="space-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="space-dialog paste-hint-dialog" role="alertdialog" aria-label="Consejo de formato">
      <header><div><span>PORTAPAPELES</span><h2>Se pegó, pero tal vez querías otra cosa</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={18} /></button></header>
      <p>El texto pegado no seguía el formato de la app, así que se pegó como texto libre: sin título ni campos separados. Puedes deshacerlo con Ctrl+Z.</p>
      <p>Para que una publicación se pegue con sus partes (título, texto, notas, diapositivas), usa <strong>«Copiar publicación…»</strong> del menú de la tarjeta. Si prefieres armar el texto a mano, este es un formato que la app entiende:</p>
      <pre className="paste-hint-example">{`TÍTULO:
El título de la publicación

TEXTO:
El texto de la publicación

DIAPOSITIVA 01
Texto de la primera diapositiva

---

DIAPOSITIVA 02
Texto de la segunda diapositiva`}</pre>
      <footer><button type="button" className="save-button" onClick={onClose}>Entendido</button></footer>
    </div>
  </div>
}
