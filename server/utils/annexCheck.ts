/**
 * Is the annex's "Geltende Fassung" really the law as it stands?
 * (docs/api-exploration.md §2c, docs/architecture.md §12.13)
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * The left column of a Textgegenüberstellung claims to be the standing law
 * on the day the consultation opens. RIS holds that text independently, so
 * the claim is checkable — and it is the only self-check either annex path
 * has. The right column cannot be checked against anything: it is the law
 * the draft proposes, which exists nowhere else yet.
 *
 * That makes this module the whole basis of the gate. Where the left column
 * matches, the pairing is sound and the word diff beside it means what it
 * says. Where it does not, the page is diffing displayed text against a
 * provision it does not belong to — and the reader has no way to tell.
 *
 * Measured 2026-09-09 over the annexes the page shows today (101 evaluable
 * drafts, 964 §§ with real prose): 86,9 % cover the standing § to 99 % or
 * better, and 45 §§ (4,7 %) fall below 80 % — those are mis-paired or quote
 * a superseded version, and every one of them is on the page right now as a
 * word diff. A few fail in clusters, a whole law at a time (the IVS-Gesetz
 * annex, 51/ME, scores 9 of 16); most fail one or two §§ per draft.
 *
 * **Why this is not a text comparison.** The annex abbreviates unchanged
 * stretches by the Rundschreiben ("(2) bis (4) …"), prints markers RIS keeps
 * out of the text, and copies RIS's own editorial notes. So the test is what
 * share of the column's *comparable* words appear in the RIS paragraph at
 * all — containment of a deliberate subset, never equality.
 *
 * The verdict logic lived in `scripts/annex-pdf-verify.ts` and could
 * therefore neither be tested nor applied to the path that ships. Three of
 * the discounts below were once the ruler blaming the parse for its own
 * gaps, which is the third time in this project that the measuring
 * instrument was worse than the thing measured.
 */
import { normalizeText } from './lawText'
import type { DraftArticle } from './lawTitles'
import type { KonsLawAtDate, KonsParagraphRef } from './risKons'
import type { ComparisonRow } from './textComparison'

/**
 * What is not comparable, on either side.
 *
 * - **Elision.** "(1) bis (3) …" says three Absätze are unchanged and left
 *   out. It is the annex's own syntax; "bis" is not law text, and it was the
 *   single most frequent "missing" word in the corpus. The same syntax runs
 *   over §§ and Ziffern too: "§ 21. bis § 25. …", "1. bis 100. …".
 * - **The row's own designation.** RIS keeps "§ 217." as the paragraph's
 *   marker, not as its text, so the column's designation can never be found
 *   and "217" would count as a missing word.
 * - **RIS's editorial notes.** "(Anm.: Abs. 2 aufgehoben durch …)" is not
 *   law; `lawStructure.ts` strips it from the RIS side and the annex copies
 *   it verbatim, so it has to go from the column side as well or the
 *   asymmetry is scored against the parse.
 * - **RIS web-view boilerplate.** A few annexes paste "Beachte für folgende
 *   Bestimmung" along with the text; it is in no XML.
 *
 * What is *not* discounted: Abschnitt, Hauptstück and Teil headings. The
 * premise was that RIS files them outside the §. It does not — they are
 * inside every § document, and callers pass them in from `node.context`.
 */
/** A chain of designations joined by "bis"/"und", closed by three dots. */
const ELISION_RE = /(?:§+\s*)?\(?\d+[a-z]*\)?\.?(?:\s*(?:bis|und|,)\s*(?:§+\s*)?\(?\d+[a-z]*\)?\.?)*\s*(?:\.\.\.|…)/g
/** "§ 217." — the designation form, which ends in a period; a citation does not. */
const DESIGNATION_RE = /(?:^|\s)§+\s*\d+[a-z]*\.(?=\s|$)/g
const ANNOTATION_RE = /\(Anm\.:[^()]*(?:\([^()]*\)[^()]*)*\)/g
const BOILERPLATE_RE = /Beachte für folgende Bestimmung/gi

