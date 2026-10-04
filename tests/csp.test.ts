import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildCsp,
  inlineExecutableScripts,
  isExecutableScriptType,
  sha256Source,
} from '../server/utils/http/csp'

describe('isExecutableScriptType', () => {
  it('treats classic, module, import map and speculation rules as executable', () => {
    for (const t of [undefined, '', 'module', 'importmap', 'speculationrules', 'text/javascript', ' Application/JavaScript ']) {
      expect(isExecutableScriptType(t)).toBe(true)
    }
  })
  it('treats data blocks as inert', () => {
    for (const t of ['application/json', 'application/ld+json', 'text/template']) {
      expect(isExecutableScriptType(t)).toBe(false)
    }
  })
})

describe('inlineExecutableScripts', () => {
  // The shapes Nuxt 4 renders, as measured on a production build.
  const head = '<script type="importmap">{"imports":{"#entry":"/_nuxt/A.js"}}</script>' +
    '<script type="module" src="/_nuxt/A.js" crossorigin></script>' +
    '<script type="application/ld+json">{"@type":"WebSite"}</script>'
  const bodyAppend = '<script>window.__NUXT__={};window.__NUXT__.config={}</script>' +
    '<script type="application/json" data-nuxt-data="nuxt-app" id="__NUXT_DATA__">[1]</script>'

  it('picks the inline executable scripts and skips src and data blocks', () => {
    expect(inlineExecutableScripts(head + bodyAppend)).toEqual([
      '{"imports":{"#entry":"/_nuxt/A.js"}}',
      'window.__NUXT__={};window.__NUXT__.config={}',
    ])
  })
  it('reads unquoted and single-quoted attributes', () => {
    expect(inlineExecutableScripts(`<script type=module>a()</script><script src='/x.js'></script>`)).toEqual(['a()'])
  })
  it('returns the text verbatim, whitespace included', () => {
    expect(inlineExecutableScripts('<script>\n  a()\n</script >')).toEqual(['\n  a()\n'])
  })
})

describe('sha256Source', () => {
  it('hashes the UTF-8 bytes, as the browser does', () => {
    const text = 'window.x="Begutachtung – §"'
    const expected = createHash('sha256').update(Buffer.from(text, 'utf8')).digest('base64')
    expect(sha256Source(text)).toBe(`'sha256-${expected}'`)
  })
})

describe('buildCsp', () => {
  it('admits exactly the given scripts, once each, and keeps frame-ancestors', () => {
    const policy = buildCsp(['a()', 'a()', 'b()'])
    const scriptSrc = policy.split('; ').find((d) => d.startsWith('script-src '))!
    expect(scriptSrc).toBe(`script-src 'self' ${sha256Source('a()')} ${sha256Source('b()')}`)
    expect(policy).toContain(`frame-ancestors 'none'`)
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/)
  })
  it('is script-src self alone without inline scripts', () => {
    expect(buildCsp([])).toContain(`script-src 'self'; `)
  })
})
