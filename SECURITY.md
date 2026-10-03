# Sicherheit

## Unterstützte Versionen

Es wird jeweils nur der neueste Stand (`main`) unterstützt.

## Schwachstellen melden

Bitte **nicht** als öffentliches Issue, sondern per E-Mail an **hallo@agantila.com** mit:

- Beschreibung und Reproduktion
- Betroffener Version/Commit
- Möglicher Auswirkung

Wir antworten innerhalb von 48 Stunden (werktags) und stimmen Fix bzw. Workaround mit Dir ab.

## Kontext

next-steps ist ein reines Renderer-Plugin (eine ESM-Datei) für Hermes Desktop. Es spricht
ausschließlich mit lokalen Endpunkten (Ollama auf `localhost:11434`, Hermes-Gateway über das
Plugin-SDK) und überträgt keine Daten nach außen. Der Code läuft im Desktop-Renderer — wie bei
allen Desktop-Plugins gilt: nur Quellen installieren, denen du vertraust.
