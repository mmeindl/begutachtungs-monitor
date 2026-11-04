/**
 * WHETHER a Land's draft implements EU law — the Länder's counterpart of the
 * Bund's Vorblatt (docs/architecture.md §12.66, Nachtrag 2 of 04.11.2026).
 *
 * PURE MODULE — passages and lines in, a reading out; no Nitro globals,
 * relative imports only. The service (`landEuService.ts`) hands in what the
 * Erläuterungen' reader read (`laender/landExplanationsRead.ts`), the
 * corpus script (`scripts/corpus/euLaender.ts`) the same from its cache.
 *
 * The Länder have no WFA tool, and still most of them answer the question
 * in a place of its own (measured over 489 drafts of GP XXVIII):
 *
 *  1. THE WFA HEADING — the Bund's „Verhältnis zu (den) Rechtsvorschriften
 *     der Europäischen Union", read with the Bund's own reader
 *     (`vorblattEuSection`, `classifyVorblatt`) over the documents' lines:
 *     Steiermark's „Allgemeiner Teil mit wirkungsorientierter
 *     Folgenabschätzung" (36 of 40), Burgenland's and Wien's Vorblatt,
 *     Oberösterreich's fixed section V. Road `vorblatt`.
 *  2. A HEADED EU PASSAGE in the general part — Salzburg's „3.
 *     Übereinstimmung mit dem EU-Recht", „EU-Konformität" (Salzburg,
 *     Niederösterreich), Vorarlberg's „4. EU-Recht", Kärnten's few. One
 *     list for all nine Länder (`LAND_EU_HEADING`), never one per Land: a
 *     Land that changes its template keeps being read. Road
 *     `erlaeuterungen`.
 *
 * Either is a dedicated, headed statement — the Land's Vorblatt in all but
 * name — and decides „whether" with the Vorblatt's weight (rule D1), and,
 * unlike the Bund's D5 road through the prose, may name the act it
 * implements: Oberösterreich's section V lists them („Folgende
 * unionsrechtliche Vorschriften werden unmittelbar durch das vorliegende
 * Landesgesetz umgesetzt: - Richtlinie (EU) 2024/1499 …"). Where neither
 * speaks, the general part's prose decides through
 * `readExplanationsEuSignal`, exactly as the Bund's D5 road, and names no
 * act (Kärnten writes its EU sentence into running text).
 *
 * WHAT IS NO HEADING. Salzburg's Erläuterungen reader takes the Ziffern of
 * a quoted Umsetzungshinweis for numbered headings — „12. Richtlinie (EU)
 * 2024/1233 des Europäischen Parlaments und des Rates", about 25 of them —
 * and Oberösterreich's Natura-2000 Verordnungen head „Europaschutzgebiet".
 * The list matches the whole normalised heading, and a heading that cites
 * an act is none.
 */
import { parseEuActCitations, type EuAct, uniqueActs } from './actCitations'
import { decideEuMarker, type MarkerDecision } from './euMarker'
import { readExplanationsEuSignal, type ExplanationsPassageText, type LawSignal } from './umsetzungshinweis'
import { classifyVorblatt, classifyVorblattSentence, sentencesOf, type VorblattClass } from './vorblatt'

/**
 * The Länder's EU headings, normalised (`normaliseLandHeading`) — every
 * spelling the corpus showed (Länder measurement, 04.11.2026): „Verhältnis
 * zu (den) Rechtsvorschriften der Europäischen Union" (Bgld, OÖ, W), „EU -
 * (EWR-) Konformität" (Bgld), „EU-Konformität" (Sbg, NÖ), „Übereinstimmung
 * mit (dem|den) EU-Recht/Unionsrecht" (Sbg, Ktn), „Vereinbarkeit mit dem
 * Unionsrecht" (Sbg), „EU-Recht" (Vbg) — and the forms of the same idea a
 * Land may yet write: „Unionsrecht", „Europarecht", „Gemeinschaftsrecht",
 * „Verhältnis zum Unionsrecht", „Bezug zum Unionsrecht".
 */
