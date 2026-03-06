import { useEffect, useState, useCallback, useRef } from 'react'
import {
  X, Settings, Clock, Tag, Rss, Plus, Trash2, RefreshCw,
  CheckCircle2, HelpCircle, Calendar, Check, AlertTriangle, Save,
  Maximize2, Minimize2, ExternalLink, Database, Clipboard, BarChart2,
  ToggleLeft, ToggleRight, RotateCcw,
} from 'lucide-react'

// ─── Helpers partagés ────────────────────────────────────────────────────────

function formatDateTime(isoStr) {
  if (!isoStr) return null
  return new Date(isoStr).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatRelative(isoStr) {
  if (!isoStr) return null
  const diff = new Date(isoStr) - Date.now()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
  if (abs < 3_600_000)  return rtf.format(Math.round(diff / 60_000),    'minute')
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour')
  return rtf.format(Math.round(diff / 86_400_000), 'day')
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-40 gap-3 text-slate-400 dark:text-slate-500">
      <div className="w-4 h-4 border-2 border-slate-300 dark:border-slate-600 border-t-blue-500 rounded-full animate-spin" />
      <span className="text-sm">Chargement…</span>
    </div>
  )
}

function SaveButton({ saving, saved, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        saved
          ? 'bg-green-700 text-green-100 border border-green-600'
          : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500 disabled:opacity-60'
      }`}
    >
      {saved
        ? <><Check size={12} /> Sauvegardé</>
        : saving
          ? <><RefreshCw size={12} className="animate-spin" /> Sauvegarde…</>
          : <><Save size={12} /> Sauvegarder</>
      }
    </button>
  )
}

function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div className="px-5 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-700/30 text-xs text-red-600 dark:text-red-400 flex items-center gap-2 shrink-0">
      <AlertTriangle size={12} /> {message}
    </div>
  )
}

// ─── Onglet Planification ────────────────────────────────────────────────────

function StatusBadge({ task }) {
  const nextMs = task.next_run ? new Date(task.next_run) - Date.now() : null
  const isSoon = nextMs !== null && nextMs > 0 && nextMs < 3_600_000

  if (!task.last_run) return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
      <HelpCircle size={12} /> Jamais exécuté
    </span>
  )
  if (isSoon) return (
    <span className="inline-flex items-center gap-1.5 text-xs text-blue-500 dark:text-blue-400">
      <span className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400 animate-pulse" /> Bientôt
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
      <CheckCircle2 size={12} /> Actif
    </span>
  )
}

function TaskTable({ title, tasks }) {
  if (!tasks.length) return null
  return (
    <div>
      <div className="sticky top-0 bg-slate-50 dark:bg-slate-900 px-5 py-2 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {title}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-200/50 dark:border-slate-700/50">
            <th className="text-left px-5 py-2.5">Tâche</th>
            <th className="text-left px-4 py-2.5">Fréquence</th>
            <th className="text-left px-4 py-2.5">Dernière exécution</th>
            <th className="text-left px-4 py-2.5">Prochaine exécution</th>
            <th className="text-left px-4 py-2.5">Statut</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, i) => (
            <tr key={i} className="border-b border-slate-200/40 dark:border-slate-700/40 last:border-0 hover:bg-slate-100/20 dark:hover:bg-slate-700/20 transition-colors">
              <td className="px-5 py-3">
                <div className="font-medium text-slate-800 dark:text-slate-200 text-sm">{task.name}</div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{task.script}</div>
                {task.detail && (
                  <div className="text-[11px] text-blue-500 dark:text-blue-400 mt-1">{task.detail}</div>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="text-slate-700 dark:text-slate-300 text-sm">{task.label}</div>
                <div className="text-[10px] text-slate-400 dark:text-slate-600 font-mono mt-0.5">{task.cron}</div>
              </td>
              <td className="px-4 py-3">
                {task.last_run ? (
                  <>
                    <div className="text-slate-700 dark:text-slate-300 text-sm">{formatDateTime(task.last_run)}</div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{formatRelative(task.last_run)}</div>
                  </>
                ) : <span className="text-slate-400 dark:text-slate-600 italic text-sm">Jamais</span>}
              </td>
              <td className="px-4 py-3">
                {task.next_run ? (
                  <>
                    <div className="text-slate-700 dark:text-slate-300 text-sm">{formatDateTime(task.next_run)}</div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{formatRelative(task.next_run)}</div>
                  </>
                ) : <span className="text-slate-400 dark:text-slate-600 text-sm">—</span>}
              </td>
              <td className="px-4 py-3"><StatusBadge task={task} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SchedulerTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/scheduler')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const upcoming = data?.tasks
    .filter(t => t.next_run && new Date(t.next_run) > Date.now())
    .sort((a, b) => new Date(a.next_run) - new Date(b.next_run))[0]

  const systemTasks = data?.tasks.filter(t => !t.flux) ?? []
  const fluxTasks   = data?.tasks.filter(t => t.flux)  ?? []

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Prochaine tâche imminente */}
      {upcoming && (
        <div className="px-5 py-2.5 bg-blue-50 dark:bg-blue-600/10 border-b border-blue-200 dark:border-blue-500/20 shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <Calendar size={13} className="text-blue-500 dark:text-blue-400 shrink-0" />
            <span className="text-blue-700 dark:text-blue-300">
              Prochaine tâche :{' '}
              <span className="font-medium text-blue-800 dark:text-blue-200">{upcoming.name}</span>
              {' — '}
              <span className="text-blue-600 dark:text-blue-300">{formatRelative(upcoming.next_run)}</span>
              <span className="text-blue-400 dark:text-blue-500 text-xs ml-2">({formatDateTime(upcoming.next_run)})</span>
            </span>
          </div>
        </div>
      )}

      {/* Corps */}
      <div className="flex-1 overflow-auto">
        {loading ? <Spinner /> : !data?.tasks?.length ? (
          <div className="flex items-center justify-center h-40 text-slate-400 dark:text-slate-500 text-sm">
            Aucune tâche planifiée trouvée
          </div>
        ) : (
          <>
            <TaskTable title="Tâches système (cron)" tasks={systemTasks} />
            {fluxTasks.length > 0 && <TaskTable title="Tâches par flux" tasks={fluxTasks} />}
          </>
        )}
      </div>

      {/* Pied */}
      {data && (
        <div className="px-5 py-2 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-400 dark:text-slate-600 shrink-0 flex items-center gap-2">
          <span>
            {data.tasks.length} tâche{data.tasks.length !== 1 ? 's' : ''} planifiée{data.tasks.length !== 1 ? 's' : ''}
            {' · '}Actualisé à {new Date(data.now).toLocaleTimeString('fr-FR')}
          </span>
          <button
            onClick={load}
            className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            title="Actualiser"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Saisie de tags (termes OU / ET) ────────────────────────────────────────

function TagInput({ tags, onChange, placeholder, color }) {
  const [input, setInput] = useState('')

  const styles = {
    blue:  { tag: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700/50',  btn: 'hover:text-blue-600 dark:hover:text-blue-200 text-blue-500 dark:text-blue-400'  },
    green: { tag: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700/50', btn: 'hover:text-green-600 dark:hover:text-green-200 text-green-500 dark:text-green-400' },
  }
  const s = styles[color] || styles.blue

  const commit = () => {
    const v = input.trim()
    if (v && !tags.includes(v)) onChange([...tags, v])
    setInput('')
  }

  const remove = (t) => onChange(tags.filter(x => x !== t))

  return (
    <div className="flex flex-wrap gap-1.5 items-center min-h-[28px]">
      {tags.map(tag => (
        <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${s.tag}`}>
          {tag}
          <button
            onClick={() => remove(tag)}
            className={`${s.btn} hover:text-red-500 dark:hover:text-red-300 transition-colors`}
            aria-label={`Supprimer ${tag}`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() }
          }}
          placeholder={placeholder}
          className="text-xs bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded px-2 py-0.5 text-slate-700 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 w-40 transition-colors"
        />
        <button
          onClick={commit}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          aria-label="Ajouter"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Onglet Mots-clés ────────────────────────────────────────────────────────

