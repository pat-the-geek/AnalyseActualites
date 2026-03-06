/**
 * TopArticlesPanel — Affiche les N articles les mieux scorés (Feature 1)
 */
import { useState, useEffect } from 'react'
import { X, Star, ExternalLink, RefreshCw } from 'lucide-react'

const SENTIMENT_CONFIG = {
  positif: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  négatif: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  neutre:  'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
}

const TON_CONFIG = {
  alarmiste:    'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  promotionnel: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  critique:     'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
}

function ScoreBar({ score }) {
  const pct = Math.round(score)
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-slate-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{score}</span>
    </div>
  )
}

export default function TopArticlesPanel({ onClose }) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hours, setHours]   = useState(48)
  const [topN, setTopN]     = useState(10)

  const load = () => {
    setLoading(true)
    setError(null)
    fetch(`/api/articles/top?n=${topN}&hours=${hours}`)
      .then(r => r.json())
      .then(data => { setArticles(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { load() }, [hours, topN])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-2xl shadow-2xl mt-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Star size={18} className="text-amber-500" />
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Top articles</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
            <X size={18} />
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
          <div className="flex items-center gap-2 text-sm">
            <label className="text-slate-500 dark:text-slate-400">Fenêtre :</label>
            <select value={hours} onChange={e => setHours(Number(e.target.value))}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm">
              <option value="6">6h</option>
              <option value="24">24h</option>
              <option value="48">48h</option>
              <option value="168">7j</option>
              <option value="0">Tout</option>
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-slate-500 dark:text-slate-400">Top :</label>
            <select value={topN} onChange={e => setTopN(Number(e.target.value))}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm">
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>
          <div className="flex-1" />
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-lg transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>}

          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-3" />Chargement…
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Star size={32} className="mx-auto mb-3 opacity-40" />
              <p>Aucun article trouvé dans cette fenêtre</p>
            </div>
          ) : (
            <ol className="space-y-4">
              {articles.map((article, i) => {
                const sentiment = article.sentiment
                const ton = article.ton_editorial
                const resume = (article['Résumé'] || '').slice(0, 200)
                const firstLine = resume.split('\n')[0]
                const url = article.URL || '#'
                const source = article.Sources || 'Inconnu'
                const date = (article['Date de publication'] || '').slice(0, 10)
                const image = article.Images?.[0]?.url || article.Images?.[0]?.URL

                return (
                  <li key={i} className="flex gap-4 p-4 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-amber-200 dark:hover:border-amber-800 transition-colors">
                    {/* Rang */}
                    <div className="shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-bold text-sm flex items-center justify-center">
                      {i + 1}
                    </div>
                    {/* Miniature */}
                    {image && (
                      <img src={image} alt="" className="shrink-0 w-14 h-14 object-cover rounded-lg hidden sm:block" />
                    )}
                    {/* Corps */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">
                          {firstLine || `${source} · ${date}`}
                        </p>
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 text-slate-400 hover:text-blue-500 transition-colors"
                          onClick={e => e.stopPropagation()}>
                          <ExternalLink size={13} />
                        </a>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="text-xs text-slate-500 dark:text-slate-400">{source}</span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs text-slate-400">{date}</span>
                        {sentiment && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${SENTIMENT_CONFIG[sentiment] || ''}`}>
                            {sentiment}
                          </span>
                        )}
                        {ton && TON_CONFIG[ton] && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TON_CONFIG[ton]}`}>
                            {ton}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5">
                        <ScoreBar score={article.score_pertinence ?? 0} />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
