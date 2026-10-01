/**
 * „Hat sich die Begründung geändert?" — the comparison of the Erläuterungen
 * between draft and Regierungsvorlage (docs/architecture.md §12.10b).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly. The Nuxt
 * half is `explanations/reasoningDiffService.ts`.
 *
 * THE BEGRÜNDUNG FOLLOWS WHAT THE UNIT IS (01.10.2026). Ressorts explain an
 * amendment by Ziffer („Zu Z 4 (§ 54c Abs. 1a):", „Zu Art. 2 Z 1 (§ 7):",
 * „Zu Z 1 bis 3:") and a new law by § („Zu § 9:"). So a unit of the ME→RV
 * comparison that is a Novellierungsanordnung gets the passage(s) whose
 * heading names ITS Ziffer — on each side in that side's own numbering (the
 * Vorlage's Ziffer and Artikel from `id`/`articleKey`, the draft's from
 * `fromId`/`fromArticleKey`). Joined by § instead, an instruction carried
 * every passage that names its §, the other Ziffern' included: under each of
 * six Ziffern on § 11 of 8/ME the Begründung of all six, and a „geändert"
 * that came from a different change to the same §. Where one side titles the
 * change by § instead („Zu § 11 Abs. 1b und 2:" in the draft, „Zu Z 9 und 10
 * (…)" in the Vorlage), that side's passages titled by § alone answer —
 * never another Ziffer's.
 *
 * COMPUTED AT THE PASSAGE, SHOWN AT THE INSTRUCTION. One passage that covers
 * Z 1 bis 3 is one comparison, not three — the protection the § join built
 * per § (22.09.2026) holds here per passage: an entry is keyed by the
 * passages it compares, and `units` says which instruction points at which
 * entry, keyed by `diffUnitKey` as for the § names
 * (`diff/paraTitleService.ts`), so no second key arises at which check and
 * display could drift apart.
 *
 * SAME SCOPE ON BOTH SIDES, OR NO VERDICT. Draft „Zu Z 1:" + „Zu Z 2:"
 * against Vorlage „Zu Z 1 und 2:" is a regrouping, not a revision; the texts
 * cannot be held against each other as one Begründung each. Compared is only
 * where the draft's passages and the Vorlage's cover the same units, inserted
 * and removed ones included (`sameScope`); otherwise both passages are shown
 * without a verdict (`comparable: false`), so nothing loses the Begründung it
 * showed before.
 *
 * WHAT STAYS PER §. A unit that is neither a § nor a Ziffer, every unit of a
 * draft one of whose documents titles no passage by Ziffer at all, and an
 * inserted or removed instruction, which has no Ziffer on the other side to
 * be held against: the § join as before, unchanged — below. Measured old
 * against new over GP XXVI–XXVIII (`aenderungsrate.ts --ziffer`, §12.10b):
 * units with a Begründung shown, compared or not, 2.036 → 2.461, 4.864 →
 * 5.772, 2.272 → 2.455.
 *
 * A UNIT THAT IS A § (a new law, `isParagraphUnit`) BY ITS OWN DESIGNATION
 * (01.10.2026, `joinOwnParagraph`). It addresses nothing — read as an
 * instruction its law text gave the §§ it cites — so the § join never gave it
 * a Begründung. It gets the passages titled by its own §, „Zu § 9:", on each
 * side in that side's numbering, under the same rules as the Ziffer join:
 * one entry per pair of passages, the scope rule, keyed by Artikel in a
 * package. Measured against the stand before (`aenderungsrate.ts --ziffer
 * --against`): 245, 1.373 and 274 units more with a Begründung in GP XXVI,
 * XXVII and XXVIII, none lost, no other verdict moved.
 *
 * A SAMMELVORLAGE IN THE DRAFT'S NUMBERING (01.10.2026). 129 d.B. XXVIII
 * keeps 24/ME's Artikel numbers inside its own Artikel headings („Zu Art. 3
 * Z 48 …" under „Zu Artikel 25 (…)"), and 22/ME heads its laws „Art. X1" to
 * „X3". Such a passage is keyed by what it prints — the Vorlage's heading
 * with the draft's Artikel and Ziffer (`foreignNumbered`), or the law's title
 * (`ArticleMode` `title`) — and never under the number of another law.
 *
 * ONE SIDE COUNTING ITS ZIFFERN OFF (02.10.2026, `misnumbered`). Where one
 * document's only passage to a Ziffer names another § than the instruction
 * amends, and the other document's names the right one, the first is another
 * Ziffer's passage (24/ME XXVIII Z 47), and the pair is not compared.
 *
 * THE § JOIN. One comparison per Paragraph, `units` pointing there.
 *
 * AMBIGUOUS NUMBERS STAY OUT. A passage of the Besonderer Teil carries the
 * Paragraph's number, not its law. In a Sammelgesetz two Artikel each amend a
 * § 15 (8/ME: Staatsschutz- und Nachrichtendienst-Gesetz and
 * Bundesverwaltungsgerichtsgesetz), and both passages sit under the same
 * number — one law's Begründung would be shown under the other's Paragraph.
 * So where two Artikel address the same number the § join shows nothing, the
 * same rule as for the § names: a wrong reference is worse than none.
 *
 * **Unless the Artikel says which (27.09.2026).** Measured, the rule was not
 * a margin: 14,7 % of the comparable §§ of GP XXVII (413 of 2.801), 22,4 % of
 * GP XXVI (§12.10b). Where both documents set the passage under an Artikel
 * (`HtmlPassage.article`) and the unit carries its Artikel number on each
 * side (`articleKey`, `fromArticleKey` — renumbered between draft and
 * Vorlage, 18/ME: 3 → 6), the § is compared under that pair; measured, 292
 * of the 413 come back. What still cannot be keyed stays out, as before.
 */
import type { LawDiffUnit, ReasoningDiffEntry } from '../../../shared/types'
import { diffUnitKey } from '../../../shared/utils/diffKey'
import { displayId, isParagraphUnit } from '../../../shared/utils/unitName'
import { diffTokens } from '../diff/wordDiff'
import { addressedParagraph, addressedParagraphOf, instructionParagraphs } from '../lawtext/instructionAddress'
import { passagesByArticleParagraph, passagesByParagraph, type HtmlExplanations, type HtmlPassage } from './explanationsHtml'
import { ADDRESS_WORD_RE, addressOf, leadingAddress } from './risExplanations'
// The key of `passagesByParagraph`, and the same reading the page looks up
// with. Its `\b` changes nothing for the designations `parseAddress` builds:
// 0 of 4.215 differ over the offline corpus (22.09.2026). It bites only on a
// raw Gliederungssymbol such as § 365m1, which never reaches here.
import { articleParagraphKey, explanationParaId } from '../../../shared/utils/explanationKey'

/** Below this it is punctuation and whitespace, not a revision. */
const CHANGED_AT = 0.02
/**
 * A ceiling for the outlier, set from the corpus (27.09.2026, `aenderungsrate.ts
 * --reasoning`): uncapped, a draft carries median 8 entries, p99 129–175 over
 * GP XXVI–XXVIII, and the most any draft reaches is 237 (XXVII 230/ME). At 120
 * five drafts lost Begründungen once the Artikel key added entries; 250 holds
 * every measured one. The size is carried by a few long passages, not by the
 * count — median 100–300 bytes an entry.
 *
 * 350 since the Ziffer join (01.10.2026, `aenderungsrate.ts --ziffer`): a
 * passage is shorter than all passages of its §, and passages the scope rule
 * keeps apart are entries too (shown, not compared), so a draft holds more —
 * median 7–10, p99 165–234, at most 311 (again XXVII 230/ME, which at 300 lost
 * eleven compared Begründungen).
 */
