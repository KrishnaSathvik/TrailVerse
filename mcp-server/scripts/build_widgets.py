"""
Build the 5 TrailVerse widget HTML files.

All widgets share:
  - TrailVerse design tokens (matches themes.css exactly)
  - Geist + Bricolage Grotesque fonts
  - MCP Apps bridge (postMessage JSON-RPC)
  - Common render helpers (escape, markdown, date formatters)

Each widget defines only its own CSS (component-specific) and render() body.
This keeps the 5 files in sync when the shared tokens or bridge change.

Run:
    python scripts/build_widgets.py

Outputs:
    widgets/itinerary.html
    widgets/park-details.html
    widgets/compare.html
    widgets/park-list.html
    widgets/events.html
"""
from pathlib import Path

WIDGETS_DIR = Path(__file__).resolve().parent.parent / "widgets"
WIDGETS_DIR.mkdir(exist_ok=True)

# ---------- Shared pieces ----------

FONT_LINKS = """\
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700&display=swap" rel="stylesheet" />
"""

# CSS tokens exactly matching themes.css. Dark default, light via prefers-color-scheme.
TOKENS_CSS = """\
:root {
  --bg-primary: #0A0E0F;
  --bg-secondary: #131719;
  --bg-tertiary: #1A1F21;
  --surface: rgba(255, 255, 255, 0.05);
  --surface-hover: rgba(255, 255, 255, 0.10);
  --surface-active: rgba(255, 255, 255, 0.15);
  --border: rgba(255, 255, 255, 0.10);
  --border-hover: rgba(255, 255, 255, 0.20);
  --text-primary: #FFFFFF;
  --text-secondary: rgba(255, 255, 255, 0.85);
  --text-tertiary: rgba(255, 255, 255, 0.60);
  --accent-green: #22c55e;
  --accent-green-dark: #16a34a;
  --accent-green-light: rgba(34, 197, 94, 0.15);
  --accent-blue: #0ea5e9;
  --accent-orange: #f97316;
  --error: #ef4444;
  --warning: #f59e0b;
  --shadow-sm: 0 1px 2px 0 rgba(0,0,0,0.5);
  --shadow: 0 4px 6px -1px rgba(0,0,0,0.5);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.5);
  --font-sans: "Geist", "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-display: "Bricolage Grotesque", "Geist", sans-serif;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg-primary: #FEFCF9;
    --bg-secondary: #F9F7F4;
    --bg-tertiary: #F4F1EC;
    --surface: rgba(255, 255, 255, 0.8);
    --surface-hover: rgba(255, 255, 255, 0.9);
    --surface-active: rgba(255, 255, 255, 0.95);
    --border: rgba(0, 0, 0, 0.08);
    --border-hover: rgba(0, 0, 0, 0.12);
    --text-primary: #2D2B28;
    --text-secondary: rgba(45, 43, 40, 0.85);
    --text-tertiary: rgba(45, 43, 40, 0.65);
    --accent-green: #059669;
    --accent-green-dark: #047857;
    --accent-green-light: rgba(5, 150, 105, 0.15);
    --accent-blue: #0369A1;
    --accent-orange: #EA580C;
    --error: #dc2626;
    --shadow-sm: 0 1px 2px 0 rgba(0,0,0,0.04);
    --shadow: 0 4px 6px -1px rgba(0,0,0,0.06);
    --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08);
  }
}

/* Reset */
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; color-scheme: light dark; }
body {
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Shared components */
.tv-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  max-width: 680px;
  margin: 0 auto;
  overflow: hidden;
  animation: tv-fade-in 0.5s ease-out;
}
@keyframes tv-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Button styles — match .btn-primary / .btn-outline from globals.css */
.tv-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: 8px;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s ease;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.tv-btn-primary {
  background: var(--surface);
  color: var(--text-primary);
  border: 1px solid var(--border);
}
.tv-btn-primary:hover {
  background: var(--surface-hover);
  border-color: var(--border-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-lg);
}
.tv-btn-outline {
  background: transparent;
  color: var(--accent-green);
  border: 1px solid var(--accent-green);
}
.tv-btn-outline:hover {
  background: var(--accent-green);
  color: #ffffff;
  transform: translateY(-1px);
  box-shadow: var(--shadow-lg);
}
.tv-btn-arrow {
  font-size: 14px;
  line-height: 1;
  transition: transform 0.2s ease;
}
.tv-btn:hover .tv-btn-arrow { transform: translateX(2px); }

/* Typography primitives */
.tv-display {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  margin: 0;
}
.tv-eyebrow {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent-green);
}
.tv-meta {
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 500;
}

/* Badge / pill */
.tv-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  white-space: nowrap;
}
.tv-badge--green { background: var(--accent-green-light); color: var(--accent-green); border-color: transparent; }
.tv-badge--orange { background: rgba(249, 115, 22, 0.15); color: var(--accent-orange); border-color: transparent; }
.tv-badge--blue { background: rgba(14, 165, 233, 0.15); color: var(--accent-blue); border-color: transparent; }
.tv-badge--red { background: rgba(239, 68, 68, 0.15); color: var(--error); border-color: transparent; }

.tv-fallback {
  padding: 40px 24px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 14px;
}
"""

