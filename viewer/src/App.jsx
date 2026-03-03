import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import FileViewer from './components/FileViewer'
import SearchOverlay from './components/SearchOverlay'
import SettingsPanel from './components/SettingsPanel'
import EntitySearchModal from './components/EntitySearchModal'
import EntityDashboard from './components/EntityDashboard'
import ScriptConsolePanel from './components/ScriptConsolePanel'
import { Search, Settings, Sun, Moon, Monitor, BarChart2, Terminal, Menu } from 'lucide-react'
import wuddLogo from './assets/wudd-prism-floyd.svg'

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
  const [sidebarOpen, setSidebarOpen]     = useState(() => window.innerWidth >= 768)

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
    fetch('/api/files')
      .then(r => r.json())
      .then(setFiles)
      .catch(console.error)
  }, [])

  useEffect(() => { refreshFiles() }, [refreshFiles])

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
    if (window.innerWidth < 768) setSidebarOpen(false)
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
      <header className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
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
          <span className="hidden sm:inline text-slate-400 dark:text-slate-500 text-sm">/ Explorateur</span>
        </div>

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
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          title="Lancer l'extraction des mots-clés RSS"
        >
          <Terminal size={13} />
          <span className="hidden sm:inline">Mots-clés RSS</span>
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
        />
        <FileViewer
          file={selectedFile}
          content={fileContent}
          loading={contentLoading}
          onDownload={downloadFile}
          onContentSaved={saveContent}
          onEntitySearch={(value, type) => setEntitySearch({ value, type })}
          onDelete={deleteFile}
        />
      </div>

      {/* ── Barre de navigation bas — mobile uniquement ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 z-50 flex items-stretch"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Sélecteur de thème */}
        <div className="flex items-center justify-center px-2 border-r border-slate-200 dark:border-slate-700">
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
            {THEME_OPTIONS.map(({ key, Icon, title }) => (
              <button
                key={key}
                onClick={() => setTheme(key)}
                title={title}
                className={`px-2 py-1.5 transition-colors ${
                  theme === key
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Icon size={13} />
              </button>
            ))}
          </div>
        </div>
        {/* Console RSS */}
        <button
          onClick={() => setConsoleOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-700 transition-colors"
        >
          <Terminal size={18} />
          <span className="text-[10px]">RSS</span>
        </button>
        {/* Dashboard entités */}
        <button
          onClick={() => setDashboardOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-700 transition-colors"
        >
          <BarChart2 size={18} />
          <span className="text-[10px]">Entités</span>
        </button>
        {/* Réglages */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-700 transition-colors"
        >
          <Settings size={18} />
          <span className="text-[10px]">Réglages</span>
        </button>
        {/* Recherche */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-700 transition-colors"
        >
          <Search size={18} />
          <span className="text-[10px]">Recherche</span>
        </button>
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
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
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
