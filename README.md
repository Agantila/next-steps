# next-steps — Session-Prediction-Plugin für Hermes Desktop

LLM-gestützte „Nächste Schritte“-Vorschläge unter dem Composer des Hermes Desktop,
angereichert mit Ausrichtungs-Linsen, Ziel-Routing (Session/Bot/Kanban) und
pro-Session-State. Läuft komplett lokal gegen einen Ollama-Endpoint.

**Status:** v9, produktiv im Einsatz (`~/.hermes/desktop-plugins/next-steps/plugin.js`).

---

## Schnellstart

```bash
# 1. Plugin installieren (oder Symlink für Entwicklung):
ln -s "$PWD/plugin.js" ~/.hermes/desktop-plugins/next-steps/plugin.js

# 2. Voraussetzungen prüfen:
curl -s http://localhost:11434/api/tags | head -c 200   # Ollama erreichbar?

# 3. Hermes Desktop neu starten (oder ⌘K → „Reload desktop plugins“)
```

Das Plugin erscheint als:
- **Vorschlagsleiste** unter dem Composer (⚙-Options-Chip + Schritt-Chips)
- **Statusleisten-Chip** `predict` (Klick = neu laden)
- **Sidebar-Eintrag „Next Steps“** → Einstellungsseite (`/next-steps`)
- Abschnitt in **Settings → Appearance**

## Tests

Alle Tests sind Node-E2E-Harnesses (Stub-SDK + echte Ollama-Calls):

```bash
node tests/run_test_v9.mjs    # Tab-Labels + Hook-Plan (statisch)
node tests/run_test_v9b.mjs   # Live-Render-Beweis der Einstellungsseite
node tests/run_test_v7.mjs    # Atoms-Vertrag: register() erzeugt keine Zwillings-Atoms
node tests/run_test_v6.mjs    # Modell-Quellen, Kapazitätsprofile, echter Ollama-Call
```

Der Lauf der jeweils neuesten Version (`v9`, `v9b`) muss grün sein, bevor ein
Release-stand in `~/.hermes/desktop-plugins/next-steps/` aktualisiert wird.

---

## Architektur

```
Gateway-Event message.complete (mit session_id)
   → session.history RPC (letzte 8 user/assistant-Zeilen)
   → POST http://localhost:11434/api/chat (format:"json", think:false)
   → {"steps":[N]}  (N = 3–5)
   → Chips in COMPOSER_AREAS.underside
   → Klick: host.composer.submit(step) ans gewählte Ziel
```

### State-Modell (wichtig!)

**Alle globalen Einstellungen leben in modulglobalen Atoms** (`designAtom`,
`modelCfgAtom`, `langAtom`, `customHintAtom`, `hermesModelAtom`,
`ollamaModelsAtom`, `botsAtom`) — `register()` setzt sie nur noch per `.set()`
aus dem Storage, **erzeugt keine eigenen Atoms**. Hintergrund: eine frühere
Version hielt Zwillings-Atoms (lokal + global), wodurch Schreiben und Lesen
auseinanderliefen und Einstellungen „nicht live“ griffen (siehe v8-Fix).

**Pro Session** (`sessionMapAtom`, persistiert als `sessionStates`, gekappt auf
40 Einträge): `category`, `style`, `target`, `steps`. Session-Key ist die
**dauerhafte stored session ID** (`host.state.focusedStoredSessionId`) —
Runtime-IDs überleben keinen App-Neustart.

### Modell-Quellen (`modelCfg.source`)

| Quelle | Verhalten |
|---|---|
| `ollama` (Default) | Dropdown aus `/api/tags`, Embedding-Modelle gefiltert |
| `hermes` | SDK `ModelCatalogMenu` (= Composer-Menü), entkoppelter Controller, Auswahl überschreibt nie die Live-Session |
| `manual` | Freitext + „Hermes-Modell übernehmen“ |

**Kapazitätsprofile** (`cap`): `decision` (Winzlinge ≤2B: Ultrakurz-Schritte,
kleines num_predict/ctx, 120 s Timeout) vs. `llm` (normale Modelle).
`auto` erkennt die Größe am Modell-Tag.

**Selbstheilung:** Vor jedem Call prüft `modelExists()`, ob der Tag in Ollama
existiert; ungültige Tags (Alt-Lasten) fallen auf `ornith-1.5:9b` zurück und
setzen eine Klartext-Fehlermeldung.

### Ziel-Routing (⌖-Icon pro Chip)

- `session` — aktueller Composer (`host.composer.submit`)
- `new` — `session.create` + `openSession` + submit
- `kanban` — `slash.exec` mit `kanban add …` (Fallback: Clipboard + `/kanban`)
- `bot:<name>` — `session.create { profile }` + `openSession { profile }` + submit

### i18n

EN + DE, Modus `inherit` (folgt der Hermes-App-Sprache via `usePluginI18n`,
Kette: App-Locale → en → Raw-Key) oder Override `en`/`de` (nur dieses Plugin).
Die Schritt-Sprache im Prompt folgt derselben Wahl.

---

## Entwicklungsregeln (aus Fehlern gelernt)

1. **React-Hooks nie nach bedingten Returns** — in `OptionsBody` stehen alle
   `useValue` am Kopf, der Hook-Plan ist für jeden Tab identisch. Andernfalls
   crashet der Tab-Wechsel („Rendered fewer hooks than expected“).
2. **i18n-Key-Format einheitlich** — die Tab-Labels heißen `tabFocus` (ohne
   Unterstrich); ein Builder mit `tab_${Cap(id)}` liefert sonst den Raw-Key
   als sichtbare Überschrift.
3. **Nichts zwischen `PopoverTrigger asChild` und dem echten Button** — auch
   kein `Tip`. Radix verliert den Ref und das Panel landet bei (0,0).
4. **Popover-Animationen über `translate`/`scale`/`opacity`**, niemals über
   `transform` (Radix positioniert per inline transform). Trigger auf
   `data-state`/`data-side`.
5. **Keine Zwillings-Atoms** — `register()` darf keine Atoms erzeugen, nur
   `.set()` auf die Modul-Atoms aufrufen (Test `run_test_v7.mjs`).
6. **Persistenz-Schreibvorgänge immer über Atom-Subscriptions**, nicht über
   nicht-reaktive Kontextfelder — sonst „frieren“ kontrollierte Inputs ein.

## Bekannte Grenzen

- Der 5-s-Rescan des Plugin-Loaders hängt an `document.visibilityState` — ein
  unsichtbares Fenster lädt keine neuen Plugin-Versionen. Für Updates: App
  neu starten oder Fenster fokussieren + ⌘K → Reload desktop plugins.
- `tev1:0.8b` spricht nur `/v1/systemone` (Jev-Style), nicht `/api/chat` —
  als Vorschlagsmodell ungeeignet, obwohl es ein perfektes Decision-Profil hätte.
- Der Hermes-Katalog (Quelle `hermes`) listet Modelle aus der Hermes-Konfig;
  lokale Ollama-Tags müssen dafür nicht in Hermes konfiguriert sein.

## Dateien

- `plugin.js` — das komplette Plugin (eine Datei, Plain-ESM, kein Build)
- `tests/run_test_v*.mjs` — Harnesses pro Feature-Release (v6–v9)