function KeywordsTab() {
  const [keywords, setKeywords] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState(null)

  useEffect(() => {
    fetch('/api/keywords')
      .then(r => r.json())
      .then(d => {
        const sorted = [...d].sort((a, b) =>
          (a.keyword || '').localeCompare(b.keyword || '', 'fr', { sensitivity: 'base' })
        )
        setKeywords(sorted)
        setLoading(false)
      })
      .catch(() => { setError('Impossible de charger les mots-clés'); setLoading(false) })
  }, [])

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const r = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(keywords),
      })
      if (!r.ok) throw new Error()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Erreur lors de la sauvegarde')
    } finally { setSaving(false) }
  }

  const add = () => setKeywords(k => [...k, { keyword: '', or: [], and: [] }])

  const remove = (idx) => setKeywords(k => k.filter((_, i) => i !== idx))

  const update = (idx, field, value) =>
    setKeywords(k => k.map((kw, i) => i === idx ? { ...kw, [field]: value } : kw))

  if (loading) return <Spinner />

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Barre d'outils */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200/50 dark:border-slate-700/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl shrink-0">
        <p className="text-xs text-slate-400 dark:text-slate-500 flex-1">
          Mots-clés extraits des flux RSS.{' '}
          <span className="text-blue-600 dark:text-blue-400 font-medium">OU</span> élargit la recherche,{' '}
          <span className="text-green-600 dark:text-green-400 font-medium">ET</span> la restreint.
          Appuyez sur <kbd className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1 rounded text-[10px]">Entrée</kbd> pour valider un terme.
        </p>
        <button
          onClick={add}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-xs text-slate-700 dark:text-slate-300 transition-colors shrink-0"
        >
          <Plus size={12} /> Ajouter
        </button>
        <SaveButton saving={saving} saved={saved} onClick={save} />
      </div>

      <ErrorBanner message={error} />

      {/* Liste */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {!keywords?.length ? (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500 text-sm">
            Aucun mot-clé configuré.{' '}
            <button onClick={add} className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 underline">
              Ajouter le premier
            </button>
          </div>
        ) : keywords.map((kw, idx) => (
          <div key={idx} className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">

            {/* Mot-clé principal */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium mb-1 block">
                  Mot-clé principal
                </label>
                <input
                  type="text"
                  value={kw.keyword}
                  onChange={e => update(idx, 'keyword', e.target.value)}
                  placeholder="ex. Intelligence Artificielle"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <button
                onClick={() => remove(idx)}
                className="mt-5 p-1.5 text-slate-400 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                title="Supprimer ce mot-clé"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Termes OU */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700/50 rounded px-1.5 py-0.5 font-bold">OU</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  correspond si l'un de ces termes est présent
                </span>
              </div>
              <TagInput
                tags={kw.or || []}
                onChange={v => update(idx, 'or', v)}
                placeholder="Synonyme ou variante…"
                color="blue"
              />
            </div>

            {/* Termes ET */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700/50 rounded px-1.5 py-0.5 font-bold">ET</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  doit aussi contenir au moins un de ces termes
                </span>
              </div>
              <TagInput
                tags={kw.and || []}
                onChange={v => update(idx, 'and', v)}
                placeholder="Filtre obligatoire…"
                color="green"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Onglet RSS ───────────────────────────────────────────────────────────────

function RssTab() {
  const [feeds, setFeeds]           = useState(null)
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [checking, setChecking]     = useState(new Set())   // xmlUrls en cours de vérif
  const [results, setResults]       = useState({})          // xmlUrl → true|false
  const [isDirty, setIsDirty]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState(null)        // {ok, text}
  const [checkingAll, setCheckingAll] = useState(false)
  const [showPasteInput, setShowPasteInput] = useState(false)
  const [pasteUrl, setPasteUrl]       = useState('')
  const [pasteMsg, setPasteMsg]       = useState(null)  // {state:'checking'|'ok'|'error', text}
  const [feedStats, setFeedStats]     = useState({})    // domain → {count, lastDate}
  const pasteInputRef                 = useRef(null)

  useEffect(() => {
    fetch('/api/rss-feeds')
      .then(r => r.json())
      .then(d => { setFeeds(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => { setError('Impossible de charger les flux RSS'); setLoading(false) })
  }, [])

  // Chargement en tâche de fond : stats articles par domaine
  useEffect(() => {
    fetch('/api/rss-feeds/stats')
      .then(r => r.json())
      .then(d => { if (d && typeof d === 'object' && !d.error) setFeedStats(d) })
      .catch(() => {})
  }, [])

  const removeFeed = useCallback((xmlUrl) => {
    setFeeds(prev => prev.filter(f => f.xmlUrl !== xmlUrl))
    setIsDirty(true)
  }, [])

  const checkOne = useCallback(async (xmlUrl) => {
    setChecking(prev => new Set([...prev, xmlUrl]))
    try {
      const r = await fetch('/api/rss-feeds/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: xmlUrl }),
      })
      const data = await r.json()
      const ok = !!data.ok
      setResults(prev => ({ ...prev, [xmlUrl]: ok }))
      if (!ok) {
        // Supprimer automatiquement après un bref délai pour que l'utilisateur voie le résultat
        setTimeout(() => removeFeed(xmlUrl), 1200)
      }
    } catch {
      setResults(prev => ({ ...prev, [xmlUrl]: false }))
      setTimeout(() => removeFeed(xmlUrl), 1200)
    } finally {
      setChecking(prev => { const s = new Set(prev); s.delete(xmlUrl); return s })
    }
  }, [removeFeed])

  const checkAll = useCallback(async () => {
    if (!feeds || checkingAll) return
    setCheckingAll(true)
    setResults({})
    // Vérification séquentielle pour ne pas surcharger
    for (const f of feeds) {
      await checkOne(f.xmlUrl)
    }
    setCheckingAll(false)
  }, [feeds, checkingAll, checkOne])

  const handlePaste = useCallback(async () => {
    const url = pasteUrl.trim()
    if (!url.startsWith('http')) {
      setPasteMsg({ state: 'error', text: `URL invalide : "${url.slice(0, 60)}"` })
      return
    }
    // Normalisation : retire le slash final et force lowercase pour la comparaison
    const normalize = u => u.replace(/\/+$/, '').toLowerCase()
    const urlNorm = normalize(url)
    const duplicate = feeds?.find(f => normalize(f.xmlUrl) === urlNorm)
    if (duplicate) {
      setPasteMsg({ state: 'error', text: `Ce flux est déjà dans la liste : « ${duplicate.title} »` })
      return
    }
    setPasteMsg({ state: 'checking', text: `Vérification de ${url}…` })
    try {
      const r = await fetch('/api/rss-feeds/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await r.json()
      if (data.ok) {
        const newFeed = { title: data.title, xmlUrl: data.xmlUrl, htmlUrl: data.htmlUrl || '' }
        setFeeds(prev => [...(prev || []), newFeed].sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' })))
        setIsDirty(true)
        setResults(prev => ({ ...prev, [url]: true }))
        setPasteMsg({ state: 'ok', text: `« ${data.title} » ajouté à la liste.` })
        setPasteUrl('')
        setShowPasteInput(false)
      } else {
        setPasteMsg({ state: 'error', text: data.error || 'URL non accessible' })
      }
    } catch (e) {
      setPasteMsg({ state: 'error', text: String(e) })
    } finally {
      setTimeout(() => setPasteMsg(null), 5000)
    }
  }, [feeds, pasteUrl])

  const saveFeed = useCallback(async () => {
    if (!feeds || saving) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const r = await fetch('/api/rss-feeds/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feeds),
      })
      const data = await r.json()
      if (data.ok) {
        setSaveMsg({ ok: true, text: `${data.count} flux sauvegardés dans WUDD.opml` })
        setIsDirty(false)
      } else {
        setSaveMsg({ ok: false, text: data.error || 'Erreur lors de la sauvegarde' })
      }
    } catch (e) {
      setSaveMsg({ ok: false, text: String(e) })
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 4000)
    }
  }, [feeds, saving])

  const filtered = feeds
    ? feeds.filter(f => f.title.toLowerCase().includes(search.toLowerCase()) || f.htmlUrl.toLowerCase().includes(search.toLowerCase()))
    : []

  const grouped = filtered.reduce((acc, f) => {
    const letter = f.title[0]?.toUpperCase() ?? '#'
    if (!acc[letter]) acc[letter] = []
    acc[letter].push(f)
    return acc
  }, {})
  const letters = Object.keys(grouped).sort()

  if (loading) return <Spinner />

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Barre d'outils */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200/50 dark:border-slate-700/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl shrink-0 flex-wrap">
        <Database size={12} className="text-slate-400 dark:text-slate-500 shrink-0" />
        <p className="text-xs text-slate-400 dark:text-slate-500 flex-1 min-w-0">
          {feeds
            ? <><span className="font-medium text-slate-600 dark:text-slate-300">{feeds.length}</span> flux RSS</>
            : 'Flux RSS'}
        </p>
        {/* Coller une URL */}
        <button
          onClick={() => {
            setShowPasteInput(v => {
              const next = !v
              if (next) setTimeout(() => pasteInputRef.current?.focus(), 50)
              return next
            })
            setPasteMsg(null)
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors
            ${showPasteInput
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-400/40'
              : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'}`}
          title="Ajouter un flux RSS en collant son URL"
        >
          <Clipboard size={11} />
          <span className="hidden sm:inline">Coller</span>
        </button>
        {/* Vérifier tous */}
        <button
          onClick={checkAll}
          disabled={checkingAll || !feeds?.length}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors disabled:opacity-40
            bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"
          title="Vérifier toutes les URLs (supprime les non-répondants)"
        >
          {checkingAll
            ? <RefreshCw size={11} className="animate-spin" />
            : <Check size={11} />}
          <span className="hidden sm:inline">Vérifier</span>
        </button>
        {/* Sauvegarder */}
        <button
          onClick={saveFeed}
          disabled={!isDirty || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors disabled:opacity-40
            bg-blue-500 hover:bg-blue-600 text-white"
          title="Sauvegarder les flux dans data/WUDD.opml"
        >
          {saving
            ? <RefreshCw size={11} className="animate-spin" />
            : <Save size={11} />}
          <span className="hidden sm:inline">Sauver</span>
        </button>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filtrer…"
          className="pl-3 pr-3 py-1.5 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors w-36"
        />
      </div>

      {/* Barre de saisie URL */}
      {showPasteInput && (
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-slate-200/50 dark:border-slate-700/50 bg-blue-50/60 dark:bg-blue-900/20 shrink-0">
          <Rss size={12} className="text-blue-400 shrink-0" />
          <input
            ref={pasteInputRef}
            type="url"
            value={pasteUrl}
            onChange={e => { setPasteUrl(e.target.value); setPasteMsg(null) }}
            onKeyDown={e => { if (e.key === 'Enter') handlePaste(); if (e.key === 'Escape') { setShowPasteInput(false); setPasteUrl('') } }}
            placeholder="Coller l'URL RSS ici (Entrée pour valider)"
            className="flex-1 min-w-0 pl-3 pr-3 py-1.5 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
          />
          <button
            onClick={handlePaste}
            disabled={!pasteUrl.trim() || pasteMsg?.state === 'checking'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-40 transition-colors shrink-0"
          >
            {pasteMsg?.state === 'checking' ? <RefreshCw size={11} className="animate-spin" /> : <Plus size={11} />}
            Ajouter
          </button>
          <button onClick={() => { setShowPasteInput(false); setPasteUrl(''); setPasteMsg(null) }}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0">
            <X size={13} />
          </button>
        </div>
      )}
      {pasteMsg && (
        <div className={`mx-5 mt-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
          pasteMsg.state === 'checking' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
          : pasteMsg.state === 'ok'     ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
          :                               'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
          {pasteMsg.state === 'checking' && <RefreshCw size={13} className="animate-spin shrink-0" />}
          {pasteMsg.state === 'ok'       && <CheckCircle2 size={13} className="shrink-0" />}
          {pasteMsg.state === 'error'    && <AlertTriangle size={13} className="shrink-0" />}
          <span className="truncate">{pasteMsg.text}</span>
        </div>
      )}

      {saveMsg && (
        <div className={`mx-5 mt-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${saveMsg.ok ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
          {saveMsg.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
          {saveMsg.text}
        </div>
      )}

      <ErrorBanner message={error} />

      {/* Liste groupée par lettre */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {letters.length === 0 ? (
          <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-sm">Aucun flux trouvé.</div>
        ) : letters.map(letter => (
          <div key={letter}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest w-5 text-center">{letter}</span>
              <div className="flex-1 h-px bg-slate-100 dark:bg-slate-700/60" />
            </div>
            <div className="space-y-1 ml-8">
              {grouped[letter].map((f) => {
                const isChecking = checking.has(f.xmlUrl)
                const result = results[f.xmlUrl]  // undefined | true | false
                const fDomain = (() => { try { return new URL(f.htmlUrl || f.xmlUrl).hostname.replace(/^www\./, '') } catch { return '' } })()
                const stat = feedStats[fDomain]
                return (
                  <div key={f.xmlUrl} className={`flex items-center gap-2 py-1 group rounded transition-colors ${result === false ? 'bg-red-50/60 dark:bg-red-900/20' : ''}`}>
                    <Rss size={11} className="text-orange-400 dark:text-orange-500 shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-200 flex-1 truncate">{f.title}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[160px] hidden sm:block">
                      {f.htmlUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </span>
                    {/* Stats articles en tâche de fond */}
                    {stat && (
                      <span
                        className="flex items-center gap-1 text-xs text-blue-400/80 dark:text-blue-400/60 shrink-0 tabular-nums"
                        title={`${stat.count} article${stat.count > 1 ? 's' : ''} stocké${stat.count > 1 ? 's' : ''}${stat.lastDate ? ' · dernière publication : ' + new Date(stat.lastDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`}
                      >
                        <Calendar size={10} className="shrink-0" />
                        <span>{stat.count}</span>
                        {stat.lastDate && (
                          <span className="hidden md:inline text-slate-400 dark:text-slate-500">
                            · {new Date(stat.lastDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </span>
                    )}
                    {/* Icône de résultat */}
                    {isChecking && <RefreshCw size={11} className="animate-spin text-blue-400 shrink-0" />}
                    {!isChecking && result === true  && <CheckCircle2 size={11} className="text-green-500 shrink-0" />}
                    {!isChecking && result === false && <AlertTriangle size={11} className="text-red-400 shrink-0" />}
                    {/* Bouton vérifier individuel */}
                    {!isChecking && result === undefined && (
                      <button
                        onClick={() => checkOne(f.xmlUrl)}
                        className="opacity-30 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-500 dark:hover:text-blue-400"
                        title="Vérifier ce flux"
                      >
                        <Check size={11} />
                      </button>
                    )}
                    <a href={f.xmlUrl} target="_blank" rel="noopener noreferrer"
                      className="opacity-30 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-500 dark:hover:text-blue-400"
                      title="Ouvrir le flux RSS">
                      <ExternalLink size={11} />
                    </a>
                    <button
                      onClick={() => removeFeed(f.xmlUrl)}
                      className="opacity-30 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 dark:hover:text-red-400"
                      title="Supprimer ce flux"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Onglet Flux Reeder ───────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: 'Toutes les 2h (6h-22h)', value: '0 6-22/2 * * *' },
  { label: 'Quotidien à 06:00',      value: '0 6 * * *' },
  { label: 'Lundi à 06:00',          value: '0 6 * * 1' },
  { label: 'Dimanche à 06:00',       value: '0 6 * * 0' },
  { label: 'Toutes les heures',      value: '0 * * * *' },
]

function cronLabel(cron) {
  if (!cron) return ''
  const p = cron.trim().split(/\s+/)
  if (p.length !== 5) return cron
  const [min, hour, , , dow] = p
  const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
  if (min.startsWith('*/')) return `Toutes les ${min.slice(2)} min`
  if (min === '0' && hour.includes('/') && hour.includes('-')) {
    const [range, step] = hour.split('/')
    const [start, end] = range.split('-')
    return `Toutes les ${step}h de ${start}h à ${end}h`
  }
  if (min === '0' && /^\d+$/.test(hour)) {
    const t = `${String(hour).padStart(2, '0')}:00`
    if (dow === '*') return `Quotidien à ${t}`
    if (/^\d$/.test(dow)) return `${jours[parseInt(dow) % 7]} à ${t}`
  }
  return cron
}

function FluxTab() {
  const [sources, setSources] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    fetch('/api/flux-sources')
      .then(r => r.json())
      .then(d => { setSources(d); setLoading(false) })
      .catch(() => { setError('Impossible de charger les flux'); setLoading(false) })
  }, [])

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const r = await fetch('/api/flux-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sources),
      })
      if (!r.ok) throw new Error()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Erreur lors de la sauvegarde')
    } finally { setSaving(false) }
  }

  const add = () => setSources(s => [
    ...s,
    { title: '', url: '', scheduler: { cron: '0 6 * * 1', timeout: 60 } },
  ])

  const remove = (idx) => setSources(s => s.filter((_, i) => i !== idx))

  const updateField = (idx, field, value) =>
    setSources(s => s.map((src, i) => i === idx ? { ...src, [field]: value } : src))

  const updateScheduler = (idx, field, value) =>
    setSources(s => s.map((src, i) => i === idx
      ? { ...src, scheduler: { ...(src.scheduler || {}), [field]: value } }
      : src
    ))

  if (loading) return <Spinner />

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Barre d'outils */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200/50 dark:border-slate-700/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl shrink-0">
        <p className="text-xs text-slate-400 dark:text-slate-500 flex-1">
          Sources de flux JSON Reeder. Chaque flux est traité indépendamment avec son propre planning cron.
        </p>
        <button
          onClick={add}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-xs text-slate-700 dark:text-slate-300 transition-colors shrink-0"
        >
          <Plus size={12} /> Ajouter
        </button>
        <SaveButton saving={saving} saved={saved} onClick={save} />
      </div>

      <ErrorBanner message={error} />

      {/* Liste */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {!sources?.length ? (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500 text-sm">
            Aucun flux configuré.{' '}
            <button onClick={add} className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 underline">
              Ajouter le premier flux
            </button>
          </div>
        ) : sources.map((src, idx) => {
          const cron = src.scheduler?.cron || src.cron || ''
          const timeout = src.scheduler?.timeout ?? src.timeout ?? 60
          const label = cronLabel(cron)

          return (
            <div key={idx} className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
              {/* Titre + URL + Supprimer */}
              <div className="flex items-start gap-3">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium mb-1 block">
                      Titre du flux
                    </label>
                    <input
                      type="text"
                      value={src.title}
                      onChange={e => updateField(idx, 'title', e.target.value)}
                      placeholder="ex. Intelligence-artificielle"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium mb-1 block">
                      URL du flux JSON
                    </label>
                    <input
                      type="url"
                      value={src.url}
                      onChange={e => updateField(idx, 'url', e.target.value)}
                      placeholder="https://…/feed.json"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 font-mono focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>
                <button
                  onClick={() => remove(idx)}
                  className="mt-5 p-1.5 text-slate-400 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
                  title="Supprimer ce flux"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Planning + Timeout */}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium mb-1 block">
                    Planning (cron){label && <span className="text-slate-500 dark:text-slate-400 normal-case ml-2 font-normal">→ {label}</span>}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={cron}
                      onChange={e => updateScheduler(idx, 'cron', e.target.value)}
                      placeholder="0 6 * * 1"
                      className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm font-mono text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    <select
                      value=""
                      onChange={e => e.target.value && updateScheduler(idx, 'cron', e.target.value)}
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      <option value="">Préréglage…</option>
                      {CRON_PRESETS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="w-32 shrink-0">
                  <label className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium mb-1 block">
                    Timeout (s)
                  </label>
                  <input
                    type="number"
                    value={timeout}
                    onChange={e => updateScheduler(idx, 'timeout', parseInt(e.target.value) || 60)}
                    min={10}
                    max={600}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Onglet Quota ────────────────────────────────────────────────────────────

function QuotaBar({ count, limit, color = 'blue' }) {
  const pct = limit > 0 ? Math.min(100, Math.round(count / limit * 100)) : 0
  const colors = {
    blue:   'bg-blue-500 dark:bg-blue-400',
    amber:  'bg-amber-500 dark:bg-amber-400',
    rose:   'bg-rose-500 dark:bg-rose-400',
    green:  'bg-green-500 dark:bg-green-400',
    violet: 'bg-violet-500 dark:bg-violet-400',
  }
  const barColor = pct >= 90 ? colors.rose : pct >= 70 ? colors.amber : (colors[color] ?? colors.blue)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs tabular-nums w-20 text-right ${
        pct >= 90 ? 'text-rose-500 dark:text-rose-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
      }`}>
        {count} / {limit}
      </span>
      <span className="text-xs text-slate-400 dark:text-slate-500 w-9 text-right">{pct}%</span>
    </div>
  )
}

function QuotaTab() {
  const [config, setConfig]   = useState(null)
  const [stats, setStats]     = useState(null)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError]     = useState(null)

  const load = useCallback(async () => {
    try {
      const [cfgRes, statsRes] = await Promise.all([
        fetch('/api/quota/config'),
        fetch('/api/quota/stats'),
      ])
      const cfg   = await cfgRes.json()
      const st    = await statsRes.json()
      setConfig(cfg)
      setStats(st)
    } catch (e) {
      setError('Impossible de charger les données de quota.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/quota/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!window.confirm('Réinitialiser tous les compteurs de quota du jour ?')) return
    setResetting(true)
    try {
      await fetch('/api/quota/reset', { method: 'POST' })
      await load()
    } catch (e) {
      setError('Erreur lors de la réinitialisation.')
    } finally {
      setResetting(false)
    }
  }

  if (!config) return <Spinner />

  const allKeywords = stats?.keywords ?? {}
  const kwEntries = Object.entries(allKeywords).sort(
    ([, a], [, b]) => b.pct - a.pct
  )

  // Palette de couleurs pour les mots-clés
  const palette = ['blue', 'violet', 'green', 'amber', 'blue', 'violet', 'green']

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      <ErrorBanner message={error} />

      {/* ── En-tête + boutons ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700/50 shrink-0">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Régulation des quotas
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={resetting}
            title="Réinitialiser les compteurs du jour"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50"
          >
            <RotateCcw size={12} className={resetting ? 'animate-spin' : ''} />
            Réinitialiser
          </button>
          <SaveButton saving={saving} saved={saved} onClick={handleSave} />
        </div>
      </div>

      <div className="flex flex-col gap-6 px-5 py-5">

        {/* ── Activation ── */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Activer la régulation</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Limite le nombre d'articles importés et les appels à l'API EurIA</p>
          </div>
          <button
            onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
            className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
          >
            {config.enabled
              ? <ToggleRight size={28} className="text-blue-500 dark:text-blue-400" />
              : <ToggleLeft  size={28} />}
          </button>
        </div>

        {/* ── Plafonds ── */}
        {config.enabled && (
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Plafonds journaliers</p>

            {/* Global */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm text-slate-700 dark:text-slate-300">Plafond global</label>
                <span className="text-xs text-slate-400">articles / jour</span>
              </div>
              <input
                type="range" min="10" max="500" step="10"
                value={config.global_daily_limit}
                onChange={e => setConfig(c => ({ ...c, global_daily_limit: +e.target.value }))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-slate-400">
                <span>10</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">⬦ {config.global_daily_limit} articles</span>
                <span>500</span>
              </div>
            </div>

            {/* Par mot-clé */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm text-slate-700 dark:text-slate-300">Par mot-clé</label>
                <span className="text-xs text-slate-400">articles / mot-clé / jour</span>
              </div>
              <input
                type="range" min="1" max="100" step="1"
                value={config.per_keyword_daily_limit}
                onChange={e => setConfig(c => ({ ...c, per_keyword_daily_limit: +e.target.value }))}
                className="w-full accent-violet-500"
              />
              <div className="flex justify-between text-xs text-slate-400">
                <span>1</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">⬦ {config.per_keyword_daily_limit} articles</span>
                <span>100</span>
              </div>
            </div>

            {/* Par source */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm text-slate-700 dark:text-slate-300">Par source</label>
                <span className="text-xs text-slate-400">articles / source / mot-clé / jour</span>
              </div>
              <input
                type="range" min="1" max="20" step="1"
                value={config.per_source_daily_limit}
                onChange={e => setConfig(c => ({ ...c, per_source_daily_limit: +e.target.value }))}
                className="w-full accent-green-500"
              />
              <div className="flex justify-between text-xs text-slate-400">
                <span>1</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">⬦ {config.per_source_daily_limit} articles</span>
                <span>20</span>
              </div>
            </div>

            {/* Tri adaptatif */}
            <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50">
              <div>
                <p className="text-sm text-slate-700 dark:text-slate-300">Tri adaptatif</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Priorité aux mots-clés les moins consommés pour équilibrer la diversité
                </p>
              </div>
              <button
                onClick={() => setConfig(c => ({ ...c, adaptive_sorting: !c.adaptive_sorting }))}
                className="text-slate-400 hover:text-green-500 dark:hover:text-green-400 transition-colors"
              >
                {config.adaptive_sorting
                  ? <ToggleRight size={24} className="text-green-500 dark:text-green-400" />
                  : <ToggleLeft  size={24} />}
              </button>
            </div>
          </div>
        )}

        {/* ── Consommation du jour ── */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Consommation aujourd'hui — {stats?.date ?? '…'}
          </p>

          {/* Global */}
          {stats && (
            <div className="flex flex-col gap-1 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Global</span>
                {stats.global.exhausted && (
                  <span className="text-xs font-semibold text-rose-500 dark:text-rose-400 flex items-center gap-1">
                    <AlertTriangle size={10} /> Plafond atteint
                  </span>
                )}
              </div>
              <QuotaBar count={stats.global.count} limit={stats.global.limit} color="blue" />
            </div>
          )}

          {/* Par mot-clé */}
          {kwEntries.length > 0 ? (
            <div className="flex flex-col gap-2">
              {kwEntries.map(([kw, data], i) => (
                <div key={kw} className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate max-w-[60%]">{kw}</span>
                    {data.pct >= 100 && (
                      <span className="text-xs text-rose-500 dark:text-rose-400 font-semibold">Saturé</span>
                    )}
                  </div>
                  <QuotaBar count={data.total} limit={data.limit} color={palette[i % palette.length]} />
                  {Object.keys(data.sources ?? {}).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(data.sources).map(([src, info]) => (
                        <span
                          key={src}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                            info.saturated
                              ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {src} <span className="opacity-60">{info.count}/{info.limit}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic px-1">
              Aucun article importé aujourd'hui.
            </p>
          )}
        </div>

      </div>
    </div>
  )
}

// ─── Panneau principal Réglages ───────────────────────────────────────────────

const TABS = [
  { id: 'rss',       label: 'RSS',          Icon: Rss       },
  { id: 'scheduler', label: 'Planification', Icon: Clock     },
  { id: 'keywords',  label: 'Mots-clés',     Icon: Tag       },
  { id: 'flux',      label: 'Flux Reeder',   Icon: Database  },
  { id: 'quota',     label: 'Quota',         Icon: BarChart2 },
]

export default function SettingsPanel({ onClose }) {
  const [activeTab, setActiveTab] = useState('rss')
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center ${isMaximized ? 'items-stretch' : 'items-stretch md:items-start md:pt-10 md:px-4 md:pb-4'}`}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className={`bg-white/90 dark:bg-slate-800/90 backdrop-blur-2xl shadow-2xl w-full border border-white/40 dark:border-slate-700/50 flex flex-col overflow-hidden ${isMaximized ? '' : 'md:max-w-5xl md:max-h-[88vh] md:rounded-2xl'}`}>

        {/* ── En-tête / toolbar ── */}
        <div
          className="flex items-center gap-2 px-5 py-3 border-t border-white/30 dark:border-slate-700/50 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl md:border-t-0 md:border-b shrink-0 order-last md:order-first"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <Settings size={15} className="hidden md:block text-slate-400 dark:text-slate-400" />
          <h2 className="hidden md:block text-sm font-semibold text-slate-800 dark:text-slate-200 mr-3">Réglages</h2>

          {/* Onglets */}
          <div className="flex items-center gap-1 flex-1">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === id
                    ? 'bg-blue-600/20 text-blue-700 dark:text-blue-300 border border-blue-400/40 dark:border-blue-500/40'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsMaximized(m => !m)}
            title={isMaximized ? 'Réduire la fenêtre' : 'Agrandir à la taille de l\'écran'}
            className="hidden md:flex p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            aria-label={isMaximized ? 'Réduire' : 'Agrandir'}
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            aria-label="Fermer"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Contenu de l'onglet actif ── */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {activeTab === 'rss'       && <RssTab />}
          {activeTab === 'scheduler' && <SchedulerTab />}
          {activeTab === 'keywords'  && <KeywordsTab />}
          {activeTab === 'flux'      && <FluxTab />}
          {activeTab === 'quota'     && <QuotaTab />}
        </div>
      </div>
    </div>
  )
}
