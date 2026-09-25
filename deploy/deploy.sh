#!/usr/bin/env bash
# Build locally, deploy to the server, restart, smoke-check, warm the caches.
#
#   SERVER=root@<SERVER_IP> ./deploy/deploy.sh
#
# The server only needs the Node runtime (see bootstrap.sh) — .output/ is
# self-contained, pure-JS, platform-independent.
set -euo pipefail

SERVER="${SERVER:?Set SERVER, e.g. SERVER=root@203.0.113.1 ./deploy/deploy.sh}"
APP_DIR=/srv/begutachtungs-monitor

cd "$(dirname "$0")/.."

pnpm install --frozen-lockfile
pnpm build

# macOS ships openrsync (no --chown) → chown in a separate step.
rsync -az --delete .output/ "$SERVER:$APP_DIR/"
# systemd units live in git (deploy/systemd/) and are installed on every
# deploy — idempotent, no manual step on the server when a unit changes.
rsync -az deploy/systemd/ "$SERVER:/etc/systemd/system/"
# What those units execute when it is more than one command (deploy/bin/).
# Outside $APP_DIR, which is rsynced with --delete.
ssh "$SERVER" "mkdir -p /usr/local/lib/begutachtungs-monitor"
rsync -az deploy/bin/ "$SERVER:/usr/local/lib/begutachtungs-monitor/"
ssh "$SERVER" "chmod +x /usr/local/lib/begutachtungs-monitor/*.sh \
  && chown -R app:app $APP_DIR \
  && systemctl daemon-reload \
  && systemctl enable --now --quiet begutachtungs-monitor-prewarm.timer \
  && systemctl enable --now --quiet begutachtungs-monitor-list81-snapshot.timer \
  && systemctl restart begutachtungs-monitor"

sleep 2
ssh "$SERVER" \
  "systemctl --quiet is-active begutachtungs-monitor \
   && curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:3000/ \
   || { journalctl -u begutachtungs-monitor -n 20 --no-pager; exit 1; }"

# THE COLD MINUTE — and the deploy waits it out since 24.09.2026.
#
# `systemctl restart` empties every cache: production mounts no storage, so
# both layers are memory in the very process systemd has just replaced
# (`server/utils/cache/base.ts`). Warming BEFORE the restart would therefore
# warm the process that is about to die; the only thing a deploy can do about
# the cold window is not to walk away in the middle of it.
#
# Hence no `--no-block`. On a Type=oneshot `systemctl start` returns when the
# last ExecStart has — the RIS corpus (46 requests, 46 s cold), the BGBl
# volumes, the open Begut records, the station map (227 requests, 35,6 s for
# GP XXVIII). Until then this script said "✔ deployed" while the caches were
# still empty, so the first /entwuerfe ran its RIS half ~15 s into an 8 s
# budget and answered "gerade nicht abrufbar" — honest, and avoidable. Same
# window, same minute: without the station map the list cannot tell a draft
# whose Vorlage still takes Stellungnahmen from a closed one
# (`canParticipate`, docs/architecture.md §12.26).
#
# A failed prewarm does NOT fail the deploy. The app is up — that was checked
# above — and what is lost is a warm cache, not a release; rolling back would
# be the wrong answer to an upstream hiccup. It is said out loud instead.
echo "… prewarming (RIS corpus, BGBl volumes, station map) — cold, this is the slow part"
if ! ssh "$SERVER" "systemctl start begutachtungs-monitor-prewarm.service"; then
  echo "⚠ prewarm failed — the first visitor pays for it:"
  echo "    ssh $SERVER journalctl -u begutachtungs-monitor-prewarm -n 30 --no-pager"
fi

echo "✔ deployed"
