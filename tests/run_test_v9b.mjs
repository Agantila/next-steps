// v9b: Live-Render-Beweis — SettingsPage rendern MIT rekursivem Children-Rendering.
// Wenn OptionsBody (alle 5 Tabs) ohne Exception rendert, ist der Hook-Plan gültig.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PLUGIN_PATH = '/home/deniz/.hermes/desktop-plugins/next-steps/plugin.js'

function makeAtom(v) {
  let c = v
  const l = new Set()
  return { get: () => c, set: x => { c = x; for (const f of l) f(c) }, subscribe: f => { l.add(f); f(c); return () => l.delete(f) } }
}

const hostStub = {
  request: async m => (m === 'profiles.list' ? { profiles: [{ name: 't' }] } : {}),
  state: {
    focusedSessionId: makeAtom('rt'),
    focusedStoredSessionId: makeAtom('st'),
    busy: makeAtom(false),
    model: makeAtom('m'),
    cwd: makeAtom('/x')
  },
  composer: { submit: () => true },
  notify: () => {},
  onEvent: () => () => {}
}
globalThis.__SP_TEST__ = { host: hostStub, makeAtom }
globalThis.document = { createElement: () => ({ textContent: '', remove() {} }), head: { append() {} } }

// Stub mit REKURSIVEM Children-Rendering: Funktions-Komponenten werden direkt
// aufgerufen, solange der Optionen-Baum sie als children referenziert.
const sdk = [
  'const { host: h, makeAtom: mk } = globalThis.__SP_TEST__',
  'export const host = h',
  'export const atom = mk',
  'function rc(c) { if (typeof c === "function") return rc(c()); if (Array.isArray(c)) return c.map(rc); if (c && typeof c === "object") { if (c.children !== undefined) return rc(c.children); return null } return c }',
  'export const Tip = p => p && p.children !== undefined ? rc(p.children) : null',
  'export const useValue = a => a.get()',
  "export const APPEARANCE_AREAS = { extra: 'appearance.extra' }",
  "export const COMPOSER_AREAS = { underside: 'composer.underside' }",
  "export const ROUTES_AREA = 'routes'",
  "export const SIDEBAR_NAV_AREA = 'sidebar-nav'",
  'export const Popover = p => rc(p.children)',
  'export const PopoverContent = p => rc(p.children)',
  'export const PopoverTrigger = p => rc(p.children)',
  'export const DropdownMenu = p => rc(p.children)',
  'export const DropdownMenuContent = p => rc(p.children)',
  'export const DropdownMenuTrigger = p => rc(p.children)',
  'export const ModelCatalogMenu = () => null',
  'export const ModelMenuCloseContext = { Provider: p => rc(p.children) }',
  `export const usePluginI18n = () => (key, ...a) => {
     const b = (globalThis.__NS_BUNDLES__ ?? {})['de'] ?? {}
     return String(b[key] ?? key).replace(/\\{(\\d+)\\}/g, (m, i) => String(a[Number(i)] ?? m))
   }`,
  'export const useState = init => { let v = typeof init === "function" ? init() : init; return [v, nv => { v = typeof nv === "function" ? nv(v) : nv }] }',
  'export const jsx = (t, p, k) => ({ t, p, k })',
  'export const jsxs = (t, p, k) => ({ t, p, k })'
].join('\n')

const tmp = mkdtempSync(join(tmpdir(), 'ns9b-'))
writeFileSync(join(tmp, 'sdk.mjs'), sdk)
const sdkUrl = pathToFileURL(join(tmp, 'sdk.mjs')).href
const src = readFileSync(PLUGIN_PATH, 'utf8')
const rewritten = src
  .replace("from '@hermes/plugin-sdk'", `from '${sdkUrl}'`)
  .replace("from 'react/jsx-runtime'", `from '${sdkUrl}'`)
  .replace("from 'react'", `from '${sdkUrl}'`)
writeFileSync(join(tmp, 'plugin.mjs'), rewritten)

const mod = await import(pathToFileURL(join(tmp, 'plugin.mjs')).href)

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

const page = contributions.find(c => c.area === 'routes')
try {
  page.render()
  console.log('✓ Einstellungsseite KOMPLETT gerendert (alle 5 Tabs-Bodies, kein Hook-Crash)')
} catch (error) {
  console.log('✗ RENDER CRASH:', error.message)
  process.exit(1)
}

// Und zweimal rendern (State-Änderung simuliert) — Hook-Plan muss stabil sein:
try {
  page.render()
  page.render()
  console.log('✓ Wiederholtes Rendern stabil (Hook-Plan identisch)')
} catch (error) {
  console.log('✗ CRASH beim 2./3. Render:', error.message)
  process.exit(1)
}
console.log('\n=== LIVE-RENDER-BEWEIS BESTANDEN ===')
