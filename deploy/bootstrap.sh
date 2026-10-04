#!/usr/bin/env bash
# One-time server setup for the Begutachtungs-Monitor prototype.
# Run as root on a fresh Ubuntu LTS server — 26.04 or 24.04 (netcup pico
# or any other Ubuntu VPS):
#
#   scp deploy/bootstrap.sh root@<SERVER_IP>:
#   ssh root@<SERVER_IP> 'DOMAIN=begutachtungs-monitor.at bash bootstrap.sh'
#
# Idempotent: safe to re-run. DNS must already point at this server —
# Caddy requests the TLS certificate as soon as it loads the Caddyfile.
set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN, e.g. DOMAIN=begutachtungs-monitor.at bash bootstrap.sh}"
APP_DIR=/srv/begutachtungs-monitor

# --- packages ---------------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg ufw rsync unattended-upgrades

# Pin unattended-upgrades on (Ubuntu defaults to on, but don't rely on it)
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT

# The stock 50unattended-upgrades allows Ubuntu's -security origins only, so
# Node and Caddy — Caddy faces the internet — never patched themselves. List
# entries in apt.conf.d append, so Ubuntu's own origins stay as they are.
# Values from the repos' Release files (read 2026-10-04):
#   deb.nodesource.com/node_22.x/dists/nodistro/Release
#     Origin ". nodistro", Suite nodistro — matched by site + suite, because
#     that origin string is an aptly default nobody promises to keep;
#   dl.cloudsmith.io/public/caddy/stable/deb/debian/dists/any-version/Release
#     Origin "cloudsmith/caddy/stable" — the origin is needed here, the site
#     alone would match every repo Cloudsmith hosts.
# The node_22.x repo carries 22.x only, so this never crosses a major version.
cat > /etc/apt/apt.conf.d/51unattended-upgrades-thirdparty <<'APT'
Unattended-Upgrade::Origins-Pattern {
	"site=deb.nodesource.com,suite=nodistro";
	"site=dl.cloudsmith.io,origin=cloudsmith/caddy/stable";
};
APT

