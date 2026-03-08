/**
 * TopArticlesPanel — Affiche les N articles les mieux scorés (Feature 1)
 * Style : cartes article identiques à la vue JSON, grille 2 colonnes, modal large.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { X, Star, ExternalLink, RefreshCw, Clock, Tag, ChevronDown, ChevronUp, Maximize2, PlayCircle, Pause, Volume2 } from 'lucide-react'
import EntityHighlighter from './EntityHighlighter'
import EntityArticlePanel from './EntityArticlePanel'
import TTSButton, { stopAll } from './TTSButton'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(raw) {
  if (!raw) return ''
  try {
    return new Date(raw).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return raw }
}

function formatTime(raw) {
  if (!raw || (!/T\d{2}:\d{2}/.test(raw) && !/\d{2}:\d{2}:\d{2}/.test(raw))) return ''
  try {
    return new Date(raw).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function firstImage(images) {
  if (!Array.isArray(images)) return null
  return images.find(i => i?.url || i?.URL)?.url ?? images.find(i => i?.URL)?.URL ?? null
}

function entityCount(article) {
  if (!article.entities) return 0
  return Object.values(article.entities).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0)
}

// ── Badges ────────────────────────────────────────────────────────────────────

const SENTIMENT_CFG = {
  positif: { label: 'Positif', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800' },
  neutre:  { label: 'Neutre',  dot: 'bg-slate-400',   text: 'text-slate-600 dark:text-slate-400',     bg: 'bg-slate-100 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600' },
  négatif: { label: 'Négatif', dot: 'bg-rose-500',    text: 'text-rose-700 dark:text-rose-300',       bg: 'bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800' },
}
const TON_LABELS = { factuel: 'Factuel', alarmiste: 'Alarmiste', promotionnel: 'Promo', critique: 'Critique', analytique: 'Analytique' }

function SentimentBadge({ article }) {
  const sentiment = article.sentiment
  const scoreSent = article.score_sentiment
  const ton       = article.ton_editorial
  const scoreTon  = article.score_ton
  if (!sentiment) return null
  const cfg = SENTIMENT_CFG[sentiment] ?? SENTIMENT_CFG.neutre
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1">
      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
        {cfg.label}{scoreSent ? ` ${scoreSent}/5` : ''}
      </span>
      {ton && (
        <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-slate-100 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400">
          {TON_LABELS[ton] ?? ton}{scoreTon ? ` ${scoreTon}/5` : ''}
        </span>
      )}
    </div>
  )
}

function ReadingTimeBadge({ article }) {
  const label = article.temps_lecture_label
  if (!label) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-slate-100 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400">
      <Clock size={9} className="shrink-0" />
      {label}
    </span>
  )
}

// ── Barre de score ────────────────────────────────────────────────────────────

function ScoreBar({ score }) {
  const pct = Math.round(score)
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-slate-400'
  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
      <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">Score</span>
      <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums font-semibold text-slate-500 dark:text-slate-400 shrink-0 w-10 text-right">{score}</span>
    </div>
  )
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function ImageLightbox({ url, alt, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <img src={url} alt={alt} className="max-w-full max-h-[90vh] rounded-xl object-contain shadow-2xl" />
      <button onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 bg-slate-700/80 hover:bg-slate-600 rounded-full flex items-center justify-center text-slate-300 hover:text-white transition-colors">
        <X size={16} />
      </button>
    </div>
  )
}

// ── Hook lecture podcast ───────────────────────────────────────────────────────

function usePodcast(articles) {
  const [playing, setPlaying]       = useState(false)
  const [currentIdx, setCurrentIdx] = useState(-1)
  const playingRef = useRef(false)

  const speakAt = useCallback((idx) => {
    if (!playingRef.current || idx >= articles.length) {
      setPlaying(false)
      setCurrentIdx(-1)
      playingRef.current = false
      return
    }
    const art    = articles[idx]
    const titre  = art['Titre']?.trim() || ''
    const resume = art['Résumé'] || ''
    const source = art['Sources'] || ''
    let text = `Article ${idx + 1} sur ${articles.length}. `
    if (source) text += `${source}. `
    if (titre)  text += `${titre}. `
    if (resume) text += resume
    text = text.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim()

    const utt = new SpeechSynthesisUtterance(text)
    utt.lang    = 'fr-FR'
    utt.rate    = 0.92
    utt.onend   = () => speakAt(idx + 1)
    utt.onerror = () => { setPlaying(false); setCurrentIdx(-1); playingRef.current = false }
    setCurrentIdx(idx)
    window.speechSynthesis.speak(utt)
  }, [articles]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(() => {
    if (!window.speechSynthesis || articles.length === 0) return
    stopAll()
    playingRef.current = true
    setPlaying(true)
    speakAt(0)
  }, [speakAt, articles.length])

  const stop = useCallback(() => {
    playingRef.current = false
    window.speechSynthesis?.cancel()
    setPlaying(false)
    setCurrentIdx(-1)
  }, [])

  useEffect(() => () => { playingRef.current = false; window.speechSynthesis?.cancel() }, [])

  return { playing, currentIdx, start, stop }
}

// ── Bouton podcast — composant stable (hors du parent) ────────────────────────

function PodcastBtn({ playing, currentIdx, total, onStart, onStop, disabled, mobile }) {
  const hasTTS = typeof window !== 'undefined' && !!window.speechSynthesis
  if (!hasTTS) return null
  return (
    <button
      onClick={playing ? onStop : onStart}
      disabled={disabled}
      title={disabled ? 'Chargement…' : playing ? 'Arrêter le podcast' : 'Écouter tous les articles en séquence'}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        playing
          ? 'bg-violet-600 hover:bg-violet-700 text-white'
          : 'bg-violet-100 dark:bg-violet-900/40 hover:bg-violet-200 dark:hover:bg-violet-800/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800'
      } ${mobile ? 'flex-1 justify-center' : ''}`}
    >
      {playing
        ? <><Pause size={12} /> {currentIdx + 1}/{total}</>
        : <><PlayCircle size={12} /> Écouter</>
      }
    </button>
  )
}

// ── Carte article ─────────────────────────────────────────────────────────────

function ArticleCard({ article, rank, onEntityClick, isCurrentPodcast }) {
  const [expanded, setExpanded] = useState(rank <= 3)
  const [lightbox, setLightbox] = useState(false)

  const resume   = article['Résumé'] ?? ''
  const entities = article.entities ?? null
  const hasEntities = entities && Object.keys(entities).length > 0
  const count    = useMemo(() => entityCount(article), [article])
  const imgUrl   = firstImage(article['Images'])
  const date     = formatDate(article['Date de publication'])
  const time     = formatTime(article['Date de publication'])
  const url      = article['URL'] || article['url'] || '#'
  const titre    = article['Titre']?.trim() || ''

  return (
    <article className={`bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm border rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all flex flex-col ${
      isCurrentPodcast
        ? 'border-violet-400 dark:border-violet-500 ring-2 ring-violet-300 dark:ring-violet-700'
        : 'border-white/50 dark:border-slate-700/60'
    }`}>

      {imgUrl && (
        <button type="button" onClick={() => setLightbox(true)}
          className="group relative w-full h-36 overflow-hidden bg-slate-100 dark:bg-slate-900 block text-left shrink-0"
          title="Agrandir l'image">
          <img src={imgUrl} alt={titre || article['Sources'] || ''}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy" onError={e => { e.currentTarget.closest('button').style.display = 'none' }} />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <Maximize2 size={22} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
          </div>
        </button>
      )}
      {lightbox && imgUrl && (
        <ImageLightbox url={imgUrl} alt={titre || article['Sources'] || ''} onClose={() => setLightbox(false)} />
      )}

      <div className="p-5 flex flex-col flex-1">

        {/* Rang */}
        <div className="flex justify-center mb-3">
          <div className={`flex items-center justify-center rounded-full font-bold text-white shadow-md
            ${rank === 1 ? 'w-12 h-12 text-xl bg-amber-400 ring-4 ring-amber-200 dark:ring-amber-800' :
              rank === 2 ? 'w-10 h-10 text-lg bg-slate-400 ring-4 ring-slate-200 dark:ring-slate-700' :
              rank === 3 ? 'w-10 h-10 text-lg bg-orange-400 ring-4 ring-orange-200 dark:ring-orange-800' :
                           'w-8 h-8 text-sm bg-amber-500/70'}`}>
            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
          </div>
        </div>

        {/* En-tête : meta + lien */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {article['Sources'] ?? '—'}
              </span>
              {date && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {date}{time ? <> · <span>{time}</span></> : ''}
                </span>
              )}
              {hasEntities && (
                <span className="inline-flex items-center gap-1 text-[10px] text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded-full border border-violet-200 dark:border-violet-800">
                  <Tag size={9} />{count} entités
                </span>
              )}
              <ReadingTimeBadge article={article} />
            </div>
            <SentimentBadge article={article} />
            {titre && (
              <h3 className="mt-1.5 text-base font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-3">
                {titre}
              </h3>
            )}
          </div>
          {url && url !== '#' && (
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="shrink-0 p-1.5 text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors mt-0.5"
              title="Ouvrir l'article">
              <ExternalLink size={14} />
            </a>
          )}
        </div>

        {/* Résumé */}
        <div className={`text-sm leading-relaxed overflow-hidden transition-all ${expanded ? '' : 'max-h-24'}`}>
          {hasEntities
            ? <EntityHighlighter text={resume} entities={entities} onEntityClick={(type, value) => onEntityClick?.(type, value)} />
            : <p className="text-slate-700 dark:text-slate-300">{resume}</p>
          }
        </div>
        {resume.length > 280 && (
          <button onClick={() => setExpanded(v => !v)}
            className="mt-1.5 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors justify-end w-full">
            {expanded ? <><ChevronUp size={12} /> Réduire</> : <><ChevronDown size={12} /> Lire la suite</>}
          </button>
        )}

        {/* Barre d'actions : TTS + score */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center gap-2">
          {/* Bouton TTS individuel avec label */}
          <TTSButton text={resume || titre} size={13} className="shrink-0" />
          <span className="text-[10px] text-slate-400 dark:text-slate-500">Écouter</span>
          {/* Indicateur podcast */}
          {isCurrentPodcast && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-violet-600 dark:text-violet-400 font-medium">
              <Volume2 size={11} className="animate-pulse" />
              En cours…
            </span>
          )}
          {/* Score */}
          {!isCurrentPodcast && (
            <div className="ml-auto flex items-center gap-2 flex-1 min-w-0">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">Score</span>
              <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    (article.score_pertinence ?? 0) >= 70 ? 'bg-emerald-500' :
                    (article.score_pertinence ?? 0) >= 40 ? 'bg-amber-500' : 'bg-slate-400'
                  }`}
                  style={{ width: `${article.score_pertinence ?? 0}%` }}
                />
              </div>
              <span className="text-xs tabular-nums font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                {article.score_pertinence ?? 0}
              </span>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

// ── Panel principal ───────────────────────────────────────────────────────────

export default function TopArticlesPanel({ onClose }) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [hours, setHours]       = useState(48)
  const [topN, setTopN]         = useState(10)
  const [isMaximized, setIsMaximized] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState(null)

  const { playing, currentIdx, start: podcastStart, stop: podcastStop } = usePodcast(articles)

  const load = () => {
    podcastStop()
    setLoading(true)
    setError(null)
    fetch(`/api/articles/top?n=${topN}&hours=${hours}`)
      .then(r => r.json())
      .then(data => { setArticles(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { load() }, [hours, topN])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
    <div
      className={`fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm ${isMaximized ? 'items-stretch' : 'items-start justify-center p-4 overflow-y-auto'}`}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className={`flex flex-col glass-panel shadow-2xl border border-white/45 dark:border-white/[0.09] overflow-hidden w-full ${isMaximized ? '' : 'max-w-5xl rounded-2xl my-4 max-h-[calc(100dvh-4rem)]'}`}>

        {/* ── En-tête ── */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl shrink-0">
          <Star size={18} className="text-amber-500 shrink-0" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">Top articles</span>
          {!loading && articles.length > 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-500">— {articles.length} article{articles.length > 1 ? 's' : ''}</span>
          )}

          {/* Contrôles desktop */}
          <div className="hidden md:flex flex-wrap items-center gap-3 ml-auto">
            <PodcastBtn
              playing={playing}
              currentIdx={currentIdx}
              total={articles.length}
              onStart={podcastStart}
              onStop={podcastStop}
              disabled={loading || articles.length === 0}
            />
            <div className="flex items-center gap-2 text-sm">
              <label className="text-slate-500 dark:text-slate-400 text-xs">Fenêtre :</label>
              <select value={hours} onChange={e => setHours(Number(e.target.value))}
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs text-slate-700 dark:text-slate-200">
                <option value="6">6h</option>
                <option value="24">24h</option>
                <option value="48">48h</option>
                <option value="168">7j</option>
                <option value="0">Tout</option>
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label className="text-slate-500 dark:text-slate-400 text-xs">Top :</label>
              <select value={topN} onChange={e => setTopN(Number(e.target.value))}
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs text-slate-700 dark:text-slate-200">
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>
            <button onClick={load} title="Actualiser"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded-lg transition-colors">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Actualiser
            </button>
            <button onClick={() => setIsMaximized(m => !m)} title={isMaximized ? 'Réduire' : 'Plein écran'}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors">
              <Maximize2 size={14} />
            </button>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors">
              <X size={14} />
            </button>
          </div>

          {/* Mobile en-tête */}
          <div className="flex md:hidden items-center gap-2 ml-auto">
            <button onClick={() => setIsMaximized(m => !m)}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400">
              <Maximize2 size={14} />
            </button>
          </div>
        </div>

        {/* ── Corps ── */}
        <div className="flex-1 overflow-y-auto p-5 pb-28 md:pb-5">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-slate-400 dark:text-slate-500">
              <RefreshCw size={20} className="animate-spin" />
              <span className="text-sm">Chargement…</span>
            </div>
          ) : articles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500 gap-3">
              <Star size={36} className="opacity-30" />
              <p className="text-sm">Aucun article trouvé dans cette fenêtre</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {articles.map((article, i) => (
                <ArticleCard
                  key={article['URL'] ?? article['url'] ?? i}
                  article={article}
                  rank={i + 1}
                  isCurrentPodcast={playing && currentIdx === i}
                  onEntityClick={(type, value) => setSelectedEntity({ type, value })}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>

    {selectedEntity && (
      <EntityArticlePanel
        entityType={selectedEntity.type}
        entityValue={selectedEntity.value}
        onClose={() => setSelectedEntity(null)}
      />
    )}

    {/* ── Toolbar mobile ── */}
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-[60] bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-t border-slate-200/60 dark:border-slate-700/60 px-4 py-3 flex items-center gap-2"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <PodcastBtn
        playing={playing}
        currentIdx={currentIdx}
        total={articles.length}
        onStart={podcastStart}
        onStop={podcastStop}
        disabled={loading || articles.length === 0}
        mobile
      />
      <div className="flex items-center gap-1.5">
        <label className="text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">Fenêtre :</label>
        <select value={hours} onChange={e => setHours(Number(e.target.value))}
          className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs text-slate-700 dark:text-slate-200">
          <option value="6">6h</option>
          <option value="24">24h</option>
          <option value="48">48h</option>
          <option value="168">7j</option>
          <option value="0">Tout</option>
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <label className="text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">Top :</label>
        <select value={topN} onChange={e => setTopN(Number(e.target.value))}
          className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs text-slate-700 dark:text-slate-200">
          <option value="5">5</option>
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
        </select>
      </div>
      <button onClick={load}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded-lg transition-colors">
        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        Actualiser
      </button>
      <button onClick={onClose}
        className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
        <X size={16} />
      </button>
    </div>
  </>
  )
}
