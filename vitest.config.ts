import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // The three Nitro auto-imports `server/utils/http/params.ts` is made of
    // (`tests/helpers/nitroGlobals.ts`). Everything else under test is a
    // pure module and ignores them.
    setupFiles: ['tests/helpers/nitroGlobals.ts'],
  },
  resolve: {
    // Nuxt's alias, for the ONE module that is worth importing across it:
    // request parsing is the Nitro boundary, so `params.ts` cannot be cut
    // pure the way the rest of `server/utils` is. Nothing else in the suite
    // uses it — a new pure module still gets relative imports.
    alias: { '#shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
})
