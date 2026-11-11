/**
 * The monitor's address of an EU act:
 * `/eu-recht/richtlinie/2024/1069` — the act's kind, year and
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

// Four spellings among the 114 titles read on 05.11.2026: „(… EWR)" 58 times,
// „(… EWR.)" three, „(… EWR. )" once, a bare „… EWR" once.
const EEA_RE = /\s*\(?\s*Text von Bedeutung für den EWR\.?\s*\)?\.?\s*$/
const MONTHS_DE = 'Januar|Jänner|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember'
// `\s` at every gap: EUR-Lex writes a no-break space between day and month
// in most titles („vom 22.\u00a0November 2023"), an ASCII one in the rest.
const DATED_RE = new RegExp(`\\svom\\s\\d{1,2}\\.\\s(?:${MONTHS_DE})\\s\\d{4}\\s`)

/**
 * The official title as a citation carries it: whole, without the trailing
 * „(Text von Bedeutung für den EWR)" — a note on the act's scope, not part
 * of its name, and on 126 of the map's 230 titles (06.11.2026). Null for no
 * title.
 */
export function euActTitle(title: string | null): string | null {
  return title?.trim().replace(EEA_RE, '').trim() || null
}

/**
 * What an act's official title says after its name and date — „über den
 * Schutz von Personen, die sich öffentlich beteiligen, …" from „Richtlinie
 * (EU) 2024/1069 des Europäischen Parlaments und des Rates vom 11. April
 * 2024 über den Schutz …". The first word stays lower case, as the
 * official grammar has it; a trailing „(Text von Bedeutung für den EWR)"
 * goes. Where no „vom <Tag>" stands, the whole title — still right, only
 * longer. Null for no title. Nothing else is touched: the no-break spaces
 * inside stay („Nr.\u00a0909/2014" must not break), and EUR-Lex's own casing
 * stays where it is odd. Never clamped where shown — the Kurzname stands at
 * the END of these titles.
 */
export function euActSubject(title: string | null): string | null {
  if (!title) return null
  const stripped = euActTitle(title) ?? ''
  const m = DATED_RE.exec(stripped)
  const subject = (m ? stripped.slice(m.index + m[0].length) : stripped).trim()
  return subject || null
}
