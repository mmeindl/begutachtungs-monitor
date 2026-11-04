/**
 * Everything a Land's EU fact reads, before EUR-Lex and the law in force
 * are asked — the one decision the page (`landEuService.ts`) and the corpus
 * script (`scripts/corpus/euLaender.ts`) both take (docs/architecture.md
 * §12.66, Nachtrag 2 of 04.11.2026).
 *
 * PURE MODULE — the pages the Erläuterungen' reader read and its answer in;
 * the statement, the decision, the acts and the documents to credit out.
 * No Nitro globals, relative imports only.
 *
 * THE ORDER OF THE ACTS. The statement's own acts first — Oberösterreich's
 * section V, Burgenland's Vorblatt and Steiermark's WFA list the acts THIS
 * draft implements —, then the law text's (its blocks and quoted hint
 * Ziffern, `landGesetzestext.ts`), which restate every act the law ever
 * took in, then Oberösterreich's „Umsetzungshinweis:" per provision
 * (`entryHinweise`). None on the prose road (D5).
 */
import type { EuRechtResponse, LandCode, TraceLink } from '../../../shared/types'
import { baseActCelexes, uniqueActs, type EuAct } from './actCitations'
import { decideLandEuMarker, entryHinweise, readLandEuStatement, statementActs, type EntryHinweis, type LandEuStatement, type LandMarkerDecision } from './landErlaeuterungen'
import { readLandLaw, type LandLawReading } from './landGesetzestext'
import type { ExplanationsPassageText } from './umsetzungshinweis'
import { linesOfPages } from './vorblatt'

/** The Länder that print a Vorblatt before or as their Erläuterungen. */
const VORBLATT_LAENDER: ReadonlySet<LandCode> = new Set(['bgld', 'w'])

/** What the Erläuterungen' reader gave, as far as the EU fact reads it. */
export interface LandEuInput {
  land: LandCode
  /** The draft's documents, by the URL they were read under. */
  documents: readonly { title: string; url: string }[]
  /** Every document read, once each, by URL (`readLandExplanations`). */
  pages: ReadonlyMap<string, readonly string[]>
  /** The Erläuterungen' answer: its general and particular part where available. */
  explanations: { available: boolean; general: readonly ExplanationsPassageText[]; particular: readonly { heading: string; text: readonly string[] }[]; url: string | null }
  /** The draft's own text: its URL and its pages, where read. */
  draft: { url: string | null; pages: readonly string[] | null }
}

/** The statement and the document it stood in. */
export interface FoundStatement {
  statement: LandEuStatement
  url: string | null
  label: 'Vorblatt' | 'Erläuterungen'
}

export interface LandEuReading {
  found: FoundStatement | null
  decision: LandMarkerDecision
  law: LandLawReading
  hinweise: EntryHinweis[]
  /** The acts the fact names, in the order it names them. */
  named: EuAct[]
  actsSource: EuRechtResponse['actsSource']
  /** D4a: CELEX numbers named as the base of an amending act. */
  base: Set<string>
  /** The documents read for what the fact says, for the credit line. */
  sources: TraceLink[]
}

const NO_LAW: LandLawReading = { read: false, signal: null, acts: [], windows: [], quoted: [], quotedOnly: [] }

/**
 * The Land's EU statement: the WFA heading in each document read, the
 * Erläuterungen' first; then a headed passage of the general part.
 */
function findStatement(input: LandEuInput, general: readonly ExplanationsPassageText[]): FoundStatement | null {
  const erlUrl = input.explanations.url
  const titleOf = (url: string) => input.documents.find((d) => d.url === url)?.title ?? ''
  const ordered = [...input.pages.keys()].sort((a, b) => Number(b === erlUrl) - Number(a === erlUrl))
  for (const url of ordered) {
    const statement = readLandEuStatement([], linesOfPages(input.pages.get(url)!))
    if (statement) return { statement, url, label: VORBLATT_LAENDER.has(input.land) || /vorblatt/i.test(titleOf(url)) ? 'Vorblatt' : 'Erläuterungen' }
  }
  const statement = readLandEuStatement(general, null)
  return statement ? { statement, url: erlUrl, label: 'Erläuterungen' } : null
}

/** The page's reading of one Land's draft, short of EUR-Lex and the law in force. */
export function readLandEu(input: LandEuInput): LandEuReading {
  const general = input.explanations.available ? input.explanations.general : []
  const found = findStatement(input, general)
  const law = input.draft.pages ? readLandLaw(input.draft.pages) : NO_LAW
  const decision = decideLandEuMarker(found?.statement ?? null, general, law)
  const sources: TraceLink[] = []
  const cite = (label: string, url: string | null) => {
    if (url && !sources.some((s) => s.label === label && s.url === url)) sources.push({ label, url })
  }
  if (found) cite(found.label, found.url)
  else if (decision.source === 'erlaeuterungen') cite('Erläuterungen', input.explanations.url)

  const allowed = decision.marker !== null && decision.actsAllowed
  const fromStatement = allowed ? statementActs(found?.statement ?? null) : []
  const fromLaw = allowed ? law.acts : []
  const hinweise = allowed && input.explanations.available ? entryHinweise(input.explanations.particular) : []
  const fromEntries = uniqueActs(hinweise.map((h) => h.acts))
  const named = uniqueActs([fromStatement, fromLaw, fromEntries])
  if (fromLaw.length) cite('Entwurf', input.draft.url)
  const known = new Set([...fromStatement, ...fromLaw].map((a) => a.celex))
  if (fromEntries.some((a) => !known.has(a.celex))) cite('Erläuterungen', input.explanations.url)
  const actsSource: EuRechtResponse['actsSource'] = !named.length
    ? null
    : fromStatement.length
      ? (found!.label === 'Vorblatt' ? 'vorblatt' : 'erlaeuterungen')
      : fromLaw.length ? 'gesetzestext' : 'erlaeuterungen'

  const base = new Set<string>()
  for (const text of [found?.statement.sentence ?? '', ...law.windows.map((w) => w.text), ...law.quoted.map((q) => q.text), ...hinweise.map((h) => h.text)]) {
    for (const c of baseActCelexes(text)) base.add(c)
  }
  return { found, decision, law, hinweise, named, actsSource, base, sources }
}

/**
 * Whether the draft adds the act (D4 for the Länder): asked of the Land's
 * law in force for a directive with a date — old where a Paragraph of it
 * transposes the act, unknown where RIS did not answer or no day could be
 * asked for. No per-Paragraph check of the addressed § as the Bund has.
 */
export function landIsNew(act: EuAct, asked: boolean, standing: boolean | null, asOf: string | null): boolean | null {
  if (asked) return standing === true ? false : standing === null ? null : true
  return asOf === null && act.kind === 'richtlinie' ? null : true
}
