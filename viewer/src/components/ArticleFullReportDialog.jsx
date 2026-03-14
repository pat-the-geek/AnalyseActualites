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
  RefreshCw, FileText, Check,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import mermaid from 'mermaid'
import EntityHighlighter from './EntityHighlighter'

mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' })

// ── Mermaid block ─────────────────────────────────────────────────────────────

function MermaidBlock({ code }) {
  const ref = useRef(null)
  const id  = useRef(`mermaid-rpt-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    if (!ref.current) return
    mermaid.render(id.current, code)
      .then(({ svg }) => { if (ref.current) ref.current.innerHTML = svg })
      .catch(err => { if (ref.current) ref.current.textContent = `Erreur Mermaid : ${err.message}` })
  }, [code])

  return <div ref={ref} className="my-6 flex justify-center overflow-x-auto" />
}

// ── Entity avatar (bande en-tête) ─────────────────────────────────────────────

const AVATAR_STYLE = {
  PERSON:  { ring: 'ring-violet-300 dark:ring-violet-700', bg: 'bg-violet-100 dark:bg-violet-900/50', text: 'text-violet-700 dark:text-violet-200', shape: 'rounded-full' },
  ORG:     { ring: 'ring-blue-300 dark:ring-blue-700',     bg: 'bg-blue-100 dark:bg-blue-900/50',     text: 'text-blue-700 dark:text-blue-200',     shape: 'rounded-lg'   },
  PRODUCT: { ring: 'ring-orange-300 dark:ring-orange-700', bg: 'bg-orange-100 dark:bg-orange-900/50', text: 'text-orange-700 dark:text-orange-200', shape: 'rounded-lg'   },
}
const FALLBACK_AVATAR = { ring: 'ring-slate-300 dark:ring-slate-600', bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-300', shape: 'rounded-lg' }

function EntityAvatar({ name, type, imageUrl }) {
  const [imgFailed, setImgFailed] = useState(false)
  const style    = AVATAR_STYLE[type] ?? FALLBACK_AVATAR
  const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div className={`w-12 h-12 ring-2 ${style.ring} ${style.shape} overflow-hidden flex items-center justify-center ${style.bg}`}>
        {imageUrl && !imgFailed ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className={`text-sm font-bold ${style.text}`}>{initials}</span>
        )}
      </div>
      <span className="text-[10px] text-slate-500 dark:text-slate-400 max-w-[64px] text-center truncate leading-tight">
        {name}
      </span>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function ArticleFullReportDialog({ article, onClose }) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [reportMd, setReportMd]         = useState('')
  const [isLoading, setIsLoading]       = useState(true)
  const [entityImages, setEntityImages] = useState({})
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

  // ── Fetch entity images (PERSON / ORG / PRODUCT) ─────────────────────────────
  useEffect(() => {
    const entityList = []
    for (const [type, values] of Object.entries(entities)) {
      if (['PERSON', 'ORG', 'PRODUCT'].includes(type) && Array.isArray(values)) {
        for (const v of values.slice(0, 8)) {
          if (typeof v === 'string' && v.trim()) entityList.push({ name: v.trim(), type })
        }
      }
    }
    if (!entityList.length) return
    fetch('/api/entities/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entityList),
    })
      .then(r => r.json())
      .then(data => setEntityImages(data ?? {}))
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
  const cleanMd = reportMd.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  // Build avatar list (PERSON first, then ORG, PRODUCT)
  const avatarList = []
  for (const type of ['PERSON', 'ORG', 'PRODUCT']) {
    const vals = entities[type]
    if (!Array.isArray(vals)) continue
    for (const v of vals.slice(0, 10)) {
      if (typeof v === 'string') {
        avatarList.push({ name: v, type, imageUrl: entityImages[v]?.url ?? null })
      }
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────────
  const handleCopy = async () => {
    await navigator.clipboard.writeText(cleanMd).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
        return <MermaidBlock code={String(children).trim()} />
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
            : 'w-[80vw] max-w-5xl h-[88vh] rounded-2xl'
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

        {/* ── Entity avatar band (Option 6A) ────────────────────────────────── */}
        {avatarList.length > 0 && (
          <div className="flex items-center gap-4 px-5 py-2.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 overflow-x-auto shrink-0">
            {avatarList.map(({ name, type, imageUrl }) => (
              <EntityAvatar key={`${type}-${name}`} name={name} type={type} imageUrl={imageUrl} />
            ))}
          </div>
        )}


        {/* ── Report content ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-8 py-6 bg-white dark:bg-slate-900">
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
            <div className="max-w-3xl mx-auto">
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
