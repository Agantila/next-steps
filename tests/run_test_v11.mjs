// v11: „Senden an“ — Icon (Codicon `send`) + Kontext-Übergabe (Handoff) + Kanban-Fix.
//  A) Target-Button am Chip trägt das send-Icon (Codicon, nicht mehr ⌖).
//  B) Klick an die AKTUELLE Session: payload === Schritt (kein Anhang — Kontext ist da).
//  C) Ziele OHNE Kontext (neuer Tab): Kurzfassung (Arbeitsverzeichnis + Verlauf +
//     „Aufgabe: …“) geht mit; kanonischer Flow: openSession(stored) + prompt.submit.
//  D) Handoff-Schalter aus → nur der Schritt.
//  E) Kanban: `kanban create "<Titel>" [--body "<Kontext>"]` (der Slash nutzt den
//     echten CLI-Parser; „add“ war ungültig).
//  F) Fehlausgabe („usage error“) → Clipboard-Fallback + /kanban öffnen.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PLUGIN_PATH = process.env.NS_PLUGIN_PATH || new URL('../desktop/plugin.js', import.meta.url)
const sleep = ms => new Promise(r => setTimeout(r, ms))

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

const submits = []
const promptSubmits = []
const openCalls = []
const createCalls = []
const slashCalls = []
const navCalls = []
const clipCalls = []
let slashReplies = []
const hostStub = {
  request: async (method, params) => {
    if (method === 'session.history') {
      return {
        messages: [
          { role: 'user', content: 'Bau mir ein Feature' },
          { role: 'assistant', content: 'Das Feature ist fertig.' }
        ]
      }
    }
    if (method === 'session.create') {
      createCalls.push(params)
      return { session_id: 'rt-neu', stored_session_id: 'st-neu' }
    }
    if (method === 'prompt.submit') {
      promptSubmits.push(params)
      return {}
    }
    if (method === 'slash.exec') {
      slashCalls.push(params)
      return slashReplies.shift() ?? { output: 'Created t_abcd1234  (ready)' }
    }
    if (method === 'profiles.list') return { profiles: [] }
    return {}
  },
  openSession: async id => { openCalls.push(String(id)) },
  state: {
    focusedSessionId: makeAtom('rt-1'),
    focusedStoredSessionId: makeAtom('st-1'),
    busy: makeAtom(false),
    model: makeAtom('m'),
    cwd: makeAtom('/projekt/x')
  },
  composer: { submit: (sid, text) => { submits.push({ sid, text }); return true } },
  notify: () => {},
  navigate: p => navCalls.push(p),
  onEvent: () => () => {}
}
globalThis.__SP_TEST__ = { host: hostStub, makeAtom }
globalThis.document = { createElement: () => ({ textContent: '', remove() {} }), head: { append() {} } }
globalThis.fetch = async url => {
  const u = String(url)
  if (u.includes('/api/tags')) return { ok: true, json: async () => ({ models: [{ name: 'ornith-1.5:9b' }] }) }
  return { ok: true, json: async () => ({ message: { content: '{"steps":["A"]}' } }) }
}

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
  'export const Codicon = p => ({ t: "i", p: { className: "codicon codicon-" + ((p && p.name) || "x") } })',
  'export const Popover = p => p?.children ?? null',
  'export const PopoverContent = p => p?.children ?? null',
  'export const PopoverTrigger = p => p?.children ?? null',
  'export const DropdownMenu = p => p?.children ?? null',
  'export const DropdownMenuContent = p => p?.children ?? null',
  'export const DropdownMenuTrigger = p => p?.children ?? null',
  'export const ModelCatalogMenu = () => null',
  'export const ModelMenuCloseContext = { Provider: p => p?.children ?? null }',
  `export const usePluginI18n = () => (key) => {
     const b = (globalThis.__NS_BUNDLES__ ?? {})['de'] ?? {}
     return String(b[key] ?? key)
   }`,
  'export const useState = init => { let v = typeof init === "function" ? init() : init; return [v, nv => { v = typeof nv === "function" ? nv(v) : nv }] }',
  'export const jsx = (t, p, k) => ({ t, p, k })',
  'export const jsxs = (t, p, k) => ({ t, p, k })'
].join('\n')

const tmp = mkdtempSync(join(tmpdir(), 'ns11-'))
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

