# Deployment

Target: one small EU-owned VPS (settled: **netcup VPS pico G11s**, Nuremberg,
DE — see `docs/architecture.md` §10/§13). The whole production setup is: Node
runs the Nitro bundle as a systemd service, Caddy terminates TLS in front of
it. No database — the only persistent state is the last-good Stellungnahmen
fallback in `/var/lib/begutachtungs-monitor` (systemd `StateDirectory=`,
architecture.md §5 cache rule 4). Nothing there needs backing up: losing it
costs a degraded page until the next successful upstream fetch.

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

That is: refuse a dirty working tree, local `pnpm build`, rsync `.output/` to
`/srv/begutachtungs-monitor` (owned by root, read-only for `app`), install the
units and scripts from `deploy/systemd/` and `deploy/bin/`, restart the
service, smoke-check that it answers on localhost, wait for the prewarm.

The commit that runs is in `/srv/begutachtungs-monitor/REVISION`. To ship
uncommitted changes on purpose, pass `--allow-dirty` — the revision then ends
in `-dirty`.

**When the systemd unit changes** (it did on 2026-08-31: `StateDirectory=`),
`deploy.sh` is not enough — it only ships `.output/`. Re-run the bootstrap,
which is idempotent and rewrites the unit:

```sh
scp deploy/bootstrap.sh root@<SERVER_IP>:
ssh root@<SERVER_IP> 'DOMAIN=begutachtungs-monitor.at bash bootstrap.sh'
```

Until that runs, the app falls back to `/srv/begutachtungs-monitor/.data`
(its working directory) — which works, but `rsync --delete` wipes it on every
deploy. Verify with
`ssh root@<SERVER_IP> ls /var/lib/begutachtungs-monitor/statements`.

## Retrofit 2026-10-04: hardening the live box