// Not exported: Nitro's auto-imports share one namespace, and
// `MAX_PARAGRAPHS` already exists in `annex/verdict.ts`.
const MAX_ENTRIES = 350

export interface ReasoningComparison {
  /**
   * `diffUnitKey` → the key of its entry in `entries`: which change points at
   * which comparison. A lookup key, not display text — „§ 11", „Art. 2 § 15"
   * for the § join, „Z …" for the Ziffer join.
   */
  units: Record<string, string>
  /** The comparisons, once per passage (Ziffer join) or per Paragraph (§ join). */
  entries: Record<string, ReasoningDiffEntry>
  stats: { compared: number; changed: number; uncompared: number }
}

/** Paragraph number → text, as the § join reads both documents. */
type Texts = ReadonlyMap<string, string>

/**
 * The Paragraph numbers occurring in more than one Artikel of the draft — see
 * the file header. Computed over all units, the unchanged ones included:
 * whether a number is given out twice does not depend on what changed between
 * the two versions.
 *
 * A new law's § counts by its own designation (02.10.2026): it addresses
 * nothing (`addressedParagraphOf`), but it is a § 32 all the same. 32/ME
 * XXVIII enacts the ElWG in Artikel 1 and amends § 21, § 27 and § 32 of the
 * Energie-Control-Gesetz in Artikel 3; read as unique, the § join showed the
 * ElWG's „Zu § 32 (Besondere Bestimmungen für die Auffangversorgung …):" at
 * the E-Control-Gesetz's instructions.
 */
function ambiguousParagraphs(units: readonly LawDiffUnit[]): Set<string> {
  const articles = new Map<string, Set<string>>()
  for (const unit of units) {
    const own = isParagraphUnit(unit) ? paragraphOfId(unit.id) ?? paragraphOfId(unit.fromId) : null
    const para = own ? `§ ${own}` : addressedParagraphOf(unit)
    if (!para) continue
    const seen = articles.get(para) ?? new Set<string>()
    seen.add(unit.article ?? '')
    articles.set(para, seen)
  }
  return new Set([...articles].filter(([, seen]) => seen.size > 1).map(([para]) => para))
}

/** The comparison of two texts as an entry. */
function entryOf(basis: ReasoningDiffEntry['basis'], label: string, a: string, b: string): ReasoningDiffEntry {
  const { similarity, segments } = diffTokens(a, b)
  const drift = 1 - similarity
  const changed = drift >= CHANGED_AT
  return {
    basis,
    label,
    comparable: true,
    fromHeading: null,
    drift,
    changed,
    segments: changed ? segments : null,
    // Both versions whole, but only where the word comparison stopped at
    // its ceiling: the unfolded Begründung would otherwise stand there
    // empty because `segments` is missing (seen at § 11 and § 15 of
    // 8/ME). The same shape as in the comparison above, where the same
    // can happen.
    fromText: changed && !segments ? a : null,
    toText: changed && !segments ? b : null,
  }
}

/** The result being filled, with the entries the ceiling already turned away from. */
interface Filling {
  out: ReasoningComparison
  skipped: Set<string>
}

/**
 * The passages of both sides without a verdict — where the scope rule holds
 * them apart (`sameScope`). The Vorlage's text is what the reader is shown;
 * the draft's comes along, empty where its passage is a bare heading.
 */
function uncomparedOf(basis: ReasoningDiffEntry['basis'], label: string, fromHeading: string, a: string, b: string): ReasoningDiffEntry {
  return { basis, label, comparable: false, fromHeading, drift: null, changed: false, segments: null, fromText: a || null, toText: b }
}

/**
 * Not a word apart, by the same comparison that gives the verdict. The scope
 * rule holds passages apart because a different grouping can make two texts
 * differ without the Begründung changing — a false „geändert". Where the two
 * texts are the same word for word, that cannot happen: „unverändert" is
 * true however the Ziffern are grouped (65/ME XXVIII, „Redaktionelle
 * Anpassungen." under eight Ziffern on both sides, 01.10.2026).
 */
function sameWords(a: string, b: string): boolean {
  return Boolean(a) && diffTokens(a, b).similarity === 1
}

/** What `fill` builds an entry from. */
interface EntryInput {
  label: string
  basis: ReasoningDiffEntry['basis']
  a: string
  b: string
  /** Set for passages shown without a comparison — the draft's heading(s). */
  uncompared?: { fromHeading: string }
}

/**
 * Adds the entry under `key` unless it is there, the ceiling is reached, or a
 * side has no text — and points the unit at it. An uncompared entry needs
 * only the Vorlage's text: it is shown, not held against the draft's.
 */
function fill(f: Filling, unit: LawDiffUnit, key: string, make: () => EntryInput): void {
  if (f.skipped.has(key)) return
  if (!f.out.entries[key]) {
    if (Object.keys(f.out.entries).length >= MAX_ENTRIES) return
    const { label, basis, a, b, uncompared } = make()
    if (!b || (!a && !uncompared)) {
      f.skipped.add(key)
      return
    }
    f.out.entries[key] = uncompared && !sameWords(a, b)
      ? uncomparedOf(basis, label, uncompared.fromHeading, a, b)
      : entryOf(basis, label, a, b)
  }
  f.out.units[diffUnitKey(unit)] = key
}

/**
 * The § join over `units`, in the order given — by § where the number is
 * unique in the draft, by Artikel and § where it is not, and where not even
 * that holds, nothing.
 */
function joinAtParagraph(f: Filling, units: readonly LawDiffUnit[], ambiguous: ReadonlySet<string>, before: Texts, after: Texts, byArticle: { before: Texts; after: Texts } | null): void {
  for (const unit of units) {
    const para = addressedParagraphOf(unit)
    const id = explanationParaId(para)
    if (!para || !id) continue
    if (!ambiguous.has(para)) {
      fill(f, unit, para, () => ({ basis: 'paragraph', label: para, a: before.get(id) ?? '', b: after.get(id) ?? '' }))
      continue
    }
    if (!byArticle || !unit.fromArticleKey || !unit.articleKey) continue
    const { fromArticleKey, articleKey } = unit
    fill(f, unit, `Art. ${articleKey} ${para}`, () => ({
      basis: 'paragraph',
      label: para,
      a: byArticle.before.get(articleParagraphKey(fromArticleKey, id)) ?? '',
      b: byArticle.after.get(articleParagraphKey(articleKey, id)) ?? '',
    }))
  }
}

/**
 * The § join for every unit — the layer as it stood until 01.10.2026, and
 * still the whole of it where a draft's Erläuterungen are titled by § alone.
 * `before`/`after` are the passage texts per Paragraph number of both
 * versions, `byArticle` the same under (Artikel, §).
 *
 * Compared only where BOTH sides carry a Begründung. A missing one is no
 * changed Begründung but a gap in the document, and showing that as
 * „geändert" would be wrong.
 */
export function compareReasoningByParagraph(units: readonly LawDiffUnit[], before: Texts, after: Texts, byArticle: { before: Texts; after: Texts } | null = null): ReasoningComparison {
  const ambiguous = ambiguousParagraphs(units)
  const f: Filling = { out: { units: {}, entries: {}, stats: { compared: 0, changed: 0, uncompared: 0 } }, skipped: new Set() }
  // Two passes: every unique number first, the Artikel-keyed ones after. The
  // ceiling counts entries, and in unit order an Artikel-keyed § early in a
  // long Sammelgesetz took the place of a unique one that had been shown
  // before the second key existed — measured, 43, 202 and 230/ME of GP XXVII
  // would have lost Begründungen they have today.
  const isAmbiguous = (u: LawDiffUnit) => ambiguous.has(addressedParagraphOf(u) ?? '')
  joinAtParagraph(f, [...units.filter((u) => !isAmbiguous(u)), ...units.filter(isAmbiguous)], ambiguous, before, after, byArticle)
  return finish(f.out)
}