export const LAND_EU_HEADING = new RegExp(`^(?:${[
  String.raw`verhältnis zu (?:den )?rechtsvorschriften der europäischen union`,
  String.raw`verhältnis zum (?:unionsrecht|eu-recht|europarecht|gemeinschaftsrecht)`,
  String.raw`(?:übereinstimmung|vereinbarkeit) mit (?:dem |den )?(?:eu-recht|unionsrecht|europarecht|gemeinschaftsrecht)`,
  String.raw`eu-(?:\(ewr-?\) ?)?konformität`,
  String.raw`bezug zum (?:unionsrecht|eu-recht)`,
  String.raw`eu-recht|unionsrecht|europarecht|gemeinschaftsrecht`,
].join('|')})$`)

/**
 * A heading as the list reads it: its numbering („3.", „III.", „c)", „V.",
 * „B.") off, spaces collapsed, a hyphen's spaces gone („EU - (EWR-)"),
 * the colon off, lower case.
 */
export function normaliseLandHeading(heading: string): string {
  return heading
    .trim()
    .replace(/^(?:(?:[IVXLC]+|\d+(?:\.\d+)*|[A-Za-z])[.)]\s*)+/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*:$/, '')
    .trim()
    .toLowerCase()
}

/** Whether a general-part heading is the Land's EU statement — never one that cites an act. */
export function isLandEuHeading(heading: string | null | undefined): boolean {
  if (!heading) return false
  if (parseEuActCitations(heading).length) return false
  return LAND_EU_HEADING.test(normaliseLandHeading(heading))
}

/** Which road gave the statement. */
export type LandEuRoad = 'vorblatt' | 'erlaeuterungen'

/** The Land's EU statement, read: its text, its class, and where it stood. */
export interface LandEuStatement {
  road: LandEuRoad
  /** The heading as printed, for the `erlaeuterungen` road; null for the WFA heading. */
  heading: string | null
  /** The statement's text, whitespace normalised. */
  sentence: string
  cls: VorblattClass
}

/**
 * The Land's EU statement: the WFA heading in the documents' `lines` first
 * (pages one after the other, as `linesOfPages` gives them), then a headed
 * EU passage of the general part. Null where neither exists — then the
 * prose decides (`decideLandEuMarker`).
 */
export function readLandEuStatement(general: readonly ExplanationsPassageText[], lines: readonly string[] | null): LandEuStatement | null {
  if (lines?.length) {
    const wfa = classifyVorblatt(lines)
    if (wfa.sentence && wfa.cls) return { road: 'vorblatt', heading: null, sentence: wfa.sentence, cls: wfa.cls }
  }
  const passages = general.filter((p) => isLandEuHeading(p.heading))
  const sentence = passages.flatMap((p) => p.text).join(' ').replace(/\s+/g, ' ').trim()
  if (!passages.length || !sentence) return null
  return { road: 'erlaeuterungen', heading: passages[0]!.heading, sentence, cls: classifyVorblattSentence(sentence) }
}

/** The acts a statement names as implemented — acts in another act's title left out. */
export function statementActs(statement: LandEuStatement | null): EuAct[] {
  return statement ? parseEuActCitations(statement.sentence, { implemented: true }) : []
}

/** The fact for a Land's draft, and whether its acts may be named. */
export interface LandMarkerDecision extends MarkerDecision {
  /** False on the prose road (D5): there the Erläuterungen say whether, never which act. */
  actsAllowed: boolean
}

/**
 * The page's decision for a Land: the statement with the Vorblatt's weight
 * where the Land wrote one (D1, D2), the prose of the general part where it
 * did not (D5). `law` is what the draft's law text says.
 *
 * A STATEMENT IN WORDS THE CLASSIFIER DOES NOT KNOW (`freitext`) is not a
 * „no" (04.11.2026). The Bund's Vorblatt prints one of a few fixed
 * sentences, so there an unknown one says nothing; a Land writes its own,
 * and Salzburg's „Die vorgeschlagenen Regelungen dienen der Umsetzung von
 * Unionsrecht" (34443) or „… dient der Durchführung der Verordnung (EU)
 * 2016/2031" are yes in words of their own. Read so, 15 Salzburg drafts
 * lost a fact the general part's prose had given them. So an unknown
 * statement is read with the prose reader (`readExplanationsEuSignal`):
 * first itself — then it still speaks as the headed statement and may name
 * acts —, then the whole general part, by rule D5, naming none. A
 * statement the classifier reads as a no (`frei-nein`, `nicht-eu`) stays
 * one, whatever the prose around it says.
 */
