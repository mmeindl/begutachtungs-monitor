# Infrastructure

What exists, where it lives, and what it costs. The how-to-rebuild runbook
is [README.md](README.md). Last verified: 2026-08-26.

## Overview

| Piece | Provider | What | Cost |
|---|---|---|---|
| Domain + DNS | INWX ([inwx.de](https://www.inwx.de)) | `begutachtungs-monitor.at`, DNS on INWX nameservers | €15.60/year |
| Server | netcup ([customercontrolpanel.de](https://www.customercontrolpanel.de)) | VPS pico G11s 12M, Nuremberg (DE) | €1.85/month (incl. 20% AT VAT), 12-month term |
| E-mail | INWX ("Mail Easy") | receive-only forwarding: `kontakt@begutachtungs-monitor.at` | €0.29/month, 12-month term |
| TLS | Let's Encrypt via Caddy | auto-issued, auto-renewed | free |
| **Total** | | | **≈ €41/year** |

Both providers are EU-owned — INWX (Berlin, DE); netcup (Karlsruhe, DE,
part of the Austrian Anexia group). The sovereignty invariant is in
`docs/architecture.md` §10. There is deliberately **no** other
infrastructure: no database, no object storage, no CDN, no own mail server.

## Domain & DNS — INWX

Registered August 2026, renews annually. Records are managed in the INWX
web UI under **Nameserver → begutachtungs-monitor.at**.

| Type | Name | Value |
|---|---|---|
| A | *(apex)* | `85.235.66.11` |
| AAAA | *(apex)* | `2a03:4000:32:508:38dd:9eff:fe4c:1b66` |
| A | `www` | `85.235.66.11` |
| MX | *(apex)*, Prio 10 | `smtp-in0.prod0.webspace.bz` |
| MX | *(apex)*, Prio 20 | `smtp-in1.prod0.webspace.bz` |

`www.` is 301-redirected to the bare domain by Caddy.

## E-mail — INWX Mail Easy

Forwarding-only package (no mailboxes): `kontakt@begutachtungs-monitor.at`
forwards to a private inbox; no catch-all. The domain sends no mail.
Managed via the INWX panel → Hosting → *manage* (Froxlor).

## Server — netcup

- **Product:** VPS pico G11s 12M — 1 vCPU, 1 GB RAM, 30 GB SSD, IPv4 + IPv6,
  Nuremberg. 12-month term from August 2026.
- **Panels:** billing/contract at
  [customercontrolpanel.de](https://www.customercontrolpanel.de);
  server console (reinstall, rescue system, VNC/screen) at
  [servercontrolpanel.de](https://www.servercontrolpanel.de).
- **OS:** Ubuntu LTS ·
  **IPv4** `85.235.66.11` · **IPv6** `2a03:4000:32:508:38dd:9eff:fe4c:1b66`

## What runs on it

Everything below is created by [bootstrap.sh](bootstrap.sh), which is
idempotent and safe to re-run:

- **Node 22** (NodeSource apt repo) — runs the self-contained Nitro bundle.
- **systemd service `begutachtungs-monitor`** — dedicated `app` system
  user, app dir `/srv/begutachtungs-monitor`, binds `127.0.0.1:3000`,
  restarts on crash and on reboot.
- **Caddy** (official apt repo) — TLS termination + reverse proxy in front
  of the app; Let's Encrypt certificates renew automatically.
- **ufw** — default deny inbound; only 22/80/443 open.
- **SSH hardening** — key-only logins.
- **unattended-upgrades** — automatic security patches.
- **1 GB swapfile** — headroom next to the 1 GB RAM.

The server holds **no state**: the app caches upstream data in memory only.
The box is disposable — a full rebuild is bootstrap + deploy, ~15 minutes,
on any Ubuntu VPS (the scripts are provider-agnostic).

## Recurring commands

| Task | Command (from the repo root) |
|---|---|
| Deploy | `SERVER=root@85.235.66.11 ./deploy/deploy.sh` |
| App logs | `ssh root@85.235.66.11 journalctl -u begutachtungs-monitor -f` |
| Service status | `ssh root@85.235.66.11 'systemctl status begutachtungs-monitor caddy'` |
| Re-run setup | `scp deploy/bootstrap.sh root@85.235.66.11: && ssh root@85.235.66.11 'DOMAIN=begutachtungs-monitor.at bash bootstrap.sh'` |

## Renewal calendar

- **netcup 12-month term** ends August 2027; decide renew vs. move ahead of
  time. A provider move costs ~30 minutes (stateless app, provider-agnostic
  scripts) plus a DNS update.
- **Domain and mail package** renew annually at INWX (August). The domain
  must outlive any rename or provider move: the published feed and calendar
  URLs (`webcal://…`) resolve through it.
