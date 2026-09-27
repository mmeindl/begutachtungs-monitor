/**
 * What the ressorts call their Erläuterungen and their Textgegenüberstellung
 * — and how much of either our two name rules miss.
 *
 * Both documents are found by name only (`server/utils/ris/risRecord.ts`,
 * `EXPLANATIONS_NAME` and `TEXT_COMPARISON_NAME`), and a name the rule does
 * not match is a document the page does not have: no Allgemeiner Teil, no
 * Gegenüberstellung read from RIS. The first note on the subject counted
 * „EB" once in the corpus. Measured 26.09.2026 it is three forms, not one,
 * and the Gegenüberstellung has the same problem on a larger scale:
 *
 *  1. Decomposed Unicode — „Erläuterungen" with a + U+0308. Looks identical,
 *     matches nothing.
 *  2. The abbreviation — „EB", „EBs", „Erl", „Erl.", „Erläut",
 *     „Erläuternde Bemerkungen"; mostly between underscores, where `\b`
 *     does not fire because `_` is a word character.
 *  3. „TGÜ" in the middle of a name — „TGÜ Anpassung QJF-G",
 *     „42. KFG-Nov.TGÜ.11.05.2026", „IFG-TGÜ (2025-05-07)". The shipped rule
 *     anchors the abbreviation at the end or after an underscore.
 *
 * The widened patterns below are the PROBE, not a proposal for the shipped
 * rule: they are loose on purpose, to show what exists. The shipped rule is
 * what the site sees, and that is the first column.
 *
 *     pnpm corpus:dokument-namen                 # all periods
 *     pnpm corpus:dokument-namen -- --list XXVIII  # plus every miss of one GP
 *
 * Periods are cut by `beginn` (start of the Begutachtungsfrist); the windows
 * are the constitutive sessions of the Nationalrat and are stated here because
 * nothing in the code needs them otherwise.
 *
 * Reads only: one pass over the RIS corpus, nothing written.
 */
import { classifyRisRecord } from '../../server/utils/ris/risJoin'
import type { RisBegutFlat } from '../../server/utils/ris/risRecord'
import { argPair } from '../lib/args'
import { fetchRisBegutCorpus } from '../lib/corpus'

const listGp = argPair('list')?.toUpperCase() ?? null

const PERIODS: readonly [gp: string, from: string, to: string][] = [
  ['XXIII', '2006-10-30', '2008-10-27'],
  ['XXIV', '2008-10-28', '2013-10-28'],
  ['XXV', '2013-10-29', '2017-11-08'],
  ['XXVI', '2017-11-09', '2019-10-22'],
  ['XXVII', '2019-10-23', '2024-10-23'],
  ['XXVIII', '2024-10-24', '9999-12-31'],
]

/** The shipped rules, copied for the NFC column only — the first column reads `flattenRisRecord`'s own answer. */
const SHIPPED_ERL = /erl(ä|ae|a)uterung/i
const SHIPPED_TGU = /gegen.?über|(^|_)TG(Ü|G|UE)$/i

/** Probes. A letter on either side ends the token; an underscore, digit, dot or space does not. */
const NOT_LETTER = '[^A-Za-zÄÖÜäöüß]'
const EB = new RegExp(`(^|${NOT_LETTER})EBs?($|${NOT_LETTER})`)
const ERL = new RegExp(`erl(ä|ae|a)ut|(^|${NOT_LETTER})erl($|[^a-zäöüe])|begerl|Erl(?=\\d)`, 'i')
const MATERIALIEN = /materiali|begmat|^material$/i
const TGU = new RegExp(`(^|${NOT_LETTER})(TG(Ü|G|UE|Ue)|TxtGGÜ|TxTGGÜ|TxtGG|TGGÜ)($|${NOT_LETTER})|gegen.?(ü|ue)ber`, 'i')

const nfc = (s: string) => s.normalize('NFC')
const namesOf = (r: RisBegutFlat) => r.otherDocuments.map((d) => nfc(d.name))

type ErlBucket = 'rule' | 'nfd' | 'eb' | 'erl' | 'materialien' | 'none'
function erlBucket(r: RisBegutFlat): ErlBucket {
  if (r.explanations) return 'rule'
  const names = namesOf(r)
  if (names.some((n) => SHIPPED_ERL.test(n))) return 'nfd'
  if (names.some((n) => EB.test(n))) return 'eb'
  if (names.some((n) => ERL.test(n))) return 'erl'
  if (names.some((n) => MATERIALIEN.test(n))) return 'materialien'
  return 'none'
}

type TguBucket = 'rule' | 'nfd' | 'token' | 'none'
function tguBucket(r: RisBegutFlat): TguBucket {
  if (r.textComparison) return 'rule'
  const names = namesOf(r)
  if (names.some((n) => SHIPPED_TGU.test(n))) return 'nfd'
  if (names.some((n) => TGU.test(n))) return 'token'
  return 'none'
}

const { hits, records } = await fetchRisBegutCorpus('corpus/dokument-namen')
console.log(`RIS Begut: ${records.length} Sätze (API meldet ${hits})`)
console.log(`Namen nicht in NFC: ${records.flatMap((r) => r.otherDocuments).filter((d) => d.name !== nfc(d.name)).length}\n`)

const pad = (s: string | number, n: number) => String(s).padStart(n)
console.log('Erläuterungen   GP      Klasse       Sätze  Regel  +NFC   +EB  +Erl  Materialien  nichts')
for (const [gp, from, to] of PERIODS) {
  for (const cls of ['gesetz', 'verordnung'] as const) {
    const inGp = records.filter((r) => r.beginn && r.beginn >= from && r.beginn <= to && classifyRisRecord(r) === cls)
    const n = (b: ErlBucket) => inGp.filter((r) => erlBucket(r) === b).length
    console.log(`                ${gp.padEnd(7)} ${cls.padEnd(11)} ${pad(inGp.length, 6)} ${pad(n('rule'), 6)} ${pad(n('nfd'), 5)} ${pad(n('eb'), 5)} ${pad(n('erl'), 5)} ${pad(n('materialien'), 12)} ${pad(n('none'), 7)}`)
  }
}

console.log('\nTextgegenüberstellung (nur Gesetze)   GP      Sätze  Regel  +NFC  +Token  nichts')
for (const [gp, from, to] of PERIODS) {
  const inGp = records.filter((r) => r.beginn && r.beginn >= from && r.beginn <= to && classifyRisRecord(r) === 'gesetz')
  const n = (b: TguBucket) => inGp.filter((r) => tguBucket(r) === b).length
  console.log(`                                      ${gp.padEnd(7)} ${pad(inGp.length, 5)} ${pad(n('rule'), 6)} ${pad(n('nfd'), 5)} ${pad(n('token'), 7)} ${pad(n('none'), 7)}`)
}

if (listGp) {
  const period = PERIODS.find(([gp]) => gp === listGp)
  if (!period) {
    console.error(`--list: unbekannte GP ${listGp}`)
    process.exit(1)
  }
  const [, from, to] = period
  const inGp = records.filter((r) => r.beginn && r.beginn >= from && r.beginn <= to)
  console.log(`\nVerfehlt in ${listGp}:`)
  for (const r of inGp) {
    const e = erlBucket(r)
    const t = classifyRisRecord(r) === 'gesetz' ? tguBucket(r) : 'rule'
    if (e === 'rule' && t === 'rule') continue
    console.log(`  ${r.beginn} ${r.id}  erl=${e} tgü=${t}  ${JSON.stringify(namesOf(r)).slice(0, 150)}`)
  }
}
