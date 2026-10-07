CHANGELOG — next-steps-plugin
=============================

v11.1.0 (2026-10-07)
  CHORE: Catalog-Layout — `plugin.js` liegt jetzt unter `desktop/plugin.js`
        (Entry-Pfad, den der Hermes Catalog-Installer und `hermes plugins
        validate` erwarten). Neu: `plugin.yaml`-Manifest (Name, Version,
        Beschreibung, Lizenz, Homepage). Tests/CI/Deploy-Skripte und README
        auf den neuen Pfad umgestellt. Funktional keine Änderung (v11.1-Code
        unverändert).

v11.1 (2026-10-06)
  FEAT: Pause räumt auf — das Pausieren der automatischen Generierung (⏸-Chip
        oder Schalter im Ausrichtung-Popover) entfernt jetzt die zuletzt
        angezeigten Predictions: Step-Chips verschwinden sofort, die ge-
        speicherten Steps aller Sessions werden geleert und persistiert
        (Kategorie/Stil/Ziel bleiben erhalten). Resume startet mit leerer
        Leiste statt mit gedimmten Alt-Chips.
  FIX: In-Flight-Verwerfung — trifft das Ergebnis eines Auto-Calls NACH dem
        Pausieren ein, wird es verworfen (keine neuen Chips mehr nach Pause).
        Manuelle Calls (⟳, Status-Chip, Einstellungsseite) liefern weiterhin
        aus. Die Dim-Darstellung bleibt als Rückfallebene für Restzustände.

v11 (2026-10-03)
  FIX: „Neuer Tab“ erzeugte keine Session — zwei API-Fehler: openSession
       erwartet die STORED Session-ID (nicht die Runtime-ID aus session_id),
       und der Turn muss per prompt.submit laufen (composer.submit erreicht
       nur gemountete Composer-Surfaces; frische Sessions haben keine).
       Jetzt kanonisch wie App/Bots: session.create → openSession(stored) →
       prompt.submit(runtime) → Retry-Open, falls der erste Open an der
       lazy Row scheitert. Bot-Ziel: dasselbe Muster. create trägt cwd.
  FEAT: „Senden an“-Icon — der Button am Chip-Ende trägt jetzt das Codicon
        `send` (Sende-Pfeil) statt des missverständlichen ⌖-Zielkreuzes.
  FEAT: Session-Kontext beim Senden — Schritte an andere Ziele (neuer Tab,
        Bot, Kanban) bekommen eine Kurzfassung mit: Arbeitsverzeichnis + die
        letzten 6 Nachrichten (+ „Aufgabe: …“). Abschaltbar im Tab „Ziele“
        (Default an). Die aktuelle Session braucht keinen Anhang.
  FIX: Kanban-Ziel nutzte das ungültige Verb „kanban add“ (nur usage error!)
        — jetzt `kanban create "<Titel>" --body "<Kontext>"` über den echten
        Kanban-CLI-Parser; Fehlausgaben werden erkannt und lösen den
        Clipboard-Fallback aus.

v10 (2026-10-03)
  FEAT: „Neu generieren“-Button (⟳, Icon-only) in der Vorschlagsleiste —
        führt die Vorhersage-Anfrage erneut aus und ersetzt die Vorschläge
        durch frische; Busy-Spin während des Calls. Manuelle Trigger (⟳,
        StatusChip, Einstellungsseite) laufen auch während der Agent arbeitet
        (force); nur der eigene laufende Call schützt vor Doppelklick.
  FEAT: Start/Stop-Button (⏸/▶) links vom Options-Chip — pausiert die
        automatische Generierung (nach Agent-Antworten), dimmt die Step-Chips;
        vorhandene Chips bleiben nutzbar, der manuelle ⟳-Klick generiert
        weiterhin. Global + persistent; Schalter auch im Options-Popover
        (Tab Ausrichtung) mit Erklärtext.
  FEAT: Neue Ausrichtung „Methodik & Best Practices“ (methodik) — Methoden-
        Linse für beste weitere Aktionen nach anerkannten Verfahren
        (Checklisten, Reviews, Benchmark gegen Referenzlösungen,
        Hypothesen-Experimente, Lernschleifen).
  FEAT: i18n-Feinschliff — „(gespeichert)“ im Modell-Select und die Modell-
        Reset-Fehlermeldung laufen über den neuen Non-React-Übersetzer tr()
        (aktuelle Plugin-Sprache; inherit → App-Locale de/en).
  FIX: Vorschlags-Chips wurden NIE angezeigt — der Pro-Session-State wird
       unter der stored Session-ID geschrieben (sessionKey), aber unter der
       Runtime-ID gelesen. Suggestions + OptionsBody lesen jetzt über den
       Persistenz-Key (das Options-Popover zeigt damit auch endlich
       Ausrichtung/Stil/Ziel der Session statt der Defaults).
  FIX: Step-Chip ohne Text gerendert (sp-label hatte kein children).
  FIX: Busy-Anzeige konsistent über sessionKey (RefreshChip + StatusChip).
  TEST: run_test_v10.mjs (Klick → erneuter /api/chat-Call → Chips ersetzt;
        Runtime-ID ≠ stored-ID; force bei agentBusy; Doppelklick-Schutz).

