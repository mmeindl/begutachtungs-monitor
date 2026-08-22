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
cat > /etc/ssh/sshd_config.d/90-hardening.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSHD
sshd -t && systemctl reload ssh

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
mkdir -p "$APP_DIR"
chown -R app:app "$APP_DIR"

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
ExecStart=/usr/bin/node $APP_DIR/server/index.mjs
Environment=NODE_ENV=production
Environment=NITRO_HOST=127.0.0.1
Environment=NITRO_PORT=3000
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable begutachtungs-monitor
# Not started here — there is nothing to run until the first deploy;
# deploy.sh does `systemctl restart`, which also performs the first start.

# --- Caddy -------------------------------------------------------------------
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}

www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
CADDY

systemctl reload caddy || systemctl restart caddy

echo
echo "✔ Bootstrap done for https://$DOMAIN"
echo "  Next, from your machine:  SERVER=root@<SERVER_IP> ./deploy/deploy.sh"
