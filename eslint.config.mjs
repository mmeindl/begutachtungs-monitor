// @ts-check
// Flat config, built on the one `nuxt prepare` generates in `.nuxt/` — that is
// where the `stylistic` options from `nuxt.config.ts` arrive, together with
// the Vue and TypeScript plugins and the auto-import globals. Nothing
// type-aware is enabled: those rules need a TypeScript program per run, and
// `pnpm typecheck` already answers what they would ask.
//
// Every rule below was chosen by measuring the existing tree, not by taste:
// the count each one would otherwise have flagged stands next to it. The job
// of this linter is to hold the house style that is already there.
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    // Everything generated, vendored, fetched or frozen. `tests/fixtures/`
    // holds recorded upstream documents and the baseline the drift job
    // writes, `data/` a generated join map, `.cache/` and `.harness-cache/`
    // the offline corpora.
    ignores: [
      '.nuxt/**',
      '.output/**',
      '.data/**',
      'node_modules/**',
      'public/**',
      'data/**',
      'tests/fixtures/**',
      '.harness-cache/**',
      '.cache/**',
    ],
  },
  {
    name: 'begut/house-style',
    rules: {
      // Interfaces and type literals: one member per line and no delimiter,
      // `{ gp?: string; inr?: number }` on one line. The default asks for a
      // comma on the single-line form — 315 places say semicolon.
      '@stylistic/member-delimiter-style': ['error', {
        multiline: { delimiter: 'none', requireLast: false },
        singleline: { delimiter: 'semi', requireLast: false },
        multilineDetection: 'brackets',
        overrides: { interface: { multiline: { delimiter: 'none', requireLast: false } } },
      }],
      // Two conventions, both deliberate: an arithmetic or logical operator
      // ends the line it belongs to (`const LINK =`, `` `…` + ``), while the
      // ternary and the type union open the continuation (`? a` / `: b` /
      // `| 'x'`). The default asks for „before" everywhere (192 places), a
      // flat „after" for the other 262.
      '@stylistic/operator-linebreak': ['error', 'after', {
        overrides: { '?': 'before', ':': 'before', '|': 'before' },
      }],
      // Double quotes stay where they spare an escape — `.replace(…, "'")`
      // is the readable form (10 places).
      '@stylistic/quotes': ['error', 'single', { allowTemplateLiterals: 'always', avoidEscape: true }],
      // Quote a key only where the key needs it: the RIS and Parliament query
      // objects mix `Applikation` with `'Fassung.FassungVom'` in one literal.
      // 54 places read that way against 8 label tables that quote every key.
      '@stylistic/quote-props': ['error', 'as-needed'],
      // The one-line guard clause `if (!bgbl) { noClause++; continue }` is
      // house style in the engines and the scripts — 39 places, up to six
      // statements in one harness line. No `max` fits without rewriting them.
      '@stylistic/max-statements-per-line': 'off',
      // Short tags keep their attributes on one line; only a tag that already
      // breaks gets one attribute per line (406 places).
      'vue/max-attributes-per-line': ['warn', { singleline: { max: 99 }, multiline: { max: 1 } }],
      // Both rules insert line breaks *inside* an element, and Vue's
      // `whitespace: 'condense'` turns such a break into a real space in the
      // rendered text — visible inside a link or a badge. This phase changes
      // no rendering, and the templates say the opposite anyway: 196 and 99
      // places keep the content on the tag's line.
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      // Components register by bare file name under `pathPrefix: false`
      // (`nuxt.config.ts`), so the file name is the component name and a
      // one-word `Badge.vue` is a legitimate name here. Flags nothing today.
      'vue/multi-word-component-names': 'off',
      // ~30 `any` in app/server/shared, all at an upstream JSON boundary.
      // Typing them is its own piece of work (refactor-plan §3), so the rule
      // reports and does not block.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
)
