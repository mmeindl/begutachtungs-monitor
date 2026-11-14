/**
 * The words the page of a Vorlage, an Antrag, a committee's motion or a
 * motion of the Bundesrat uses for
 * what the item is (`VorlageDetail.itemKind`, 14.11.2026) — one table, so
 * the page's template carries no kind-specific copy of its own and a second
 * language replaces this file, not the template.
 *
 * „Ausschussantrag" is the one term for a committee's motion (decision 8 of
 * 14.11.2026): on the rail, in rows, in the address and on `/wege`.
 *
 * Pure module: no Nuxt auto-imports.
 */
import type { BundesratMotionVariant, FilingClosedReason, ProcedureItemKind, RelatedItem, TreatyKind, VorlageDetail } from '#shared/types'
import { beilageCitationDe, buaCitationDe, rvCitationDe } from '#shared/utils/citations'
import { carriesDraft, draftOfAntrag } from '#shared/utils/antragPath'

export interface ItemKindCopy {
  /** The kind as a noun: the identity line, the rail's station, the title. */
  word: string
  /** Accusative with article, for „… zitieren" (`CiteButton`). */
  subject: string
  /** „Stellungnahme zum …" — the door's heading. */
  zum: string
  /** Whose documents (`DocumentList`): „Die Begründung des …". */
  author: string
}

export const ITEM_KIND_DE: Readonly<Record<ProcedureItemKind, ItemKindCopy>> = {
  regierungsvorlage: { word: 'Regierungsvorlage', subject: 'Die Regierungsvorlage', zum: 'zur Regierungsvorlage', author: 'des Ministeriums' },
  initiativantrag: { word: 'Initiativantrag', subject: 'Den Antrag', zum: 'zum Antrag', author: 'der Antragsteller:innen' },
  ausschussantrag: { word: 'Ausschussantrag', subject: 'Den Ausschussantrag', zum: 'zum Ausschussantrag', author: 'des Ausschusses' },
  // The Bundesrat's own motion (`GABR`); a third's (`GABR13`) reads
  // `BUNDESRAT_DRITTEL_DE` through `itemCopyDe`.
  bundesratsantrag: { word: 'Gesetzesantrag des Bundesrates', subject: 'Den Gesetzesantrag', zum: 'zum Gesetzesantrag', author: 'des Bundesrates' },
  // A treaty's Vorlage (`RVS`, step 5 of 14.11.2026); an Art.-15a-
  // Vereinbarung reads `VEREINBARUNG_15A_DE` through `itemCopyDe`.
  staatsvertrag: { word: 'Staatsvertrag', subject: 'Den Staatsvertrag', zum: 'zum Staatsvertrag', author: 'des Ministeriums' },
}

/**
 * An agreement between the Bund and the Länder (Art. 15a B-VG; `VHG`
 * „RVS15", `treatyKindOf`): Parliament files it as „Regierungsvorlage:
 * Staatsvertrag", but it is no treaty with another state, so never
 * „Staatsvertrag" on its page.
 */
const VEREINBARUNG_15A_DE: ItemKindCopy = {
  word: 'Vereinbarung nach Art. 15a B-VG',
  subject: 'Die Vereinbarung',
  zum: 'zur Vereinbarung',
  author: 'des Ministeriums',
}

/**
 * A motion of a third of the Bundesrat's members (`GABR13`, § 21 Abs. 6
 * GO-BR): not the Bundesrat's own, so never „des Bundesrates". Parliament's
 * type says „Gesetzesantrag von einem Drittel der Mitglieder des
 * Bundesrates"; the kind word is the shorter „von Mitgliedern", the byline
 * says the third. The members are never named.
 */
const BUNDESRAT_DRITTEL_DE: ItemKindCopy = {
  word: 'Gesetzesantrag von Mitgliedern des Bundesrates',
  subject: 'Den Gesetzesantrag',
  zum: 'zum Gesetzesantrag',
  author: 'der Antragsteller:innen',
}

/** The words for an item, its variant included — what a page and a row say. */
export function itemCopyDe(d: { itemKind: ProcedureItemKind; variant?: BundesratMotionVariant | null; treatyKind?: TreatyKind | null }): ItemKindCopy {
  if (d.itemKind === 'staatsvertrag' && d.treatyKind === 'vereinbarung-15a') return VEREINBARUNG_15A_DE
  return d.itemKind === 'bundesratsantrag' && d.variant === 'drittel' ? BUNDESRAT_DRITTEL_DE : ITEM_KIND_DE[d.itemKind]
}

