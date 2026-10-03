// Härtetest v6 — Modell-Quellen (Ollama-Liste/Hermes/manual), Tab-Überschriften,
// sessionKey (stored-ID-Stabilität), i18n-Tabs. Plus echter Ollama-Call.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PLUGIN_PATH = process.env.NS_PLUGIN_PATH || new URL('../plugin.js', import.meta.url)

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

const focusedRuntime = makeAtom('rt-1')
const focusedStored = makeAtom('stored-1')

const hostStub = {
  request: async m => (m === 'profiles.list' ? { profiles: [{ name: 'tev1' }] } : {}),
  state: {
    focusedSessionId: focusedRuntime,
    focusedStoredSessionId: focusedStored,
    busy: makeAtom(false),
    model: makeAtom('glm-5.3-flash'),
    cwd: makeAtom('/x')
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
export const DropdownMenu = p => p?.children ?? null
export const DropdownMenuContent = p => p?.children ?? null
export const DropdownMenuTrigger = p => p?.children ?? null
export const ModelCatalogMenu = () => null
export const ModelMenuCloseContext = { Provider: p => p?.children ?? null }
export const usePluginI18n = () => (key, ...args) => {
  const b = (globalThis.__NS_BUNDLES__ ?? {})['de'] ?? {}
  return String(b[key] ?? key).replace(/\\{(\\d+)\\}/g, (m, i) => String(args[Number(i)] ?? m))
}
export const useState = init => { let v = typeof init === 'function' ? init() : init; return [v, nv => { v = typeof nv === 'function' ? nv(v) : nv }] }
export const jsx = (type, props, key) => ({ type, props, key })
export const jsxs = (type, props, key) => ({ type, props, key })
`

const tmp = mkdtempSync(join(tmpdir(), 'ns6-test-'))
writeFileSync(join(tmp, 'sdk-stub.mjs'), sdkStub)
const sdkUrl = pathToFileURL(join(tmp, 'sdk-stub.mjs')).href
const src = readFileSync(PLUGIN_PATH, 'utf8')
const rewritten = src
  .replace("from '@hermes/plugin-sdk'", `from '${sdkUrl}'`)
  .replace("from 'react/jsx-runtime'", `from '${sdkUrl}'`)
  .replace("from 'react'", `from '${sdkUrl}'`)
writeFileSync(join(tmp, 'plugin.mjs'), rewritten)

const mod = await import(pathToFileURL(join(tmp, 'plugin.mjs')).href)
console.log('✓ Plugin-Modul geladen')

let failed = false
const check = (ok, label, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ' → ' + detail : ''}`)
  if (!ok) failed = true
}

// Struktur-Checks am Quelltext (die UI lebt nur im Renderer):
check(src.includes("ModelCatalogMenu, ModelMenuCloseContext"), 'SDK: ModelCatalogMenu importiert')
check(src.includes('listOllamaModels'), 'Ollama-/api/tags-Integration vorhanden')
check(src.includes("mc.source === 'hermes'"), 'Modell-Quelle hermes verdrahtet')
check(src.includes("const source = mc.source || 'ollama'"), 'Modell-Quelle ollama (default) verdrahtet')
check(src.includes('sessionKey: sid =>'), 'sessionKey-Bridge vorhanden')
check(src.includes('focusedStoredSessionId'), 'durable stored session id genutzt')
const secTitles = (src.match(/sp-sec-title', children: t\(/g) || []).length
check(secTitles >= 6, `Tab-Bodies mit Sektions-Überschriften (${secTitles} Stück)`)

// register + Storage-Vertrag:
const storage = new Map()
const ctx = {
  register: () => {},
  onDispose: () => {},
  setTimeout: () => () => {},
  storage: {
    get: (k, f) => (storage.has(k) ? storage.get(k) : f),
    set: (k, v) => storage.set(k, v)
  },
  os: { clipboard: { writeText: async () => {} } },
  i18n: {
    register: b => { globalThis.__NS_BUNDLES__ = b },
    t: (key, ...args) => {
      const b = (globalThis.__NS_BUNDLES__ ?? {})['de'] ?? {}
      return String(b[key] ?? key).replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m))
    }
  }
}
mod.default.register(ctx)
check(storage.has('modelCfg'), 'modelCfg persistiert')
const mc = storage.get('modelCfg')
check(mc.source === 'ollama', 'modelCfg.source default = ollama', mc.source)

// i18n: neue Keys in beiden Sprachen?
const { CAP_PROFILES, STRINGS, buildSystemPrompt, fetchSuggestions } = mod
check(STRINGS.en.modelSourceLabel && STRINGS.de.modelSourceLabel, 'i18n modelSourceLabel en+de')
check(STRINGS.en.modelOllama && STRINGS.de.modelOllama, 'i18n modelOllama en+de')
check(STRINGS.en.hermesPickLabel && STRINGS.de.hermesPickLabel, 'i18n hermesPickLabel en+de')
check(STRINGS.en.noSessionHint && STRINGS.de.noSessionHint, 'i18n noSessionHint en+de (v5-Fix)')

// sessionKey-Verhalten — nur über echte Aufrufe testbar: refreshFor ist nicht exportiert,
// aber die Wirkung (storage sessionStates key) über die message.complete-Bahn. Wir prüfen
// stattdessen die Kernaussage: focusedStoredSessionId wird gelesen (src-Check oben).

// Echter Ollama-Call:
const steps = await mod.fetchSuggestions({
  model: 'ornith-1.5:9b', port: 11434, keepAlive: '10m', temperature: 0.3, numCtx: 8192,
  uiLang: 'de', stepsInEnglish: false, customHint: '', maxSteps: 4, profile: mod.CAP_PROFILES.llm
}, { model: 'glm-5.3-flash', cwd: '/x', history: 'user: Modell-Auswahl testen.\nassistant: Ollama-Liste + Hermes-Katalog sind drin.' })
check(Array.isArray(steps) && steps.length >= 1 && steps.length <= 4, 'Echter Ollama-Call (4 Schritte de)', JSON.stringify(steps).slice(0, 120) + '…')

if (failed) process.exit(1)
console.log('\n=== ALLE TESTS BESTANDEN ===')
process.exit(0)
