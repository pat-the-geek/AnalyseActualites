import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Send, Save, Trash2, FileText, ChevronRight, Loader2, Terminal, RefreshCw, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * ChatbotPanel — Chatbot IA style terminal
 * Permet d'interroger les données data/ et rapports/ par IA.
 * Répond en Markdown, supporte les tableaux, et peut sauvegarder les réponses.
 */

// Suggestions de commandes rapides affichées dans l'interface
const QUICK_COMMANDS = [
  { label: 'Résumé des derniers articles',      text: 'Résume les articles récents du fichier de contexte en 5 points.' },
  { label: 'Tableau des entités',               text: 'Génère un tableau Markdown listant les entités (personnes, organisations, lieux) mentionnées dans les fichiers de contexte, avec leur nombre d\'occurrences.' },
  { label: 'Analyse des sentiments',            text: 'Analyse les sentiments et le ton éditorial des articles en contexte. Présente les résultats dans un tableau Markdown.' },
  { label: 'Tendances et sujets clés',          text: 'Quels sont les sujets et tendances clés qui ressortent des données en contexte ?' },
  { label: 'Rapport de synthèse',               text: 'Génère un rapport de synthèse complet au format Markdown, prêt à être sauvegardé, basé sur les fichiers de contexte.' },
]

// ── Composant principal ───────────────────────────────────────────────────────

