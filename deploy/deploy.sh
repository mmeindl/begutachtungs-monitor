#!/usr/bin/env bash
# Build locally, deploy to the server, restart, smoke-check.
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
ssh "$SERVER" "chown -R app:app $APP_DIR \
  && systemctl daemon-reload \
  && systemctl enable --now --quiet begutachtungs-monitor-prewarm.timer \
  && systemctl restart begutachtungs-monitor"

sleep 2
ssh "$SERVER" \
  "systemctl --quiet is-active begutachtungs-monitor \
   && curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:3000/ \
   || { journalctl -u begutachtungs-monitor -n 20 --no-pager; exit 1; }"

# Warm the RIS↔ME map in the background — the in-memory cache is empty
# after the restart.
ssh "$SERVER" "systemctl start --no-block begutachtungs-monitor-prewarm.service"

echo "✔ deployed"
