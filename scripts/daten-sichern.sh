#!/usr/bin/env bash
# Committet Änderungen im daten-Checkout (_daten) und pusht mit Wiederholung.
# Gibt "geaendert=true|false" nach $GITHUB_OUTPUT aus (falls gesetzt).
set -euo pipefail
nachricht="${1:-Daten aktualisiert}"
cd "${DATEN_DIR:-_daten}"
git config user.name "schattendepot-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then
  echo "Keine Datenänderung."
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "geaendert=false" >> "$GITHUB_OUTPUT"
  exit 0
fi
git commit -q -m "$nachricht"
for versuch in 1 2 3 4 5; do
  if git push -q origin HEAD:daten; then
    [ -n "${GITHUB_OUTPUT:-}" ] && echo "geaendert=true" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  echo "Push abgelehnt (Versuch $versuch) – neu aufsetzen"
  git pull -q --rebase origin daten
  sleep $((versuch * 3))
done
echo "Push nach 5 Versuchen fehlgeschlagen" >&2
exit 1
