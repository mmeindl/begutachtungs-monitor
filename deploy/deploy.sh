#!/usr/bin/env bash
# Build locally, deploy to the server, restart, smoke-check, warm the caches.
#
#   SERVER=root@<SERVER_IP> ./deploy/deploy.sh                # a commit
#   SERVER=root@<SERVER_IP> ./deploy/deploy.sh --allow-dirty  # the working tree
#
# The server only needs the Node runtime (see bootstrap.sh) — .output/ is
# self-contained, pure-JS, platform-independent.
set -euo pipefail

SERVER="${SERVER:?Set SERVER, e.g. SERVER=root@203.0.113.1 ./deploy/deploy.sh}"
APP_DIR=/srv/begutachtungs-monitor
# Where units and scripts land before they are installed into place. Under
# /root, so nobody but root can touch them in between.
STAGE=/root/begutachtungs-monitor-deploy

ALLOW_DIRTY=no
for arg in "$@"; do
  case "$arg" in
    --allow-dirty) ALLOW_DIRTY=yes ;;
    *) echo "unknown argument: $arg (the only one is --allow-dirty)" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."

# What runs on the box should be a commit that can be checked out again. A
# dirty tree ships code no commit holds — sometimes on purpose, hence the
# flag, but never by accident. Untracked files count: Nuxt auto-imports
# components and composables, so a stray file is part of the build.
REVISION=$(git rev-parse HEAD)
if [ -n "$(git status --porcelain)" ]; then
  if [ "$ALLOW_DIRTY" != yes ]; then
    echo "✘ the working tree has changes — commit them, or ship them on purpose with --allow-dirty:" >&2
    git status --short >&2
    exit 1
  fi
  REVISION="$REVISION-dirty"
  echo "⚠ shipping the working tree on top of $(git log -1 --format='%h %s')"
else
  echo "… shipping $(git log -1 --format='%h %s')"
fi

pnpm install --frozen-lockfile
pnpm build
# The box records what runs: /srv/begutachtungs-monitor/REVISION. Not
# public — Nitro serves .output/public/ only.
echo "$REVISION" > .output/REVISION

# -rlptz, not -a: -a includes -o/-g, which as root on the other end hands
# every file the Mac's uid (501:staff). Without them rsync creates the files
# as root. (macOS ships openrsync, which has no --chown or --chmod; owner and
# modes are therefore set on the server below.)
rsync -rlptz --delete .output/ "$SERVER:$APP_DIR/"
# systemd units (deploy/systemd/) and what they execute when it is more than
# one command (deploy/bin/) live in git and are installed on every deploy —
# idempotent, no manual step on the server when a unit changes. Staged, not
# rsynced into /etc/systemd/system: rsync with a trailing-slash source
# re-owned that directory itself, and a connection dropped before the next
# chown left it — and root-run units — with the Mac's uid. The network copy
# now ends in /root; only `install` on the box, with owner and mode, writes
# into place.
rsync -rlptz --delete deploy/systemd deploy/bin "$SERVER:$STAGE/"

ssh "$SERVER" "APP_DIR=$APP_DIR STAGE=$STAGE bash -s" <<'REMOTE'
set -euo pipefail
# The code is root's and only readable for `app`: a compromised process must
# not be able to rewrite the bundle it is restarted from. `app` writes only
# to its StateDirectory, /var/lib/begutachtungs-monitor.
chown -R root:root "$APP_DIR"
find "$APP_DIR" -type d -exec chmod 0755 {} +
find "$APP_DIR" -type f -exec chmod 0644 {} +

install -o root -g root -m 0644 -t /etc/systemd/system \
  "$STAGE"/systemd/*.service "$STAGE"/systemd/*.timer
for dropin in "$STAGE"/systemd/*.d; do
  # Without nullglob an unmatched pattern arrives literally, and install -d
  # would create a directory named '*.d'.
  [ -d "$dropin" ] || continue
  target=/etc/systemd/system/$(basename "$dropin")
  install -d -o root -g root -m 0755 "$target"
  install -o root -g root -m 0644 -t "$target" "$dropin"/*
done
install -d -o root -g root -m 0755 /usr/local/lib/begutachtungs-monitor
install -o root -g root -m 0755 -t /usr/local/lib/begutachtungs-monitor "$STAGE"/bin/*

systemctl daemon-reload
systemctl enable --now --quiet begutachtungs-monitor-prewarm.timer
systemctl enable --now --quiet begutachtungs-monitor-list81-snapshot.timer
systemctl enable --now --quiet begutachtungs-monitor-watchdog.timer
systemctl restart begutachtungs-monitor
REMOTE

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
# GP XXVIII) and, since 26.09.2026, the previous period's (650 requests).
# Until then this script said "✔ deployed" while the caches were
# still empty, so the first /entwuerfe ran its RIS half ~15 s into an 8 s
# budget and answered "gerade nicht abrufbar" — honest, and avoidable. Same
# window, same minute: without the station map the list cannot tell a draft
# whose Vorlage still takes Stellungnahmen from a closed one
# (`canParticipate`, docs/architecture.md §12.26).
#
# A failed prewarm does NOT fail the deploy. The app is up — that was checked
# above — and what is lost is a warm cache, not a release; rolling back would
# be the wrong answer to an upstream hiccup. It is said out loud instead.
echo "… prewarming (RIS corpus, BGBl volumes, both station maps) — cold, this is the slow part"
if ! ssh "$SERVER" "systemctl start begutachtungs-monitor-prewarm.service"; then
  echo "⚠ prewarm failed — the first visitor pays for it:"
  echo "    ssh $SERVER journalctl -u begutachtungs-monitor-prewarm -n 30 --no-pager"
fi

echo "✔ deployed $REVISION"
