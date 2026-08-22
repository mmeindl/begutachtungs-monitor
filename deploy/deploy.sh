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
ssh "$SERVER" "chown -R app:app $APP_DIR && systemctl restart begutachtungs-monitor"

sleep 2
ssh "$SERVER" \
  "systemctl --quiet is-active begutachtungs-monitor \
   && curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:3000/ \
   || { journalctl -u begutachtungs-monitor -n 20 --no-pager; exit 1; }"

echo "✔ deployed"
