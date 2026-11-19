/**
 * „Hat sich die Begründung geändert?" — the comparison of the Erläuterungen
 * between draft and Regierungsvorlage.
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
 * against new over GP XXVI–XXVIII (`aenderungsrate.ts --ziffer`):
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
 * The right passage is looked for under the neighbouring number, and taken
 * only where the §§ witness that it is this change's (`offsetPassage`,
 * 14.11.2026: 54/ME XXVIII Z 13 and Z 14).
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
 * GP XXVI. Where both documents set the passage under an Artikel
 * (`HtmlPassage.article`) and the unit carries its Artikel number on each
 * side (`articleKey`, `fromArticleKey` — renumbered between draft and
 * Vorlage, 18/ME: 3 → 6), the § is compared under that pair; measured, 292
 * of the 413 come back. What still cannot be keyed stays out, as before.
 */
import type { LawDiffUnit, ReasoningDiffEntry, ReasoningGap } from '../../../shared/types'
import { diffUnitKey } from '../../../shared/utils/diffKey'
import { displayId, isParagraphUnit } from '../../../shared/utils/unitName'
import { diffTokens, isEditorialChange, renumberingOf, sameWording } from '../diff/wordDiff'
import { addressedParagraph, addressedParagraphOf, instructionParagraphs } from '../lawtext/instructionAddress'
import type { HtmlExplanations, HtmlPassage } from './explanationsHtml'
import { ADDRESS_WORD_RE, headingAddress, leadingAddress } from './risExplanations'
// The key of `passagesByParagraph`, and the same reading the page looks up
// with. Its `\b` changes nothing for the designations `parseAddress` builds:
// 0 of 4.215 differ over the offline corpus (22.09.2026). It bites only on a
// raw Gliederungssymbol such as § 365m1, which never reaches here.
import { articleParagraphKey, explanationParaId } from '../../../shared/utils/explanationKey'
import { PARAGRAPH_NUMBER } from '../../../shared/utils/paragraphNumber'
import { articleNumberKey } from '../text/designation'

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
  /** `changed` counts the editorial ones too, as `summarizeDiff` does; `editorial` is the part of it. */
  stats: { compared: number; changed: number; editorial: number; uncompared: number }
}

/** Paragraph number → text, as the § join reads both documents. */
type Texts = ReadonlyMap<string, string>

/**
 * What the comparison reads off a unit's instruction — read once per unit
 * and side for one call of `compareReasoning` or `compareReasoningByParagraph`,
 * and thrown away with it (22.10.2026).
 *
 * Both readings run the Novellierungsanordnungen grammar over the whole
 * instruction, payload included (`parseInstruction`), and the joins asked them
 * again for every passage, key and unit they held against each other: the
 * guard of `fitting`, the scope of `cover`, `sameLaw`, every `sideKeys`.
 * Profiled on XXVI 75/ME, 4,7 s of one synchronous call were 4,2 s of
 * re-parsing the same lines — on the one Node process that serves every
 * visitor. Read once, the three slowest drafts of the offline corpus take
 * 5.053 → 593, 949 → 185 and 896 → 176 ms (XXVI 75/ME, XXVII 264/ME,
 * XXVIII 61/ME, each in a fresh process), and the output of all 353 drafts
 * of GP XXVI–XXVIII with Erläuterungen on both sides is byte for byte the
 * same. What is left of the 593 ms is mostly the grammar reading each
 * instruction those few times.
 *
 * Scoped to the call rather than kept in the module: nothing outlives the
 * comparison it was read for, so nothing has to be bounded or invalidated.
 */
interface Readings {
  /** `addressedParagraphOf`. */
  addressed: (unit: LawDiffUnit) => string | null
  /** `unitParagraphIds`. */
  paragraphIds: (unit: LawDiffUnit, side: Side) => ReadonlySet<string>
}

function readings(): Readings {
  const addressed = new Map<LawDiffUnit, string | null>()
  const ids: Record<Side, Map<LawDiffUnit, ReadonlySet<string>>> = { before: new Map(), after: new Map() }
  return {
    addressed: (unit) => {
      const known = addressed.get(unit)
      if (known !== undefined) return known
      const para = addressedParagraphOf(unit)
      addressed.set(unit, para)
      return para
    },
    paragraphIds: (unit, side) => {
      let known = ids[side].get(unit)
      if (!known) ids[side].set(unit, (known = unitParagraphIds(unit, side)))
      return known
    },
  }
}

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
function ambiguousParagraphs(units: readonly LawDiffUnit[], read: Readings): Set<string> {
  const articles = new Map<string, Set<string>>()
  for (const unit of units) {
    const own = isParagraphUnit(unit) ? paragraphOfId(unit.id) ?? paragraphOfId(unit.fromId) : null
    const para = own ? `§ ${own}` : read.addressed(unit)
    if (!para) continue
    const seen = articles.get(para) ?? new Set<string>()
    seen.add(unit.article ?? '')
    articles.set(para, seen)
  }
  return new Set([...articles].filter(([, seen]) => seen.size > 1).map(([para]) => para))
}

/**
 * The comparison of two texts as an entry.
 *
 * „GEÄNDERT" MEANS A WORD CHANGED (22.10.2026): unchanged is only a passage
 * whose words stand in the same order on both sides once punctuation,
 * spacing and hyphenation are left aside (`sameWording`). Until then it was
 * one with under 2 % of its words different — „below this it is punctuation
 * and whitespace, not a revision", which was false: one word replaced in a
 * passage of more than 50 words stays under 2 %. Measured over the 353 drafts
 * of GP XXVI–XXVIII with Erläuterungen on both sides, 680 of the 4.907
 * Begründungen judged unchanged had changed words — 61/ME XXVIII „Jänner" →
 * „April" and „Juli 2026" → „Jänner 2027", 32/ME „Dezember 2025" → „Juni
 * 2026", 112/ME „RAO" → „RAPG" under „Keine der 34 Begründungen hat das
 * Ressort geändert." Six drafts said „keine" or „nicht geändert" over a
 * changed wording. The floor cut the other way too: 38 passages differing in
 * nothing but a comma, a space or a hyphen („COVID-19 Pandemie" →
 * „COVID-19-Pandemie") read „geändert" for being short.
 *
 * Changed per GP, XXVI to XXVIII: 626 → 741, 2.051 → 2.472, 747 → 853 of
 * 1.589, 4.866 and 1.883 compared. Read one by one, 37 of the 680 are
 * spelling alone — case, typos, variants, a date with its zeros („Covid-19"
 * → „COVID-19", „Rgelung" → „Regelung", „Potential" → „Potenzial", „22.8.2018"
 * → „22.08.2018", the only change in XXVII 307/ME) — and count as a change
 * like any other; whether the page sets them apart is not decided here.
 *
 * `drift` is still the share of differing words, for the measurement
 * scripts (`aenderungsrate.ts`); it decides nothing any more.
 *
 * „REDAKTIONELL" BY THE LAW COMPARISON'S OWN RULE (22.10.2026): a changed
 * Begründung is editorial where `isEditorialChange` says so of its word diff
 * — what `toUnit` asks of a § — with the renumbering of the same comparison
 * as the context (`renumbered`, `renumberingOf`). Not a looser test: a typo,
 * a case or a spelling variant changes a word and stays „geändert", as the
 * badge's definition says („kein einziges Wort", `shared/utils/lawStations.ts`);
 * a passage above `MAX_DP_CELLS` has no segments and is never editorial.
 * Measured over the 353 drafts of GP XXVI–XXVIII: 68 of the 4.066 changed
 * Begründungen are editorial (10, 36, 22) — 17 references that follow the
 * comparison's renumbering (ten in 32/ME XXVIII, whose new law the Vorlage
 * renumbered), 5 dates written anew („22.8.2018" → „22.08.2018", all that
 * changed in XXVII 307/ME, whose „1 der 12" is now „Keine der 12"), 2 filled
 * placeholders and connectives — and, by the same rule, 19 that change an
 * article or „in"/„im" and 25 that change citation words alone („Nr."
 * dropped, „Z" → „lit.", „Hauptstück" → „Abschnitt"), which the rule forgives
 * a Novellierungsanordnung and therefore forgives here. Not counted as
 * changed (`substantiveReasoningChanges`), the sentence of 37 drafts moves.
 */
