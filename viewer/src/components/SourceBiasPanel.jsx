/**
 * SourceBiasPanel — Tableau de biais éditoriaux par source (Feature 3)
 */
import { useState, useEffect } from 'react'
import { X, RefreshCw, Eye, AlertTriangle } from 'lucide-react'

const SENTIMENT_COLORS = {
  positif: 'bg-green-500',
  neutre:  'bg-slate-400',
  négatif: 'bg-red-500',
}

const TON_BADGE = {
  factuel:     'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  alarmiste:   'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  promotionnel:'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  critique:    'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
  analytique:  'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400',
}

function SentimentBar({ counts }) {
  const total = (counts?.positif || 0) + (counts?.neutre || 0) + (counts?.négatif || 0)
  if (!total) return <span className="text-xs text-slate-400">—</span>
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-2 w-24 rounded-full overflow-hidden">
        {['positif', 'neutre', 'négatif'].map(s => {
          const pct = ((counts[s] || 0) / total) * 100
          return pct > 0 ? (
            <div key={s} className={`${SENTIMENT_COLORS[s]} h-full`}
              style={{ width: `${pct}%` }}
              title={`${s}: ${counts[s]} (${Math.round(pct)}%)`} />
          ) : null
        })}
      </div>
      <span className="text-xs text-slate-400 tabular-nums">{total}</span>
    </div>
  )
}

function TonBadge({ distribution }) {
  if (!distribution || Object.keys(distribution).length === 0) return null
  // Prendre le ton dominant
  const dominant = Object.entries(distribution).sort((a, b) => b[1] - a[1])[0]
  if (!dominant) return null
  const [ton, count] = dominant
  const cls = TON_BADGE[ton] || 'bg-slate-100 text-slate-600'
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`} title={`${ton}: ${count}`}>
      {ton}
    </span>
  )
}

export default function SourceBiasPanel({ onClose }) {
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('article_count')
  const [minArticles, setMinArticles] = useState(1)

  useEffect(() => {
    setLoading(true)
    fetch('/api/sources/bias')
      .then(r => r.json())
      .then(data => { setSources(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const enriched = sources.filter(s => s.avg_score_sentiment !== null)

  const filtered = sources
    .filter(s => s.article_count >= minArticles)
    .filter(s => !search || s.source.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'article_count') return b.article_count - a.article_count
      if (sortBy === 'avg_score_ton') return (b.avg_score_ton || 0) - (a.avg_score_ton || 0)
      if (sortBy === 'avg_score_ton_asc') return (a.avg_score_ton || 0) - (b.avg_score_ton || 0)
      if (sortBy === 'négatif') {
        const na = (a.sentiment_counts?.négatif || 0) / Math.max(a.article_count, 1)
        const nb = (b.sentiment_counts?.négatif || 0) / Math.max(b.article_count, 1)
        return nb - na
      }
      return 0
    })

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-800 rounded-2xl shadow-2xl mt-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Eye size={18} className="text-purple-500" />
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Biais éditoriaux par source</h2>
            <span className="text-xs text-slate-400">{enriched.length} sources enrichies / {sources.length} total</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
            <X size={18} />
          </button>
        </div>

        {/* Notice si peu d'articles enrichis */}
        {!loading && enriched.length === 0 && (
          <div className="mx-6 mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle size={14} />
            Aucun article enrichi avec sentiment. Lancez d'abord <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">scripts/enrich_sentiment.py</code>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filtrer par source…"
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm w-48"
          />
          <div className="flex items-center gap-2 text-sm">
            <label className="text-slate-500 dark:text-slate-400">Min. articles :</label>
            <select value={minArticles} onChange={e => setMinArticles(Number(e.target.value))}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm">
              <option value="1">≥ 1</option>
              <option value="5">≥ 5</option>
              <option value="10">≥ 10</option>
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-slate-500 dark:text-slate-400">Tri :</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm">
              <option value="article_count">Volume d'articles</option>
              <option value="avg_score_ton">Ton le + factuel</option>
              <option value="avg_score_ton_asc">Ton le + biaisé</option>
              <option value="négatif">Taux négatif ↓</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-3" />Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400">Aucune source</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <th className="px-6 py-3 text-left font-medium">Source</th>
                  <th className="px-4 py-3 text-right font-medium">Articles</th>
                  <th className="px-4 py-3 text-left font-medium">Sentiment</th>
                  <th className="px-4 py-3 text-left font-medium">Ton dominant</th>
                  <th className="px-4 py-3 text-right font-medium">Score ton</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
                      {s.source}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">{s.article_count}</td>
                    <td className="px-4 py-3"><SentimentBar counts={s.sentiment_counts} /></td>
                    <td className="px-4 py-3"><TonBadge distribution={s.ton_distribution} /></td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {s.avg_score_ton !== null ? (
                        <span className={`font-medium ${s.avg_score_ton >= 4 ? 'text-green-600 dark:text-green-400' : s.avg_score_ton <= 2 ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>
                          {s.avg_score_ton}/5
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-700">
          Score ton : 5 = très factuel · 1 = très biaisé/sensationnaliste
        </div>
      </div>
    </div>
  )
}