/**
 * Below this many comparable words a § says nothing either way: a row that is
 * a heading plus "(1) bis (3) …" shows nothing of the provision on purpose,
 * so scoring it would measure the Rundschreiben rather than the parse.
 *
 * Measured, because every § under the floor is one the gate waves through
 * unexamined. Over the 1.040 §§ of the live corpus with any comparable words
 * (`annex-pdf-verify.ts --xml --calibrate`, 2026-09-09):
 *
 * | Wörter | §§  | ≥ 95 % |
 * |--------|-----|--------|
 * | 1–4    |  10 |   50 % |
 * | 5–14   |  66 |   89 % |
 * | 15–∞   | 964 |   87 % |
 *
 * The 5–14 band verifies at the same rate as the whole corpus, so those §§
 * are evidence and belong inside the gate; the floor of 15 was inherited
 * from scoring single *rows* and excused 66 of them, seven wrongly. The 1–4
 * band is noise: with four words one missing word is 75 %, and half the band
 * falls short. Hence five.
 */
export const MIN_PROSE_TOKENS = 5

/**
 * A § whose displayed changes fall below this share of coverage is not shown.
 * Calibrated on the live corpus, where the per-§ distribution runs median
 * 100 %, p25 100 %, p10 98 %: the band between 0.95 and 0.99 is hyphenation,
 * footnotes and stray designations, while everything genuinely mis-paired
 * sits far below — 29 of the 45 failures are under 50 %. Drawing the line at
 * 0.99 would withhold about 60 sound §§ to catch nothing extra.
 */
export const PARAGRAPH_THRESHOLD = 0.95

/**
 * Below this verified share, a law is *flagged* — named on the page as
 * doubtful as a whole — but its §§ are not withheld beyond the ones that
 * failed on their own.
 *
 * The distinction is deliberate, and it is the opposite of what this module
 * first did. Clustered failure does say something a single § does not: the
 * ministry based the annex on a different version of the law, or the Artikel
 * resolved to the wrong law. But a § that clears 95 % coverage over real
 * prose has not done so by accident — a bag test over dozens of words does
 * not pass against an unrelated provision. So where a version differs, the
 * §§ that did not change between versions verify *correctly* and their
 * diffs are sound; withholding them buys no safety and costs the reader the
 * part of the annex that was right. Withholding stays per §; the cluster
 * becomes a sentence.
 */
export const LAW_THRESHOLD = 0.7

/**
 * A law needs at least this many judged §§ before a *share* means anything.
 * One failing § out of one is not a pattern, and calling that law doubtful
 * as a whole told the reader something much broader than the evidence — 14
 * of the 18 flags in the live corpus were laws with one or two judged §§.
 */
export const MIN_JUDGED_FOR_LAW_VERDICT = 3

