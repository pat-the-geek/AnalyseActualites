import { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from './components/Sidebar'
import FileViewer from './components/FileViewer'
import SearchOverlay from './components/SearchOverlay'
import SettingsPanel from './components/SettingsPanel'
import EntitySearchModal from './components/EntitySearchModal'
import EntityDashboard from './components/EntityDashboard'
import ScriptConsolePanel from './components/ScriptConsolePanel'
import { Search, Settings, Sun, Moon, Monitor, BarChart2, Terminal, Menu, Clock, TrendingUp, Star, Eye, Share2 } from 'lucide-react'
import AlertsPanel from './components/AlertsPanel'
import ExportPanel from './components/ExportPanel'
import TopArticlesPanel from './components/TopArticlesPanel'
import SourceBiasPanel from './components/SourceBiasPanel'
import wuddLogo from './assets/wudd-prism-floyd.svg'

// Heures de passage du cron get-keyword-from-rss.py (Europe/Paris)
const RSS_CRON_HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22]

function useNextRssCountdown() {
  const [label, setLabel] = useState('')
  useEffect(() => {
    function compute() {
      const now = new Date()
      const parts = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Europe/Paris',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(now)
      const h = parseInt(parts.find(p => p.type === 'hour').value)
      const m = parseInt(parts.find(p => p.type === 'minute').value)
      const curMin = h * 60 + m
      let diff = null
      for (const hr of RSS_CRON_HOURS) {
        if (hr * 60 > curMin) { diff = hr * 60 - curMin; break }
      }
      if (diff === null) diff = (24 - h) * 60 - m + RSS_CRON_HOURS[0] * 60
      if (diff <= 0) { setLabel('Actualisation en cours…'); return }
      if (diff < 60) { setLabel(`Actu. dans ${diff}min`); return }
      const hh = Math.floor(diff / 60)
      const mm = diff % 60
      setLabel(mm === 0 ? `Actu. dans ${hh}h` : `Actu. dans ${hh}h${String(mm).padStart(2, '0')}`)
    }
    compute()
    const interval = setInterval(compute, 60000)
    return () => clearInterval(interval)
  }, [])
  return label
}

