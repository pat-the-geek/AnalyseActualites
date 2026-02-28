import { useEffect, useState } from 'react'
import { X, FileText, Download, Loader2, ExternalLink } from 'lucide-react'

/**
 * EntityArticlePanel — affiche les articles contenant une entité donnée.
 *
 * Props:
 *   entityType  {string}  — type NER (ex. "PRODUCT")
 *   entityValue {string}  — valeur (ex. "ChatGPT")
 *   onClose     {fn}      — ferme le panneau
 */
export default function EntityArticlePanel({ entityType, entityValue, onClose }) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ type: entityType, value: entityValue })
    fetch(`/api/entities/articles?${params}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.error) throw new Error(data.error)
        setArticles(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [entityType, entityValue])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleExportJSON = () => {
    const safe = entityValue.replace(/[^a-zA-Z0-9_\-]/g, '_')
    const filename = `entites_${entityType}_${safe}_${new Date().toISOString().slice(0, 10)}.json`
    const blob = new Blob([JSON.stringify(articles, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleGenerateReport = () => {
    const today = new Date().toISOString().slice(0, 10)
    const safe = entityValue.replace(/[^a-zA-Z0-9_\-]/g, '_')
    let md = `# Rapport — ${entityType} : ${entityValue}\n\n`
    md += `*Généré le ${today} — ${articles.length} article${articles.length !== 1 ? 's' : ''}*\n\n`
    md += `---\n\n`
    for (const art of articles) {
      const date = art['Date de publication'] || ''
      const source = art['Sources'] || ''
      const resume = art['Résumé'] || ''
      const url = art['URL'] || ''
      const images = art['Images'] || []
      const header = [date, source].filter(Boolean).join(' — ')
      if (header) md += `### ${header}\n\n`
      if (resume) md += `${resume}\n\n`
      if (images.length > 0) {
        const imgUrl = images[0].URL || images[0].url || ''
        if (imgUrl) md += `![illustration](${imgUrl})\n\n`
      }
      if (url) md += `[Lire l'article](${url})\n\n`
      md += `---\n\n`
    }
    const filename = `rapport_${entityType}_${safe}_${today}.md`
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 dark:border-slate-700 overflow-hidden my-4">

        {/* ── En-tête ── */}
        <div className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex-wrap gap-y-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">
              Occurrences de{' '}
              <span className="text-violet-600 dark:text-violet-400">{entityValue}</span>
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0">
              {entityType}
            </span>
            {!loading && (
              <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                — {articles.length} article{articles.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleGenerateReport}
              disabled={loading || articles.length === 0}
              title="Générer un rapport Markdown"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FileText size={13} />
              Générer un rapport
            </button>
            <button
              onClick={handleExportJSON}
              disabled={loading || articles.length === 0}
              title="Exporter les articles en JSON"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Download size={13} />
              Exporter JSON
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Corps ── */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-400 dark:text-slate-500">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Chargement des articles…</span>
            </div>
          ) : error ? (
            <div className="text-center py-16 text-red-500 dark:text-red-400 text-sm">{error}</div>
          ) : articles.length === 0 ? (
            <div className="text-center py-16 text-slate-400 dark:text-slate-500 text-sm">
              Aucun article trouvé pour cette entité.
            </div>
          ) : (
            articles.map((art, i) => (
              <article
                key={i}
                className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                    {art['Date de publication'] && (
                      <span>{art['Date de publication']}</span>
                    )}
                    {art['Sources'] && (
                      <>
                        <span>·</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{art['Sources']}</span>
                      </>
                    )}
                  </div>
                  {art['URL'] && (
                    <a
                      href={art['URL']}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                    >
                      Lire <ExternalLink size={11} />
                    </a>
                  )}
                </div>
                {art['Résumé'] && (
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-4">
                    {art['Résumé']}
                  </p>
                )}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
