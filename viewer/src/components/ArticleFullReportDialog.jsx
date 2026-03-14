/**
 * ArticleFullReportDialog — génère et affiche un rapport complet d'un article.
 *
 * - Modal centré 80 % × 88 % (bascule plein écran via bouton)
 * - Bande d'avatars d'entités en en-tête (Option 6A)
 * - Image principale de l'article sous les avatars
 * - Corps en Markdown streamé (SSE) avec surlignage d'entités (Option 5B)
 *   et diagrammes Mermaid générés par l'IA (Option M1)
 * - Actions : copier, télécharger .md, imprimer/PDF, régénérer, plein écran, fermer
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Maximize2, Minimize2, Copy, Download, Printer,
  RefreshCw, FileText, Check, Terminal,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import mermaid from 'mermaid'
import EntityHighlighter from './EntityHighlighter'

mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' })

// ── Mermaid block ─────────────────────────────────────────────────────────────

/** Nettoie le code Mermaid avant rendu (artifacts markdown fréquents) */
function sanitizeMermaidCode(raw) {
  return raw
    .replace(/^```mermaid\s*/i, '')   // backticks résiduels (début)
    .replace(/```\s*$/,         '')   // backticks résiduels (fin)
    .replace(/&amp;/g,          '&')  // entités HTML
    .replace(/&lt;/g,           '<')
    .replace(/&gt;/g,           '>')
    .replace(/\r\n/g,           '\n') // CRLF → LF
    .trim()
}

function MermaidBlock({ code, isStreaming }) {
  const containerRef = useRef(null)
  const id           = useRef(`mermaid-rpt-${Math.random().toString(36).slice(2)}`)
  const [errMsg,   setErrMsg]   = useState(null)
  const [rendered, setRendered] = useState(false)

  const clean = sanitizeMermaidCode(code)

  // Ne tenter le rendu qu'une fois le stream terminé — évite le thrashing
  // de layout à chaque token (le code Mermaid est partiel pendant le stream)
  useEffect(() => {
    if (isStreaming) return            // attendre la fin du stream
    if (!containerRef.current) return
    setErrMsg(null)
    setRendered(false)

    // Annuler si le composant est démonté avant la fin du rendu
    let cancelled = false

    mermaid.parse(clean)
      .then(() => mermaid.render(id.current, clean))
      .then(({ svg }) => {
        if (!cancelled && containerRef.current) {
          // Rendre le SVG responsive AVANT injection dans le DOM :
          // on manipule la chaîne pour éviter tout recalcul de layout
          // qui remettrait les dimensions fixes (flex reflow, Mermaid style attr…)
          const responsiveSvg = svg.replace(/<svg([^>]*)>/i, (_, attrs) => {
            const vbMatch = attrs.match(/viewBox="([^"]*)"/i)
            const wMatch  = attrs.match(/width="([^"]*)"/i)
            const hMatch  = attrs.match(/height="([^"]*)"/i)

            // Construire un viewBox si absent
            let extra = ''
            if (!vbMatch && wMatch && hMatch) {
              extra = ` viewBox="0 0 ${parseFloat(wMatch[1])} ${parseFloat(hMatch[1])}"`
            }

            // Supprimer width, height et tout style inline existant
            const cleaned = attrs
              .replace(/\s+width="[^"]*"/gi,  '')
              .replace(/\s+height="[^"]*"/gi, '')
              .replace(/\s+style="[^"]*"/gi,  '')

            return `<svg${cleaned}${extra} width="100%" style="width:100%;height:auto;max-width:100%;display:block;">`
          })
          containerRef.current.innerHTML = responsiveSvg
          setRendered(true)
        }
      })
      .catch(e => {
        if (cancelled) return
        const msg = e?.message ?? 'Syntaxe invalide'
        const firstLine = msg.split('\n').find(l => l.trim()) ?? msg
        setErrMsg(firstLine.length > 120 ? firstLine.slice(0, 120) + '…' : firstLine)
      })

    return () => { cancelled = true }
  }, [clean, isStreaming])

  // Pendant le stream : placeholder stable (hauteur fixe, pas de layout shift)
  if (isStreaming) {
    return (
      <div className="my-6 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
    )
  }

  if (errMsg) {
    return (
      <div className="my-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">
          ⚠ Diagramme Mermaid non rendu — erreur de syntaxe
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-500 font-mono mb-3 break-all">{errMsg}</p>
        <pre className="text-xs text-slate-600 dark:text-slate-400 font-mono whitespace-pre-wrap bg-white dark:bg-slate-900 rounded-lg p-3 border border-amber-100 dark:border-amber-900 overflow-x-auto">
          {clean}
        </pre>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`my-6 w-full overflow-x-auto ${rendered ? '' : 'h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse'}`}
    />
  )
}