function entryOf(basis: ReasoningDiffEntry['basis'], label: string, a: string, b: string, renumbered: ReadonlyMap<string, string> | undefined): ReasoningDiffEntry {
  const { similarity, segments } = diffTokens(a, b)
  const drift = 1 - similarity
  const changed = !sameWording(a, b)
  return {
    basis,
    label,
    comparable: true,
    fromHeading: null,
    drift,
    changed,
    editorial: changed && isEditorialChange(segments, { renumbered }),
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
  /**
   * The renumbering of §§ the law comparison of the same pair established,
   * per later Artikel title (`renumberingOf`, read off its units by
   * `renumberingOfUnits`) — what `isEditorialChange` may credit a moved
   * reference to. An entry asks under the Artikel of the unit that opened it.
   */
  renumbered: ReadonlyMap<string, ReadonlyMap<string, string>>
}

/**
 * The passages of both sides without a verdict — where the scope rule holds
 * them apart (`sameScope`). The Vorlage's text is what the reader is shown;
 * the draft's comes along, empty where its passage is a bare heading.
 */
function uncomparedOf(basis: ReasoningDiffEntry['basis'], label: string, fromHeading: string, a: string, b: string): ReasoningDiffEntry {
  return { basis, label, comparable: false, fromHeading, drift: null, changed: false, editorial: false, segments: null, fromText: a || null, toText: b }
}

/**
 * Not a word apart, by the same comparison that gives the verdict
 * (`sameWording`, `entryOf`). The scope rule holds passages apart because a
 * different grouping can make two texts differ without the Begründung
 * changing — a false „geändert". Where the two texts are the same word for
 * word, that cannot happen: „unverändert" is true however the Ziffern are
 * grouped (65/ME XXVIII, „Redaktionelle Anpassungen." under eight Ziffern on
 * both sides, 01.10.2026). Read by the verdict's rule since 22.10.2026, a
 * comma no longer keeps them apart: 7 regrouped pairs of GP XXVI–XXVIII went
 * from „shown without a verdict" to „unverändert".
 */
function sameWords(a: string, b: string): boolean {
  return Boolean(a) && sameWording(a, b)
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
      : entryOf(basis, label, a, b, f.renumbered.get(unit.article ?? ''))
  }
  f.out.units[diffUnitKey(unit)] = key
}

/**
 * Where the § join reads a unit's Begründung: the entry's key and both
 * sides' texts at the unit's § — `ambiguous` where two Artikel of the draft
 * address the number — or null where it cannot be keyed.
 */
type ParagraphTextsAt = (unit: LawDiffUnit, para: string, id: string, ambiguous: boolean) => { key: string; a: string; b: string } | null

/**
 * The § join over `units`, in the order given — by § where the number is
 * unique in the draft, by Artikel and § where it is not, and where not even
 * that holds, nothing (`ParagraphTextsAt`).
 */
function joinAtParagraph(f: Filling, units: readonly LawDiffUnit[], ambiguous: ReadonlySet<string>, at: ParagraphTextsAt, read: Readings): void {
  for (const unit of units) {
    const para = read.addressed(unit)
    const id = explanationParaId(para)
    if (!para || !id) continue
    const found = at(unit, para, id, ambiguous.has(para))
    if (!found) continue
    fill(f, unit, found.key, () => ({ basis: 'paragraph', label: para, a: found.a, b: found.b }))
  }
}

/** The § join's texts as it read them until 19.11.2026 — `compareReasoningByParagraph`, the measurement's baseline. */
function textsByNumber(before: Texts, after: Texts, byArticle: { before: Texts; after: Texts } | null): ParagraphTextsAt {
  return (unit, para, id, ambiguous) => {
    if (!ambiguous) return { key: para, a: before.get(id) ?? '', b: after.get(id) ?? '' }
    if (!byArticle || !unit.fromArticleKey || !unit.articleKey) return null
    return {
      key: `Art. ${unit.articleKey} ${para}`,
      a: byArticle.before.get(articleParagraphKey(unit.fromArticleKey, id)) ?? '',
      b: byArticle.after.get(articleParagraphKey(unit.articleKey, id)) ?? '',
    }
  }
}

/**
 * The unit's Artikel on one side: its own where it exists there; where it
 * does not (an inserted instruction in the draft, a removed one in the
 * Vorlage), the Artikel its law carries on that side, read off a unit of the
 * same law present on both — the same Artikel on the other side, or where
 * that side numbers none, the same `article`, the law the page groups the
 * units under (95/ME XXVIII: the draft's text has no Artikel, the Vorlage's
 * an „Artikel 1"). Never the other side's number: a removed unit carries
 * the draft's Artikel in `articleKey` too (`toUnit`), and a Sammelvorlage
 * renumbers — 20/ME XXVIII's Artikel 16 is 129 d.B.'s Artikel 42.
 */
function articleOn(unit: LawDiffUnit, side: Side, units: readonly LawDiffUnit[], doc?: HtmlExplanations): string | null {
  const own = (u: LawDiffUnit) => (side === 'after' ? u.articleKey : u.fromArticleKey)
  if (existsOn(unit, side)) return own(unit)
  const otherKey = (u: LawDiffUnit) => (side === 'after' ? u.fromArticleKey : u.articleKey)
  const key = otherKey(unit)
  const sameLaw = (u: LawDiffUnit) => (key ? otherKey(u) === key : unit.article !== null && u.article === unit.article)
  const peer = units.find((u) => isPaired(u) && own(u) && sameLaw(u))
  if (peer) return own(peer)
  // A law none of whose changes the comparison paired — removed in the draft,
  // inserted in the Vorlage (149/ME XXVII: the BAO is Artikel 3 there and 1
  // here): the Artikel its units carry on that side, where they agree.
  const keys = new Set(units.flatMap((u) => (existsOn(u, side) && own(u) && unit.article !== null && u.article === unit.article ? [own(u)!] : [])))
  if (keys.size === 1) return [...keys][0]!
  if (keys.size > 1 || !doc) return null
  // Nor a unit of the law on that side: the Artikel the document itself
  // heads with the law's title („Zu Artikel 2 (Änderung des …)", 57/ME XXVI,
  // whose two laws the comparison paired no change of), where exactly one.
  const titles = new Set([unit.article, unit.fromArticle].flatMap((t) => (t ? [lawTitleKey(t)] : [])))
  const headed = new Set(doc.special.flatMap((p) => (p.law && p.section?.length === 1 && titles.has(lawTitleKey(p.law)) ? p.section : [])))
  return headed.size === 1 ? [...headed][0]! : null
}

/**
 * The § join's texts law by law (19.11.2026): on each side the passages
 * naming the §, without those the document sets under another law's Artikel
 * (`ofLaw`), each with the sub-passages under it (`ownedPassages`). Until
 * then a number no second Artikel of the draft addresses took every passage
 * naming it — and a Vorlage that bundles other drafts explains laws the
 * comparison does not hold: 20/ME XXVIII's Bundes-Seniorengesetz § 15 was
 * compared against the § 15 passages of four laws of 129 d.B., 53 units of
 * GP XXVIII against a Begründung that was partly another law's. Where two
 * Artikel of the draft address the number, by Artikel as before, each side
 * under its own (`articleOn`).
 *
 * Each passage with the sub-passages set under it (`ownedPassages`), in
 * printed order (02.10.2026): „Zu § 267a:" in 4/ME XXVIII has no text of its
 * own; its Begründung stands in „Zu Abs. 1:" and „Zu Abs. 9:" below it, which
 * name no §, so keyed by their own address they reached no Paragraph.
 */
