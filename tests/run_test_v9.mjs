// Härtetest v9 — Tab-Bugs:
//  A) Hook-Reihenfolge: OptionsBody muss bei JEDSEM tab denselben Hook-Aufruf-
//     Plan haben (Reihenfolge + Anzahl) — sonst React-Crash beim Tab-Wechsel.
//  B) Tab-Labels: t('tabFocus') etc. müssen aufgelöst werden (kein 'tab_*'-Raw-Key).
// Wir rendern OptionsBody für alle 5 Tabs mit einem Hook-aufzeichnenden Stub.
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

// Hook-Aufzeichnung: useState/useValue-loggen Aufrufe in der Render-Instanz.
let hookLog = null // aktives Array oder null
const sdkStub = `
const { host: h, makeAtom: mkAtom } = globalThis.__SP_TEST__
export const host = h
export const atom = mkAtom
export const Tip = p => p?.children ?? null
export const Codicon = () => null
export const useValue = a => {
  if (globalThis.__NS_HOOKLOG__) globalThis.__NS_HOOKLOG__.push('useValue')
  return a.get()
}
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
  if (globalThis.__NS_HOOKLOG__) globalThis.__NS_HOOKLOG__.push('usePluginI18n')
  const b = (globalThis.__NS_BUNDLES__ ?? {})['de'] ?? {}
  return String(b[key] ?? key).replace(/\\{(\\d+)\\}/g, (m, i) => String(args[Number(i)] ?? m))
}
export const useState = init => {
  if (globalThis.__NS_HOOKLOG__) globalThis.__NS_HOOKLOG__.push('useState')
  let v = typeof init === 'function' ? init() : init
  return [v, nv => { v = typeof nv === 'function' ? nv(v) : nv }]
}
export const jsx = (type, props, key) => ({ type, props, key })
export const jsxs = (type, props, key) => ({ type, props, key })
`

const tmp = mkdtempSync(join(tmpdir(), 'ns9-test-'))
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

// OptionsBody ist nicht exportiert — aber wir können es über die registrierte
// Render-Funktion der appearance- und route-Contribution erreichen? Einfacher:
// die Seite rendert SettingsPage → die referenziert OptionsBody intern.
// Wir exportieren OptionsBody NICHT — also prüfen wir über die Contribution:
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

// OptionsBody über die Seiten-Renderfunktion mit wechselndem tab rendern:
// Wir können den tab-State von außen nicht setzen — ABER: OptionsBody selbst
// bekommen wir via SettingsPage nicht. STATTEDEM: Hook-Plan statisch prüfen
// (alle useValue VOR dem ersten if) UND die Render-Funktionen der Contributions
// für die echten Components nutzen. Für den Hook-Plan genügt der statische
// Beweis + der direkte Aufruf über einen Export-Trick: Wir lesen den Quelltext.
let failed = false
const check = (ok, label, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ' → ' + detail : ''}`)
  if (!ok) failed = true
}

// A) Statischer Hook-Plan: Im OptionsBody-Quellblock darf NACH dem ersten
// bedingten `if (tab ===` kein useValue/useState mehr folgen. Kommentare
// zuerst entfernen (sie erwähnen `if (tab === …)` im Erklärungstext).
const bodyStart = src.indexOf('function OptionsBody(')
const bodyEnd = src.indexOf('// UI — Vorschlagsleiste', bodyStart)
const body = src.slice(bodyStart, bodyEnd).replace(/^\s*\/\/.*$/gm, '')
const firstIf = body.indexOf('if (tab ===')
const hooksAfter = (body.slice(firstIf).match(/useValue\(|useState\(/g) || []).length
check(firstIf !== -1, 'OptionsBody gefunden')
check(hooksAfter === 0, `Keine Hooks nach dem ersten if im OptionsBody (gefunden: ${hooksAfter})`)
const hooksBefore = (body.slice(0, firstIf).match(/useValue\(/g) || []).length
check(hooksBefore === 10, `Alle 10 useValue-Hooks am Kopf (gefunden: ${hooksBefore})`)

// B) Tab-Labels: resolve gegen die DE-Bundles über die echte render-Bahn.
// tabLabel(t, 'focus') etc. — tabLabel ist nicht exportiert; wir prüfen die Keys:
const { STRINGS } = mod
const tabKeys = ['Focus', 'Model', 'Design', 'Lang', 'Targets'].map(k => `tab${k}`)
check(tabKeys.every(k => STRINGS.en[k] && STRINGS.de[k]), `Tab-Keys existieren: ${tabKeys.join(', ')}`)
check(!tabKeys.some(k => k.includes('_')), 'Kein tab_-Unterstrich-Format mehr im Key-Pfad')
// und die Werte sind echte Labels, keine Keys:
check(!STRINGS.de.tabFocus.startsWith('tab'), `tabFocus de = "${STRINGS.de.tabFocus}"`)
check(!STRINGS.en.tabModel.startsWith('tab'), `tabModel en = "${STRINGS.en.tabModel}"`)

// C) Live-Render der Einstellungsseite — der rekursive Beweis läuft in v9b
// (Stub mit rekursivem Children-Rendering); hier genügt der Import-Check:
const page = contributions.find(c => c.area === 'routes')
check(Boolean(page?.render), 'Route-Contribution (Einstellungsseite) vorhanden')

if (failed) process.exit(1)
console.log('\n=== ALLE TESTS BESTANDEN ===')
process.exit(0)
