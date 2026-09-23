import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every name a `<template>` uses has to be in scope at RUNTIME.
 *
 * `vue-tsc` does not answer that question. It reads `.nuxt/components.d.ts`
 * and `.nuxt/imports.d.ts` as ambient declarations and is happy; what the
 * browser gets is a render function in which an unbound name compiles to
 * `_ctx.name` and renders as nothing — or, for a helper called in a
 * mustache, as a 500 on a page whose typecheck was green. That happened
 * twice while helpers were being moved out of components, both times with
 * `pnpm typecheck` passing, and neither time did a test say a word: nothing
 * in this suite reads a `.vue` file at all.
 *
 * So this is a source scan, in the shape of `cacheLayers.test.ts`: read the
 * templates, take the identifiers out of the expressions, and require each
 * one to resolve to something. The resolvable set is deliberately the
 * shipped one, read from the files `nuxt prepare` writes rather than
 * guessed — `.nuxt/imports.d.ts` and `.nuxt/components.d.ts` ARE the
 * auto-import surface, so a name absent from both and from the file's own
 * `<script setup>` is by construction a name nothing defines.
 *
 * WHAT IT DOES NOT CATCH, stated so the green is read correctly:
 *
 *  - Scope is per FILE, not per element. A `v-for` alias and a slot prop
 *    count as defined everywhere in their template, so a name used outside
 *    the block that binds it passes here.
 *  - An identifier immediately followed by `:` after a `{` or a `,` is read
 *    as an object key and skipped. A ternary whose then-branch is a bare
 *    identifier inside an object literal is therefore not checked.
 *  - An arrow function's parameters count as bound for the WHOLE expression
 *    they stand in, not only inside their own body.
 *  - `.nuxt/` has to exist (`pnpm exec nuxt prepare`; CI gets it from
 *    `postinstall`). Without it the auto-import surface would be empty and
 *    every second name would look like a bug, so the parse guards below
 *    fail loudly instead.
 *  - It says nothing about TYPES, and nothing about whether the value a name
 *    resolves to is the right one.
 */

const ROOT = join(import.meta.dirname, '..')
const APP = join(ROOT, 'app')
const NUXT = join(ROOT, '.nuxt')

/** Every `.vue` file under app/, at any depth — pages, layouts, components, app.vue. */
function vueFiles(): string[] {
  return readdirSync(APP, { encoding: 'utf8', recursive: true }).filter((f) => f.endsWith('.vue'))
}

/** The same walk written by hand — the second opinion for the test below. */
function walkVue(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...walkVue(join(dir, entry.name), join(prefix, entry.name)))
    else if (entry.name.endsWith('.vue')) out.push(join(prefix, entry.name))
  }
  return out
}

/**
 * What Nuxt auto-registers as a component — read, not reconstructed.
 *
 * `nuxt.config.ts` sets `pathPrefix: false`, so a component registers under
 * its plain file name and the folder is invisible; rebuilding that rule here
 * would be a second implementation of it that can drift. The generated file
 * already holds the answer, for our own components and for the ones
 * `@nuxt/ui` and Nuxt itself bring (`UButton`, `NuxtLink`, `ClientOnly`).
 */
function autoComponents(): Set<string> {
  const src = readFileSync(join(NUXT, 'components.d.ts'), 'utf8')
  return new Set([...src.matchAll(/^export const (\w+)\b/gm)].map((m) => m[1]!))
}

/** What Nuxt auto-imports as a value: `app/utils`, `app/composables`, `shared/utils`, Vue, Nitro. */
function autoImports(): Set<string> {
  const src = readFileSync(join(NUXT, 'imports.d.ts'), 'utf8')
  const out = new Set<string>()
  for (const m of src.matchAll(/^export \{([^}]*)\}/gm)) {
    for (const part of m[1]!.split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).at(-1)?.trim()
      if (name) out.add(name)
    }
  }
  return out
}

/**
 * Names that are in scope in any template without anybody declaring them:
 * JS globals, Vue's instance properties, and the event a handler is handed.
 * Vue and Nuxt components are NOT here — those come out of
 * `components.d.ts`, where they can change without this list being edited.
 */
const GLOBALS = new Set([
  'Array', 'Boolean', 'Date', 'Error', 'Infinity', 'Intl', 'JSON', 'Map', 'Math', 'NaN', 'Number',
  'Object', 'Promise', 'RegExp', 'Set', 'String', 'URL', 'decodeURIComponent', 'encodeURIComponent',
  'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'console', 'document', 'globalThis', 'window',
  '$attrs', '$el', '$emit', '$event', '$props', '$refs', '$slots',
])

/** Reserved words the tokenizer will hand back; none of them is a binding. */
const KEYWORDS = new Set([
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'delete',
  'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in',
  'instanceof', 'let', 'new', 'null', 'of', 'return', 'super', 'switch', 'this', 'throw', 'true',
  'try', 'typeof', 'undefined', 'var', 'void', 'while', 'yield',
])

