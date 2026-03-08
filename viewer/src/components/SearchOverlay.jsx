import { useState, useEffect, useRef } from 'react'
import { Search, FileJson, FileText, X, ArrowRight, SlidersHorizontal, ChevronDown } from 'lucide-react'

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function HighlightMatch({ text, query }) {
  if (!query) return <>{text}</>
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-300/50 dark:bg-yellow-500/30 text-yellow-900 dark:text-yellow-200 rounded-sm">{part}</mark>
          : part
      )}
    </>
  )
}

export default function SearchOverlay({ onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [filterSentiment, setFilterSentiment] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  const hasFilters = filterSentiment || filterSource || filterFrom || filterTo

  useEffect(() => {
    inputRef.current?.focus()
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (query.length < 2) { setResults([]); return }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams({ q: query })
      if (filterSentiment) params.set('sentiment', filterSentiment)
      if (filterSource)    params.set('source', filterSource)
      if (filterFrom)      params.set('date_from', filterFrom)
      if (filterTo)        params.set('date_to', filterTo)
      fetch(`/api/search?${params}`)
        .then(r => r.json())
        .then(data => { setResults(data); setActiveIdx(0); setLoading(false) })
        .catch(() => setLoading(false))
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, filterSentiment, filterSource, filterFrom, filterTo])

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && results[activeIdx]) { onSelect(results[activeIdx]) }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-4 sm:pt-20 px-3 sm:px-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl glass-panel rounded-2xl shadow-2xl border border-white/45 dark:border-white/[0.09] overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Recherche dans tous les fichiers…"
            className="flex-1 bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none"
          />
          {loading && <span className="text-xs text-slate-400 dark:text-slate-500 animate-pulse shrink-0">Recherche…</span>}
          <button
            onClick={() => setShowFilters(f => !f)}
            title="Filtres avancés"
            className={`shrink-0 p-1 rounded transition-colors ${showFilters || hasFilters ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            <SlidersHorizontal size={14} />
          </button>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 shrink-0">
            <X size={14} />
          </button>
        </div>

        {/* Filtres avancés */}
        {showFilters && (
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 flex flex-wrap gap-3">
            {/* Sentiment */}
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Sentiment</label>
              <select
                value={filterSentiment}
                onChange={e => setFilterSentiment(e.target.value)}
                className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
              >
                <option value="">Tous</option>
                <option value="positif">Positif</option>
                <option value="neutre">Neutre</option>
                <option value="négatif">Négatif</option>
              </select>
            </div>

            {/* Source */}
            <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Source</label>
              <input
                type="text"
                value={filterSource}
                onChange={e => setFilterSource(e.target.value)}
                placeholder="ex: Le Monde"
                className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
              />
            </div>

            {/* Date début */}
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Du</label>
              <input
                type="date"
                value={filterFrom}
                onChange={e => setFilterFrom(e.target.value)}
                className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
              />
            </div>

            {/* Date fin */}
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Au</label>
              <input
                type="date"
                value={filterTo}
                onChange={e => setFilterTo(e.target.value)}
                className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
              />
            </div>

            {hasFilters && (
              <button
                onClick={() => { setFilterSentiment(''); setFilterSource(''); setFilterFrom(''); setFilterTo('') }}
                className="self-end text-xs text-red-500 hover:text-red-400 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Réinitialiser
              </button>
            )}
          </div>
        )}

        {/* Résultats */}
        <div className="max-h-[420px] overflow-y-auto">
          {query.length < 2 && (
            <div className="p-6 text-center text-slate-400 dark:text-slate-500 text-sm">
              Tapez au moins 2 caractères pour rechercher
            </div>
          )}
          {query.length >= 2 && !loading && results.length === 0 && (
            <div className="p-6 text-center text-slate-400 dark:text-slate-500 text-sm">
              Aucun résultat pour «&nbsp;{query}&nbsp;»
            </div>
          )}
          {results.map((file, idx) => (
            <button
              key={file.path}
              onClick={() => onSelect(file)}
              className={`w-full text-left px-4 py-3 border-b border-slate-200/50 dark:border-slate-700/50 last:border-0 transition-colors ${
                activeIdx === idx
                  ? 'bg-slate-100 dark:bg-slate-700'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {file.type === 'json'
                  ? <FileJson size={13} className="text-amber-500 dark:text-amber-400 shrink-0" />
                  : <FileText size={13} className="text-blue-500 dark:text-blue-400 shrink-0" />
                }
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{file.name}</span>
                {file.flux && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 rounded shrink-0">{file.flux}</span>
                )}
                <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1 shrink-0">
                  {file.matches.length} résultat{file.matches.length > 1 ? 's' : ''}
                  <ArrowRight size={9} />
                </span>
              </div>
              <div className="space-y-1">
                {file.matches.slice(0, 3).map((m, i) => (
                  <div
                    key={i}
                    className="text-[11px] text-slate-500 dark:text-slate-400 font-mono bg-slate-100/60 dark:bg-slate-950/60 rounded px-2 py-1 truncate"
                  >
                    <span className="text-slate-400 dark:text-slate-600 mr-2 select-none">L{m.line}</span>
                    <HighlightMatch text={m.text} query={query} />
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>

        {/* Pied — masqué sur mobile (peu de place) */}
        <div className="hidden sm:flex px-4 py-2 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 items-center gap-4 text-[10px] text-slate-400 dark:text-slate-600 select-none">
          <span>↑↓ Naviguer</span>
          <span>↵ Ouvrir</span>
          <span>Échap Fermer</span>
          {results.length > 0 && (
            <span className="ml-auto">{results.length} fichier{results.length > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    </div>
  )
}