function finish(out: ReasoningComparison): ReasoningComparison {
  const entries = Object.values(out.entries)
  const compared = entries.filter((e) => e.comparable)
  out.stats = { compared: compared.length, changed: compared.filter((e) => e.changed).length, uncompared: entries.length - compared.length }
  return out
}

/** A document's passages as text per Paragraph number — the § join's input. */
export function passageTexts(byParagraph: Map<string, HtmlPassage[]>): Map<string, string> {
  return new Map([...byParagraph].map(([id, passages]) => [id, passages.flatMap((p) => p.text).join(' ')]))
}

/** „Z3" → „3". Null for a § unit, a duplicate number („Z3#dup") and anything else. */
function zifferOfId(id: string | null): string | null {
  const m = /^Z(\d+[a-z]?)$/i.exec(id ?? '')
  return m ? m[1]!.toLowerCase() : null
}

/**
 * How a side keys its Artikel. `single` — one law in the text and at most one
 * Artikel among the passages: the Artikel is dropped from both keys, because
 * the two documents number one law differently (124/ME XXVII: the Vorlage's
 * text has an „Artikel 1", its Erläuterungen none; 268/ME the other way
 * round). `package` — several: every key carries its Artikel, and a unit
 * without one is not looked up by it, since the empty Artikel would find
 * another law's Ziffer.
 *
 * **A package whose Erläuterungen mark no Artikel** keys by Ziffer and §
 * instead: „Zu Z 7 (§ 22):" is Z 7 of the law whose Z 7 amends § 22 (151/ME
 * XXVI, two laws, not one Artikel heading the parser can read). Only where
 * the § is unique in the draft (`ambiguousParagraphs`) — the same guard as
 * the § join's.
 *
 * `title` — several laws, but no Artikel number on this side at all, and the
 * Erläuterungen head at least two of them by the very title the law text
 * gives them (`HtmlPassage.law`): every key is the law's title. 22/ME
 * XXVIII, bundled into 129 d.B., heads its laws „Zu Art. X1 (Änderung des
 * Bundesgesetzes über die Einrichtung einer Dokumentations- und
 * Informationsstelle für Sektenfragen …)", „X2", „X3" — placeholders, and
 * its text has none either; by number, the three „Zu Z 1" were one key, and
 * refused (01.10.2026). The title is compared as printed, not guessed at —
 * and as THIS side's text prints it (`unitTitle`, 02.10.2026): „Art. X3
 * (Änderung des Bundesgesetzes über den Zivildienst)" is how the draft's own
 * text titles the law its Vorlage calls „Änderung des Zivildienstgesetzes
 * 1986", and held against the Vorlage's words it got nothing. Which law of
 * the draft is which of the Vorlage the article pairing says, here by the
 * Stammnorm both promulgation clauses cite (BGBl. Nr. 679/1986).
 */
type ArticleMode = 'single' | 'package' | 'title'

type Side = 'before' | 'after'

/** One document's side of the Ziffer join. */
interface ZifferSide {
  side: Side
  doc: HtmlExplanations
  mode: ArticleMode
  /** Passage key → the passages naming it. */
  byZiffer: Map<string, number[]>
  /** Unit key on this side → the units carrying it; more than one is a duplicate number, and refused. */
  units: Map<string, LawDiffUnit[]>
  /** The passages that belong to a Ziffer: its own and those set under it (`ownedPassages`). */
  owned: Set<number>
  /** § number → the units on this side addressing it — the scope of a passage titled by §. */
  byParagraph: Map<string, LawDiffUnit[]>
  /** The Artikel the document gives an Artikel heading of their own (`HtmlPassage.section`) — see `foreignNumbered`. */
  sectioned: Set<string>
}

/**
 * A Ziffer under its Artikel („2|1"), the empty Artikel for a single law
 * („|4") — one function for a passage's key and a unit's, so the two cannot
 * be keyed two ways.
 */
function zifferKey(article: string | null, ziffer: string): string {
  return `${article ?? ''}|${ziffer.toLowerCase()}`
}

/** A law's title as a key: case, spacing, quotes and the bracket shape („[…]" for „(…)") are typography. */
function lawTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/[„“"”]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s:]+$/, '')
    .trim()
}

/**
 * The unit's law title as one side's text prints it: the draft's own words
 * where they differ from the Vorlage's (`fromArticle`, 22/ME XXVIII „Änderung
 * des Bundesgesetzes über den Zivildienst" against „Änderung des
 * Zivildienstgesetzes 1986"). Each document's Erläuterungen head a law as
 * that document's text titles it, so the title is held against its own side
 * only — never against a similar one.
 */
function unitTitle(unit: LawDiffUnit, side: Side): string | null {
  return side === 'before' ? (unit.fromArticle ?? unit.article) : unit.article
}

/** The key of a Ziffer under its law's title — `title` mode. */
function titleZifferKey(title: string, ziffer: string): string {
  return `T${lawTitleKey(title)}|${ziffer.toLowerCase()}`
}

/** The key of a Ziffer by the § it amends — for passages in a package that marks no Artikel. */
function paragraphZifferKey(paragraphId: string, ziffer: string): string {
  return `§${paragraphId}|${ziffer.toLowerCase()}`
}

/**
 * The key of a Ziffer a Sammelvorlage prints in the numbering of the draft it
 * took the law from (`foreignNumbered`): under the Vorlage's Artikel heading
 * (`section`), the draft's Artikel and Ziffer.
 */
function foreignZifferKey(section: string, article: string, ziffer: string): string {
  return `F${section}|${article}|${ziffer.toLowerCase()}`
}

/**
 * Whether a passage's Ziffern are numbered as another document numbers them —
 * the draft a Sammelvorlage took the law from (01.10.2026, 129 d.B. XXVIII).
 * Under „Zu Artikel 25 (Änderung des Bundes-Sportförderungsgesetzes 2017):"
 * the Vorlage writes „Zu Art. 3 Z 48 (§ 40 BSFG 2017 …):", and under „Zu
 * Artikel 23 (Änderung des KommAustria-Gesetzes) und Artikel 24 (Änderung
 * des ORF-Gesetzes):" „Zu Art. 1 Z 1 (§ 6 Abs. 2 KOG) und zu Art. 2 Z 1
 * (§ 6a Abs. 2 ORF-G):" — the Artikel numbers of 24/ME. Its own Artikel 3 is
 * the Amtshaftungsgesetz, its Artikel 1 the AVG: read by the number, the
 * passage was another law's Ziffer.
 *
 * Foreign is a passage none of whose Ziffern stands under an Artikel of the
 * heading in force, and every one of whose Artikel the document heads
 * elsewhere as a law of its own. Where it does not — a Vorlage that leaves
 * out the heading „Zu Art. 4 (…)" and goes on „Zu Art. 4 Z 1 …" under
 * Artikel 3's (165/ME XXVI) — the passage's number is the Vorlage's own, as
 * before.
 */
