/**
 * next-steps — LLM-gestützte „Nächste Schritte“-Vorschläge für Hermes Desktop.
 *
 * KERN: Nach jeder Agent-Antwort (Gateway-Event „message.complete“, MIT session_id)
 * erzeugt das lokale Ollama 3–5 Schritte — gespeichert PRO SESSION. Jeder Session-Tab
 * hat eigene Vorschläge, eigene Ausrichtung, eigenen Schritt-Stil und eigenes
 * Standard-Ziel. Ein Klick auf einen Chip sendet den Schritt ans gewählte Ziel.
 *
 * ZIELE (Pro Chip ein Ziel-Icon ⌖): aktueller Session-Tab · neuer Session-Tab ·
 * Bot (profiles.list → session.create auf dem Bot-Profil → openSession → submit) ·
 * Kanban (gateway slash.exec „kanban add …“, Fallback: Clipboard + /kanban).
 *
 * OPTIONS-CHIP (⚙): EIN Chip im selben Frost-Design wie die Schritt-Chips; sein
 * Popover hat Subtabs Focus · Model · Design · Language · Targets. Dieselben
 * Gruppen — mit Erklärtexten — auch als Einstellungsseite (/next-steps) plus
 * Sidebar-Navigation „Next Steps“.
 *
 * MODELL-PROFILE: „decision“ (winzige Decision-Modelle: ultrakurze Schritte,
 * kleines num_predict/num_ctx, strenger Kontrakt, langes Timeout) und „llm“
 * (normale Sprachmodelle). Auto erkennt ≤2B-Modelle am Tag. Temperatur,
 * num_ctx, keep_alive einstellbar; Hermes-Modell übernehmbar (host.state.model).
 *
 * SPRACHE: UI + Vorschläge en/de — „inherit“ folgt Hermes, en/de überschreiben
 * nur dieses Plugin (SDK-Kette: appLocale → en → key).
 *
 * Modell: „ornith-1.5:9b“ via /api/chat, format:"json". tev1:0.8b ist ein reines
 * Decision-Modell (nur /v1/systemone) — mit Profil „decision“ als Vorschlagsquelle
 * versuchbar, sofern es /api/chat spricht.
 */

