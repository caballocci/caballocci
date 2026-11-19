import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renderiza markdown de notas de versión de forma segura: sin HTML crudo
 * (el contenido del release es externo) y con GFM. Los estilos viven en
 * `.markdown-body` (styles-global.css).
 */
export function ReleaseNotesMarkdown({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div className={className ? `markdown-body ${className}` : 'markdown-body'}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  )
}