const storage = new Map()
const contributions = []
const ctx = {
  register: c => contributions.push(c),
  onDispose: () => {},
  setTimeout: () => () => {},
  storage: {
    get: (k, f) => (storage.has(k) ? storage.get(k) : f),
    set: (k, v) => storage.set(k, v)
  },
  os: { clipboard: { writeText: async s => { clipCalls.push(String(s)) } } },
  i18n: {
    register: b => { globalThis.__NS_BUNDLES__ = b },
    t: (key, ...args) => {
      const b = (globalThis.__NS_BUNDLES__ ?? {})['de'] ?? {}
      return String(b[key] ?? key).replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m))
    }
  }
}
mod.default.register(ctx)

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
const sug = contributions.find(c => c.area === 'composer.underside')
const clickStep = el => collect(el, n => n.t === 'span' && n.p?.className === 'sp-label')[0]?.p?.onClick()

const setState = (target, steps) =>
  mod.sessionMapAtom.set({ 'st-1': { category: 'auto', style: 'auto', target, steps } })

// ---- A) Senden-Icon am Chip -------------------------------------------------
setState('session', ['Erster Schritt'])
let tree = sug.render()
const targets = collect(tree, n => n.t === 'button' && String(n.p?.className) === 'sp-target')
check(targets.length === 1, `Senden-Button am Chip (${targets.length})`)
const sendIcons = collect(tree, n => n.t === 'i' && String(n.p?.className || '').includes('codicon-send'))
check(sendIcons.length === 1, `Chip trägt das send-Icon (Codicon): ${sendIcons.length}`)
check(!JSON.stringify(tree).includes('⌖'), 'Kein ⌖-Zielkreuz mehr im Baum')

// ---- B) Aktuelle Session: nur der Schritt (kein Anhang) ---------------------
clickStep(tree)
await sleep(80)
check(
  submits.length === 1 && submits[0].text === 'Erster Schritt' && submits[0].sid === null,
  `session: nur der Schritt, kein Anhang („${submits[0]?.text}“)`
)

// ---- C) Neuer Tab: Handoff (Arbeitsverzeichnis + Verlauf + Aufgabe) ---------
setState('new', ['Zweiter Schritt'])
tree = sug.render()
clickStep(tree)
await sleep(120)
const newPrompt = promptSubmits[0]
const newTxt = String(newPrompt?.text || '')
check(newPrompt?.session_id === 'rt-neu', `new: Turn per prompt.submit in die Runtime-ID (${newPrompt?.session_id})`)
check(openCalls.includes('st-neu'), 'new: Session-View über die STORED-ID geöffnet')
check(createCalls[0]?.cwd === '/projekt/x' && createCalls[0]?.source === 'desktop', `new: create trägt cwd + source (${JSON.stringify(createCalls[0])})`)
check(newTxt.includes('Kontext (Übergabe aus einer anderen Hermes-Session):'), 'Handoff-Kopf')
check(newTxt.includes('Arbeitsverzeichnis: /projekt/x'), 'Handoff: Arbeitsverzeichnis')
check(newTxt.includes('user: Bau mir ein Feature') && newTxt.includes('assistant: Das Feature ist fertig.'), 'Handoff: Verlauf')
check(newTxt.trim().endsWith('Aufgabe: Zweiter Schritt'), 'Handoff endet mit der Aufgabe')

// ---- D) Handoff aus → nur der Schritt ---------------------------------------
mod.handoffAtom.set(false)
setState('new', ['Dritter Schritt'])
tree = sug.render()
clickStep(tree)
await sleep(120)
check(promptSubmits[1]?.text === 'Dritter Schritt', `Handoff aus → nur der Schritt („${promptSubmits[1]?.text}“)`)

// ---- E) Kanban: create + --body ---------------------------------------------
mod.handoffAtom.set(true)
setState('kanban', ['Karte Eins'])
tree = sug.render()
clickStep(tree)
await sleep(120)
const kan = slashCalls[0]
const kanCmd = String(kan?.command || '')
check(kanCmd.startsWith('kanban create "Karte Eins"'), `Kanban: create-Verb („${kanCmd.slice(0, 48)}…“)`)
check(kanCmd.includes('--body "') && kanCmd.includes('Arbeitsverzeichnis: /projekt/x'), 'Kanban: Kontext als --body')
check(!kanCmd.includes('kanban add'), 'Kanban: kein ungültiges „add“ mehr')

// ---- F) Fehlausgabe → Clipboard-Fallback ------------------------------------
slashReplies.push({ output: '⚠ /kanban usage error\nusage: /kanban create ...' })
setState('kanban', ['Karte Zwei'])
tree = sug.render()
clickStep(tree)
await sleep(120)
check(clipCalls.includes('Karte Zwei'), 'usage error → Schritt im Clipboard')
check(navCalls.includes('/kanban'), 'usage error → /kanban geöffnet')

if (failed) process.exit(1)
console.log('\n=== ALLE TESTS BESTANDEN (v11: Senden-Icon + Kontext-Handoff) ===')
process.exit(0)