function foreignNumbered(passage: HtmlPassage, sectioned: ReadonlySet<string>): boolean {
  const { section, ziffern } = passage
  if (!section || ziffern.length === 0) return false
  return ziffern.every((z) => z.article !== null && !section.includes(z.article) && sectioned.has(z.article))
}

/** The Ziffer and Artikel a unit carries on one side — none on the side where it does not exist (inserted, removed). */
function unitZiffer(unit: LawDiffUnit, side: Side): { ziffer: string | null; article: string | null } {
  if (side === 'after') return unit.change === 'removed' ? { ziffer: null, article: null } : { ziffer: zifferOfId(unit.id), article: unit.articleKey }
  return unit.change === 'inserted' ? { ziffer: null, article: null } : { ziffer: zifferOfId(unit.fromId), article: unit.fromArticleKey }
}

/** Present on both sides — what a Ziffer entry is built for. */
function isPaired(unit: LawDiffUnit): boolean {
  return unit.change === 'changed' || unit.change === 'unchanged'
}

/** Present on this side: everything but a removed unit in the Vorlage and an inserted one in the draft. */
function existsOn(unit: LawDiffUnit, side: Side): boolean {
  return side === 'after' ? unit.change !== 'removed' : unit.change !== 'inserted'
}

/**
 * The unit's keys on one side, in the order they are asked: by Artikel, then
 * (in a package) by its §, and last — for a passage in the other side's
 * numbering (`foreignNumbered`) — by this side's Artikel heading and the
 * other side's Artikel and Ziffer. None on the side where it does not exist.
 */
function sideKeys(unit: LawDiffUnit, side: Side, mode: ArticleMode, ambiguous: ReadonlySet<string>): string[] {
  const { ziffer, article } = unitZiffer(unit, side)
  if (!ziffer) return []
  if (mode === 'single') return [zifferKey(null, ziffer)]
  if (mode === 'title') {
    const title = unitTitle(unit, side)
    return title ? [titleZifferKey(title, ziffer)] : []
  }
  const keys = article ? [zifferKey(article, ziffer)] : []
  const para = addressedParagraphOf(unit)
  const id = explanationParaId(para)
  if (para && id && !ambiguous.has(para)) keys.push(paragraphZifferKey(id, ziffer))
  const other = unitZiffer(unit, side === 'after' ? 'before' : 'after')
  if (article && other.article && other.ziffer) keys.push(foreignZifferKey(article, other.article, other.ziffer))
  return keys
}

/** The keys a passage's Ziffer goes under on a side — see `ArticleMode` and `foreignNumbered`. */
function passageKeys(side: Pick<ZifferSide, 'mode' | 'sectioned'>, passage: HtmlPassage, z: { article: string | null; ziffer: string }): string[] {
  if (side.mode === 'single') return [zifferKey(null, z.ziffer)]
  // By title only a Ziffer of the heading's own law: one another Artikel
  // names has a number this side does not print.
  if (side.mode === 'title') return passage.law && z.article === passage.article ? [titleZifferKey(passage.law, z.ziffer)] : []
  if (z.article && foreignNumbered(passage, side.sectioned)) return passage.section!.map((s) => foreignZifferKey(s, z.article!, z.ziffer))
  if (z.article) return [zifferKey(z.article, z.ziffer)]
  return passage.paragraphs.map((p) => explanationParaId(p)).flatMap((id) => (id ? [paragraphZifferKey(id, z.ziffer)] : []))
}

/**
 * From this share of shared units on (of all the two sides' passages cover)
 * the passages explain the same changes. Exact below ten units — „Zu Z 1:" +
 * „Zu Z 2:" against „Zu Z 1 und 2:" share one of two and stay apart — and a
 * unit of slack per ten from there, for the cross-sectional passage
 * whose list of twenty Ziffern gained one in the Vorlage („Zu Art. 2 Z 1 bis
 * 3, Z 8 bis Z 18, …", 131/ME XXVI). Measured 01.10.2026 over GP XXVI–XXVIII,
 * on the paired units alone: exact equality left 129, 329 and 272 units
 * without a verdict, 0,9 left 90, 309 and 187; 0,8 would cut further into
 * groups of four and five.
 */
const SAME_SCOPE_AT = 0.9

function sameScope(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  const shared = [...a].filter((k) => b.has(k)).length
  const all = a.size + b.size - shared
  return all > 0 && shared / all >= SAME_SCOPE_AT
}

/** „Zu § 6 Abs. 4:", „Zu Abs. 4a:", „Zu lit. b:", a definition's „Zu Z 4: Diese …" — a heading below a Ziffer's. */
const SUB_HEADING_RE = /^zu\s+(?:§|abs\b|lit\b|z\s*\d)/i

/**
 * A passage and the sub-passages the ressort set under it.
 *
 * „Zu Z 3 (§ 6 Abs. 4 und 5):" often has no text of its own and is explained
 * in „Zu § 6 Abs. 4:" and „Zu § 6 Abs. 5:" right below it (8/ME XXVIII), or
 * „Zu Z 2 (§ 10 Abs. 4a bis 4e):" in „Zu Abs. 4a:" … „Zu Abs. 4e:" (48/ME).
 * Those belong to the heading above: they name no Ziffer of their own, stand
 * under the same Artikel, and name no § it does not. The first passage that
 * breaks one of these ends the run.
 *
 * Under a heading titled by § alone, only one naming no § at all: „Zu Abs.
 * 1:" and „Zu Abs. 9:" under „Zu § 267a:" (4/ME XXVIII). One naming a § is a
 * sibling, and it stands at its own § in every join anyway. Read by the rule
 * above, „Zu § 3 Abs. 1 und 2, § 9 Abs. 3, § 34, …" (35/ME XXVI, some 170 §§
 * in nine laws) took every passage after it whose § it lists — a stretch of
 * the Besonderer Teil — as its own (02.10.2026).
 */
function ownedPassages(doc: HtmlExplanations, index: number): number[] {
  const head = doc.special[index]!
  const paras = new Set(head.paragraphs.map((p) => explanationParaId(p)))
  const out = [index]
  for (let i = index + 1; i < doc.special.length; i++) {
    const p = doc.special[i]!
    if (p.ziffern.length > 0 || p.article !== head.article || !SUB_HEADING_RE.test(p.heading)) break
    const named = addressOf(leadingAddress(p.heading)).paragraphs
    if (named.some((x) => !paras.has(explanationParaId(x)))) break
    if (head.ziffern.length === 0 && named.length > 0) break
    out.push(i)
  }
  return out
}

/**
 * The § join's input: per key the passages titled by that §, each with the
 * sub-passages set under it (`ownedPassages`), in printed order — the reading
 * the Ziffer join and the join by the unit's own § already had (02.10.2026).
 * „Zu § 267a:" in 4/ME XXVIII has no text of its own; its Begründung stands
 * in „Zu Abs. 1:" and „Zu Abs. 9:" below it, which name no §, so keyed by
 * their own address they reached no Paragraph, and § 267a UGB showed none.
 */
function ownedTexts(doc: HtmlExplanations, byKey: Map<string, HtmlPassage[]>): Map<string, string> {
  const index = new Map(doc.special.map((p, i) => [p, i]))
  return new Map([...byKey].map(([key, passages]) => [key, textOf(doc, passages.map((p) => index.get(p)!))]))
}

/** The joined text of passages with their sub-passages, in printed order. */
function textOf(doc: HtmlExplanations, passages: readonly number[]): string {
  const all = new Set(passages.flatMap((i) => ownedPassages(doc, i)))
  return [...all]
    .sort((a, b) => a - b)
    .flatMap((i) => doc.special[i]!.text)
    .join(' ')
}

