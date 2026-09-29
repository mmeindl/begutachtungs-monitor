#!/usr/bin/env bash
# Restart the app when the draft list hangs — and write down why first.
#
# THE CASE IT EXISTS FOR (29.09.2026, TODO.md § 5d). Six hours after a deploy
# every route that needs the draft list (/, /entwuerfe, the draft pages,
# /api/drafts, /feed.xml, /kalender.ics) hung without end, while /ueber and
# /api/stations/vorperiode answered in milliseconds. Node sat at 0 % CPU with
# no upstream connection open, systemd saw an active unit, and the GitHub
# uptime job had not run for hours (schedules are throttled). Nothing noticed
# until a person did; a restart fixed it and destroyed the evidence.
#
# So this job does two things, in this order: it keeps the evidence (a Node
# diagnostic report via SIGUSR2, see the drop-in
# begutachtungs-monitor.service.d/diagnostics.conf; the memory of the process;
# which routes hang), and then it restarts.
#
# WHAT COUNTS AS A HANG: a probe that TIMES OUT, twice, 30 s apart. Not an
# HTTP error — when Parliament is down /api/drafts answers with an error, a
# restart would not help, and it would throw away every cache. Not a refused
# connection — the process is dead or restarting, and `Restart=always`
# already handles that.
#
# WHEN IT DOES NOT JUDGE: in the first ten minutes after the app started, and
# while the prewarm runs. One core, cold caches: a slow first minute is
# expected there, and a restart would start the warm-up over — a loop.
#
# AT MOST THREE RESTARTS IN 24 HOURS. A fourth hang means the restart is not
# the answer; the job then fails loudly (`systemctl --failed`) and leaves the
# app alone.
set -uo pipefail

UNIT=begutachtungs-monitor
PREWARM=begutachtungs-monitor-prewarm.service
URL=http://127.0.0.1:3000/api/drafts
REPORTS=/var/lib/begutachtungs-monitor/reports
STATE="${STATE_DIRECTORY:-/var/lib/begutachtungs-monitor-watchdog}"
BUDGET=3
SETTLE_S=600

log() { echo "watchdog: $*"; }

main_pid() { systemctl show -p MainPID --value "$UNIT"; }

systemctl is-active --quiet "$UNIT" || { log "$UNIT not active — systemd's to handle"; exit 0; }
if [ "$(systemctl show -p ActiveState --value "$PREWARM")" = activating ]; then
  log "prewarm running — not judging"; exit 0
fi
enter_us=$(systemctl show -p ActiveEnterTimestampMonotonic --value "$UNIT")
now_us=$(awk '{ printf "%d", $1 * 1000000 }' /proc/uptime)
age_s=$(( (now_us - enter_us) / 1000000 ))
if [ "$age_s" -lt "$SETTLE_S" ]; then
  log "app up ${age_s}s (< ${SETTLE_S}s) — not judging"; exit 0
fi

# Exit code of curl: 0 answered (any status), 28 timed out, 7 refused.
probe() { curl -s -o /dev/null --max-time 60 "$URL"; }

pid=$(main_pid)
probe; first=$?
[ "$first" -eq 0 ] && exit 0
if [ "$first" -ne 28 ]; then
  log "probe failed with curl exit $first (not a timeout) — no restart"; exit 0
fi
log "probe timed out after 60s; retrying in 30s"
sleep 30
probe; second=$?
if [ "$second" -ne 28 ]; then
  log "second probe: curl exit $second — recovered or different failure, no restart"; exit 0
fi
if [ "$(main_pid)" != "$pid" ]; then
  log "app was restarted between the probes — not judging"; exit 0
fi

# --- Confirmed hang. Evidence first. ---------------------------------------
log "HANG CONFIRMED (pid $pid, up ${age_s}s)"
grep -E 'VmRSS|VmSwap' "/proc/$pid/status" | tr -s ' \t' ' ' | sed 's/^/watchdog: /'
for p in /ueber /api/stations/vorperiode /api/drafts /; do
  out=$(curl -s -o /dev/null --max-time 5 -w '%{http_code} %{time_total}s' "http://127.0.0.1:3000$p")
  log "route $p → ${out:-no answer}"
done
# SIGUSR2 only where the process was started with the report handler: without
# it the signal's default action is to terminate — harmless one line before
# a restart, but then the report this is all for silently never exists.
if tr '\0' '\n' < "/proc/$pid/environ" | grep -q '^NODE_OPTIONS=.*--report-on-signal'; then
  marker=$(mktemp)
  kill -USR2 "$pid"
  report=""
  for _ in $(seq 1 15); do
    sleep 1
    report=$(find "$REPORTS" -maxdepth 1 -name 'report.*.json' -newer "$marker" 2>/dev/null | head -1)
    [ -n "$report" ] && break
  done
  rm -f "$marker"
  # No report is a finding too: Node runs the handler on the event loop, so
  # a loop that never gets back to it is blocked rather than idle.
  log "diagnostic report: ${report:-none written within 15s — event loop blocked?}"
else
  log "no report: the process was started without --report-on-signal (drop-in not loaded?)"
fi
find "$REPORTS" -maxdepth 1 -name 'report.*.json' -mtime +30 -delete 2>/dev/null

# --- Budget, then restart. ---------------------------------------------------
mkdir -p "$STATE"
now=$(date +%s)
touch "$STATE/restarts"
recent=$(awk -v cut=$(( now - 86400 )) '$1 > cut' "$STATE/restarts" | wc -l)
if [ "$recent" -ge "$BUDGET" ]; then
  log "GIVING UP: $recent restarts in 24h already — leaving the app as it is"
  exit 1
fi
awk -v cut=$(( now - 86400 )) '$1 > cut' "$STATE/restarts" > "$STATE/restarts.tmp"
echo "$now" >> "$STATE/restarts.tmp"
mv "$STATE/restarts.tmp" "$STATE/restarts"

log "RESTARTING $UNIT (restart $(( recent + 1 )) of $BUDGET in 24h)"
systemctl restart "$UNIT"
if curl -s -o /dev/null --retry 20 --retry-connrefused --retry-delay 1 --max-time 30 http://127.0.0.1:3000/ueber; then
  log "app answers again; starting the prewarm"
  systemctl start --no-block "$PREWARM"
else
  log "app does not answer after the restart"
  exit 1
fi