import {
  APPEARANCE_AREAS, atom, Codicon, COMPOSER_AREAS, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
  host, ModelCatalogMenu, ModelMenuCloseContext, Popover, PopoverContent, PopoverTrigger,
  ROUTES_AREA, SIDEBAR_NAV_AREA, Tip, usePluginI18n, useValue
} from '@hermes/plugin-sdk'
import { useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'next-steps'
const MODEL_DEFAULT = 'ornith-1.5:9b'
const PORT_DEFAULT = 11434
const HISTORY_ROWS = 8
const DEBOUNCE_MS = 1200
const MAX_SESSION_STATES = 40 // Speicher-Kappung: nur die 40 zuletzt geschriebenen Sessions
const HANDOFF_ROWS = 6       // Übergabe-Kurzfassung: letzte N Nachrichten

// --------------------------------------------------------------------------
// i18n — en + de (Resolution: App-Locale → en → key; Override pro Plugin)
// --------------------------------------------------------------------------

const STRINGS = {
  en: {
    tag: 'en',
    tabFocus: 'Focus', tabModel: 'Model', tabDesign: 'Design', tabLang: 'Language', tabTargets: 'Targets',
    focusHead: 'Prediction focus', styleHead: 'Step style',
    focusTip: 'Focus: {0} — {1}', styleTip: 'Style: {0} — {1}',
    cat_auto: 'Auto', cat_auto_hint: 'Detect the domain from the transcript and pick the matching lens.',
    cat_coding: 'Coding', cat_coding_hint: 'Software work. Methods: smallest verifiable steps, tests first, fix causes not symptoms, one topic per step, clean commit cuts.',
    cat_produkt: 'Product', cat_produkt_hint: 'Product work. Methods: user value first, thin MVP slices, surface assumptions and risks, prepare decisions with options.',
    cat_marketing: 'Marketing & Content', cat_marketing_hint: 'Marketing. Methods: name audience and funnel stage, message before channel, clear CTA, keep messaging consistent with existing material.',
    cat_ideation: 'Ideation', cat_ideation_hint: 'Creative work. Methods: diverge first (several alternatives, unusual ones too), then converge (criteria, choice), make relationships visible.',
    cat_betrieb: 'Ops & DevOps', cat_betrieb_hint: 'Operations. Methods: stability before novelty, observability (logs/metrics), a rollback path, keep risks small and isolated.',
    cat_research: 'Research & Analysis', cat_research_hint: 'Analysis. Methods: verify sources and counter-sample, criteria before findings, condense the result into a decision memo.',
    cat_methodik: 'Methods & Best Practices', cat_methodik_hint: 'Best-practice work. Methods: apply established procedures and standards, benchmark against reference solutions, think in checklists and reviews, plan experiments with clear hypotheses, document results and close learning loops.',
    cat_custom: 'Custom',
    sty_auto: 'Auto', sty_auto_hint: 'Pick the fitting kind per step; mix sensibly.',
    sty_sofort: 'Ready to run', sty_sofort_hint: 'Only immediately executable micro-steps (under 2 minutes), phrased imperatively.',
    sty_planung: 'Planning', sty_planung_hint: 'Planning and structuring steps: decompose, prioritize, set an order.',
    sty_vertiefen: 'Deepen', sty_vertiefen_hint: 'Analysis and research steps: investigate, compare, assess, check relationships.',
    sty_verifizieren: 'Verify', sty_verifizieren_hint: 'Quality steps: test, cross-check, review, validate edge cases.',
    customLabel: 'Custom focus',
    customPlaceholder: 'Optional: your own method lens, shown as “Custom”. Example: Tax advisory — compliance first, check deadlines, secure receipts.',
    stepsLabel: 'Suggestions per answer',
    stepOpt: '{0} steps',
    focusHint: 'The focus sets the method lens (what a logical next step IS), the style the granularity. Per session tab — every session keeps its own focus.',
    secModel: 'Model',
    modelLabel: 'Model (Ollama tag)',
    modelSourceLabel: 'Model source',
    modelOllama: 'Installed in Ollama',
    modelHermes: 'Hermes model catalog',
    modelManual: 'Manual entry',
    useHermesModel: 'Use Hermes’ model',
    modelRefresh: 'Refresh list',
    hermesPickLabel: 'Pick from Hermes catalog',
    hermesActive: 'Hermes active model',
    capLabel: 'Model profile',
    cap_auto: 'Auto', cap_auto_hint: 'Tiny models (≤2B in the tag) → decision profile, otherwise LLM profile.',
    cap_decision: 'Decision model (tiny)', cap_decision_hint: 'Tiny decision models: ultra-short steps, small num_predict/ctx, strict contract, long timeout.',
    cap_llm: 'Language model (LLM)', cap_llm_hint: 'Normal chat models: richer steps, more context and variance.',
    tempLabel: 'Temperature',
    ctxLabel: 'Context (num_ctx)',
    keepLabel: 'Keep-alive',
    modelHint: 'The decision profile compensates small capacities: shorter steps, tighter contract, lower variance. Hermes’ active model can be adopted as-is.',
    secDesign: 'Design & appearance',
    frostLabel: 'Frost effect (blur)',
    opacityLabel: 'Transparency', blurLabel: 'Blur strength', satLabel: 'Saturation',
    fontLabel: 'Font size', widthLabel: 'Chip width (max.)',
    previewLabel: 'Preview:', previewChip: 'Example chip with current design',
    langLabel: 'Language',
    langInherit: 'Follow Hermes',
    langHint: '“Follow Hermes” inherits the app language (English fallback). English/Deutsch override only this plugin — for the UI and the steps themselves.',
    noSessionHint: 'No session tab is focused — per-session settings (focus, style, target) need a focused session. Global settings work regardless.',
    secTargets: 'Targets & routing',
    targetLabel: 'Default target (chip click)',
    tgt_session: 'This session', tgt_new: 'New session tab', tgt_kanban: 'Kanban board',
    targetSession: 'This session', targetNew: 'New session tab', targetKanban: 'Kanban board',
    botLabel: 'Bots',
    botNone: 'No bots found.',
    targetHint: 'Where a chip click goes. The ⌖ icon on each chip picks a one-off destination — this is how work is parallelized across sessions, bots and the board.',
    chipTip: 'Next Steps ({0}) — click: refresh', chipMenu: 'Send to…',
    refreshLabel: 'Regenerate', refreshTip: 'Run the request again — generate new suggestions',
    modelSaved: 'saved',
    notifyModelReset: 'Model “{0}” is not installed in Ollama — reset to {1}.',
    handoffHead: 'Context (handoff from another Hermes session):',
    handoffCwd: 'Working directory: {0}',
    handoffTask: 'Task: {0}',
    sendCtxLabel: 'Attach session context',
    sendCtxHint: 'Steps sent to other targets (new tab, bot, board) carry a short handoff — working directory + the last messages — so they stay actionable there. The current session needs no attachment.',
    pauseTip: 'Pause auto-generation', resumeTip: 'Resume auto-generation',
    autoLabel: 'Auto-generation', autoHint: 'Paused = no new suggestions after agent answers; existing chips stay dimmed. The ⟳ button still generates manually.',
    predict: 'predict', predictBusy: 'predict…', predictError: 'predict!',
    notifyNoComposer: 'Next Steps: composer unreachable — step not sent.',
    notifySent: 'Next Steps: sent to {0}.',
    notifyKanbanFallback: 'Next Steps: Kanban call failed — step copied, /kanban is open.',
    notifyActive: 'Next Steps active — Ollama {0}. Options chip in the suggestion bar, settings page under “Next Steps”.',
    settingsNav: 'Next Steps',
    pageIntro: 'All plugin options with explanations. Focus/style/target are stored per session tab; model/design/language are global.',
    refreshNow: 'Fetch suggestions now',
    promptLang: 'Language of the steps: English. Write every step in English.',
    promptLangDe: 'Language of the steps: German. Write every step in German.'
  },
  de: {
    tag: 'de',
    tabFocus: 'Ausrichtung', tabModel: 'Modell', tabDesign: 'Design', tabLang: 'Sprache', tabTargets: 'Ziele',
    focusHead: 'Ausrichtung der Prediction', styleHead: 'Schritt-Stil',
    focusTip: 'Ausrichtung: {0} — {1}', styleTip: 'Stil: {0} — {1}',
    cat_auto: 'Auto', cat_auto_hint: 'Erkenn die Domain selbst aus dem Verlauf und wähle die passendste Perspektive.',
    cat_coding: 'Coding', cat_coding_hint: 'Softwareentwicklung. Methoden: kleinste verifizierbare Schritte, Tests zuerst, Ursachen statt Symptome beheben, ein Thema je Schritt, saubere Commit-Schnitte.',
    cat_produkt: 'Produktentwicklung', cat_produkt_hint: 'Produktarbeit. Methoden: Nutzerwert zuerst, in MVP-Scheiben denken, Annahmen und Risiken explizit machen, Entscheidungen mit Optionen vorbereiten.',
    cat_marketing: 'Marketing & Content', cat_marketing_hint: 'Marketing. Methoden: Zielgruppe und Funnel-Stufe benennen, Botschaft vor Kanal, klarer CTA, Messaging-Konsistenz mit vorhandenen Materialien prüfen.',
    cat_ideation: 'Ideenentwicklung', cat_ideation_hint: 'Kreative Arbeit. Methoden: erst divergent (mehrere Alternativen, auch ungewöhnliche), dann konvergent (Kriterien, Auswahl), Zusammenhänge sichtbar machen.',
    cat_betrieb: 'Betrieb & DevOps', cat_betrieb_hint: 'Betrieb. Methoden: Stabilität vor Neuem, Beobachtbarkeit (Logs/Metriken), Rollback-Pfad, Risiken klein und isoliert halten.',
    cat_research: 'Recherche & Analyse', cat_research_hint: 'Analyse. Methoden: Quellen prüfen und gegenproben, Kriterien vor Befunden, Ergebnis als Entscheidungsvorlage verdichten.',
    cat_methodik: 'Methodik & Best Practices', cat_methodik_hint: 'Best-Practice-Arbeit. Methoden: bewährte Verfahren und Standards anwenden, gegen Referenzlösungen benchmarken, in Checklisten und Reviews denken, Experimente mit klarer Hypothese planen, Ergebnisse dokumentieren und Lernschleifen schließen.',
    cat_custom: 'Eigene',
    sty_auto: 'Auto', sty_auto_hint: 'Wähle je Schritt die passende Art; mische sinnvoll.',
    sty_sofort: 'Sofort umsetzbar', sty_sofort_hint: 'Nur sofort ausführbare Mikro-Schritte (unter 2 Minuten), imperativ formuliert.',
    sty_planung: 'Planung', sty_planung_hint: 'Planungs- und Strukturierungsschritte: zerlegen, priorisieren, Reihenfolge legen.',
    sty_vertiefen: 'Vertiefen', sty_vertiefen_hint: 'Analyse- und Recherche-Schritte: untersuchen, vergleichen, bewerten, Zusammenhänge prüfen.',
    sty_verifizieren: 'Verifizieren', sty_verifizieren_hint: 'Qualitäts-Schritte: testen, gegenprüfen, reviewen, Randfälle validieren.',
    customLabel: 'Eigene Ausrichtung',
    customPlaceholder: 'Optional: eigene Methoden-Linse, erscheint als „Eigene“. Beispiel: Steuerberatung — Compliance zuerst, Fristen prüfen, Belege sichern.',
    stepsLabel: 'Vorschläge pro Antwort',
    stepOpt: '{0} Schritte',
    focusHint: 'Die Ausrichtung bestimmt die Methoden-Linse (was ein logischer nächster Schritt IST), der Stil die Granularität. Pro Session-Tab — jede Session behält ihre eigene Ausrichtung.',
    secModel: 'Modell',
    modelLabel: 'Modell (Ollama-Tag)',
    modelSourceLabel: 'Modell-Quelle',
    modelOllama: 'In Ollama installiert',
    modelHermes: 'Hermes-Modellkatalog',
    modelManual: 'Manuelle Eingabe',
    useHermesModel: 'Hermes-Modell übernehmen',
    modelRefresh: 'Liste aktualisieren',
    hermesPickLabel: 'Aus Hermes-Katalog wählen',
    hermesActive: 'Hermes-Aktivmodell',
    capLabel: 'Modell-Profil',
    cap_auto: 'Auto', cap_auto_hint: 'Winzige Modelle (≤2B im Tag) → Decision-Profil, sonst LLM-Profil.',
    cap_decision: 'Decision-Modell (winzig)', cap_decision_hint: 'Winzige Decision-Modelle: ultrakurze Schritte, kleines num_predict/ctx, strikter Kontrakt, langes Timeout.',
    cap_llm: 'Sprachmodell (LLM)', cap_llm_hint: 'Normale Chat-Modelle: reichere Schritte, mehr Kontext und Varianz.',
    tempLabel: 'Temperatur',
    ctxLabel: 'Kontext (num_ctx)',
    keepLabel: 'Keep-alive',
    modelHint: 'Das Decision-Profil gleicht kleine Kapazitäten aus: kürzere Schritte, engerer Kontrakt, weniger Varianz. Das aktive Hermes-Modell ist direkt übernehmbar.',
    secDesign: 'Design & Darstellung',
    frostLabel: 'Frost-Effekt (Blur)',
    opacityLabel: 'Transparenz', blurLabel: 'Blur-Stärke', satLabel: 'Sättigung',
    fontLabel: 'Schriftgröße', widthLabel: 'Chip-Breite (max.)',
    previewLabel: 'Vorschau:', previewChip: 'Beispiel-Chip mit aktuellem Design',
    langLabel: 'Sprache',
    langInherit: 'Von Hermes übernehmen',
    langHint: '„Von Hermes übernehmen“ erbt die App-Sprache (Fallback Englisch). English/Deutsch überschreibt nur dieses Plugin — für die UI und die Schritte selbst.',
    noSessionHint: 'Kein Session-Tab fokussiert — pro-Session-Einstellungen (Ausrichtung, Stil, Ziel) brauchen eine fokussierte Session. Globale Einstellungen funktionieren trotzdem.',
    secTargets: 'Ziele & Routing',
    targetLabel: 'Standard-Ziel (Chip-Klick)',
    tgt_session: 'Diese Session', tgt_new: 'Neuer Session-Tab', tgt_kanban: 'Kanban-Board',
    targetSession: 'Diese Session', targetNew: 'Neuer Session-Tab', targetKanban: 'Kanban-Board',
    botLabel: 'Bots',
    botNone: 'Keine Bots gefunden.',
    targetHint: 'Wohin ein Chip-Klick geht. Das ⌖-Icon an jedem Chip wählt ein einmaliges Ziel — so wird Arbeit über Sessions, Bots und das Board parallelisierbar.',
    chipTip: 'Next Steps ({0}) — Klick: neu laden', chipMenu: 'Senden an…',
    refreshLabel: 'Neu generieren', refreshTip: 'Anfrage erneut ausführen — neue Next Steps generieren',
    modelSaved: 'gespeichert',
    notifyModelReset: 'Modell „{0}“ ist in Ollama nicht installiert — auf {1} zurückgesetzt.',
    handoffHead: 'Kontext (Übergabe aus einer anderen Hermes-Session):',
    handoffCwd: 'Arbeitsverzeichnis: {0}',
    handoffTask: 'Aufgabe: {0}',
    sendCtxLabel: 'Session-Kontext mitsenden',
    sendCtxHint: 'An andere Ziele (neuer Tab, Bot, Kanban) gesendete Schritte erhalten eine Kurzfassung — Arbeitsverzeichnis + letzte Nachrichten —, damit sie dort ausführbar sind. Die aktuelle Session braucht keinen Anhang.',
    pauseTip: 'Automatische Generierung pausieren', resumeTip: 'Automatische Generierung fortsetzen',
    autoLabel: 'Automatische Generierung', autoHint: 'Pausiert = keine neuen Vorschläge nach Antworten; vorhandene Chips bleiben gedimmt. Der ⟳-Button generiert weiterhin manuell.',
    predict: 'predict', predictBusy: 'predict…', predictError: 'predict!',
    notifyNoComposer: 'Next Steps: Composer nicht erreichbar — Schritt nicht gesendet.',
    notifySent: 'Next Steps: gesendet an {0}.',
    notifyKanbanFallback: 'Next Steps: Kanban-Aufruf fehlgeschlagen — Schritt kopiert, /kanban ist offen.',
    notifyActive: 'Next Steps aktiv — Ollama {0}. Options-Chip in der Vorschlagsleiste, Einstellungsseite unter „Next Steps“.',
    settingsNav: 'Next Steps',
    pageIntro: 'Alle Plugin-Optionen mit Erklärung. Ausrichtung/Stil/Ziel werden pro Session-Tab gespeichert; Modell/Design/Sprache global.',
    refreshNow: 'Jetzt Vorschläge holen',
    promptLang: 'Language of the steps: English. Write every step in English.',
    promptLangDe: 'Sprache der Schritte: Deutsch. Formuliere jeden Schritt auf Deutsch.'
  }
}

const CATEGORY_IDS = ['auto', 'coding', 'produkt', 'marketing', 'ideation', 'betrieb', 'research', 'methodik', 'custom']
const STYLE_IDS = ['auto', 'sofort', 'planung', 'vertiefen', 'verifizieren']
const LANG_MODES = ['inherit', 'en', 'de']
const TARGET_IDS = ['session', 'new', 'kanban']

function fmt(template, args) {
  return String(template).replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m))
}

function fixedT(mode) {
  return (key, ...args) => {
    const bundle = STRINGS[mode] || STRINGS.en
    return fmt(bundle[key] ?? STRINGS.en[key] ?? key, args)
  }
}

// --------------------------------------------------------------------------
// Modell-Profile — Kapazität kleiner Decision-Modelle voll berücksichtigt
// --------------------------------------------------------------------------

