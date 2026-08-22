/**
 * Dev-only (loaded via NODE_OPTIONS in the dev script):
 * @nuxt/cli calls fs.watch({recursive:true}) without error handling.
 * On macOS that means FSEvents — and when other processes (parallel dev
 * servers, vitest watchers, the IDE) have exhausted the machine's FSEvents
 * capacity, `nuxt dev` dies on startup with EMFILE.
 *
 * This shim degrades EMFILE/ENOSPC to a one-time warning and a silent
 * watcher. All that is lost is the auto-restart on nuxt.config changes;
 * HMR for app code keeps running normally via the polling watchers
 * (CHOKIDAR_USEPOLLING + vite.server.watch.usePolling).
 */
'use strict'
const fs = require('fs')
const { EventEmitter } = require('events')

const origWatch = fs.watch
let warned = false

function warnOnce(path) {
  if (warned) return
  warned = true
  // eslint-disable-next-line no-console
  console.warn(
    `\n[dev-watch-fallback] fs.watch for ${path} unavailable (EMFILE: the machine's FSEvents capacity is exhausted).\n` +
      '[dev-watch-fallback] File watching for this path is disabled — after changes to nuxt.config, restart manually.\n' +
      '[dev-watch-fallback] Permanent remedy: stop or restart other dev servers/vitest watchers (or reboot).\n',
  )
}

function dummyWatcher() {
  const w = new EventEmitter()
  w.close = () => {}
  w.ref = () => w
  w.unref = () => w
  return w
}

fs.watch = function patchedWatch(path, ...args) {
  let watcher
  try {
    watcher = origWatch.call(this, path, ...args)
  } catch (err) {
    if (err && (err.code === 'EMFILE' || err.code === 'ENOSPC')) {
      warnOnce(String(path))
      return dummyWatcher()
    }
    throw err
  }
  // An error listener prevents the uncaught crash; EMFILE is swallowed,
  // everything else is reported loudly (behavior otherwise unchanged).
  watcher.on('error', (err) => {
    if (err && (err.code === 'EMFILE' || err.code === 'ENOSPC')) {
      warnOnce(String(path))
      try {
        watcher.close()
      } catch {
        /* already closed */
      }
      return
    }
    // eslint-disable-next-line no-console
    console.error('[dev-watch-fallback] watcher error:', err)
  })
  return watcher
}
