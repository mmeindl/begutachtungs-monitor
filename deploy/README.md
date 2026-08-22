# Deployment

Target: one small EU-owned VPS (settled: **netcup VPS pico G11s**, Nuremberg,
DE — see `docs/architecture.md` §10/§13). The app is stateless
(in-memory cache only), so the whole production setup is: Node runs the Nitro
bundle as a systemd service, Caddy terminates TLS in front of it.

The build runs **locally**; the self-contained `.output/` bundle (pure JS,
platform-independent) is rsynced to the server. The server needs no git, pnpm,
or build toolchain — only the Node runtime.

**The live setup** — domain, DNS records, server, IPs, TLS, costs, renewal
dates — is inventoried in [infrastructure.md](infrastructure.md). This file
is the how-to-rebuild runbook.

## One-time setup

1. **Register the domain** at any registrar. *(Done: `begutachtungs-monitor.at`
   at INWX, Aug 2026 — see [infrastructure.md](infrastructure.md).)*

2. **Order the server** *(done Aug 2026)*: netcup **VPS pico G11s 12M NUE**
   (<https://www.netcup.com/de/server/vps/vps-pico-g11s-12m-nue>) —
   1 vCPU, 1 GB RAM, 30 GB SSD, IPv4 + IPv6 included, Nuremberg.
   €1.85/month (incl. 20% AT VAT; the product page shows €1.84 with 19%
   DE VAT), 12-month term, no setup fee. Sold in limited batches;
   if out of stock, the no-commitment fallback is a Hetzner CX23
   (hourly, ~€7.19/month) — the scripts run on any Ubuntu VPS.
   After provisioning, in the netcup SCP (<https://servercontrolpanel.de>):
   install the **Ubuntu 26.04** image (24.04 works too), inject your SSH key
   via the image form's **Custom Script** field — it has no dedicated key
   field (fallback: `ssh-copy-id -i ~/.ssh/<key> root@<SERVER_IP>` using the
   mailed root password) — and note the server's IPv4 + IPv6.

3. **Point DNS at the server** (at the registrar):
   `A` record → the server's IPv4, `AAAA` record → its IPv6.
   Do this *before* bootstrapping — Caddy requests the TLS certificate
   immediately, which only works once the name resolves to the server.

4. **Bootstrap the server** (installs Node 22 + Caddy, creates the `app`
   service user, firewall, key-only SSH, systemd unit, Caddyfile):

   ```sh
   scp deploy/bootstrap.sh root@<SERVER_IP>:
   ssh root@<SERVER_IP> 'DOMAIN=begutachtungs-monitor.at bash bootstrap.sh'
   ```

5. **First deploy** — same command as every later deploy:

   ```sh
   SERVER=root@<SERVER_IP> ./deploy/deploy.sh
   ```

   Then open `https://<domain>` and click through the pages.

## Every later deploy

```sh
SERVER=root@<SERVER_IP> ./deploy/deploy.sh
```

That is: local `pnpm build`, rsync `.output/` to `/srv/begutachtungs-monitor`,
restart the service, smoke-check that it answers on localhost.

## Notes

- The service binds to `127.0.0.1:3000`; only Caddy is reachable from outside
  (ufw allows 22/80/443 only).
- Logs: `ssh root@<SERVER_IP> journalctl -u begutachtungs-monitor -f`
- On the 1 GB pico the local-build + rsync flow is not just the default but
  required — `pnpm build` needs more RAM than the server has. `bootstrap.sh`
  adds a 1 GB swapfile as headroom for the running app.
- Before a public launch: uptime monitoring (architecture.md §12.7 — the
  predecessor died in operation).
