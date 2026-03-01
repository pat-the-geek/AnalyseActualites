import { useEffect, useState, useRef, useCallback } from 'react'
import { X, FileText, Download, Loader2, ExternalLink, ChevronLeft, Network, GripHorizontal } from 'lucide-react'
import EntityGraph from './EntityGraph'

const IMAGE_TYPES = new Set(['PERSON', 'ORG', 'PRODUCT'])

// Taille et position initiales centrées
function initialWin() {
  const w = Math.round(Math.min(window.innerWidth  * 0.82, 1300))
  const h = Math.round(Math.min(window.innerHeight * 0.86, 920))
  return {
    x: Math.round((window.innerWidth  - w) / 2),
    y: Math.round((window.innerHeight - h) / 2),
    w,
    h,
  }
}

function EntityAvatar({ image, type, name, size = 40 }) {
  const [imgError, setImgError] = useState(false)
  const isPortrait = type === 'PERSON'
  const hasImage   = image != null && !imgError
  const initials   = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')

  return (
    <div
      className={[
        'shrink-0 overflow-hidden border border-slate-200 dark:border-slate-700',
        isPortrait ? 'rounded-full' : 'rounded-lg',
        hasImage && !isPortrait ? 'bg-white dark:bg-white' : 'bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center',
      ].join(' ')}
      style={{ width: size, height: size }}
    >
      {hasImage ? (
        <img
          src={image.url} alt={name} onError={() => setImgError(true)}
          className={['w-full h-full', isPortrait ? 'object-cover' : 'object-contain p-1'].join(' ')}
        />
      ) : (
        <span className="text-violet-500 dark:text-violet-300 font-semibold text-xs select-none">{initials}</span>
      )}
    </div>
  )
}

// Poignée de redimensionnement (coin bas-droite)
function ResizeHandle({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize opacity-30 hover:opacity-70 transition-opacity flex items-end justify-end p-1"
    >
      <svg width="9" height="9" viewBox="0 0 9 9" className="text-slate-500 fill-current">
        <path d="M9 3L3 9M9 6L6 9M9 0L0 9" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </svg>
    </div>
  )
}

/**
 * EntityArticlePanel — fenêtre flottante (déplaçable + redimensionnable).
 *
 * Props:
 *   entityType  {string}  — type NER initial (ex. "ORG")
 *   entityValue {string}  — valeur initiale (ex. "OpenAI")
 *   onClose     {fn}      — ferme le panneau
 */