// ── Entity avatar (bande en-tête) ─────────────────────────────────────────────

const CHIP_STYLE = {
  PERSON:  'bg-violet-100 dark:bg-violet-900/50 text-violet-800 dark:text-violet-200 border-violet-200 dark:border-violet-800',
  ORG:     'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800',
  PRODUCT: 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200 border-orange-200 dark:border-orange-800',
  GPE:     'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
  EVENT:   'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800',
  LOC:     'bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-200 border-teal-200 dark:border-teal-800',
}
const FALLBACK_CHIP = 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'

// ── Composant principal ───────────────────────────────────────────────────────

export default function ArticleFullReportDialog({ article, onClose }) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [reportMd, setReportMd]         = useState('')
  const [isLoading, setIsLoading]       = useState(true)
  const [error, setError]               = useState(null)
  const [copied, setCopied]             = useState(false)
  const abortRef = useRef(null)

  const entities     = article.entities ?? {}
  const titre        = article['Titre']?.trim() || article['Sources'] || 'Rapport complet'
  const resume       = article['Résumé'] ?? ''
  const url          = article['URL'] ?? ''
  const sources      = article['Sources'] ?? ''
  const date         = article['Date de publication'] ?? ''
  const sentiment    = article['sentiment'] ?? ''
  const ton          = article['ton_editorial'] ?? ''
  const mainImageUrl = (() => {
    const imgs = article['Images']
    if (!Array.isArray(imgs) || !imgs.length) return null
    return imgs.find(i => i?.URL)?.URL ?? imgs.find(i => i?.url)?.url ?? null
  })()

  // ── Inject/remove print CSS ──────────────────────────────────────────────────
  useEffect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-article-report-print', '')
    style.textContent = `
      @media print {
        body > *:not(#article-report-print-root) { display: none !important; }
        #article-report-print-root {
          position: fixed !important; inset: 0 !important;
          width: 100vw !important; height: auto !important;
          overflow: visible !important;
          background: white !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }
        .no-print { display: none !important; }
        #article-report-print-root .overflow-y-auto { overflow: visible !important; }
      }
    `
    document.head.appendChild(style)
    return () => style.remove()
  }, [])


  // ── SSE streaming ─────────────────────────────────────────────────────────────
  const startStream = useCallback(() => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setReportMd('')
    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams({
      url,
      titre,
      sources,
      date,
      resume:    resume.slice(0, 3000),
      entities:  JSON.stringify(entities),
      sentiment,
      ton,
      image_url: mainImageUrl ?? '',
    })

    fetch(`/api/article/full-report?${params}`, { signal: ac.signal })
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}))
          setError(d.error ?? `Erreur HTTP ${r.status}`)
          setIsLoading(false)
          return
        }
        const reader  = r.body.getReader()
        const decoder = new TextDecoder()
        let buffer    = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue
            try {
              const parsed = JSON.parse(raw)
              if (parsed.choices?.[0]?.delta?.content) {
                setReportMd(prev => prev + parsed.choices[0].delta.content)
              } else if (parsed.error) {
                setError(parsed.error)
              }
            } catch { /* skip malformed chunk */ }
          }
        }
        setIsLoading(false)
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          setError(e.message)
          setIsLoading(false)
        }
      })
  }, [url, titre, sources, date, resume, entities, sentiment, ton, mainImageUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    startStream()
    return () => abortRef.current?.abort()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Escape key ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = e => { if (e.key === 'Escape' && !isFullscreen) onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose, isFullscreen])

  // ── Derived state ─────────────────────────────────────────────────────────────
  // Strip <think>…</think> blocks emitted by Qwen3
  // Filtre les blocs <think> fermés ET les blocs ouverts non fermés (stream coupé en cours de pensée)
  const cleanMd = reportMd
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*/g, '')
    .trim()

  // Build entity chip list (all types, PERSON/ORG/PRODUCT first)
  const chipList = []
  const TYPE_ORDER = ['PERSON', 'ORG', 'PRODUCT', 'GPE', 'EVENT', 'LOC']
  const remaining = Object.keys(entities).filter(t => !TYPE_ORDER.includes(t))
  for (const type of [...TYPE_ORDER, ...remaining]) {
    const vals = entities[type]
    if (!Array.isArray(vals)) continue
    for (const v of vals.slice(0, 6)) {
      if (typeof v === 'string' && v.trim()) chipList.push({ name: v.trim(), type })
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────────
  const handleCopy = async () => {
    await navigator.clipboard.writeText(cleanMd).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenChatbot = () => {
    window.dispatchEvent(new CustomEvent('wudd:openArticleChatbot', {
      detail: { titre, sources, date, url, entities, resume, reportMd: cleanMd },
    }))
  }

  const handleDownload = () => {
    const fname = `rapport_${sources || 'article'}_${date || new Date().toISOString().slice(0, 10)}.md`
      .replace(/[/\\: ]/g, '-')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([cleanMd], { type: 'text/markdown' }))
    a.download = fname
    a.click()
  }

  // ── Shared button class ───────────────────────────────────────────────────────
  const btnCls = 'p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors'

  // ── ReactMarkdown component overrides ─────────────────────────────────────────
  const hasEntities = Object.keys(entities).length > 0

  const mdComponents = {
    h1: ({ children }) => (
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-8 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-7 mb-3">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-5 mb-2">{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-4 mb-1">{children}</h4>
    ),
    // Entity highlighting for plain-text paragraphs
    p: ({ children }) => {
      if (typeof children === 'string' && hasEntities) {
        return (
          <EntityHighlighter
            text={children}
            entities={entities}
            className="mb-4 text-base"
          />
        )
      }
      return (
        <p className="text-base text-slate-700 dark:text-slate-300 mb-4 leading-7">{children}</p>
      )
    },
    pre: ({ children }) => {
      const child = Array.isArray(children) ? children[0] : children
      if (child?.props?.className === 'language-mermaid') return <>{children}</>
      return (
        <pre className="bg-slate-100 dark:bg-slate-950 rounded-xl p-4 overflow-x-auto mb-4 border border-slate-200 dark:border-slate-800">
          {children}
        </pre>
      )
    },
    code: ({ className, children }) => {
      if (className === 'language-mermaid') {
        return <MermaidBlock code={String(children).trim()} isStreaming={isLoading} />
      }
      const isBlock = className || String(children).includes('\n')
      if (!isBlock) {
        return (
          <code className="bg-slate-100 dark:bg-slate-800 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded text-[0.85em] font-mono">
            {children}
          </code>
        )
      }
      return (
        <code className={`text-slate-700 dark:text-slate-300 text-sm font-mono leading-relaxed ${className || ''}`}>
          {children}
        </code>
      )
    },
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 underline underline-offset-2"
      >
        {children}
      </a>
    ),
    ul: ({ children }) => (
      <ul className="list-disc text-slate-700 dark:text-slate-300 mb-4 space-y-1 ml-5">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal text-slate-700 dark:text-slate-300 mb-4 space-y-1 ml-5">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="text-base text-slate-700 dark:text-slate-300 leading-relaxed">{children}</li>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-blue-500/60 pl-4 italic text-slate-500 dark:text-slate-400 my-4">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto mb-4 rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm text-slate-700 dark:text-slate-300">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">{children}</thead>
    ),
    th: ({ children }) => (
      <th className="border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border-b border-slate-200/50 dark:border-slate-700/50 px-4 py-2.5">{children}</td>
    ),
    img: ({ src, alt }) => (
      <figure className="my-6">
        <img
          src={src}
          alt={alt}
          className="max-w-full rounded-xl border border-slate-200 dark:border-slate-700"
          loading="lazy"
        />
        {alt && (
          <figcaption className="text-center text-slate-400 dark:text-slate-500 text-sm mt-2 italic">{alt}</figcaption>
        )}
      </figure>
    ),
    hr: () => <hr className="border-slate-200 dark:border-slate-700 my-8" />,
    strong: ({ children }) => (
      <strong className="text-slate-900 dark:text-slate-100 font-semibold">{children}</strong>
    ),
    em: ({ children }) => (
      <em className="text-slate-700 dark:text-slate-300 italic">{children}</em>
    ),
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:p-0"
      onClick={e => e.target === e.currentTarget && !isFullscreen && onClose()}
    >
      <div
        id="article-report-print-root"
        className={`flex flex-col shadow-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 transition-all duration-200 ${
          isFullscreen
            ? 'fixed inset-0 rounded-none'
            : 'w-[92vw] max-w-[1400px] h-[92vh] rounded-2xl'
        } overflow-hidden`}
      >
        {/* ── Title bar ─────────────────────────────────────────────────────── */}
        <div className="no-print flex items-center gap-3 px-5 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-900">
          <FileText size={17} className="text-blue-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{titre}</h2>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
              {[sources, date, sentiment].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {!isLoading && cleanMd && (
              <button
                onClick={handleOpenChatbot}
                className="flex items-center gap-1 px-2 py-1 mr-1 rounded-lg text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-800/40 transition-colors"
                title="Ouvrir le Terminal IA avec ce rapport en contexte"
              >
                <Terminal size={12} />
                Terminal IA
              </button>
            )}
            <button onClick={handleCopy} className={btnCls} title="Copier le Markdown">
              {copied
                ? <Check size={14} className="text-emerald-500" />
                : <Copy size={14} />
              }
            </button>
            <button onClick={handleDownload} className={btnCls} title="Télécharger .md">
              <Download size={14} />
            </button>
            <button onClick={() => window.print()} className={btnCls} title="Imprimer / Exporter PDF">
              <Printer size={14} />
            </button>
            <button
              onClick={startStream}
              disabled={isLoading}
              className={btnCls}
              title="Régénérer le rapport"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin text-blue-400' : ''} />
            </button>
            <button
              onClick={() => setIsFullscreen(v => !v)}
              className={btnCls}
              title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
              title="Fermer"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Entity chip band ─────────────────────────────────────────────── */}
        {chipList.length > 0 && (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 overflow-x-auto shrink-0">
            {chipList.map(({ name, type }) => (
              <span
                key={`${type}-${name}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${CHIP_STYLE[type] ?? FALLBACK_CHIP}`}
              >
                {name}
                <span className="opacity-60 font-normal">({type})</span>
              </span>
            ))}
          </div>
        )}


        {/* ── Report content ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-10 py-6 bg-white dark:bg-slate-900">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-300">
              Erreur : {error}
            </div>
          )}

          {isLoading && !cleanMd && (
            <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 text-sm py-16 justify-center">
              <RefreshCw size={16} className="animate-spin" />
              Génération du rapport en cours…
            </div>
          )}

          {cleanMd && (
            <div className="w-full max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={mdComponents}
              >
                {cleanMd}
              </ReactMarkdown>
              {/* Curseur clignotant pendant le streaming */}
              {isLoading && (
                <span className="inline-block w-1.5 h-4 bg-blue-500 dark:bg-blue-400 animate-pulse rounded-sm align-middle" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