const CAP_PROFILES = {
  decision: {
    numPredictPerStep: 30, numPredictBase: 60, defaultTemperature: 0.2, defaultNumCtx: 4096,
    stepChars: 80, timeoutMs: 120_000, keepAlive: '10m',
    promptNote: 'The steps must be ULTRA-SHORT: plain imperative clauses, max 80 characters each, no compound sentences, no explanations.'
  },
  llm: {
    numPredictPerStep: 60, numPredictBase: 90, defaultTemperature: 0.3, defaultNumCtx: 8192,
    stepChars: 120, timeoutMs: 90_000, keepAlive: '10m',
    promptNote: 'Steps are short but may be compound and specific (max 120 characters each).'
  }
}

function capProfile(cap, model) {
  if (cap === 'decision' || cap === 'llm') return CAP_PROFILES[cap]
  const m = /(\d+(?:\.\d+)?)\s*b\b/i.exec(String(model || ''))
  const params = m ? parseFloat(m[1]) : null
  return params !== null && params <= 2 ? CAP_PROFILES.decision : CAP_PROFILES.llm
}

// --------------------------------------------------------------------------
// Prompt (Kontrakt → Linse → Stil → Kapazitäts-Note → Sprache → Qualität)
// --------------------------------------------------------------------------

function buildSystemPrompt(config) {
  const bundle = STRINGS[config.uiLang] || STRINGS.en
  const customHint = String(config.customHint || '').trim()
  const cat = CATEGORY_IDS.includes(config.category) ? config.category : 'auto'
  const st = STYLE_IDS.includes(config.style) ? config.style : 'auto'
  const catHint = cat === 'custom' ? (customHint || bundle.cat_auto_hint) : bundle[`cat_${cat}_hint`]
  const prof = config.profile
  const n = config.maxSteps
  return (
    'You suggest logical next steps to the user. ' +
    `Answer EXCLUSIVELY with a JSON object {"steps":[...]}. "steps" is a JSON array with ` +
    `exactly ${n} entries: short, concrete, context-aware next steps phrased as direct ` +
    `prompts to the agent (max. ${prof.stepChars} characters each, no numbering, no text outside the JSON).\n` +
    `${bundle.focusHead}: ${bundle[`cat_${cat}`]} — ${catHint}\n` +
    `${bundle.styleHead}: ${bundle[`sty_${st}_hint`]}\n` +
    `${prof.promptNote}\n` +
    `${config.stepsInEnglish ? bundle.promptLang : bundle.promptLangDe}\n` +
    'Quality criteria: every step builds logically on the transcript — no repetitions, no ' +
    'jumps, no step duplicates another; the steps form a sensible path in this order.'
  )
}

// --------------------------------------------------------------------------
// Reaktiver Zustand — GLOBAL vs. PRO SESSION
// --------------------------------------------------------------------------

const langAtom = atom('inherit')   // global: 'inherit' | 'en' | 'de'
const modelCfgAtom = atom(null)    // global: {model,cap,temperature,numCtx,keepAlive,port}
const designAtom = atom(null)      // global: DESIGN_DEFAULTS-Shape
const sessionMapAtom = atom({})    // PRO SESSION: sid → {category,style,target,steps}
const busyMapAtom = atom({})       // PRO SESSION: sid → bool
const customHintAtom = atom('')    // global: eigene Ausrichtungs-Linse (Freitext)
const pausedAtom = atom(false)     // global: automatische Generierung pausiert?
const handoffAtom = atom(true)     // global: Session-Kontext an andere Ziele mitsenden
const errorAtom = atom('')
const botsAtom = atom([])          // profiles.list (lazy)
const ollamaModelsAtom = atom([])  // /api/tags → installierte Ollama-Modelle
const hermesModelAtom = atom({ model: '', provider: '' }) // aus Hermes' Composer-Menü gewählt
let requestSeq = 0
/** Non-React-Übersetzer in der AKTUELLEN Plugin-Sprache (inherit → App-Locale).
 *  Wird von register() gebunden; Module die vor register laufen, nutzen den Key. */
let tr = (key, ...args) => fmt(String(key), args)

const SESSION_DEFAULT = { category: 'auto', style: 'auto', target: 'session', steps: [] }

function sessionState(map, sid) {
  return (sid && map[sid]) || SESSION_DEFAULT
}

// --------------------------------------------------------------------------
// Ollama
// --------------------------------------------------------------------------

async function fetchSuggestions(cfg, context) {
  const seq = ++requestSeq
  const prof = cfg.profile
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), prof.timeoutMs)
  try {
    const response = await fetch(`http://localhost:${cfg.port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model,
        stream: false,
        think: false,
        format: 'json',
        keep_alive: cfg.keepAlive,
        options: {
          temperature: cfg.temperature,
          num_ctx: cfg.numCtx,
          num_predict: prof.numPredictBase + prof.numPredictPerStep * cfg.maxSteps
        },
        messages: [
          { role: 'system', content: buildSystemPrompt(cfg) },
          {
            role: 'user',
            content:
              `Session context:\nActive model: ${context.model}\nWorking directory: ${context.cwd}\n` +
              `Recent transcript:\n${context.history}`
          }
        ]
      })
    })
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`)
    const data = await response.json()
    if (seq !== requestSeq) return null
    return parseSteps(String(data?.message?.content ?? ''), cfg.maxSteps, prof.stepChars)
  } finally {
    clearTimeout(timer)
  }
}

function parseSteps(raw, maxSteps = 5, stepChars = 120) {
  if (!raw) return []
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    if (start !== -1 && end > start) {
      try {
        parsed = JSON.parse(raw.slice(start, end + 1))
      } catch {
        return []
      }
    }
  }
  let values = []
  if (Array.isArray(parsed)) values = parsed
  else if (Array.isArray(parsed?.steps)) values = parsed.steps
  else if (parsed && typeof parsed === 'object') values = Object.values(parsed).flat()
  return values
    .map(v => String(v).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map(s => (s.length > stepChars ? `${s.slice(0, stepChars - 3)}…` : s))
    .slice(0, Math.max(1, Math.min(6, maxSteps)))
}

// --------------------------------------------------------------------------
// Vorschläge PRO SESSION holen (event-getrieben; Speicherung unter der Event-Session)
// --------------------------------------------------------------------------

function historyLines(sessionId, rows) {
  if (!sessionId) return Promise.resolve([])
  return host
    .request('session.history', { session_id: sessionId })
    .then(result => {
      const messages = Array.isArray(result?.messages) ? result.messages : []
      return messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-rows)
        .map(m => ({
          role: m.role,
          text: String(m.content ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
        }))
        .filter(m => m.text)
    })
    .catch(() => [])
}

/** Kurzfassung der Quelle für Ziele OHNE Session-Kontext: Arbeitsverzeichnis +
 *  die letzten Nachrichten. Ohne `task` endet der Block nach dem Verlauf. */
async function buildHandoff(sid, t, task) {
  const lines = await historyLines(sid, HANDOFF_ROWS)
  const cwd = host.state.cwd.get() || ''
  const parts = [t('handoffHead')]
  if (cwd) parts.push(fmt(t('handoffCwd'), [cwd]))
  if (lines.length) parts.push(lines.map(l => `${l.role}: ${l.text}`).join('\n'))
  let block = parts.join('\n')
  if (task) block += `\n\n${fmt(t('handoffTask'), [task])}`
  return block
}

function setSessionSteps(ctxRef, sid, steps) {
  const key = ctxRef.sessionKey(sid)
  if (!key || !Array.isArray(steps)) return
  const map = { ...sessionMapAtom.get() }
  map[key] = { ...SESSION_DEFAULT, ...(map[key] || {}), steps }
  sessionMapAtom.set(map)
  ctxRef.persistSessions(map)
}

function patchSessionState(ctxRef, sid, patch) {
  const key = ctxRef.sessionKey(sid)
  if (!key) return
  const map = { ...sessionMapAtom.get() }
  map[key] = { ...SESSION_DEFAULT, ...(map[key] || {}), ...patch }
  sessionMapAtom.set(map)
  ctxRef.persistSessions(map)
}

function refreshFor(ctxRef, sid, opts) {
  const key = ctxRef.sessionKey(sid)
  if (!key) return
  const force = Boolean(opts && opts.force)
  if (busyMapAtom.get()[key]) return // eigener Call läuft — kein Doppel-Call
  if (!force && pausedAtom.get()) return // Pause: keine automatische Generierung
  if (!force && host.state.busy.get()) return // Auto-Trigger: nicht mitten in den Agent-Turn funken
  busyMapAtom.set({ ...busyMapAtom.get(), [key]: true })
  errorAtom.set('')
  const cfg = ctxRef.config()
  // Selbstheilung: Ein gespeicherter Modell-Tag, den Ollama nicht kennt (z. B. aus
  // einer alten Version), würde jeden Call mit 404 killen. Ersteinstallation:
  // auf das Default-Modell zurückfallen und das im UI sichtbar machen.
  const heal = cfg.source !== 'hermes'
    ? modelExists(cfg.port, cfg.model).then(ok => {
        if (!ok) {
          const invalid = cfg.model
          cfg.model = MODEL_DEFAULT
          ctxRef.setModelCfg({ ...modelCfgAtom.get(), model: MODEL_DEFAULT })
          errorAtom.set(tr('notifyModelReset', invalid, MODEL_DEFAULT))
        }
      })
    : Promise.resolve()
  heal
    .then(() => historyLines(sid, HISTORY_ROWS))
    .then(lines => {
      const context = {
        model: host.state.model.get() || 'unknown',
        cwd: host.state.cwd.get() || 'none',
        history: lines.map(l => `${l.role}: ${l.text}`).join('\n') || '(empty — new session)'
      }
      return fetchSuggestions(cfg, context)
    })
    .then(steps => {
      if (Array.isArray(steps)) setSessionSteps(ctxRef, sid, steps)
    })
    .catch(error => {
      errorAtom.set(error instanceof Error ? error.message : String(error))
    })
    .finally(() => {
      const map = { ...busyMapAtom.get() }
      delete map[key]
      busyMapAtom.set(map)
    })
}