/**
 * The sentence that stands where the door and the Stellungnahmen stand on
 * the other kinds, where Parliament takes none on the kind (`ItemFiling`).
 * Parliament's record of every treaty's Vorlage refuses them (its
 * `statementsstate` „9 …", 169 of 169 in GP XXVI–XXVIII); the page names
 * that record as its source (`FILING_CLOSED_SOURCE_DE`) rather than quoting
 * it — everything about Stellungnahmen is excluded from Parliament's
 * licence.
 */
export const FILING_CLOSED_DE: Readonly<Record<FilingClosedReason, string>> = {
  treaty: 'Zu Staatsverträgen nimmt das Parlament keine Stellungnahmen an.',
}

/** The same sentence for an item — an Art.-15a-Vereinbarung is no
 *  Staatsvertrag on its page, though Parliament files it as one (`RVS`). */
export function filingClosedDe(reason: FilingClosedReason, treatyKind: TreatyKind | null | undefined): string {
  return reason === 'treaty' && treatyKind === 'vereinbarung-15a'
    ? 'Zu Vereinbarungen nach Art. 15a B-VG nimmt das Parlament keine Stellungnahmen an.'
    : FILING_CLOSED_DE[reason]
}

/** The source line under `FILING_CLOSED_DE`: Parliament's record of the item. */
export function filingClosedSourceDe(citation: string): string {
  return `Quelle: Datensatz des Parlaments zu ${citation}`
}

/**
 * Who brought it in, as one sentence: the Ressort for a Vorlage, the clubs
 * of the movers for an Antrag, the committee for a committee's motion, the
 * Bundesrat or a third of its members for a motion of the Bundesrat —
 * never a deputy's or a member's name. A committee's motion and the
 * Bundesrat's never say „von der Bundesregierung": the government did not
 * bring them in. A motion of the Bundesrat whose variant is unknown says
 * only what both share.
 */
export function itemBylineDe(d: Pick<VorlageDetail, 'itemKind' | 'ministry' | 'moverClubs' | 'committee' | 'variant'>): string {
  if (d.itemKind === 'ausschussantrag') {
    return d.committee ? `Eingebracht vom ${d.committee} des Nationalrates` : 'Eingebracht von einem Ausschuss des Nationalrates'
  }
  if (d.itemKind === 'bundesratsantrag') {
    return d.variant === 'drittel'
      ? 'Eingebracht von einem Drittel der Mitglieder des Bundesrates'
      : d.variant === 'bundesrat'
        ? 'Eingebracht vom Bundesrat'
        : 'Eingebracht aus dem Bundesrat'
  }
  if (d.itemKind === 'initiativantrag') {
    const clubs = d.moverClubs
    if (!clubs?.length) return 'Eingebracht von Abgeordneten'
    const list = clubs.length < 2 ? clubs[0] : `${clubs.slice(0, -1).join(', ')} und ${clubs.at(-1)}`
    return `Eingebracht von Abgeordneten von ${list}`
  }
  // A Regierungsvorlage — and a treaty's Vorlage, which Parliament types
  // „Regierungsvorlage: Staatsvertrag" and a member of the government
  // submits (119, 388 d.B. XXVIII).
  return d.ministry ? `Eingebracht von der Bundesregierung, ${d.ministry}` : 'Eingebracht von der Bundesregierung'
}

/**
 * The citation a footnote uses: „RV 589 BlgNR 28. GP" for a Vorlage, „AB 14
 * BlgNR 28. GP" for a committee's motion (as the Bundesgesetzblatt cites it,
 * `buaCitationDe`), „452 BlgNR 25. GP" for a motion of the Bundesrat
 * (`beilageCitationDe`: never „RV"); an Antrag is no Beilage.
 */
export function itemCiteAsDe(d: Pick<VorlageDetail, 'itemKind' | 'citation' | 'gp'>): string {
  if (d.itemKind === 'ausschussantrag') return buaCitationDe(d.citation, d.gp)
  if (d.itemKind === 'bundesratsantrag') return beilageCitationDe(d.citation, d.gp)
  if (d.itemKind === 'initiativantrag') return `Antrag ${d.citation} ${d.gp}. GP`
  // A treaty's Vorlage is a Regierungsvorlage (Parliament's type
  // „Regierungsvorlage: Staatsvertrag"): „RV 119 BlgNR 28. GP".
  return rvCitationDe(d.citation, d.gp)
}

/**
 * Why a committee's motion shows no text comparison yet: the comparison
 * names its first text by the station it stands at, and that station's name
 * is „Regierungsvorlage" (`LAW_STATION_LABEL`) — on this page a false
 * statement. Until the comparison has a name for the committee's text, the
 * page says so instead of showing one.
 */