// Formate un timestamp ISO UTC en label relatif français
function formatLastRun(isoStr) {
  if (!isoStr) return null
  const d = new Date(isoStr)
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return 'il y a quelques sec'
  if (diffMin < 60) return `il y a ${diffMin}min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `il y a ${diffH}h`
  return `il y a ${Math.floor(diffH / 24)}j`
}

// Interroge l'endpoint de statut du script get-keyword-from-rss.py
function useRssStatus() {
  const [status, setStatus] = useState(null)
  useEffect(() => {
    const fetchStatus = () => {
      fetch('/api/scripts/keyword-rss/status')
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setStatus(d))
        .catch(() => {})
    }
    fetchStatus()
    // Poll rapide (5s) quand en cours, lent (15s) sinon
    let id = null
    function schedule(isRunning) {
      clearInterval(id)
      id = setInterval(() => {
        fetch('/api/scripts/keyword-rss/status')
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (!d) return
            setStatus(d)
            if (!!d.running !== isRunning) schedule(!!d.running)
          })
          .catch(() => {})
      }, isRunning ? 5000 : 15000)
    }
    schedule(false)
    return () => clearInterval(id)
  }, [])
  return status
}

// Barre de statut RSS — affichée dans le header
function RssStatusBar({ status, nextRssLabel }) {
  if (!status) return null
  const prog = status.progress
  const running = status.running
  const pct = prog && prog.total_feeds > 0
    ? Math.round((prog.current_feed_idx / prog.total_feeds) * 100)
    : null

  // Durée écoulée depuis started_at
  let elapsed = ''
  if (prog?.started_at) {
    const mins = Math.round((Date.now() - new Date(prog.started_at).getTime()) / 60000)
    elapsed = mins < 60 ? `${mins}min` : `${Math.floor(mins/60)}h${String(mins%60).padStart(2,'0')}`
  }

  const tooltipLines = [
    prog?.current_feed_title && `Flux : ${prog.current_feed_title}`,
    prog?.last_action && `Action : ${prog.last_action}`,
    prog?.started_at && `Démarré : ${new Date(prog.started_at).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}`,
    status.article_count > 0 && `${status.article_count} articles / ${status.file_count} mots-clés`,
  ].filter(Boolean).join(' • ')

  return (
    <div className="hidden sm:flex items-center gap-2 ml-3" title={tooltipLines}>
      {running ? (
        <>
          {/* Indicateur en cours */}
          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
            En cours{elapsed ? ` (${elapsed})` : ''}
          </span>
          {/* Progression flux X/Y */}
          {prog && prog.total_feeds > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="tabular-nums">{prog.current_feed_idx}/{prog.total_feeds}</span>
              {/* barre de progression */}
              <span className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden inline-block align-middle">
                <span
                  className="h-full bg-green-500 rounded-full block transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="tabular-nums">{pct}%</span>
            </span>
          )}
          {/* Dernier flux / action */}
          {prog?.current_feed_title && (
            <span className="text-xs text-slate-400 dark:text-slate-500 max-w-[160px] truncate">
              {prog.current_feed_title}
            </span>
          )}
          {/* Articles ajoutés cette passe */}
          {prog?.articles_added > 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
              +{prog.articles_added} art.
            </span>
          )}
        </>
      ) : status.last_run || prog?.finished_at ? (
        <>
          <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${status.last_returncode === 0 || prog?.returncode === 0 ? 'bg-green-500' : status.last_returncode != null || prog?.returncode != null ? 'bg-red-500' : 'bg-slate-400'}`} />
            {formatLastRun(status.last_run || prog?.finished_at)}
          </span>
          {status.article_count > 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
              {status.article_count} art.
            </span>
          )}
        </>      ) : status.article_count > 0 ? (
        /* Script jamais suivi (avant instrumentation) — affiche juste le compteur */
        <span
          className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500"
          title={`${status.article_count} articles dans ${status.file_count} fichiers mots-clés`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
          {status.article_count} art. / {status.file_count} mots-clés
        </span>      ) : null}
      {nextRssLabel && !running && (
        <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
          <Clock size={11} />{nextRssLabel}
        </span>
      )}
    </div>
  )
}

const THEME_OPTIONS = [
  { key: 'jour', Icon: Sun,     title: 'Jour' },
  { key: 'auto', Icon: Monitor, title: 'Automatique' },
  { key: 'nuit', Icon: Moon,    title: 'Nuit' },
]

function applyTheme(theme) {
  const html = document.documentElement
  let isDark
  if (theme === 'nuit') {
    html.classList.add('dark')
    isDark = true
  } else if (theme === 'jour') {
    html.classList.remove('dark')
    isDark = false
  } else {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    html.classList.toggle('dark', isDark)
  }
  let meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.remove()
  meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = isDark ? '#1e293b' : '#ffffff'
  document.head.appendChild(meta)
}