/** Comparable words of a text: the discounts above, lowercased, short words dropped. */
export function comparableTokens(text: string): string[] {
  return text
    .replace(ANNOTATION_RE, ' ')
    .replace(BOILERPLATE_RE, ' ')
    .replace(ELISION_RE, ' ')
    .replace(DESIGNATION_RE, ' ')
    .replace(/(?:\.\.\.|…)/g, ' ')
    .toLowerCase()
    .replace(/[„“”"'‚‘’]/g, '')
    .replace(/[­‑]/g, '-')
    .split(/[^\p{L}\p{N}§-]+/u)
    .filter((w) => w.length > 2)
}

export interface Coverage {
  /** Share of the column's comparable words found in the standing text, 0–1 */
  ratio: number
  /** Words the standing text does not have, for the report */
  missing: string[]
  /** How many comparable words the column carried */
  comparable: number
  /** Enough prose to be evidence either way */
  prose: boolean
  /** `ratio` clears `PARAGRAPH_THRESHOLD`, or the row carries too little prose to judge */
  verified: boolean
}

/**
 * How much of `column` the `standing` text accounts for.
 *
 * A bag test, deliberately: the annex breaks lines where the layout demands
 * and RIS where the structure does, so word order is not evidence. What it
 * catches is the case that matters — a column belonging to another provision
 * shares almost no vocabulary with this one.
 */
export function coverageOf(column: string, standing: string): Coverage {
  const want = comparableTokens(normalizeText(column))
  const have = new Set(comparableTokens(normalizeText(standing)))
  const missing = want.filter((w) => !have.has(w))
  const ratio = want.length === 0 ? 1 : 1 - missing.length / want.length
  const prose = want.length >= MIN_PROSE_TOKENS
  return { ratio, missing, comparable: want.length, prose, verified: !prose || ratio >= PARAGRAPH_THRESHOLD }
}

/**
 * The rows whose left column the page presents as a change.
 *
 * Only these need to hold: an `unchanged` row is folded away behind a count,
 * and an `inserted` row has no left column to check — the provision it
 * proposes does not exist in the standing law, which is the point of it. An
 * `elided` row is the annex saying it left text out.
 */
export function displayedChangeRows(rows: readonly ComparisonRow[]): ComparisonRow[] {
  return rows.filter((r) => r.kind === 'pair' && !r.elided && r.current.length > 0 && (r.change === 'changed' || r.change === 'removed'))
}

/**
 * Coverage of every displayed change of one § at once.
 *
 * Per § rather than per row, because the annex splits one provision over as
 * many rows as its layout needs: a single Absatz continued on the next row
 * would score twice, and a row carrying six words would drag a sound §
 * below the line on its own.
 */
export function coverageOfParagraph(rows: readonly ComparisonRow[], standing: string): Coverage {
  return coverageOf(displayedChangeRows(rows).map((r) => r.current).join(' '), standing)
}

/**
 * What the check concluded about a law.
 *
 * "Checked and wrong" and "not checkable" are different states, and
 * collapsing them either hides real failures or throws away sound work: a
 * draft that creates new law has no Stammnorm to check against, a
 * Verordnung is not in Bundesrecht at all, and neither is evidence of
 * anything. `doubtful` is the third: enough §§ of this law failed that the
 * annex probably quotes another version of it — a sentence for the reader,
 * not a reason to withhold the §§ that verified.
 */
export type LawVerdict = 'verified' | 'doubtful' | 'unchecked'

export interface LawCheck {
  law: string | null
  verdict: LawVerdict
  /** §§ carrying enough prose to judge */
  judged: number
  /** …of those, the ones that cleared the threshold */
  verified: number
  /** Every § that fell below it */
  failed: string[]
}

/**
 * The verdict on one law of a package, from the coverage of its §§.
 *
 * `doubtful` needs a cluster: enough §§ judged for a share to mean something
 * (`MIN_JUDGED_FOR_LAW_VERDICT`) and enough of them failing. The IVS-Gesetz
 * annex (51/ME) is the case it is for — 7 of its 16 §§ miss, which is a
 * version difference and not sixteen coincidences.
 */
export function lawCheck(law: string | null, byParagraph: ReadonlyMap<string, Coverage>): LawCheck {
  const judged = [...byParagraph].filter(([, c]) => c.prose)
  const failed = judged.filter(([, c]) => c.ratio < PARAGRAPH_THRESHOLD).map(([para]) => para)
  const verified = judged.length - failed.length
  const verdict: LawVerdict =
    judged.length === 0
      ? 'unchecked'
      : judged.length >= MIN_JUDGED_FOR_LAW_VERDICT && verified / judged.length < LAW_THRESHOLD
        ? 'doubtful'
        : 'verified'
  return { law, verdict, judged: judged.length, verified, failed }
}

/**
 * Where the standing law comes from.
 *
 * Injected rather than imported, so the whole gate is one pure function: the
 * service passes Nitro-cached lookups, a test passes fakes, and the harness
 * passes uncached ones and measures exactly what the request path decides.
 * A gate that could only run inside a request would be a gate nobody could
 * check, which is the mistake this project has already made once with the
 * verdict logic living in a script.
 */
export interface AnnexSources {
  /** Which law a Stammnorm means at a date, with its § index. */
  resolveLaw: (organ: string, nummer: string, date: string, title: string) => Promise<KonsLawAtDate | null>
  /**
   * The standing text of one §, group headings included — the Abschnitt and
   * Hauptstück lines above a § are outside `plainText` but the annex prints
   * them, so they have to be offered or they count as missing words. Null
   * for a § RIS holds as a table: `lawStructure.ts` does not represent those
   * as a tree, and a § that cannot be represented is left unjudged rather
   * than scored against nothing.
   */
  standingText: (ref: KonsParagraphRef) => Promise<string | null>
}

/** Ceiling on § lookups per draft, so one monster Sammelgesetz cannot hang a request. */
const MAX_PARAGRAPHS = 160
const CONCURRENCY = 4

/** The verdict on one annex: which §§ may be shown, and which laws may not. */
export interface AnnexVerification {
  /** `law#para` of every § whose displayed changes are not in the standing law */
  withheld: string[]
  /** `law#para` of every § the check could not reach; shown, but labelled */
  unchecked: string[]
  /**
   * Laws where enough §§ failed to doubt the whole annex for that law. Named
   * on the page; their §§ are withheld only where each failed on its own.
   */
  doubtfulLaws: LawCheck[]
  /** §§ that carried enough prose to judge */
  judged: number
  /** …of those, the ones that cleared the threshold */
  verified: number
}

/**
 * The key a § is filed under, so a package's two § 5 stay apart — 15,1 % of
 * § designations in the multi-law annexes recur in another law of the same
 * package, so the law has to be part of the identity.
 *
 * Named apart from `tguOracle.paragraphKey`, which builds the same shape from
 * the *normalised* id ("5") while this one keeps the annex's own designation
 * ("§ 5."). Two functions of the same name and the same shape whose arguments
 * are in the opposite order is the kind of thing auto-import resolves
 * silently and wrongly.
 */
export function annexParagraphKey(law: string | null, para: string): string {
  return `${law ?? ''}#${para}`
}

/** "§ 5." / "§ 12a" → the lookup id RIS uses; null for anything else. */
function paragraphId(gld: string): string | null {
  return /(\d+[a-z]*(?:\.\d+)?|[IVXL]+)/.exec(gld)?.[1] ?? null
}

/**
 * The standing text of one §, headings included.
 *
 * The Abschnitt and Hauptstück headings above a § belong to a group of §§
 * and are deliberately outside `plainText`; the annex prints them over the §
 * all the same, so they have to be offered or they count as missing words.
 *
 * A § whose RIS document is a table is not represented as a tree at all
 * (`lawStructure.ts`) — its cells would read as Absätze in document order.
 * That returns null here, and a § that cannot be represented is left
 * unjudged rather than scored against nothing.
 */
async function standingText(ref: KonsParagraphRef): Promise<string | null> {
  if (!ref.xmlUrl) return null
  const tree = parseKonsParagraph(await fetchParagraphXml(ref.nor, ref.xmlUrl))
  return tree ? [...tree.context, plainText(tree)].join(' ') : null
}

/**
 * Check every § of a parsed comparison against RIS.
 *
 * `articles` is the draft's own Artikel list — the same list that decides the
 * annex's law boundaries — because the Artikel's title is what tells the
 * Bankwesengesetz from the Bausparkassengesetz when one BGBl promulgated
 * both.
 */
export async function verifyAnnex(
  rows: readonly ComparisonRow[],
  articles: readonly DraftArticle[],
  asOf: string,
  sources: AnnexSources,
): Promise<AnnexVerification> {
  const nothingChecked = (keys: Iterable<string>): AnnexVerification => ({ withheld: [], unchecked: [...keys], doubtfulLaws: [], judged: 0, verified: 0 })
  if (!asOf) return nothingChecked([])

  // Every pair row of a §, grouped by the law it belongs to. `para` carries
  // the designation the row inherited where it opens none of its own — two
  // thirds of the rows do, and judging them one by one would measure the
  // annex's line breaks rather than the provision.
  const groups = new Map<string, { law: string | null; para: string; rows: ComparisonRow[] }>()
  for (const row of rows) {
    if (row.kind !== 'pair') continue
    const para = row.gld ?? row.para
    if (!para) continue
    const key = annexParagraphKey(row.law, para)
    const group = groups.get(key) ?? { law: row.law, para, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }
  if (groups.size === 0) return nothingChecked([])

  const amending = articles.filter((a) => a.amends)
  const byKey = new Map<string | null, DraftArticle>(articles.map((a) => [a.key, a]))
  const lawOf = async (key: string | null): Promise<KonsLawAtDate | null> => {
    // An unattributed row can only be resolved when the draft amends exactly
    // one law; with several, which § 5 it means is unknowable and guessing is
    // what the boundary refusal exists to prevent.
    const article = key === null ? (amending.length === 1 ? amending[0]! : null) : byKey.get(key)
    if (!article?.bgbl) return null
    return await sources.resolveLaw(article.bgbl.organ, article.bgbl.nummer, asOf, article.title ?? '')
  }

  const laws = new Map<string | null, Map<string, Coverage>>()
  const queue = [...groups.values()]
  let looked = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const group = queue.shift()
      if (!group || looked >= MAX_PARAGRAPHS) return
      looked++
      const law = await lawOf(group.law).catch(() => null)
      if (!law) continue
      const id = paragraphId(group.para)
      if (!id) continue
      // RIS prints an Anlage as "Anl. 1", never as "§ 1"; looking one up
      // among the paragraphs compared a schedule against an unrelated
      // provision.
      const wanted = /^(?:Anlage|Anhang)/i.test(group.para)
        ? new RegExp(`^Anl\\.?\\s*${id}\\b`, 'i')
        : new RegExp(`^§+\\s*${id.replace('.', '\\.')}(?![.\\d])`)
      const ref = Object.entries(law.paragraphs).find(([label]) => wanted.test(label))?.[1]
      if (!ref) continue
      const standing = await sources.standingText(ref).catch(() => null)
      if (standing === null) continue
      const byPara = laws.get(group.law) ?? new Map<string, Coverage>()
      byPara.set(group.para, coverageOfParagraph(group.rows, standing))
      laws.set(group.law, byPara)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  if (laws.size === 0) return nothingChecked(groups.keys())

  const withheld = new Set<string>()
  const unchecked = new Set<string>()
  const doubtfulLaws: LawCheck[] = []
  let judged = 0
  let verified = 0
  for (const [law, byPara] of laws) {
    const check = lawCheck(law, byPara)
    judged += check.judged
    verified += check.verified
    if (check.verdict === 'unchecked') {
      for (const para of byPara.keys()) unchecked.add(annexParagraphKey(law, para))
      continue
    }
    if (check.verdict === 'doubtful') doubtfulLaws.push(check)
    // Withholding is per §, whatever the law's verdict: a § that cleared the
    // threshold cleared it against the standing text, and a cluster of
    // failures around it does not make it wrong.
    for (const para of check.failed) withheld.add(annexParagraphKey(law, para))
  }
  // A § no law entry covers was never looked at: the Stammnorm did not
  // resolve, RIS holds no such §, its document is a table, or the ceiling
  // above cut the run short.
  for (const [key, group] of groups) {
    if (!laws.get(group.law)?.has(group.para) && !withheld.has(key)) unchecked.add(key)
  }
  return { withheld: [...withheld], unchecked: [...unchecked], doubtfulLaws, judged, verified }
}
