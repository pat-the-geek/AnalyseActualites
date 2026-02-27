import { useMemo, useState } from 'react'
import { Tag, ChevronDown, ChevronRight, Search } from 'lucide-react'

/**
 * Configuration des types NER : label français + classes Tailwind statiques.
 * Les classes doivent être écrites en dur pour ne pas être purgées par Tailwind.
 */
const ENTITY_CONFIG = {
  PERSON:      { label: 'Personnes',         dot: 'bg-violet-400',  chipBg: 'bg-violet-100 dark:bg-violet-900/40',   chipText: 'text-violet-700 dark:text-violet-300',   chipBorder: 'border-violet-200 dark:border-violet-800' },
  ORG:         { label: 'Organisations',     dot: 'bg-blue-400',    chipBg: 'bg-blue-100 dark:bg-blue-900/40',       chipText: 'text-blue-700 dark:text-blue-300',       chipBorder: 'border-blue-200 dark:border-blue-800'   },
  GPE:         { label: 'Lieux géopol.',     dot: 'bg-emerald-400', chipBg: 'bg-emerald-100 dark:bg-emerald-900/40', chipText: 'text-emerald-700 dark:text-emerald-300', chipBorder: 'border-emerald-200 dark:border-emerald-800' },
  PRODUCT:     { label: 'Produits / Tech',   dot: 'bg-orange-400',  chipBg: 'bg-orange-100 dark:bg-orange-900/40',   chipText: 'text-orange-700 dark:text-orange-300',   chipBorder: 'border-orange-200 dark:border-orange-800' },
  EVENT:       { label: 'Événements',        dot: 'bg-amber-400',   chipBg: 'bg-amber-100 dark:bg-amber-900/40',     chipText: 'text-amber-700 dark:text-amber-300',     chipBorder: 'border-amber-200 dark:border-amber-800'  },
  LAW:         { label: 'Lois / Règlements', dot: 'bg-red-400',     chipBg: 'bg-red-100 dark:bg-red-900/40',         chipText: 'text-red-700 dark:text-red-300',         chipBorder: 'border-red-200 dark:border-red-800'     },
  LOC:         { label: 'Lieux',             dot: 'bg-teal-400',    chipBg: 'bg-teal-100 dark:bg-teal-900/40',       chipText: 'text-teal-700 dark:text-teal-300',       chipBorder: 'border-teal-200 dark:border-teal-800'   },
  NORP:        { label: 'Groupes',           dot: 'bg-fuchsia-400', chipBg: 'bg-fuchsia-100 dark:bg-fuchsia-900/40', chipText: 'text-fuchsia-700 dark:text-fuchsia-300', chipBorder: 'border-fuchsia-200 dark:border-fuchsia-800' },
  FAC:         { label: 'Sites / Bâtiments', dot: 'bg-cyan-400',    chipBg: 'bg-cyan-100 dark:bg-cyan-900/40',       chipText: 'text-cyan-700 dark:text-cyan-300',       chipBorder: 'border-cyan-200 dark:border-cyan-800'   },
  WORK_OF_ART: { label: 'Œuvres',            dot: 'bg-rose-400',    chipBg: 'bg-rose-100 dark:bg-rose-900/40',       chipText: 'text-rose-700 dark:text-rose-300',       chipBorder: 'border-rose-200 dark:border-rose-800'   },
  MONEY:       { label: 'Montants',          dot: 'bg-yellow-400',  chipBg: 'bg-yellow-100 dark:bg-yellow-900/40',   chipText: 'text-yellow-700 dark:text-yellow-300',   chipBorder: 'border-yellow-200 dark:border-yellow-800' },
  PERCENT:     { label: 'Pourcentages',      dot: 'bg-lime-400',    chipBg: 'bg-lime-100 dark:bg-lime-900/40',       chipText: 'text-lime-700 dark:text-lime-300',       chipBorder: 'border-lime-200 dark:border-lime-800'   },
  LANGUAGE:    { label: 'Langues',           dot: 'bg-indigo-400',  chipBg: 'bg-indigo-100 dark:bg-indigo-900/40',   chipText: 'text-indigo-700 dark:text-indigo-300',   chipBorder: 'border-indigo-200 dark:border-indigo-800' },
  DATE:        { label: 'Dates',             dot: 'bg-slate-400',   chipBg: 'bg-slate-100 dark:bg-slate-800',        chipText: 'text-slate-600 dark:text-slate-400',     chipBorder: 'border-slate-200 dark:border-slate-700' },
  TIME:        { label: 'Heures',            dot: 'bg-slate-400',   chipBg: 'bg-slate-100 dark:bg-slate-800',        chipText: 'text-slate-600 dark:text-slate-400',     chipBorder: 'border-slate-200 dark:border-slate-700' },
  QUANTITY:    { label: 'Quantités',         dot: 'bg-stone-400',   chipBg: 'bg-stone-100 dark:bg-stone-800/60',     chipText: 'text-stone-600 dark:text-stone-400',     chipBorder: 'border-stone-200 dark:border-stone-700' },
  CARDINAL:    { label: 'Nombres',           dot: 'bg-zinc-400',    chipBg: 'bg-zinc-100 dark:bg-zinc-800/60',       chipText: 'text-zinc-600 dark:text-zinc-400',       chipBorder: 'border-zinc-200 dark:border-zinc-700'   },
  ORDINAL:     { label: 'Ordinaux',          dot: 'bg-gray-400',    chipBg: 'bg-gray-100 dark:bg-gray-800/60',       chipText: 'text-gray-600 dark:text-gray-400',       chipBorder: 'border-gray-200 dark:border-gray-700'   },
}

