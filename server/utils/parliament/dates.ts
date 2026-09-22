/**
 * The three date shapes the Parliament API sends: the German display date,
 * the ISO timestamp of the sort columns, and list 81's numeric "Fristsort".
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports,
 * so vitest can execute the module directly.
 */

/** Date parts (regex groups) → "yyyy-mm-dd" with a (loose) range check, else null. */
function toIsoDate(year?: string, month?: string, day?: string): string | null {
  if (!year || !month || !day) return null
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null
  return `${year}-${month}-${day}`
}

/** "dd.mm.yyyy" → "yyyy-mm-dd", else null. */
export function parseGermanDate(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim())
  if (!m) return null
  const [, day, month, year] = m
  return toIsoDate(year, month, day)
}

/** ISO timestamp/date ("2026-08-03T00:00:00") → "2026-08-03", else null. */
export function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  return m?.[1] ?? null
}

/**
 * List-81 "Fristsort" (yyyymmdd as number OR string) → ISO date.
 * Empty/0/invalid → null (deadlines are optional upstream).
 */
export function parseFristsort(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const s = typeof value === 'number' ? String(value) : value.trim()
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s)
  if (!m) return null
  const [, year, month, day] = m
  return toIsoDate(year, month, day)
}
