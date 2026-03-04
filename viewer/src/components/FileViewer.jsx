import { useMemo, useState, useEffect, useRef } from 'react'
import { Download, FileText, Calendar, HardDrive, ChevronRight, Images, ArrowUp, Tag, Braces, LayoutList, Trash2, AlertTriangle } from 'lucide-react'
import JsonViewer from './JsonViewer'
import MarkdownViewer from './MarkdownViewer'
import EntityPanel from './EntityPanel'
import ArticleListViewer from './ArticleListViewer'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

function formatDate(timestamp) {
  return new Date(timestamp * 1000).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Extrait toutes les images des articles JSON (champ Images[].URL). */
function extractImages(jsonContent) {
  try {
    const data = JSON.parse(jsonContent)
    const articles = Array.isArray(data) ? data : [data]
    const images = []
    articles.forEach(article => {
      if (!Array.isArray(article?.Images)) return
      article.Images.forEach(img => {
        if (img?.url) {
          images.push({
            url: img.url,
            width: img.width ?? null,
            source: article['Sources'] ?? '',
            date: article['Date de publication'] ?? '',
            articleUrl: article['URL'] ?? '',
          })
        }
      })
    })
    return images
  } catch {
    return []
  }
}

function ImageGallery({ content }) {
  const images = useMemo(() => extractImages(content), [content])
  const [failedUrls, setFailedUrls] = useState(new Set())
  const [lightbox, setLightbox] = useState(null) // index de l'image agrandie

  const visible = images.filter(img => !failedUrls.has(img.url))
  if (!visible.length) return null

  const handleError = (url) =>
    setFailedUrls(prev => new Set([...prev, url]))

  return (
    <div className="mt-6">
      {/* En-tête section */}
      <div className="flex items-center gap-2 mb-3">
        <Images size={14} className="text-slate-500 dark:text-slate-400" />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Images
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-600 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">
          {visible.length}
        </span>
      </div>

      {/* Grille */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {visible.map((img, i) => (
          <button
            key={i}
            onClick={() => setLightbox(i)}
            className="group text-left rounded-xl overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500/60 transition-all hover:shadow-lg hover:shadow-blue-500/10 dark:hover:shadow-blue-900/20 focus:outline-none focus:border-blue-500"
          >
            {/* Vignette */}
            <div className="aspect-video overflow-hidden bg-slate-100 dark:bg-slate-900 relative">
              <img
                src={img.url}
                alt={img.source}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
                onError={() => handleError(img.url)}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
            </div>
            {/* Méta */}
            {(img.source || img.date) && (
              <div className="px-2.5 py-2">
                {img.source && (
                  <div className="text-[11px] text-slate-700 dark:text-slate-300 truncate font-medium">{img.source}</div>
                )}
                {img.date && (
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{img.date}</div>
                )}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <Lightbox
          images={visible}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onNav={(idx) => setLightbox(idx)}
        />
      )}
    </div>
  )
}

function Lightbox({ images, index, onClose, onNav }) {
  const img = images[index]

  // Navigation clavier
  useMemo(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onNav(Math.min(index + 1, images.length - 1))
      if (e.key === 'ArrowLeft') onNav(Math.max(index - 1, 0))
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [index, images.length, onClose, onNav])

  return (
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center gap-3">
        {/* Image */}
        <img
          src={img.url}
          alt={img.source}
          className="max-w-full max-h-[80vh] rounded-xl object-contain shadow-2xl"
        />

        {/* Méta + actions */}
        <div className="flex items-center gap-4 text-sm text-slate-300">
          {img.source && <span className="font-medium">{img.source}</span>}
          {img.date && <span className="text-slate-500">{img.date}</span>}
          {img.width && <span className="text-slate-600 text-xs">{img.width}px</span>}
          <a
            href={img.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-xs text-blue-400 hover:text-blue-300 underline"
            onClick={e => e.stopPropagation()}
          >
            Ouvrir l'original ↗
          </a>
        </div>

        {/* Compteur */}
        <div className="text-xs text-slate-600 select-none">
          {index + 1} / {images.length}
        </div>

        {/* Bouton fermer */}
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded-full flex items-center justify-center text-slate-300 transition-colors"
        >
          ✕
        </button>

        {/* Flèches de navigation */}
        {index > 0 && (
          <button
            onClick={() => onNav(index - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors"
          >
            ‹
          </button>
        )}
        {index < images.length - 1 && (
          <button
            onClick={() => onNav(index + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors"
          >
            ›
          </button>
        )}
      </div>
    </div>
  )
}

export default function FileViewer({ file, content, loading, onDownload, onContentSaved, onEntitySearch, onDelete }) {
  const scrollRef = useRef(null)
  const entitiesRef = useRef(null)
  const imagesRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewMode, setViewMode] = useState('articles') // 'json' | 'articles'
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError]     = useState(null)

  // Écoute le scroll du conteneur principal (re-attaché à chaque changement de fichier)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [file])

  // Remet le scroll à 0 et la vue JSON lors d'un changement de fichier
  useEffect(() => { setScrollTop(0); setViewMode('articles') }, [file])

  // Détecte si le JSON contient des images
  const hasImages = useMemo(() => {
    if (!content || file?.type !== 'json') return false
    return extractImages(content).length > 0
  }, [content, file])

  // Détecte si le JSON contient des entités nommées
  const hasEntities = useMemo(() => {
    if (!content || file?.type !== 'json') return false
    try {
      const data = JSON.parse(content)
      const articles = Array.isArray(data) ? data : [data]
      return articles.some(a => a?.entities && Object.keys(a.entities).length > 0)
    } catch { return false }
  }, [content, file])

  // Détecte si le JSON est un tableau d'articles (champ "Résumé" présent)
  const isArticleArray = useMemo(() => {
    if (!content || file?.type !== 'json') return false
    try {
      const data = JSON.parse(content)
      return Array.isArray(data) && data.length > 0 && 'Résumé' in data[0]
    } catch { return false }
  }, [content, file])

  const scrollToTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  const scrollToEntities = () => entitiesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const scrollToImages = () => imagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const handleDelete = async () => {
    setDeleteError(null)
    try {
      await onDelete(file)
      setDeleteConfirm(false)
    } catch (e) {
      setDeleteError(e.message)
    }
  }

  if (!file) {
    return (
      <main className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-900 select-none">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center mx-auto mb-4 border border-slate-200 dark:border-slate-700">
            <FileText size={28} className="text-slate-400 dark:text-slate-600" />
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium mb-1">Aucun fichier sélectionné</p>
          <p className="text-slate-400 dark:text-slate-600 text-sm">Choisissez un fichier dans la liste de gauche</p>
        </div>
      </main>
    )
  }

  const pathParts = file.path.split('/')

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900 relative">
      {/* ── Barre de fichier ── */}
      <div
        className="flex items-center gap-3 px-5 py-2.5 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 md:border-t-0 md:border-b shrink-0 fixed left-0 right-0 z-40 md:static md:z-auto"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
      >
        {/* Fil d'Ariane */}
        <div className="hidden md:flex items-center gap-0.5 min-w-0 flex-1 text-xs text-slate-400 dark:text-slate-500 overflow-hidden">
          {pathParts.map((part, i) => (
            <span key={i} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && <ChevronRight size={10} className="text-slate-300 dark:text-slate-700" />}
              <span className={i === pathParts.length - 1 ? 'text-slate-700 dark:text-slate-300 font-medium' : ''}>
                {part}
              </span>
            </span>
          ))}
        </div>

        {/* Méta */}
        <div className="hidden lg:flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500 shrink-0">
          <span className="flex items-center gap-1">
            <Calendar size={11} />
            {formatDate(file.modified)}
          </span>
          <span className="flex items-center gap-1">
            <HardDrive size={11} />
            {formatSize(file.size)}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            file.type === 'json'
              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
              : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
          }`}>
            {file.type === 'json' ? 'JSON' : 'Markdown'}
          </span>
        </div>

        {/* Toggle JSON / Articles (uniquement pour les tableaux d'articles) */}
        {isArticleArray && (
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden shrink-0">
            <button
              onClick={() => setViewMode('articles')}
              title="Vue articles annotés"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${
                viewMode === 'articles'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <LayoutList size={12} /> Articles
            </button>
            <button
              onClick={() => setViewMode('json')}
              title="Vue JSON brut"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${
                viewMode === 'json'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Braces size={12} /> JSON
            </button>
          </div>
        )}

        {/* Bouton télécharger */}
        <button
          onClick={onDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors shrink-0"
        >
          <Download size={12} />
          Télécharger
        </button>

        {/* Bouton supprimer (uniquement pour les fichiers non-JSON) */}
        {onDelete && file?.type !== 'json' && (
          <button
            onClick={() => { setDeleteConfirm(true); setDeleteError(null) }}
            title="Supprimer ce fichier"
            className="flex items-center justify-center p-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 rounded-lg transition-colors shrink-0"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* ── Contenu ── */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-6 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 dark:text-slate-500">
            <div className="w-5 h-5 border-2 border-slate-300 dark:border-slate-600 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-sm">Chargement…</span>
          </div>
        ) : content === null ? (
          <div className="text-slate-400 dark:text-slate-500 text-sm">Contenu indisponible</div>
        ) : file.type === 'json' ? (
          viewMode === 'articles' && isArticleArray ? (
            <ArticleListViewer content={content} />
          ) : (
            <>
              <div className="bg-slate-100 dark:bg-slate-950 rounded-xl p-6 border border-slate-200 dark:border-slate-800/60">
                <JsonViewer
                  content={content}
                  onSave={onContentSaved ? (newContent) => onContentSaved(file.path, newContent) : undefined}
                />
              </div>
              <div ref={entitiesRef}><EntityPanel content={content} onEntitySearch={onEntitySearch} /></div>
              <div ref={imagesRef}><ImageGallery content={content} /></div>
            </>
          )
        ) : (
          <MarkdownViewer content={content} />
        )}
      </div>
      {/* ── Boutons de navigation flottants ── */}
      {/* ── Dialog de confirmation suppression ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                <AlertTriangle size={16} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm mb-1">
                  Supprimer ce fichier ?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 break-all leading-relaxed">
                  {file.path}
                </p>
                <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">
                  Cette action est irréversible.
                </p>
              </div>
            </div>
            {deleteError && (
              <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 mb-4">
                {deleteError}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setDeleteConfirm(false); setDeleteError(null) }}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-500 active:bg-red-700 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {scrollTop > 50 && (
        <div className="fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom))] md:bottom-5 right-5 flex flex-col gap-2 z-50">
          {hasImages && (
            <button
              onClick={scrollToImages}
              title="Aller aux images"
              className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-blue-500/20 transition-all"
            >
              <Images size={16} />
            </button>
          )}
          {hasEntities && (
            <button
              onClick={scrollToEntities}
              title="Aller aux entités nommées"
              className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:border-violet-400 dark:hover:border-violet-500 hover:shadow-violet-500/20 transition-all"
            >
              <Tag size={16} />
            </button>
          )}
          <button
            onClick={scrollToTop}
            title="Retour en haut"
            className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-blue-500/20 transition-all"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      )}
    </main>
  )
}