The live box was bootstrapped with the script as it was before 2026-10-04.
Only the deploy-side half of that day's hardening arrives with `deploy.sh`
(root-owned code, staged unit install, prewarm units as `app`, the
watchdog's sandbox). The rest lives in `bootstrap.sh` — sshd drop-in with
self-check, Caddy headers and body limit, unattended-upgrades for Node and
Caddy, the sandboxed main unit with `MemoryMax=` — and has to be applied
once. Re-running the bootstrap does that, and it stays the single source of
truth; the steps around it are ordered so that each one fails before it can
lock you out or take the site down. Run them from the repo root:

```sh
S=root@85.235.66.11
```

**0. Keep a second SSH session to the box open** until step 3 has passed.
Reloading sshd does not end existing sessions.

**1. Deploy from a clean tree** — ships the deploy-side half and re-owns
`/srv/begutachtungs-monitor` to root. The app still runs under the old main
unit, so this step tests the ownership change alone. Note the old security
score for comparison:

```sh
SERVER=$S ./deploy/deploy.sh
ssh $S 'cat /srv/begutachtungs-monitor/REVISION
  stat -c "%U:%G %a %n" /srv/begutachtungs-monitor /srv/begutachtungs-monitor/server/index.mjs /etc/systemd/system /usr/local/lib/begutachtungs-monitor/*.sh
  systemctl show -p User --value begutachtungs-monitor-prewarm begutachtungs-monitor-prewarm-pages
  journalctl -u begutachtungs-monitor-prewarm-pages -n 2 --no-pager
  systemd-analyze security begutachtungs-monitor | tail -1'
```

Expect `root:root 755` / `644` / `755` / `755`, `app` twice, and a
`prewarm-pages: … pages warm` line from after the deploy — that one proves
`OnSuccess=` started it.

**2. Back up what the bootstrap overwrites, then re-run it:**

```sh
ssh $S 'cp -a /etc/systemd/system/begutachtungs-monitor.service /root/begutachtungs-monitor.service.bak-2026-10-04
  cp -a /etc/caddy/Caddyfile /root/Caddyfile.bak-2026-10-04'
scp deploy/bootstrap.sh $S:
ssh $S 'DOMAIN=begutachtungs-monitor.at bash bootstrap.sh'
ssh $S 'diff /root/Caddyfile.bak-2026-10-04 /etc/caddy/Caddyfile
  diff /root/begutachtungs-monitor.service.bak-2026-10-04 /etc/systemd/system/begutachtungs-monitor.service'
```

Where it stops on its own: `sshd -t` before the reload, the `sshd -T`
assertion after it (✘ and exit), `caddy validate` before the new Caddyfile
replaces the live one. It writes the new main unit and reloads systemd but
does **not** restart the app — that is step 4. The diffs must show only the
intended changes; anything else was a hand edit on the box that the
bootstrap has just overwritten (the backups have it).

**3. SSH — in a new terminal, before closing the old session:**

```sh
ssh $S true && echo "key login ok"
ssh $S "sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin) '; ls /etc/ssh/sshd_config.d/"
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive $S true
```

Expect `no`, `no`, `permitrootlogin without-password` (sshd's own name for
`prohibit-password`), `00-hardening.conf` without `90-hardening.conf`, and
`Permission denied (publickey)` for the last line.

**4. Restart the app under the hardened unit, and warm it:**

```sh
ssh $S 'systemctl restart begutachtungs-monitor && sleep 3
  systemctl is-active begutachtungs-monitor
  curl -fsS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000/
  systemctl start begutachtungs-monitor-prewarm.service && echo "prewarm ok"'
```

The prewarm is the real test: it makes the app resolve and fetch from
Parliament and RIS under `RestrictAddressFamilies=` and `SystemCallFilter=`.
If anything here fails, read the log and roll back, then take the hardening
lines out one at a time (first suspects: add `AF_NETLINK` to
`RestrictAddressFamilies=`; then `SystemCallFilter=`):

```sh
ssh $S 'journalctl -u begutachtungs-monitor -n 40 --no-pager'
ssh $S 'cp /root/begutachtungs-monitor.service.bak-2026-10-04 /etc/systemd/system/begutachtungs-monitor.service
  systemctl daemon-reload && systemctl restart begutachtungs-monitor'
```

**5. Sandbox, memory, report directory, watchdog:**

```sh
ssh $S 'systemd-analyze security begutachtungs-monitor | tail -1
  systemctl show -p MemoryMax -p MemoryCurrent begutachtungs-monitor
  tr "\0" " " < /proc/$(systemctl show -p MainPID --value begutachtungs-monitor)/cmdline; echo'
ssh $S 'kill -USR2 $(systemctl show -p MainPID --value begutachtungs-monitor); sleep 2
  ls -t /var/lib/begutachtungs-monitor/reports | head -1'
ssh $S 'systemctl start begutachtungs-monitor-watchdog.service
  journalctl -u begutachtungs-monitor-watchdog -n 2 --no-pager'
```

Expect a clearly lower exposure score than in step 1, `MemoryMax=536870912`,
`--max-old-space-size=384` in the command line, a report file from just now
(the state directory is writable under `ProtectSystem=strict`), and a watchdog
line such as `app up …s — not judging` (its unit starts under its sandbox).

**6. Caddy and unattended-upgrades:**

```sh
curl -sI https://begutachtungs-monitor.at/ | grep -iE '^(strict-transport-security|x-content-type-options|referrer-policy|x-frame-options|content-security-policy|server):'
head -c 2000000 /dev/zero | curl -s -o /dev/null -w '%{http_code}\n' --data-binary @- https://begutachtungs-monitor.at/api/drafts
ssh $S 'unattended-upgrade --dry-run --debug 2>&1 | grep -i "allowed origins"'
```

Expect the five headers and no `Server:` line — `content-security-policy`
must be the app's full policy (`default-src 'self'; script-src 'self'
'sha256-…' …`), not the framing-only fallback: the fallback appearing means
Caddy still runs the old Caddyfile or the app is down; `413` for the 2-MB body; the
allowed origins listing `site=deb.nodesource.com,suite=nodistro` and
`site=dl.cloudsmith.io,origin=cloudsmith/caddy/stable` next to Ubuntu's own.
A Node update installed this way takes effect at the app's next restart.

**7. Clean up** once all of the above holds: `ssh $S 'rm bootstrap.sh'`; keep
the two backups in `/root` for a week.

## Notes

- The service binds to `127.0.0.1:3000`; only Caddy is reachable from outside
  (ufw allows 22/80/443 only).
- Logs: `ssh root@<SERVER_IP> journalctl -u begutachtungs-monitor -f`
- On the 1 GB pico the local-build + rsync flow is not just the default but
  required — `pnpm build` needs more RAM than the server has. `bootstrap.sh`
  adds a 1 GB swapfile as headroom for the running app.
- Before a public launch: uptime monitoring (architecture.md §12.7 — the
  predecessor died in operation).
- **The uptime job goes quiet on its own:** GitHub disables a scheduled
  workflow after 60 days without a commit in the repo and mails about it —
  re-enable `uptime.yml` in the Actions tab ([infrastructure.md](infrastructure.md),
  "Uptime: current state").
- **RIS prewarm:** the units in `deploy/systemd/` are installed into
  `/etc/systemd/system/` and enabled on every deploy. The timer curls
  `/api/ris-map/aktuell` nightly at 04:30, and `deploy.sh` **waits for** the
  same oneshot after every restart, so the ~46-request RIS corpus fetch never
  lands on a visitor. That wait is why a deploy takes about a minute longer
  than the restart: the restart empties the in-memory caches, and „✔ deployed"
  is meant to say that the next visitor finds a warm server. Nothing to do by hand; the next deploy installs it.
  Check: `systemctl list-timers begutachtungs-monitor-prewarm.timer`.
  Behind it, and without the deploy waiting (since 30.09.2026): the pages of
  the open drafts are rendered once (`prewarm-pages` unit, ~20–30 pages), so
  their first reader of the day gets ~0,15 s instead of ~1 s. Check:
  `journalctl -u begutachtungs-monitor-prewarm-pages -n 5 --no-pager`.
