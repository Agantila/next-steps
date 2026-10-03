// Härtetest v5 — Settings-Pfade: Set-Funktionen aufrufen und State-/Storage-Effekt prüfen.
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
  return a
}

const hostStub = {
  request: async m => (m === 'profiles.list' ? { profiles: [{ name: 'tev1' }] } : {}),
  state: {
    focusedSessionId: makeAtom('sess-A'),
    busy: makeAtom(false),
    model: makeAtom('glm-5.3-flash'),
    cwd: makeAtom('/home/deniz/hermes-workspace')
  },
  composer: { submit: () => true },
  notify: () => {},
  onEvent: () => () => {}
}
globalThis.__SP_TEST__ = { host: hostStub, makeAtom }
globalThis.document = { createElement: () => ({ textContent: '', remove() {} }), head: { append() {} } }

const sdkStub = `
const { host: h, makeAtom: mkAtom } = globalThis.__SP_TEST__
export const host = h
export const atom = mkAtom
export const Tip = p => p?.children ?? null
export const useValue = a => a.get()
export const APPEARANCE_AREAS = { extra: 'appearance.extra' }
export const COMPOSER_AREAS = { underside: 'composer.underside' }
export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebar-nav'
export const Popover = p => p?.children ?? null
export const PopoverContent = p => p?.children ?? null
export const PopoverTrigger = p => p?.children ?? null
export const usePluginI18n = () => (key, ...args) => {
  const bundles = globalThis.__NS_BUNDLES__
  const b = bundles['de']
  const s = String(b[key] ?? key)
  return s.replace(/\\{(\\d+)\\}/g, (m, i) => String(args[Number(i)] ?? m))
}
export const useState = init => { let v = typeof init === 'function' ? init() : init; return [v, nv => { v = typeof nv === 'function' ? nv(v) : nv }] }
export const jsx = (type, props, key) => ({ type, props, key })
export const jsxs = (type, props, key) => ({ type, props, key })
`

const tmp = mkdtempSync(join(tmpdir(), 'ns5-test-'))
writeFileSync(join(tmp, 'sdk-stub.mjs'), sdkStub)
const sdkUrl = pathToFileURL(join(tmp, 'sdk-stub.mjs')).href
const rewritten = readFileSync(PLUGIN_PATH, 'utf8')
  .replace("from '@hermes/plugin-sdk'", `from '${sdkUrl}'`)
  .replace("from 'react/jsx-runtime'", `from '${sdkUrl}'`)
  .replace("from 'react'", `from '${sdkUrl}'`)
writeFileSync(join(tmp, 'plugin.mjs'), rewritten)

const mod = await import(pathToFileURL(join(tmp, 'plugin.mjs')).href)
console.log('✓ Plugin-Modul geladen')

const storage = new Map()
const ctx = {
  register: () => {},
  onDispose: () => {},
  setTimeout: () => () => {},
  storage: {
    get: (k, f) => (storage.has(k) ? storage.get(k) : f),
    set: (k, v) => storage.set(k, v)
  },
  os: { clipboard: { writeText: async t => storage.set('__clip', t) } },
  i18n: {
    register: b => { globalThis.__NS_BUNDLES__ = b },
    t: (key, ...args) => {
      const b = (globalThis.__NS_BUNDLES__ ?? {})['de'] ?? {}
      return String(b[key] ?? key).replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m))
    }
  }
}

let failed = false
const check = (ok, label, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ' → ' + detail : ''}`)
  if (!ok) failed = true
}

// register #1 — frisch
mod.default.register(ctx)

// Die ctxRef-Brücke ist nicht exportiert — aber die WIRKUNG ist über storage prüfbar,
// weil jede Set-Funktion per subscribe persistiert. Wir simulieren die UI-Callbacks
// über den einzigen offiziellen Weg: register() hat storage mit Defaults befüllt.
const d1 = storage.get('design')
check(d1 && d1.frost === true && d1.steps === 5, 'design-Defaults persistiert', JSON.stringify(d1))

// Da die Atoms modulglobal sind und register sie setzt, genügt ein Blick auf die
// Modul-Atoms nicht — wir prüfen stattdessen den zweitem register-Durchlauf
// (Hot-Reload-Simulation): geänderte Werte müssen übernommen werden.
storage.set('design', { frost: false, blur: 22, opacity: 55, sat: 95, font: 15, chipMax: 520, steps: 3 })
storage.set('modelCfg', { model: 'tev1:0.8b', cap: 'decision', temperature: 0.15, numCtx: 4096, keepAlive: '30m', port: 11434 })
storage.set('lang', 'en')
storage.set('customHint', 'Steuerberatung — Fristen prüfen')

// Hot-Reload-Simulation: Modul-Atoms sollen NICHT die alten Werte behalten.
// Wir prüfen das über fetchSuggestions: uiLang 'en' muss promptLang EN liefern —
// und das Decision-Profil muss ULTRA-SHORT bringen.
const cfg = mod.buildSystemPrompt
const pEn = cfg({
  uiLang: 'en', category: 'custom', style: 'sofort', customHint: 'Steuerberatung — Fristen prüfen',
  maxSteps: 3, profile: mod.CAP_PROFILES.decision, stepsInEnglish: true
})
check(pEn.includes('Steuerberatung — Fristen prüfen') && pEn.includes('ULTRA-SHORT') && pEn.includes('exactly 3'),
  'Custom-Linse + decision-Profil + 3 Schritte im Prompt')

// Register #2 (simulierter Reload) — alles aus Storage übernehmen:
mod.default.register(ctx)
const d2 = storage.get('design')
check(d2.frost === false && d2.steps === 3, '2. register(): design aus Storage übernommen (frost=false, steps=3)', JSON.stringify(d2))
const m2 = storage.get('modelCfg')
check(m2.model === 'tev1:0.8b' && m2.cap === 'decision' && m2.keepAlive === '30m',
  '2. register(): modelCfg aus Storage übernommen', JSON.stringify(m2))

// Echter Ollama-Call (llm-Profil, de):
const cfgReal = {
  model: 'ornith-1.5:9b', port: 11434, keepAlive: '10m', temperature: 0.3, numCtx: 8192,
  uiLang: 'de', stepsInEnglish: false, customHint: '', maxSteps: 4, profile: mod.CAP_PROFILES.llm
}
const steps = await mod.fetchSuggestions(cfgReal, {
  model: 'glm-5.3-flash', cwd: '/x',
  history: 'user: Settings-Reihenfolge testen.\nassistant: customHint ist jetzt reaktiv, Options-Chip immer sichtbar.'
})
check(Array.isArray(steps) && steps.length >= 1 && steps.length <= 4, `Echter Ollama-Call (4 Schritte de)`, JSON.stringify(steps))

if (failed) process.exit(1)
console.log('\n=== ALLE TESTS BESTANDEN ===')
process.exit(0)