export default function ChatbotPanel({ onClose, onFileSaved }) {
  const [messages, setMessages]         = useState([])
  const [input, setInput]               = useState('')
  const [streaming, setStreaming]       = useState(false)
  const [contextFiles, setContextFiles] = useState([])
  const [availableFiles, setAvailableFiles] = useState([])
  const [pickerOpen, setPickerOpen]     = useState(false)
  const [fileSearch, setFileSearch]     = useState('')
  const [saving, setSaving]             = useState(false)
  const [savedMsg, setSavedMsg]         = useState(null)

  const ctrlRef   = useRef(null)
  const endRef    = useRef(null)
  const inputRef  = useRef(null)

  // Auto-scroll vers le bas à chaque nouveau message
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Ferme le stream au démontage
  useEffect(() => {
    return () => ctrlRef.current?.abort()
  }, [])

  // Focus sur l'input à l'ouverture
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  // Charger la liste des fichiers disponibles pour le contexte
  useEffect(() => {
    fetch('/api/files')
      .then(r => r.ok ? r.json() : [])
      .then(d => setAvailableFiles(Array.isArray(d) ? d : (d.files || [])))
      .catch(() => {})
  }, [])

  // ── Envoi d'un message ────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text) => {
    const content = (text || input).trim()
    if (!content || streaming) return

    setInput('')

    const userMsg = { role: 'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setStreaming(true)

    // Placeholder pour la réponse IA en cours
    const assistantIdx = newMessages.length
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }])

    const ctrl = new AbortController()
    ctrlRef.current = ctrl

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          context_files: contextFiles,
        }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        const err = await res.text()
        setMessages(prev => {
          const updated = [...prev]
          updated[assistantIdx] = { role: 'assistant', content: `⚠ Erreur serveur : ${err}`, streaming: false, error: true }
          return updated
        })
        return
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let accumulated = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()

        for (const line of lines) {
          if (!line.trim()) continue
          let raw = ''
          if (line.startsWith('data: ')) raw = line.slice(6).trim()
          else raw = line.trim()

          if (raw === '[DONE]') break
          if (!raw) continue

          try {
            const parsed = JSON.parse(raw)
            if (parsed.error) {
              accumulated += `\n⚠ ${parsed.error}`
            } else {
              const chunk = parsed.choices?.[0]?.delta?.content ?? ''
              accumulated += chunk
            }
            // Mettre à jour en temps réel
            setMessages(prev => {
              const updated = [...prev]
              updated[assistantIdx] = { role: 'assistant', content: accumulated, streaming: true }
              return updated
            })
          } catch (e) { /* ligne SSE non-JSON (ex: ping, commentaire), ignorer */ }
        }
      }

      // Finaliser le message IA
      setMessages(prev => {
        const updated = [...prev]
        updated[assistantIdx] = { role: 'assistant', content: accumulated, streaming: false }
        return updated
      })
    } catch (e) {
      if (e.name !== 'AbortError') {
        setMessages(prev => {
          const updated = [...prev]
          updated[assistantIdx] = { role: 'assistant', content: `⚠ ${e.message}`, streaming: false, error: true }
          return updated
        })
      }
    } finally {
      setStreaming(false)
    }
  }, [input, messages, streaming, contextFiles])

  // ── Sauvegarde en Markdown ────────────────────────────────────────────────

  const saveConversation = async () => {
    if (saving || messages.length === 0) return
    setSaving(true)
    setSavedMsg(null)

    // Construire le contenu Markdown de la conversation
    const now = new Date()
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

    let md = `# Conversation WUDD.ai — ${dateStr} à ${timeStr}\n\n`
    if (contextFiles.length > 0) {
      md += `**Fichiers de contexte :** ${contextFiles.join(', ')}\n\n`
      md += '---\n\n'
    }
    for (const msg of messages) {
      if (msg.role === 'user') {
        md += `## 💬 Question\n\n${msg.content}\n\n`
      } else if (msg.role === 'assistant') {
        md += `## 🤖 Réponse IA\n\n${msg.content}\n\n`
      }
      md += '---\n\n'
    }

    try {
      const res = await fetch('/api/chat/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: md, filename: 'chatbot' }),
      })
      const data = await res.json()
      if (data.ok) {
        setSavedMsg(data.path)
        onFileSaved?.()
      } else {
        setSavedMsg(`Erreur : ${data.error}`)
      }
    } catch (e) {
      setSavedMsg(`Erreur : ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Sauvegarde d'un seul message IA ────────────────────────────────────────

  const saveMessage = async (content) => {
    if (!content) return
    setSaving(true)
    setSavedMsg(null)
    try {
      const res = await fetch('/api/chat/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, filename: 'reponse_ia' }),
      })
      const data = await res.json()
      if (data.ok) {
        setSavedMsg(data.path)
        onFileSaved?.()
      } else {
        setSavedMsg(`Erreur : ${data.error}`)
      }
    } catch (e) {
      setSavedMsg(`Erreur : ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Gestion du picker de fichiers de contexte ─────────────────────────────

  const toggleContextFile = (path) => {
    setContextFiles(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    )
  }

  const filteredFiles = availableFiles.filter(f =>
    !fileSearch || f.path.toLowerCase().includes(fileSearch.toLowerCase()) ||
    (f.flux || '').toLowerCase().includes(fileSearch.toLowerCase())
  )

  // ── Rendu d'un message ────────────────────────────────────────────────────

  const renderMessage = (msg, idx) => {
    const isUser      = msg.role === 'user'
    const isStreaming = msg.streaming

    return (
      <div key={idx} className={`mb-4 ${isUser ? 'pl-0' : 'pl-0'}`}>
        {isUser ? (
          /* Message utilisateur */
          <div className="flex items-start gap-2">
            <span className="text-amber-400 font-mono text-xs mt-0.5 shrink-0 select-none">$&gt;</span>
            <span className="text-amber-200 font-mono text-sm break-words leading-relaxed">{msg.content}</span>
          </div>
        ) : (
          /* Réponse IA */
          <div className="group">
            <div className="flex items-start gap-2 mb-1">
              <span className="text-green-500 font-mono text-xs mt-0.5 shrink-0 select-none">
                {isStreaming ? '▋' : '◆'}
              </span>
              <div className="flex-1 min-w-0">
                {msg.error ? (
                  <span className="text-red-400 font-mono text-sm">{msg.content}</span>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none text-green-300 chat-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content + (isStreaming ? '▌' : '')}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
            {/* Bouton sauvegarder ce message */}
            {!isStreaming && !msg.error && msg.content && (
              <div className="flex items-center gap-2 pl-4 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => saveMessage(msg.content)}
                  className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-green-400 transition-colors font-mono"
                  title="Sauvegarder cette réponse en Markdown"
                >
                  <Save size={10} />
                  sauvegarder
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Rendu principal ───────────────────────────────────────────────────────

  return (
    <>
      {/* Fond semi-transparent */}
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80]" onClick={onClose} />

      {/* Panneau principal */}
      <div className="fixed inset-0 z-[81] flex items-stretch md:items-center justify-center md:p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full md:max-w-5xl flex flex-col md:rounded-2xl overflow-hidden shadow-2xl border border-green-900/40"
          style={{
            maxHeight: '92vh',
            background: '#0d1117',
          }}
        >
          {/* ── En-tête ─────────────────────────────────────────────── */}
          <div
            className="flex items-center gap-2 px-4 py-2.5 shrink-0 border-b border-green-900/40"
            style={{ background: '#161b22' }}
          >
            <Terminal size={14} className="text-green-500 shrink-0" />
            <span className="font-mono text-sm text-green-400 flex-1 tracking-wider">
              WUDD.ai ▸ Terminal IA
              <span className="animate-pulse ml-1 text-green-500">█</span>
            </span>
            {/* Indicateur de fichiers de contexte */}
            {contextFiles.length > 0 && (
              <span className="font-mono text-[10px] text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded">
                {contextFiles.length} fichier{contextFiles.length > 1 ? 's' : ''} en contexte
              </span>
            )}
            {/* Bouton fermer */}
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors ml-1"
            >
              <X size={12} />
            </button>
          </div>

          {/* ── Corps : sidebar contexte + zone chat ────────────────── */}
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* Sidebar sélection de fichiers (desktop) */}
            <div
              className="hidden lg:flex flex-col w-64 shrink-0 border-r border-green-900/30 overflow-hidden"
              style={{ background: '#0d1117' }}
            >
              <div className="px-3 py-2 border-b border-green-900/30">
                <div className="flex items-center gap-1.5 mb-2">
                  <FileText size={11} className="text-green-600" />
                  <span className="font-mono text-[11px] text-green-600 uppercase tracking-widest">Contexte</span>
                </div>
                <input
                  type="text"
                  placeholder="Filtrer…"
                  value={fileSearch}
                  onChange={e => setFileSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-green-900/40 rounded px-2 py-1 text-[11px] font-mono text-green-400 placeholder:text-slate-600 focus:outline-none focus:border-green-600"
                />
              </div>
              <div className="flex-1 overflow-y-auto py-1 px-1 custom-scrollbar">
                {filteredFiles.length === 0 ? (
                  <p className="text-[10px] font-mono text-slate-600 px-2 py-2">Aucun fichier disponible</p>
                ) : (
                  filteredFiles.map(f => (
                    <button
                      key={f.path}
                      onClick={() => toggleContextFile(f.path)}
                      className={`w-full text-left px-2 py-1 rounded text-[10px] font-mono transition-colors flex items-start gap-1.5 ${
                        contextFiles.includes(f.path)
                          ? 'bg-green-900/40 text-green-300'
                          : 'text-slate-500 hover:text-green-400 hover:bg-slate-800/50'
                      }`}
                    >
                      <span className="mt-0.5 shrink-0 text-green-700">
                        {contextFiles.includes(f.path) ? '■' : '□'}
                      </span>
                      <span className="truncate leading-tight">{f.name}</span>
                    </button>
                  ))
                )}
              </div>
              {/* Actions contexte */}
              {contextFiles.length > 0 && (
                <div className="px-2 py-2 border-t border-green-900/30">
                  <button
                    onClick={() => setContextFiles([])}
                    className="w-full text-[10px] font-mono text-slate-600 hover:text-red-400 transition-colors text-left flex items-center gap-1"
                  >
                    <Trash2 size={9} />
                    Vider le contexte
                  </button>
                </div>
              )}
            </div>

            {/* Zone principale : chat + input */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

              {/* ── Zone de chat ─────────────────────────────────────── */}
              <div
                className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar"
                style={{ background: '#0d1117' }}
              >
                {/* Message de bienvenue */}
                {messages.length === 0 && (
                  <div className="mb-6">
                    <p className="font-mono text-xs text-green-600 mb-1">
                      WUDD.ai Terminal IA — prêt.
                    </p>
                    <p className="font-mono text-xs text-slate-600 mb-4">
                      Interrogez vos articles et rapports. Sélectionnez des fichiers comme contexte dans la barre latérale.
                    </p>
                    {/* Fichiers de contexte sur mobile */}
                    <div className="lg:hidden mb-4">
                      <button
                        onClick={() => setPickerOpen(v => !v)}
                        className="inline-flex items-center gap-1.5 text-xs font-mono text-green-600 hover:text-green-400 border border-green-900/40 rounded px-2 py-1 transition-colors"
                      >
                        <FileText size={11} />
                        {contextFiles.length > 0
                          ? `${contextFiles.length} fichier${contextFiles.length > 1 ? 's' : ''} en contexte`
                          : 'Ajouter contexte'}
                      </button>
                      {pickerOpen && (
                        <div className="mt-2 border border-green-900/30 rounded p-2 max-h-40 overflow-y-auto">
                          <input
                            type="text"
                            placeholder="Filtrer…"
                            value={fileSearch}
                            onChange={e => setFileSearch(e.target.value)}
                            className="w-full bg-slate-900 border border-green-900/40 rounded px-2 py-1 text-[11px] font-mono text-green-400 placeholder:text-slate-600 focus:outline-none focus:border-green-600 mb-2"
                          />
                          {filteredFiles.map(f => (
                            <button
                              key={f.path}
                              onClick={() => toggleContextFile(f.path)}
                              className={`w-full text-left px-1 py-0.5 text-[10px] font-mono flex items-center gap-1.5 ${
                                contextFiles.includes(f.path) ? 'text-green-300' : 'text-slate-500 hover:text-green-400'
                              }`}
                            >
                              <span>{contextFiles.includes(f.path) ? '■' : '□'}</span>
                              <span className="truncate">{f.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Commandes rapides */}
                    <div className="space-y-1">
                      <p className="font-mono text-[10px] text-slate-600 uppercase tracking-widest mb-2">
                        Commandes rapides
                      </p>
                      {QUICK_COMMANDS.map((cmd, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(cmd.text)}
                          disabled={streaming}
                          className="block w-full text-left font-mono text-xs text-slate-500 hover:text-green-400 hover:bg-slate-800/40 px-2 py-1 rounded transition-colors disabled:opacity-40"
                        >
                          <ChevronRight size={10} className="inline mr-1 text-green-700" />
                          {cmd.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages */}
                {messages.map((msg, idx) => renderMessage(msg, idx))}
                <div ref={endRef} />
              </div>

              {/* ── Zone de saisie ───────────────────────────────────── */}
              <div
                className="shrink-0 border-t border-green-900/30 px-3 py-2"
                style={{
                  background: '#161b22',
                  paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
                }}
              >
                {/* Statut sauvegarde */}
                {savedMsg && (
                  <div className="flex items-center gap-1.5 mb-1.5 font-mono text-[10px]">
                    {savedMsg.startsWith('Erreur') ? (
                      <span className="text-red-400">{savedMsg}</span>
                    ) : (
                      <span className="text-green-500 flex items-center gap-1">
                        <Check size={10} />
                        Sauvegardé : {savedMsg}
                      </span>
                    )}
                  </div>
                )}

                {/* Saisie */}
                <div className="flex items-end gap-2">
                  <span className="font-mono text-sm text-amber-500 shrink-0 pb-1.5 select-none">▸</span>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                    rows={1}
                    placeholder="Posez votre question… (Shift+Entrée pour un saut de ligne)"
                    disabled={streaming}
                    className="flex-1 bg-transparent border-none resize-none font-mono text-sm text-amber-200 placeholder:text-slate-600 focus:outline-none leading-relaxed"
                    style={{ minHeight: '1.75rem', maxHeight: '8rem', overflow: 'auto' }}
                  />
                  <div className="flex items-center gap-1.5 shrink-0 pb-0.5">
                    {/* Effacer la conversation */}
                    {messages.length > 0 && (
                      <button
                        onClick={() => { ctrlRef.current?.abort(); setMessages([]); setSavedMsg(null) }}
                        title="Effacer la conversation"
                        className="w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:text-red-400 transition-colors"
                      >
                        <RefreshCw size={13} />
                      </button>
                    )}
                    {/* Sauvegarder la conversation */}
                    {messages.length > 0 && (
                      <button
                        onClick={saveConversation}
                        disabled={saving}
                        title="Sauvegarder la conversation en Markdown"
                        className="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:text-green-400 transition-colors disabled:opacity-40"
                      >
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      </button>
                    )}
                    {/* Envoyer */}
                    <button
                      onClick={() => sendMessage()}
                      disabled={!input.trim() || streaming}
                      className="w-7 h-7 rounded bg-green-800 hover:bg-green-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-green-200 transition-colors"
                    >
                      {streaming ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