function textsByLaw(units: readonly LawDiffUnit[], before: HtmlExplanations, after: HtmlExplanations): ParagraphTextsAt {
  const side = (doc: HtmlExplanations, s: Side) => {
    const byId = new Map<string, number[]>()
    doc.special.forEach((p, i) => {
      for (const para of p.paragraphs) {
        const id = explanationParaId(para)
        if (id) byId.set(id, [...(byId.get(id) ?? []), i])
      }
    })
    const keyed = units.some((u) => existsOn(u, s) && (s === 'after' ? u.articleKey : u.fromArticleKey))
    return {
      all: (id: string) => textOf(doc, byId.get(id) ?? []),
      law: (id: string, article: string | null) => textOf(doc, (byId.get(id) ?? []).filter((i) => ofLaw(doc.special[i]!, article, keyed))),
      article: (id: string, article: string) => textOf(doc, (byId.get(id) ?? []).filter((i) => doc.special[i]!.article === article)),
    }
  }
  const me = side(before, 'before')
  const rv = side(after, 'after')
  return (unit, para, id, ambiguous) => {
    const a = articleOn(unit, 'before', units, before)
    const b = articleOn(unit, 'after', units, after)
    // As before only for a unit that carries an Artikel on both sides
    // (an inserted one does not) — but each side looked up under its own.
    if (ambiguous) return unit.fromArticleKey && unit.articleKey && a && b ? { key: `Art. ${b} ${para}`, a: me.article(id, a), b: rv.article(id, b) } : null
    const texts = { a: me.law(id, a), b: rv.law(id, b) }
    // The key stays the §'s where no passage of another law was left out,
    // so nothing else moves.
    const filtered = texts.a !== me.all(id) || texts.b !== rv.all(id)
    return { key: filtered ? `${para} (Art. ${a ?? '–'}|${b ?? '–'})` : para, ...texts }
  }
}

/**
 * Whether a passage can be about the law whose Artikel on this side is
 * `article` — false only for one the document sets under another Artikel
 * (`HtmlPassage.article`), unless the Artikel heading in force names the
 * unit's (`HtmlPassage.section`: a Sammelvorlage keeps the draft's numbering
 * inside its own Artikel heading, 129 d.B. XXVIII). `keyed`: the side's
 * units carry Artikel numbers at all; where they do not, nothing tells the
 * laws apart, and every passage counts as before. Where they do and the
 * unit's law has no Artikel on the side, every passage under an Artikel is
 * another law's.
 */
function ofLaw(passage: HtmlPassage, article: string | null, keyed: boolean): boolean {
  if (!keyed || passage.article === null || namesSeveralLaws(passage.heading)) return true
  if (!article) return false
  return passage.article === article || (passage.section?.includes(article) ?? false)
}

/** „Art. 4 bis 7" — an Artikel range in a heading's address. */
const ARTICLE_RANGE_RE = /(?<![a-zäöü])art(?:ikel)?\.?\s*(?:[0-9]+|[ivxlc]+)\s*(?:bis|–|-)\s*(?:[0-9]+|[ivxlc]+)\b/i
/** „§ 175 Abs. 1a Z 1 ASVG" — a § and the act it belongs to, by its abbreviation (two capitals at least). */
const PARAGRAPH_OF_ACT_RE = /§\s*\d+[a-z]*\d*(?:\s+(?:Abs\.?|Z|lit\.?|Satz)\s*[\w.]+(?:\s*(?:und|bis)\s*[\w.]+)*)*\s+([A-ZÄÖÜ][\wÄÖÜäöüß-]*[A-ZÄÖÜ][\wÄÖÜäöüß-]*)/g

/**
 * A heading over several laws, which the parser files under the first
 * Artikel it names (19.11.2026): an Artikel range („Zu Art. 4 bis 7 jeweils
 * Z 4 (§ 747 ASVG; § 384 GSVG; …)", 261/ME XXVII) or §§ of two acts by their
 * abbreviations („Zu § 175 Abs. 1a Z 1 ASVG, § 90 Abs. 1a Z 1 B-KUVG",
 * 337/ME XXVII). It is about each of them, so `ofLaw` holds it to none.
 */
function namesSeveralLaws(heading: string): boolean {
  const address = heading.split(':')[0] ?? heading
  if (ARTICLE_RANGE_RE.test(address)) return true
  return new Set([...address.matchAll(PARAGRAPH_OF_ACT_RE)].map((m) => m[1])).size > 1
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
  const read = readings()
  const ambiguous = ambiguousParagraphs(units, read)
  const f = filling(units)
  // Two passes: every unique number first, the Artikel-keyed ones after. The
  // ceiling counts entries, and in unit order an Artikel-keyed § early in a
  // long Sammelgesetz took the place of a unique one that had been shown
  // before the second key existed — measured, 43, 202 and 230/ME of GP XXVII
  // would have lost Begründungen they have today.
  const isAmbiguous = (u: LawDiffUnit) => ambiguous.has(read.addressed(u) ?? '')
  joinAtParagraph(f, [...units.filter((u) => !isAmbiguous(u)), ...units.filter(isAmbiguous)], ambiguous, textsByNumber(before, after, byArticle), read)
  return finish(f.out)
}

function finish(out: ReasoningComparison): ReasoningComparison {
  const entries = Object.values(out.entries)
  const compared = entries.filter((e) => e.comparable)
  const changed = compared.filter((e) => e.changed)
  out.stats = { compared: compared.length, changed: changed.length, editorial: changed.filter((e) => e.editorial).length, uncompared: entries.length - compared.length }
  return out
}

/** An empty result for `units`, with the renumbering their comparison established. */
function filling(units: readonly LawDiffUnit[]): Filling {
  return { out: { units: {}, entries: {}, stats: { compared: 0, changed: 0, editorial: 0, uncompared: 0 } }, skipped: new Set(), renumbered: renumberingOfUnits(units) }
}

/**
 * The renumbering of §§ the law comparison established, read back off its
 * units: every pair it made is a unit present on both sides, `fromId` the
 * earlier § and `id` the later one, filed under the later Artikel title as
 * `toUnit` files it — the map `diffLawUnits` built from the same pairs. The
 * Begründungsvergleich is handed exactly those units
 * (`reasoningDiffService.ts` reads the ME→RV comparison the page shows), so
 * a reference in a Begründung is credited to the renumbering only where the
 * comparison beside it made one.
 */