const FALLBACK_CFG = {
  label: '',
  dot: 'bg-slate-400',
  chipBg: 'bg-slate-100 dark:bg-slate-800',
  chipText: 'text-slate-600 dark:text-slate-400',
  chipBorder: 'border-slate-200 dark:border-slate-700',
}

/**
 * Agrège les entités de tous les articles d'un fichier JSON.
 * Retourne { [type]: [{ value, count }] } trié par fréquence décroissante.
 */
function extractEntities(jsonContent) {
  try {
    const data = JSON.parse(jsonContent)
    const articles = Array.isArray(data) ? data : [data]
    const aggregated = {}

    for (const article of articles) {
      if (!article?.entities || typeof article.entities !== 'object') continue
      for (const [type, values] of Object.entries(article.entities)) {
        if (!Array.isArray(values)) continue
        if (!aggregated[type]) aggregated[type] = new Map()
        for (const v of values) {
          if (typeof v === 'string' && v.trim()) {
            const key = v.trim()
            aggregated[type].set(key, (aggregated[type].get(key) || 0) + 1)
          }
        }
      }
    }

    const result = {}
    for (const [type, countMap] of Object.entries(aggregated)) {
      result[type] = [...countMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count }))
    }
    return result
  } catch {
    return {}
  }
}

function EntitySection({ type, entities, defaultOpen, onEntitySearch }) {
  const [open, setOpen] = useState(defaultOpen)
  const cfg = ENTITY_CONFIG[type] ?? { ...FALLBACK_CFG, label: type }

  return (
    <div className="border border-slate-200 dark:border-slate-700/60 rounded-xl overflow-hidden">
      {/* En-tête de section */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">
          {cfg.label || type}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full shrink-0">
          {entities.length}
        </span>
        {open
          ? <ChevronDown size={13} className="text-slate-400 shrink-0" />
          : <ChevronRight size={13} className="text-slate-400 shrink-0" />
        }
      </button>

      {/* Nuage de chips */}
      {open && (
        <div className="px-3.5 py-3 flex flex-wrap gap-1.5 bg-white/50 dark:bg-slate-900/40">
          {entities.map(({ value, count }) => {
            const chip = (
              <>
                {value}
                {count > 1 && (
                  <span className="opacity-55 font-semibold tabular-nums">×{count}</span>
                )}
              </>
            )

            if (onEntitySearch) {
              return (
                <button
                  key={value}
                  onClick={() => onEntitySearch(value, type)}
                  title={`Rechercher «${value}» dans tous les fichiers`}
                  className={`group inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all hover:ring-2 hover:ring-offset-1 hover:ring-violet-400/50 hover:scale-105 active:scale-95
                    ${cfg.chipBg} ${cfg.chipText} ${cfg.chipBorder}`}
                >
                  {chip}
                  <Search size={9} className="opacity-0 group-hover:opacity-60 transition-opacity ml-0.5 shrink-0" />
                </button>
              )
            }

            return (
              <span
                key={value}
                title={count > 1 ? `Mentionné dans ${count} articles` : undefined}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border
                  ${cfg.chipBg} ${cfg.chipText} ${cfg.chipBorder}`}
              >
                {chip}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * EntityPanel — panneau des entités nommées agrégées d'un fichier JSON.
 *
 * @param {string}   content         — contenu JSON brut
 * @param {function} onEntitySearch  — appelé avec (value, type) quand on clique une entité
 *                                     Si absent, les chips sont non-cliquables.
 */
export default function EntityPanel({ content, onEntitySearch }) {
  const entities = useMemo(() => extractEntities(content), [content])

  const types = useMemo(
    () => Object.keys(entities).sort((a, b) => entities[b].length - entities[a].length),
    [entities],
  )

  const totalUnique = useMemo(
    () => types.reduce((sum, t) => sum + entities[t].length, 0),
    [types, entities],
  )

  if (types.length === 0) return null

  return (
    <div className="mt-6">
      {/* En-tête de section */}
      <div className="flex items-center gap-2 mb-3">
        <Tag size={14} className="text-slate-500 dark:text-slate-400" />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Entités nommées
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-600 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">
          {totalUnique} entités · {types.length} types
        </span>
        {onEntitySearch && (
          <span className="text-xs text-slate-400 dark:text-slate-500 italic ml-1">
            Cliquer une entité pour la chercher dans tous les fichiers
          </span>
        )}
      </div>

      {/* Sections par type (les 4 plus peuplées ouvertes par défaut) */}
      <div className="flex flex-col gap-2">
        {types.map((type, i) => (
          <EntitySection
            key={type}
            type={type}
            entities={entities[type]}
            defaultOpen={i < 4}
            onEntitySearch={onEntitySearch}
          />
        ))}
      </div>
    </div>
  )
}