export function decideLandEuMarker(
  statement: LandEuStatement | null,
  general: readonly ExplanationsPassageText[],
  law: { signal: LawSignal | null; acts: readonly EuAct[] },
): LandMarkerDecision {
  if (statement && statement.cls !== 'freitext') {
    const d = decideEuMarker({ vorblatt: [statement.cls], law, explanations: null })
    return { ...d, source: d.source === 'vorblatt' ? statement.road : d.source, actsAllowed: true }
  }
  if (statement) {
    const own = readExplanationsEuSignal([{ heading: statement.heading, text: [statement.sentence] }]).signal
    if (own) {
      const d = decideEuMarker({ vorblatt: [], law, explanations: own })
      return { ...d, source: statement.road, actsAllowed: true }
    }
  }
  const signal = readExplanationsEuSignal(general).signal
  return { ...decideEuMarker({ vorblatt: [], law, explanations: signal }), actsAllowed: false }
}

// ---------------------------------------------------------------------------
// Oberösterreich's Umsetzungshinweis per provision, in the Besonderer Teil
// ---------------------------------------------------------------------------

/** The fixed label: „Umsetzungshinweis:", „Umsetzungshinweise:", „Umsetzungshinweis zu Abs. 4:" — alone on its line, or opening the paragraph. */
const HINWEIS_LABEL = /^Umsetzungshinweise?(?:\s+zu\s+[^:]{1,40})?:\s*/

/** One „Umsetzungshinweis:" of the particular part: the entry it stands in, its text, its acts. */
export interface EntryHinweis {
  heading: string
  text: string
  acts: EuAct[]
}

/**
 * The Umsetzungshinweise of the particular part (04.11.2026). Oberösterreich
 * writes the hint per provision into its Erläuterungen, in a fixed form
 * with the § it concerns: „Zu Art. II Z 11 (§ 14 Abs. 1): Umsetzungshinweis:
 * Durch § 14 Abs. 1 Oö. ADG und § 27 Abs. 1 Oö. GBG 2021 werden Art. 4 der
 * Richtlinie (EU) 2024/1499 sowie der gleichlautende Art. 4 der Richtlinie
 * (EU) 2024/1500 umgesetzt." (ooe-2026-16120) — a labelled statement tied to
 * a provision, so it names acts as the law text's hint does, and not as the
 * prose of the general part (D5). The reader takes the paragraph after the
 * label where the label stands alone, as the Erläuterungen' reader splits
 * it.
 */
export function entryHinweise(particular: readonly { heading: string; text: readonly string[] }[]): EntryHinweis[] {
  const out: EntryHinweis[] = []
  for (const entry of particular) {
    entry.text.forEach((paragraph, i) => {
      if (!HINWEIS_LABEL.test(paragraph)) return
      const rest = paragraph.replace(HINWEIS_LABEL, '').trim()
      const text = (rest || entry.text[i + 1] || '').replace(/\s+/g, ' ').trim()
      const acts = uniqueActs(sentencesOf(text).filter((sentence) => IMPLEMENTING.test(sentence)).map((sentence) => parseEuActCitations(sentence, { implemented: true })))
      if (acts.length) out.push({ heading: entry.heading, text, acts })
    })
  }
  return out
}

/**
 * The sentences of a hint that say what is implemented. A hint also
 * describes what the directives demand, and such a sentence may list other
 * acts as the scope of a measure: „Art. 5 Abs. 2 der Richtlinie (EU)
 * 2024/1499 … sehen vor, dass Gleichbehandlungsstellen befugt sind,
 * Maßnahmen … im Sinn der Richtlinien 79/7/EWG, 2000/43/EG, … und 2010/41/EU
 * durchzuführen" named six directives the draft does not implement, and the
 * one the Land never transposed put a deadline of 2012 on the bar
 * (ooe-2026-16120, 04.11.2026). Only a sentence with the implementing verb
 * names acts: „werden … umgesetzt", „dient der Umsetzung von", „setzt … um",
 * „wird … entsprochen", „Rechnung tragen", „erfüllen die Vorgaben des",
 * „resultiert aus".
 */
const IMPLEMENTING = /umgesetzt|umzusetzen|\bUmsetzung\s+(?:der|des|von|einer)\b|\bsetz(?:t|en)\b[^;]{0,160}?\bum\b|entsprochen|Rechnung\s+(?:zu\s+)?tragen|\bVorgaben\s+(?:des|der|gemäß)(?![\wäöüß])|resultiert\s+aus/
