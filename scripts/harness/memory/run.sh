#!/bin/bash
# The heap of the built server under production's limit (22.11.2026), in two parts in one process:
#   A  the deploy sequence: every curl of the prewarm unit in its order, then prewarm-pages.sh
#   B  what readers trigger: the two questions of the Textgegenüberstellung section for every draft of the
#      period (scripts/harness/accounting.ts, Parliament's drafts, then the RIS-only ones)
# usage: run.sh <worktree with a build> <outdir> <harness cache dir>
WT="$1"; T="$2"; CACHE="$3"; PORT=3111; BASE="http://127.0.0.1:$PORT"
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -n "$CACHE" ] || { echo "usage: run.sh <worktree> <outdir> <cache>"; exit 2; }
mkdir -p "$T"; cd "$WT" || exit 2
: > "$T/progress.log"
t() { echo "$(date +%H:%M:%S) $*" >> "$T/progress.log"; }

HARNESS_CACHE="$CACHE" PORT=$PORT node --max-old-space-size=320 --trace-gc "$HERE/serve-plain.mjs" > "$T/server.log" 2>&1 &
SP=$!
echo $SP > "$T/server.pid"
( while kill -0 $SP 2>/dev/null; do echo "$(date +%H:%M:%S) $(ps -o rss= -p $SP)"; sleep 0.5; done > "$T/rss.txt" ) &
t "server pid $SP"

alive() { kill -0 $SP 2>/dev/null; }
mark() { t "$1 | rss max so far $(awk '{ if ($2 > m) m = $2 } END { printf "%d MB", m / 1024 }' "$T/rss.txt")"; }

# A: the unit's curls, in its order. A leading "-" means the unit tolerates a failure there.
grep -E '^ExecStart=-?/usr/bin/curl' deploy/systemd/begutachtungs-monitor-prewarm.service | while IFS= read -r line; do
  cmd="${line#ExecStart=}"; tolerated=no
  case "$cmd" in -*) cmd="${cmd#-}"; tolerated=yes ;; esac
  cmd="${cmd//127.0.0.1:3000/127.0.0.1:$PORT}"
  url="$(echo "$cmd" | grep -oE 'http://[^" ]+')"
  start=$(date +%s)
  bash -c "$cmd -w '%{http_code}'" < /dev/null > "$T/curl.out" 2> "$T/curl.err"; code=$?
  alive || { t "A ${url#$BASE}: SERVER DIED"; break; }
  t "A ${url#$BASE} exit $code http $(tail -c 3 "$T/curl.out") in $(( $(date +%s) - start )) s (tolerated: $tolerated) $(head -c 160 "$T/curl.err" | tr '\n' ' ')"
done
mark "A unit done"
if alive; then BASE="$BASE" bash deploy/bin/prewarm-pages.sh > "$T/prewarm-pages.txt" 2>&1; t "A $(tail -1 "$T/prewarm-pages.txt")"; fi
mark "A done"

# B: every draft's comparison, as its section asks for it.
if alive; then
  npx vite-node -c vitest.config.ts scripts/harness/accounting.ts -- --base="$BASE" --json="$T/acc.json" > "$T/acc.txt" 2>&1; t "B acc exit $? | $(tail -1 "$T/acc.txt" | cut -c1-200)"
  mark "B acc done"
fi
if alive; then
  npx vite-node -c vitest.config.ts scripts/harness/accounting.ts -- --base="$BASE" --ris --json="$T/acc-ris.json" > "$T/acc-ris.txt" 2>&1; t "B acc-ris exit $? | $(tail -1 "$T/acc-ris.txt" | cut -c1-200)"
  mark "B acc-ris done"
fi
if alive; then t "server alive at the end"; else t "SERVER DIED"; fi
kill $SP 2>/dev/null
sleep 1
t "ALL DONE"
cat "$T/progress.log"
