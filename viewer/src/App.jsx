import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import FileViewer from './components/FileViewer'
import SearchOverlay from './components/SearchOverlay'
import SettingsPanel from './components/SettingsPanel'
import { Search, Settings, Sun, Moon, Monitor } from 'lucide-react'

const THEME_OPTIONS = [
  { key: 'jour', Icon: Sun,     title: 'Jour' },
  { key: 'auto', Icon: Monitor, title: 'Automatique' },
  { key: 'nuit', Icon: Moon,    title: 'Nuit' },
]

function applyTheme(theme) {
  const html = document.documentElement
  if (theme === 'nuit') {
    html.classList.add('dark')
  } else if (theme === 'jour') {
    html.classList.remove('dark')
  } else {
    html.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches)
  }
}

export default function App() {
  const [files, setFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileContent, setFileContent] = useState(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')
  const [nameSearch, setNameSearch] = useState('')

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
  useEffect(() => {
    fetch('/api/files')
      .then(r => r.json())
      .then(setFiles)
      .catch(console.error)
  }, [])

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
    fetch(`/api/content?path=${encodeURIComponent(file.path)}`)
      .then(r => r.json())
      .then(data => {
        setFileContent(data.content)
        setContentLoading(false)
      })
      .catch(() => setContentLoading(false))
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

  const filteredFiles = files.filter(f => {
    if (typeFilter !== 'all' && f.type !== typeFilter) return false
    if (nameSearch && !f.name.toLowerCase().includes(nameSearch.toLowerCase())) return false
    return true
  })

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* ── Barre de navigation ── */}
      <header className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-500 rounded-md flex items-center justify-center text-xs font-bold text-white select-none">
            W
          </div>
          <span className="font-semibold text-slate-900 dark:text-slate-100">WUDD.ai</span>
          <span className="text-slate-400 dark:text-slate-500 text-sm">/ Explorateur</span>
        </div>

        <div className="flex-1" />

        {/* Sélecteur de thème */}
        <div
          className="flex items-center rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden shrink-0"
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

        {/* Réglages */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          title="Réglages — planification, mots-clés, flux"
        >
          <Settings size={13} />
          <span className="hidden sm:inline">Réglages</span>
        </button>

        {/* Recherche plein texte */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <Search size={13} />
          <span className="hidden sm:inline">Recherche plein texte</span>
          <kbd className="hidden md:inline-flex items-center gap-0.5 ml-1 text-xs bg-slate-200 dark:bg-slate-900 text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700">
            Ctrl K
          </kbd>
        </button>
      </header>

      {/* ── Corps principal ── */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          files={filteredFiles}
          selectedFile={selectedFile}
          onSelect={selectFile}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          nameSearch={nameSearch}
          onNameSearchChange={setNameSearch}
        />
        <FileViewer
          file={selectedFile}
          content={fileContent}
          loading={contentLoading}
          onDownload={downloadFile}
          onContentSaved={saveContent}
        />
      </div>

      {/* ── Overlays ── */}
      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          onSelect={(file) => { selectFile(file); setSearchOpen(false) }}
        />
      )}
      {settingsOpen && (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  )
}