export default function EntityArticlePanel({ entityType, entityValue, onClose }) {
  // ── Navigation ─────────────────────────────────────────────────────────────
  const [history, setHistory]   = useState([{ type: entityType, value: entityValue }])
  const current = history[history.length - 1]

  const [viewMode, setViewMode] = useState('articles')
  const [articles, setArticles] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [entityImage, setEntityImage] = useState(null)

  // ── Position / taille de la fenêtre ────────────────────────────────────────
  const [win, setWin] = useState(initialWin)
  const dragData = useRef(null)   // { type: 'move'|'resize', startX, startY, ...init }

  // Drag document-level (move + resize)
  useEffect(() => {
    const onMove = (e) => {
      const d = dragData.current
      if (!d) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (d.type === 'move') {
        setWin(prev => ({
          ...prev,
          x: Math.max(0, Math.min(window.innerWidth  - prev.w, d.initX + dx)),
          y: Math.max(0, Math.min(window.innerHeight - 48,     d.initY + dy)),
        }))
      } else {
        setWin(prev => ({
          ...prev,
          w: Math.max(480, d.initW + dx),
          h: Math.max(340, d.initH + dy),
        }))
      }
    }
    const onUp = () => { dragData.current = null }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [])

  const handleHeaderMouseDown = (e) => {
    if (e.target.closest('button')) return   // ne pas déclencher sur les boutons
    e.preventDefault()
    dragData.current = { type: 'move', startX: e.clientX, startY: e.clientY, initX: win.x, initY: win.y }
  }

  const handleResizeMouseDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragData.current = { type: 'resize', startX: e.clientX, startY: e.clientY, initW: win.w, initH: win.h }
  }

  // ── Données ────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true); setError(null)
    const params = new URLSearchParams({ type: current.type, value: current.value })
    fetch(`/api/entities/articles?${params}`)
      .then(r => r.json())
      .then(data => {
        if (data?.error) throw new Error(data.error)
        setArticles(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [current.type, current.value])

  useEffect(() => {
    setEntityImage(null)
    if (!IMAGE_TYPES.has(current.type)) return
    fetch('/api/entities/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ name: current.value, type: current.type }]),
    })
      .then(r => r.json())
      .then(data => setEntityImage(data[current.value] ?? null))
      .catch(() => setEntityImage(null))
  }, [current.type, current.value])

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  // ── Navigation interne ─────────────────────────────────────────────────────
  const navigateTo = useCallback((type, value) => {
    setHistory(prev => [...prev, { type, value }])
  }, [])

  const goBack = useCallback(() => {
    setHistory(prev => prev.length > 1 ? prev.slice(0, -1) : prev)
  }, [])

  // ── Exports ────────────────────────────────────────────────────────────────
  const handleGenerateReport = () => {
    const today = new Date().toISOString().slice(0, 10)
    const safe  = current.value.replace(/[^a-zA-Z0-9_\-]/g, '_')
    let md = `# Rapport — ${current.type} : ${current.value}\n\n*Généré le ${today} — ${articles.length} articles*\n\n---\n\n`
    for (const art of articles) {
      const header = [art['Date de publication'], art['Sources']].filter(Boolean).join(' — ')
      if (header) md += `### ${header}\n\n`
      if (art['Résumé']) md += `${art['Résumé']}\n\n`
      const imgUrl = (art['Images'] || [])[0]?.URL || (art['Images'] || [])[0]?.url || ''
      if (imgUrl) md += `![illustration](${imgUrl})\n\n`
      if (art['URL']) md += `[Lire l'article](${art['URL']})\n\n`
      md += `---\n\n`
    }
    const blob = new Blob([md], { type: 'text/markdown' })
    const url  = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: `rapport_${current.type}_${safe}_${today}.md` }).click()
    URL.revokeObjectURL(url)
  }

  const handleExportJSON = () => {
    const safe = current.value.replace(/[^a-zA-Z0-9_\-]/g, '_')
    const blob = new Blob([JSON.stringify(articles, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: `entites_${current.type}_${safe}_${new Date().toISOString().slice(0, 10)}.json` }).click()
    URL.revokeObjectURL(url)
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Fond semi-transparent (clic → ferme) */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
        onClick={onClose}
      />

      {/* Fenêtre flottante */}
      <div
        className="fixed z-[61] flex flex-col bg-slate-50 dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
        style={{ left: win.x, top: win.y, width: win.w, height: win.h, minWidth: 480, minHeight: 340 }}
      >
        {/* ── En-tête (drag zone) ── */}
        <div
          className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0 flex-wrap gap-y-2 cursor-move select-none"
          onMouseDown={handleHeaderMouseDown}
        >
          {/* Icône de déplacement */}
          <GripHorizontal size={14} className="text-slate-300 dark:text-slate-600 shrink-0 pointer-events-none" />

          {/* Bouton retour */}
          {history.length > 1 && (
            <button
              onClick={goBack}
              title={`Retour à ${history[history.length - 2].value}`}
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <ChevronLeft size={13} />
              {history[history.length - 2].value}
            </button>
          )}

          {/* Avatar */}
          {IMAGE_TYPES.has(current.type) && (
            <EntityAvatar image={entityImage} type={current.type} name={current.value} size={36} />
          )}

          {/* Titre */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1 pointer-events-none">
            <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">
              Occurrences de{' '}
              <span className="text-violet-600 dark:text-violet-400">{current.value}</span>
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0">
              {current.type}
            </span>
            {!loading && (
              <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                — {articles.length} article{articles.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap cursor-default">
            {/* Toggle Articles / Graphe */}
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                onClick={() => setViewMode('articles')}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'articles'
                    ? 'bg-violet-500 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Articles
              </button>
              <button
                onClick={() => setViewMode('graph')}
                title="Graphe de co-occurrences"
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors border-l border-slate-200 dark:border-slate-700 ${
                  viewMode === 'graph'
                    ? 'bg-violet-500 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Network size={12} />
                Graphe
              </button>
            </div>

            <button
              onClick={handleGenerateReport}
              disabled={loading || articles.length === 0}
              title="Générer un rapport Markdown"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FileText size={12} />
              Rapport
            </button>
            <button
              onClick={handleExportJSON}
              disabled={loading || articles.length === 0}
              title="Exporter les articles en JSON"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Download size={12} />
              JSON
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Corps (prend tout l'espace restant) ── */}
        {viewMode === 'graph' ? (
          /* Mode graphe : flex-col sans scroll pour que le SVG remplisse la hauteur */
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-4 pt-3 pb-2">
            <EntityGraph
              entityType={current.type}
              entityValue={current.value}
              onNavigate={navigateTo}
            />
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
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
                    {art['Date de publication'] && <span>{art['Date de publication']}</span>}
                    {art['Sources'] && (
                      <><span>·</span><span className="font-medium text-slate-700 dark:text-slate-300">{art['Sources']}</span></>
                    )}
                  </div>
                  {art['URL'] && (
                    <a
                      href={art['URL']} target="_blank" rel="noopener noreferrer"
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
        )}

        {/* ── Poignée de redimensionnement ── */}
        <ResizeHandle onMouseDown={handleResizeMouseDown} />
      </div>
    </>
  )
}
