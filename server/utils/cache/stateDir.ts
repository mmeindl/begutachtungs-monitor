/**
 * Where the app keeps what must outlive a restart — one directory per kind
 * of thing below it.
 *
 * Resolved AT RUNTIME, on every call: the build runs on a laptop and the
 * server elsewhere, so nothing here may be decided when `nuxt.config.ts` is
 * evaluated. The order and the reasons are `parliament/lastgood.ts`'s, which
 * keeps its own copy:
 *
 *  1. `BM_STATE_DIR` — explicit override (tests, unusual deployments);
 *  2. `STATE_DIRECTORY` — set by systemd from `StateDirectory=` in the unit
 *     (`deploy/bootstrap.sh`) → `/var/lib/begutachtungs-monitor`, outside
 *     the app directory that every deploy rsyncs with `--delete`;
 *  3. `./.data` — dev, a local `node .output/server/index.mjs`, the CI smoke
 *     test (gitignored).
 *
 * Pure module, only node: builtins — vitest runs it as it is, and Nitro
 * bundles it behind the storage driver that imports it.
 */
import { join } from 'node:path'

export function stateDir(subdir: string): string {
  const explicit = process.env.BM_STATE_DIR?.trim()
  if (explicit) return join(explicit, subdir)
  // systemd hands over a colon-separated list; ours is the first entry.
  const systemd = process.env.STATE_DIRECTORY?.split(':')[0]?.trim()
  if (systemd) return join(systemd, subdir)
  return join(process.cwd(), '.data', subdir)
}