# Shared JS: MCP Apps bridge + helpers
BRIDGE_JS = """\
let rpcId = 0;
const pending = new Map();
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = ++rpcId; pending.set(id, { resolve, reject });
  window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
});
const notify = (method, params) =>
  window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
let toolOutput = null;
window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const msg = event.data; if (!msg || msg.jsonrpc !== "2.0") return;
  if (typeof msg.id === "number") {
    const p = pending.get(msg.id); if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.reject(msg.error) : p.resolve(msg.result);
    return;
  }
  if (msg.method === "ui/notifications/tool-result") {
    toolOutput = msg.params?.structuredContent || null; render();
  }
});
async function init(appName) {
  try {
    const result = await rpc("ui/initialize", {
      appInfo: { name: appName, version: "1.0.0" },
      appCapabilities: {}, protocolVersion: "2026-01-26",
    });
    notify("ui/notifications/initialized", {});
    if (result?.toolOutput?.structuredContent) toolOutput = result.toolOutput.structuredContent;
    else if (result?.structuredContent) toolOutput = result.structuredContent;
    render();
  } catch (e) { console.error("MCP init failed:", e); render(); }
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

/* Minimal markdown: headings, bold/italic, lists, paragraphs, links, code */
function md(s) {
  if (!s) return "";
  const lines = String(s).split(/\\r?\\n/);
  const out = []; let inList = false; let inOrdered = false;
  const close = () => { if (inList) { out.push(inOrdered ? "</ol>" : "</ul>"); inList = false; inOrdered = false; } };
  const inline = (t) => esc(t)
    .replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>")
    .replace(/\\*(.+?)\\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)]+)\\)/g,
      '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent-green);text-decoration:underline">$1</a>');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { close(); out.push(""); continue; }
    const h = line.match(/^(#{1,3})\\s+(.+)$/);
    if (h) { close(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    const ul = line.match(/^[-*]\\s+(.+)$/);
    if (ul) { if (!inList || inOrdered) { close(); out.push("<ul>"); inList = true; inOrdered = false; } out.push(`<li>${inline(ul[1])}</li>`); continue; }
    const ol = line.match(/^\\d+\\.\\s+(.+)$/);
    if (ol) { if (!inList || !inOrdered) { close(); out.push("<ol>"); inList = true; inOrdered = true; } out.push(`<li>${inline(ol[1])}</li>`); continue; }
    close(); out.push(`<p>${inline(line)}</p>`);
  }
  close(); return out.join("");
}

const fmtDuration = (min) => {
  if (!min) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
const fmtDate = (iso) => {
  if (!iso) return { month: "—", day: "—", weekday: "" };
  const d = new Date(iso);
  if (isNaN(d)) return { month: "—", day: "—", weekday: "" };
  return {
    month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: String(d.getDate()),
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
  };
};
"""


def shell(title: str, component_css: str, render_js: str, app_name: str) -> str:
    """Wrap a widget body in the full HTML shell."""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>TrailVerse — {title}</title>
{FONT_LINKS}<style>
{TOKENS_CSS}

/* ---------- Component-specific ---------- */
{component_css}
</style>
</head>
<body>
<div id="root"></div>
<script type="module">
{BRIDGE_JS}

{render_js}

render(); init("{app_name}");
</script>
</body>
</html>
"""


# ---------- Itinerary widget ----------

ITINERARY_CSS = """
.it-hero {
  padding: 28px 28px 22px;
  border-bottom: 1px solid var(--border);
}
.it-hero-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  gap: 12px;
}
.it-persona {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: var(--accent-green-light);
  color: var(--accent-green);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.it-persona-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--accent-green);
  box-shadow: 0 0 8px var(--accent-green);
}
.it-model {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 500;
}
.it-park {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 32px;
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin: 0 0 4px;
  color: var(--text-primary);
}
.it-subtitle {
  color: var(--text-tertiary);
  font-size: 14px;
  margin: 0;
}

.it-quality {
  display: flex;
  gap: 8px;
  padding: 14px 28px;
  flex-wrap: wrap;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}

.it-narrative {
  padding: 20px 28px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
  border-bottom: 1px solid var(--border);
  max-height: 260px;
  overflow: auto;
}
.it-narrative h1, .it-narrative h2, .it-narrative h3 {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--text-primary);
  margin: 18px 0 8px;
  letter-spacing: -0.01em;
}
.it-narrative h1 { font-size: 20px; }
.it-narrative h2 { font-size: 17px; }
.it-narrative h3 { font-size: 15px; }
.it-narrative p { margin: 0 0 12px; }
.it-narrative ul, .it-narrative ol { padding-left: 20px; margin: 0 0 12px; }
.it-narrative strong { color: var(--text-primary); font-weight: 600; }
.it-narrative code {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 1px 6px;
  border-radius: 4px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 0.9em;
}

.it-days { padding: 4px 0; }
.it-day {
  padding: 20px 28px;
  border-bottom: 1px solid var(--border);
}
.it-day:last-child { border-bottom: none; }
.it-day-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.it-day-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  background: var(--accent-green);
  color: #0A0E0F;
  border-radius: 8px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}
.it-day-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.01em;
  flex: 1;
  min-width: 0;
}