export const NO_COMPARISON_DE: Partial<Record<ProcedureItemKind, string>> = {
  ausschussantrag: 'Einen Textvergleich vom Ausschussantrag bis zum Gesetz zeigt der Monitor für Ausschussanträge noch nicht; die Texte stehen unter „Dokumente“ und auf parlament.gv.at.',
  bundesratsantrag: 'Einen Textvergleich vom Gesetzesantrag bis zum Gesetz zeigt der Monitor für Gesetzesanträge aus dem Bundesrat noch nicht; die Texte stehen unter „Dokumente“ und auf parlament.gv.at.',
  // A treaty: the Nationalrat approves the text, it does not change it
  // (Art. 50 B-VG), and the Vertragstext is no Gesetzestext the comparison
  // reads — in BGBl. III or, for an Art.-15a-Vereinbarung, in BGBl. I.
  staatsvertrag: 'Einen Textvergleich bis zur Kundmachung zeigt der Monitor für Staatsverträge und Vereinbarungen nach Art. 15a B-VG nicht; die Texte stehen unter „Dokumente“ und auf parlament.gv.at.',
}

/**
 * The rail's line for the item a committee's motion relates to (Parliament's
 * „Bezug zu"), where the monitor has a page for it — the first such item;
 * null where none has one. Parliament's own word, no claim beyond it.
 */
export function relatedFollowUpDe(items: readonly RelatedItem[]): { before: string; link: { href: string; label: string }; after: string } | null {
  const parent = items.find((i) => i.path && i.kind)
  if (!parent?.path || !parent.kind) return null
  return { before: 'Bezug zu ', link: { href: parent.path, label: `${ITEM_KIND_DE[parent.kind].word} ${parent.citation} →` }, after: '' }
}

/**
 * The rail's line where an item a committee's motion relates to went through
 * a Begutachtung (`RelatedItem.consultedDraft`, 14.11.2026) — in place of
 * „ob ein Ministerialentwurf vorausging, ist hier nicht belegt", which the
 * line under it would contradict. One sentence that names the parent and
 * links the draft. It never says the committee's text IS the consulted
 * text: the committee may have rewritten it, and nobody here compared them.
 * Null where no parent names a consulted draft.
 */
export function relatedConsultedDe(items: readonly RelatedItem[]): { before: string; link: { href: string; label: string }; after: string } | null {
  const parent = items.find((i) => i.consultedDraft && (i.kind === 'regierungsvorlage' || i.kind === 'initiativantrag'))
  if (!parent?.consultedDraft) return null
  const href = parent.consultedDraft.path
  return parent.kind === 'regierungsvorlage'
    ? { before: `Der Ausschussantrag bezieht sich auf die Regierungsvorlage ${parent.citation}, deren `, link: { href, label: 'Ministerialentwurf' }, after: ' in Begutachtung war.' }
    : { before: `Der Ausschussantrag bezieht sich auf den Initiativantrag ${parent.citation}, in dem Text eines begutachteten `, link: { href, label: 'Ministerialentwurfs' }, after: ' steht.' }
}

/** The facts of the Begutachtung station beside `relatedConsultedDe`: what
 *  cannot be told is the committee's own text. */
export const RELATED_CONSULTED_FACTS_DE: readonly string[] = ['nicht feststellbar', 'für den Text des Ausschusses']

/**
 * An Initiativantrag that carries a consulted draft's text (`ANTRAG_PATHS`,
 * decision 9 of 14.11.2026): the sentence that names the draft and links
 * it, worded by the match — and whether the Begutachtung station may show
 * the draft's Begutachtung as reached (`carries`, `carriesDraft`). Where
 * only a part stands in the draft, the station stays „nicht feststellbar":
 * the rest of the Antrag may be text nobody consulted. No redirect — a
 * partial match would send the reader to a different bill. Null where the
 * table names no draft, which claims nothing either way.
 */
export function carriedDraftDe(d: Pick<VorlageDetail, 'itemKind' | 'gp' | 'inr'>): { carries: boolean; citation: string; line: { before: string; link: { href: string; label: string }; after: string } } | null {
  if (d.itemKind !== 'initiativantrag') return null
  const draft = draftOfAntrag(d.gp, d.inr)
  if (!draft) return null
  const citation = `${draft.inr}/ME`
  const href = `/entwuerfe/${draft.gp}/${draft.inr}`
  return carriesDraft(draft.path)
    ? { carries: true, citation, line: { before: 'Der Text dieses Antrags ist der des ', link: { href, label: `Ministerialentwurfs ${citation}` }, after: ', der begutachtet wurde.' } }
    : { carries: false, citation, line: { before: 'Ein Teil dieses Antrags steht wörtlich im ', link: { href, label: `Ministerialentwurf ${citation}` }, after: '.' } }
}

/** The facts of the Begutachtung station beside a partial `carriedDraftDe`. */
export const CARRIED_PART_FACTS_DE: readonly string[] = ['nicht feststellbar', 'für den Antrag als Ganzes']
