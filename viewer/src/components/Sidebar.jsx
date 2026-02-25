import { Search, FileJson, FileText, X, Folder } from 'lucide-react'
import { useMemo } from 'react'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

function formatDate(timestamp) {
  return new Date(timestamp * 1000).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })
}

export default function Sidebar({
  files, selectedFile, onSelect,
  typeFilter, onTypeFilterChange,
  nameSearch, onNameSearchChange,
}) {
  // Grouper par flux
  const grouped = useMemo(() => {
    const groups = {}
    files.forEach(f => {
      const key = f.flux || 'Racine'
      if (!groups[key]) groups[key] = []
      groups[key].push(f)
    })
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [files])

  return (
    <aside className="w-72 flex flex-col bg-slate-800 border-r border-slate-700 shrink-0">
      {/* ── Filtres ── */}
      <div className="p-3 border-b border-slate-700 space-y-2.5">
        {/* Boutons type */}
        <div className="flex gap-1">
          {[
            { key: 'all', label: 'Tous' },
            { key: 'json', label: 'JSON' },
            { key: 'markdown', label: 'Markdown' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onTypeFilterChange(key)}
              className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                typeFilter === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Recherche par nom */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={nameSearch}
            onChange={e => onNameSearchChange(e.target.value)}
            placeholder="Filtrer par nom…"
            className="w-full pl-8 pr-7 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          {nameSearch && (
            <button
              onClick={() => onNameSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="text-xs text-slate-600">
          {files.length} fichier{files.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Liste des fichiers ── */}
      <div className="flex-1 overflow-y-auto">
        {grouped.map(([flux, fluxFiles]) => (
          <div key={flux}>
            {/* En-tête de groupe */}
            <div className="sticky top-0 z-10 bg-slate-800/95 px-3 py-1.5 flex items-center gap-1.5 border-b border-slate-700/60 backdrop-blur-sm">
              <Folder size={11} className="text-slate-500" />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider truncate">
                {flux}
              </span>
              <span className="ml-auto text-xs text-slate-700 shrink-0">{fluxFiles.length}</span>
            </div>

            {/* Items */}
            {fluxFiles.map(file => {
              const isSelected = selectedFile?.path === file.path
              return (
                <button
                  key={file.path}
                  onClick={() => onSelect(file)}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 border-b border-slate-700/30 transition-colors ${
                    isSelected
                      ? 'bg-blue-600/20 border-l-2 border-l-blue-500 pl-[10px]'
                      : 'hover:bg-slate-700/50'
                  }`}
                >
                  {file.type === 'json'
                    ? <FileJson size={14} className="shrink-0 mt-0.5 text-amber-400" />
                    : <FileText size={14} className="shrink-0 mt-0.5 text-blue-400" />
                  }
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-200 truncate leading-snug">
                      {file.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-1.5 rounded font-mono leading-4 ${
                        file.type === 'json'
                          ? 'bg-amber-900/40 text-amber-400'
                          : 'bg-blue-900/40 text-blue-400'
                      }`}>
                        {file.type === 'json' ? 'JSON' : 'MD'}
                      </span>
                      <span className="text-[10px] text-slate-500">{formatSize(file.size)}</span>
                      <span className="text-[10px] text-slate-600 ml-auto">{formatDate(file.modified)}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ))}

        {files.length === 0 && (
          <div className="p-8 text-center text-slate-500 text-sm">
            Aucun fichier trouvé
          </div>
        )}
      </div>
    </aside>
  )
}
