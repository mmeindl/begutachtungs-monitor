#!/usr/bin/env node
// Screenshot a page at true desktop and phone widths with the installed
// Google Chrome, over the DevTools protocol, and report horizontal overflow.
//
//   node shot.mjs <url> <outdir> [--widths=1280,390] [--selector=<css>] [--full]
//
// Why CDP and not `chrome --screenshot`: the window has a minimum width of
// about 500 px, so a "390 px" shot from the command line is a crop of a
// 500 px layout. Emulation.setDeviceMetricsOverride has no floor. And Chrome
// writes the PNG but does not exit, which this script handles by killing it.
//
// No dependencies: Node's built-in WebSocket and fetch. Nothing is installed.
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const [url, outdir, ...rest] = process.argv.slice(2)
if (!url || !outdir) {
  console.error('usage: node shot.mjs <url> <outdir> [--widths=1280,390] [--selector=<css>] [--full]')
  process.exit(2)
}
const opt = Object.fromEntries(rest.map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=')
  return [k, v ?? true]
}))
const widths = String(opt.widths ?? '1280,390').split(',').map(Number)
const port = 9400 + Math.floor(Math.random() * 500)
const profile = mkdtempSync(join(tmpdir(), 'shot-'))
mkdirSync(outdir, { recursive: true })

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' })
const cleanup = () => {
  chrome.kill('SIGKILL')
  // Chrome may still be writing its profile as it dies; a leftover temp dir is harmless.
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch {}
}
process.on('exit', cleanup)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    target = list.find((t) => t.type === 'page')
  } catch { /* Chrome not up yet */ }
}
if (!target) { console.error('Chrome did not open a debugging port'); process.exit(1) }

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let id = 0
const pending = new Map()
const listeners = new Set()
const errors = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text)
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
    errors.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`)
  }
  for (const l of listeners) l(m)
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id
  pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)))
  ws.send(JSON.stringify({ id: n, method, params }))
})
const once = (method, ms = 30000) => new Promise((resolve) => {
  const t = setTimeout(() => { listeners.delete(l); resolve(false) }, ms)
  const l = (m) => { if (m.method === method) { clearTimeout(t); listeners.delete(l); resolve(true) } }
  listeners.add(l)
})

await send('Page.enable')
await send('Runtime.enable')
const report = []
for (const width of widths) {
  const mobile = width < 768
  await send('Emulation.setDeviceMetricsOverride', { width, height: mobile ? 844 : 900, deviceScaleFactor: 2, mobile })
  const loaded = once('Page.loadEventFired')
  await send('Page.navigate', { url })
  await loaded
  await sleep(1500) // hydration and async lists
  // The dev server's floating Nuxt DevTools pill would cover content.
  await send('Runtime.evaluate', { expression: `document.querySelectorAll('#nuxt-devtools-container, nuxt-devtools-frame').forEach((el) => el.remove())` })
  const { result } = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const vw = document.documentElement.clientWidth
      const wide = [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > vw + 1)
        .slice(0, 8)
        .map((el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : ''))
      return { scrollWidth: document.documentElement.scrollWidth, clientWidth: vw, height: document.documentElement.scrollHeight, wide }
    })()`,
  })
  const m = result.value
  let clip
  if (opt.selector) {
    const r = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => { const el = document.querySelector(${JSON.stringify(opt.selector)}); if (!el) return null; el.scrollIntoView(); const b = el.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height } })()`,
    })
    if (r.result.value) clip = { ...r.result.value, scale: 1 }
    else console.error(`selector not found at ${width}px: ${opt.selector}`)
  } else if (opt.full) {
    clip = { x: 0, y: 0, width, height: Math.min(m.height, 12000), scale: 1 }
  }
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: Boolean(clip), ...(clip ? { clip } : {}) })
  const file = join(outdir, `${width}.png`)
  writeFileSync(file, Buffer.from(shot.data, 'base64'))
  const overflow = m.scrollWidth > m.clientWidth
  report.push(`${width}px → ${file}${overflow ? `  OVERFLOW: page ${m.scrollWidth}px wide in a ${m.clientWidth}px viewport; widest: ${m.wide.join(', ')}` : '  no horizontal overflow'}`)
}
console.log(report.join('\n'))
if (errors.length) console.log(`browser errors/warnings (${errors.length}):\n  ${[...new Set(errors)].slice(0, 10).join('\n  ')}`)
ws.close()
process.exit(0)