/**
 * Whether a side keys its laws by title (`ArticleMode`): its units carry no
 * Artikel number, but at least two laws, and the document heads at least two
 * of them by their exact title.
 */
function titledLaws(units: readonly LawDiffUnit[], doc: HtmlExplanations, side: Side): boolean {
  if (units.some((u) => unitZiffer(u, side).article)) return false
  const titles = new Set(units.flatMap((u) => {
    const title = unitTitle(u, side)
    return title ? [lawTitleKey(title)] : []
  }))
  if (titles.size < 2) return false
  const headed = new Set(doc.special.flatMap((p) => (p.law ? [lawTitleKey(p.law)] : [])))
  return [...titles].filter((t) => headed.has(t)).length >= 2
}

/** One side of the Ziffer join, out of the units and that side's document. */
function zifferSide(units: readonly LawDiffUnit[], doc: HtmlExplanations, side: Side, ambiguous: ReadonlySet<string>): ZifferSide {
  const unitArticles = new Set(units.filter((u) => unitZiffer(u, side).ziffer).map((u) => unitZiffer(u, side).article ?? ''))
  const passageArticles = new Set(doc.special.flatMap((p) => p.ziffern.map((z) => z.article ?? '')))
  const titled = titledLaws(units.filter((u) => unitZiffer(u, side).ziffer), doc, side)
  const mode: ArticleMode = titled ? 'title' : unitArticles.size <= 1 && passageArticles.size <= 1 ? 'single' : 'package'
  const map = new Map<string, LawDiffUnit[]>()
  const byParagraph = new Map<string, LawDiffUnit[]>()
  for (const u of units) {
    for (const key of sideKeys(u, side, mode, ambiguous)) map.set(key, [...(map.get(key) ?? []), u])
    const id = explanationParaId(addressedParagraphOf(u))
    if (id && existsOn(u, side)) byParagraph.set(id, [...(byParagraph.get(id) ?? []), u])
  }
  const byZiffer = new Map<string, number[]>()
  const owned = new Set<number>()
  const sectioned = new Set(doc.special.flatMap((p) => p.section ?? []))
  doc.special.forEach((p, i) => {
    if (p.ziffern.length > 0) for (const j of ownedPassages(doc, i)) owned.add(j)
    for (const z of p.ziffern) {
      for (const key of passageKeys({ mode, sectioned }, p, z)) {
        const list = byZiffer.get(key) ?? []
        if (!list.includes(i)) list.push(i)
        byZiffer.set(key, list)
      }
    }
  })
  return { side, doc, mode, byZiffer, units: map, owned, byParagraph, sectioned }
}

/**
 * Whether a passage titled by § is about this unit's law — the § join's own
 * rule: a § number no second Artikel of the draft addresses is the unit's,
 * a shared one only under the unit's Artikel.
 */
function sameLaw(side: ZifferSide, passage: HtmlPassage, unit: LawDiffUnit, ambiguous: ReadonlySet<string>): boolean {
  if (side.mode === 'title') {
    const title = unitTitle(unit, side.side)
    return passage.law !== null && title !== null && lawTitleKey(passage.law) === lawTitleKey(title)
  }
  if (side.mode === 'single' || !ambiguous.has(addressedParagraphOf(unit) ?? '')) return true
  return passage.article !== null && passage.article === unitZiffer(unit, side.side).article
}

/**
 * The passages a ressort titled by § alone that name the unit's § — „Zu § 11
 * Abs. 1b und 2:" in a draft whose Vorlage then writes „Zu Z 9 und 10 (§ 11
 * Abs. 1b und 2):" (48/ME XXVIII). A passage that belongs to a Ziffer is not
 * among them: it is that Ziffer's, not every change's to the same §.
 */
function paragraphPassages(side: ZifferSide, unit: LawDiffUnit, ambiguous: ReadonlySet<string>): number[] {
  const id = explanationParaId(addressedParagraphOf(unit))
  if (!id) return []
  const out: number[] = []
  side.doc.special.forEach((p, i) => {
    if (side.owned.has(i) || p.ziffern.length > 0) return
    if (p.paragraphs.some((x) => explanationParaId(x) === id) && sameLaw(side, p, unit, ambiguous)) out.push(i)
  })
  return out
}

/**
 * The §§ a Novellierungsanordnung amends on one side, as `explanationParaId`s
 * — its one addressed §, or every § of an instruction over several
 * (`instructionParagraphs`). Read from that side's own text.
 */
function unitParagraphIds(unit: LawDiffUnit, side: Side): Set<string> {
  const line = (side === 'after' ? unit.toText ?? unit.fromText : unit.fromText ?? unit.toText) ?? unit.heading ?? ''
  const ids = new Set<string>()
  // And every § the instruction's own sentence names before its colon:
  // „Nach § 281 werden § 281a bis § 281c … eingefügt" amends no § the
  // grammar types, „Der bisherige § 14a erhält die Bezeichnung „§ 14."" the
  // one in quotes — both are what a passage heading names.
  const head = line.split(':')[0] ?? line
  for (const p of [addressedParagraph(line), ...instructionParagraphs(line), ...addressOf(head).paragraphs]) {
    const id = explanationParaId(p)
    if (id) ids.add(id)
  }
  return ids
}

/**
 * Whether a Ziffer passage can be this unit's where SEVERAL passages name
 * its Ziffer: where a heading names §§, one of them must be a § the unit
 * amends. Two passages name „Z 6" in 2/ME
 * XXVIII — „Zu Z 6 und 7 (§§ 17 und 18 EUStA-DG)" and „Zu Z 5 und 6 (§ 23a
 * EUStA-DG, …)", the second another law's Z 6 under a mark the parser did not
 * see — and only the first is about the Z 6 that amends § 17; 34/ME the
 * same with „Zu Z 13 (§ 23):" and „Zu Z 13 (§ 26 Abs. 2):". A heading naming
 * no §, or a unit whose § cannot be read (a table of contents, an inserted
 * §), is not judged.
 */
function fitsParagraphs(passage: HtmlPassage, unit: LawDiffUnit, side: Side): boolean {
  if (passage.paragraphs.length === 0) return true
  const own = unitParagraphIds(unit, side)
  if (own.size === 0) return true
  return passage.paragraphs.some((p) => own.has(explanationParaId(p) ?? ''))
}

/** „124b" → „124": the number a § designation is built on. */
function paragraphBase(id: string): string {
  return /^\d+/.exec(id)?.[0] ?? id
}

/** One side's passages for a unit, with the document they stand in. */
interface FoundPassages {
  doc: HtmlExplanations
  passages: number[]
  byParagraph: boolean
}

/**
 * Whether one side's passage to the unit's Ziffer explains another § — the
 * document counting its Ziffern off its own text (02.10.2026). 24/ME XXVIII
 * explains its Z 47, which replaces § 39, under „Zu Art. 3 Z 47 (§ 40 BSFG
 * 2017 samt Überschrift):" — the passage of its Z 48 —, while the Vorlage's
 * „Zu Z 47 (§ 39 BSFG 2017 samt Überschrift):" is the right one; held
 * against each other, the pair read „geändert" with 99 % drift.
 *
 * A single passage is otherwise taken as it is (`fitting`: its § list is
 * shorthand for a run of Ziffern), and judged by its §§ alone the guard
 * turned away right passages as well: an Inhaltsverzeichnis entry, an
 * inserted Abschnitt, „§§82h" without a space. So it judges only where the
 * fault can be the document's alone: the misfit passage names this one Ziffer
 * and §§, none of which the instruction amends or shares a number with
 * („§ 124" for § 124b is a slip, not another §); the instruction reads the
 * same §§ on both sides, so our reading of it is not what differs; and the
 * other side's passages all name a § it does amend.
 */
