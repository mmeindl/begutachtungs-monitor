#!/usr/bin/env bash
# Render the page of every draft that can take a Stellungnahme right now, once,
# so its first reader of the day does not wait for the upstream fetches.
#
# Measured 30.09.2026 on production: 8 of 8 draft pages answered in ~1,0 s on
# the first request and ~0,15 s from then on. These are the pages the feed, the
# calendar, the homepage and shared links point to — the ones read while a
# Frist runs. Requesting the HTML warms exactly what the server render reads,
# and nothing it does not: the lazily fetched sections stay cold by design
# (see the note on `/konsolidiert` in begutachtungs-monitor-prewarm.service).
#
# Sequential, one page at a time: about 20 to 30 pages, a few upstream requests
# each, against APIs whose rate limits are undocumented. Node parses the JSON
# because the server has no jq and has Node anyway.
set -uo pipefail

BASE="${BASE:-http://127.0.0.1:3000}"

paths() {
  curl -fsS --max-time 120 "$BASE/api/drafts?status=open" \
    | node -e 'let s="";process.stdin.on("data",(d)=>{s+=d}).on("end",()=>{for(const d of JSON.parse(s).items)console.log(`/entwuerfe/${d.gp}/${d.inr}`)})'
  curl -fsS --max-time 120 "$BASE/api/ris-drafts?status=open" \
    | node -e 'let s="";process.stdin.on("data",(d)=>{s+=d}).on("end",()=>{for(const c of JSON.parse(s).items)console.log(`/entwuerfe/${c.id}`)})'
}

ok=0
failed=0
while read -r path; do
  if curl -fsS -o /dev/null --max-time 120 "$BASE$path"; then
    ok=$((ok + 1))
  else
    failed=$((failed + 1))
    echo "prewarm-pages: $path failed"
  fi
done < <(paths)

echo "prewarm-pages: $ok pages warm, $failed failed"
# A page that failed is a page its first reader renders cold — slower, not
# wrong. Not worth a failed unit and a red line in `systemctl --failed`.
exit 0