v9 (2026-10-03)
  FIX: Tab-Überschriften zeigten Raw-Keys („tab_focus") — tabLabel() baute
       tab_Focus/tab_Model, Bundles definieren tabFocus/tabModel. Jetzt direkte
       Keys ohne Unterstrich.
  FIX: React-Hook-Crash beim Tab-Wechsel („Rendered fewer hooks than
       expected") — useValue(ollamaModelsAtom) + useValue(hermesModelAtom)
       standen innerhalb von if (tab === 'model'). Alle 8 Hooks jetzt am Kopf
       von OptionsBody vor den Bedingungen.
  TEST: run_test_v9.mjs (statischer Hook-Plan + Tab-Keys),
        run_test_v9b.mjs (Live-Render der Einstellungsseite, rekursiv).

v8 (2026-10-03)
  FIX: „Einstellungen greifen nicht live" — register() hielt ZWILLINGS-ATOMS
       (lokal design/modelCfg + global designAtom/modelCfgAtom). Schreiben ging
       ans lokale Atom (Storage OK), Rendern las vom globalen (blieb alt) →
       kontrollierte Inputs sprangen zurück. Jetzt: nur noch globale Atoms,
       register() macht nur .set() aus Storage.
  FIX: Custom-Focus-Textarea war kontrolliert, aber an ein nicht-reaktives
       Feld gebunden (Tippen wirkte eingefroren) → customHintAtom (reaktiv).
  FIX: Options-Chip ⚙ war unsichtbar, solange keine Steps existierten — jetzt
       immer sichtbar bei fokussierter Session.
  TEST: run_test_v7.mjs (register() erzeugt 0 neue Atoms).

v7 (2026-10-03)
  FEAT: Modell-Selbstheilung — modelExists(port, model) via /api/tags vor jedem
        Call; ungültige Tags (Alt-Lasten wie „deepseek-flash") fallen auf
        ornith-1.5:9b zurück + Klartext-Fehlermeldung im StatusChip.

v6 (2026-10-03)
  FEAT: Modell-Quellen wählbar — ollama (/api/tags-Liste) | hermes
        (SDK ModelCatalogMenu, entkoppelter Controller) | manual.
  FEAT: Kapazitätsprofile decision/llm (auto erkennt ≤2B am Tag) mit
        num_predict/num_ctx/temperature/keep_alive-Reglern.
  FEAT: Restart-stabiler Pro-Session-State via focusedStoredSessionId.
  FEAT: Einstellungsseite /next-steps + Sidebar-Navigation.

v5 (2026-10-03)
  FEAT: Alles unter einem Options-Chip (⚙, Frost-Design) mit 5 Subtabs.
  FEAT: Ziel-Routing pro Chip (⌖): Session / Neuer Tab / Kanban (slash.exec
        „kanban add", Fallback Clipboard+/kanban) / Bot (session.create mit
        profile → openSession → submit). Bots aus profiles.list.
  FEAT: Pro-Session-State (sessionStates-Storage, Kappung 40).

v4 (2026-10-03)
  FEAT: i18n EN/DE — inherit (folgt Hermes via usePluginI18n-Kette) oder
        Override en/de; gilt für UI UND die Schritt-Sprache im Prompt.
  FIX: Popover-Breite (264px Fixbreite), Linksbündigkeit, Label-Ellipse.

v3 (2026-10-03)
  FIX: Popover landete bei (0,0) — Radix-Anker-Regel: NICHTS zwischen
       PopoverTrigger asChild und dem Button (auch kein Tip). variant:"menu".
  FEAT: Eigene Popover-Animation (translate/scale/opacity — KEIN transform,
        Radix positioniert per inline transform). Release-Build hat keine
        tw-animate-Utilities, daher eigene Keyframes.

v2 (2026-10-03)
  FEAT: Zweistufige Ausrichtung — 8 Kategorien (auto/coding/produkt/marketing/
        ideation/betrieb/research/custom) × 5 Schritt-Stile, eigene
        Methoden-Linse als Freitext, buildSystemPrompt (Kontrakt + Linse +
        Stil + Gütekriterien).
  FEAT: Frost-Design-Panel (Blur/Transparenz/Sättigung/Schrift/Chip-Breite).

v1 (2026-10-03)
  Initial: message.complete → session.history → Ollama /api/chat →
  {"steps":[3-5]} → Chips in composer.underside → host.composer.submit.