function misnumbered(unit: LawDiffUnit, me: FoundPassages, rv: FoundPassages): boolean {
  const own = unitParagraphIds(unit, 'before')
  const ownAfter = unitParagraphIds(unit, 'after')
  if (own.size === 0 || own.size !== ownAfter.size || [...own].some((x) => !ownAfter.has(x))) return false
  const bases = new Set([...own].map(paragraphBase))
  // A slip drops a letter („§ 124" for § 124b); one that adds a letter to
  // the § the instruction amends names another §: „Zu Z 13 (§ 82j samt
  // Überschrift):" in 54/ME XXVIII's Vorlage is the passage of its Z 14,
  // which inserts § 82j, not of Z 13 on § 82 Abs. 29 (02.10.2026).
  const slip = (id: string) => (own.has(paragraphBase(id)) ? id === paragraphBase(id) : bases.has(paragraphBase(id)))
  const misfit = (f: FoundPassages, side: Side) => {
    if (f.byParagraph || f.passages.length !== 1) return false
    const p = f.doc.special[f.passages[0]!]!
    return p.ziffern.length === 1 && p.paragraphs.length > 0 && !fitsParagraphs(p, unit, side) && !p.paragraphs.some((x) => slip(explanationParaId(x) ?? ''))
  }
  const fits = (f: FoundPassages, side: Side) => !f.byParagraph && f.passages.every((i) => f.doc.special[i]!.paragraphs.length > 0 && fitsParagraphs(f.doc.special[i]!, unit, side))
  return (misfit(me, 'before') && fits(rv, 'after')) || (misfit(rv, 'after') && fits(me, 'before'))
}

/**
 * What became of a unit the Ziffer join took but gave no Ziffer entry — for
 * the measurement (`scripts/corpus/aenderungsrate.ts --ziffer`), not for the
 * page: `scope` — both sides explain it, in passages over different sets of
 * changes, so shown without a verdict; `oneSided` — inserted or removed, so the § join
 * took it; `paragraphTitled` — compared, but one side or both explain it in
 * a passage titled by its § alone; `none` — one side explains it by neither
 * its Ziffer nor its §; `misnumbered` — both explain it, but one document's
 * passage to its Ziffer is about another § (`misnumbered`).
 */
export type ZifferFallback = 'scope' | 'oneSided' | 'paragraphTitled' | 'none' | 'misnumbered'

export interface ReasoningComparisonAtZiffer extends ReasoningComparison {
  /** Units of the Ziffer join that are not plainly Ziffer against Ziffer, and where they went. */
  fallbacks: Record<string, ZifferFallback>
  /** How many units the Ziffer join took, how many went the § join from the start, how many are §§ joined by their own designation. */
  routes: { ziffer: number; paragraph: number; ownParagraph: number }
  /** Ziffer passages a unit's key found but `fitsParagraphs` turned away — `diffUnitKey`, side, heading. */
  guarded: { unit: string; side: Side; heading: string }[]
  /** For every unit the scope rule left without a verdict, the units each side's passages cover. */
  scopes: { unit: string; before: string[]; after: string[] }[]
}

/**
 * The comparison the service ships (01.10.2026) — see the file header for
 * the rule, and docs/architecture.md §12.10b for the measurement behind
 * each branch:
 *
 *  1. A Novellierungsanordnung present on both sides, where both documents
 *     title passages by Ziffer: on each side the passages of its Ziffer —
 *     or, where that side titles it by § („Zu § 11 Abs. 1b und 2:", a draft
 *     the Vorlage re-titles by Ziffer), the passages titled by its § alone.
 *     Compared where both sides' passages cover the same units; otherwise
 *     shown without a verdict. Never another Ziffer's passage, which is
 *     what the § join handed it until now.
 *  2. An inserted or removed Novellierungsanordnung: there is no Ziffer on
 *     the other side to hold it against, so the § join as before — its
 *     entry says „Paragraph", and the Begründung of the Paragraph is what
 *     moved with it.
 *  3. Everything else — any unit that is neither a § nor a Ziffer, every
 *     unit of a draft one of whose documents titles nothing by Ziffer: the §
 *     join as before, unchanged (`compareReasoningByParagraph`).
 *  4. A unit that IS a §, last: the passages titled by its own designation
 *     (`joinOwnParagraph`) — after everything else, so a new law's §§ never
 *     take the ceiling from an entry the layer showed before.
 */
