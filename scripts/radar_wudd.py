#!/usr/bin/env python3
"""
radar_wudd.py — Radar Thématique WUDD.ai
Appelle l'API EurIA (Infomaniak / Qwen3), score les thèmes sur le corpus, génère un HTML autonome.

Usage:
    python3 radar_wudd.py
    python3 radar_wudd.py --data /chemin/vers/data --output radar.html

Dépendances: requests, python-dotenv (voir requirements.txt)
"""

import json
import sys
import argparse
import unicodedata
from pathlib import Path
from datetime import datetime, timedelta

# Ajouter le répertoire parent au PYTHONPATH pour importer utils
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT))

from utils.logging import print_console
from utils.config import get_config
from utils.api_client import EurIAClient

# ─── CONFIG ──────────────────────────────────────────────────────────────────

DEFAULT_DATA = PROJECT_ROOT / "data"
DEFAULT_OUTPUT = PROJECT_ROOT / "rapports" / "radar_wudd.html"

THEMES = [
    "IA", "Technologie", "Intelligence", "Innovation", "Politique", "Pouvoir",
    "Geopolitique", "Economie", "Societe", "Energie", "Militaire", "Liberte",
    "Desinformation", "Environnement", "Espace", "Donnees", "Developpement",
    "Code", "Securite", "Science", "Recherche", "Information", "Ordinateur",
    "Outil", "Apprentissage", "Progres", "Evolution", "Robot", "Communication",
    "Loi", "Responsabilite", "Ethique", "Danger", "Humain", "Langage",
    "Consommation", "Culture", "Education", "Realite", "Simulation", "Virtuel",
    "Sante", "Histoire", "Identite", "Memoire", "Creativite", "Conscience",
    "Bonheur", "Emotion", "Vie", "Mort", "Nature", "Maladie", "Ignorance",
    "Loisir", "Jeu", "Cinema", "Art",
]

# ─── CHARGEMENT DES DONNÉES ───────────────────────────────────────────────────

def load_articles(data_dir):
    articles = []
    for f in Path(data_dir).rglob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(data, list):
                articles.extend(data)
        except Exception as e:
            print(f"  [skip] {f.name}: {e}")
    return articles


def parse_date(raw):
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return None


def split_periods(articles):
    dated = []
    for a in articles:
        dt = parse_date(a.get("Date de publication", ""))
        if dt:
            a["_dt"] = dt
            dated.append(a)

    if not dated:
        return [], [], None, None

    dated.sort(key=lambda x: x["_dt"])
    oldest = dated[0]["_dt"]
    week_end = oldest + timedelta(days=13)

    now = datetime.now()
    t0 = [a for a in dated if a["_dt"].month == now.month and a["_dt"].year == now.year]
    # fallback: si mois courant vide, prendre les 4 dernières semaines
    if not t0:
        cutoff = dated[-1]["_dt"] - timedelta(days=28)
        t0 = [a for a in dated if a["_dt"] >= cutoff]

    t1 = [a for a in dated if a["_dt"] <= week_end]

    return t0, t1, oldest, week_end


def to_ascii(s, maxlen=160):
    if not s:
        return ""
    nfkd = unicodedata.normalize("NFKD", s)
    out = "".join(c for c in nfkd if ord(c) < 128)
    out = out.replace('"', "'").replace("\\", "").replace("\n", " ").replace("\r", "")
    return out[:maxlen].strip()


def format_corpus(articles, limit=35):
    lines = []
    for a in articles[:limit]:
        src = to_ascii(a.get("Sources", ""))[:35]
        res_raw = a.get("Resume") or a.get("Résumé") or a.get("R\u00e9sum\u00e9") or ""
        res = to_ascii(res_raw)
        if res:
            lines.append(f"{src}: {res}")
    return lines

# ─── APPEL API ────────────────────────────────────────────────────────────────

