import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { useMemo } from 'react'

/** Parse le frontmatter YAML entre --- et retourne { meta, body } */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { meta: null, body: content }
  const meta = {}
  match[1].split('\n').forEach(line => {
    const idx = line.indexOf(':')
    if (idx > 0) {
      const key = line.slice(0, idx).trim()
      const val = line.slice(idx + 1).trim()
      if (key && val) meta[key] = val
    }
  })
  return { meta: Object.keys(meta).length ? meta : null, body: match[2] }
}

/** Prétraite le corps : remplace {{TOC}} et === (saut de page iA Writer) */
function preprocess(body) {
  return body
    .replace(/\{\{TOC\}\}/g, '*[Table des matières — générée automatiquement]*')
    .replace(/^===\s*$/gm, '---')
}

export default function MarkdownViewer({ content }) {
  const { meta, body } = useMemo(() => {
    const { meta, body } = parseFrontmatter(content)
    return { meta, body: preprocess(body) }
  }, [content])

  return (
    <div className="max-w-3xl mx-auto">
      {/* Métadonnées frontmatter */}
      {meta && (
        <div className="mb-6 p-4 bg-slate-800/60 rounded-xl border border-slate-700 text-sm">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
            Métadonnées du rapport
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
            {Object.entries(meta).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-500 text-xs">{k}</dt>
                <dd className="text-slate-300 text-xs">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Rendu Markdown */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-slate-100 mt-8 mb-4 pb-2 border-b border-slate-700 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold text-slate-100 mt-7 mb-3">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-slate-200 mt-5 mb-2">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold text-slate-300 mt-4 mb-1">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="text-slate-300 mb-4 leading-7">{children}</p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
            >
              {children}
            </a>
          ),
          pre: ({ children }) => (
            <pre className="bg-slate-950 rounded-xl p-4 overflow-x-auto mb-4 border border-slate-800">
              {children}
            </pre>
          ),
          code: ({ className, children }) => {
            const isBlock = className || String(children).includes('\n')
            if (!isBlock) {
              return (
                <code className="bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded text-[0.85em] font-mono">
                  {children}
                </code>
              )
            }
            return (
              <code className={`text-slate-300 text-sm font-mono leading-relaxed ${className || ''}`}>
                {children}
              </code>
            )
          },
          ul: ({ children }) => (
            <ul className="list-disc text-slate-300 mb-4 space-y-1 ml-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal text-slate-300 mb-4 space-y-1 ml-5">{children}</ol>
          ),
          li: ({ children }) => <li className="text-slate-300 leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-blue-500/60 pl-4 italic text-slate-400 my-4">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-4 rounded-lg border border-slate-700">
              <table className="w-full text-sm text-slate-300">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-800 text-slate-200">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border-b border-slate-700 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-slate-700/50 px-4 py-2.5">{children}</td>
          ),
          img: ({ src, alt }) => (
            <figure className="my-6">
              <img
                src={src}
                alt={alt}
                className="max-w-full rounded-xl border border-slate-700"
                loading="lazy"
              />
              {alt && (
                <figcaption className="text-center text-slate-500 text-sm mt-2 italic">{alt}</figcaption>
              )}
            </figure>
          ),
          hr: () => <hr className="border-slate-700 my-8" />,
          strong: ({ children }) => (
            <strong className="text-slate-100 font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="text-slate-300 italic">{children}</em>,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  )
}