export function compareReasoning(units: readonly LawDiffUnit[], before: HtmlExplanations, after: HtmlExplanations): ReasoningComparisonAtZiffer {
  const ambiguous = ambiguousParagraphs(units)
  const f: Filling = { out: { units: {}, entries: {}, stats: { compared: 0, changed: 0, uncompared: 0 } }, skipped: new Set() }
  const fallbacks: Record<string, ZifferFallback> = {}

  const titled = before.special.some((p) => p.ziffern.length > 0) && after.special.some((p) => p.ziffern.length > 0)
  const z = titled ? { before: zifferSide(units, before, 'before', ambiguous), after: zifferSide(units, after, 'after', ambiguous) } : null

  const guarded = new Map<string, { unit: string; side: Side; heading: string }>()
  const scopes: { unit: string; before: string[]; after: string[] }[] = []
  /**
   * The first of the unit's keys that finds passages that fit its §§
   * (`fitsParagraphs`). A key two units share (a duplicate „Z 3" in one
   * Artikel) is refused: its passage would be the other's too.
   */
  /**
   * The passages under one key that can be this unit's. One passage is taken
   * as it is: its § list is the ressort's shorthand for a run of Ziffern
   * („Zu Z 54 bis 58 (§ 40 Abs. 1, 3 bis 5 und § 48 Abs. 9)" explains Z 54 on
   * § 39 too, 61/ME XXVIII), and judged by it alone the guard turned away
   * hundreds of right passages (measured 01.10.2026: 78, 333 and 472 in
   * XXVIII, XXVII, XXVI). Several are a clash, and there the §§ decide;
   * where none fits, the unit gets none — which is its own the headings
   * cannot say.
   */
  const fitting = (side: ZifferSide, key: string, unit: LawDiffUnit): number[] => {
    const found = side.byZiffer.get(key) ?? []
    // A passage in another document's numbering is held to the §§ even
    // alone: its number was read past the Artikel heading it stands under,
    // and the § is the second witness that it is this unit's law.
    if (found.length < 2 && !key.startsWith('F')) return found
    const fits = found.filter((i) => fitsParagraphs(side.doc.special[i]!, unit, side.side))
    for (const i of found) {
      if (fits.includes(i)) continue
      guarded.set(`${diffUnitKey(unit)}|${side.side}|${i}`, { unit: diffUnitKey(unit), side: side.side, heading: side.doc.special[i]!.heading })
    }
    return fits
  }
  /** `diffUnitKey|side` of every unit a side found through the other document's numbering (`foreignNumbered`). */
  const viaForeign = new Set<string>()
  const lookup = (side: ZifferSide, unit: LawDiffUnit): number[] => {
    for (const key of sideKeys(unit, side.side, side.mode, ambiguous)) {
      if ((side.units.get(key)?.length ?? 0) !== 1) continue
      const found = fitting(side, key, unit)
      if (found.length && key.startsWith('F')) viaForeign.add(`${diffUnitKey(unit)}|${side.side}`)
      if (found.length) return found
    }
    return []
  }
  /**
   * The units a side's passages cover, as `diffUnitKey`s: by their Ziffern,
   * or — for a passage titled by § — every unit of the same law addressing
   * one of its §§. Inserted and removed units count: „Zu Z 26 (§ 122 Abs. 1):"
   * in the draft against „Zu Z 31 und 32 (§ 122 Abs. 1 und 2):" in the
   * Vorlage, whose Z 32 is new (41/ME XXVIII), is a passage that now also
   * explains another change — a regrouping, so no verdict. A long list that
   * merely gained or lost one Ziffer stays comparable through `sameScope`.
   */
  const cover = (side: ZifferSide, passages: readonly number[]): Set<string> => {
    const out = new Set<string>()
    for (const i of passages) {
      const passage = side.doc.special[i]!
      for (const zi of passage.ziffern) {
        for (const key of passageKeys(side, passage, zi)) {
          for (const u of side.units.get(key) ?? []) if (fitting(side, key, u).includes(i)) out.add(diffUnitKey(u))
        }
      }
      if (passage.ziffern.length > 0) continue
      // A change the side explains under its own Ziffer is not this passage's.
      for (const para of passage.paragraphs) {
        for (const u of side.byParagraph.get(explanationParaId(para) ?? '') ?? []) {
          if (sameLaw(side, passage, u, ambiguous) && !lookup(side, u).length) out.add(diffUnitKey(u))
        }
      }
    }
    return out
  }
  /** The unit's passages on a side: its Ziffer's, else those titled by its § alone. */
  const passagesOf = (side: ZifferSide, unit: LawDiffUnit): { passages: number[]; byParagraph: boolean } => {
    const own = lookup(side, unit)
    return own.length ? { passages: own, byParagraph: false } : { passages: paragraphPassages(side, unit, ambiguous), byParagraph: true }
  }
  const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)
  const headingsOf = (doc: HtmlExplanations, passages: readonly number[]) =>
    sorted(passages)
      .map((i) => doc.special[i]!.heading)
      .join(' · ')

  const atParagraph: LawDiffUnit[] = []
  const oneSided: LawDiffUnit[] = []
  const ownParagraph: LawDiffUnit[] = []
  let zifferRoute = 0
  for (const unit of units) {
    // A § of a new law: by its own designation, after everything else
    // (below). The § join never gave it one — it addresses nothing
    // (`addressedParagraphOf`), so taking it out of that list moves nothing.
    if (isParagraphUnit(unit)) {
      ownParagraph.push(unit)
      continue
    }
    if (!z || !zifferOfId(unit.id)) {
      atParagraph.push(unit)
      continue
    }
    zifferRoute++
    if (!isPaired(unit)) {
      fallbacks[diffUnitKey(unit)] = 'oneSided'
      oneSided.push(unit)
      continue
    }
    const me = passagesOf(z.before, unit)
    const rv = passagesOf(z.after, unit)
    if (!me.passages.length || !rv.passages.length) {
      fallbacks[diffUnitKey(unit)] = 'none'
      continue
    }
    // Found on one side through the other document's numbering: then the
    // passages of BOTH sides must name a § the unit amends. 24/ME XXVIII
    // counts its own Ziffern one off at the end of its Artikel 3 („Zu Art. 3
    // Z 48 (§ 44 Abs. 7 …)" explains its Z 49), and the Vorlage's right
    // passage to Z 48 would have been held against the draft's wrong one.
    if (
      (viaForeign.has(`${diffUnitKey(unit)}|before`) || viaForeign.has(`${diffUnitKey(unit)}|after`)) &&
      !(me.passages.every((i) => fitsParagraphs(before.special[i]!, unit, 'before')) && rv.passages.every((i) => fitsParagraphs(after.special[i]!, unit, 'after')))
    ) {
      fallbacks[diffUnitKey(unit)] = 'none'
      continue
    }
    // One side's own passage is about another § than the other side's: that
    // document numbers its Ziffern off its own text (`misnumbered`).
    if (misnumbered(unit, { doc: before, ...me }, { doc: after, ...rv })) {
      fallbacks[diffUnitKey(unit)] = 'misnumbered'
      continue
    }
    const a = cover(z.before, me.passages)
    const b = cover(z.after, rv.passages)
    if (!sameScope(a, b)) {
      fallbacks[diffUnitKey(unit)] = 'scope'
      scopes.push({ unit: diffUnitKey(unit), before: [...a], after: [...b] })
      // Shown, not compared: the reader gets the Vorlage's Begründung to
      // this change, and no verdict the two texts cannot carry.
      fill(f, unit, `N ${sorted(me.passages).join('+')}|${sorted(rv.passages).join('+')}`, () => ({
        basis: 'ziffer',
        label: headingsOf(after, rv.passages),
        a: textOf(before, me.passages),
        b: textOf(after, rv.passages),
        uncompared: { fromHeading: headingsOf(before, me.passages) },
      }))
      continue
    }
    const key = `Z ${sorted(me.passages).join('+')}|${sorted(rv.passages).join('+')}`
    const byParagraphOnly = me.byParagraph && rv.byParagraph
    fill(f, unit, key, () => ({
      basis: byParagraphOnly ? 'paragraph' : 'ziffer',
      label: byParagraphOnly ? (addressedParagraphOf(unit) ?? '') : headingsOf(after, rv.passages),
      a: textOf(before, me.passages),
      b: textOf(after, rv.passages),
    }))
    // A heading with no text and no sub-passage under it explains as little as none.
    if (!f.out.units[diffUnitKey(unit)]) fallbacks[diffUnitKey(unit)] = 'none'
    else if (me.byParagraph || rv.byParagraph) fallbacks[diffUnitKey(unit)] = 'paragraphTitled'
  }

  // The § join, unique numbers first (see `compareReasoningByParagraph`):
  // the units it always served, and the inserted and removed ones.
  const isAmbiguous = (u: LawDiffUnit) => ambiguous.has(addressedParagraphOf(u) ?? '')
  const rest = [...atParagraph, ...oneSided]
  const texts = (doc: HtmlExplanations) => ({ all: ownedTexts(doc, passagesByParagraph(doc)), byArticle: ownedTexts(doc, passagesByArticleParagraph(doc)) })
  const me = texts(before)
  const rv = texts(after)
  joinAtParagraph(f, [...rest.filter((u) => !isAmbiguous(u)), ...rest.filter(isAmbiguous)], ambiguous, me.all, rv.all, { before: me.byArticle, after: rv.byArticle })
  // Last, so a new law's §§ never take the ceiling from an entry the layer
  // showed before they had one.
  joinOwnParagraph(f, units, ownParagraph, before, after)
  return { ...finish(f.out), fallbacks, routes: { ziffer: zifferRoute, paragraph: atParagraph.length, ownParagraph: ownParagraph.length }, guarded: [...guarded.values()], scopes }
}

/** „§9" → „9", „§5a" → „5a"; null for anything else — a duplicate number („§9#dup") is refused. */
function paragraphOfId(id: string | null): string | null {
  const m = /^§(\d+[a-z]*)$/i.exec(id ?? '')
  return m ? m[1]!.toLowerCase() : null
}

/** The § and Artikel a § unit carries on one side — none on the side where it does not exist. */
function unitParagraph(unit: LawDiffUnit, side: Side): { para: string | null; article: string | null } {
  if (!existsOn(unit, side)) return { para: null, article: null }
  return side === 'after' ? { para: paragraphOfId(unit.id), article: unit.articleKey } : { para: paragraphOfId(unit.fromId), article: unit.fromArticleKey }
}