# Node 22 LTS (NodeSource) — runtime for the Nitro server bundle
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy (official apt repo) — TLS termination + reverse proxy
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# --- swap (1 GB) — headroom on 1-GB machines like the netcup pico ------------
if [ -z "$(swapon --show --noheadings)" ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- SSH hardening: key-only logins -------------------------------------------
# The netcup image leaves password auth on and root with a usable password —
# on a public IPv4 that invites brute force. Keys are injected at install
# time, so lock logins to keys. Verify key login works BEFORE disconnecting.
#
# 00-, not 90-: sshd takes the FIRST value it reads per key, and the drop-ins
# are read in name order — an image's 50-cloud-init.conf with
# `PasswordAuthentication yes` would beat a 90- file. Up to 2026-10-04 this
# file was 90-hardening.conf; a stale copy is removed so there is one source.
cat > /etc/ssh/sshd_config.d/00-hardening.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSHD
rm -f /etc/ssh/sshd_config.d/90-hardening.conf
sshd -t && systemctl reload ssh
# Trust the effective configuration, not the file: whatever another drop-in
# or the main config says, these must be what sshd actually runs with.
# `sshd -T` prints prohibit-password under its old name, without-password.
for want in 'passwordauthentication no' \
            'kbdinteractiveauthentication no' \
            'permitrootlogin (prohibit-password|without-password)'; do
  if ! sshd -T | grep -qxE "$want"; then
    echo "✘ sshd does not run with '$want' — another file in /etc/ssh/sshd_config.d wins:" >&2
    grep -rniE 'passwordauthentication|kbdinteractive|challengeresponse|permitrootlogin' \
      /etc/ssh/sshd_config /etc/ssh/sshd_config.d/ >&2 || true
    exit 1
  fi
done

# --- firewall ----------------------------------------------------------------
# Pin the defaults instead of relying on ufw's factory settings
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# --- app user + directory ----------------------------------------------------
id app >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin app
# The code belongs to root and is only readable for `app`, so a compromised
# process cannot rewrite the bundle it is restarted from. `app` writes to its
# StateDirectory and nowhere else. deploy.sh keeps it that way on every deploy.
mkdir -p "$APP_DIR"
chown -R root:root "$APP_DIR"
chmod 0755 "$APP_DIR"

# --- systemd service ----------------------------------------------------------
cat > /etc/systemd/system/begutachtungs-monitor.service <<UNIT
[Unit]
Description=Begutachtungs-Monitor (Nuxt/Nitro)
After=network.target

[Service]
Type=simple
User=app
Group=app
WorkingDirectory=$APP_DIR
# The heap limit is a flag here and not NODE_OPTIONS: the drop-in
# begutachtungs-monitor.service.d/diagnostics.conf sets NODE_OPTIONS, and a
# drop-in's assignment replaces this file's — the limit would silently vanish.
ExecStart=/usr/bin/node --max-old-space-size=384 $APP_DIR/server/index.mjs
# Persistent app state in /var/lib/begutachtungs-monitor (created and
# chowned to the service user by systemd, exported as \$STATE_DIRECTORY).
# Must live OUTSIDE $APP_DIR: deploy.sh rsyncs .output/ with --delete.
# Currently used for the last-good Stellungnahmen fallback
# (server/utils/parliament/lastgood.ts) — losing it costs a degraded page,
# not data.
StateDirectory=begutachtungs-monitor
Environment=NODE_ENV=production
Environment=NITRO_HOST=127.0.0.1
Environment=NITRO_PORT=3000
Restart=always
RestartSec=3

# --- memory ---
# The box has 952 MB and a 1 GB swapfile; the app measured ~90–130 MB
# resident warm (docs/architecture.md §5) and a 54 MB heap mid-prewarm. The
# V8 old space (384 MB, ExecStart) sits below this ceiling with ~128 MB for
# code, young generation and buffers, so a leak ends as a clean V8 "heap out
# of memory" exit and a restart — not as the kernel swapping the whole box to
# a crawl. The ~440 MB left over are Caddy, sshd, journald and apt.
MemoryMax=512M

# --- sandbox ---
# The app reads its code and talks HTTP; everything else is taken away.
# Writable: only StateDirectory (and the drop-in's reports/ below it, also a
# StateDirectory — systemd keeps both writable under ProtectSystem=strict)
# and a private /tmp. Check with: systemd-analyze security begutachtungs-monitor
# (No backticks in this heredoc — it is unquoted, the shell would run them.)
# NOT MemoryDenyWriteExecute: V8's JIT needs writable+executable pages.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
# No AF_NETLINK: glibc's getaddrinfo then assumes both IPv4 and IPv6 are
# configured, which is true here. If upstream fetches ever fail with
# EAFNOSUPPORT, this is the line.
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
CapabilityBoundingSet=
SystemCallFilter=@system-service
# A filtered call fails with EPERM instead of killing the process: Node and
# libuv probe optional calls (io_uring, memory protection keys) and fall back.
SystemCallErrorNumber=EPERM
LockPersonality=yes
RestrictSUIDSGID=yes

[Install]
WantedBy=multi-user.target
UNIT

# The prewarm timer (deploy/systemd/*) is not installed here: bootstrap.sh
# is scp'd alone and cannot see the repo. deploy.sh installs the unit files
# on every deploy and enables the timer.
systemctl daemon-reload
systemctl enable begutachtungs-monitor
# The app itself is not started here — there is nothing to run until the
# first deploy; deploy.sh does `systemctl restart`, which also performs the
# first start.

# --- Caddy -------------------------------------------------------------------
# NO `log` directive, on purpose: without one Caddy keeps no access log, and
# the privacy statement (app/pages/datenschutz.vue, "kein Zugriffsprotokoll")
# cites exactly this. Adding one means changing that page in the same commit.
#
# request_body: the app takes no uploads; 1 MB is far above any API request
# and blocks only bodies nobody legitimately sends.
#
# header: also sent by the app itself; Caddy's values win, because deleting a
# header (-Server) defers all of these to the moment the response is written.
# Content-Security-Policy is the exception: the app builds the full policy
# per response (server/plugins/csp.ts, with per-build script hashes), so
# Caddy must not overwrite it — `?` sets the framing-only fallback ONLY when
# the response carries none, i.e. when the app is down.
cat > /etc/caddy/Caddyfile.new <<CADDY
$DOMAIN {
	encode zstd gzip
	request_body {
		max_size 1MB
	}
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		X-Frame-Options DENY
		?Content-Security-Policy "frame-ancestors 'none'"
		-Server
	}
	reverse_proxy 127.0.0.1:3000
}

www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
CADDY

# Validate before it replaces the live file: a broken Caddyfile in place would
# take the site down at the next Caddy restart, not now.
caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile.new
mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

echo
echo "✔ Bootstrap done for https://$DOMAIN"
echo "  Next, from your machine:  SERVER=root@<SERVER_IP> ./deploy/deploy.sh"
