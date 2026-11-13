#!/usr/bin/env bash
# Uçtan uca test: geçici SQLite veritabanıyla sunucuyu açar, tests/e2e.mjs'i çalıştırır.
# Kullanım: npm test   (önce: npm run build)
set -euo pipefail
cd "$(dirname "$0")/.."
DATA="$(mktemp -d)"
PORT="${TEST_PORT:-3999}"
DB_DRIVER=sqlite PORT="$PORT" DATA_DIR="$DATA" STATIC_DIR="$PWD/dist" PUBLIC_URL="http://localhost:$PORT" \
  SEED_ADMIN_EMAIL=info@batilmer.com SEED_ADMIN_PASSWORD=Gecici.Sifre1 node server/src/index.js >"$DATA/sunucu.log" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -rf "$DATA"' EXIT
for _ in $(seq 1 50); do curl -sf "http://localhost:$PORT/" >/dev/null && break; sleep 0.2; done
OUT="$(TEST_URL="http://localhost:$PORT" node tests/e2e.mjs "$DATA" 2>&1)" || true
echo "$OUT"
if echo "$OUT" | grep -q '^FAIL' || ! echo "$OUT" | grep -q 'form alanları duruyor'; then
  echo "--- sunucu kaydı ---"; tail -40 "$DATA/sunucu.log"
  echo "✖ Testler başarısız"; exit 1
fi
echo "✔ $(echo "$OUT" | grep -c '^OK') test geçti"