.it-stops {
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
  padding-left: 8px;
}
.it-stop {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 14px;
  padding: 10px 0;
  position: relative;
  align-items: start;
}
.it-stop-time {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  padding-top: 2px;
  font-variant-numeric: tabular-nums;
}
.it-stop-body { min-width: 0; }
.it-stop-name {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.it-stop-name-text {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.3;
}
.it-stop-why {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
  margin: 0 0 6px;
}
.it-stop-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 500;
}
.it-stop-meta > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.it-footer {
  padding: 18px 28px 22px;
  background: var(--bg-secondary);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.it-footer-note {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.5;
  flex: 1;
  min-width: 200px;
}
.it-footer-note strong {
  color: var(--text-primary);
  font-weight: 600;
}
"""

ITINERARY_JS = """
function render() {
  const root = document.getElementById("root");
  const d = toolOutput;
  if (!d) { root.innerHTML = `<div class="tv-card"><div class="tv-fallback">Preparing your trip…</div></div>`; return; }
  if (d.kind === "error") {
    root.innerHTML = `<div class="tv-card"><div class="tv-fallback">${esc(d.message || "Something went wrong.")}</div></div>`;
    return;
  }

  const conf = d.confidence || {};
  const score = d.planScore || {};
  const it = d.itinerary;
  const parkName = d.parkName || "Trip Plan";
  const isLocal = d.persona === "local";
  const personaLabel = isLocal ? "The Local" : "The Planner";
  const dayCount = it?.days?.length || 0;

  let html = `<div class="tv-card">
    <div class="it-hero">
      <div class="it-hero-top">
        <span class="it-persona"><span class="it-persona-dot"></span>${esc(personaLabel)}</span>
        ${d.model ? `<span class="it-model">${esc(d.model)}</span>` : ""}
      </div>
      <h1 class="it-park">${esc(parkName)}</h1>
      <p class="it-subtitle">${dayCount ? `${dayCount}-day itinerary` : "Trip plan"}${d.intent ? ` · optimized for ${esc(d.intent.replace(/_/g, " "))}` : ""}</p>
    </div>`;

  // Quality pills
  if (conf.level || score.label) {
    const confToClass = { high: "tv-badge--green", medium: "tv-badge--orange", low: "tv-badge--red" };
    const scoreToClass = { "Excellent": "tv-badge--green", "Good": "tv-badge--green", "Fair": "tv-badge--orange", "Needs Improvement": "tv-badge--red" };
    html += `<div class="it-quality">`;
    if (conf.level) html += `<span class="tv-badge ${confToClass[conf.level] || ""}">${esc(conf.level)} confidence</span>`;
    if (score.label) html += `<span class="tv-badge ${scoreToClass[score.label] || ""}">plan · ${esc(score.label)}</span>`;
    html += `</div>`;
  }

  if (d.narrative) html += `<div class="it-narrative">${md(d.narrative)}</div>`;

  if (it?.days?.length) {
    html += `<div class="it-days">`;
    for (const day of it.days) {
      html += `<div class="it-day">
        <div class="it-day-head">
          <span class="it-day-num">${esc(day.dayNumber || "")}</span>
          <span class="it-day-title">${esc(day.label || `Day ${day.dayNumber}`)}</span>
        </div>
        <div class="it-stops">`;
      for (const stop of (day.stops || [])) {
        const diff = (stop.difficulty || "").toLowerCase();
        const diffClass = diff === "easy" ? "tv-badge--green" :
                          diff === "moderate" ? "tv-badge--blue" :
                          diff === "strenuous" ? "tv-badge--orange" : "";
        html += `<div class="it-stop">
          <div class="it-stop-time">${esc(stop.startTime || "—")}</div>
          <div class="it-stop-body">
            <div class="it-stop-name">
              <span class="it-stop-name-text">${esc(stop.name || "Stop")}</span>
              ${diff ? `<span class="tv-badge ${diffClass}">${esc(diff)}</span>` : ""}
              ${stop.permitRequired ? `<span class="tv-badge tv-badge--orange">permit</span>` : ""}
            </div>
            ${stop.why ? `<p class="it-stop-why">${esc(stop.why)}</p>` : ""}
            <div class="it-stop-meta">
              ${stop.duration ? `<span>⏱ ${esc(fmtDuration(stop.duration))}</span>` : ""}
              ${stop.drivingTimeFromPreviousMin ? `<span>→ ${esc(stop.drivingTimeFromPreviousMin)} min drive</span>` : ""}
              ${stop.type ? `<span>${esc(stop.type.replace(/_/g, " "))}</span>` : ""}
            </div>
          </div>
        </div>`;
      }
      html += `</div></div>`;
    }
    html += `</div>`;
  }

  const contLink = d.links?.continueOnWebsite || "https://www.nationalparksexplorerusa.com/plan-ai";
  html += `<div class="it-footer">
    <div class="it-footer-note">
      <strong>5 free messages / 48h.</strong> Continue on TrailVerse for unlimited planning,
      web search, and save &amp; share.
    </div>
    <a class="tv-btn tv-btn-outline" href="${esc(contLink)}" target="_blank" rel="noopener">
      Continue planning <span class="tv-btn-arrow">→</span>
    </a>
  </div></div>`;

  root.innerHTML = html;
}
"""


# ---------- Park details widget ----------

PARK_DETAILS_CSS = """
.pd-hero {
  position: relative;
  height: 240px;
  background: var(--bg-tertiary);
  overflow: hidden;
}
.pd-hero img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.pd-hero::after {
  content: "";
  position: absolute; inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.4) 100%);
}
.pd-hero-overlay {
  position: absolute; inset: 0; z-index: 1;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.pd-hero-top { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
.pd-hero-bottom { }
.pd-park-code {
  display: inline-block;
  padding: 4px 10px;
  background: rgba(255,255,255,0.15);
  backdrop-filter: blur(10px);
  color: #fff;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.pd-alert-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: var(--accent-orange);
  color: #fff;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.pd-park-name {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 34px;
  line-height: 1.05;
  letter-spacing: -0.025em;
  color: #fff;
  margin: 0 0 6px;
  text-shadow: 0 2px 16px rgba(0,0,0,0.4);
}
.pd-park-sub {
  color: rgba(255,255,255,0.9);
  font-size: 13px;
  font-weight: 500;
  margin: 0;
}

.pd-section {
  padding: 20px 28px;
  border-bottom: 1px solid var(--border);
}
.pd-section:last-child { border-bottom: none; }
.pd-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 12px;
}
.pd-section-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
}

