import { useMemo, useState, useRef } from 'react'
import {
  ExternalLink, ChevronDown, ChevronUp, Tag, X,
  Filter, Search, ArrowUpDown, Newspaper,
  Download, LayoutGrid, AlignLeft, Maximize2,
} from 'lucide-react'
import EntityHighlighter from './EntityHighlighter'
import EntityArticlePanel from './EntityArticlePanel'

// ── Palette de couleurs pour les chips de type d'entité ──────────────────────
const CHIP_COLORS = {
  PERSON:      { idle: 'bg-violet-100 dark:bg-violet-900/50 text-violet-800 dark:text-violet-200 border-violet-200 dark:border-violet-800',       on: 'bg-violet-500 dark:bg-violet-600 text-white border-violet-600 dark:border-violet-500' },
  ORG:         { idle: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800',                   on: 'bg-blue-500 dark:bg-blue-600 text-white border-blue-600 dark:border-blue-500' },
  GPE:         { idle: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800', on: 'bg-emerald-500 dark:bg-emerald-600 text-white border-emerald-600 dark:border-emerald-500' },
  PRODUCT:     { idle: 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200 border-orange-200 dark:border-orange-800',       on: 'bg-orange-500 dark:bg-orange-600 text-white border-orange-600 dark:border-orange-500' },
  EVENT:       { idle: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800',             on: 'bg-amber-500 dark:bg-amber-600 text-white border-amber-600 dark:border-amber-500' },
  LAW:         { idle: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800',                         on: 'bg-red-500 dark:bg-red-600 text-white border-red-600 dark:border-red-500' },
  LOC:         { idle: 'bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-200 border-teal-200 dark:border-teal-800',                   on: 'bg-teal-500 dark:bg-teal-600 text-white border-teal-600 dark:border-teal-500' },
  NORP:        { idle: 'bg-fuchsia-100 dark:bg-fuchsia-900/50 text-fuchsia-800 dark:text-fuchsia-200 border-fuchsia-200 dark:border-fuchsia-800', on: 'bg-fuchsia-500 dark:bg-fuchsia-600 text-white border-fuchsia-600 dark:border-fuchsia-500' },
  FAC:         { idle: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-800 dark:text-cyan-200 border-cyan-200 dark:border-cyan-800',                   on: 'bg-cyan-500 dark:bg-cyan-600 text-white border-cyan-600 dark:border-cyan-500' },
  WORK_OF_ART: { idle: 'bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800',                   on: 'bg-rose-500 dark:bg-rose-600 text-white border-rose-600 dark:border-rose-500' },
  MONEY:       { idle: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-800',       on: 'bg-yellow-500 dark:bg-yellow-600 text-white border-yellow-600 dark:border-yellow-500' },
  PERCENT:     { idle: 'bg-lime-100 dark:bg-lime-900/50 text-lime-800 dark:text-lime-200 border-lime-200 dark:border-lime-800',                   on: 'bg-lime-500 dark:bg-lime-600 text-white border-lime-600 dark:border-lime-500' },
  LANGUAGE:    { idle: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800',       on: 'bg-indigo-500 dark:bg-indigo-600 text-white border-indigo-600 dark:border-indigo-500' },
  DATE:        { idle: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600',               on: 'bg-slate-500 dark:bg-slate-600 text-white border-slate-600 dark:border-slate-500' },
  TIME:        { idle: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600',               on: 'bg-slate-500 dark:bg-slate-600 text-white border-slate-600 dark:border-slate-500' },
  QUANTITY:    { idle: 'bg-stone-100 dark:bg-stone-700/60 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-600',             on: 'bg-stone-500 dark:bg-stone-600 text-white border-stone-600 dark:border-stone-500' },
  CARDINAL:    { idle: 'bg-zinc-100 dark:bg-zinc-700/60 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-600',                   on: 'bg-zinc-500 dark:bg-zinc-600 text-white border-zinc-600 dark:border-zinc-500' },
  ORDINAL:     { idle: 'bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600',                   on: 'bg-gray-500 dark:bg-gray-600 text-white border-gray-600 dark:border-gray-500' },
}
const FALLBACK_CHIP = {
  idle: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
  on:   'bg-slate-500 dark:bg-slate-600 text-white border-slate-600 dark:border-slate-500',
}

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Date ↓ (récent)' },
  { value: 'date-asc',  label: 'Date ↑ (ancien)' },
  { value: 'entities',  label: 'Entités ↓' },
  { value: 'source',    label: 'Source A→Z' },
]

const BUCKET_ORDER = [
  "Aujourd'hui", "Hier", "Cette semaine", "Ce mois",
  "Il y a 1 à 3 mois", "Plus ancien", "Date inconnue",
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(raw) {
  if (!raw) return ''
  try {
    return new Date(raw).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return raw }
}

function firstImage(images) {
  if (!Array.isArray(images)) return null
  return images.find(i => i?.url)?.url ?? null
}

function entityCount(article) {
  if (!article.entities) return 0
  return Object.values(article.entities).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0)
}

function toTimestamp(raw) {
  if (!raw) return 0
  const d = new Date(raw)
  return isNaN(d) ? 0 : d.getTime()
}

function getDateBucket(raw) {
  if (!raw) return 'Date inconnue'
  const d = new Date(raw)
  if (isNaN(d)) return 'Date inconnue'
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const target = new Date(d); target.setHours(0, 0, 0, 0)
  const diff = Math.round((now - target) / 86400000)
  if (diff < 0)  return "Aujourd'hui"
  if (diff === 0) return "Aujourd'hui"
  if (diff === 1) return 'Hier'
  if (diff < 7)  return 'Cette semaine'
  if (diff < 30) return 'Ce mois'
  if (diff < 90) return 'Il y a 1 à 3 mois'
  return 'Plus ancien'
}

// ── Sous-composants ───────────────────────────────────────────────────────────

/** Surligne les occurrences de `query` dans `text` (plain text, sans NER). */
function SearchHighlighter({ text, query }) {
  if (!query || !text) {
    return <p className="leading-7 text-slate-700 dark:text-slate-300">{text}</p>
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return (
    <p className="leading-7 text-slate-700 dark:text-slate-300">
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/60 text-yellow-900 dark:text-yellow-100 rounded px-0.5">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </p>
  )
}

/** Lightbox plein écran pour une image unique. */
function ImageLightbox({ url, alt, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <img
        src={url}
        alt={alt}
        className="max-w-full max-h-[90vh] rounded-xl object-contain shadow-2xl"
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 bg-slate-700/80 hover:bg-slate-600 rounded-full flex items-center justify-center text-slate-300 hover:text-white transition-colors"
        title="Fermer"
      >
        <X size={16} />
      </button>
    </div>
  )
}

/** Carte article complète (vue grille). */
function ArticleCard({ article, index, highlight, onEntityClick }) {
  const [expanded, setExpanded] = useState(index < 3)
  const [lightbox, setLightbox] = useState(false)
  const titre = article['Titre']?.trim() || ''
  const resume = article['Résumé'] ?? ''
  const entities = article.entities ?? null
  const hasEntities = entities && Object.keys(entities).length > 0
  const imgUrl = firstImage(article['Images'])
  const date = formatDate(article['Date de publication'])
  const count = useMemo(() => entityCount(article), [article])

  return (
    <article className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {imgUrl && (
        <button
          type="button"
          onClick={() => setLightbox(true)}
          className="group relative w-full h-40 overflow-hidden bg-slate-100 dark:bg-slate-900 block text-left"
          title="Agrandir l'image"
        >
          <img src={imgUrl} alt={(titre || article['Sources']) ?? ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy" onError={e => { e.currentTarget.closest('button').style.display = 'none' }} />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <Maximize2 size={22} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
          </div>
        </button>
      )}
      {lightbox && imgUrl && (
        <ImageLightbox url={imgUrl} alt={(titre || article['Sources']) ?? ''} onClose={() => setLightbox(false)} />
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {article['Sources'] ?? '—'}
              </span>
              {date && <span className="text-xs text-slate-400 dark:text-slate-500">{date}</span>}
              {hasEntities && (
                <span className="inline-flex items-center gap-1 text-[10px] text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded-full border border-violet-200 dark:border-violet-800">
                  <Tag size={9} />{count} entités
                </span>
              )}
            </div>
            {titre && (
              <h3 className="mt-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">
                {titre}
              </h3>
            )}
          </div>
          {article['URL'] && (
            <a href={article['URL']} target="_blank" rel="noopener noreferrer"
              className="shrink-0 text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors mt-0.5" title="Ouvrir l'article">
              <ExternalLink size={14} />
            </a>
          )}
        </div>
        <div className={`text-sm overflow-hidden transition-all ${expanded ? '' : 'max-h-24'}`}>
          {hasEntities
            ? <EntityHighlighter text={resume} entities={entities} onEntityClick={onEntityClick} />
            : <SearchHighlighter text={resume} query={highlight} />
          }
        </div>
        {resume.length > 300 && (
          <button onClick={() => setExpanded(v => !v)}
            className="mt-2 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            {expanded ? <><ChevronUp size={12} /> Réduire</> : <><ChevronDown size={12} /> Lire la suite</>}
          </button>
        )}
      </div>
    </article>
  )
}

/** Ligne compacte pour la vue timeline. */
function TimelineItem({ article }) {
  const titre = article['Titre']?.trim() || ''
  const resume = article['Résumé'] ?? ''
  const entities = article.entities ?? null
  const hasEntities = entities && Object.keys(entities).length > 0
  const count = useMemo(() => entityCount(article), [article])
  const date = formatDate(article['Date de publication'])

  return (
    <div className="flex gap-3 group pb-4 last:pb-0">
      {/* Point + ligne verticale */}
      <div className="flex flex-col items-center shrink-0 w-4">
        <div className={`w-2.5 h-2.5 rounded-full mt-1 ring-2 ring-white dark:ring-slate-950 shrink-0 ${
          hasEntities ? 'bg-violet-400 dark:bg-violet-500' : 'bg-slate-300 dark:bg-slate-600'
        }`} />
        <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700/60 mt-1 group-last:hidden" />
      </div>

      {/* Contenu */}
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
            {article['Sources'] ?? '—'}
          </span>
          {date && <span className="text-xs text-slate-400 dark:text-slate-500">{date}</span>}
          {hasEntities && (
            <span className="inline-flex items-center gap-1 text-[10px] text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded-full border border-violet-200 dark:border-violet-800">
              <Tag size={9} />{count}
            </span>
          )}
          {article['URL'] && (
            <a href={article['URL']} target="_blank" rel="noopener noreferrer"
              className="ml-auto shrink-0 text-slate-300 dark:text-slate-600 hover:text-blue-500 dark:hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all"
              title="Ouvrir l'article">
              <ExternalLink size={12} />
            </a>
          )}
        </div>
        {titre && (
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-snug line-clamp-1 mb-0.5">
            {titre}
          </p>
        )}
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
          {resume.slice(0, 220)}{resume.length > 220 ? '…' : ''}
        </p>
      </div>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function ArticleListViewer({ content }) {
  const [searchQuery, setSearchQuery]         = useState('')
  const [sortBy, setSortBy]                   = useState('date-desc')
  const [viewStyle, setViewStyle]             = useState('grid') // 'grid' | 'timeline'
  const [selectedTypes, setSelectedTypes]     = useState(new Set())
  const [selectedSources, setSelectedSources] = useState(new Set())
  const [selectedEntity, setSelectedEntity]   = useState(null) // { type, value }
  const searchRef = useRef(null)

  // Parse JSON
  const articles = useMemo(() => {
    try {
      const data = JSON.parse(content)
      if (!Array.isArray(data)) return null
      if (!data.length || !('Résumé' in data[0])) return null
      return data
    } catch { return null }
  }, [content])

  // Types d'entités disponibles (comptage global)
  const availableTypes = useMemo(() => {
    if (!articles) return []
    const counts = {}
    for (const a of articles) {
      if (!a.entities) continue
      for (const [type, values] of Object.entries(a.entities)) {
        if (Array.isArray(values)) counts[type] = (counts[type] ?? 0) + values.length
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [articles])

  // Sources disponibles (comptage global)
  const availableSources = useMemo(() => {
    if (!articles) return []
    const counts = {}
    for (const a of articles) {
      const src = a['Sources'] ?? '—'
      counts[src] = (counts[src] ?? 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [articles])

  // Pipeline : search → entity filter → source filter → sort
  const displayedArticles = useMemo(() => {
    if (!articles) return []
    const q = searchQuery.trim().toLowerCase()
    let result = articles

    if (q) result = result.filter(a =>
      (a['Résumé'] ?? '').toLowerCase().includes(q) ||
      (a['Titre'] ?? '').toLowerCase().includes(q)
    )

    if (selectedTypes.size > 0) {
      result = result.filter(a => {
        if (!a.entities) return false
        return [...selectedTypes].some(t => (a.entities[t]?.length ?? 0) > 0)
      })
    }

    if (selectedSources.size > 0) {
      result = result.filter(a => selectedSources.has(a['Sources'] ?? '—'))
    }

    result = [...result].sort((a, b) => {
      if (sortBy === 'date-desc') return toTimestamp(b['Date de publication']) - toTimestamp(a['Date de publication'])
      if (sortBy === 'date-asc')  return toTimestamp(a['Date de publication']) - toTimestamp(b['Date de publication'])
      if (sortBy === 'entities')  return entityCount(b) - entityCount(a)
      if (sortBy === 'source')    return (a['Sources'] ?? '').localeCompare(b['Sources'] ?? '', 'fr')
      return 0
    })

    return result
  }, [articles, searchQuery, selectedTypes, selectedSources, sortBy])

  // Groupes timeline (toujours triés date-desc)
  const timelineGroups = useMemo(() => {
    if (viewStyle !== 'timeline') return null
    const sorted = [...displayedArticles].sort(
      (a, b) => toTimestamp(b['Date de publication']) - toTimestamp(a['Date de publication'])
    )
    const groups = {}
    for (const article of sorted) {
      const bucket = getDateBucket(article['Date de publication'])
      if (!groups[bucket]) groups[bucket] = []
      groups[bucket].push(article)
    }
    return groups
  }, [displayedArticles, viewStyle])

  const toggleType   = type => setSelectedTypes(prev => { const s = new Set(prev); s.has(type) ? s.delete(type) : s.add(type); return s })
  const toggleSource = src  => setSelectedSources(prev => { const s = new Set(prev); s.has(src)  ? s.delete(src)  : s.add(src);  return s })

  const hasActiveFilters = searchQuery.trim() || selectedTypes.size > 0 || selectedSources.size > 0

  const clearAll = () => {
    setSearchQuery('')
    setSelectedTypes(new Set())
    setSelectedSources(new Set())
    searchRef.current?.focus()
  }

  const handleExport = () => {
    const filename = `articles_${new Date().toISOString().slice(0, 10)}_${displayedArticles.length}.json`
    const blob = new Blob([JSON.stringify(displayedArticles, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  if (!articles) return null

  const withEntities = articles.filter(a => a.entities && Object.keys(a.entities).length > 0)

  return (
    <div>
      {/* ── Barre de stats ── */}
      <div className="flex items-center gap-3 mb-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {articles.length} article{articles.length > 1 ? 's' : ''}
        </span>
        {hasActiveFilters && (
          <span className="text-slate-500 dark:text-slate-400">
            — <span className="font-medium text-slate-700 dark:text-slate-200">{displayedArticles.length}</span> résultat{displayedArticles.length > 1 ? 's' : ''}
          </span>
        )}
        {withEntities.length > 0 ? (
          <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400">
            <Tag size={11} />{withEntities.length} enrichi{withEntities.length > 1 ? 's' : ''} avec entités
          </span>
        ) : (
          <span className="italic text-slate-400 dark:text-slate-500">
            Aucune entité — lancez <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">enrich_entities.py</code> pour enrichir
          </span>
        )}
        {hasActiveFilters && (
          <button onClick={clearAll}
            className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors">
            <X size={10} /> Tout réinitialiser
          </button>
        )}
      </div>

      {/* ── Toolbar : recherche + tri + vue + export ── */}
      <div className="flex items-center gap-2 mb-4">
        {/* Recherche */}
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher dans les résumés…"
            className="w-full pl-8 pr-8 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Tri */}
        <div className="relative shrink-0">
          <ArrowUpDown size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="pl-7 pr-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors appearance-none cursor-pointer">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Bascule vue grille / timeline */}
        <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
          <button onClick={() => setViewStyle('grid')} title="Vue grille"
            className={`px-2.5 py-2 transition-colors ${viewStyle === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
            <LayoutGrid size={13} />
          </button>
          <button onClick={() => setViewStyle('timeline')} title="Vue timeline"
            className={`px-2.5 py-2 transition-colors ${viewStyle === 'timeline' ? 'bg-blue-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
            <AlignLeft size={13} />
          </button>
        </div>

        {/* Export */}
        <button onClick={handleExport} title={`Exporter ${displayedArticles.length} article(s) en JSON`}
          className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-400 dark:hover:border-blue-500 bg-white dark:bg-slate-800 transition-all shrink-0">
          <Download size={13} />
        </button>
      </div>

      {/* ── Panel filtre : types d'entités ── */}
      {availableTypes.length > 0 && (
        <div className="mb-3 p-3 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl">
          <div className="flex items-center gap-2 mb-2.5">
            <Filter size={12} className="text-slate-400 dark:text-slate-500" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Type d'entité</span>
            {selectedTypes.size > 0 && (
              <button onClick={() => setSelectedTypes(new Set())}
                className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X size={10} /> Effacer
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableTypes.map(([type, count]) => {
              const colors = CHIP_COLORS[type] ?? FALLBACK_CHIP
              const active = selectedTypes.has(type)
              return (
                <button key={type} onClick={() => toggleType(type)}
                  title={`Filtrer les articles avec des entités de type ${type}`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all hover:scale-105 active:scale-95 ${active ? colors.on : colors.idle}`}>
                  {type}
                  <span className={`tabular-nums text-[10px] ${active ? 'opacity-80' : 'opacity-55'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Panel filtre : sources ── */}
      {availableSources.length > 1 && (
        <div className="mb-5 p-3 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl">
          <div className="flex items-center gap-2 mb-2.5">
            <Newspaper size={12} className="text-slate-400 dark:text-slate-500" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Source</span>
            {selectedSources.size > 0 && (
              <button onClick={() => setSelectedSources(new Set())}
                className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X size={10} /> Effacer
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableSources.map(([src, count]) => {
              const active = selectedSources.has(src)
              return (
                <button key={src} onClick={() => toggleSource(src)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all hover:scale-105 active:scale-95 ${
                    active
                      ? 'bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-800 border-slate-700 dark:border-slate-200'
                      : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-400'
                  }`}>
                  {src}
                  <span className={`tabular-nums text-[10px] ${active ? 'opacity-75' : 'opacity-55'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Contenu : grille ou timeline ── */}
      {displayedArticles.length === 0 ? (
        <div className="text-center py-14 text-slate-400 dark:text-slate-500 text-sm">
          <div className="text-2xl mb-2">🔍</div>
          Aucun article ne correspond aux filtres actifs.
          <br />
          <button onClick={clearAll} className="mt-2 text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 underline text-xs">
            Tout réinitialiser
          </button>
        </div>
      ) : viewStyle === 'timeline' && timelineGroups ? (
        /* Vue timeline */
        <div>
          {BUCKET_ORDER.filter(b => timelineGroups[b]?.length > 0).map(bucket => (
            <div key={bucket} className="mb-7">
              {/* En-tête de groupe */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                  {bucket}
                </span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                  {timelineGroups[bucket].length}
                </span>
              </div>
              {/* Items */}
              <div className="ml-1">
                {timelineGroups[bucket].map((article, i) => (
                  <TimelineItem key={article['URL'] ?? i} article={article} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Vue grille */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayedArticles.map((article, i) => (
            <ArticleCard key={article['URL'] ?? i} article={article} index={i} highlight={searchQuery.trim()}
              onEntityClick={(type, value) => setSelectedEntity({ type, value })} />
          ))}
        </div>
      )}

      {selectedEntity && (
        <EntityArticlePanel
          entityType={selectedEntity.type}
          entityValue={selectedEntity.value}
          onClose={() => setSelectedEntity(null)}
        />
      )}
    </div>
  )
}
