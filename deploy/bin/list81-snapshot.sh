#!/usr/bin/env bash
# One daily copy of list 81, kept on the server — the measurement behind two
# open questions that no single reading of the API can answer.
#
#   1. Is `Frist` updated when a Begutachtung is extended? (docs/architecture.md
#      §13.3.) A No reshapes the alerts package: a deadline that silently moves
#      cannot be alerted on from the list alone. The same question is put to
#      the Parlamentsdirektion directly — this is the independent evidence,
#      and it is worth more measured than answered.
#   2. How many rows change at all, per day? That is the size of the
#      persistence package: if almost nothing moves, history is a small thing.
#
# The whole response is kept, not our reading of it — 39 KB a day, and a
# measurement whose questions may sharpen later. `scripts/corpus/list81Drift.ts`
# reads the series; nothing on the site reads it.
#
# IT STAYS ON THE SERVER. These are Begutachtung metadata under the open
# licence question (CLAUDE.md, E3); a private measurement is not a
# republication, and a directory of daily copies in a public repo would be.
# Pull it to look at it:
#
#   rsync -az root@<SERVER_IP>:/var/lib/begutachtungs-monitor/list81/ .cache/list81/
#   pnpm corpus:list81-drift
#
# Started 24.09.2026 for about two weeks (TODO.md Teil 3). To stop it:
# `systemctl disable --now begutachtungs-monitor-list81-snapshot.timer` — the
# unit files stay in git, so a later restart is one deploy away.
set -euo pipefail

# Hardcoded on purpose. Deriving the current period costs a second request
# whose failure would break the series, and the series is the whole value;
# XXVIII holds until the next election. Override with GP= if that day comes.
GP="${GP:-XXVIII}"
DIR="${STATE_DIRECTORY:-/var/lib/begutachtungs-monitor}/list81"
# UTC, so a run that slips past midnight local time does not overwrite
# yesterday or skip today.
FILE="$DIR/$(date -u +%F).json"
TMP="$FILE.tmp"

mkdir -p "$DIR"
trap 'rm -f "$TMP"' EXIT

# Same query the app sends (server/utils/upstream/parliament.ts): showAll
# without pagesize, sorted by Einlangen. The User-Agent names this job, so an
# operator reading the log can tell it apart from the site's own traffic.
curl -fsS \
  --max-time 60 --retry 3 --retry-delay 20 \
  -H 'Content-Type: application/json' \
  -A 'begutachtungs-monitor/0.1 (+https://begutachtungs-monitor.at; deploy/list81-snapshot)' \
  -d "{\"GP_CODE\":[\"$GP\"]}" \
  -o "$TMP" \
  "https://www.parlament.gv.at/Filter/api/filter/data/81?js=eval&showAll=true&sortrnr=11&ascDesc=DESC"

# A 200 with an error page in it would poison the series quietly. Two cheap
# guards: the shape we read, and a size no truncated answer reaches.
grep -q '"rows"' "$TMP"
[ "$(wc -c < "$TMP")" -gt 10000 ]

mv "$TMP" "$FILE"
echo "list 81 ($GP) → $FILE ($(wc -c < "$FILE") bytes)"