.pd-weather-row {
  display: flex;
  align-items: baseline;
  gap: 20px;
  flex-wrap: wrap;
}
.pd-temp {
  font-family: var(--font-display);
  font-size: 56px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--text-primary);
}
.pd-temp-unit {
  font-size: 22px;
  color: var(--text-tertiary);
  margin-left: 2px;
  font-weight: 500;
}
.pd-condition {
  flex: 1;
  min-width: 120px;
}
.pd-condition-text {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0 0 4px;
}
.pd-condition-meta {
  font-size: 12px;
  color: var(--text-tertiary);
}
.pd-condition-meta > span { margin-right: 10px; }

.pd-forecast {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-top: 16px;
}
.pd-forecast-day {
  padding: 10px 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  text-align: center;
}
.pd-forecast-date {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}
.pd-forecast-temp {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.pd-forecast-low {
  color: var(--text-tertiary);
  font-weight: 500;
  font-size: 13px;
  margin-left: 4px;
}

.pd-alerts { display: flex; flex-direction: column; gap: 10px; }
.pd-alert {
  padding: 12px 14px;
  background: rgba(249, 115, 22, 0.08);
  border: 1px solid rgba(249, 115, 22, 0.25);
  border-radius: 10px;
}
.pd-alert-cat {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent-orange);
  margin-bottom: 4px;
}
.pd-alert-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
  margin: 0 0 4px;
}
.pd-alert-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

.pd-editorial {
  padding: 22px 28px;
  background: linear-gradient(135deg, var(--accent-green-light) 0%, transparent 100%);
  border-bottom: 1px solid var(--border);
}
.pd-editorial-lead {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--text-primary);
  margin: 0 0 16px;
  letter-spacing: -0.01em;
}
.pd-editorial-lead::before {
  content: "—  ";
  color: var(--accent-green);
  font-weight: 600;
}
.pd-editorial-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}
.pd-editorial-card {
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.pd-editorial-card-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent-green);
  margin-bottom: 6px;
}
.pd-editorial-card-body {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.55;
  margin: 0;
}