/** One document's side of the join by the unit's own §: which passages each § unit finds there. */
interface OwnSide {
  /** `diffUnitKey` → the passages titled by its §, in printed order. */
  found: Map<string, number[]>
  /** Passage → the § units it was found for: the scope of a passage. */
  covers: Map<number, Set<string>>
}

/** What may stand in a § heading's own address beside `ADDRESS_WORD_RE`: the Artikel of „Zu Art. 2 § 1" (21/ME XXVII). */
const PARAGRAPH_ADDRESS_WORD_RE = /^(?:art\.?|artikel)$/i

/**
 * The §§ a passage is titled by — read from its heading's own address, as
 * `leadingAddress` reads it, not from every § the heading cites: „Zu Abs. 4:
 * Die Regelung … § 2 …" set below „Zu § 6:" is § 6's, and „Zu § 77a Abs. 9
 * vertritt die Kommission … § 40 …" is not § 40's.
 */
function titledParagraphs(passage: HtmlPassage): string[] {
  const out: string[] = []
  for (const word of (passage.heading.split(':')[0] ?? passage.heading).split(/\s+/)) {
    if (/^[§\d(),.–-]/.test(word) || ADDRESS_WORD_RE.test(word) || PARAGRAPH_ADDRESS_WORD_RE.test(word)) out.push(word)
    else break
  }
  return addressOf(out.join(' ')).paragraphs
}

/**
 * The passages one document titles by a § unit's own designation — „Zu § 9:",
 * „Zu § 9 Abs. 2:", „Zu §§ 8 bis 10:" — on one side, in that side's
 * numbering (`fromId`/`fromArticleKey` in the draft, `id`/`articleKey` in the
 * Vorlage).
 *
 * A passage titled by Ziffer is an amendment's, and one set under a Ziffer's
 * heading belongs to that Ziffer (`ownedPassages`): neither is a new law's.
 * The Artikel is read as the Ziffer join reads it (`ArticleMode`): one law on
 * the side, and the Artikel is dropped from the key; several, and the
 * passage must stand under the unit's own Artikel. Where one of the two
 * carries none — a passage under no Artikel mark, a law the draft's text
 * prints without „Artikel 1" — only a § number no other law of the draft
 * carries answers (as § unit or as the § an instruction amends), and never
 * a passage under another law's Artikel. Two units of one key on a side (a
 * duplicate number) are both refused.
 */
function ownSide(units: readonly LawDiffUnit[], doc: HtmlExplanations, side: Side): OwnSide {
  const present = units.filter((u) => existsOn(u, side))
  const articleOf = (u: LawDiffUnit) => (side === 'after' ? u.articleKey : u.fromArticleKey)
  const unitArticles = new Set(present.map((u) => articleOf(u) ?? ''))
  const passageArticles = new Set(doc.special.flatMap((p) => (p.article ? [p.article] : [])))
  const mode: ArticleMode = unitArticles.size <= 1 && passageArticles.size <= 1 ? 'single' : 'package'

  /** § number → the § units carrying it on this side. */
  const byParagraph = new Map<string, LawDiffUnit[]>()
  /** § number → every law of the draft (by Artikel) that carries or amends it on this side. */
  const laws = new Map<string, Set<string>>()
  const addLaw = (para: string, law: string) => laws.set(para, (laws.get(para) ?? new Set<string>()).add(law))
  for (const u of present) {
    const law = articleOf(u) ?? ''
    if (!isParagraphUnit(u)) {
      for (const para of unitParagraphIds(u, side)) addLaw(para, law)
      continue
    }
    const { para } = unitParagraph(u, side)
    if (!para) continue
    byParagraph.set(para, [...(byParagraph.get(para) ?? []), u])
    addLaw(para, law)
  }
  /** The one § unit a passage under `article` titled by `para` is about — or none. */
  const unitFor = (article: string | null, para: string): LawDiffUnit | null => {
    const all = byParagraph.get(para) ?? []
    let hits: LawDiffUnit[]
    if (mode === 'single') hits = all
    else if (article && all.some((u) => articleOf(u) === article)) hits = all.filter((u) => articleOf(u) === article)
    else {
      // One side without an Artikel: only a number of one law, and not
      // under the Artikel of a different one.
      if ((laws.get(para)?.size ?? 0) !== 1) return null
      hits = all.filter((u) => !article || !articleOf(u))
    }
    return hits.length === 1 ? hits[0]! : null
  }

  const owned = new Set<number>()
  doc.special.forEach((p, i) => {
    if (p.ziffern.length > 0) for (const j of ownedPassages(doc, i)) owned.add(j)
  })
  const found = new Map<string, number[]>()
  const covers = new Map<number, Set<string>>()
  doc.special.forEach((p, i) => {
    if (owned.has(i) || p.ziffern.length > 0) return
    for (const designation of titledParagraphs(p)) {
      const para = explanationParaId(designation)
      const unit = para ? unitFor(p.article, para) : null
      if (!unit) continue
      const unitKey = diffUnitKey(unit)
      const list = found.get(unitKey) ?? []
      if (!list.includes(i)) list.push(i)
      found.set(unitKey, list)
      covers.set(i, (covers.get(i) ?? new Set<string>()).add(unitKey))
    }
  })
  return { found, covers }
}

/**
 * THE § OF A NEW LAW, BY ITS OWN DESIGNATION (01.10.2026). A unit that IS a §
 * addresses nothing (`addressedParagraphOf`: read as an instruction, its law
 * text gave the §§ it cites), so the § join never gave it a Begründung. The
 * ressorts explain a new law by § („Zu § 9:"), and that is the join: the
 * unit's own § against the passages titled by it, on each side through the
 * unit pairing. The same rules as the Ziffer join — one entry per pair of
 * passages, compared only where both sides' passages cover the same §§
 * (`sameScope`, a draft's „Zu § 1:" and „Zu § 2:" against the Vorlage's „Zu
 * §§ 1 und 2:" is a regrouping), shown without a verdict otherwise — and only
 * for a § present on both sides: an inserted or removed one has no passage
 * on the other side to be held against.
 */
function joinOwnParagraph(f: Filling, units: readonly LawDiffUnit[], candidates: readonly LawDiffUnit[], before: HtmlExplanations, after: HtmlExplanations): void {
  if (!candidates.some(isPaired)) return
  const me = ownSide(units, before, 'before')
  const rv = ownSide(units, after, 'after')
  const cover = (side: OwnSide, passages: readonly number[]) => new Set(passages.flatMap((i) => [...(side.covers.get(i) ?? [])]))
  const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)
  const headingsOf = (doc: HtmlExplanations, passages: readonly number[]) =>
    sorted(passages)
      .map((i) => doc.special[i]!.heading)
      .join(' · ')
  for (const unit of candidates) {
    if (!isPaired(unit)) continue
    const a = me.found.get(diffUnitKey(unit)) ?? []
    const b = rv.found.get(diffUnitKey(unit)) ?? []
    if (!a.length || !b.length) continue
    const pair = `${sorted(a).join('+')}|${sorted(b).join('+')}`
    if (!sameScope(cover(me, a), cover(rv, b))) {
      fill(f, unit, `PN ${pair}`, () => ({
        basis: 'paragraph',
        label: headingsOf(after, b),
        a: textOf(before, a),
        b: textOf(after, b),
        uncompared: { fromHeading: headingsOf(before, a) },
      }))
      continue
    }
    fill(f, unit, `P ${pair}`, () => ({ basis: 'paragraph', label: displayId(unit.id), a: textOf(before, a), b: textOf(after, b) }))
  }
}
