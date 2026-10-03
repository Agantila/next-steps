# Mitwirken an next-steps

Danke für Dein Interesse. Kurz und konkret:

## Voraussetzungen

- Node.js ≥ 18 (CI nutzt 22)
- Für Live-Tests: Hermes Desktop + lokales Ollama (`ollama serve`)
- Fürs Ausprobieren am echten System: Schreibzugriff auf `~/.hermes/desktop-plugins/`

## Schnellstart

```bash
git clone <repo-url> next-steps-plugin
cd next-steps-plugin
npm run check    # Syntax-Check (node --check)
npm test         # komplette Test-Suite (Stub-Harnesses, kein Ollama nötig)
```

## Entwicklungs-Schleife

1. `plugin.js` bearbeiten (eine Datei, Plain ESM — kein Build-Schritt).
2. `npm run check && npm test` — muss grün sein.
3. `npm run deploy` kopiert nach `~/.hermes/desktop-plugins/next-steps/plugin.js`;
   Hermes Desktop lädt Änderungen automatisch nach ~5 s (Fenster sichtbar) oder per
   Cmd/Ctrl+K → "Reload desktop plugins".
4. Am echten System testen (Chips, Optionen-Popover, Ziele).

## Architektur-Regeln (hart)

- **Hooks am Kopf**: In jeder Komponente alle `useValue`/`useState` vor dem ersten bedingten
  `return` — sonst crasht der Tab-Wechsel (React #310).
- **Pro-Session-State**: Lesen UND Schreiben immer über `ctxRef.sessionKey(sid)`
  (stored Session-ID; Runtime-ID ≠ Persistenz-Key).
- **i18n**: Jeder UI-String in `STRINGS.en` + `STRINGS.de`; keine hartkodierten Texte.
- **Manuelle vs. Auto-Trigger**: manuelle Aktionen mit `{ force: true }`; Auto-Trigger
  respektieren Pause und Agent-Busy.
- **Keine Farb-Literale**: Design ausschließlich über CSS-Variablen (`--ns-*` und App-Tokens).
- Details und Debug-Rezepte: [DEVELOPMENT.md](./DEVELOPMENT.md) — vor größeren PRs lesen.

## Tests

Jedes Feature bekommt einen Harness `tests/run_test_vN.mjs` (Stub-SDK, kein Netz):

- Funktionskomponenten rekursiv rendern, Events und Timer deterministisch feuern.
- Neue Tests im `test`-Script der `package.json` ergänzen.
- Ein PR ohne grüne `npm test` wird nicht gemergt.

## Pull Requests

1. Branch von `main` (`feat/...`, `fix/...`).
2. `CHANGELOG.md`-Eintrag unter einer neuen Version ergänzen.
3. PR öffnen — die CI läuft `npm run check` + `npm test`.
4. Beschreiben: Was, Warum, Wie getestet (inkl. Verifikation am laufenden Desktop).

## Kontakt

Fragen: hallo@agantila.com
