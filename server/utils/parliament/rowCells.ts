/**
 * Cell coercion for the positional list readers (81, 101, 142): upstream
 * sends the same column as a number in one row and as a string in the next,
 * and a missing cell as null. Every row mapper reads through these two.
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports,
 * so vitest can execute the module directly.
 */

export function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function asNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim())
  return 0
}