export default function App() {
  const nextRssLabel = useNextRssCountdown()
  const rssStatus = useRssStatus()
  const [files, setFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileContent, setFileContent] = useState(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')
  const [nameSearch, setNameSearch] = useState('')
  const [entitySearch, setEntitySearch] = useState(null) // { value, type } | null
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [consoleOpen, setConsoleOpen]     = useState(false)
  const [alertsOpen, setAlertsOpen]       = useState(false)
  const [topOpen, setTopOpen]             = useState(false)
  const [biasOpen, setBiasOpen]           = useState(false)
  const [exportOpen, setExportOpen]       = useState(false)
  const [sidebarOpen, setSidebarOpen]     = useState(() => window.innerWidth >= 768)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [isRefreshing, setIsRefreshing]   = useState(false)
  // Annotations manuelles (dict keyed par URL article)
  const [annotations, setAnnotations]     = useState({})
  // Compteur de requêtes pour ignorer les réponses périmées (race condition)
  const fetchIdRef = useRef(0)
  // Ref sur le fichier en cours de consultation (accessible dans les callbacks
  // sans créer de dépendances cycliques)
  const selectedFileRef = useRef(null)
  useEffect(() => { selectedFileRef.current = selectedFile }, [selectedFile])

  // ── Thème ──────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => localStorage.getItem('wudd_theme') || 'auto')

  useEffect(() => {
    localStorage.setItem('wudd_theme', theme)
    applyTheme(theme)
  }, [theme])

  // En mode automatique, écouter les changements de préférence système
  useEffect(() => {
    if (theme !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('auto')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  // ── Données ────────────────────────────────────────────────────────────────
  const refreshFiles = useCallback(() => {
    setIsRefreshing(true)
    const id = ++fetchIdRef.current
    fetch('/api/files')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (id !== fetchIdRef.current) return // réponse périmée ignorée
        if (!Array.isArray(data)) throw new Error('Réponse invalide')
        setFiles(prev => {
          // Ne jamais remplacer une liste non-vide par une liste vide
          if (data.length === 0 && prev.length > 0) return prev
          // Conserver les markdown présents dans l'état précédent mais absents
          // de la nouvelle réponse (virtiofs - listing partiel transitoire).
          // Ne s'applique pas aux suppressions car deleteFile() retire le fichier
          // de l'état via setFiles(filter) avant tout appel refreshFiles().
          const newPaths = new Set(data.map(f => f.path))
          const missingMd = prev.filter(f => f.type === 'markdown' && !newPaths.has(f.path))
          if (missingMd.length > 0) {
            return [...data, ...missingMd].sort((a, b) => b.modified - a.modified)
          }
          return data
        })
        // Si un fichier est en cours de consultation, vérifier s'il a été modifié
        const current = selectedFileRef.current
        if (current) {
          const updated = data.find(f => f.path === current.path)
          if (updated && updated.modified !== current.modified) {
            // Le fichier a été modifié : mettre à jour la référence et recharger
            setSelectedFile(updated)
            setFileContent(null)
            setContentLoading(true)
            setLoadingProgress(0)
            fetch(`/api/stream-content?path=${encodeURIComponent(current.path)}`)
              .then(async (response) => {
                const fileSize = parseInt(response.headers.get('X-File-Size') || '0', 10)
                const reader = response.body.getReader()
                const decoder = new TextDecoder()
                const chunks = []
                let loaded = 0
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  chunks.push(decoder.decode(value, { stream: true }))
                  loaded += value.length
                  if (fileSize > 0) setLoadingProgress(Math.min(99, Math.round((loaded / fileSize) * 100)))
                }
                chunks.push(decoder.decode())
                return chunks.join('')
              })
              .then(text => { setFileContent(text); setContentLoading(false); setLoadingProgress(0) })
              .catch(() => { setContentLoading(false); setLoadingProgress(0) })
          }
          // Si le fichier n'a pas été modifié, le contenu chargé est conservé
        }
        setIsRefreshing(false)
      })
      .catch(err => {
        if (id !== fetchIdRef.current) return // réponse périmée ignorée
        console.error('Erreur chargement fichiers:', err)
        setIsRefreshing(false)
        // L'état précédent est conservé (pas de setFiles)
      })
  }, [])

  useEffect(() => { refreshFiles() }, [refreshFiles])

  // ── Annotations ─────────────────────────────────────────────────────────────
  // Chargement initial depuis /api/annotations
  useEffect(() => {
    fetch('/api/annotations')
      .then(r => r.ok ? r.json() : {})
      .then(data => setAnnotations(data || {}))
      .catch(() => {})
  }, [])

  // Callback : crée ou met à jour l'annotation d'un article (optimistic update)
  const handleAnnotate = useCallback(async (url, changes) => {
    if (!url) return
    // Mise à jour optimiste immédiate
    setAnnotations(prev => {
      const existing = prev[url] || {}
      return { ...prev, [url]: { ...existing, ...changes } }
    })
    try {
      const r = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, ...changes }),
      })
      if (r.ok) {
        const data = await r.json()
        if (data.annotation) {
          setAnnotations(prev => ({ ...prev, [url]: data.annotation }))
        }
      }
    } catch {
      // L'optimistic update reste en place — non critique
    }
  }, [])

  // Recharge la liste au retour de l'application (mobile : mise en arrière-plan)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshFiles()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [refreshFiles])

  // Raccourci clavier Ctrl/Cmd+K pour la recherche plein texte
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const selectFile = useCallback((file) => {
    setSelectedFile(file)
    setFileContent(null)
    setContentLoading(true)
    setLoadingProgress(0)
    if (window.innerWidth < 768) setSidebarOpen(false)

    fetch(`/api/stream-content?path=${encodeURIComponent(file.path)}`)
      .then(async (response) => {
        const fileSize = parseInt(response.headers.get('X-File-Size') || '0', 10)
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        const chunks = []
        let loaded = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(decoder.decode(value, { stream: true }))
          loaded += value.length
          if (fileSize > 0) {
            setLoadingProgress(Math.min(99, Math.round((loaded / fileSize) * 100)))
          }
        }
        // Flush le décodeur
        chunks.push(decoder.decode())
        return chunks.join('')
      })
      .then(text => {
        setFileContent(text)
        setContentLoading(false)
        setLoadingProgress(0)
      })
      .catch(() => {
        setContentLoading(false)
        setLoadingProgress(0)
      })
  }, [])

  const downloadFile = useCallback(() => {
    if (!selectedFile) return
    const a = document.createElement('a')
    a.href = `/api/download?path=${encodeURIComponent(selectedFile.path)}`
    a.download = selectedFile.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [selectedFile])

  const saveContent = useCallback(async (path, newContent) => {
    const r = await fetch('/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content: newContent }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      throw new Error(err.description || 'Erreur lors de la sauvegarde')
    }
    setFileContent(newContent)
  }, [])

  const deleteFile = useCallback(async (file) => {
    const r = await fetch(`/api/files?path=${encodeURIComponent(file.path)}`, { method: 'DELETE' })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      throw new Error(err.description || 'Erreur lors de la suppression')
    }
    setFiles(prev => prev.filter(f => f.path !== file.path))
    setSelectedFile(null)
    setFileContent(null)
  }, [])

  const filteredFiles = files.filter(f => {
    if (typeFilter !== 'all' && f.type !== typeFilter) return false
    if (nameSearch && !f.name.toLowerCase().includes(nameSearch.toLowerCase())) return false
    return true
  })

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* ── Barre de navigation ── */}
      <header className="flex items-center gap-3 px-4 py-2.5 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl border-b border-white/30 dark:border-slate-700/40 shrink-0" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
        {/* Bouton hamburger — mobile uniquement */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="md:hidden p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          title="Afficher / masquer les fichiers"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2">
          <img src={wuddLogo} alt="WUDD.ai" className="hidden sm:block w-12 h-12 rounded-md select-none" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">WUDD.ai</span>
        </div>

        {/* Statut RSS + prochain passage */}
        <RssStatusBar status={rssStatus} nextRssLabel={nextRssLabel} />

        <div className="flex-1" />

        {/* Sélecteur de thème */}
        <div
          className="hidden md:flex items-center rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden shrink-0"
          title="Thème d'affichage"
        >
          {THEME_OPTIONS.map(({ key, Icon, title }) => (
            <button
              key={key}
              onClick={() => setTheme(key)}
              title={title}
              className={`px-2 py-1.5 transition-colors ${
                theme === key
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Icon size={13} />
            </button>
          ))}
        </div>

        {/* Console RSS keywords */}
        <button
          onClick={() => setConsoleOpen(true)}
          className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm transition-colors ${
            rssStatus?.running
              ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400'
              : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
          title={rssStatus
            ? `Dernier : ${rssStatus.last_run ? new Date(rssStatus.last_run).toLocaleString('fr-FR') : 'inconnu'} • ${rssStatus.article_count ?? 0} articles / ${rssStatus.file_count ?? 0} mots-clés`
            : "Lancer l'extraction des mots-clés RSS"
          }
        >
          <Terminal size={13} />
          {rssStatus?.running ? (
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          ) : rssStatus?.last_returncode === 0 || rssStatus?.progress?.returncode === 0 ? (
            <span className="w-2 h-2 rounded-full bg-green-500" />
          ) : rssStatus?.last_returncode != null || rssStatus?.progress?.returncode != null ? (
            <span className="w-2 h-2 rounded-full bg-red-500" />
          ) : rssStatus?.file_count > 0 ? (
            <span className="w-2 h-2 rounded-full bg-slate-400" />
          ) : null}
          <span className="hidden sm:inline">Mots-clés RSS</span>
          {!rssStatus?.running && rssStatus?.file_count > 0 && (
            <span className="ml-0.5 text-xs tabular-nums opacity-60">{rssStatus.file_count}</span>
          )}
        </button>

        {/* Top articles */}
        <button
          onClick={() => setTopOpen(true)}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          title="Top articles par score de pertinence"
        >
          <Star size={13} />
          <span className="hidden sm:inline">Top</span>
        </button>

        {/* Tendances & alertes */}
        <button
          onClick={() => setAlertsOpen(true)}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          title="Alertes de tendances"
        >
          <TrendingUp size={13} />
          <span className="hidden sm:inline">Tendances</span>
        </button>

        {/* Biais éditoriaux */}
        <button
          onClick={() => setBiasOpen(true)}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          title="Analyse des biais éditoriaux par source"
        >
          <Eye size={13} />
          <span className="hidden sm:inline">Biais</span>
        </button>

        {/* Export & Diffusion */}
        <button
          onClick={() => setExportOpen(true)}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          title="Export &amp; Diffusion — Atom XML, Newsletter, Webhook"
        >
          <Share2 size={13} />
          <span className="hidden sm:inline">Export</span>
        </button>

        {/* Dashboard entités */}
        <button
          onClick={() => setDashboardOpen(true)}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          title="Dashboard des entités nommées"
        >
          <BarChart2 size={13} />
          <span className="hidden sm:inline">Entités</span>
        </button>

        {/* Réglages */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          title="Réglages — planification, mots-clés, flux"
        >
          <Settings size={13} />
          <span className="hidden sm:inline">Réglages</span>
        </button>

        {/* Recherche plein texte */}
        <button
          onClick={() => setSearchOpen(true)}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <Search size={13} />
          <span className="hidden sm:inline">Recherche plein texte</span>
          <kbd className="hidden md:inline-flex items-center gap-0.5 ml-1 text-xs bg-slate-200 dark:bg-slate-900 text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700">
            Ctrl K
          </kbd>
        </button>
      </header>

      {/* ── Corps principal ── */}
      <div className="flex flex-1 overflow-hidden relative pb-16 md:pb-0">
        {/* Overlay backdrop — mobile uniquement, ferme la sidebar au clic */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <Sidebar
          files={filteredFiles}
          selectedFile={selectedFile}
          onSelect={selectFile}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          nameSearch={nameSearch}
          onNameSearchChange={setNameSearch}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onRefresh={refreshFiles}
          isRefreshing={isRefreshing}
        />
        <FileViewer
          file={selectedFile}
          content={fileContent}
          loading={contentLoading}
          loadingProgress={loadingProgress}
          onDownload={downloadFile}
          onContentSaved={saveContent}
          onEntitySearch={(value, type) => setEntitySearch({ value, type })}
          onDelete={deleteFile}
          annotations={annotations}
          onAnnotate={handleAnnotate}
        />
      </div>

      {/* ── Barre de navigation bas — mobile uniquement (Apple HIG: 5 tabs max, labels, verre dépoli) ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/85 backdrop-blur-xl backdrop-saturate-150 border-t border-white/40 dark:border-slate-700/40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch h-[49px]">

          {/* 1 — Fichiers : ouvre le drawer latéral */}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            title="Fichiers"
            className={`flex flex-1 flex-col items-center justify-center gap-[2px] transition-colors active:opacity-60 ${
              sidebarOpen
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <Menu size={24} strokeWidth={sidebarOpen ? 2.2 : 1.8} />
            <span className="text-[10px] font-medium leading-none">Fichiers</span>
          </button>

          {/* 2 — Top articles */}
          <button
            onClick={() => setTopOpen(true)}
            title="Top articles"
            className={`flex flex-1 flex-col items-center justify-center gap-[2px] transition-colors active:opacity-60 ${
              topOpen
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <Star size={24} strokeWidth={topOpen ? 2.2 : 1.8} />
            <span className="text-[10px] font-medium leading-none">Top</span>
          </button>

          {/* 3 — Recherche : centre = zone pouce prioritaire */}
          <button
            onClick={() => setSearchOpen(true)}
            title="Recherche plein texte"
            className={`flex flex-1 flex-col items-center justify-center gap-[2px] transition-colors active:opacity-60 ${
              searchOpen
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <Search size={24} strokeWidth={searchOpen ? 2.2 : 1.8} />
            <span className="text-[10px] font-medium leading-none">Recherche</span>
          </button>

          {/* 4 — Entités */}
          <button
            onClick={() => setDashboardOpen(true)}
            title="Dashboard entités"
            className={`flex flex-1 flex-col items-center justify-center gap-[2px] transition-colors active:opacity-60 ${
              dashboardOpen
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <BarChart2 size={24} strokeWidth={dashboardOpen ? 2.2 : 1.8} />
            <span className="text-[10px] font-medium leading-none">Entités</span>
          </button>

          {/* 5 — Réglages (inclut : thème, RSS, tendances, biais) */}
          <button
            onClick={() => setSettingsOpen(true)}
            title="Réglages"
            className={`flex flex-1 flex-col items-center justify-center gap-[2px] transition-colors active:opacity-60 ${
              settingsOpen
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <Settings size={24} strokeWidth={settingsOpen ? 2.2 : 1.8} />
            <span className="text-[10px] font-medium leading-none">Réglages</span>
          </button>

        </div>
      </nav>

      {/* ── Overlays ── */}
      {consoleOpen && (
        <ScriptConsolePanel onClose={() => setConsoleOpen(false)} onDone={refreshFiles} />
      )}
      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          onSelect={(file) => { selectFile(file); setSearchOpen(false) }}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          theme={theme}
          onThemeChange={setTheme}
          rssStatus={rssStatus}
          onOpenConsole={() => { setSettingsOpen(false); setConsoleOpen(true) }}
          onOpenTendances={() => { setSettingsOpen(false); setAlertsOpen(true) }}
          onOpenBiais={() => { setSettingsOpen(false); setBiasOpen(true) }}
        />
      )}
      {dashboardOpen && (
        <EntityDashboard
          onClose={() => setDashboardOpen(false)}
          onEntitySearch={(value, type) => {
            setDashboardOpen(false)
            setEntitySearch({ value, type })
          }}
        />
      )}
      {alertsOpen && (
        <AlertsPanel
          onClose={() => setAlertsOpen(false)}
          onEntitySearch={(value, type) => { setEntitySearch({ value, type }) }}
        />
      )}
      {topOpen && (
        <TopArticlesPanel onClose={() => setTopOpen(false)} />
      )}
      {biasOpen && (
        <SourceBiasPanel onClose={() => setBiasOpen(false)} />
      )}
      {exportOpen && (
        <ExportPanel onClose={() => setExportOpen(false)} files={files} />
      )}
      {entitySearch && (
        <EntitySearchModal
          query={entitySearch.value}
          entityType={entitySearch.type}
          onClose={() => setEntitySearch(null)}
          onSelectFile={(file) => {
            const full = files.find(f => f.path === file.path) ?? file
            selectFile(full)
            setEntitySearch(null)
          }}
        />
      )}
    </div>
  )
}