.pd-desc {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.pd-activities {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pd-fees { display: flex; flex-direction: column; gap: 8px; }
.pd-fee {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.pd-fee:last-child { border-bottom: none; padding-bottom: 0; }
.pd-fee-label { color: var(--text-secondary); }
.pd-fee-price {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.pd-footer {
  padding: 18px 28px 22px;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  flex-wrap: wrap;
  background: var(--bg-secondary);
}
"""

PARK_DETAILS_JS = """
function render() {
  const root = document.getElementById("root");
  const d = toolOutput;
  if (!d) { root.innerHTML = `<div class="tv-card"><div class="tv-fallback">Loading park…</div></div>`; return; }
  if (d.kind === "error") { root.innerHTML = `<div class="tv-card"><div class="tv-fallback">${esc(d.message)}</div></div>`; return; }

  const weather = d.weather?.current || {};
  const forecast = d.weather?.forecast || [];
  const alerts = d.alerts || [];
  const activities = d.activities || [];
  const fees = d.entranceFees || [];
  const ed = d.editorial;

  let html = `<div class="tv-card">`;

  // Hero
  html += `<div class="pd-hero">`;
  if (d.heroImage) html += `<img src="${esc(d.heroImage)}" alt="" loading="lazy" />`;
  html += `<div class="pd-hero-overlay">
    <div class="pd-hero-top">
      ${d.parkCode ? `<span class="pd-park-code">${esc(d.parkCode)}</span>` : ""}
      ${alerts.length ? `<span class="pd-alert-pill">⚠ ${alerts.length} alert${alerts.length > 1 ? "s" : ""}</span>` : ""}
    </div>
    <div class="pd-hero-bottom">
      <h1 class="pd-park-name">${esc(d.name || "Park")}</h1>
      <p class="pd-park-sub">${esc(d.designation || "")}${d.states ? ` · ${esc(d.states)}` : ""}</p>
    </div>
  </div></div>`;

  // Weather
  if (weather.tempF != null || weather.description) {
    html += `<div class="pd-section">
      <div class="pd-section-head"><div class="pd-section-title">Current conditions</div></div>
      <div class="pd-weather-row">`;
    if (weather.tempF != null) {
      html += `<div class="pd-temp">${esc(Math.round(weather.tempF))}<span class="pd-temp-unit">°F</span></div>`;
    }
    html += `<div class="pd-condition">`;
    if (weather.description) html += `<div class="pd-condition-text">${esc(weather.description)}</div>`;
    html += `<div class="pd-condition-meta">`;
    if (weather.humidity != null) html += `<span>humidity ${esc(weather.humidity)}%</span>`;
    if (weather.windMph != null) html += `<span>wind ${esc(Math.round(weather.windMph))} mph</span>`;
    html += `</div></div></div>`;
    if (forecast.length) {
      html += `<div class="pd-forecast">`;
      for (const f of forecast.slice(0, 5)) {
        const date = f.date ? new Date(f.date).toLocaleDateString("en-US", { weekday: "short" }) : "—";
        html += `<div class="pd-forecast-day">
          <div class="pd-forecast-date">${esc(date)}</div>
          <div class="pd-forecast-temp">${f.highF != null ? esc(Math.round(f.highF)) + "°" : "—"}${f.lowF != null ? `<span class="pd-forecast-low">${esc(Math.round(f.lowF))}°</span>` : ""}</div>
        </div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  // Editorial (only if same-park feed is present)
  if (ed && (ed.leadInsight || ed.weatherInsight || ed.skyInsight || ed.atAGlance)) {
    html += `<div class="pd-editorial">`;
    if (ed.leadInsight) html += `<p class="pd-editorial-lead">${esc(ed.leadInsight)}</p>`;
    const cards = [
      ["Weather read", ed.weatherInsight],
      ["Sky & stars", ed.skyInsight],
      ["At a glance", ed.atAGlance],
    ].filter(([, v]) => v);
    if (cards.length) {
      html += `<div class="pd-editorial-grid">`;
      for (const [label, body] of cards) {
        const trimmed = String(body).slice(0, 180);
        html += `<div class="pd-editorial-card">
          <div class="pd-editorial-card-label">${esc(label)}</div>
          <p class="pd-editorial-card-body">${esc(trimmed)}${String(body).length > 180 ? "…" : ""}</p>
        </div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  // Alerts detail
  if (alerts.length) {
    html += `<div class="pd-section">
      <div class="pd-section-head"><div class="pd-section-title">Active alerts</div></div>
      <div class="pd-alerts">`;
    for (const a of alerts.slice(0, 3)) {
      html += `<div class="pd-alert">
        ${a.category ? `<div class="pd-alert-cat">${esc(a.category)}</div>` : ""}
        <p class="pd-alert-title">${esc(a.title || "Alert")}</p>
        ${a.description ? `<p class="pd-alert-desc">${esc(a.description)}</p>` : ""}
      </div>`;
    }
    html += `</div></div>`;
  }

  // Description
  if (d.description) {
    const short = String(d.description).slice(0, 340);
    html += `<div class="pd-section">
      <div class="pd-section-head"><div class="pd-section-title">Overview</div></div>
      <p class="pd-desc">${esc(short)}${String(d.description).length > 340 ? "…" : ""}</p>
    </div>`;
  }

  // Activities
  if (activities.length) {
    html += `<div class="pd-section">
      <div class="pd-section-head"><div class="pd-section-title">Activities</div></div>
      <div class="pd-activities">
        ${activities.slice(0, 10).map(a => `<span class="tv-badge">${esc(a)}</span>`).join("")}
      </div>
    </div>`;
  }

  // Fees
  if (fees.length) {
    html += `<div class="pd-section">
      <div class="pd-section-head"><div class="pd-section-title">Entrance</div></div>
      <div class="pd-fees">`;
    for (const f of fees.slice(0, 3)) {
      html += `<div class="pd-fee">
        <span class="pd-fee-label">${esc(f.title || f.description || "Fee")}</span>
        <span class="pd-fee-price">$${esc(f.cost || "—")}</span>
      </div>`;
    }
    html += `</div></div>`;
  }

  // Footer
  html += `<div class="pd-footer">
    <a class="tv-btn tv-btn-primary" href="${esc(d.links?.trailverse || "https://www.nationalparksexplorerusa.com")}" target="_blank" rel="noopener">View on TrailVerse</a>
    <a class="tv-btn tv-btn-outline" href="${esc(d.links?.planTrip || "https://www.nationalparksexplorerusa.com/plan-ai")}" target="_blank" rel="noopener">
      Plan a trip <span class="tv-btn-arrow">→</span>
    </a>
  </div></div>`;

  root.innerHTML = html;
}
"""


# ---------- Compare widget ----------

COMPARE_CSS = """
.cmp-head {
  padding: 24px 28px 18px;
  border-bottom: 1px solid var(--border);
}
.cmp-eyebrow {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent-green);
  margin-bottom: 8px;
  display: block;
}
.cmp-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 26px;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--text-primary);
}
.cmp-title .vs { color: var(--text-tertiary); font-weight: 500; font-size: 0.75em; margin: 0 8px; }

.cmp-highlights {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 28px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}
.cmp-highlight {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 12px;
  font-size: 13px;
  align-items: baseline;
}
.cmp-highlight-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent-green);
}
.cmp-highlight-value { color: var(--text-secondary); }
.cmp-highlight-value strong { color: var(--text-primary); font-weight: 600; }

.cmp-cols {
  display: grid;
  border-bottom: 1px solid var(--border);
}
.cmp-col {
  padding: 16px;
  border-right: 1px solid var(--border);
}
.cmp-col:last-child { border-right: none; }
.cmp-thumb {
  width: 100%;
  aspect-ratio: 16/10;
  border-radius: 10px;
  background: var(--bg-tertiary);
  overflow: hidden;
  margin-bottom: 12px;
}
.cmp-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cmp-col-code {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent-green);
  margin-bottom: 4px;
}
.cmp-col-name {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 3px;
  line-height: 1.2;
}
.cmp-col-sub {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 500;
}

.cmp-grid {
  display: grid;
  font-size: 13px;
}
.cmp-grid-label {
  padding: 12px 14px;
  background: var(--bg-secondary);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--border);
  border-right: 1px solid var(--border);
  display: flex;
  align-items: center;
}
.cmp-grid-cell {
  padding: 12px 14px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
  border-right: 1px solid var(--border);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
}
.cmp-grid-cell:last-child,
.cmp-grid-label:last-child { border-right: none; }
.cmp-grid-cell strong {
  color: var(--text-primary);
  font-weight: 600;
  font-family: var(--font-display);
}
.cmp-stars { color: var(--accent-green); letter-spacing: 2px; }
.cmp-footer {
  padding: 16px 28px 20px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  background: var(--bg-secondary);
}
"""

COMPARE_JS = """
function render() {
  const root = document.getElementById("root");
  const d = toolOutput;
  if (!d) { root.innerHTML = `<div class="tv-card"><div class="tv-fallback">Loading comparison…</div></div>`; return; }
  if (d.kind === "error") { root.innerHTML = `<div class="tv-card"><div class="tv-fallback">${esc(d.message)}</div></div>`; return; }

  const parks = d.parks || [];
  const h = d.highlights || {};
  const n = parks.length;
  if (!n) { root.innerHTML = `<div class="tv-card"><div class="tv-fallback">No parks to compare.</div></div>`; return; }

  const stars = (r) => {
    if (r == null) return "—";
    const full = Math.round(r);
    return "★".repeat(Math.min(5, full)) + "<span style=\\"color:var(--text-tertiary)\\">" + "★".repeat(Math.max(0, 5 - full)) + "</span>";
  };

  const names = parks.map(p => p.name).filter(Boolean);
  let html = `<div class="tv-card">
    <div class="cmp-head">
      <span class="cmp-eyebrow">Side by side</span>
      <h1 class="cmp-title">${names.map(esc).join('<span class="vs">vs</span>')}</h1>
    </div>`;

  // Highlights
  const hItems = [];
  if (h.bestOverall) hItems.push(["Best overall", `<strong>${esc(h.bestOverall)}</strong>`]);
  if (h.warmest) hItems.push(["Warmest", `<strong>${esc(h.warmest)}</strong>`]);
  if (h.lowerCrowd) hItems.push(["Fewer crowds", `<strong>${esc(h.lowerCrowd)}</strong>`]);
  if (h.sharedHighlights?.length) hItems.push(["Both offer", esc(h.sharedHighlights.slice(0, 3).join(", "))]);
  if (hItems.length) {
    html += `<div class="cmp-highlights">`;
    for (const [label, value] of hItems) {
      html += `<div class="cmp-highlight"><span class="cmp-highlight-label">${esc(label)}</span><span class="cmp-highlight-value">${value}</span></div>`;
    }
    html += `</div>`;
  }

  // Park columns
  html += `<div class="cmp-cols" style="grid-template-columns:repeat(${n}, 1fr)">`;
  for (const p of parks) {
    html += `<div class="cmp-col">
      <div class="cmp-thumb">${p.heroImage ? `<img src="${esc(p.heroImage)}" alt="" loading="lazy" />` : ""}</div>
      ${p.parkCode ? `<div class="cmp-col-code">${esc(p.parkCode)}</div>` : ""}
      <h3 class="cmp-col-name">${esc(p.name || "")}</h3>
      <div class="cmp-col-sub">${esc(p.designation || "")}${p.states ? ` · ${esc(p.states)}` : ""}</div>
    </div>`;
  }
  html += `</div>`;

  // Facts grid
  const gridCols = `140px repeat(${n}, 1fr)`;
  html += `<div class="cmp-grid" style="grid-template-columns:${gridCols}">`;
  const rows = [
    ["Rating", (p) => p.rating != null ? `<span class="cmp-stars">${stars(p.rating)}</span> <span style="color:var(--text-tertiary);font-size:11px;margin-left:4px">${p.reviewCount || 0}</span>` : "—"],
    ["Current temp", (p) => p.currentTempF != null ? `<strong>${Math.round(p.currentTempF)}°F</strong>` : "—"],
    ["Crowd level", (p) => esc(p.crowdLevel || "—")],
    ["Entrance fee", (p) => esc(p.entranceFee || "—")],
    ["Top activities", (p) => esc((p.topActivities || []).slice(0, 3).join(", ") || "—")],
  ];
  for (const [label, fn] of rows) {
    html += `<div class="cmp-grid-label">${esc(label)}</div>`;
    for (const p of parks) {
      const content = fn(p);
      const plainTitle = String(content).replace(/<[^>]+>/g, "");
      html += `<div class="cmp-grid-cell" title="${esc(plainTitle)}">${content}</div>`;
    }
  }
  html += `</div>`;

  // Footer
  const allLink = d.links?.continueOnWebsite || "https://www.nationalparksexplorerusa.com/compare";
  const tripLink = d.links?.planRoadTrip;
  html += `<div class="cmp-footer">
    <a class="tv-btn tv-btn-primary" href="${esc(allLink)}" target="_blank" rel="noopener">Open full comparison</a>
    ${tripLink ? `<a class="tv-btn tv-btn-outline" href="${esc(tripLink)}" target="_blank" rel="noopener">Plan a road trip <span class="tv-btn-arrow">→</span></a>` : ""}
  </div></div>`;

  root.innerHTML = html;
}
"""


# ---------- Park list (search results) ----------

PARK_LIST_CSS = """
.pl-head {
  padding: 22px 28px 16px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.pl-head-left .eyebrow {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent-green);
  margin-bottom: 6px;
  display: block;
}
.pl-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--text-primary);
}
.pl-count {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 500;
}

