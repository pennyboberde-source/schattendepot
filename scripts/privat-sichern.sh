#!/usr/bin/env bash
# Committet Änderungen im Checkout des privaten Zustands (_privat, Zweig "zustand" des privaten Repos) und pusht
# mit Wiederholung. Fehlt der Checkout (Zugang gescheitert, Probelauf), passiert nichts.
set -euo pipefail
nachricht="${1:-Privater Zustand}"
verzeichnis="${PRIVAT_DIR:-_privat}"
if [ ! -d "$verzeichnis/.git" ]; then
  echo "Kein privater Zustand ausgecheckt – nichts zu sichern."
  exit 0
fi
cd "$verzeichnis"
git config user.name "schattendepot-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then
  echo "Privater Zustand unverändert."
  exit 0
fi
git commit -q -m "$nachricht"
for versuch in 1 2 3 4 5; do
  if git push -q origin HEAD:zustand; then
    exit 0
  fi
  echo "Push abgelehnt (Versuch $versuch) – neu aufsetzen"
  git pull -q --rebase origin zustand
  sleep $((versuch * 3))
done
echo "Push des privaten Zustands nach 5 Versuchen fehlgeschlagen" >&2
exit 1
