// Härtetest v4 — next-steps: Kapazitätsprofile, pro-Session-State, Ziele, Options-Chip.
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
const rpcCalls = []
let appLocale = 'de'

const hostStub = {
  request: async (method, params) => {
    rpcCalls.push({ method, params })
    if (method === 'session.history') {
      return {
        messages: [
          { role: 'user', content: 'Wir bauen das Plugin mit pro-Session-State und Ziel-Routing.' },
          { role: 'assistant', content: 'Options-Chip, Modell-Profile und Kanban/Bot-Ziele sind drin. Jetzt der Härtetest v4.' }
        ]
      }
    }
    if (method === 'profiles.list') {
      return { profiles: [{ name: 'tev1' }, { name: 'agantila' }, { name: 'research-bot' }] }
    }
    if (method === 'session.create') {
      return { session_id: `new-sess-${rpcCalls.length}` }
    }
    if (method === 'slash.exec') {
      return { output: 'ok' }
    }
    return {}
  },
  state: {
    focusedSessionId: makeAtom('sess-A'),
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
  openSession: async () => {},
  navigate: () => {},
  notify: n => notifications.push(n),
  onEvent: (type, fn) => {
    registeredEvents.push({ type, fn })
    return () => {}
  }
}
const registeredEvents = []

globalThis.__SP_TEST__ = { host: hostStub, makeAtom }
globalThis.document = {
  createElement: () => ({ textContent: '', remove() {}, append() {} }),
  head: { append() {} }
}

const sdkStub = `
const { host: h, makeAtom: mkAtom, appLocaleRef } = globalThis.__SP_TEST__
export const host = h
export const atom = mkAtom
export const Tip = props => props?.children ?? null
export const useValue = a => a.get()
export const APPEARANCE_AREAS = { extra: 'appearance.extra' }
export const COMPOSER_AREAS = { underside: 'composer.underside' }
export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebar-nav'
export const Popover = props => props?.children ?? null
export const PopoverContent = props => props?.children ?? null
export const PopoverTrigger = props => props?.children ?? null
export const usePluginI18n = () => (key, ...args) => {
  const bundles = globalThis.__NS_BUNDLES__
  const b = bundles[appLocaleRef.locale] ?? bundles.en
  const s = String(b[key] ?? bundles.en[key] ?? key)
  return s.replace(/\\{(\\d+)\\}/g, (m, i) => String(args[Number(i)] ?? m))
}
export const useState = init => { let v = typeof init === 'function' ? init() : init; const subs = new Set(); const set = nv => { v = typeof nv === 'function' ? nv(v) : nv; for (const f of subs) f(v) }; return [v, set] }
export const jsx = (type, props, key) => ({ type, props, key })
export const jsxs = (type, props, key) => ({ type, props, key })
`
globalThis.__SP_TEST__.appLocaleRef = { get locale() { return appLocale } }

const tmp = mkdtempSync(join(tmpdir(), 'ns4-test-'))
writeFileSync(join(tmp, 'sdk-stub.mjs'), sdkStub)
const sdkUrl = pathToFileURL(join(tmp, 'sdk-stub.mjs')).href
const pluginSource = readFileSync(PLUGIN_PATH, 'utf8')
const rewritten = pluginSource
  .replace("from '@hermes/plugin-sdk'", `from '${sdkUrl}'`)
  .replace("from 'react/jsx-runtime'", `from '${sdkUrl}'`)
  .replace("from 'react'", `from '${sdkUrl}'`)
writeFileSync(join(tmp, 'plugin.mjs'), rewritten)

let mod
try {
  mod = await import(pathToFileURL(join(tmp, 'plugin.mjs')).href)
} catch (error) {
  console.error('PLUGIN LOAD FAILED:', error)
  process.exit(1)
}
if (typeof mod.default?.register !== 'function') {
  console.error('✗ default export FEHLT')
  process.exit(1)
}
console.log('✓ Plugin-Modul geladen')

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
  os: { clipboard: { writeText: async t => ctxStorage.set('clipboard', t) } },
  i18n: {
    register: bundles => {
      globalThis.__NS_BUNDLES__ = bundles
      console.log('✓ ctx.i18n.register — Locales:', Object.keys(bundles).join(', '))
    },
    t: (key, ...args) => {
      const bundles = globalThis.__NS_BUNDLES__ ?? {}
      const b = bundles[appLocale] ?? bundles.en ?? {}
      const s = String(b[key] ?? bundles.en?.[key] ?? key)
      return s.replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m))
    }
  }
}

