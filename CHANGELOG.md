CHANGELOG — next-steps-plugin
==============================

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
