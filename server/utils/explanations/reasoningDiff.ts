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
 * WHAT STAYS PER §. A unit that IS a § (a new law, `isParagraphUnit`), a
 * unit that is neither, every unit of a draft one of whose documents titles
 * no passage by Ziffer at all, and an inserted or removed instruction, which
 * has no Ziffer on the other side to be held against: the § join as before,
 * unchanged — below. Measured old against new over GP XXVI–XXVIII
 * (`aenderungsrate.ts --ziffer`, §12.10b): units with a Begründung shown,
 * compared or not, 2.036 → 2.461, 4.864 → 5.772, 2.272 → 2.455.
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
import { diffTokens } from '../diff/wordDiff'
import { addressedParagraph, addressedParagraphOf, instructionParagraphs } from '../lawtext/instructionAddress'
import { passagesByArticleParagraph, passagesByParagraph, type HtmlExplanations, type HtmlPassage } from './explanationsHtml'
import { addressOf } from './risExplanations'
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
 */
function ambiguousParagraphs(units: readonly LawDiffUnit[]): Set<string> {
  const articles = new Map<string, Set<string>>()
  for (const unit of units) {
    const para = addressedParagraphOf(unit)
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
function uncomparedOf(label: string, fromHeading: string, a: string, b: string): ReasoningDiffEntry {
  return { basis: 'ziffer', label, comparable: false, fromHeading, drift: null, changed: false, segments: null, fromText: a || null, toText: b }
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
      ? uncomparedOf(label, uncompared.fromHeading, a, b)
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
 */
type ArticleMode = 'single' | 'package'

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
}

/**
 * A Ziffer under its Artikel („2|1"), the empty Artikel for a single law
 * („|4") — one function for a passage's key and a unit's, so the two cannot
 * be keyed two ways.
 */
function zifferKey(article: string | null, ziffer: string): string {
  return `${article ?? ''}|${ziffer.toLowerCase()}`
}

/** The key of a Ziffer by the § it amends — for passages in a package that marks no Artikel. */
function paragraphZifferKey(paragraphId: string, ziffer: string): string {
  return `§${paragraphId}|${ziffer.toLowerCase()}`
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
 * (in a package) by its §. None on the side where it does not exist.
 */
function sideKeys(unit: LawDiffUnit, side: Side, mode: ArticleMode, ambiguous: ReadonlySet<string>): string[] {
  const { ziffer, article } = unitZiffer(unit, side)
  if (!ziffer) return []
  if (mode === 'single') return [zifferKey(null, ziffer)]
  const keys = article ? [zifferKey(article, ziffer)] : []
  const para = addressedParagraphOf(unit)
  const id = explanationParaId(para)
  if (para && id && !ambiguous.has(para)) keys.push(paragraphZifferKey(id, ziffer))
  return keys
}

/** The keys a passage's Ziffer goes under on a side — see `ArticleMode`. */
function passageKeys(mode: ArticleMode, passage: HtmlPassage, z: { article: string | null; ziffer: string }): string[] {
  if (mode === 'single') return [zifferKey(null, z.ziffer)]
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
 */
function ownedPassages(doc: HtmlExplanations, index: number): number[] {
  const head = doc.special[index]!
  const paras = new Set(head.paragraphs.map((p) => explanationParaId(p)))
  const out = [index]
  for (let i = index + 1; i < doc.special.length; i++) {
    const p = doc.special[i]!
    if (p.ziffern.length > 0 || p.article !== head.article || !SUB_HEADING_RE.test(p.heading)) break
    if (addressOf(leadingAddress(p.heading)).paragraphs.some((x) => !paras.has(explanationParaId(x)))) break
    out.push(i)
  }
  return out
}

/** The words an address is made of — what may stand in „Zu § 6 Abs. 4 und 5 erster Satz". */
const ADDRESS_WORD_RE = /^(?:zu|abs\.?|lit\.?|satz|z|und|sowie|bis|bzw\.?|sublit\.?|erster|zweiter|dritter|vierter|letzter|[a-z])[,;]?$/i

/**
 * A heading's own address, without the sentence it runs on into. „Zu § 77a
 * Abs. 9 vertritt die Kommission die Auffassung … § 40 …" (55/ME XXVIII) is
 * prose the parser opened as a passage; its address is „Zu § 77a Abs. 9",
 * and the § 40 cited in the sentence must not break the run under „Zu Z 1
 * (§ 77a Abs. 9) und Z 4 (§ 356b Abs. 7):" — on both sides it did, and the
 * Ziffer was compared on its one line of text alone.
 */
function leadingAddress(heading: string): string {
  const out: string[] = []
  for (const word of (heading.split(':')[0] ?? heading).split(/\s+/)) {
    if (/^[§\d(),.–-]/.test(word) || ADDRESS_WORD_RE.test(word)) out.push(word)
    else break
  }
  return out.join(' ')
}

/** The joined text of passages with their sub-passages, in printed order. */
function textOf(doc: HtmlExplanations, passages: readonly number[]): string {
  const all = new Set(passages.flatMap((i) => ownedPassages(doc, i)))
  return [...all]
    .sort((a, b) => a - b)
    .flatMap((i) => doc.special[i]!.text)
    .join(' ')
}

/** One side of the Ziffer join, out of the units and that side's document. */
function zifferSide(units: readonly LawDiffUnit[], doc: HtmlExplanations, side: Side, ambiguous: ReadonlySet<string>): ZifferSide {
  const unitArticles = new Set(units.filter((u) => unitZiffer(u, side).ziffer).map((u) => unitZiffer(u, side).article ?? ''))
  const passageArticles = new Set(doc.special.flatMap((p) => p.ziffern.map((z) => z.article ?? '')))
  const mode: ArticleMode = unitArticles.size <= 1 && passageArticles.size <= 1 ? 'single' : 'package'
  const map = new Map<string, LawDiffUnit[]>()
  const byParagraph = new Map<string, LawDiffUnit[]>()
  for (const u of units) {
    for (const key of sideKeys(u, side, mode, ambiguous)) map.set(key, [...(map.get(key) ?? []), u])
    const id = explanationParaId(addressedParagraphOf(u))
    if (id && existsOn(u, side)) byParagraph.set(id, [...(byParagraph.get(id) ?? []), u])
  }
  const byZiffer = new Map<string, number[]>()
  const owned = new Set<number>()
  doc.special.forEach((p, i) => {
    if (p.ziffern.length > 0) for (const j of ownedPassages(doc, i)) owned.add(j)
    for (const z of p.ziffern) {
      for (const key of passageKeys(mode, p, z)) {
        const list = byZiffer.get(key) ?? []
        if (!list.includes(i)) list.push(i)
        byZiffer.set(key, list)
      }
    }
  })
  return { side, doc, mode, byZiffer, units: map, owned, byParagraph }
}

/**
 * Whether a passage titled by § is about this unit's law — the § join's own
 * rule: a § number no second Artikel of the draft addresses is the unit's,
 * a shared one only under the unit's Artikel.
 */
function sameLaw(side: ZifferSide, passage: HtmlPassage, unit: LawDiffUnit, ambiguous: ReadonlySet<string>): boolean {
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

/**
 * What became of a unit the Ziffer join took but gave no Ziffer entry — for
 * the measurement (`scripts/corpus/aenderungsrate.ts --ziffer`), not for the
 * page: `scope` — both sides explain it, in passages over different sets of
 * changes, so shown without a verdict; `oneSided` — inserted or removed, so the § join
 * took it; `paragraphTitled` — compared, but one side or both explain it in
 * a passage titled by its § alone; `none` — one side explains it by neither
 * its Ziffer nor its §.
 */
export type ZifferFallback = 'scope' | 'oneSided' | 'paragraphTitled' | 'none'

export interface ReasoningComparisonAtZiffer extends ReasoningComparison {
  /** Units of the Ziffer join that are not plainly Ziffer against Ziffer, and where they went. */
  fallbacks: Record<string, ZifferFallback>
  /** How many units the Ziffer join took, how many went the § join from the start. */
  routes: { ziffer: number; paragraph: number }
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
 *  3. Everything else — a unit that IS a §, any other unit, every unit of a
 *     draft one of whose documents titles nothing by Ziffer: the § join as
 *     before, unchanged (`compareReasoningByParagraph`).
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
    if (found.length < 2) return found
    const fits = found.filter((i) => fitsParagraphs(side.doc.special[i]!, unit, side.side))
    for (const i of found) {
      if (fits.includes(i)) continue
      guarded.set(`${diffUnitKey(unit)}|${side.side}|${i}`, { unit: diffUnitKey(unit), side: side.side, heading: side.doc.special[i]!.heading })
    }
    return fits
  }
  const lookup = (side: ZifferSide, unit: LawDiffUnit): number[] => {
    for (const key of sideKeys(unit, side.side, side.mode, ambiguous)) {
      if ((side.units.get(key)?.length ?? 0) !== 1) continue
      const found = fitting(side, key, unit)
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
        for (const key of passageKeys(side.mode, passage, zi)) {
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
  let zifferRoute = 0
  for (const unit of units) {
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
  const texts = (doc: HtmlExplanations) => ({ all: passageTexts(passagesByParagraph(doc)), byArticle: passageTexts(passagesByArticleParagraph(doc)) })
  const me = texts(before)
  const rv = texts(after)
  joinAtParagraph(f, [...rest.filter((u) => !isAmbiguous(u)), ...rest.filter(isAmbiguous)], ambiguous, me.all, rv.all, { before: me.byArticle, after: rv.byArticle })
  return { ...finish(f.out), fallbacks, routes: { ziffer: zifferRoute, paragraph: atParagraph.length }, guarded: [...guarded.values()], scopes }
}
