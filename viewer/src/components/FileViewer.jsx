import { Download, FileJson, FileText, Calendar, HardDrive, ChevronRight } from 'lucide-react'
import JsonViewer from './JsonViewer'
import MarkdownViewer from './MarkdownViewer'

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

export default function FileViewer({ file, content, loading, onDownload }) {
  if (!file) {
    return (
      <main className="flex-1 flex items-center justify-center bg-slate-900 select-none">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4 border border-slate-700">
            <FileText size={28} className="text-slate-600" />
          </div>
          <p className="text-slate-400 font-medium mb-1">Aucun fichier sélectionné</p>
          <p className="text-slate-600 text-sm">Choisissez un fichier dans la liste de gauche</p>
        </div>
      </main>
    )
  }

  const pathParts = file.path.split('/')

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-slate-900">
      {/* ── Barre de fichier ── */}
      <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-800/70 border-b border-slate-700 shrink-0">
        {/* Fil d'Ariane */}
        <div className="flex items-center gap-0.5 min-w-0 flex-1 text-xs text-slate-500 overflow-hidden">
          {pathParts.map((part, i) => (
            <span key={i} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && <ChevronRight size={10} className="text-slate-700" />}
              <span className={i === pathParts.length - 1 ? 'text-slate-300 font-medium' : ''}>
                {part}
              </span>
            </span>
          ))}
        </div>

        {/* Méta */}
        <div className="hidden lg:flex items-center gap-4 text-xs text-slate-500 shrink-0">
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
              ? 'bg-amber-900/40 text-amber-400'
              : 'bg-blue-900/40 text-blue-400'
          }`}>
            {file.type === 'json' ? 'JSON' : 'Markdown'}
          </span>
        </div>

        {/* Bouton télécharger */}
        <button
          onClick={onDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors shrink-0"
        >
          <Download size={12} />
          Télécharger
        </button>
      </div>

      {/* ── Contenu ── */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
            <div className="w-5 h-5 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-sm">Chargement…</span>
          </div>
        ) : content === null ? (
          <div className="text-slate-500 text-sm">Contenu indisponible</div>
        ) : file.type === 'json' ? (
          <div className="bg-slate-950 rounded-xl p-6 border border-slate-800/60 overflow-auto">
            <JsonViewer content={content} />
          </div>
        ) : (
          <MarkdownViewer content={content} />
        )}
      </div>
    </main>
  )
}
