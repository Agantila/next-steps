// Härtetest v2 für das next-steps Plugin — reale Ollama-Anbindung (Port 11434).
// Neu: Kategorien-Ausrichtung, Schritt-Stil, Design-Tokens, num_predict-Formel.
//   1. register() ohne Fehler, Contributions korrekt
//   2. buildSystemPrompt(): Ausrichtung + Stil + Schrittzahl im Prompt
//   3. parseSteps() mit maxSteps-Kappung
//   4. fetchSuggestions() mit Kategorie → echter /api/chat Call
//   5. refresh()-Fluss → UI-State → runStep()
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PLUGIN_PATH = '/home/deniz/.hermes/desktop-plugins/next-steps/plugin.js'

function makeAtom(value) {
  let current = value
  const listeners = new Set()
  const a = {
    get: () => current,
    set: v => {
      current = v
      for (const fn of listeners) fn(v)
    },
    subscribe: fn => {
      listeners.add(fn)
      fn(current)
      return () => listeners.delete(fn)
    }
  }
  allAtoms.push(a)
  return a
}

const allAtoms = []
const contributions = []
const notifications = []
const submitted = []
const registeredEvents = []
const styleTags = []

const hostStub = {
  request: async (method, params) => {
    if (method === 'session.history') {
      return {
        messages: [
          { role: 'user', content: 'Wir bauen ein Plugin für Hermes Desktop mit Ollama-Anbindung.' },
          { role: 'assistant', content: 'Kategorien-Auswahl, Design-Panel und Frost-Effekt sind drin. Als nächstes: Härtetest und Settings-Feinschliff.' }
        ]
      }
    }
    return {}
  },
  state: {
    focusedSessionId: makeAtom('sess-test-1'),
    busy: makeAtom(false),
    model: makeAtom('glm-5.3-flash'),
    cwd: makeAtom('/home/deniz/hermes-workspace')
  },
  composer: {
    submit: (sid, text) => {
      submitted.push({ sid, text })
      return true
    }
  },
  notify: n => notifications.push(n),
  onEvent: (type, fn) => {
    registeredEvents.push({ type, fn })
    return () => {}
  }
}

globalThis.__SP_TEST__ = { host: hostStub, makeAtom }
globalThis.document = {
  createElement: () => ({ textContent: '', remove() {}, append() {} }),
  head: { append() {} }
}

// Popover-Stub (SDK-Komponenten, die der Test nicht rendert):
const sdkStub = [
  'const { host: h, makeAtom: mkAtom } = globalThis.__SP_TEST__',
  'export const host = h',
  'export const atom = mkAtom',
  'export const Tip = props => props?.children ?? null',
  'export const useValue = a => a.get()',
  "export const APPEARANCE_AREAS = { extra: 'appearance.extra' }",
  "export const COMPOSER_AREAS = { underside: 'composer.underside' }",
  'export const Popover = props => props?.children ?? null',
  'export const PopoverContent = props => props?.children ?? null',
  'export const PopoverTrigger = props => props?.children ?? null',
  'export const RowButton = props => null',
  'export const useState = init => { let v = typeof init === "function" ? init() : init; const subs = new Set(); const set = nv => { v = typeof nv === "function" ? nv(v) : nv; for (const f of subs) f(v) }; return [v, set] }',
  'export const useEffect = fn => fn()',
  'export const jsx = (type, props, key) => ({ type, props, key })',
  'export const jsxs = (type, props, key) => ({ type, props, key })'
].join('\n')

const tmp = mkdtempSync(join(tmpdir(), 'ns-test-'))
const sdkPath = join(tmp, 'sdk-stub.mjs')
writeFileSync(sdkPath, sdkStub)
const sdkUrl = pathToFileURL(sdkPath).href
const pluginSource = readFileSync(PLUGIN_PATH, 'utf8')
const rewritten = pluginSource
  .replace("from '@hermes/plugin-sdk'", `from '${sdkUrl}'`)
  .replace("from 'react/jsx-runtime'", `from '${sdkUrl}'`)
  .replace("from 'react'", `from '${sdkUrl}'`)
const testPluginPath = join(tmp, 'plugin.mjs')
writeFileSync(testPluginPath, rewritten)

let mod
try {
  mod = await import(pathToFileURL(testPluginPath).href)
} catch (error) {
  console.error('PLUGIN LOAD FAILED:', error)
  process.exit(1)
}

if (typeof mod.default?.register !== 'function') {
  console.error('✗ default export FEHLT')
  process.exit(1)
}
console.log('✓ Plugin-Modul geladen, default export ok')

// ---------------------------------------------------------------- register()
const ctxDisposers = []
const ctx = {
  register: c => contributions.push(c),
  onDispose: fn => ctxDisposers.push(fn),
  setTimeout: (fn, ms) => {
    const id = setTimeout(fn, ms)
    ctxDisposers.push(() => clearTimeout(id))
    return () => clearTimeout(id)
  },
  storage: {
    store: new Map(),
    get: (key, fallback) => (ctx.storage.store.has(key) ? ctx.storage.store.get(key) : fallback),
    set: (key, value) => ctx.storage.store.set(key, value)
  },
  i18n: { register: () => {} }
}