function renumberingOfUnits(units: readonly LawDiffUnit[]): Map<string, ReadonlyMap<string, string>> {
  return renumberingOf(units.flatMap((u) => (isPaired(u) && u.fromId ? [{ fromId: u.fromId, toId: u.id, article: u.article }] : [])))
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
  /** The side's units carry Artikel numbers, so a passage's Artikel can tell their laws apart (`ofLaw`). */
  keyed: boolean
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
function sideKeys(unit: LawDiffUnit, side: Side, mode: ArticleMode, ambiguous: ReadonlySet<string>, read: Readings): string[] {
  const { ziffer, article } = unitZiffer(unit, side)
  if (!ziffer) return []
  if (mode === 'single') return [zifferKey(null, ziffer)]
  if (mode === 'title') {
    const title = unitTitle(unit, side)
    return title ? [titleZifferKey(title, ziffer)] : []
  }
  const keys = article ? [zifferKey(article, ziffer)] : []
  const para = read.addressed(unit)
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
 *
 * And under a heading titled by § alone that stands on its own (no Ziffer's
 * sub-passage), a run of bare „Zu Z 5:", „Zu Z 9:", „Zu Z 11:": the Ziffern
 * of that § (19.11.2026, `isBareZiffer`). 67/ME XXVIII explains § 1 so, under
 * „Zu § 1:"; read as Novellierungsanordnungen, its „Zu Z 11:" (§ 1 Z 11, the
 * Nationalrat's invitation) was compared at the draft's Z 11 on § 11 Abs. 2
 * against the Vorlage's „Inkrafttretensbestimmung." — a „geändert" that did
 * not exist, while the draft's own „Zu § 11 Abs. 2:" said the same words.
 * Only in a document whose every bare „Zu Z …:" stands in such a run
 * (`bareZiffernOfParagraphs`): 145/ME XXVII heads its Novellierungsanordnungen
 * „Zu Z 1:", „Zu Z 2:", and its „Zu Z 5:" after „Zu § 5h:" is its Z 5.
 */
function ownedPassages(doc: HtmlExplanations, index: number): number[] {
  let known = OWNED.get(doc)
  if (!known) OWNED.set(doc, (known = new Map()))
  const cached = known.get(index)
  if (cached) return cached
  const head = doc.special[index]!
  const paras = new Set(head.paragraphs.map((p) => explanationParaId(p)))
  const ziffernOfParagraph = head.ziffern.length === 0 && head.paragraphs.length > 0 && !underZiffer(doc, index) && bareZiffernOfParagraphs(doc)
  const out = [index]
  for (let i = index + 1; i < doc.special.length; i++) {
    const p = doc.special[i]!
    if (ziffernOfParagraph && isBareZiffer(p, head)) {
      out.push(i)
      continue
    }
    if (p.ziffern.length > 0 || p.article !== head.article || !SUB_HEADING_RE.test(p.heading)) break
    const named = headingAddress(leadingAddress(p.heading)).paragraphs
    if (named.some((x) => !paras.has(explanationParaId(x)))) break
    if (head.ziffern.length === 0 && named.length > 0) break
    out.push(i)
  }
  known.set(index, out)
  return out
}

/** `ownedPassages` per document, read once: `textOf` asks it for every passage of every entry. */
const OWNED = new WeakMap<HtmlExplanations, Map<number, number[]>>()

/** „Zu Z 11:" and nothing else — a Ziffer heading that names no §, no Artikel, no title. */
const BARE_ZIFFER_RE = /^zu\s+z\s*\d+[a-z]?\s*:?$/i

/** A bare Ziffer heading under the same Artikel as `head` (`ownedPassages`). */
function isBareZiffer(p: HtmlPassage, head: HtmlPassage): boolean {
  return p.ziffern.length === 1 && p.paragraphs.length === 0 && p.article === head.article && BARE_ZIFFER_RE.test(p.heading.trim())
}

/**
 * Whether every bare „Zu Z …:" of the document stands in a run under a heading
 * titled by § alone that is no Ziffer's sub-passage — read back over bare
 * Ziffer headings and sub-headings of the same Artikel. One that does not
 * means the document heads its Novellierungsanordnungen so, and then none of
 * them is read as a §'s Ziffer.
 */
function bareZiffernOfParagraphs(doc: HtmlExplanations): boolean {
  const known = BARE_STYLE.get(doc)
  if (known !== undefined) return known
  const inRun = (k: number): boolean => {
    const passage = doc.special[k]!
    for (let j = k - 1; j >= 0; j--) {
      const p = doc.special[j]!
      if (p.article !== passage.article) return false
      if (p.ziffern.length === 0 && p.paragraphs.length > 0) return !underZiffer(doc, j)
      if (!(p.ziffern.length === 1 && BARE_ZIFFER_RE.test(p.heading.trim())) && !(p.ziffern.length === 0 && SUB_HEADING_RE.test(p.heading))) return false
    }
    return false
  }
  const out = doc.special.every((p, k) => !(p.ziffern.length === 1 && p.paragraphs.length === 0 && BARE_ZIFFER_RE.test(p.heading.trim())) || inRun(k))
  BARE_STYLE.set(doc, out)
  return out
}

/** `bareZiffernOfParagraphs` per document. */
const BARE_STYLE = new WeakMap<HtmlExplanations, boolean>()

/** Whether the passage at `index` is a sub-passage of a Ziffer heading above it — then the Ziffern after it are not its own. */
function underZiffer(doc: HtmlExplanations, index: number): boolean {
  const passage = doc.special[index]!
  for (let j = index - 1; j >= 0; j--) {
    const p = doc.special[j]!
    if (p.ziffern.length > 0) return ownedPassages(doc, j).includes(index)
    if (p.article !== passage.article || !SUB_HEADING_RE.test(p.heading)) return false
  }
  return false
}

/** The passages that are a § heading's Ziffern (`ownedPassages`): no Novellierungsanordnung's passage. */
function paragraphZiffern(doc: HtmlExplanations): Set<number> {
  const out = new Set<number>()
  doc.special.forEach((p, i) => {
    if (p.ziffern.length > 0 || p.paragraphs.length === 0) return
    for (const j of ownedPassages(doc, i)) if (doc.special[j]!.ziffern.length > 0) out.add(j)
  })
  return out
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
function zifferSide(units: readonly LawDiffUnit[], doc: HtmlExplanations, side: Side, ambiguous: ReadonlySet<string>, read: Readings): ZifferSide {
  const unitArticles = new Set(units.filter((u) => unitZiffer(u, side).ziffer).map((u) => unitZiffer(u, side).article ?? ''))
  const passageArticles = new Set(doc.special.flatMap((p) => p.ziffern.map((z) => z.article ?? '')))
  const titled = titledLaws(units.filter((u) => unitZiffer(u, side).ziffer), doc, side)
  const mode: ArticleMode = titled ? 'title' : unitArticles.size <= 1 && passageArticles.size <= 1 ? 'single' : 'package'
  const map = new Map<string, LawDiffUnit[]>()
  const byParagraph = new Map<string, LawDiffUnit[]>()
  for (const u of units) {
    for (const key of sideKeys(u, side, mode, ambiguous, read)) map.set(key, [...(map.get(key) ?? []), u])
    const id = explanationParaId(read.addressed(u))
    if (id && existsOn(u, side)) byParagraph.set(id, [...(byParagraph.get(id) ?? []), u])
  }
  const byZiffer = new Map<string, number[]>()
  const owned = new Set<number>()
  const sectioned = new Set(doc.special.flatMap((p) => p.section ?? []))
  const ofParagraph = paragraphZiffern(doc)
  doc.special.forEach((p, i) => {
    if (ofParagraph.has(i)) return
    if (p.ziffern.length > 0) for (const j of ownedPassages(doc, i)) owned.add(j)
    for (const z of p.ziffern) {
      for (const key of passageKeys({ mode, sectioned }, p, z)) {
        const list = byZiffer.get(key) ?? []
        if (!list.includes(i)) list.push(i)
        byZiffer.set(key, list)
      }
    }
  })
  const keyed = units.some((u) => existsOn(u, side) && unitArticle(u, side))
  return { side, doc, mode, byZiffer, units: map, owned, byParagraph, sectioned, keyed }
}

/**
 * Whether a passage titled by § is about this unit's law — the § join's own
 * rule: a § number no second Artikel of the draft addresses is the unit's,
 * a shared one only under the unit's Artikel.
 */
function sameLaw(side: ZifferSide, passage: HtmlPassage, unit: LawDiffUnit, ambiguous: ReadonlySet<string>, read: Readings): boolean {
  if (side.mode === 'title') {
    const title = unitTitle(unit, side.side)
    return passage.law !== null && title !== null && lawTitleKey(passage.law) === lawTitleKey(title)
  }
  // A number no second Artikel of the draft addresses, but a passage the
  // document sets under another law's Artikel: that law's (`ofLaw`) — in
  // `single` mode too, which counts only the Artikel of passages titled by
  // Ziffer, not a law the document explains by § alone.
  if (side.mode === 'single' || !ambiguous.has(read.addressed(unit) ?? '')) return ofLaw(passage, existsOn(unit, side.side) ? unitArticle(unit, side.side) : null, side.keyed)
  return passage.article !== null && passage.article === unitZiffer(unit, side.side).article
}

/** The Artikel a unit carries on one side, as its text numbers it. */
function unitArticle(unit: LawDiffUnit, side: Side): string | null {
  return side === 'after' ? unit.articleKey : unit.fromArticleKey
}

/**
 * The passages a ressort titled by § alone that name the unit's § — „Zu § 11
 * Abs. 1b und 2:" in a draft whose Vorlage then writes „Zu Z 9 und 10 (§ 11
 * Abs. 1b und 2):" (48/ME XXVIII). A passage that belongs to a Ziffer is not
 * among them: it is that Ziffer's, not every change's to the same §.
 */
function paragraphPassages(side: ZifferSide, unit: LawDiffUnit, ambiguous: ReadonlySet<string>, read: Readings): number[] {
  const id = explanationParaId(read.addressed(unit))
  if (!id) return []
  const out: number[] = []
  side.doc.special.forEach((p, i) => {
    if (side.owned.has(i) || p.ziffern.length > 0) return
    if (p.paragraphs.some((x) => explanationParaId(x) === id) && sameLaw(side, p, unit, ambiguous, read)) out.push(i)
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
  for (const p of [addressedParagraph(line), ...instructionParagraphs(line), ...headingAddress(head).paragraphs]) {
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
function fitsParagraphs(passage: HtmlPassage, unit: LawDiffUnit, side: Side, read: Readings): boolean {
  if (passage.paragraphs.length === 0) return true
  const own = read.paragraphIds(unit, side)
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
 * („§ 17" for § 17c is a slip, not another §, 295/ME XXVII); the instruction
 * reads the same §§ on both sides, so our reading of it is not what differs;
 * and the other side's passages all name a § it does amend.
 *
 * A number another change of the same law amends is no slip (19.11.2026,
 * `amendedByOthers`): 61/ME XXVIII's Vorlage keeps the draft's Ziffern from
 * about its Z 17 on, so „Zu Z 23 (§ 124):" is the passage of its Z 22 („In
 * § 124 entfällt die Z 5"), not a slip at its Z 23 on § 124b — read as one,
 * the § 124 Begründung stood at the change to § 124b.
 */
function misnumbered(unit: LawDiffUnit, me: FoundPassages, rv: FoundPassages, read: Readings, amendedByOthers: (side: Side) => ReadonlySet<string>): Side | null {
  const own = read.paragraphIds(unit, 'before')
  const ownAfter = read.paragraphIds(unit, 'after')
  if (own.size === 0 || own.size !== ownAfter.size || [...own].some((x) => !ownAfter.has(x))) return null
  const slip = slipOf(own)
  const misfit = (f: FoundPassages, side: Side) => {
    if (f.byParagraph || f.passages.length !== 1) return false
    const p = f.doc.special[f.passages[0]!]!
    const others = amendedByOthers(side)
    const isSlip = (x: string) => {
      const id = explanationParaId(x) ?? ''
      return slip(id) && !others.has(id)
    }
    return p.ziffern.length === 1 && p.paragraphs.length > 0 && !fitsParagraphs(p, unit, side, read) && !p.paragraphs.some(isSlip)
  }
  if (misfit(me, 'before') && fitsAll(rv, unit, 'after', read)) return 'before'
  if (misfit(rv, 'after') && fitsAll(me, unit, 'before', read)) return 'after'
  return null
}

/**
 * Whether a § a heading names is a slip for one the instruction amends —
 * read the same by `misnumbered` and `offsetPassage`. A slip drops a letter
 * („§ 17" for § 17c, 295/ME XXVII); one that adds a letter to the § the
 * instruction amends names another §: „Zu Z 13 (§ 82j samt Überschrift):" in
 * 54/ME XXVIII's Vorlage is the passage of its Z 14, which inserts § 82j,
 * not of Z 13 on § 82 Abs. 29 (02.10.2026).
 */
function slipOf(own: ReadonlySet<string>): (id: string) => boolean {
  const bases = new Set([...own].map(paragraphBase))
  return (id) => (own.has(paragraphBase(id)) ? id === paragraphBase(id) : bases.has(paragraphBase(id)))
}

/** Every passage a side found for the unit names a § and one the unit amends — that document's §§ agree with the instruction. */
function fitsAll(f: FoundPassages, unit: LawDiffUnit, side: Side, read: Readings): boolean {
  return !f.byParagraph && f.passages.length > 0 && f.passages.every((i) => f.doc.special[i]!.paragraphs.length > 0 && fitsParagraphs(f.doc.special[i]!, unit, side, read))
}

/**
 * The passage a document counting its Ziffern off gives the unit under the
 * NEIGHBOURING number (14.11.2026) — or null. 54/ME XXVIII's Vorlage prints
 * „Zu Z 12" twice: „Zu Z 12 (§ 80b samt Überschrift):", the right one, and
 * „Zu Z 12 (§ 82 Abs. 29):", which explains Z 13; from there every heading is
 * one behind, and „Zu Z 13 (§ 82j samt Überschrift):" explains Z 14. Until
 * now Z 13 and Z 14 got nothing (`misnumbered`, the passage of the other
 * number being turned away), because taking the neighbour's passage on its
 * number alone would be guessing the offset.
 *
 * The number is one witness; it is taken only with four more, all read off
 * the documents and none off a guess:
 *
 *  1. the passage names one Ziffer, one before or after the unit's on this
 *     side, and §§ — every one of which this unit amends, letter for letter
 *     (no slip: „§ 82" is not § 82j);
 *  2. it is not the passage of the unit that carries that number: that unit
 *     exists, amends none of its §§ and shares no number with them, and no
 *     unit was given the passage by its own number;
 *  3. no other unit of the same law on this side amends one of its §§ — the
 *     § points at this unit and no other;
 *  4. the other document's passages to the unit name a § it amends
 *     (`fitsAll`) — the second document agrees which change this is.
 *
 * Exactly one candidate, or none. Where the witnesses disagree, the unit
 * keeps no Begründung, as before.
 */
function offsetPassage(side: ZifferSide, unit: LawDiffUnit, used: ReadonlySet<number>, units: readonly LawDiffUnit[], read: Readings): number | null {
  const { ziffer } = unitZiffer(unit, side.side)
  if (!ziffer || !/^\d+$/.test(ziffer)) return null
  const own = read.paragraphIds(unit, side.side)
  if (own.size === 0) return null
  const others = sameLawUnits(side, unit, units)
  const found: number[] = []
  for (const n of [Number(ziffer) - 1, Number(ziffer) + 1]) {
    if (n < 1) continue
    const key = primaryKey(unit, side, String(n))
    if (!key) continue
    const holders = side.units.get(key) ?? []
    if (holders.length !== 1 || holders[0] === unit) continue
    const holder = holders[0]!
    const holderIds = read.paragraphIds(holder, side.side)
    const holderSlip = slipOf(holderIds)
    for (const i of side.byZiffer.get(key) ?? []) {
      const p = side.doc.special[i]!
      if (used.has(i) || p.ziffern.length !== 1 || p.paragraphs.length === 0) continue
      const ids = p.paragraphs.map((x) => explanationParaId(x) ?? '')
      if (!ids.every((id) => own.has(id))) continue // 1
      if (holderIds.size === 0 || ids.some((id) => holderIds.has(id) || holderSlip(id))) continue // 2
      if (others.some((u) => ids.some((id) => read.paragraphIds(u, side.side).has(id)))) continue // 3
      found.push(i)
    }
  }
  return found.length === 1 ? found[0]! : null
}

/** The other units of the unit's law present on a side — by Artikel, or the single law's, or its title's. */
function sameLawUnits(side: ZifferSide, unit: LawDiffUnit, units: readonly LawDiffUnit[]): LawDiffUnit[] {
  const { article } = unitZiffer(unit, side.side)
  const sameLawAs = (u: LawDiffUnit) =>
    side.mode === 'title' ? unitTitle(u, side.side) === unitTitle(unit, side.side) : side.mode === 'single' || unitZiffer(u, side.side).article === article
  return units.filter((u) => u !== unit && existsOn(u, side.side) && sameLawAs(u))
}

/** Every § the other changes of the unit's law amend on a side (`sameLawUnits`, `unitParagraphIds`). */
function amendedByOthers(side: ZifferSide, unit: LawDiffUnit, units: readonly LawDiffUnit[], read: Readings): Set<string> {
  return new Set(sameLawUnits(side, unit, units).flatMap((u) => [...read.paragraphIds(u, side.side)]))
}

/** The unit's first key on a side, at another Ziffer — by Artikel, or the single law's, or its title's. */
function primaryKey(unit: LawDiffUnit, side: ZifferSide, ziffer: string): string | null {
  const { article } = unitZiffer(unit, side.side)
  if (side.mode === 'single') return zifferKey(null, ziffer)
  if (side.mode === 'title') {
    const title = unitTitle(unit, side.side)
    return title ? titleZifferKey(title, ziffer) : null
  }
  return article ? zifferKey(article, ziffer) : null
}

/**
 * What became of a unit the Ziffer join took but gave no Ziffer entry — for
 * the measurement (`scripts/corpus/aenderungsrate.ts --ziffer`), not for the
 * page: `scope` — both sides explain it, in passages over different sets of
 * changes, so shown without a verdict; `oneSided` — inserted or removed, so the § join
 * took it; `paragraphTitled` — compared, but one side or both explain it in
 * a passage titled by its § alone; `none` — one side explains it by neither
 * its Ziffer nor its §; `misnumbered` — both explain it, but one document's
 * passage to its Ziffer is about another § (`misnumbered`); `offset` —
 * compared or shown with the passage one document prints under the
 * neighbouring number (`offsetPassage`).
 */
export type ZifferFallback = 'scope' | 'oneSided' | 'paragraphTitled' | 'none' | 'misnumbered' | 'offset'

export interface ReasoningComparisonAtZiffer extends ReasoningComparison {
  /** Units of the Ziffer join that are not plainly Ziffer against Ziffer, and where they went. */
  fallbacks: Record<string, ZifferFallback>
  /** How many units the Ziffer join took, how many went the § join from the start, how many are §§ joined by their own designation. */
  routes: { ziffer: number; paragraph: number; ownParagraph: number }
  /** Ziffer passages a unit's key found but `fitsParagraphs` turned away — `diffUnitKey`, side, heading. */
  guarded: { unit: string; side: Side; heading: string }[]
  /** For every unit the scope rule left without a verdict, the units each side's passages cover. */
  scopes: { unit: string; before: string[]; after: string[] }[]
  /**
   * For the page: every unit of the Ziffer join that ended with no entry,
   * and why (`ReasoningGap`) — `misnumbered` and the offset without
   * witnesses as `numbering`, `none` by the side that has nothing, where
   * that side's text proves it (`namesChange`), else `unread`. A unit the
   * ceiling (`MAX_ENTRIES`) kept out is not here: its Begründung was found,
   * and the line would say otherwise.
   */
  gaps: Record<string, ReasoningGap>
}

/**
 * The comparison the service ships (01.10.2026) — see the file header for
 * the rule:
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
  const read = readings()
  const ambiguous = ambiguousParagraphs(units, read)
  const f = filling(units)
  const fallbacks: Record<string, ZifferFallback> = {}
  /** Why a unit of the Ziffer join may end without an entry — kept only where it does (`gaps`). */
  const gapOf: Record<string, ReasoningGap> = {}

  const titled = before.special.some((p) => p.ziffern.length > 0) && after.special.some((p) => p.ziffern.length > 0)
  const z = titled ? { before: zifferSide(units, before, 'before', ambiguous, read), after: zifferSide(units, after, 'after', ambiguous, read) } : null

  const guarded = new Map<string, { unit: string; side: Side; heading: string }>()
  const scopes: { unit: string; before: string[]; after: string[] }[] = []
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
    const fits = found.filter((i) => fitsParagraphs(side.doc.special[i]!, unit, side.side, read))
    for (const i of found) {
      if (fits.includes(i)) continue
      guarded.set(`${diffUnitKey(unit)}|${side.side}|${i}`, { unit: diffUnitKey(unit), side: side.side, heading: side.doc.special[i]!.heading })
    }
    return fits
  }
  /** `diffUnitKey|side` of every unit a side found through the other document's numbering (`foreignNumbered`). */
  const viaForeign = new Set<string>()
  /**
   * The first of the unit's keys that finds passages that fit its §§
   * (`fitsParagraphs`). A key two units share (a duplicate „Z 3" in one
   * Artikel) is refused: its passage would be the other's too.
   */
  const lookup = (side: ZifferSide, unit: LawDiffUnit): number[] => {
    for (const key of sideKeys(unit, side.side, side.mode, ambiguous, read)) {
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
          if (sameLaw(side, passage, u, ambiguous, read) && !lookup(side, u).length) out.add(diffUnitKey(u))
        }
      }
    }
    return out
  }
  /** The unit's passages on a side: its Ziffer's, else those titled by its § alone. */
  const passagesOf = (side: ZifferSide, unit: LawDiffUnit): { passages: number[]; byParagraph: boolean } => {
    const own = lookup(side, unit)
    return own.length ? { passages: own, byParagraph: false } : { passages: paragraphPassages(side, unit, ambiguous, read), byParagraph: true }
  }
  const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)
  const headingsOf = (doc: HtmlExplanations, passages: readonly number[]) =>
    sorted(passages)
      .map((i) => doc.special[i]!.heading)
      .join(' · ')

  /** Passage indices a unit was given on each side — `offsetPassage` takes none of them. */
  const used: Record<Side, Set<number>> = { before: new Set(), after: new Set() }
  /**
   * The entry for a unit with passages on both sides — compared where both
   * cover the same units, shown without a verdict where not. `offset` names
   * the side (or both) whose passage `offsetPassage` found under the
   * neighbouring number: that passage covers this unit and no other (its own
   * number's unit is not it, witness 2), whatever its number says.
   */
  const attach = (unit: LawDiffUnit, me: { passages: number[]; byParagraph: boolean }, rv: { passages: number[]; byParagraph: boolean }, offset: Side | 'both' | null) => {
    const self = new Set([diffUnitKey(unit)])
    const a = offset === 'before' || offset === 'both' ? self : cover(z!.before, me.passages)
    const b = offset === 'after' || offset === 'both' ? self : cover(z!.after, rv.passages)
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
    } else {
      const key = `Z ${sorted(me.passages).join('+')}|${sorted(rv.passages).join('+')}`
      const byParagraphOnly = me.byParagraph && rv.byParagraph
      fill(f, unit, key, () => ({
        basis: byParagraphOnly ? 'paragraph' : 'ziffer',
        label: byParagraphOnly ? (read.addressed(unit) ?? '') : headingsOf(after, rv.passages),
        a: textOf(before, me.passages),
        b: textOf(after, rv.passages),
      }))
      // A heading with no text and no sub-passage under it explains as little as none.
      if (!f.out.units[diffUnitKey(unit)]) fallbacks[diffUnitKey(unit)] = 'none'
      else if (offset) fallbacks[diffUnitKey(unit)] = 'offset'
      else if (me.byParagraph || rv.byParagraph) fallbacks[diffUnitKey(unit)] = 'paragraphTitled'
    }
    if (!f.out.units[diffUnitKey(unit)]) {
      // No entry although both sides had passages: said by the side whose
      // passage has no text. With text on both sides it was the ceiling —
      // the Begründung was found, and no line may say otherwise.
      const empty = { before: !textOf(before, me.passages), after: !textOf(after, rv.passages) }
      if (empty.before || empty.after) gapOf[diffUnitKey(unit)] ??= missingGap(empty.before, empty.after)
      return
    }
    for (const i of me.passages) used.before.add(i)
    for (const i of rv.passages) used.after.add(i)
  }
  /** Units one document explains under no number of its own, or under another §'s — for `offsetPassage`, after every other join; `both` where neither document does. */
  const offsets: { unit: LawDiffUnit; me: { passages: number[]; byParagraph: boolean }; rv: { passages: number[]; byParagraph: boolean }; side: Side | 'both' }[] = []
  /**
   * BOTH DOCUMENTS COUNTING THE SAME WAY OFF THE TEXT (19.11.2026). Where
   * each side's only passage to the unit's Ziffer names this one Ziffer and
   * §§ the instruction does not amend (no slip), `misnumbered` cannot judge:
   * no second document says which reading is ours. So the passage is
   * withheld only with a witness from the law itself, on both sides: every §
   * it names is amended by one other change of the law, the same on both
   * sides and the only one touching them, and that change has no passage of
   * its own in either document. Then the passage is that change's — 96/ME
   * XXVIII's „Zu Z 2 (§ 80 AMSG):", in both documents, is the passage of Z 3
   * („Nach § 79 wird folgender § 80 … eingefügt"); Z 2 is the Inkrafttreten,
   * which neither explains. Without the witness (an Inhaltsverzeichnis line
   * we read otherwise, an inserted Abschnitt), the passage stays, as before.
   */
  const claimedByAnother = (unit: LawDiffUnit, me: { passages: number[]; byParagraph: boolean }, rv: { passages: number[]; byParagraph: boolean }): boolean => {
    const own = read.paragraphIds(unit, 'before')
    const ownAfter = read.paragraphIds(unit, 'after')
    if (!z || own.size === 0 || own.size !== ownAfter.size || [...own].some((x) => !ownAfter.has(x))) return false
    const slip = slipOf(own)
    const claimant = (found: { passages: number[]; byParagraph: boolean }, side: Side): LawDiffUnit | null => {
      if (found.byParagraph || found.passages.length !== 1) return null
      const p = z[side].doc.special[found.passages[0]!]!
      if (p.ziffern.length !== 1 || p.paragraphs.length === 0 || fitsParagraphs(p, unit, side, read)) return null
      const ids = p.paragraphs.map((x) => explanationParaId(x) ?? '')
      const others = sameLawUnits(z[side], unit, units)
      if (ids.some((id) => slip(id) && !others.some((u) => read.paragraphIds(u, side).has(id)))) return null
      const touching = others.filter((u) => ids.some((id) => read.paragraphIds(u, side).has(id)))
      if (touching.length !== 1 || !ids.every((id) => read.paragraphIds(touching[0]!, side).has(id))) return null
      return passagesOf(z[side], touching[0]!).passages.length === 0 ? touching[0]! : null
    }
    const holder = claimant(me, 'before')
    return holder !== null && holder === claimant(rv, 'after')
  }

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
      gapOf[diffUnitKey(unit)] = missingGap(!me.passages.length, !rv.passages.length)
      // One document explains it under its own number, the other under none
      // of its own: perhaps under the neighbour's (`offsetPassage`), below —
      // and where neither does, perhaps both under the same neighbour's.
      offsets.push({ unit, me, rv, side: me.passages.length ? 'after' : rv.passages.length ? 'before' : 'both' })
      continue
    }
    // Found on one side through the other document's numbering: then the
    // passages of BOTH sides must name a § the unit amends. 24/ME XXVIII
    // counts its own Ziffern one off at the end of its Artikel 3 („Zu Art. 3
    // Z 48 (§ 44 Abs. 7 …)" explains its Z 49), and the Vorlage's right
    // passage to Z 48 would have been held against the draft's wrong one.
    if (
      (viaForeign.has(`${diffUnitKey(unit)}|before`) || viaForeign.has(`${diffUnitKey(unit)}|after`)) &&
      !(me.passages.every((i) => fitsParagraphs(before.special[i]!, unit, 'before', read)) && rv.passages.every((i) => fitsParagraphs(after.special[i]!, unit, 'after', read)))
    ) {
      fallbacks[diffUnitKey(unit)] = 'none'
      // Read in the other document's numbering and about another §: the
      // two count the change differently.
      gapOf[diffUnitKey(unit)] = 'numbering'
      continue
    }
    // One side's own passage is about another § than the other side's: that
    // document numbers its Ziffern off its own text (`misnumbered`) — and
    // perhaps explains this change under the neighbouring number, below.
    const misfit = misnumbered(unit, { doc: before, ...me }, { doc: after, ...rv }, read, (side) => amendedByOthers(z[side], unit, units, read))
    if (misfit) {
      fallbacks[diffUnitKey(unit)] = 'misnumbered'
      gapOf[diffUnitKey(unit)] = 'numbering'
      offsets.push({ unit, me, rv, side: misfit })
      continue
    }
    if (claimedByAnother(unit, me, rv)) {
      fallbacks[diffUnitKey(unit)] = 'misnumbered'
      gapOf[diffUnitKey(unit)] = 'numbering'
      continue
    }
    attach(unit, me, rv, null)
  }

  // The § join, unique numbers first (see `compareReasoningByParagraph`):
  // the units it always served, and the inserted and removed ones.
  const isAmbiguous = (u: LawDiffUnit) => ambiguous.has(read.addressed(u) ?? '')
  const rest = [...atParagraph, ...oneSided]
  const byLaw = textsByLaw(units, before, after)
  joinAtParagraph(f, [...rest.filter((u) => !isAmbiguous(u)), ...rest.filter(isAmbiguous)], ambiguous, byLaw, read)
  // Last, so a new law's §§ never take the ceiling from an entry the layer
  // showed before they had one.
  joinOwnParagraph(f, units, ownParagraph, before, after, read)
  // Last of all, so a recovered passage never takes the ceiling from an
  // entry shown before, and every passage some unit has under its own
  // number is known (`offsetPassage`, witness 2). The other side's passages
  // must name a § the unit amends (witness 4).
  if (z) {
    for (const { unit, me, rv, side } of offsets) {
      if (side === 'both') {
        // Neither document has a passage of its own: both must give the
        // same change its neighbour's under every witness — each the second
        // document's witness for the other.
        const i = offsetPassage(z.before, unit, used.before, units, read)
        const j = offsetPassage(z.after, unit, used.after, units, read)
        if (i !== null && j !== null) attach(unit, { passages: [i], byParagraph: false }, { passages: [j], byParagraph: false }, 'both')
        continue
      }
      const other = side === 'before' ? { doc: after, ...rv } : { doc: before, ...me }
      if (!fitsAll(other, unit, side === 'before' ? 'after' : 'before', read)) continue
      const i = offsetPassage(z[side], unit, used[side], units, read)
      if (i === null) continue
      const found = { passages: [i], byParagraph: false }
      attach(unit, side === 'before' ? found : me, side === 'after' ? found : rv, side)
    }
  }
  // A readdressed instruction (`pairSameInstruction`) was two units until
  // the comparison read it as one, and each half went the § join as an
  // inserted or removed instruction. Where the Ziffer join gives the one
  // unit nothing, it keeps what the § join gives — read off the Vorlage's
  // text first, then the draft's — so pairing never takes a Begründung away:
  // 69/ME XXVIII Z 26 → Z 27, whose documents number § 24's Ziffern
  // differently, kept the § 24 passage its halves had (14.11.2026). Only
  // where both sides' instructions edit the same §§; last, so it takes the
  // ceiling from nothing shown before.
  const byKey = new Map(units.map((u) => [diffUnitKey(u), u]))
  for (const unit of units) {
    if (!unit.readdressed || f.out.units[diffUnitKey(unit)]) continue
    const draftParas = read.paragraphIds(unit, 'before')
    const billParas = read.paragraphIds(unit, 'after')
    if (draftParas.size === 0 || draftParas.size !== billParas.size || [...draftParas].some((x) => !billParas.has(x))) continue
    for (const half of [{ ...unit, change: 'inserted' as const, fromText: null }, { ...unit, change: 'removed' as const, toText: null }]) {
      // A real unit under the half's key keeps its own entry.
      if (byKey.has(diffUnitKey(half))) continue
      joinAtParagraph(f, [half], ambiguous, byLaw, read)
      const key = f.out.units[diffUnitKey(half)]
      if (!key) continue
      Reflect.deleteProperty(f.out.units, diffUnitKey(half))
      f.out.units[diffUnitKey(unit)] = key
      break
    }
  }

  // Only what stayed without an entry — a unit `offsetPassage` recovered has
  // its Begründung. „Not found" is a claim about the document, so it stands
  // only where the document's text names the change nowhere (`namesChange`).
  const gaps: Record<string, ReasoningGap> = {}
  for (const [key, gap] of Object.entries(gapOf)) {
    if (f.out.units[key]) continue
    const unit = byKey.get(key)!
    if (gap === 'numbering') {
      gaps[key] = gap
      continue
    }
    const absent = (side: Side) => !namesChange(side === 'before' ? before : after, unitZiffer(unit, side).ziffer, read.paragraphIds(unit, side), unitArticle(unit, side))
    const notBefore = gap !== 'missingAfter' && absent('before')
    const notAfter = gap !== 'missingBefore' && absent('after')
    gaps[key] = notBefore || notAfter ? missingGap(notBefore, notAfter) : 'unread'
  }
  return { ...finish(f.out), fallbacks, routes: { ziffer: zifferRoute, paragraph: atParagraph.length, ownParagraph: ownParagraph.length }, guarded: [...guarded.values()], scopes, gaps }
}

/**
 * Whether a document names a change anywhere it could be explained — a
 * passage whose heading addresses one of its §§, or any „Zu …" line that
 * names its Ziffer („Zu den Z 22 und 102 (…):", „Zu Z 19 bis 28 …") or one of
 * its §§, in a heading or in text a heading the reader did not take as one
 * was folded into (14.11.2026). The proof of absence behind „nicht
 * gefunden":
 *
 *  - 58/ME XXVIII explains its Z 102 under „Zu den Z 22 und 102 (§§ 20
 *    Abs. 5 und 193 Abs. 5):", which the reader keeps as text of the passage
 *    before — „in keinem der beiden Dokumente gefunden" would be false;
 *  - 34/ME XXVIII explains its Z 15 under „Zu Z 13 (§ 26 Abs. 2):", counting
 *    otherwise than its text — the passage is there, under another number.
 *
 * Any Artikel and any number of the line count, an Absatz's too: a wrong hit
 * costs the line its reason, never its truth. And a block that explains the
 * unit's whole law under its Artikel heading names every change of it
 * (`explainsLawWhole`, 19.11.2026).
 */
function namesChange(doc: HtmlExplanations, ziffer: string | null, paras: ReadonlySet<string>, article: string | null): boolean {
  if (explainsLawWhole(doc, article)) return true
  if (doc.special.some((p) => p.paragraphs.some((x) => paras.has(explanationParaId(x) ?? '')))) return true
  const lines = [...doc.general, ...doc.special.flatMap((p) => [p.heading, ...p.text])]
  for (const line of lines) {
    for (const zu of line.matchAll(ZU_LINE_RE)) {
      if (ziffer && [...zu[0].matchAll(ZIFFER_LIST_RE)].some((m) => listNames(m[1]!, ziffer))) return true
      if ([...zu[0].matchAll(PARAGRAPH_LIST_RE)].some((m) => [...paras].some((id) => listNames(m[1]!, id)))) return true
    }
  }
  return false
}

/**
 * Whether a document explains the law under `article` as a whole: a block
 * at the Artikel level that carries prose and names no Ziffer and no §
 * (19.11.2026). 96/ME XXVIII's draft explains the EStG in one block of
 * 11.509 characters under „Zu Art. 7 (Änderung des Einkommensteuergesetzes
 * 1988)" — the Aktivitätsfreibetrag of § 105a and its Inkrafttreten
 * throughout —, and its Z 8 and Z 9 read „im Entwurf nicht gefunden"; Z 1 to
 * Z 7 escaped the same line only because another Artikel's „Zu Z 1 und 3"
 * named their numbers. Such a block may explain any change of its law, so
 * absence is not proven; it is no change's passage, so it attaches nothing.
 *
 * The unit's own Artikel heading counts, and a range heading whose range
 * holds it: 66/ME XXVII explains Artikel 2 to 8 together under „Zu Artikel 2
 * bis 8: Änderung des Schulpflichtgesetzes 1985, …" („redaktionelle
 * Anpassungen der Verweise"). An introduction above passages titled by
 * Ziffer or § counts too: 226/ME XXVII's Vorlage says under „Zu Art. 2
 * (Änderung des Filmförderungsgesetzes):" that the Novelle „im Übrigen"
 * adjusts the Geschlechterbezeichnungen — the Begründung of the Ziffern no
 * passage takes —, and 97/ME XXVII says there what becomes of „Kranken" in
 * „§§ 6, 10, … und 43 UbG". Never another Artikel's heading, never a passage
 * under no Artikel, never a „Zu Abs. …" below a §. The block must carry
 * prose: „Zum 1. Abschnitt:" alone (the TKG 2021 of GP XXVII, a new law
 * explained in 393 § passages) is a sub-heading the reader folded into it.
 */
function explainsLawWhole(doc: HtmlExplanations, article: string | null): boolean {
  if (!article) return false
  return doc.special.some((p) => p.paragraphs.length === 0 && p.ziffern.length === 0 && headsArticle(p, article) && p.text.some((t) => !isSubHeading(t)))
}

/** Whether a passage is the Artikel heading of `article` — its own, or a range („Zu Artikel 2 bis 8: …") that holds it. */
function headsArticle(p: HtmlPassage, article: string): boolean {
  if (!ARTICLE_HEAD_RE.test(p.heading)) return false
  if (p.article === article && p.section?.length === 1 && p.section[0] === article) return true
  const range = ARTICLE_RANGE_HEAD_RE.exec(p.heading)
  const from = range ? articleNumberKey(range[1]!) : null
  const to = range ? articleNumberKey(range[2]!) : null
  const n = Number(article)
  return from !== null && to !== null && Number.isInteger(n) && Number(from) <= n && n <= Number(to)
}

/** „Zu Artikel 2 bis 8", „Zu den Art. 106 bis 122", „Zu Artikel II – IV". */
const ARTICLE_RANGE_HEAD_RE = /^(?:zu\s+(?:den\s+)?)?art(?:ikeln?|\.)?\s*([0-9]+|[ivxlc]+)\s*(?:bis|–|-)\s*(?:art(?:ikel|\.)?\s*)?([0-9]+|[ivxlc]+)(?![0-9a-z])/i

/** „Zu Art. 7 (…)", „Zu Artikel 7", „Artikel 7" — an Artikel heading. */
const ARTICLE_HEAD_RE = /^(?:zu\s+)?art(?:ikel|\.)?\s*\S/i

/**
 * A line of a block that only heads what follows: empty, or short and ending
 * in a colon („Zu Abschnitt 1:", „Kompetenzgrundlage:"), or naming a part of
 * the law („Zum 1. Abschnitt (Allgemeine Bestimmungen)"). A long line ending
 * in a colon is prose that opens a list.
 */
function isSubHeading(line: string): boolean {
  const t = line.trim()
  return t.length === 0 || (t.length <= 100 && (/:$/.test(t) || SUB_PART_RE.test(t)))
}
const SUB_PART_RE = /^(?:zu[mr]?\s+)?(?:(?:\d+|[ivx]+)\.\s*)?(?:unter)?(?:abschnitt|teil|hauptstück)\b/i

/** A „Zu …" line up to its colon. */
const ZU_LINE_RE = /\bZu\s[^:]{1,240}/g
/** „Z 1, 14, 24 bis 27", „Ziffern 3 und 4" inside it. */
const ZIFFER_LIST_RE = /\bZ(?:iffern?|\.)?\s+(\d[^():§]*)/g
/** „§§ 20 Abs. 5 und 193 Abs. 5" inside it — every number up to the bracket. */
const PARAGRAPH_LIST_RE = /§§?\s*([^():§]*)/g

/** Whether a printed number list („22 und 102", „19 bis 28", „Z 30 bis Z 34", „5a, 6") names `id`; a range by its numbers. */
function listNames(list: string, id: string): boolean {
  const n = Number(/^\d+/.exec(id)?.[0])
  for (const r of list.matchAll(/(\d+[a-z]?)(?:\s*bis\s*(?:Z\s*)?(\d+[a-z]?))?/g)) {
    const a = r[1]!.toLowerCase()
    const b = r[2]?.toLowerCase()
    if (a === id || b === id) return true
    if (b && Number(/^\d+/.exec(a)?.[0]) <= n && n <= Number(/^\d+/.exec(b)?.[0])) return true
  }
  return false
}

/** The side(s) with no passage, as a `ReasoningGap`. */
function missingGap(before: boolean, after: boolean): ReasoningGap {
  return before && after ? 'missingBoth' : before ? 'missingBefore' : 'missingAfter'
}

/** „§9" → „9", „§5a" → „5a", „§6.01a" → „6.01a" (`PARAGRAPH_NUMBER`); null for anything else — a duplicate number („§9#dup") is refused. */
const PARAGRAPH_ID_RE = new RegExp(String.raw`^§(${PARAGRAPH_NUMBER})$`, 'i')
function paragraphOfId(id: string | null): string | null {
  const m = PARAGRAPH_ID_RE.exec(id ?? '')
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
  return headingAddress(out.join(' ')).paragraphs
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
function ownSide(units: readonly LawDiffUnit[], doc: HtmlExplanations, side: Side, read: Readings): OwnSide {
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
      for (const para of read.paragraphIds(u, side)) addLaw(para, law)
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
  const ofParagraph = paragraphZiffern(doc)
  doc.special.forEach((p, i) => {
    if (p.ziffern.length > 0 && !ofParagraph.has(i)) for (const j of ownedPassages(doc, i)) owned.add(j)
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
function joinOwnParagraph(f: Filling, units: readonly LawDiffUnit[], candidates: readonly LawDiffUnit[], before: HtmlExplanations, after: HtmlExplanations, read: Readings): void {
  if (!candidates.some(isPaired)) return
  const me = ownSide(units, before, 'before', read)
  const rv = ownSide(units, after, 'after', read)
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
