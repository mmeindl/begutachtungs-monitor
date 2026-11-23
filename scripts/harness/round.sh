#!/usr/bin/env bash
# One whole measuring round for /genauigkeit, on this checkout's commit.
#
#   pnpm build && pnpm ci:ssr-smoke
#   pnpm harness:round <outdir>
#   npx vite-node -c vitest.config.ts scripts/harness/genauigkeit.ts -- --in=<outdir> --erlaube-ungehalten=Lücke
#
# Starts the build on PORT (default 3111) with the harness cache under its
# fetch, warms the RIS draft map (about 50 s cold; without it the first
# accounting request waits for it), and runs the harnesses in four parallel
# lanes. Each step logs to <outdir>/<name>.txt, with „exit N" as its last line.
#
# The lists are fetched fresh, so a draft published since the cache was filled
# is read. The Länder harnesses stay --cached-only: their corpus is the
# fixtures' and the cache's. The station lane exits 1 when its baseline is
# older than the list; redraw it from <outdir>/station.json, with a reason for
# every residue that is not editorial.
#
# HARNESS_CACHE: the cache to read and fill (default .harness-cache).
# BM_STATE_DIR: the server's state (default <outdir>/state, never production's).
set -u

OUT="${1:-}"
if [ -z "$OUT" ]; then echo 'usage: pnpm harness:round <outdir>' >&2; exit 2; fi
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 2
if [ ! -f .output/server/index.mjs ]; then echo '.output fehlt: zuerst pnpm build' >&2; exit 2; fi
if [ -e "$OUT" ] && [ -n "$(ls -A "$OUT")" ]; then echo "$OUT ist nicht leer" >&2; exit 2; fi
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

PORT="${PORT:-3111}"
BASE="http://127.0.0.1:$PORT"
export PORT
export HARNESS_CACHE="${HARNESS_CACHE:-$ROOT/.harness-cache}"
export BM_STATE_DIR="${BM_STATE_DIR:-$OUT/state}"
mkdir -p "$BM_STATE_DIR"
: > "$OUT/progress.log"

vn() { node_modules/.bin/vite-node -c vitest.config.ts "$@"; }
note() { echo "$(date +%H:%M:%S) $*" >> "$OUT/progress.log"; }
step() {
  local name="$1"; shift
  "$@" > "$OUT/$name.txt" 2>&1
  echo "exit $?" >> "$OUT/$name.txt"
  note "$name $(tail -1 "$OUT/$name.txt")"
}

# exec, so that $! is the server itself: a function in the background is a subshell, and killing it left the server running.
(exec node_modules/.bin/vite-node -c vitest.config.ts scripts/harness/serveBuilt.ts > "$OUT/server.log" 2>&1) &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null' EXIT

warmed=
for _ in $(seq 1 150); do
  if curl -fsS -o /dev/null --max-time 120 "$BASE/api/ris-map/aktuell"; then warmed=1; break; fi
  kill -0 "$SERVER" 2>/dev/null || break
  sleep 2
done
if [ -z "$warmed" ]; then echo "Server antwortet nicht, siehe $OUT/server.log" >&2; exit 1; fi
note 'server warm'

{ step fi-pdf vn scripts/harness/faultInjection.ts -- --gp=XXVIII --misses --mindestens=95 --json="$OUT/fi-pdf.json"
  step fi-xml vn scripts/harness/faultInjection.ts -- --gp=XXVIII --xml --misses --mindestens=95 --json="$OUT/fi-xml.json"; } &
A=$!
{ step kons vn scripts/harness/kons.ts -- --discover=60 --sammel --cache --oracle --quiet --json="$OUT/kons.json"
  step annex-xml vn scripts/harness/annexPdf.ts -- --gp=XXVIII --xml --json="$OUT/annex-xml.json" --zeilen="$OUT/rows-xml.json"
  step annex-pdf vn scripts/harness/annexPdf.ts -- --gp=XXVIII --json="$OUT/annex-pdf.json" --zeilen="$OUT/rows-pdf.json"; } &
B=$!
{ step station vn scripts/harness/station.ts -- --gp=XXVIII --cache --mutationen --baseline=scripts/harness/stationBaseline.json --json="$OUT/station.json"
  step land-st vn scripts/harness/landStations.ts -- --out "$OUT/land-st" --cached-only
  step land-guard vn scripts/harness/landGuard.ts -- --out "$OUT/land-guard" --cached-only --mindestens=95 --baseline=scripts/harness/landGuardBaseline.json; } &
C=$!
{ step acc vn scripts/harness/accounting.ts -- --base="$BASE" --json="$OUT/acc.json"
  step acc-ris vn scripts/harness/accounting.ts -- --base="$BASE" --ris --json="$OUT/acc-ris.json"; } &
D=$!
wait "$A" "$B" "$C" "$D"
note 'ALL DONE'
cat "$OUT/progress.log"