def call_api(client: EurIAClient, corpus_t0, corpus_t1, t0_label, t1_label, t0_count, t1_count):
    """Envoie le corpus à l'API EurIA et retourne la liste de scores thématiques."""
    prompt = (
        "Tu es un analyste média expert. Évalue la présence de chaque thème dans deux corpus d'articles.\n\n"
        "RÈGLES STRICTES :\n"
        "- freqT0 : proportion d'articles du CORPUS T0 qui traitent ce thème (0.0 à 1.0)\n"
        "- freqT1 : proportion d'articles du CORPUS T1 qui traitent ce thème (0.0 à 1.0)\n"
        "- vel    : score de vélocité basé sur freqT0/freqT1. "
        "0.0=forte baisse, 0.5=stable, 1.0=forte hausse. "
        "Si freqT1=0, vel=0.8 si freqT0>0.1, sinon 0.5.\n"
        "- art    : nombre entier d'articles de T0 concernés par ce thème\n"
        "- Un thème absent des deux corpus : freqT0=0.05, freqT1=0.05, vel=0.5\n"
        "- TOUS les thèmes doivent être présents dans la réponse.\n\n"
        f"THEMES ({len(THEMES)}) : {', '.join(THEMES)}\n\n"
        f"CORPUS T1 — référence ({t1_label}, {t1_count} articles) :\n"
        + "\n".join(corpus_t1)
        + f"\n\nCORPUS T0 — actuel ({t0_label}, {t0_count} articles) :\n"
        + "\n".join(corpus_t0)
        + "\n\nRéponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ni après.\n"
        "Format exact : [{\"theme\":\"...\",\"freqT0\":0.0,\"freqT1\":0.0,\"vel\":0.0,\"art\":0}]"
    )

    raw = client.ask(prompt, max_attempts=3, timeout=120, max_tokens=8192)

    # Supprimer les blocs de réflexion <think>…</think> de Qwen3
    import re
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL)
    raw = raw.replace("```json", "").replace("```", "").strip()

    # Chercher un tableau JSON
    start = raw.find("[")
    end = raw.rfind("]")
    if start != -1 and end != -1:
        items = json.loads(raw[start:end + 1])
    else:
        # Fallback : si l'API a renvoyé un seul objet, l'envelopper dans une liste
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1:
            obj = json.loads(raw[start:end + 1])
            items = [obj] if isinstance(obj, dict) else obj
        else:
            raise ValueError(f"Pas de JSON valide dans la reponse: {raw[:300]}")

    # Calcul de freq (= freqT0) et vel normalisée côté Python
    for item in items:
        ft0 = float(item.get("freqT0", item.get("freq", 0.05)))
        ft1 = float(item.get("freqT1", 0.05))
        # Assurer que freq est bien freqT0
        item["freq"] = ft0
        item["freqT0"] = ft0
        item["freqT1"] = ft1
        # Recalculer vel si freq=0 (modèle n'a pas suivi les règles)
        if "vel" not in item or item["vel"] == 0.0:
            if ft1 == 0:
                item["vel"] = 0.8 if ft0 > 0.1 else 0.5
            else:
                ratio = ft0 / ft1
                item["vel"] = min(1.0, max(0.0, 0.5 + (ratio - 1.0) * 0.3))

    return items

# ─── GÉNÉRATION HTML ──────────────────────────────────────────────────────────

