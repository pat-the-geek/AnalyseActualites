import { useState, useEffect, useRef } from 'react'
import { X, Terminal, Play, Loader2 } from 'lucide-react'

/**
 * ScriptConsolePanel — fenêtre modale console pour lancer get-keyword-from-rss.py
 * en tâche de fond avec affichage des logs en streaming SSE.
 */
export default function ScriptConsolePanel({ onClose, onDone }) {
  const [logs, setLogs]           = useState([])
  const [running, setRunning]     = useState(false)
  const [done, setDone]           = useState(false)
  const [returnCode, setReturnCode] = useState(null)
  const ctrlRef = useRef(null)
  const endRef  = useRef(null)

  // Auto-scroll vers le bas quand de nouveaux logs arrivent
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Annulation du stream au démontage
  useEffect(() => {
    return () => ctrlRef.current?.abort()
  }, [])

  const startScript = async () => {
    if (running) return
    setLogs([])
    setDone(false)
    setReturnCode(null)
    setRunning(true)

    const ctrl = new AbortController()
    ctrlRef.current = ctrl

    try {
      const res = await fetch('/api/scripts/keyword-rss/stream', { signal: ctrl.signal })
      if (!res.ok) {
        setLogs([{ type: 'error', text: `Erreur serveur ${res.status}` }])
        setRunning(false)
        return
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { value, done: streamDone } = await reader.read()
        if (streamDone) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          try {
            const parsed = JSON.parse(raw)
            if (parsed.error) {
              setLogs(prev => [...prev, { type: 'error', text: parsed.error }])
            } else if (parsed.log) {
              setLogs(prev => [...prev, { type: parsed.done ? 'done' : 'log', text: parsed.log }])
            }
            if (parsed.done) {
              setDone(true)
              setReturnCode(parsed.returncode ?? null)
              setRunning(false)
              if (parsed.returncode === 0) onDone?.()
            }
          } catch { /* ligne non JSON, ignorer */ }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setLogs(prev => [...prev, { type: 'error', text: e.message }])
      }
    } finally {
      setRunning(false)
    }
  }

  const handleClose = () => {
    ctrlRef.current?.abort()
    onClose()
  }

  return (
    <>
      {/* Fond semi-transparent */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70]"
        onClick={handleClose}
      />

      {/* Fenêtre console */}
      <div className="fixed inset-0 z-[71] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl bg-slate-950 rounded-2xl shadow-2xl flex flex-col border border-slate-700/80"
             style={{ maxHeight: '75vh' }}>

          {/* En-tête */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700 shrink-0">
            <Terminal size={14} className="text-green-400 shrink-0" />
            <span className="text-sm font-medium text-slate-100 flex-1">
              Extraction mots-clés RSS
            </span>
            {running && (
              <span className="flex items-center gap-1.5 text-xs text-green-400">
                <Loader2 size={11} className="animate-spin" />
                En cours…
              </span>
            )}
            {done && returnCode === 0 && (
              <span className="text-xs text-emerald-400 font-medium">✓ Terminé</span>
            )}
            {done && returnCode !== 0 && returnCode !== null && (
              <span className="text-xs text-red-400 font-medium">✗ Erreur (code {returnCode})</span>
            )}
            <button
              onClick={handleClose}
              className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors ml-2"
            >
              <X size={13} />
            </button>
          </div>

          {/* Zone console */}
          <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-5 min-h-[200px]">
            {logs.length === 0 && !running && (
              <p className="text-slate-600 select-none">
                Cliquez sur "Démarrer" pour lancer l'extraction des mots-clés depuis les flux RSS.
              </p>
            )}
            {logs.map((entry, i) => (
              <div
                key={i}
                className={
                  entry.type === 'error' ? 'text-red-400' :
                  entry.type === 'done'  ? 'text-cyan-300 font-semibold mt-1' :
                  'text-green-300'
                }
              >
                {entry.text}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {/* Pied de fenêtre */}
          <div className="px-4 py-3 border-t border-slate-700 shrink-0 flex items-center gap-3">
            <button
              onClick={startScript}
              disabled={running}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
            >
              <Play size={11} />
              {done ? 'Relancer' : 'Démarrer'}
            </button>
            <span className="text-xs text-slate-600 font-mono">
              scripts/get-keyword-from-rss.py
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