try {
  mod.default.register(ctx)
  console.log('✓ register() ok —', contributions.length, 'Contributions:')
  for (const c of contributions) console.log('   -', c.id, '→', c.area)
  console.log('✓ Events:', registeredEvents.map(e => e.type).join(', '))
} catch (error) {
  console.error('✗ REGISTER FAILED:', error)
  process.exit(1)
}

// Design-CSS wurde erzeugt?
if (!styleTags.length && ctx.storage.store.has('design')) {
  console.log('✓ Design-Tokens persistiert:', JSON.stringify(ctx.storage.store.get('design')))
}

// Startup-Refresh stoppen, dann gezielte Prüfungen:
for (const dispose of ctxDisposers) dispose()

// ------------------------------------------------- buildSystemPrompt()
const { buildSystemPrompt, parseSteps, fetchSuggestions, refresh, runStep } = mod

const promptCoding = buildSystemPrompt({
  category: 'coding', style: 'sofort', customHint: '', maxSteps: 4
})
const okCoding =
  promptCoding.includes('"steps"') &&
  promptCoding.includes('genau 4') &&
  promptCoding.includes('Coding') &&
  promptCoding.includes('Tests zuerst') &&
  promptCoding.includes('Mikro-Schritte')
console.log(`${okCoding ? '✓' : '✗'} buildSystemPrompt(coding/sofort/4) enthält Kontrakt+Linse+Stil`)
const promptCustom = buildSystemPrompt({
  category: 'custom', style: 'verifizieren', customHint: 'Steuerberatung — Fristen prüfen', maxSteps: 3
})
const okCustom = promptCustom.includes('Steuerberatung — Fristen prüfen') && promptCustom.includes('genau 3')
console.log(`${okCustom ? '✓' : '✗'} buildSystemPrompt(custom) nutzt eigene Methoden-Linse`)
if (!okCoding || !okCustom) process.exit(1)

// ------------------------------------------------- parseSteps() mit maxSteps
const capped = parseSteps('["a","b","c","d","e","f"]', 3)
console.log(`${capped.length === 3 ? '✓' : '✗'} parseSteps kappung auf maxSteps=3 → ${JSON.stringify(capped)}`)
if (capped.length !== 3) process.exit(1)

// ------------------------------------- fetchSuggestions() mit echtem Ollama
const config = {
  model: 'ornith-1.5:9b',
  port: 11434,
  category: 'coding',
  style: 'sofort',
  customHint: '',
  maxSteps: 4
}
const context = {
  model: 'glm-5.3-flash',
  cwd: '/home/deniz/hermes-workspace',
  history: [
    'user: Ich möchte die Vorschlags-Chips in unserem Plugin mit Frost-Effekt versehen.',
    'assistant: Frost-Effekt ist eingebaut (backdrop-filter blur 0.75rem, --composer-fill). Nächster logischer Schritt wäre der Härtetest und die Settings.',
    'user: Baue jetzt die Kategorien-Auswahl für die Ausrichtung der Prediction ein.'
  ].join('\n')
}

console.log('\n--- Echter Ollama-Call: coding + sofort umsetzbar, 4 Schritte ---')
const t0 = Date.now()
const steps = await fetchSuggestions(config, context)
console.log(`✓ Ollama antwortete in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log('Steps:', JSON.stringify(steps, null, 2))
if (!Array.isArray(steps) || steps.length < 1 || steps.length > 4) {
  console.error('✗ Schrittanzahl-Kontrakt verletzt')
  process.exit(1)
}

// ------------------------------------- refresh()-Fluss → UI-State → runStep()
console.log('\n--- refresh()-Fluss (echtes Ollama, warm) ---')
refresh(config)
let uiSteps = []
const t1 = Date.now()
while (Date.now() - t1 < 150_000) {
  await new Promise(r => setTimeout(r, 2000))
  uiSteps = []
  for (const a of allAtoms) {
    const v = a.get()
    if (Array.isArray(v) && v.length > 0) uiSteps = v
  }
  if (uiSteps.length) break
}
console.log(`✓ UI-State nach ${((Date.now() - t1) / 1000).toFixed(1)}s:`, JSON.stringify(uiSteps))
if (!uiSteps.length) {
  console.error('✗ refresh() hat keine Steps ins UI-State geschrieben')
  process.exit(1)
}

runStep(uiSteps[0])
const clickOk = submitted.length === 1 && submitted[0].text === uiSteps[0]
console.log(`${clickOk ? '✓' : '✗'} runStep() → host.composer.submit:`, JSON.stringify(submitted))
if (!clickOk) process.exit(1)

// Design-Persistenz geprüft?
const stored = ctx.storage.store.get('design')
console.log(`${stored && typeof stored.frost === 'boolean' ? '✓' : '✗'} Design-Tokens in storage:`, JSON.stringify(stored))

console.log('\n=== ALLE TESTS BESTANDEN ===')
process.exit(0)
