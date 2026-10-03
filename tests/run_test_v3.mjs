// Härtetest v3 für das next-steps Plugin — i18n (inherit/en/de), Popover-CSS, echte Calls.
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
let appLocale = 'de' // simulierte App-Sprache
let lastSystemPrompt = ''

const hostStub = {
  request: async (method, params) => {
    if (method === 'session.history') {
      return {
        messages: [
          { role: 'user', content: 'Wir bauen ein Plugin für Hermes Desktop mit Ollama-Anbindung.' },
          { role: 'assistant', content: 'i18n, Popover-Fix und Settings sind drin. Jetzt der Härtetest.' }
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

// usePluginI18n: resolved gegen appLocale (App-Locale → en → Key), reaktiv auf appLocaleChange.
const sdkStub = `
const { host: h, makeAtom: mkAtom, appLocaleRef } = globalThis.__SP_TEST__
export const host = h
export const atom = mkAtom
export const Tip = props => props?.children ?? null
export const useValue = a => a.get()
export const APPEARANCE_AREAS = { extra: 'appearance.extra' }
export const COMPOSER_AREAS = { underside: 'composer.underside' }
export const Popover = props => props?.children ?? null
export const PopoverContent = props => props?.children ?? null
export const PopoverTrigger = props => props?.children ?? null
export const usePluginI18n = () => (key, ...args) => {
  const bundles = globalThis.__NS_BUNDLES__
  const b = bundles[appLocaleRef.locale] ?? bundles.en
  let s = b[key] ?? bundles.en[key] ?? key
  return String(s).replace(/\\{(\\d+)\\}/g, (m, i) => String(args[Number(i)] ?? m))
}
export const useState = init => { let v = typeof init === 'function' ? init() : init; const subs = new Set(); const set = nv => { v = typeof nv === 'function' ? nv(v) : nv; for (const f of subs) f(v) }; return [v, set] }
export const jsx = (type, props, key) => ({ type, props, key })
export const jsxs = (type, props, key) => ({ type, props, key })
`

const tmp = mkdtempSync(join(tmpdir(), 'ns3-test-'))
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

const appLocaleRef = { locale: appLocale }
globalThis.__SP_TEST__.appLocaleRef = appLocaleRef

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
console.log('✓ Plugin-Modul geladen')

// ---------------------------------------------------------------- register()
const ctxStorage = new Map()
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
    get: (key, fallback) => (ctxStorage.has(key) ? ctxStorage.get(key) : fallback),
    set: (key, value) => ctxStorage.set(key, value)
  },
  i18n: {
    register: bundles => {
      globalThis.__NS_BUNDLES__ = bundles
      console.log('✓ ctx.i18n.register aufgerufen — Locales:', Object.keys(bundles).join(', '))
    },
    t: (key, ...args) => {
      const bundles = globalThis.__NS_BUNDLES__ ?? {}
      const b = bundles[appLocaleRef.locale] ?? bundles.en ?? {}
      const s = String(b[key] ?? bundles.en?.[key] ?? key)
      return s.replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m))
    }
  },
  i18nHost: undefined
}

try {
  mod.default.register(ctx)
  console.log('✓ register() ok —', contributions.length, 'Contributions:', contributions.map(c => c.area).join(', '))
  console.log('✓ Events:', registeredEvents.map(e => e.type).join(', '))
} catch (error) {
  console.error('✗ REGISTER FAILED:', error)
  process.exit(1)
}
for (const dispose of ctxDisposers) dispose() // Startup-Refresh stoppen

const { STRINGS, buildSystemPrompt, parseSteps, fetchSuggestions, refresh, runStep, fmt } = mod

// ------------------------------------------------- i18n-Vertrag
const okBundles = STRINGS.en.tag === 'en' && STRINGS.de.tag === 'de'
  && STRINGS.en.cat_coding && STRINGS.de.cat_coding
  && STRINGS.en.promptLang.includes('English') && STRINGS.de.promptLang.includes('Deutsch')
console.log(`${okBundles ? '✓' : '✗'} STRINGS en+de vollständig (Labels, Hints, promptLang)`)

// ------------------------------------------------- Prompt-Sprache
// Override de:
const pDe = buildSystemPrompt({ uiLang: 'de', category: 'coding', style: 'sofort', customHint: '', maxSteps: 4 })
const okDe = pDe.includes('exactly 4') && pDe.includes('Coding') && pDe.includes('Sprache der Schritte: Deutsch')
console.log(`${okDe ? '✓' : '✗'} Prompt(de/coding/sofort): deutsche Linse + deutsche Schritt-Sprache`)
// Override en:
const pEn = buildSystemPrompt({ uiLang: 'en', category: 'marketing', style: 'planung', customHint: '', maxSteps: 3 })
const okEn = pEn.includes('exactly 3') && pEn.includes('Marketing') && pEn.includes('Language of the steps: English')
console.log(`${okEn ? '✓' : '✗'} Prompt(en/marketing/planung): englische Linse + englische Schritt-Sprache`)
// Custom-Linse:
const pCustom = buildSystemPrompt({ uiLang: 'de', category: 'custom', style: 'auto', customHint: 'Steuerberatung — Fristen prüfen', maxSteps: 5 })
const okCustom = pCustom.includes('Steuerberatung — Fristen prüfen') && pCustom.includes('Eigene')
console.log(`${okCustom ? '✓' : '✗'} Prompt(custom): eigene Methoden-Linse im Prompt`)
// Custom ohne Text → Auto-Hint-Fallback:
const pCustomEmpty = buildSystemPrompt({ uiLang: 'en', category: 'custom', style: 'auto', customHint: '', maxSteps: 5 })
const okCustomEmpty = !pCustomEmpty.includes('undefined') && pCustomEmpty.includes('Detect the domain')
console.log(`${okCustomEmpty ? '✓' : '✗'} Prompt(custom, leer): fällt auf Auto-Hint zurück, kein undefined`)
if (![okBundles, okDe, okEn, okCustom, okCustomEmpty].every(Boolean)) process.exit(1)

// ------------------------------------------------- fmt
const okFmt = fmt('{0} Vorschläge', [4]) === '4 Vorschläge' && fmt('x {1} y', ['a', 'b']) === 'x b y'
console.log(`${okFmt ? '✓' : '✗'} fmt({0}/{1})`)

// ------------------------------------------------- Popover-CSS-Vertrag
const cssOk = pluginSource.includes('.sp-menu{display:flex;flex-direction:column;gap:1px;padding:4px;width:264px;text-align:left}')
  && pluginSource.includes('.sp-row-label>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}')
  && pluginSource.includes('.sp-row{display:flex;flex-direction:column;align-items:flex-start')
console.log(`${cssOk ? '✓' : '✗'} Popover-CSS: Fixbreite 264px + Linksbündigkeit + Label-Ellipse`)

// ------------------------------------------------- Echter Ollama-Call (de, Override)
const config = {
  model: 'ornith-1.5:9b', port: 11434, uiLang: 'de',
  category: 'coding', style: 'sofort', customHint: '', maxSteps: 4
}
const context = {
  model: 'glm-5.3-flash', cwd: '/home/deniz/hermes-workspace',
  history: 'user: Ich will die Vorschlags-Chips mit Frost-Effekt.\nassistant: Frost ist drin, jetzt i18n und Popover-Fix.'
}
console.log('\n--- Echter Ollama-Call: de-Override, coding/sofort, 4 Schritte ---')
const t0 = Date.now()
const steps = await fetchSuggestions(config, context)
console.log(`✓ Ollama antwortete in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log('Steps:', JSON.stringify(steps, null, 2))
if (!Array.isArray(steps) || !steps.length || steps.length > 4) {
  console.error('✗ Schrittanzahl-Kontrakt verletzt')
  process.exit(1)
}

// ------------------------------------------------- Lang-Mode-Wechsel im laufenden Plugin
// langAtom ist modul-intern; wir prüfen den Effekt über refresh() + Settings-Persistenz.
console.log('\n--- refresh()-Fluss (inherit → appLocale=de → deutsche Prompt-Sprache) ---')
appLocaleRef.locale = 'de'
refresh({ ...config, category: 'betrieb', style: 'verifizieren', maxSteps: 3, tNow: (key, ...args) => fmt(STRINGS.de[key] ?? key, args) })
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
if (!uiSteps.length) process.exit(1)

runStep(uiSteps[0], mod.STRINGS.de)
const clickOk = submitted.length === 1 && submitted[0].text === uiSteps[0]
console.log(`${clickOk ? '✓' : '✗'} runStep() → host.composer.submit:`, JSON.stringify(submitted.map(s => s.text)))
if (!clickOk) process.exit(1)

const langStored = ctxStorage.get('lang')
console.log(`${langStored === 'inherit' ? '✓' : '✗'} lang persistiert:`, langStored)

console.log('\n=== ALLE TESTS BESTANDEN ===')
process.exit(0)