/**
 * The SFC's own `<template>`, by the one shape every file in this tree has:
 * the tag on its own line in column 0. Nested `<template v-if>` blocks are
 * indented and stay inside. A file that breaks that shape fails the guard
 * below rather than being scanned wrongly.
 */
function templateBlock(src: string): string | null {
  const open = /^<template>$/m.exec(src)
  const close = src.lastIndexOf('\n</template>')
  if (!open || close <= open.index) return null
  return src.slice(open.index + open[0].length, close)
}

/** `<script setup>`'s body — where a name may be declared for the template. */
function scriptBlock(src: string): string {
  const m = /<script setup[^>]*>([\s\S]*)<\/script>/.exec(src)
  return m?.[1] ?? ''
}

/** Everything `<script setup>` puts into the template's scope. */
function scriptBindings(script: string): Set<string> {
  const out = new Set<string>()
  const add = (name: string | undefined) => {
    const n = name?.trim().replace(/^\.\.\./, '').split('=')[0]?.trim()
    if (n && /^[A-Za-z_$][\w$]*$/.test(n)) out.add(n)
  }

  // Value imports only. `import type { X }` declares nothing at runtime, and
  // a template that used X would be exactly the bug this file looks for.
  for (const m of script.matchAll(/import\s+([^'"]*?)\s*from\s*['"]/g)) {
    const clause = m[1]!
    if (/^type\b/.test(clause)) continue
    const braces = /\{([\s\S]*)\}/.exec(clause)
    for (const part of braces?.[1]?.split(',') ?? []) {
      if (/^\s*type\s/.test(part)) continue
      add(part.split(/\s+as\s+/).at(-1))
    }
    const bare = clause.replace(/\{[\s\S]*\}/, '').replace(/\*\s+as\s+/, '').split(',')
    for (const part of bare) add(part)
  }

  for (const m of script.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) add(m[1])
  for (const m of script.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) add(m[1])
  // Destructured declarations, both shapes: `const { a, b: c } = …`, `const [a] = …`.
  for (const m of script.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1]!.split(',')) add(part.split(':').at(-1))
  }
  for (const m of script.matchAll(/\b(?:const|let|var)\s*\[([^\]]*)\]\s*=/g)) {
    for (const part of m[1]!.split(',')) add(part)
  }

  /* Props are in the template's scope by NAME, without `props.` in front —
   * so the keys of the type argument are bindings. Nested object types
   * contribute their keys too; that is over-permissive and deliberate, the
   * cheap direction for a scan that must not cry wolf. */
  for (const m of script.matchAll(/defineProps\s*<([\s\S]*?)>\s*\(/g)) {
    for (const k of m[1]!.matchAll(/([A-Za-z_$][\w$]*)\??\s*:/g)) add(k[1])
  }
  for (const m of script.matchAll(/defineProps\s*\(\s*\{([\s\S]*?)\}\s*\)/g)) {
    for (const k of m[1]!.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) add(k[1])
  }
  return out
}

/** One expression the template evaluates, with the attribute it came from. */
interface Expr {
  text: string
  /** `v-for` and `v-slot` bind names instead of only reading them. */
  binds: 'for' | 'slot' | null
}

const HTML_COMMENT = /<!--[\s\S]*?-->/g
/** An attribute whose value Vue compiles as JavaScript: `:x`, `@x`, `v-x`, `#slot`. */
const BOUND_ATTR = /(?:^|\s)((?::|@|v-|#)[A-Za-z0-9_.:[\]-]*)="([^"]*)"/g
const MUSTACHE = /\{\{([\s\S]*?)\}\}/g

function expressions(template: string): Expr[] {
  const body = template.replace(HTML_COMMENT, '')
  const out: Expr[] = []
  for (const m of body.matchAll(MUSTACHE)) out.push({ text: m[1]!, binds: null })
  for (const m of body.matchAll(BOUND_ATTR)) {
    const name = m[1]!
    const binds = name.startsWith('v-for') ? 'for' : name.startsWith('v-slot') || name.startsWith('#') ? 'slot' : null
    out.push({ text: m[2]!, binds })
  }
  return out
}

/** The components a template mounts, by their PascalCase tag. */
function componentTags(template: string): string[] {
  return [...template.replace(HTML_COMMENT, '').matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]!)
}

/**
 * A binding list — `{ org, row }`, `(item, i)`, `slotProps` — flattened to
 * the names it introduces. `{ a: b }` binds `b`, `a = 1` binds `a`.
 */
function boundNames(pattern: string): string[] {
  return pattern
    .replace(/[{}[\]()]/g, ' ')
    .split(',')
    .map((p) => p.split(':').at(-1)!.split('=')[0]!.replace(/\.\.\./, '').trim())
    .filter((n) => /^[A-Za-z_$][\w$]*$/.test(n))
}

/**
 * The identifiers an expression READS — free variables, as near as a
 * tokenizer gets: string literals dropped, property accesses dropped
 * (`a.b` reads `a` only), object keys dropped, keywords dropped, and the
 * parameters of an arrow function inside the expression dropped, because
 * `list.map((m) => m.name)` binds `m` itself.
 */
function identifiers(expr: string): string[] {
  const code = expr
    .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, ' ')
    .replace(/\?\.|\./g, '.')
    .replace(/\.\s*[A-Za-z_$][\w$]*/g, ' ')
    .replace(/([{,]\s*)[A-Za-z_$][\w$]*(\s*:)/g, '$1$2')
  const local = new Set<string>()
  for (const m of code.matchAll(/(?:\(([^()]*)\)|([A-Za-z_$][\w$]*))\s*=>/g)) {
    for (const n of boundNames(m[1] ?? m[2] ?? '')) local.add(n)
  }
  return [...code.matchAll(/[A-Za-z_$][\w$]*/g)]
    .map((m) => m[0]!)
    .filter((n) => !KEYWORDS.has(n) && !local.has(n))
}

/** `(item, i) in list` / `({ org }, i) in rows` → what it binds, and the list it reads. */
function forParts(expr: string): { aliases: string[]; source: string } {
  const m = /^([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)$/.exec(expr.trim())
  if (!m) return { aliases: [], source: expr }
  return { aliases: boundNames(m[1]!), source: m[2]! }
}

/** `{ entry }` or `slotProps` → the names the slot puts in scope. */
function slotAliases(expr: string): string[] {
  return boundNames(expr)
}

interface Unresolved {
  file: string
  name: string
  where: string
}

function scan(): { unresolved: Unresolved[]; checked: number; templates: number } {
  const components = autoComponents()
  const imports = autoImports()
  const unresolved: Unresolved[] = []
  let checked = 0
  let templates = 0

  for (const file of vueFiles()) {
    const src = readFileSync(join(APP, file), 'utf8')
    const template = templateBlock(src)
    if (template === null) continue
    templates++

    const scope = scriptBindings(scriptBlock(src))
    const exprs = expressions(template)
    // Pass one: collect what `v-for` and `v-slot` bind, file-wide.
    for (const e of exprs) {
      if (e.binds === 'for') for (const a of forParts(e.text).aliases) scope.add(a)
      if (e.binds === 'slot') for (const a of slotAliases(e.text)) scope.add(a)
    }

    const known = (name: string) =>
      scope.has(name) || GLOBALS.has(name) || imports.has(name) || components.has(name)

    for (const e of exprs) {
      if (e.binds === 'slot') continue
      const text = e.binds === 'for' ? forParts(e.text).source : e.text
      for (const name of identifiers(text)) {
        checked++
        if (!known(name)) unresolved.push({ file, name, where: e.text.trim().slice(0, 60) })
      }
    }
    for (const tag of componentTags(template)) {
      checked++
      if (!known(tag)) unresolved.push({ file, name: tag, where: `<${tag}>` })
    }
  }
  return { unresolved, checked, templates }
}

describe('template identifiers', () => {
  const result = scan()

  it('reads every .vue file under app/, subfolders included', () => {
    expect(vueFiles().sort()).toEqual(walkVue(APP).sort())
    expect(vueFiles().length).toBeGreaterThan(40)
  })

  it('finds a top-level template in every one of them', () => {
    // The block is located by `<template>` in column 0. A file that formats
    // it differently would silently be skipped, and this scan would shrink
    // without anyone noticing — the failure mode a source scan has to be
    // guarded against.
    expect(result.templates).toBe(vueFiles().length)
  })

  it('reads the generated auto-import surface', () => {
    // Without `.nuxt/` both sets are empty and every auto-imported name
    // reads as a bug. `pnpm exec nuxt prepare` writes them; CI gets them
    // from `postinstall`.
    expect(autoComponents().size).toBeGreaterThan(100)
    expect(autoImports().size).toBeGreaterThan(100)
    // The two names the whole file hangs on: one of ours, one of Nuxt's.
    expect(autoImports().has('formatNumberDe')).toBe(true)
    expect(autoComponents().has('NuxtLink')).toBe(true)
  })

  it('looks at enough identifiers to be a test of something', () => {
    // A guard on the guard: a regex that stops matching would leave this
    // file green and empty.
    expect(result.checked).toBeGreaterThan(1_000)
  })

  it('resolves every name a template uses', () => {
    expect(
      result.unresolved.map((u) => `${u.file}: ${u.name}  (in ${u.where})`),
      'A `<template>` uses a name that nothing puts in scope: it is not ' +
      'declared or imported in `<script setup>`, not a prop, not a `v-for` ' +
      'or slot alias, not a component under app/components, and not in the ' +
      'auto-import surface `nuxt prepare` writes. `vue-tsc` accepts it; the ' +
      'browser renders `_ctx.<name>` — nothing, or a 500 where it is called. ' +
      'Import it explicitly in `<script setup>`.',
    ).toEqual([])
  })
})
