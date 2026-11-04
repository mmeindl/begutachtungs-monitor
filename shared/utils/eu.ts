/**
 * The monitor's address of an EU act (docs/architecture.md §12.66,
 * Nachtrag 3): `/eu-recht/richtlinie/2024/1069` — the act's kind, year and
 * number as its citation reads, not its CELEX. Year and number alone would
 * not do: before 2015 a directive and a regulation could share both
 * („Richtlinie 2009/43/EG", „Verordnung (EG) Nr. 43/2009"), so the kind
 * stands in the path, as it does in EUR-Lex's ELI (`dir`, `reg`, `dec`).
 *
 * Pure module: auto-imported in `app/`, imported relatively by vitest.
 */

/** The path words, one per kind — the German nouns, lower case, as the site names things. */
export const EU_ACT_PATH_WORD: Record<'richtlinie' | 'verordnung' | 'beschluss' | 'rahmenbeschluss', string> = {
  richtlinie: 'richtlinie',
  verordnung: 'verordnung',
  beschluss: 'beschluss',
  rahmenbeschluss: 'rahmenbeschluss',
}

const CELEX_LETTER: Record<string, keyof typeof EU_ACT_PATH_WORD> = { L: 'richtlinie', R: 'verordnung', D: 'beschluss', F: 'rahmenbeschluss' }
const CELEX_RE = /^3(\d{4})([LRDF])(\d{4})$/

/** `/eu-recht/richtlinie/2024/1069` from `32024L1069`; null for anything that is no CELEX of an act. */
export function euActPath(celex: string): string | null {
  const m = CELEX_RE.exec(celex)
  if (!m) return null
  const kind = CELEX_LETTER[m[2]!]
  if (!kind) return null
  return `/eu-recht/${EU_ACT_PATH_WORD[kind]}/${m[1]}/${Number(m[3])}`
}

/** `32024L1069` from the three path segments; null for a path that names no act. */
export function euActCelex(kind: string, year: string, number: string): string | null {
  const letter = (Object.entries(CELEX_LETTER).find(([, k]) => EU_ACT_PATH_WORD[k] === kind) ?? [])[0]
  if (!letter || !/^\d{4}$/.test(year) || !/^[1-9]\d{0,3}$/.test(number)) return null
  return `3${year}${letter}${number.padStart(4, '0')}`
}