// --------------------------------------------------------------------------
// Ziele — Session / New / Kanban / Bot (Parallelisierung)
// --------------------------------------------------------------------------

async function listBots() {
  try {
    const result = await host.request('profiles.list', {})
    const profiles = Array.isArray(result?.profiles) ? result.profiles : []
    return profiles.map(p => String(p?.name || '')).filter(Boolean).slice(0, 12)
  } catch {
    return []
  }
}

/** Installierte Ollama-Modelle (ohne Embedding-Modelle — die können nicht chatten). */
async function listOllamaModels(port) {
  try {
    const response = await fetch(`http://localhost:${port}/api/tags`, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return []
    const data = await response.json()
    return (Array.isArray(data?.models) ? data.models : [])
      .map(m => String(m?.name || ''))
      .filter(n => n && !/embed|bge-|minilm/i.test(n))
      .sort()
  } catch {
    return []
  }
}

/** True, wenn der Modell-Tag laut /api/tags tatsächlich installiert ist. */
async function modelExists(port, model) {
  try {
    const response = await fetch(`http://localhost:${port}/api/tags`, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return true // Ollama nicht erreichbar → nicht urteilen
    const data = await response.json()
    const names = (Array.isArray(data?.models) ? data.models : []).map(m => String(m?.name || ''))
    return names.includes(String(model))
  } catch {
    return true
  }
}

/** Einen Schritt an ein Ziel senden. Gibt den Ziel-Namen (für die Notify) zurück. */
async function sendStep(ctxRef, step, target, t) {
  const kind = target?.kind || 'session'
  const sid = host.state.focusedSessionId.get()
  // Kurzfassung (Arbeitsverzeichnis + letzte Nachrichten) für Ziele OHNE den
  // Session-Kontext; schlägt das Sammeln fehl, geht nur der Schritt raus.
  let handoff = ''
  if (kind !== 'session' && sid && handoffAtom.get()) {
    try {
      handoff = await buildHandoff(sid, t, null)
    } catch {
      handoff = ''
    }
  }
  const prompt = handoff ? `${handoff}\n\n${fmt(t('handoffTask'), [step])}` : step
  if (kind === 'session') {
    const sent = host.composer.submit(null, step)
    if (!sent) {
      host.notify({ kind: 'error', message: t('notifyNoComposer') })
      return null
    }
    return t('tgt_session')
  }
  if (kind === 'new') {
    try {
      // Kanonischer Desktop-Flow (wie App/Bots): session.create ist lazy (die
      // stored row entsteht erst mit dem ersten Prompt) und liefert BEIDE IDs.
      // View über die STORED-ID mounten, den Turn per prompt.submit senden
      // (composer.submit erreicht nur gemountete Composer-Surfaces — genau die
      // hat eine frisch erstellte Session nicht).
      const cwd = host.state.cwd.get() || ''
      const created = await host.request('session.create', { cols: 96, source: 'desktop', ...(cwd ? { cwd } : {}) })
      const runtimeId = created?.session_id
      const storedId = created?.stored_session_id
      if (!runtimeId) throw new Error('session.create lieferte keine session_id')
      let opened = false
      if (storedId && typeof host.openSession === 'function') {
        try {
          await host.openSession(String(storedId), {})
          opened = true
        } catch { /* Row entsteht erst nach dem ersten Prompt */ }
      }
      await host.request('prompt.submit', { session_id: String(runtimeId), text: prompt })
      if (!opened && storedId && typeof host.openSession === 'function') {
        await host.openSession(String(storedId), {})
      }
      return t('tgt_new')
    } catch {
      const sent = host.composer.submit(null, prompt)
      if (!sent) host.notify({ kind: 'error', message: t('notifyNoComposer') })
      return sent ? t('tgt_session') : null
    }
  }
  if (kind === 'kanban') {
    // Verb ist „create“ (der Slash nutzt den echten Kanban-CLI-Parser); der
    // Kontext reist als --body mit. Anführungszeichen werden neutralisiert.
    const title = String(step).replace(/"/g, "'")
    const body = handoff ? ` --body "${handoff.replace(/"/g, "'")}"` : ''
    try {
      const res = await host.request('slash.exec', { session_id: sid, command: `kanban create "${title}"${body}` })
      const out = String((res && typeof res === 'object' ? res.output : res) ?? '').trim()
      if (/usage error|^error:/im.test(out)) throw new Error(out.slice(0, 140))
      return t('tgt_kanban')
    } catch {
      try {
        await ctxRef.clipboard(step)
        host.navigate('/kanban')
        host.notify({ kind: 'error', message: t('notifyKanbanFallback') })
      } catch { /* clipboard unavailable — nothing else to do */ }
      return null
    }
  }
  if (kind === 'bot') {
    const bot = String(target?.bot || '')
    if (!bot) return null
    try {
      const cwd = host.state.cwd.get() || ''
      const created = await host.request('session.create', { profile: bot, cols: 96, source: 'desktop', ...(cwd ? { cwd } : {}) })
      const runtimeId = created?.session_id
      const storedId = created?.stored_session_id
      if (!runtimeId) throw new Error('session.create lieferte keine session_id')
      let opened = false
      if (storedId && typeof host.openSession === 'function') {
        try {
          await host.openSession(String(storedId), { profile: bot })
          opened = true
        } catch { /* Row entsteht erst nach dem ersten Prompt */ }
      }
      await host.request('prompt.submit', { session_id: String(runtimeId), text: prompt })
      if (!opened && storedId && typeof host.openSession === 'function') {
        await host.openSession(String(storedId), { profile: bot })
      }
      return bot
    } catch (error) {
      host.notify({ kind: 'error', message: `${bot}: ${error instanceof Error ? error.message : String(error)}` })
      return null
    }
  }
  return null
}

// --------------------------------------------------------------------------
// Design — deklarative CSS-Variablen
// --------------------------------------------------------------------------

const DESIGN_DEFAULTS = {
  frost: true, blur: 12, opacity: 72, sat: 112, font: 12, chipMax: 360, steps: 5
}

function designCss(d) {
  const filter = d.frost ? `blur(${d.blur}px) saturate(${(d.sat / 100).toFixed(2)})` : 'none'
  return `:root{
--ns-font:${d.font}px;
--ns-chipmax:${d.chipMax}px;
--ns-chiph:${Math.max(26, d.font + 14)}px;
--ns-filter:${filter};
--ns-bg:color-mix(in srgb,var(--dt-card,var(--card,#6e6e6e)) ${d.opacity}%,transparent);
--ns-border:color-mix(in srgb,var(--border,#888) 65%,transparent);
--ns-shadow:0 1px 4px color-mix(in srgb,black 14%,transparent);
}`
}

// --------------------------------------------------------------------------
// CSS
// --------------------------------------------------------------------------

const CSS = `
.sp-wrap{display:flex;flex-wrap:wrap;gap:6px;padding:2px 4px;align-items:center}
/* Schritt-Chips — Frost über Tokens */
.sp-btn{display:inline-flex;align-items:center;gap:6px;max-width:var(--ns-chipmax,360px);height:var(--ns-chiph,26px);padding:0 10px;
  border-radius:999px;cursor:pointer;font-size:var(--ns-font,12px);line-height:1;text-align:left;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  color:var(--ui-text-primary);background:var(--ns-bg);border:1px solid var(--ns-border);
  -webkit-backdrop-filter:var(--ns-filter);backdrop-filter:var(--ns-filter);
  box-shadow:var(--ns-shadow);
  transition:background .15s ease,color .15s ease,border-color .15s ease,opacity .2s ease}
.sp-btn:hover{background:var(--chrome-action-hover);border-color:var(--ui-accent);color:var(--ui-text-primary)}
.sp-num{color:var(--ui-accent);font-variant-numeric:tabular-nums;flex-shrink:0}
.sp-label{overflow:hidden;text-overflow:ellipsis}
/* Ziel-Icon am Chip-Ende */
.sp-target{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex-shrink:0;
  border-radius:50%;border:0;background:transparent;cursor:pointer;color:var(--ui-text-tertiary);
  font-size:11px;line-height:1;margin-right:-4px;padding:0}
.sp-target:hover{background:var(--chrome-action-hover);color:var(--ui-accent)}
/* Options-/Ziel-Dropdown-Chip — gleiches Chip-Design */
.sp-opt{display:inline-flex;align-items:center;gap:5px;height:var(--ns-chiph,26px);padding:0 11px;
  border-radius:999px;cursor:pointer;font-size:var(--ns-font,12px);line-height:1;white-space:nowrap;
  color:var(--ui-text-primary);background:var(--ns-bg);border:1px solid var(--ns-border);
  -webkit-backdrop-filter:var(--ns-filter);backdrop-filter:var(--ns-filter);box-shadow:var(--ns-shadow);
  transition:border-color .15s ease}
.sp-opt:hover{border-color:var(--ui-accent)}
.sp-caret{font-size:9px;opacity:.7}
/* Neu-generieren-Chip — führt die Vorhersage-Anfrage erneut aus */
.sp-refresh{padding:0 9px}
.sp-refresh-icon{display:inline-block;font-size:13px;line-height:1}
.sp-refresh[data-busy="true"]{border-color:var(--ui-accent);color:var(--ui-accent)}
.sp-refresh[data-busy="true"] .sp-refresh-icon{animation:ns-spin .9s linear infinite}
.sp-refresh[data-blocked="true"]{opacity:.55;cursor:default}
.sp-refresh[data-blocked="true"]:hover{border-color:var(--ns-border)}
@keyframes ns-spin{to{transform:rotate(360deg)}}
:root[data-renderer-animations-paused] .sp-refresh[data-busy="true"] .sp-refresh-icon{animation:none}
/* Start/Stop-Chip — pausiert die automatische Generierung, dimmt die Chips */
.sp-pause{padding:0 9px}
.sp-pause-icon{display:inline-block;font-size:12px;line-height:1}
.sp-pause[data-paused="true"]{border-color:var(--ui-accent);color:var(--ui-accent)}
.sp-wrap[data-paused="true"] .sp-btn{opacity:.45}
.sp-wrap[data-paused="true"] .sp-btn:hover{opacity:.78}
/* Statusleisten-Chip */
.sp-chip{display:inline-flex;align-items:center;gap:4px;height:100%;padding:0 6px;border:0;background:transparent;
  cursor:pointer;font-size:11px;color:var(--ui-text-tertiary)}
.sp-chip:hover{background:var(--chrome-action-hover);color:var(--ui-text-primary)}
.sp-chip[data-busy="true"]{color:var(--ui-accent)}
.sp-chip[data-error="true"]{color:#c96f6f}
/* Popover-Menüs */
.sp-menu{display:flex;flex-direction:column;gap:1px;padding:4px;width:264px;text-align:left}
.sp-menu-wide{width:372px;max-height:440px;overflow-y:auto}
.sp-menu-head{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--ui-text-quaternary);
  padding:4px 8px 6px;text-align:left}
.sp-row{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;
  padding:6px 8px;border:0;border-radius:8px;background:transparent;cursor:pointer;color:var(--ui-text-primary)}
.sp-row:hover{background:var(--chrome-action-hover)}
.sp-row[data-current="true"]{background:color-mix(in srgb,var(--ui-accent) 12%,transparent)}
.sp-row-label{display:flex;align-items:center;gap:6px;font-size:12px;line-height:16px;text-align:left;
  justify-content:flex-start;max-width:100%}
.sp-row-label>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-row-check{color:var(--ui-accent);width:12px;flex-shrink:0}
.sp-row-desc{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
  font-size:10.5px;line-height:14px;color:var(--ui-text-tertiary);text-align:left}
/* Options-Popover: Subtabs + Body */
.sp-tabs{display:flex;gap:2px;padding:2px 4px 8px;flex-wrap:wrap}
.sp-tab{border:0;background:transparent;cursor:pointer;font-size:11px;line-height:1;padding:5px 8px;
  border-radius:999px;color:var(--ui-text-tertiary)}
.sp-tab:hover{background:var(--chrome-action-hover);color:var(--ui-text-primary)}
.sp-tab[data-active="true"]{background:color-mix(in srgb,var(--ui-accent) 16%,transparent);color:var(--ui-accent)}
.sp-body{display:flex;flex-direction:column;gap:9px;padding:0 4px 4px;text-align:left}
.sp-hint{font-size:10.5px;color:var(--ui-text-quaternary);line-height:15px;text-align:left}
/* Formulare (Popover + Seite) */
.sp-set{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sp-set label{color:var(--ui-text-tertiary);min-width:104px}
.sp-set input[type="text"],.sp-set input[type="number"]{background:transparent;border:1px solid var(--ns-border);
  border-radius:6px;color:var(--ui-text-primary);padding:4px 8px;font-size:12px}
.sp-set .sp-model{width:150px}
.sp-set input[type="range"]{accent-color:var(--ui-accent);flex:1;min-width:100px;max-width:180px}
.sp-val{min-width:48px;font-variant-numeric:tabular-nums;color:var(--ui-text-tertiary);font-size:11px}
.sp-set select{background:var(--composer-fill,var(--dt-card,#333));border:1px solid var(--ns-border);border-radius:6px;
  color:var(--ui-text-primary);padding:4px 8px;font-size:12px;max-width:190px}
.sp-set textarea{background:transparent;border:1px solid var(--ns-border);border-radius:6px;color:var(--ui-text-primary);
  padding:6px 8px;font-size:12px;width:100%;min-height:46px;resize:vertical}
.sp-link{border:0;background:transparent;cursor:pointer;color:var(--ui-accent);font-size:11px;padding:0;text-align:left}
.sp-preview{display:flex;align-items:center;gap:8px;padding:2px 0;flex-wrap:wrap}
.sp-switch{position:relative;width:34px;height:18px;border-radius:999px;border:1px solid var(--ns-border);
  background:var(--chrome-action-hover);cursor:pointer;padding:0;transition:background .15s ease}
.sp-switch[data-on="true"]{background:color-mix(in srgb,var(--ui-accent) 55%,transparent)}
.sp-switch::after{content:"";position:absolute;top:1px;left:1px;width:14px;height:14px;border-radius:50%;
  background:var(--ui-text-primary);transition:transform .15s ease}
.sp-switch[data-on="true"]::after{transform:translateX(16px)}
/* Einstellungsseite */
.sp-page{display:flex;flex-direction:column;gap:18px;max-width:680px;padding:18px 22px 40px;overflow-y:auto}
.sp-page h2{font-size:15px;margin:0;color:var(--ui-text-primary)}
.sp-intro{font-size:12px;color:var(--ui-text-tertiary);line-height:17px}
.sp-sec{display:flex;flex-direction:column;gap:9px}
.sp-sec-title{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--ui-text-quaternary);
  border-bottom:1px solid var(--ns-border);padding-bottom:4px}
/* Popover-Animation (Radix data-state/data-side; individual properties — kein transform!) */
.sp-menu-panel[data-state="open"]{animation:ns-pop-in .16s cubic-bezier(.16,1,.3,1)}
.sp-menu-panel[data-state="closed"]{animation:ns-pop-out .12s ease-in forwards}
.sp-menu-panel[data-side="bottom"][data-state="open"]{animation-name:ns-pop-in-b}
.sp-menu-panel[data-side="bottom"][data-state="closed"]{animation-name:ns-pop-out-b}
@keyframes ns-pop-in{from{opacity:0;translate:0 4px;scale:.96}to{opacity:1;translate:0 0;scale:1}}
@keyframes ns-pop-out{from{opacity:1;translate:0 0;scale:1}to{opacity:0;translate:0 4px;scale:.96}}
@keyframes ns-pop-in-b{from{opacity:0;translate:0 -4px;scale:.96}to{opacity:1;translate:0 0;scale:1}}
@keyframes ns-pop-out-b{from{opacity:1;translate:0 0;scale:1}to{opacity:0;translate:0 -4px;scale:.96}}
@media (prefers-reduced-motion: reduce){
  .sp-menu-panel[data-state="open"],.sp-menu-panel[data-state="closed"]{animation:none}
  .sp-refresh[data-busy="true"] .sp-refresh-icon{animation:none}
}
`

// --------------------------------------------------------------------------
// i18n-Hook + Formular-Bausteine
// --------------------------------------------------------------------------

function useT() {
  const appT = usePluginI18n(ID)
  const mode = useValue(langAtom)
  return mode === 'inherit' ? appT : fixedT(mode)
}

function SelectRow({ label, value, items, onChange, hint }) {
  return jsxs('div', { className: 'sp-set', children: [
    jsx('label', { children: label }),
    jsxs('select', { value, onChange: event => onChange(event.target.value), children: [
      ...items.map(i => jsx('option', { value: i.id, children: i.label }, i.id))
    ] }),
    hint ? jsx('span', { className: 'sp-hint', children: hint }) : null
  ] })
}

function SliderRow({ label, value, min, max, step, unit, onChange }) {
  return jsxs('div', { className: 'sp-set', children: [
    jsx('label', { children: label }),
    jsx('input', { type: 'range', min, max, step: step || 1, value, onChange: e => onChange(Number(e.target.value)) }),
    jsx('span', { className: 'sp-val', children: unit ? `${value}${unit}` : `${value}` })
  ] })
}

function SwitchRow({ label, on, onChange }) {
  return jsxs('div', { className: 'sp-set', children: [
    jsx('label', { children: label }),
    jsx('button', {
      className: 'sp-switch', type: 'button', role: 'switch', 'data-on': on, 'aria-checked': on,
      onClick: () => onChange(!on)
    })
  ] })
}

// --------------------------------------------------------------------------
// Options-Tabs — im Popover UND auf der Einstellungsseite identisch genutzt
// --------------------------------------------------------------------------

const TAB_IDS = ['focus', 'model', 'design', 'lang', 'targets']

function tabLabel(t, id) {
  return t(`tab${id[0].toUpperCase()}${id.slice(1)}`)
}

/** Hermes-Modellwahl: DASSELBE Katalog-Menü wie der Composer (SDK ModelCatalogMenu).
 *  Der Controller hält einen losgelösten Wert (wie Kanbans ModelOverrideField) —
 *  eine Auswahl schreibt NIEMALS die live Session um. */
function HermesModelPicker({ ctxRef, t, hm }) {
  const [open, setOpen] = useState(false)
  const controller = {
    applyPreset: (_preset, row) => ctxRef.setHermesModel({ model: row.model, provider: row.provider }),
    current: { effort: '', fast: false, model: hm.model, provider: hm.provider },
    presetFor: () => ({}),
    select: (model, provider) => {
      ctxRef.setHermesModel({ model, provider })
      return true
    },
    setOptions: (_patch, _row) => {}
  }
  const label = hm.model
    ? (hm.provider ? `${hm.provider}: ${hm.model}` : hm.model)
    : host.state.model.get() || t('hermesActive')
  return jsxs(DropdownMenu, {
    open,
    onOpenChange: setOpen,
    children: [
      jsx(DropdownMenuTrigger, {
        asChild: true,
        children: jsx('button', {
          className: 'sp-opt',
          type: 'button',
          title: t('hermesPickLabel'),
          children: [jsx('span', { className: 'sp-label', children: label }), jsx('span', { className: 'sp-caret', children: '▾' })]
        })
      }),
      jsx(ModelMenuCloseContext.Provider, {
        value: () => setOpen(false),
        children: jsx(DropdownMenuContent, {
          align: 'start',
          className: 'sp-menu-panel',
          children: jsx(ModelCatalogMenu, { controller })
        })
      })
    ]
  })
}

function OptionsBody({ tab, t, ctxRef, sid }) {
  // HOOKS ERST — alle useValue-Vorgänge VOR den bedingten Returns. React
  // verlangt dieselbe Hook-Anzahl bei jedem Render; ein useValue innerhalb
  // eines `if (tab === …)` crasht beim Tab-Wechsel („fewer hooks").
  const mc = useValue(modelCfgAtom)
  const d = useValue(designAtom)
  const mode = useValue(langAtom)
  const map = useValue(sessionMapAtom)
  const bots = useValue(botsAtom)
  const ollamaModels = useValue(ollamaModelsAtom)
  const hm = useValue(hermesModelAtom)
  const customAtom = useValue(customHintAtom)
  const paused = useValue(pausedAtom)
  const handoff = useValue(handoffAtom)
  // Lesen über den Persistenz-Key (stored Session-ID) — Schreiben (patchSession)
  // löst intern denselben Key auf; sonst zeigt das Popover nie die Session-Werte.
  const st = sessionState(map, ctxRef.sessionKey(sid))
  const catItems = CATEGORY_IDS.map(id => ({
    id,
    label: t(`cat_${id}`),
    desc: id === 'custom' && customAtom.trim() ? customAtom.trim().slice(0, 90) : t(`cat_${id}_hint`)
  }))
  const styleItems = STYLE_IDS.map(id => ({ id, label: t(`sty_${id}`), desc: t(`sty_${id}_hint`) }))
  const capItems = ['auto', 'decision', 'llm'].map(id => ({ id, label: t(`cap_${id}`), desc: t(`cap_${id}_hint`) }))

  if (tab === 'focus') {
    return jsxs('div', { className: 'sp-body', children: [
      jsx('div', { className: 'sp-sec-title', children: t('focusHead') }),
      jsx(SelectRow, {
        label: t('focusHead'), value: st.category, items: catItems,
        onChange: v => ctxRef.patchSession(sid, { category: v })
      }),
      jsx(SelectRow, {
        label: t('styleHead'), value: st.style, items: styleItems,
        onChange: v => ctxRef.patchSession(sid, { style: v })
      }),
      jsxs('div', { className: 'sp-set', children: [
        jsx('label', { children: t('customLabel') }),
        jsx('textarea', {
          value: customAtom,
          placeholder: t('customPlaceholder'),
          onChange: e => customHintAtom.set(e.target.value)
        })
      ] }),
      jsx(SelectRow, {
        label: t('stepsLabel'), value: String(d.steps),
        items: [3, 4, 5].map(n => ({ id: String(n), label: fmt(t('stepOpt'), [n]) })),
        onChange: v => ctxRef.setDesign({ ...d, steps: Number(v) })
      }),
      jsx(SwitchRow, { label: t('autoLabel'), on: paused, onChange: v => ctxRef.setPaused(v) }),
      jsx('div', { className: 'sp-hint', children: t('autoHint') }),
      sid
        ? jsx('div', { className: 'sp-hint', children: t('focusHint') })
        : jsx('div', { className: 'sp-hint', children: t('noSessionHint') })
    ] })
  }
  if (tab === 'model') {
    const source = mc.source || 'ollama'
    return jsxs('div', { className: 'sp-body', children: [
      jsx('div', { className: 'sp-sec-title', children: t('secModel') }),
      jsx(SelectRow, {
        label: t('modelSourceLabel'), value: source,
        items: [
          { id: 'ollama', label: t('modelOllama') },
          { id: 'hermes', label: t('modelHermes') },
          { id: 'manual', label: t('modelManual') }
        ],
        onChange: v => ctxRef.setModelCfg({ ...mc, source: v })
      }),
      source === 'ollama' && jsxs('div', { className: 'sp-set', children: [
        jsx('label', { children: t('modelLabel') }),
        jsxs('select', {
          value: mc.model,
          onChange: e => ctxRef.setModelCfg({ ...mc, model: e.target.value }),
          children: [
            ...ollamaModels.map(name => jsx('option', { value: name, children: name }, name)),
            ...(ollamaModels.includes(mc.model) ? [] : [jsx('option', { value: mc.model, children: `${mc.model} (${t('modelSaved')})` }, '__saved')])
          ]
        }),
        jsx('button', {
          className: 'sp-link', type: 'button',
          onClick: () => ctxRef.refreshOllamaModels(),
          children: t('modelRefresh')
        })
      ] }),
      source === 'hermes' && jsxs('div', { className: 'sp-body', children: [
        jsxs('div', { className: 'sp-set', children: [
          jsx('label', { children: t('hermesPickLabel') }),
          jsx(HermesModelPicker, { ctxRef, t, hm })
        ] }),
        jsx('div', { className: 'sp-hint', children: t('modelHint') })
      ] }),
      source === 'manual' && jsxs('div', { className: 'sp-set', children: [
        jsx('label', { children: t('modelLabel') }),
        jsx('input', {
          className: 'sp-model', value: mc.model,
          onChange: e => ctxRef.setModelCfg({ ...mc, model: String(e.target.value).trim() || MODEL_DEFAULT })
        }),
        jsx('button', {
          className: 'sp-link', type: 'button',
          onClick: () => ctxRef.setModelCfg({ ...mc, model: host.state.model.get() || mc.model }),
          children: t('useHermesModel')
        })
      ] }),
      jsx('div', { className: 'sp-sec-title', children: t('capLabel') }),
      jsx(SelectRow, {
        label: t('capLabel'), value: mc.cap, items: capItems,
        onChange: v => ctxRef.setModelCfg({ ...mc, cap: v })
      }),
      jsx(SliderRow, {
        label: t('tempLabel'), value: mc.temperature, min: 0, max: 1, step: 0.05,
        onChange: v => ctxRef.setModelCfg({ ...mc, temperature: v })
      }),
      jsx(SliderRow, {
        label: t('ctxLabel'), value: mc.numCtx, min: 2048, max: 32768, step: 2048,
        onChange: v => ctxRef.setModelCfg({ ...mc, numCtx: v })
      }),
      jsx(SelectRow, {
        label: t('keepLabel'), value: mc.keepAlive,
        items: [
          { id: '5m', label: '5 min' }, { id: '10m', label: '10 min' },
          { id: '30m', label: '30 min' }, { id: '-1', label: '∞' }
        ],
        onChange: v => ctxRef.setModelCfg({ ...mc, keepAlive: v })
      }),
      jsx('div', { className: 'sp-hint', children: t('modelHint') })
    ] })
  }
  if (tab === 'design') {
    return jsxs('div', { className: 'sp-body', children: [
      jsx('div', { className: 'sp-sec-title', children: t('secDesign') }),
      jsx(SwitchRow, { label: t('frostLabel'), on: d.frost, onChange: v => ctxRef.setDesign({ ...d, frost: v }) }),
      jsx(SliderRow, { label: t('opacityLabel'), value: d.opacity, min: 20, max: 100, unit: ' %', onChange: v => ctxRef.setDesign({ ...d, opacity: v }) }),
      jsx(SliderRow, { label: t('blurLabel'), value: d.blur, min: 0, max: 30, unit: ' px', onChange: v => ctxRef.setDesign({ ...d, blur: v }) }),
      jsx(SliderRow, { label: t('satLabel'), value: d.sat, min: 80, max: 160, unit: ' %', onChange: v => ctxRef.setDesign({ ...d, sat: v }) }),
      jsx(SliderRow, { label: t('fontLabel'), value: d.font, min: 10, max: 18, unit: ' px', onChange: v => ctxRef.setDesign({ ...d, font: v }) }),
      jsx(SliderRow, { label: t('widthLabel'), value: d.chipMax, min: 200, max: 640, step: 10, unit: ' px', onChange: v => ctxRef.setDesign({ ...d, chipMax: v }) }),
      jsxs('div', { className: 'sp-preview', children: [
        jsx('span', { className: 'sp-hint', children: t('previewLabel') }),
        jsx('span', { className: 'sp-btn', style: { display: 'inline-flex' }, children: [
          jsx('span', { className: 'sp-num', children: '1' }),
          jsx('span', { className: 'sp-label', children: t('previewChip') })
        ] })
      ] })
    ] })
  }
  if (tab === 'lang') {
    return jsxs('div', { className: 'sp-body', children: [
      jsx('div', { className: 'sp-sec-title', children: t('langLabel') }),
      jsx(SelectRow, {
        label: t('langLabel'), value: mode,
        items: [
          { id: 'inherit', label: t('langInherit') },
          { id: 'en', label: 'English' },
          { id: 'de', label: 'Deutsch' }
        ],
        onChange: v => ctxRef.setLang(v)
      }),
      jsx('div', { className: 'sp-hint', children: t('langHint') })
    ] })
  }
  if (tab === 'targets') {
    return jsxs('div', { className: 'sp-body', children: [
      jsx('div', { className: 'sp-sec-title', children: t('secTargets') }),
      jsx(SelectRow, {
        label: t('targetLabel'), value: st.target,
        items: TARGET_IDS.map(k => ({ id: k, label: t(`tgt_${k}`) })),
        onChange: v => ctxRef.patchSession(sid, { target: v })
      }),
      jsx('div', { className: 'sp-hint', children: t('targetHint') }),
      jsx(SwitchRow, { label: t('sendCtxLabel'), on: handoff, onChange: v => ctxRef.setHandoff(v) }),
      jsx('div', { className: 'sp-hint', children: t('sendCtxHint') }),
      jsxs('div', { className: 'sp-set', children: [
        jsx('label', { children: t('botLabel') }),
        jsx('span', { className: 'sp-hint', children: bots.length ? bots.join(', ') : t('botNone') })
      ] })
    ] })
  }
  return null
}

// --------------------------------------------------------------------------
// UI — Vorschlagsleiste, Options-Chip, Ziel-Menü, Statuschip, Seite
// --------------------------------------------------------------------------

function Dropdown({ headLabel, items, value, onPick, describe, wide }) {
  const [open, setOpen] = useState(false)
  const current = items.find(i => i.id === value) || items[0]
  return jsxs(Popover, {
    open,
    onOpenChange: setOpen,
    children: [
      jsx(PopoverTrigger, {
        asChild: true,
        children: jsx('button', {
          className: 'sp-opt',
          type: 'button',
          title: describe(current),
          children: [jsx('span', { children: current.label }), jsx('span', { className: 'sp-caret', children: '▾' })]
        })
      }),
      jsx(PopoverContent, {
        side: 'top', align: 'start', variant: 'menu',
        className: 'sp-menu-panel', 'aria-label': headLabel,
        children: jsxs('div', {
          className: wide ? 'sp-menu sp-menu-wide' : 'sp-menu',
          children: [
            jsx('div', { className: 'sp-menu-head', children: headLabel }),
            ...items.map(item =>
              jsx('button', {
                className: 'sp-row',
                type: 'button',
                'data-current': item.id === value,
                onClick: () => {
                  setOpen(false)
                  onPick(item)
                },
                children: [
                  jsxs('span', {
                    className: 'sp-row-label',
                    children: [
                      jsx('span', { className: 'sp-row-check', children: item.id === value ? '✓' : '' }),
                      jsx('span', { children: item.label })
                    ]
                  }),
                  item.desc ? jsx('span', { className: 'sp-row-desc', children: item.desc }) : null
                ]
              }, item.id)
            )
          ]
        })
      })
    ]
  })
}

/** Der EINE Options-Chip (⚙) mit Subtabs — gleiches Chip-Design wie die Schritte. */
function OptionsChip({ ctxRef }) {
  const t = useT()
  const [tab, setTab] = useState('focus')
  const sid = useValue(host.state.focusedSessionId)
  return jsxs(Popover, {
    children: [
      jsx(PopoverTrigger, {
        asChild: true,
        children: jsx('button', {
          className: 'sp-opt',
          type: 'button',
          title: t('focusHead'),
          children: [jsx('span', { children: '⚙' }), jsx('span', { className: 'sp-caret', children: '▾' })]
        })
      }),
      jsx(PopoverContent, {
        side: 'top', align: 'start', variant: 'menu',
        className: 'sp-menu-panel', 'aria-label': t('focusHead'),
        children: jsxs('div', { className: 'sp-menu sp-menu-wide', children: [
          jsxs('div', { className: 'sp-tabs', children: [
            ...TAB_IDS.map(id => jsx('button', {
              className: 'sp-tab', type: 'button', 'data-active': tab === id,
              onClick: () => setTab(id), children: tabLabel(t, id)
            }, id))
          ] }),
          jsx(OptionsBody, { tab, t, ctxRef, sid })
        ] })
      })
    ]
  })
}

/** „Neu generieren“ — führt die Vorhersage-Anfrage erneut aus und ersetzt
 *  die Vorschläge der fokussierten Session durch frische. Gesperrt, solange
 *  der Agent arbeitet oder der Call läuft. */
/** „Start/Stop“ — pausiert die automatische Generierung (nach Agent-Antworten).
 *  Pausiert: keine neuen Auto-Vorschläge, Step-Chips gedimmt; der manuelle
 *  ⟳-Klick generiert weiterhin. Zustand global + persistent. */
function PauseChip({ ctxRef }) {
  const t = useT()
  const paused = useValue(pausedAtom)
  return jsx('button', {
    className: 'sp-opt sp-pause',
    type: 'button',
    title: paused ? t('resumeTip') : t('pauseTip'),
    'aria-label': paused ? t('resumeTip') : t('pauseTip'),
    'aria-pressed': paused ? 'true' : 'false',
    'data-paused': paused ? 'true' : 'false',
    onClick: () => ctxRef.setPaused(!paused),
    children: jsx('span', { className: 'sp-pause-icon', children: paused ? '\u25B6\uFE0E' : '\u23F8\uFE0E' })
  })
}

function RefreshChip({ ctxRef }) {
  const t = useT()
  const sid = useValue(host.state.focusedSessionId)
  const agentBusy = useValue(host.state.busy)
  const busyMap = useValue(busyMapAtom)
  const key = ctxRef.sessionKey(sid)
  const busy = Boolean(key && busyMap[key])
  const blocked = !sid || busy
  return jsx('button', {
    className: 'sp-opt sp-refresh',
    type: 'button',
    title: t('refreshTip'),
    'aria-label': t('refreshLabel'),
    'data-busy': busy ? 'true' : 'false',
    'data-blocked': blocked ? 'true' : 'false',
    onClick: () => { if (!blocked) refreshFor(ctxRef, sid, { force: true }) },
    children: jsx('span', { className: 'sp-refresh-icon', children: '⟳' })
  })
}

/** Ziel-Menü am Chip-Ende — einmaliges Ziel für genau diesen Klick. */
function TargetMenu({ ctxRef, step, t, onDone }) {
  const bots = useValue(botsAtom)
  const [open, setOpen] = useState(false)
  const items = [
    { id: 'session', kind: 'session', label: t('targetSession') },
    { id: 'new', kind: 'new', label: t('targetNew') },
    { id: 'kanban', kind: 'kanban', label: t('targetKanban') },
    ...bots.map(b => ({ id: `bot:${b}`, kind: 'bot', bot: b, label: `◎ ${b}` }))
  ]
  return jsxs(Popover, {
    open,
    onOpenChange: setOpen,
    children: [
      jsx(PopoverTrigger, {
        asChild: true,
        children: jsx('button', {
          className: 'sp-target',
          type: 'button',
          title: t('chipMenu'),
          children: jsx(Codicon, { name: 'send', size: '0.72rem' })
        })
      }),
      jsx(PopoverContent, {
        side: 'top', align: 'end', variant: 'menu',
        className: 'sp-menu-panel', 'aria-label': t('chipMenu'),
        children: jsxs('div', { className: 'sp-menu', children: [
          jsx('div', { className: 'sp-menu-head', children: t('chipMenu') }),
          ...items.map(item =>
            jsx('button', {
              className: 'sp-row',
              type: 'button',
              onClick: () => {
                setOpen(false)
                void sendStep(ctxRef, step, item, t).then(dest => {
                  if (dest) host.notify({ kind: 'info', message: fmt(t('notifySent'), [dest]) })
                  onDone?.()
                })
              },
              children: jsx('span', { className: 'sp-row-label', children: jsx('span', { children: item.label }) })
            }, item.id)
          )
        ] })
      })
    ]
  })
}

/** Vorschlagsleiste: Options-Chip IMMER (bei fokussierter Session) + die Schritt-Chips der Session. */
function Suggestions({ ctxRef }) {
  const t = useT()
  const sid = useValue(host.state.focusedSessionId)
  const map = useValue(sessionMapAtom)
  const paused = useValue(pausedAtom)
  // LESEN über denselben Key, unter dem geschrieben wird (stored Session-ID).
  // Runtime-ID != Persistenz-Key — sonst bleiben die Chips unsichtbar.
  const st = sessionState(map, ctxRef.sessionKey(sid))
  if (!sid) return null
  return jsxs('div', {
    className: 'sp-wrap',
    'data-paused': paused ? 'true' : 'false',
    children: [
      jsx(PauseChip, { ctxRef }),
      jsx(OptionsChip, { ctxRef }),
      jsx(RefreshChip, { ctxRef }),
      ...st.steps.map((step, index) =>
        jsxs('span', {
          className: 'sp-btn',
          title: step,
          children: [
            jsx('span', { className: 'sp-num', children: `${index + 1}` }),
            jsx('span', {
              className: 'sp-label',
              onClick: () => {
                void sendStep(ctxRef, step, { kind: st.target }, t).then(dest => {
                  if (dest) host.notify({ kind: 'info', message: fmt(t('notifySent'), [dest]) })
                  setSessionSteps(ctxRef, sid, [])
                })
              },
              children: step
            }),
            jsx(TargetMenu, { ctxRef, step, t, onDone: () => setSessionSteps(ctxRef, sid, []) })
          ]
        }, `${index}:${step}`)
      )
    ]
  })
}

function StatusChip({ ctxRef }) {
  const t = useT()
  const sid = useValue(host.state.focusedSessionId)
  const busyMap = useValue(busyMapAtom)
  const error = useValue(errorAtom)
  const mc = useValue(modelCfgAtom)
  const key = ctxRef.sessionKey(sid)
  const busy = Boolean(key && busyMap[key])
  return jsx(Tip, {
    label: fmt(t('chipTip'), [mc.model]),
    children: jsx('button', {
      className: 'sp-chip',
      type: 'button',
      'data-busy': busy,
      'data-error': Boolean(error),
      onClick: () => {
        if (busy) return
        if (error) host.notify({ kind: 'error', message: `Next Steps: ${error}` })
        refreshFor(ctxRef, sid, { force: true })
      },
      children: busy ? t('predictBusy') : error ? t('predictError') : t('predict')
    })
  })
}

/** Einstellungsseite — alle Optionen mit Erklärungen, Abschnitt für Abschnitt. */
function SettingsPage({ ctxRef }) {
  const t = useT()
  const sid = useValue(host.state.focusedSessionId)
  return jsxs('div', {
    className: 'sp-page',
    children: [
      jsx('h2', { children: t('settingsNav') }),
      jsx('div', { className: 'sp-intro', children: t('pageIntro') }),
      jsx('button', {
        className: 'sp-link', type: 'button',
        onClick: () => refreshFor(ctxRef, sid, { force: true }),
        children: t('refreshNow')
      }),
      jsx('div', { className: 'sp-sec', children: [
        jsx('div', { className: 'sp-sec-title', children: t('tabFocus') }),
        jsx(OptionsBody, { tab: 'focus', t, ctxRef, sid })
      ] }),
      jsx('div', { className: 'sp-sec', children: [
        jsx('div', { className: 'sp-sec-title', children: t('secModel') }),
        jsx(OptionsBody, { tab: 'model', t, ctxRef, sid })
      ] }),
      jsx('div', { className: 'sp-sec', children: [
        jsx('div', { className: 'sp-sec-title', children: t('secTargets') }),
        jsx(OptionsBody, { tab: 'targets', t, ctxRef, sid })
      ] }),
      jsx('div', { className: 'sp-sec', children: [
        jsx('div', { className: 'sp-sec-title', children: t('secDesign') }),
        jsx(OptionsBody, { tab: 'design', t, ctxRef, sid })
      ] }),
      jsx('div', { className: 'sp-sec', children: [
        jsx('div', { className: 'sp-sec-title', children: t('langLabel') }),
        jsx(OptionsBody, { tab: 'lang', t, ctxRef, sid })
      ] })
    ]
  })
}

// --------------------------------------------------------------------------
// Registrierung
// --------------------------------------------------------------------------

export default {
  id: ID,
  name: 'Next Steps',
  description: 'Per-session “next steps” via local Ollama — options chip, settings page, bot/kanban targets, tiny-model support.',
  register(ctx) {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.append(style)
    const designStyle = document.createElement('style')
    document.head.append(designStyle)

    ctx.i18n.register(STRINGS)

    // ---- Globaler State (aus Storage) -----------------------------------
    // WICHTIG: Die globalen Modul-Atoms sind die EINZIGE State-Quelle (kein
    // lokales Zwillings-Atom — das lief sonst auseinander: Schreiben ging an
    // das lokale, Rendern las vom globalen → „Einstellungen greifen nicht live“).
    const storedDesign = ctx.storage.get('design', null)
    designAtom.set({ ...DESIGN_DEFAULTS, ...(typeof storedDesign === 'object' && storedDesign ? storedDesign : {}) })
    const storedModel = ctx.storage.get('modelCfg', null)
    modelCfgAtom.set({
      model: (storedModel && storedModel.model) || MODEL_DEFAULT,
      source: (storedModel && storedModel.source) || 'ollama',
      cap: (storedModel && storedModel.cap) || 'auto',
      temperature: (storedModel && storedModel.temperature) ?? CAP_PROFILES.llm.defaultTemperature,
      numCtx: (storedModel && storedModel.numCtx) || CAP_PROFILES.llm.defaultNumCtx,
      keepAlive: (storedModel && storedModel.keepAlive) || '10m',
      port: (storedModel && storedModel.port) || PORT_DEFAULT
    })
    const storedHermesModel = ctx.storage.get('hermesModel', null)
    hermesModelAtom.set(
      storedHermesModel && typeof storedHermesModel === 'object'
        ? { model: String(storedHermesModel.model || ''), provider: String(storedHermesModel.provider || '') }
        : { model: '', provider: '' }
    )
    const storedLang = String(ctx.storage.get('lang', 'inherit'))
    langAtom.set(LANG_MODES.includes(storedLang) ? storedLang : 'inherit')
    customHintAtom.set(String(ctx.storage.get('customHint', '')))
    pausedAtom.set(Boolean(ctx.storage.get('paused', false)))
    handoffAtom.set(ctx.storage.get('handoff', true) !== false)

    // ---- Pro-Session State ----------------------------------------------
    const storedSessions = ctx.storage.get('sessionStates', null)
    sessionMapAtom.set(typeof storedSessions === 'object' && storedSessions ? storedSessions : {})

    // ---- ctxRef: Brücke React ↔ Persistenz/Config ------------------------
    const translateTag = () => {
      try {
        const mode = langAtom.get()
        if (mode === 'en' || mode === 'de') return STRINGS[mode].tag
        return ctx.i18n.t('tag') // inherit: gegen die App-Locale aufgelöst
      } catch {
        return 'en'
      }
    }
    // Non-React-Meldungen (Notify/Fehler) in der aktuellen Plugin-Sprache;
    // inherit → SDK-Kette gegen die App-Locale (de/en).
    tr = (key, ...args) => {
      try {
        const mode = langAtom.get()
        if (mode === 'en' || mode === 'de') return fmt(STRINGS[mode][key] ?? STRINGS.en[key] ?? key, args)
        return fmt(ctx.i18n.t(key), args)
      } catch {
        return fmt(STRINGS.en[key] ?? key, args)
      }
    }
    const config = () => {
      const mc = modelCfgAtom.get()
      const langMode = langAtom.get()
      const uiLang = langMode === 'inherit' ? (translateTag() === 'de' ? 'de' : 'en') : langMode
      // Quelle 'hermes': gewähltes Hermes-Katalog-Modell, sonst das App-Aktivmodell.
      const hm = hermesModelAtom.get()
      const model = mc.source === 'hermes' ? (hm.model || host.state.model.get() || mc.model) : mc.model
      return {
        model,
        port: mc.port,
        keepAlive: mc.keepAlive,
        temperature: mc.temperature,
        numCtx: mc.numCtx,
        uiLang,
        stepsInEnglish: uiLang !== 'de',
        customHint: customHintAtom.get(),
        maxSteps: designAtom.get().steps,
        profile: capProfile(mc.cap, model)
      }
    }
    const persistSessions = map => {
      const keys = Object.keys(map)
      if (keys.length > MAX_SESSION_STATES) {
        const pruned = {}
        for (const k of keys.slice(-MAX_SESSION_STATES)) pruned[k] = map[k]
        ctx.storage.set('sessionStates', pruned)
        sessionMapAtom.set(pruned)
        return
      }
      ctx.storage.set('sessionStates', map)
    }
    const ctxRef = {
      customHint: ctx.storage.get('customHint', ''),
      config,
      /**
       * Session-Key für den Pro-Session-State: die DURABLE stored session id
       * (host.state.focusedStoredSessionId), wenn sie zur übergebenen Session
       * passt — Runtime-IDs überleben keinen App-Neustart, stored IDs schon.
       * Für Event-Sessions ohne Fokus-Fallback bleibt die Runtime-ID.
       */
      sessionKey: sid => {
        if (!sid) return null
        const stored = host.state.focusedStoredSessionId
          ? host.state.focusedStoredSessionId.get()
          : null
        // Fokussierte Session → deren durable ID (Restart-stabil).
        if (stored && (sid === (host.state.focusedSessionId ? host.state.focusedSessionId.get() : null) || !sid)) {
          return stored || sid
        }
        return sid
      },
      persistSessions,
      patchSession: (sid, patch) => patchSessionState(ctxRef, sid, patch),
      setDesign: d => designAtom.set(d),
      setModelCfg: m => modelCfgAtom.set(m),
      setLang: v => langAtom.set(v),
      setPaused: v => pausedAtom.set(Boolean(v)),
      setHandoff: v => handoffAtom.set(Boolean(v)),
      setHermesModel: hm => hermesModelAtom.set({ model: String(hm.model || ''), provider: String(hm.provider || '') }),
      refreshOllamaModels: () => {
        listOllamaModels(modelCfgAtom.get().port).then(models => ollamaModelsAtom.set(models))
      },
      clipboard: async text => ctx.os.clipboard.writeText(text)
    }

    // Persistenz + Design-Anwendung
    const offDesign = designAtom.subscribe(d => {
      designStyle.textContent = designCss(d)
      ctx.storage.set('design', d)
    })
    designStyle.textContent = designCss(designAtom.get())
    const offModel = modelCfgAtom.subscribe(m => ctx.storage.set('modelCfg', m))
    const offHermesModel = hermesModelAtom.subscribe(hm => ctx.storage.set('hermesModel', hm))
    const offLang = langAtom.subscribe(v => ctx.storage.set('lang', v))
    const offCustom = customHintAtom.subscribe(v => ctx.storage.set('customHint', String(v || '')))
    const offPaused = pausedAtom.subscribe(v => ctx.storage.set('paused', Boolean(v)))
    const offHandoff = handoffAtom.subscribe(v => ctx.storage.set('handoff', Boolean(v)))

    // Event-Listener: session_id aus dem Event → Vorschläge für GENAU DIESE Session.
    const debounceTimers = {}
    const offComplete = host.onEvent('message.complete', event => {
      const sid = String(event?.session_id || '')
      if (!sid) return
      clearTimeout(debounceTimers[sid])
      debounceTimers[sid] = ctx.setTimeout(() => refreshFor(ctxRef, sid), DEBOUNCE_MS)
    })

    // Bots + Ollama-Modelliste lazy nachladen (für Ziel-Menüs / Model-Tab).
    ctx.setTimeout(() => {
      listBots().then(bots => botsAtom.set(bots))
      listOllamaModels(modelCfgAtom.get().port).then(models => ollamaModelsAtom.set(models))
    }, 4000)

    ctx.onDispose(() => {
      style.remove()
      designStyle.remove()
      offDesign()
      offModel()
      offHermesModel()
      offLang()
      offCustom()
      offPaused()
      offHandoff()
      offComplete()
      Object.values(debounceTimers).forEach(clearTimeout)
    })

    // Vorschlagsleiste unter dem Composer.
    ctx.register({
      id: 'suggestions',
      area: COMPOSER_AREAS.underside,
      render: () => jsx(Suggestions, { ctxRef })
    })

    // Statusleisten-Chip.
    ctx.register({
      id: 'chip',
      area: 'statusBar.right',
      order: 140,
      render: () => jsx(StatusChip, { ctxRef })
    })

    // Einstellungsseite + Sidebar-Navigation.
    ctx.register({
      id: 'page',
      area: ROUTES_AREA,
      data: { path: '/next-steps' },
      render: () => jsx(SettingsPage, { ctxRef })
    })
    ctx.register({
      id: 'nav',
      area: SIDEBAR_NAV_AREA,
      data: { path: '/next-steps', label: 'Next Steps', codicon: 'target' }
    })

    // Settings → Appearance (dieselbe Seite, eingebettet).
    ctx.register({
      id: 'settings',
      area: APPEARANCE_AREAS.extra,
      render: () => jsx(SettingsPage, { ctxRef })
    })

    // Erster Abruf für die fokussierte Session.
    ctx.setTimeout(() => refreshFor(ctxRef, host.state.focusedSessionId.get()), 2500)

    console.error(`[plugins] next-steps: aktiv (ollama ${modelCfgAtom.get().model} @ :${modelCfgAtom.get().port})`)
    host.notify({ kind: 'info', message: fmt(ctx.i18n.t('notifyActive'), [modelCfgAtom.get().model]) })
  }
}

// Test-Exporte (vom App-Loader ignoriert).
export { CAP_PROFILES, CATEGORY_IDS, STRINGS, buildSystemPrompt, capProfile, fetchSuggestions, fmt, handoffAtom, parseSteps, sessionMapAtom }
