// v10: „Neu generieren“-Button — Klick führt die Vorhersage-Anfrage ERNEUT aus
//  und ersetzt die Vorschläge durch frische.
//  A) Button existiert in der Vorschlagsleiste (Icon-only ⟳, aria-label, Tooltip).
//     WICHTIG: Runtime-ID ≠ stored Session-ID (wie in der echten App:
//     'runtime-tile-a' vs 'tile-a') — Lesen UND Schreiben laufen über die stored-ID.
//  B) Klick → /api/chat wird erneut aufgerufen → NEUE Steps erscheinen als Chips.
//  C) Manueller Klick läuft auch bei laufendem Agent (force); Doppel-Call-
//     Schutz greift nur, solange der eigene Call läuft (pluginBusy).
//  E) Start/Stop (⏸/▶) VOR dem Options-Chip: pausiert die Auto-Generierung,
//     dimmt die Chips (data-paused), Resume lässt den Auto-Pfad wieder laufen.
//  F) Popover-Sprache folgt der App-Sprache im Modus „inherit" (en ↔ de live).
//  G) Neue Ausrichtung „methodik" (Methodik & Best Practices): Keys + Prompt.
// Harness: Stub-SDK mit rekursivem Element-Walk (führt Funktionskomponenten aus).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PLUGIN_PATH = process.env.NS_PLUGIN_PATH || new URL('../plugin.js', import.meta.url)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const PLAY = String.fromCodePoint(0x25B6) // ▶ (Text-Variation)
const PAUSE = String.fromCodePoint(0x23F8) // ⏸
let failed = false
const check = (ok, label, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ' → ' + detail : ''}`)
  if (!ok) failed = true
}

function makeAtom(v) {
  let c = v
  const l = new Set()
  return { get: () => c, set: x => { c = x; for (const f of l) f(c) }, subscribe: f => { l.add(f); f(c); return () => l.delete(f) } }
}

// fetch-Stub: /api/tags (Modell existiert) + /api/chat mit WECHSELNDEN Antworten,
// damit „neue Vorschläge“ beweisbar andere Steps sind als der erste Lauf.
let chatCalls = 0
let tagCalls = 0
let holdNextChat = null // wenn gesetzt: /api/chat wartet auf dieses Promise
let releaseChat = null
const chatBodies = []
const CHAT_REPLIES = [
  { steps: ['Schritt A', 'Schritt B', 'Schritt C'] },
  { steps: ['Schritt EINS-neu', 'Schritt ZWEI-neu', 'Schritt DREI-neu'] }
]
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url)
  if (u.includes('/api/tags')) {
    tagCalls++
    return { ok: true, json: async () => ({ models: [{ name: 'ornith-1.5:9b' }, { name: 'llama3:8b' }] }) }
  }
  if (u.includes('/api/chat')) {
    chatCalls++
    chatBodies.push(JSON.parse(opts.body || '{}'))
    if (holdNextChat) { const held = holdNextChat; holdNextChat = null; await held }
    const reply = CHAT_REPLIES[Math.min(chatCalls - 1, CHAT_REPLIES.length - 1)]
    return { ok: true, json: async () => ({ message: { content: JSON.stringify(reply) } }) }
  }
  throw new Error(`unerwarteter fetch: ${u}`)
}

const historyCalls = []
const capturedEvents = {}
const hostStub = {
  request: async (method, params) => {
    if (method === 'session.history') {
      historyCalls.push(params)
      return {
        messages: [
          { role: 'user', content: 'Bau mir ein Feature' },
          { role: 'assistant', content: 'Das Feature ist fertig.' }
        ]
      }
    }
    if (method === 'profiles.list') return { profiles: [] }
    return {}
  },
  state: {
    focusedSessionId: makeAtom('rt-1'),
    focusedStoredSessionId: makeAtom('st-1'),
    busy: makeAtom(false),
    model: makeAtom('glm-test'),
    cwd: makeAtom('/x')
  },
  composer: { submit: () => true },
  notify: () => {},
  onEvent: (type, fn) => { capturedEvents[type] = fn; return () => {} }
}
globalThis.__SP_TEST__ = { host: hostStub, makeAtom }
globalThis.document = { createElement: () => ({ textContent: '', remove() {} }), head: { append() {} } }

// SDK-Stub: Layout-Komponenten geben children zurück; der Element-Walk unten
// führt Funktionskomponenten rekursiv aus, damit der Baum ECHT durchlaufen wird.
const sdk = [
  'const { host: h, makeAtom: mk } = globalThis.__SP_TEST__',
  'export const host = h',
  'export const atom = mk',
  'export const useValue = a => a.get()',
  "export const APPEARANCE_AREAS = { extra: 'appearance.extra' }",
  "export const COMPOSER_AREAS = { underside: 'composer.underside' }",
  "export const ROUTES_AREA = 'routes'",
  "export const SIDEBAR_NAV_AREA = 'sidebar-nav'",
  'export const Tip = p => p?.children ?? null',
  'export const Codicon = () => null',
  'export const Popover = p => p?.children ?? null',
  'export const PopoverContent = p => p?.children ?? null',
  'export const PopoverTrigger = p => p?.children ?? null',
  'export const DropdownMenu = p => p?.children ?? null',
  'export const DropdownMenuContent = p => p?.children ?? null',
  'export const DropdownMenuTrigger = p => p?.children ?? null',
  'export const ModelCatalogMenu = () => null',
  'export const ModelMenuCloseContext = { Provider: p => p?.children ?? null }',
  `export const usePluginI18n = () => (key) => {
     const bundles = globalThis.__NS_BUNDLES__ ?? {}
     const loc = globalThis.__NS_APP_LOCALE__ ?? 'de'
     const b = bundles[loc] ?? bundles['en'] ?? {}
     return String(b[key] ?? key)
   }`,
  'export const useState = init => { let v = typeof init === "function" ? init() : init; return [v, nv => { v = typeof nv === "function" ? nv(v) : nv }] }',
  'export const jsx = (t, p, k) => ({ t, p, k })',
  'export const jsxs = (t, p, k) => ({ t, p, k })'
].join('\n')

const tmp = mkdtempSync(join(tmpdir(), 'ns10-'))
writeFileSync(join(tmp, 'sdk.mjs'), sdk)
const sdkUrl = pathToFileURL(join(tmp, 'sdk.mjs')).href
const src = readFileSync(PLUGIN_PATH, 'utf8')
const rewritten = src
  .replace("from '@hermes/plugin-sdk'", `from '${sdkUrl}'`)
  .replace("from 'react/jsx-runtime'", `from '${sdkUrl}'`)
  .replace("from 'react'", `from '${sdkUrl}'`)
writeFileSync(join(tmp, 'plugin.mjs'), rewritten)

const mod = await import(pathToFileURL(join(tmp, 'plugin.mjs')).href)
console.log('✓ Plugin-Modul geladen')

// Timer-Collector: erlaubt, den message.complete-Debounce (1200 ms) gezielt
// zu feuern — wie der echte ctx.setTimeout.
const timers = []
const flushDebounce = () => {
  const due = timers.filter(t => t.ms === 1200)
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].ms === 1200) timers.splice(i, 1)
  due.forEach(t => t.fn())
}
const storage = new Map()
const contributions = []
const ctx = {
  register: c => contributions.push(c),
  onDispose: () => {},
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return () => {} },
  storage: {
    get: (k, f) => (storage.has(k) ? storage.get(k) : f),
    set: (k, v) => storage.set(k, v)
  },
  os: { clipboard: { writeText: async () => {} } },
  i18n: {
    register: b => { globalThis.__NS_BUNDLES__ = b },
    t: (key, ...args) => {
      const bundles = globalThis.__NS_BUNDLES__ ?? {}
      const loc = globalThis.__NS_APP_LOCALE__ ?? 'de'
      const b = bundles[loc] ?? bundles['en'] ?? {}
      return String(b[key] ?? key).replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m))
    }
  }
}
mod.default.register(ctx)

// Element-Walk: führt Funktionskomponenten aus, sammelt native Elemente.
function walk(node, visit) {
  if (node == null || typeof node !== 'object') return
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return }
  if (typeof node.t === 'function') { walk(node.t(node.p ?? {}), visit); return }
  if (node.t !== undefined) {
    visit(node)
    if (node.p && node.p.children !== undefined) walk(node.p.children, visit)
  }
}
const collect = (el, pred) => {
  const out = []
  walk(el, n => { if (pred(n)) out.push(n) })
  return out
}
const isRefresh = n => n.t === 'button' && String(n.p?.className || '').includes('sp-refresh')
const stepLabels = el => collect(el, n => String(n.p?.className || '') === 'sp-label').map(n => n.p.children)

// ---- A) Button vorhanden, Label aufgelöst ---------------------------------
const sug = contributions.find(c => c.area === 'composer.underside')
check(Boolean(sug?.render), 'Vorschlagsleiste registriert (composer.underside)')

let tree = sug.render()
const buttons = collect(tree, isRefresh)
check(buttons.length === 1, `Genau EIN „Neu generieren“-Button (gefunden: ${buttons.length})`)
const btn = buttons[0]
const btnJson = JSON.stringify(btn?.p?.children ?? null)
check(btnJson.includes('⟳'), `Button zeigt das ⟳-Icon: ${btnJson}`)
check(!btnJson.includes('Neu generieren'), 'Button OHNE sichtbares Text-Label (nur Icon)')
check(btn?.p?.['aria-label'] === 'Neu generieren', `aria-label gesetzt: „${btn?.p?.['aria-label']}“`)
check(String(btn?.p?.title || '').length > 10, `Tooltip gesetzt: „${btn?.p?.title}“`)
check(stepLabels(tree).length === 0, 'Startzustand: keine Step-Chips')
const optChips = collect(tree, n => n.t === 'button' && String(n.p?.className || '').startsWith('sp-opt'))
check(optChips.length === 3, `Drei Steuer-Chips: ${optChips.map(c => c.p.className).join(' | ')}`)
check(String(optChips[0]?.p?.className).includes('sp-pause'), 'Start/Stop-Button steht VOR dem Options-Chip')
check(optChips[0]?.p?.['data-paused'] === 'false', 'Startzustand: nicht pausiert')
check(String(optChips[0]?.p?.children?.p?.children || '').includes(PAUSE), 'Icon im aktiven Zustand: ⏸ (echtes Unicode-Zeichen)')

// ---- B) Klick → Anfrage erneut ausführen ----------------------------------
btn.p.onClick()
await sleep(200)
check(chatCalls === 1, `Klick löst genau EINEN neuen /api/chat-Call aus (calls=${chatCalls})`)
check(tagCalls >= 1, `Modell-Validierung lief (/api/tags, calls=${tagCalls})`)
check(historyCalls.length === 1, `Kontext frisch geholt (session.history × ${historyCalls.length})`)
check(
  Array.isArray(chatBodies[0]?.messages) && String(chatBodies[0].messages[0]?.content || '').includes('JSON'),
  'Chat-Body trägt den System-Prompt der aktuellen Config'
)

tree = sug.render()
const labels1 = stepLabels(tree)
check(
  labels1.join('|') === 'Schritt A|Schritt B|Schritt C',
  `Neue Steps als Chips gerendert: ${labels1.join(' · ')}`
)
const persisted = storage.get('sessionStates')
check(
  persisted?.['st-1']?.steps?.[0] === 'Schritt A',
  `State unter stored-Key „st-1“ persistiert: ${JSON.stringify(persisted?.['st-1']?.steps)}`
)
check(!persisted?.['rt-1'], 'Kein State unter der Runtime-ID „rt-1“ abgelegt')

// ---- C) Manueller Klick läuft auch bei laufendem Agent (force) -------------
hostStub.state.busy.set(true)
tree = sug.render()
const btnForce = collect(tree, isRefresh)[0]
check(btnForce?.p?.['data-blocked'] !== 'true', 'Bei laufendem Agent: Button nicht gesperrt (manuell erlaubt)')
btnForce.p.onClick()
await sleep(200)
check(chatCalls === 2, `Klick bei laufendem Agent → Refresh läuft trotzdem (calls=${chatCalls})`)
hostStub.state.busy.set(false)
tree = sug.render()
const labels2 = stepLabels(tree)
check(
  labels2.join('|') === 'Schritt EINS-neu|Schritt ZWEI-neu|Schritt DREI-neu',
  `Vorschläge wurden durch frische ERSETZT: ${labels2.join(' · ')}`
)

// ---- D) Doppelklick-Schutz: während der Call läuft kein zweiter ------------
holdNextChat = new Promise(r => { releaseChat = r })
tree = sug.render()
collect(tree, isRefresh)[0].p.onClick()
await sleep(60)
tree = sug.render()
const btnPending = collect(tree, isRefresh)[0]
check(btnPending?.p?.['data-busy'] === 'true', 'Während des Calls: Busy-Zustand sichtbar')
check(btnPending?.p?.['data-blocked'] === 'true', 'Während des Calls: Klick gesperrt')
btnPending.p.onClick()
await sleep(80)
check(chatCalls === 3, `Zweiter Klick während laufendem Call → kein weiterer Call (calls=${chatCalls})`)
releaseChat()
await sleep(120)
tree = sug.render()
const labels3 = stepLabels(tree)
check(labels3.length === 3, `Call abgeschlossen → Chips weiter da: ${labels3.join(' · ')}`)

// ---- E) Start/Stop: Auto-Generierung pausieren, Chips gedimmt ---------------
const pauseBtn = collect(tree, n => n.t === 'button' && String(n.p?.className).includes('sp-pause'))[0]
pauseBtn.p.onClick() // pausieren
tree = sug.render()
const wrap = collect(tree, n => n.t === 'div' && n.p?.className === 'sp-wrap')[0]
check(wrap?.p?.['data-paused'] === 'true', 'Pausiert: Leiste trägt data-paused (Chips gedimmt)')
check(String(collect(tree, n => n.t === 'button' && String(n.p?.className).includes('sp-pause'))[0]?.p?.children?.p?.children || '').includes(PLAY), 'Icon im pausierten Zustand: ▶')
check(collect(tree, n => n.t === 'button' && String(n.p?.className).includes('sp-pause'))[0].p['data-paused'] === 'true', 'Pausiert: Button im Start-Zustand')
capturedEvents['message.complete']?.({ session_id: 'rt-1' })
flushDebounce()
await sleep(150)
check(chatCalls === 3, `Pausiert: Auto-Refresh übersprungen (calls=${chatCalls})`)
collect(tree, isRefresh)[0].p.onClick() // manueller ⟳ geht weiter
await sleep(200)
check(chatCalls === 4, `Pausiert: manueller ⟳-Klick generiert trotzdem (calls=${chatCalls})`)
// fortsetzen → Auto-Pfad läuft wieder
const pauseBtnResume = collect(sug.render(), n => n.t === 'button' && String(n.p?.className).includes('sp-pause'))[0]
pauseBtnResume.p.onClick()
capturedEvents['message.complete']?.({ session_id: 'rt-1' })
flushDebounce()
await sleep(200)
check(chatCalls === 5, `Fortgesetzt: Auto-Refresh läuft wieder (calls=${chatCalls})`)

// ---- F) Popover folgt der App-Sprache (inherit) -----------------------------
globalThis.__NS_APP_LOCALE__ = 'en'
tree = sug.render()
const enRefresh = collect(tree, isRefresh)[0]
check(enRefresh?.p?.['aria-label'] === 'Regenerate', `inherit + App=en → englisches Label („${enRefresh?.p?.['aria-label']}“)`)
const enPause = collect(tree, n => n.t === 'button' && String(n.p?.className).includes('sp-pause'))[0]
check(String(enPause?.p?.title || '').includes('Pause auto-generation'), 'inherit + App=en → Pause-Tooltip englisch')
globalThis.__NS_APP_LOCALE__ = 'de'
tree = sug.render()
check(collect(tree, isRefresh)[0]?.p?.['aria-label'] === 'Neu generieren', 'inherit + App=de → deutsches Label')

// ---- G) Neue Ausrichtung „methodik“ -----------------------------------------
const { CATEGORY_IDS, STRINGS } = mod
check(CATEGORY_IDS.includes('methodik'), `Kategorie methodik registriert: ${CATEGORY_IDS.join(', ')}`)
check(
  CATEGORY_IDS.filter(id => id !== 'custom').every(
    id => STRINGS.en[`cat_${id}`] && STRINGS.de[`cat_${id}`] && STRINGS.en[`cat_${id}_hint`] && STRINGS.de[`cat_${id}_hint`]
  ),
  'Alle Kategorien haben Label + Hint in en UND de (inkl. methodik)'
)
const methodikPrompt = mod.buildSystemPrompt({
  uiLang: 'de', category: 'methodik', style: 'auto', customHint: '',
  profile: mod.CAP_PROFILES.llm, maxSteps: 5, stepsInEnglish: false
})
check(
  methodikPrompt.includes(STRINGS.de.cat_methodik) && methodikPrompt.includes(STRINGS.de.cat_methodik_hint),
  'Prompt nutzt die Methodik-Linse (Label + Hint)'
)

if (failed) process.exit(1)
console.log('\n=== ALLE TESTS BESTANDEN (v10: „Neu generieren“ + Start/Stop) ===')
process.exit(0)
