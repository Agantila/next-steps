# Entwicklung — Regeln und Rezepte

Gesammelte Fallstricke aus der Entwicklung dieses Plugins. Jeder Punkt war ein
echter Bug oder eine Debug-Falle. Die Punkte sind auch im Skill
`hermes-desktop-plugins` konserviert.

## Radix-Popover

### Anker-Regel
`PopoverTrigger asChild` braucht den Ref am **echten Button**. Alles dazwischen
(auch `Tip`) bricht die Ref-Weiterleitung → Panel rendert bei (0,0) oben links.
Tooltip-Texte laufen über `title` am Button.

### Animations-Regel
Radix positioniert das Panel per **inline `transform`**. Keyframes auf
`transform` überschreiben das → Panel teleportiert während der Animation.
Stattdessen **individual properties** animieren: `translate`, `scale`,
`opacity` — die komponieren mit dem inline transform. Trigger:
`[data-state="open"/"closed"]` + `[data-side]`.

### Release-Build ohne Animations-Utilities
Der Release-Build enthält **keine** `tw-animate`-Utilities (`animate-in`,
`zoom-in-95` fehlen im gebauten CSS) — App-Popovers erscheinen instant.
Plugins müssen eigene Keyframes mitbringen.

`PopoverContent variant="menu"` = nativer Picker-Look (`menuSurfaceClass`,
kein Pfeil) — genau das DropdownMenu/Select-Surface.

## React (uncompiliertes ESM, `jsx()`-Calls)

### Hooks-Plan
Hooks (`useValue`, `useState`, `usePluginI18n`) **nie** nach bedingten Returns
oder innerhalb von `if (tab === …)`. Unterschiedliche Hook-Anzahlen pro Render
→ „Rendered fewer hooks than expected“. Alles an den Komponenten-Kopf.

### State: Modul-Atoms, keine Zwillings-Atoms
`register()` darf **keine** `atom()`-Erzeugungen für globalen State machen.
Zwillings-Atoms (lokal + global) laufen auseinander: Schreiben geht ans lokale
(Persistenz OK), Rendern liest vom globalen (bleibt alt) → kontrollierte Inputs
springen zurück, „Einstellungen greifen nicht live“.

**Test-Rezept:** Atoms-Anzahl nach Modul-Import als Baseline zählen, dann
`register()` aufrufen und asserten, dass 0 neue Atoms entstehen
(`tests/run_test_v7.mjs`).

### Kontrollierte Inputs
Eine `<textarea value={X}>` mit nicht-reaktivem X friert beim Tippen ein
(snap-back). Bindungs-Wert immer aus einem Atom via `useValue`.

## i18n

- Key-Format **einheitlich** (`tabFocus`, nicht `tab_Focus` mischen) — ein
  Builder mit falschem Format liefert den Raw-Key als sichtbares Label.
- `usePluginI18n(id)` = „inherit from Hermes“ (App-Locale → en → Raw-Key,
  reaktiv auf Locale-Wechsel). Override: modulglobaler Atom + `fixedT(mode)`.
- Ein `tag`-Key pro Bundle erlaubt non-reactiver Code (Notifications,
  Prompt-Bau) die aktive Sprache zu erkennen.

## Debugging in der LAUFENDEN App

### 1. Welche Version ist geladen?
Plugin persistiert in Electron-LocalStorage (LevelDB):
```bash
strings ~/.config/Hermes/Local Storage/leveldb/*.log \
        ~/.config/Hermes/Local Storage/leveldb/*.ldb | grep hermes.plugin.next-steps
```
Versions-Marker im JSON (z. B. `"source":"ollama"` = v6+) beweisen, welche
Version schreibt — und ob USER-Änderungen ankommen.

### 2. Scanner ist visibility-gegate
Der 5-s-Rescan läuft nur bei `document.visibilityState === 'visible'`.
Unsichtbares/minimiertes Fenster = keine neuen Plugin-Versionen, keine Toasts,
keine Logs. Updates daher per App-Neustart absichern.

### 3. Duplicate-ID-Falle
Einmal geladene Plugin-IDs bleiben im Inventory — auch als Fehlerzeile. Ein
neuer Ordner mit derselben ID failed („duplicate id … already loaded“). ID
wechseln (neuer Ordnername + `const ID`) oder App neustarten.

### 4. Backend-API mit Token
Das Dashboard-Backend authentifiziert Loopback-Calls mit
`HERMES_DASHBOARD_SESSION_TOKEN` aus der **Backend-Prozess**-Umgebung (nicht
die App-PID!):
```bash
TOK=$(tr '\0' '\n' < /proc/<backend-pid>/environ | grep ^HERMES_DASHBOARD_SESSION_TOKEN= | cut -d= -f2)
curl -H "Authorization: Bearer $TOK" http://127.0.0.1:<port>/api/model/options
```

## Ollama

- CORS erlaubt jeden Origin — direkter `fetch` aus dem Renderer, kein Backend-Hop.
- Embedding-Modelle aus `/api/tags` filtern (`embed|bge-|minilm`), sie können
  nicht chatten.
- **Modell-Tags validieren** (`modelExists`): Alt-Lasten aus manuellen Einträgen
  erzeugen sonst stumme 404s. Falsch-positive String-Matches beachten
  („deepseek-flash“ vs. installiertem „deepseek-ocr:3b“).
- `keep_alive` setzen (z. B. 10 m) — sonst Kaltstart-Strafe von 20–45 s pro Call.
- `tev1:0.8b` ist ein Decision-Modell und spricht nur `/v1/systemone`, nicht
  `/api/chat` — für dieses Plugin ungeeignet.
- Kapazitätsprofile: Winzlinge (≤2B) bekommen im Prompt ULTRA-SHORT-Regeln,
  kleineres num_predict/num_ctx und längeres Timeout; `auto` erkennt die Größe
  am Tag.

## Headless-Tests

Node kann keine `blob:`-URLs importieren — Plugin + SDK-Stub als temp .mjs
schreiben und per Pfad importieren. `document` stubben (CSS-Injection in
`register()`). Für Render-Proofs: Stub mit **rekursivem Children-Renderer**,
damit `page.render()` wirklich durch den Komponenten-Baum läuft und Hook-Crashes
sichtbar werden (plain jsx-Stubs führen Kinder nicht aus).
