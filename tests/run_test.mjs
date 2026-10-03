// Härtetest für das session-predict Plugin — reale Ollama-Anbindung (Port 11434).
// Simuliert den Plugin-Loader (Stub-SDK + Blob-Import) und prüft:
//   1. register() ohne Fehler, Contributions korrekt
//   2. parseSteps(): JSON-Array, {"steps":[...]}, Bare-Array-Extraktion
//   3. fetchSuggestions(): echter /api/chat Call gegen das lokale Ollama
//   4. refresh()-Fluss inkl. session.history-Stub → Steps landen im UI-State
//   5. runStep() → host.composer.submit
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PLUGIN_PATH = '/home/deniz/.hermes/desktop-plugins/session-predict/plugin.js'

// ------------------------------------------------------------- Stub-SDK
function makeAtom(value) {
  let current = value
  const listeners = new Set()
  createdAtoms.push(current)
  const atom = {
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
  allAtoms.push(atom)
  return atom
}

const createdAtoms = []
const allAtoms = []
const contributions = []
const notifications = []
const submitted = []
const registeredEvents = []

const hostStub = {
  request: async (method, params) => {
    if (method === 'session.history') {
      console.log('   [rpc] session.history für', params.session_id)
      return {
        messages: [
          { role: 'user', content: 'Installiere ein Session-Prediction-Plugin für Hermes Desktop, angebunden an lokales Ollama.' },
          { role: 'assistant', content: 'Plugin ist gebaut: Ollama-Anbindung ueber /api/chat, Event-Listener auf message.complete, Buttons unter dem Composer. Jetzt haerte ich es gegen das echte Modell.' }
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
// Minimaler DOM-Stub (register() injiziert CSS via document.head):
globalThis.document = {
  createElement: () => ({ textContent: '', remove() {} }),
  head: { append() {} }
}

const sdkStub = [
  'const { host: h, makeAtom: mkAtom } = globalThis.__SP_TEST__',
  'export const host = h',
  'export const atom = mkAtom',
  'export const Tip = () => null',
  'export const useValue = a => a.get()',
  "export const APPEARANCE_AREAS = { extra: 'appearance.extra' }",
  "export const COMPOSER_AREAS = { underside: 'composer.underside' }",
  'export default { host: h, atom: mkAtom, Tip, useValue, APPEARANCE_AREAS, COMPOSER_AREAS }',
  'export const jsx = (type, props, key) => ({ type, props, key })',
  'export const jsxs = (type, props, key) => ({ type, props, key })'
].join('\n')

const tmp = mkdtempSync(join(tmpdir(), 'sp-test-'))
const sdkPath = join(tmp, 'sdk-stub.mjs')
writeFileSync(sdkPath, sdkStub)
const sdkUrl = pathToFileURL(sdkPath).href
const pluginSource = readFileSync(PLUGIN_PATH, 'utf8')
const rewritten = pluginSource
  .replace("from '@hermes/plugin-sdk'", `from '${sdkUrl}'`)
  .replace("from 'react/jsx-runtime'", `from '${sdkUrl}'`)
const testPluginPath = join(tmp, 'plugin.mjs')
writeFileSync(testPluginPath, rewritten)

let mod
try {
  mod = await import(pathToFileURL(testPluginPath).href)
} catch (error) {
  console.error('PLUGIN LOAD FAILED:', error)
  process.exit(1)
}

const defaultOk = typeof mod.default?.register === 'function'
console.log(defaultOk ? '✓ Plugin-Modul geladen, default export ok' : '✗ default export FEHLT')
if (!defaultOk) process.exit(1)

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
    get: (_key, fallback) => fallback,
    set: () => {}
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

// Der Startup-Abruf aus register() (ctx.setTimeout 2500ms) würde jetzt doppelt
// laufen — wir stoppen ihn, damit der Test den Fluss selbst steuert.
for (const dispose of ctxDisposers) dispose()

// ------------------------------------------------------------- parseSteps()
const { parseSteps, runStep, fetchSuggestions, refresh } = mod

const cases = [
  ['["a","b","c"]', ['a', 'b', 'c']],
  ['{"steps":["x","y"]}', ['x', 'y']],
  ['Hier ist mein Vorschlag: ["s1","s2","s3"] und sonst nichts.', ['s1', 's2', 's3']],
  ['{"A":"eins","B":"zwei"}', ['eins', 'zwei']],
  ['gar kein JSON', []]
]
let parseOk = true
for (const [input, expected] of cases) {
  const got = parseSteps(input)
  const match = JSON.stringify(got) === JSON.stringify(expected)
  if (!match) parseOk = false
  console.log(`${match ? '✓' : '✗'} parseSteps(${JSON.stringify(input.slice(0, 44))}) → ${JSON.stringify(got)}`)
}
if (!parseOk) process.exit(1)

// ------------------------------------- fetchSuggestions(): ECHTES Ollama
// Kontext = der echte aktuelle Session-Auftrag (realistischer Härtetest).
const context = {
  model: 'glm-5.3-flash',
  cwd: '/home/deniz/hermes-workspace',
  history: [
    'user: Installiere ein Session-Prediction-Plugin für Hermes Desktop via lokales Ollama.',
    'assistant: SDK verifiziert (composer.underside, host.composer.submit, message.complete-Event). Ollama läuft, ornith-1.5:9b antwortet via /api/chat mit format:json. Plugin geschrieben, jetzt Härtetest.',
    'user: Zeig mir eine Test-Rückgabe der generierten Buttons.'
  ].join('\n')
}

console.log('\n--- Echter Ollama-Call via fetchSuggestions() (Kaltstart kann dauern) ---')
const t0 = Date.now()
const steps = await fetchSuggestions({ model: 'ornith-1.5:9b', port: 11434 }, context)
console.log(`✓ Ollama antwortete in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log('Steps:', JSON.stringify(steps, null, 2))
if (!Array.isArray(steps) || steps.length < 3 || steps.length > 5) {
  console.error('✗ Erfolgskriterium verletzt: 3–5 Steps erwartet')
  process.exit(1)
}
console.log('✓ 3–5 Steps bestätigt')

// ------------------------------------- refresh()-Fluss → UI-State → runStep()
console.log('\n--- refresh()-Fluss (Event-Pfad, echtes Ollama, warmes Modell) ---')
const config = { model: 'ornith-1.5:9b', port: 11434 }
refresh(config)

// stepsAtom = das Atom, das nach dem refresh ein nicht-leeres Array hält.
let uiSteps = []
const t1 = Date.now()
while (Date.now() - t1 < 150_000) {
  await new Promise(r => setTimeout(r, 2000))
  uiSteps = []
  for (const atom of allAtoms) {
    const v = atom.get()
    if (Array.isArray(v) && v.length > 0) uiSteps = v
  }
  if (uiSteps.length) break
}

console.log(`✓ UI-State nach ${((Date.now() - t1) / 1000).toFixed(1)}s:`, JSON.stringify(uiSteps))
if (!uiSteps.length) {
  console.error('✗ refresh() hat keine Steps ins UI-State geschrieben')
  process.exit(1)
}

// Klick auf Button 1 simulieren:
runStep(uiSteps[0])
const clickOk = submitted.length === 1 && submitted[0].text === uiSteps[0]
console.log(`${clickOk ? '✓' : '✗'} runStep() → host.composer.submit:`, JSON.stringify(submitted))
if (!clickOk) process.exit(1)

console.log('\n=== ALLE TESTS BESTANDEN ===')
process.exit(0)
