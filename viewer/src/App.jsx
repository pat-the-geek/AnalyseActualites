import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import FileViewer from './components/FileViewer'
import SearchOverlay from './components/SearchOverlay'
import SchedulerPanel from './components/SchedulerPanel'
import { Search, CalendarClock } from 'lucide-react'

export default function App() {
  const [files, setFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileContent, setFileContent] = useState(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [schedulerOpen, setSchedulerOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')
  const [nameSearch, setNameSearch] = useState('')

  // Charger la liste des fichiers au démarrage
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

  const filteredFiles = files.filter(f => {
    if (typeFilter !== 'all' && f.type !== typeFilter) return false
    if (nameSearch && !f.name.toLowerCase().includes(nameSearch.toLowerCase())) return false
    return true
  })

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-slate-100 overflow-hidden">
      {/* ── Barre de navigation ── */}
      <header className="flex items-center gap-3 px-4 py-2.5 bg-slate-800 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-500 rounded-md flex items-center justify-center text-xs font-bold text-white select-none">
            W
          </div>
          <span className="font-semibold text-slate-100">WUDD.ai</span>
          <span className="text-slate-500 text-sm">/ Explorateur</span>
        </div>

        <div className="flex-1" />

        {/* Planification */}
        <button
          onClick={() => setSchedulerOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
          title="Voir la planification des tâches"
        >
          <CalendarClock size={13} />
          <span className="hidden sm:inline">Planification</span>
        </button>

        {/* Recherche plein texte */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Search size={13} />
          <span className="hidden sm:inline">Recherche plein texte</span>
          <kbd className="hidden md:inline-flex items-center gap-0.5 ml-1 text-xs bg-slate-900 text-slate-500 px-1.5 py-0.5 rounded border border-slate-700">
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
        />
      </div>

      {/* ── Overlays ── */}
      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          onSelect={(file) => { selectFile(file); setSearchOpen(false) }}
        />
      )}
      {schedulerOpen && (
        <SchedulerPanel onClose={() => setSchedulerOpen(false)} />
      )}
    </div>
  )
}
