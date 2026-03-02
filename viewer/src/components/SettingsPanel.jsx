import { useEffect, useState, useCallback } from 'react'
import {
  X, Settings, Clock, Tag, Rss, Plus, Trash2, RefreshCw,
  CheckCircle2, HelpCircle, Calendar, Check, AlertTriangle, Save,
  Maximize2, Minimize2,
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
      .then(d => { setKeywords(d); setLoading(false) })
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
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
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

// ─── Onglet Flux Reeder ───────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: 'Quotidien à 01:00',  value: '0 1 * * *' },
  { label: 'Quotidien à 06:00',  value: '0 6 * * *' },
  { label: 'Lundi à 06:00',      value: '0 6 * * 1' },
  { label: 'Dimanche à 06:00',   value: '0 6 * * 0' },
  { label: 'Toutes les heures',  value: '0 * * * *' },
]

function cronLabel(cron) {
  if (!cron) return ''
  const p = cron.trim().split(/\s+/)
  if (p.length !== 5) return cron
  const [min, hour, , , dow] = p
  const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
  if (min.startsWith('*/')) return `Toutes les ${min.slice(2)} min`
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
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
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

// ─── Panneau principal Réglages ───────────────────────────────────────────────

const TABS = [
  { id: 'scheduler', label: 'Planification', Icon: Clock },
  { id: 'keywords',  label: 'Mots-clés',     Icon: Tag  },
  { id: 'flux',      label: 'Flux Reeder',   Icon: Rss  },
]

export default function SettingsPanel({ onClose }) {
  const [activeTab, setActiveTab] = useState('scheduler')
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center ${isMaximized ? 'items-stretch' : 'items-start pt-10 px-4 pb-4'}`}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className={`bg-white dark:bg-slate-800 shadow-2xl w-full border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden ${isMaximized ? '' : 'max-w-5xl max-h-[88vh] rounded-2xl'}`}>

        {/* ── En-tête ── */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <Settings size={15} className="text-slate-400 dark:text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mr-3">Réglages</h2>

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
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
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
          {activeTab === 'scheduler' && <SchedulerTab />}
          {activeTab === 'keywords'  && <KeywordsTab />}
          {activeTab === 'flux'      && <FluxTab />}
        </div>
      </div>
    </div>
  )
}