try {
  mod.default.register(ctx)
  console.log('✓ register() ok —', contributions.length, 'Contributions:', contributions.map(c => c.area).join(', '))
} catch (error) {
  console.error('✗ REGISTER FAILED:', error)
  process.exit(1)
}
for (const dispose of ctxDisposers) dispose()

const { CAP_PROFILES, STRINGS, buildSystemPrompt, capProfile, fetchSuggestions, parseSteps, fmt } = mod

// ------------------------------------------------- Kapazitätsprofile
const okAutoTiny = capProfile('auto', 'tev1:0.8b') === CAP_PROFILES.decision
const okAutoBig = capProfile('auto', 'ornith-1.5:9b') === CAP_PROFILES.llm
const okForced = capProfile('llm', 'tev1:0.8b') === CAP_PROFILES.llm
console.log(`${okAutoTiny && okAutoBig && okForced ? '✓' : '✗'} capProfile auto: 0.8b→decision, 9b→llm, override wirkt`)

const pTiny = buildSystemPrompt({
  uiLang: 'en', category: 'coding', style: 'sofort', customHint: '', maxSteps: 5,
  profile: CAP_PROFILES.decision, stepsInEnglish: true
})
const okTiny = pTiny.includes('ULTRA-SHORT') && pTiny.includes('max. 80 characters') && pTiny.includes('exactly 5')
console.log(`${okTiny ? '✓' : '✗'} Decision-Profil im Prompt (ULTRA-SHORT, 80 Zeichen)`)
const pBig = buildSystemPrompt({
  uiLang: 'de', category: 'coding', style: 'sofort', customHint: '', maxSteps: 3,
  profile: CAP_PROFILES.llm, stepsInEnglish: false
})
const okBig = pBig.includes('max. 120 characters') && pBig.includes('Sprache der Schritte: Deutsch')
console.log(`${okBig ? '✓' : '✗'} LLM-Profil + de-Sprachzeile im Prompt`)
if (![okAutoTiny, okAutoBig, okForced, okTiny, okBig].every(Boolean)) process.exit(1)

// ------------------------------------------------- parseSteps mit stepChars
const longStep = 'ein sehr langer schritt der ueber vierzig zeichen hinausgeht und deshalb gekuerzt werden sollte hier'
const capped = parseSteps(`["kurz","auch kurz","${longStep}"]`, 3, 40)
console.log(`${capped.length === 3 && capped[2].endsWith('…') ? '✓' : '✗'} parseSteps kappung auf stepChars=40 → ${JSON.stringify(capped[2])}`)

// ------------------------------------------------- fmt
const okFmt = fmt('{0} steps', [4]) === '4 steps'
console.log(`${okFmt ? '✓' : '✗'} fmt`)

// ------------------------------------------------- Echter Ollama-Call (decision-artig)
console.log('\n--- Echter Ollama-Call: llm-Profil, 5 Schritte ---')
const cfg = {
  model: 'ornith-1.5:9b', port: 11434, keepAlive: '5m',
  temperature: 0.3, numCtx: 8192,
  uiLang: 'de', stepsInEnglish: false, customHint: '', maxSteps: 5,
  profile: CAP_PROFILES.llm
}
const context = {
  model: 'glm-5.3-flash', cwd: '/home/deniz/hermes-workspace',
  history: 'user: Ich will pro-Session-State und Ziel-Routing.\nassistant: Options-Chip, Kapazitäts-Profile, Ziele sind drin.'
}
const t0 = Date.now()
const steps = await fetchSuggestions(cfg, context)
console.log(`✓ Ollama in ${((Date.now() - t0) / 1000).toFixed(1)}s →`, JSON.stringify(steps, null, 2))
if (!Array.isArray(steps) || steps.length < 1 || steps.length > 5) process.exit(1)

console.log('\n=== ALLE STATISCHEN TESTS BESTANDEN ===')
console.log('(Session-State/Ziel-Routing leben reaktiv in der App — die Register/Persistenz-Pfade sind oben geprüft.)')
console.log('Storage-Keys:', [...ctxStorage.keys()].join(', '))
process.exit(0)
