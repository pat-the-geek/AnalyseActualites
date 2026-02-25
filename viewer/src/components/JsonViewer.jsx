import { useMemo } from 'react'

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Applique la coloration syntaxique JSON via du HTML inline.
 * On échappe d'abord le HTML pour éviter toute injection.
 */
function highlightJson(code) {
  const safe = escapeHtml(code)
  return safe.replace(
    /("(?:\\.|[^"\\])*"(?:\s*:)?|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      // Clé d'objet : chaîne suivie de ":"
      if (/^".*"(\s*):$/.test(match) || /^".*":$/.test(match)) {
        return `<span style="color:#f6c96c">${match}</span>`
      }
      // Valeur chaîne
      if (match.startsWith('"')) {
        return `<span style="color:#86efac">${match}</span>`
      }
      // Booléen
      if (match === 'true' || match === 'false') {
        return `<span style="color:#fb7185">${match}</span>`
      }
      // Null
      if (match === 'null') {
        return `<span style="color:#94a3b8">${match}</span>`
      }
      // Nombre
      return `<span style="color:#93c5fd">${match}</span>`
    },
  )
}

export default function JsonViewer({ content }) {
  const { highlighted, error } = useMemo(() => {
    let formatted = content
    let error = null
    try {
      formatted = JSON.stringify(JSON.parse(content), null, 2)
    } catch (e) {
      error = e.message
    }
    return { highlighted: highlightJson(formatted), error }
  }, [content])

  return (
    <div>
      {error && (
        <div className="mb-3 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded-lg text-xs text-red-400 font-mono">
          JSON invalide : {error}
        </div>
      )}
      <pre
        className="text-sm font-mono leading-relaxed text-slate-300 whitespace-pre-wrap break-words"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  )
}