def generate_html(results, meta):
    results_json = json.dumps(results, ensure_ascii=True)
    meta_json = json.dumps(meta, ensure_ascii=True)

    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Radar Thematique WUDD.ai</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    background: #08080e;
    color: #e4e4f0;
    font-family: 'DM Mono', 'Courier New', monospace;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }}
  #header {{
    padding: 0.8rem 1.5rem;
    border-bottom: 1px solid #1a1a2e;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    flex-shrink: 0;
  }}
  #title {{ font-weight: 800; font-size: 0.95rem; letter-spacing: -0.02em; }}
  #title span {{ color: #7c6af7; }}
  #title small {{ color: #55557a; font-weight: 400; font-size: 0.57rem; margin-left: 0.6rem; }}
  #periods {{ display: flex; gap: 1.2rem; align-items: center; }}
  .period {{ font-size: 0.57rem; color: #55557a; }}
  .period b {{ font-size: 0.62rem; color: #c4c4d8; margin-right: 0.3rem; font-weight: 400; }}
  .badge {{ border-radius: 2px; padding: 0 0.28rem; font-size: 0.55rem; }}
  #body {{ display: grid; grid-template-columns: 1fr 220px; flex: 1; min-height: 0; }}
  #main {{ display: flex; flex-direction: column; padding: 1rem; gap: 0.8rem; }}
  #cards {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; flex-shrink: 0; }}
  .card {{ background: #0f0f18; border: 1px solid #1a1a2e; border-radius: 3px; padding: 0.5rem 0.8rem; }}
  .card-n {{ font-weight: 800; font-size: 1.7rem; line-height: 1; margin-bottom: 0.12rem; }}
  .card-l {{ font-size: 0.54rem; color: #55557a; text-transform: uppercase; letter-spacing: 0.08em; }}
  #chart-wrap {{ flex: 1; min-height: 0; position: relative; }}
  #chart {{ width: 100%; height: 100%; display: block; }}
  #sidebar {{ border-left: 1px solid #1a1a2e; display: flex; flex-direction: column; overflow: hidden; }}
  #sidebar-hdr {{ padding: 0.7rem 0.9rem 0.4rem; border-bottom: 1px solid #1a1a2e; flex-shrink: 0; font-weight: 700; font-size: 0.68rem; }}
  #sidebar-list {{ overflow-y: auto; flex: 1; }}
  .srow {{ display: flex; justify-content: space-between; align-items: center; padding: 0.25rem 0.85rem; cursor: default; transition: background 0.1s; }}
  .srow:hover {{ background: rgba(255,255,255,0.03); }}
  .srow-name {{ font-size: 0.62rem; }}
  .srow-arr {{ opacity: 0.3; font-size: 0.55rem; margin-left: 0.25rem; }}
  .srow-badge {{ font-size: 0.53rem; padding: 0.08rem 0.26rem; border-radius: 2px; white-space: nowrap; margin-left: 0.3rem; }}
  #statusbar {{ padding: 0.35rem 1.5rem; background: #0f0f18; border-top: 1px solid #1a1a2e; font-size: 0.58rem; color: #55557a; display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }}
  #dot {{ width: 5px; height: 5px; border-radius: 50%; background: #6af7b8; box-shadow: 0 0 6px #6af7b8; flex-shrink: 0; }}
  #tooltip {{ position: fixed; display: none; z-index: 200; background: #0f0f18; border-radius: 4px; padding: 0.65rem 0.85rem; font-size: 0.66rem; pointer-events: none; max-width: 200px; }}
  .tip-theme {{ font-weight: 700; font-size: 0.88rem; margin-bottom: 0.22rem; }}
  .tip-q {{ font-size: 0.55rem; opacity: 0.7; margin-bottom: 0.35rem; }}
  .tip-row {{ display: flex; justify-content: space-between; gap: 1rem; color: #55557a; margin: 0.1rem 0; }}
  .tip-val {{ color: #e4e4f0; }}
  svg text {{ user-select: none; }}
</style>
</head>
<body>
<div id="header">
  <div id="title">Radar <span>Thematique</span><small id="meta-label"></small></div>
  <div id="periods"></div>
</div>
<div id="body">
  <div id="main">
    <div id="cards"></div>
    <div id="chart-wrap"><svg id="chart"></svg></div>
  </div>
  <div id="sidebar">
    <div id="sidebar-hdr">Themes par quadrant</div>
    <div id="sidebar-list"></div>
  </div>
</div>
<div id="statusbar">
  <div id="dot"></div>
  <span id="status-msg"></span>
</div>
<div id="tooltip">
  <div class="tip-theme" id="tip-theme"></div>
  <div class="tip-q" id="tip-q"></div>
  <div class="tip-row"><span>Freq T1</span><span class="tip-val" id="tip-f1"></span></div>
  <div class="tip-row"><span>Freq T0</span><span class="tip-val" id="tip-f0"></span></div>
  <div class="tip-row"><span>Velocite</span><span class="tip-val" id="tip-vel"></span></div>
  <div class="tip-row"><span>Articles</span><span class="tip-val" id="tip-art"></span></div>
</div>
<script>
const RESULTS = {results_json};
const META = {meta_json};
const QC = {{d:"#7c6af7",e:"#f7c76a",h:"#6af7b8",x:"#f76a7c"}};
const QL = {{d:"Dominant",e:"Emergent",h:"Habituel",x:"Declinant"}};

function getQ(d) {{
  // Dominant  : fréquent  ET stable-ou-en-hausse (vel >= 0.5)
  // Emergent  : rare      ET strictement en hausse (vel > 0.5)
  // Habituel  : fréquent  ET en baisse (vel < 0.5)
  // Déclinant : rare      ET stable-ou-en-baisse (vel <= 0.5)
  if (d.freq>=0.5 && d.vel>=0.5) return "d";
  if (d.freq<0.5  && d.vel>0.5)  return "e";
  if (d.freq>=0.5 && d.vel<0.5)  return "h";
  return "x";
}}

document.getElementById("meta-label").textContent =
  " · WUDD.ai · " + META.total + " articles · " + META.categories.join(" / ");

const periodsEl = document.getElementById("periods");
[{{l:"T0",v:META.t0_label,n:META.t0_count+" art",c:"#7c6af7"}},
 {{l:"T1",v:META.t1_label,n:META.t1_count+" art",c:"#f7c76a"}}
].forEach(p => {{
  const d = document.createElement("div");
  d.className = "period";
  d.innerHTML = `<b>${{p.l}}</b><span class="badge" style="background:${{p.c}}22;color:${{p.c}};border:1px solid ${{p.c}}44">${{p.v}}</span> ${{p.n}}`;
  periodsEl.appendChild(d);
}});

const cnt = {{d:0,e:0,h:0,x:0}};
RESULTS.forEach(d => cnt[getQ(d)]++);
const cardsEl = document.getElementById("cards");
[{{k:"d",l:"Dominants",c:"#7c6af7"}},{{k:"e",l:"Emergents",c:"#f7c76a"}},
 {{k:"h",l:"Habituels",c:"#6af7b8"}},{{k:"x",l:"Declinants",c:"#f76a7c"}}
].forEach(q => {{
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `<div class="card-n" style="color:${{q.c}}">${{cnt[q.k]}}</div><div class="card-l">${{q.l}}</div>`;
  cardsEl.appendChild(el);
}});

const sorted = [...RESULTS].sort((a,b) => {{
  const o = {{d:0,e:1,h:2,x:3}};
  return o[getQ(a)]-o[getQ(b)] || b.freq-a.freq;
}});
const listEl = document.getElementById("sidebar-list");
sorted.forEach(d => {{
  const q=getQ(d), c=QC[q];
  const arr = d.vel>0.65?"++":d.vel>0.52?"+":d.vel<0.35?"--":d.vel<0.48?"-":"=";
  const row = document.createElement("div");
  row.className = "srow";
  row.dataset.theme = d.theme;
  row.innerHTML = `<span class="srow-name">${{d.theme}}<span class="srow-arr">${{arr}}</span></span>`
    + `<span class="srow-badge" style="background:${{c}}22;color:${{c}}">${{QL[q]}}</span>`;
  listEl.appendChild(row);
}});

document.getElementById("status-msg").textContent =
  RESULTS.length + " themes analyses · T0=" + META.t0_label + " · T1=" + META.t1_label + " · " + META.total + " articles · genere le {meta['generated']}";

const svg = document.getElementById("chart");
const tip = document.getElementById("tooltip");

function draw() {{
  const wrap = document.getElementById("chart-wrap");
  const W = wrap.clientWidth || 700;
  const H = wrap.clientHeight || 460;
  const pl=46,pt=34,pr=28,pb=42;
  const cw=W-pl-pr, ch=H-pt-pb;
  const mx=pl+cw/2, my=pt+ch/2;
  const tx = f => pl+f*cw;
  const ty = v => pt+(1-v)*ch;
  const ns = "http://www.w3.org/2000/svg";
  svg.setAttribute("viewBox", `0 0 ${{W}} ${{H}}`);
  svg.innerHTML = "";

  function el(tag, attrs, parent) {{
    const e = document.createElementNS(ns, tag);
    for (const [k,v] of Object.entries(attrs)) e.setAttribute(k,v);
    (parent||svg).appendChild(e);
    return e;
  }}

  [{{x:pl, y:pt, w:cw/2, h:ch/2, c:"#f7c76a", o:0.04}},
   {{x:mx, y:pt, w:cw/2, h:ch/2, c:"#7c6af7", o:0.06}},
   {{x:pl, y:my, w:cw/2, h:ch/2, c:"#f76a7c", o:0.04}},
   {{x:mx, y:my, w:cw/2, h:ch/2, c:"#6af7b8", o:0.04}},
  ].forEach(r => el("rect",{{x:r.x,y:r.y,width:r.w,height:r.h,fill:r.c,"fill-opacity":r.o}}));

  el("line",{{x1:mx,y1:pt,x2:mx,y2:pt+ch,stroke:"#1a1a2e","stroke-width":1,"stroke-dasharray":"3,4"}});
  el("line",{{x1:pl,y1:my,x2:pl+cw,y2:my,stroke:"#1a1a2e","stroke-width":1,"stroke-dasharray":"3,4"}});
  el("line",{{x1:pl,y1:pt+ch,x2:pl+cw,y2:pt+ch,stroke:"#1e1e30","stroke-width":1}});
  el("line",{{x1:pl,y1:pt,x2:pl,y2:pt+ch,stroke:"#1e1e30","stroke-width":1}});

  function txt(x,y,t,anchor,size,fill,op) {{
    const e = el("text",{{x,y,"font-family":"monospace","font-size":size||8,fill:fill||"#55557a","text-anchor":anchor||"start","fill-opacity":op||1}});
    e.textContent = t;
  }}
  txt(pl, pt+ch+18, "RARE");
  txt(pl+cw, pt+ch+18, "FREQUENT", "end");
  txt(pl-5, pt+7, "+", "end", 9);
  txt(pl-5, pt+ch, "-", "end", 9);

  function qlabel(x,y,t,c) {{
    const e = el("text",{{x,y,"font-weight":700,"font-size":9,fill:c,"fill-opacity":0.3,"letter-spacing":"0.08em"}});
    e.textContent = t;
  }}
  qlabel(pl+7, pt+13, "Emergents",  "#f7c76a");
  qlabel(mx+7, pt+13, "Dominants",  "#7c6af7");
  qlabel(pl+7, my+13, "Declinants", "#f76a7c");
  qlabel(mx+7, my+13, "Habituels",  "#6af7b8");

  RESULTS.forEach(d => {{
    const q=getQ(d), c=QC[q];
    const x=tx(d.freq), y=ty(d.vel);
    const r = Math.max(4, Math.min(4+(d.art||1)*0.45, 13));
    const g = el("g",{{}});

    const circle = el("circle",{{cx:x,cy:y,r,fill:c,"fill-opacity":0.18,stroke:c,"stroke-width":1.5}},g);
    const label  = el("text",{{x,y:y-r-3,"font-family":"monospace","font-size":8.5,fill:c,"text-anchor":"middle","pointer-events":"none"}},g);
    label.textContent = d.theme;
    g.style.cursor = "pointer";

    g.addEventListener("mouseenter", evt => {{
      circle.setAttribute("r", r+2);
      circle.setAttribute("fill-opacity", 0.45);
      circle.setAttribute("stroke-width", 2);
      showTip(d, c, q);
      moveTip(evt);
    }});
    g.addEventListener("mouseleave", () => {{
      circle.setAttribute("r", r);
      circle.setAttribute("fill-opacity", 0.18);
      circle.setAttribute("stroke-width", 1.5);
      tip.style.display = "none";
    }});
    g.addEventListener("mousemove", moveTip);
    svg.appendChild(g);
  }});
}}

function showTip(d, c, q) {{
  document.getElementById("tip-theme").textContent = d.theme;
  document.getElementById("tip-theme").style.color = c;
  document.getElementById("tip-q").textContent = QL[q];
  document.getElementById("tip-q").style.color = c;
  document.getElementById("tip-f1").textContent = Math.round(d.freqT1*100)+"%";
  document.getElementById("tip-f0").textContent = Math.round(d.freqT0*100)+"%";
  document.getElementById("tip-vel").textContent = ((d.vel-0.5)*200).toFixed(0)+"%";
  document.getElementById("tip-art").textContent = d.art;
  tip.style.border = "1px solid "+c+"40";
  tip.style.display = "block";
}}

function moveTip(evt) {{
  tip.style.left = (evt.clientX+14)+"px";
  tip.style.top  = (evt.clientY-8)+"px";
}}

document.addEventListener("mousemove", moveTip);

document.querySelectorAll(".srow").forEach(row => {{
  row.addEventListener("mouseenter", () => {{
    const d = RESULTS.find(r => r.theme === row.dataset.theme);
    if (d) {{ const q=getQ(d); showTip(d, QC[q], q); }}
  }});
  row.addEventListener("mouseleave", () => tip.style.display = "none");
}});

draw();
window.addEventListener("resize", draw);
</script>
</body>
</html>"""
    return html

# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Radar Thématique WUDD.ai")
    parser.add_argument("--data", default=str(DEFAULT_DATA), help="Répertoire des JSON WUDD.ai")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Fichier HTML de sortie")
    args = parser.parse_args()

    # Initialisation de la config EurIA (lit .env automatiquement)
    try:
        config = get_config()
        # web_search désactivé : tâche analytique pure sur corpus local
        client = EurIAClient(enable_web_search=False)
    except ValueError as e:
        print_console(f"ERREUR de configuration EurIA : {e}", level="error")
        print_console("Vérifiez que les variables URL et bearer sont définies dans le fichier .env", level="error")
        sys.exit(1)

    data_dir = Path(args.data)
    if not data_dir.exists():
        print_console(f"ERREUR: répertoire introuvable: {data_dir}", level="error")
        sys.exit(1)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print_console(f"[1/4] Chargement des articles depuis {data_dir} ...", level="info")
    articles = load_articles(data_dir)
    print_console(f"      {len(articles)} articles chargés", level="info")

    if not articles:
        print_console("ERREUR: aucun article trouvé.", level="error")
        sys.exit(1)

    print_console("[2/4] Segmentation des périodes ...", level="info")
    t0, t1, oldest, week_end = split_periods(articles)
    now = datetime.now()
    t0_label = now.strftime("%B %Y")
    t1_label = f"{oldest.strftime('%d/%m')} -> {week_end.strftime('%d/%m/%Y')}"
    print_console(f"      T0 ({t0_label}): {len(t0)} articles", level="info")
    print_console(f"      T1 ({t1_label}): {len(t1)} articles", level="info")

    corpus_t0 = format_corpus(t0, limit=35)
    corpus_t1 = format_corpus(t1, limit=20)

    print_console(f"[3/4] Appel API EurIA (Qwen3) pour scorer {len(THEMES)} thèmes ...", level="info")
    try:
        results = call_api(
            client=client,
            corpus_t0=corpus_t0,
            corpus_t1=corpus_t1,
            t0_label=t0_label,
            t1_label=t1_label,
            t0_count=len(t0),
            t1_count=len(t1),
        )
        print_console(f"      {len(results)} thèmes scorés", level="info")
    except Exception as e:
        print_console(f"ERREUR API: {e}", level="error")
        sys.exit(1)

    meta = {
        "t0_label": t0_label,
        "t1_label": t1_label,
        "t0_count": len(t0),
        "t1_count": len(t1),
        "total": len(articles),
        "categories": list({Path(f).parent.name for f in
                            [str(p) for p in Path(data_dir).rglob("*.json")]
                            if Path(f).parent.name != Path(data_dir).name}),
        "generated": now.strftime("%d/%m/%Y %H:%M"),
    }

    print_console(f"[4/4] Génération HTML → {output_path} ...", level="info")
    html = generate_html(results, meta)
    output_path.write_text(html, encoding="utf-8")
    size_kb = output_path.stat().st_size // 1024
    print_console(f"      {size_kb} KB écrits", level="info")
    print_console(f'✓  open "{output_path.resolve()}"', level="info")


if __name__ == "__main__":
    main()