.pl-grid {
  padding: 16px 20px 20px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
@media (max-width: 480px) { .pl-grid { grid-template-columns: 1fr; } }

.pl-park {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  backdrop-filter: blur(20px);
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.pl-park:hover {
  transform: translateY(-2px);
  border-color: var(--border-hover);
  box-shadow: var(--shadow-lg);
}
.pl-thumb {
  position: relative;
  aspect-ratio: 16/10;
  overflow: hidden;
  background: var(--bg-tertiary);
}
.pl-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pl-code {
  position: absolute;
  top: 10px; left: 10px;
  padding: 4px 9px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(10px);
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.pl-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.pl-name {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 2px;
  line-height: 1.2;
  letter-spacing: -0.01em;
}
.pl-designation {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.pl-summary {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 6px 0 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pl-rating {
  color: var(--accent-green);
  font-size: 12px;
  font-weight: 600;
  margin-top: auto;
  padding-top: 8px;
}
.pl-footer {
  padding: 14px 28px 20px;
  text-align: center;
  background: var(--bg-secondary);
}
"""

PARK_LIST_JS = """
function render() {
  const root = document.getElementById("root");
  const d = toolOutput;
  if (!d) { root.innerHTML = `<div class="tv-card"><div class="tv-fallback">Searching parks…</div></div>`; return; }
  if (d.kind === "error") { root.innerHTML = `<div class="tv-card"><div class="tv-fallback">${esc(d.message)}</div></div>`; return; }

  const parks = d.parks || [];
  if (!parks.length) {
    root.innerHTML = `<div class="tv-card">
      <div class="pl-head">
        <div class="pl-head-left">
          <span class="eyebrow">Search</span>
          <h1 class="pl-title">No parks found</h1>
        </div>
      </div>
      <div class="tv-fallback">Try a different query, state, or activity.</div>
    </div>`;
    return;
  }

  let html = `<div class="tv-card">
    <div class="pl-head">
      <div class="pl-head-left">
        <span class="eyebrow">Search results</span>
        <h1 class="pl-title">${esc(parks.length)} park${parks.length !== 1 ? "s" : ""}</h1>
      </div>
      <span class="pl-count">Showing ${esc(parks.length)} of ${esc(d.count || parks.length)}</span>
    </div>
    <div class="pl-grid">`;

  for (const p of parks) {
    const href = p.link || "#";
    html += `<a class="pl-park" href="${esc(href)}" target="_blank" rel="noopener">
      <div class="pl-thumb">
        ${p.heroImage ? `<img src="${esc(p.heroImage)}" alt="" loading="lazy" />` : ""}
        ${p.parkCode ? `<span class="pl-code">${esc(p.parkCode)}</span>` : ""}
      </div>
      <div class="pl-body">
        <h3 class="pl-name">${esc(p.name || "")}</h3>
        <div class="pl-designation">${esc(p.designation || "")}${p.states ? ` · ${esc(p.states)}` : ""}</div>
        ${p.summary ? `<p class="pl-summary">${esc(p.summary)}</p>` : ""}
        ${p.rating != null ? `<div class="pl-rating">★ ${esc(p.rating.toFixed ? p.rating.toFixed(1) : p.rating)}</div>` : ""}
      </div>
    </a>`;
  }
  html += `</div>
    <div class="pl-footer">
      <a class="tv-btn tv-btn-outline" href="${esc(d.links?.exploreAll || "https://www.nationalparksexplorerusa.com/explore")}" target="_blank" rel="noopener">
        Explore all 470+ parks <span class="tv-btn-arrow">→</span>
      </a>
    </div>
  </div>`;

  root.innerHTML = html;
}
"""


# ---------- Events widget ----------

EVENTS_CSS = """
.ev-head {
  padding: 22px 28px 16px;
  border-bottom: 1px solid var(--border);
}
.ev-eyebrow {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent-green);
  margin-bottom: 6px;
  display: block;
}
.ev-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0;
  color: var(--text-primary);
}
.ev-title em { color: var(--text-tertiary); font-style: normal; font-weight: 500; font-size: 0.8em; }

.ev-list { padding: 4px 0; }
.ev-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 16px;
  padding: 18px 28px;
  border-bottom: 1px solid var(--border);
  align-items: start;
}
.ev-row:last-child { border-bottom: none; }

.ev-date {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px 6px;
  text-align: center;
}
.ev-date-month {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent-green);
  margin-bottom: 2px;
}
.ev-date-day {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1;
  margin: 2px 0;
}
.ev-date-weekday {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
}

.ev-body { min-width: 0; }
.ev-cat {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent-orange);
  margin-bottom: 4px;
}
.ev-ev-title {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
.ev-park {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}
.ev-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.55;
  margin: 0 0 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ev-meta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--text-tertiary);
  align-items: center;
}
.ev-meta > span { display: inline-flex; gap: 4px; align-items: center; }
.ev-register {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--accent-green);
  color: var(--accent-green);
  font-size: 11px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.15s ease;
}
.ev-register:hover {
  background: var(--accent-green);
  color: #fff;
}
.ev-footer {
  padding: 14px 28px 20px;
  text-align: center;
  background: var(--bg-secondary);
}
"""

EVENTS_JS = """
function render() {
  const root = document.getElementById("root");
  const d = toolOutput;
  if (!d) { root.innerHTML = `<div class="tv-card"><div class="tv-fallback">Loading events…</div></div>`; return; }
  if (d.kind === "error") { root.innerHTML = `<div class="tv-card"><div class="tv-fallback">${esc(d.message)}</div></div>`; return; }

  const events = d.events || [];
  if (!events.length) {
    root.innerHTML = `<div class="tv-card">
      <div class="ev-head"><span class="ev-eyebrow">Events</span><h1 class="ev-title">No upcoming events</h1></div>
      <div class="tv-fallback">Try a different park or date range.</div>
    </div>`;
    return;
  }

  let html = `<div class="tv-card">
    <div class="ev-head">
      <span class="ev-eyebrow">Events &amp; ranger programs</span>
      <h1 class="ev-title">${esc(events.length)} upcoming <em>— this season</em></h1>
    </div>
    <div class="ev-list">`;

  for (const e of events) {
    const dt = fmtDate(e.date);
    html += `<div class="ev-row">
      <div class="ev-date">
        <div class="ev-date-month">${esc(dt.month)}</div>
        <div class="ev-date-day">${esc(dt.day)}</div>
        <div class="ev-date-weekday">${esc(dt.weekday)}</div>
      </div>
      <div class="ev-body">
        ${e.category ? `<div class="ev-cat">${esc(e.category)}</div>` : ""}
        <h3 class="ev-ev-title">${esc(e.title || "Event")}</h3>
        ${e.parkName || e.parkCode ? `<div class="ev-park">${esc(e.parkName || e.parkCode)}</div>` : ""}
        ${e.description ? `<p class="ev-desc">${esc(e.description)}</p>` : ""}
        <div class="ev-meta">
          ${e.time ? `<span>⏱ ${esc(e.time)}${e.duration ? ` · ${esc(e.duration)}` : ""}</span>` : ""}
          ${e.location ? `<span>📍 ${esc(e.location)}</span>` : ""}
          ${e.registrationUrl ? `<a class="ev-register" href="${esc(e.registrationUrl)}" target="_blank" rel="noopener">Register →</a>` : ""}
        </div>
      </div>
    </div>`;
  }
  html += `</div>
    <div class="ev-footer">
      <a class="tv-btn tv-btn-outline" href="${esc(d.links?.browseAll || "https://www.nationalparksexplorerusa.com/events")}" target="_blank" rel="noopener">
        Browse all events <span class="tv-btn-arrow">→</span>
      </a>
    </div>
  </div>`;

  root.innerHTML = html;
}
"""


# ---------- Build ----------

WIDGETS = [
    ("itinerary",     "Itinerary",     ITINERARY_CSS,     ITINERARY_JS,     "trailverse-itinerary"),
    ("park-details",  "Park Details",  PARK_DETAILS_CSS,  PARK_DETAILS_JS,  "trailverse-park-details"),
    ("compare",       "Compare",       COMPARE_CSS,       COMPARE_JS,       "trailverse-compare"),
    ("park-list",     "Parks",         PARK_LIST_CSS,     PARK_LIST_JS,     "trailverse-park-list"),
    ("events",        "Events",        EVENTS_CSS,        EVENTS_JS,        "trailverse-events"),
]


def main() -> None:
    for slug, title, css, js, app_name in WIDGETS:
        out = WIDGETS_DIR / f"{slug}.html"
        out.write_text(shell(title, css, js, app_name))
        print(f"Wrote {out}  ({len(out.read_text()):,} chars)")


if __name__ == "__main__":
    main()
