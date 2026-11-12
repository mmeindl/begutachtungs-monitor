/**
 * What the „Zitieren" button copies (21.10.2026): the official citation and
 * the official address, in one string, ready for a footnote.
 *
 * Never an address of this site. Whoever cites a draft cites it in a
 * Stellungnahme, a brief or a press release, and there the primary source
 * is what counts — a link to the monitor would make their text depend on a
 * site that may not outlive it. And never the URL alone: the citation is the
 * part that is typed wrong by hand (Periode, Nummer, I or II).
 *
 * One form for all of them, „<Was>, <URL>", because a footnote reads left
 * to right: what it is, where. A document names the item it belongs to with
 * „zu" (`DocumentList`).
 *
 * Pure module so vitest can import it relatively.
 */
import type { LawStationId, TraceLink } from '../types'
import type { EuOjReference } from '../types/eu'
import { euActTitle } from './eu'
import { formatDateDe } from './format'
import { romanToInt } from './gp'

/** „Ministerialentwurf 115/ME XXVIII. GP" — the draft as Parliament cites it. */
export function draftCitationDe(citation: string, gp: string): string {
  return `Ministerialentwurf ${citation} ${gp}. GP`
}

/**
 * A document of the Nationalrat's Beilagen as lawyers cite it (21.10.2026):
 * „RV 525 BlgNR 28. GP", „ErläutRV 525 BlgNR 28. GP", „AB 567 BlgNR 28.
 * GP" — the kind, the number of the Beilage, the period in Arabic numerals.
 * Parliament writes „525 d.B. XXVIII. GP"; a footnote in a brief or a
 * Stellungnahme writes this, and this is what gets typed wrong by hand.
 * Null where the citation is no „<n> d.B." or the period no numeral.
 */
export function blgNrDe(kind: 'RV' | 'ErläutRV' | 'AB', citation: string, gp: string): string | null {
  const nr = /^(\d+)\s*d\.\s*B\.?$/.exec(citation.trim())?.[1]
  const period = romanToInt(gp)
  return nr && period ? `${kind} ${nr} BlgNR ${period}. GP` : null
}

/**
 * The Beilage a Parliament document address belongs to — `/dokument/XXVIII/I/297/…`
 * is 297 d.B. of the XXVIII. GP. Null for any other item type.
 */
export function beilageOfUrl(url: string | null | undefined): { citation: string; gp: string } | null {
  const m = /\/dokument\/([IVXLC]+)\/I\/(\d+)\//.exec(url ?? '')
  return m ? { citation: `${m[2]} d.B.`, gp: m[1]! } : null
}

/** „Regierungsvorlage 525 d.B. XXVIII. GP" — the fallback where `blgNrDe` has no answer. */
export function rvCitationDe(citation: string, gp: string): string {
  return blgNrDe('RV', citation, gp) ?? `Regierungsvorlage ${citation} ${gp}. GP`
}

/**
 * „ErläutRV 297 BlgNR 28. GP, zu Z 4 (Art. II § 1 Abs. 5)" — the passage of
 * the Vorlage's Erläuterungen on one change, under the Ressort's own
 * heading („Zu Z 4 (Art. II § 1 Abs. 5):"). The most exact footnote there
 * is, and the one a reader would otherwise have to assemble from the PDF.
 */
export function erlRvPassageDe(erlRv: string, heading: string | null | undefined): string {
  const h = (heading ?? '').trim().replace(/:\s*$/, '').replace(/^Zu\b/, 'zu')
  return h ? `${erlRv}, ${/^zu\b/.test(h) ? h : `zu ${h}`}` : erlRv
}

/**
 * The document a version of the law text in the § comparison stands in, as
 * cited, and its address (11.11.2026): „Ministerialentwurf 115/ME XXVIII.
 * GP", „RV 129 BlgNR 28. GP", „AB 151 BlgNR 28. GP", „BGBl. I Nr. 50/2025"
 * at its ELI. The Ausschussfassung is the Gesetzestext of the committee
 * report's Beilage, so it is cited by that report — and refused where its
 * address is the Vorlage's Beilage, which would cite the Vorlage as „AB".
 * Null for the Plenarfassung, a Beschluss of the Nationalrat that is no
 * Beilage and has no citation of its kind here, and wherever the address
 * says nothing that can be cited.
 */
export function lawTextCiteDe(
  station: LawStationId,
  document: TraceLink | null | undefined,
  draft: { citation: string; gp: string },
  rvDocument?: TraceLink | null,
): { cited: string; url: string } | null {
  if (!document) return null
  const { url } = document
  if (station === 'me') return { cited: draftCitationDe(draft.citation, draft.gp), url }
  if (station === 'bgbl') {
    const cited = bgblShortDe(document.label)
    return cited ? { cited, url: bgblEliUrl(document.label) ?? url } : null
  }
  if (station === 'plenum') return null
  const b = beilageOfUrl(url)
  if (!b) return null
  if (station === 'ausschuss') {
    const rv = beilageOfUrl(rvDocument?.url)
    if (rv && rv.citation === b.citation && rv.gp === b.gp) return null
  }
  const cited = blgNrDe(station === 'rv' ? 'RV' : 'AB', b.citation, b.gp)
  return cited ? { cited, url } : null
}

/**
 * One changed unit of that text by its own designation, after the document
 * (11.11.2026): „RV 129 BlgNR 28. GP, Art. 106 Z 1" — the Novellierungs-
 * anordnung of a Sammelgesetz — or „…, § 5" for a Paragraph of a new law.
 * The form of `erlRvPassageDe`: the document, then the passage.
 *
 * Null where the designation would not find the unit: an Artikel-divided
 * text without the unit's Artikel (`divided` and no key), a Ziffer whose
 * number recurs inside its Artikel (`#dup`, the numbering starts over at
 * the next law), and any id that is neither „§ …" nor „Z …". The Artikel is
 * the number the comparison keys it by, in Arabic numerals.
 */
export function lawUnitCiteDe(cited: string, id: string, articleKey: string | null, divided: boolean, articleTitle?: string | null): string | null {
  const m = /^(§|Z)\s*(\d+[a-z]*)$/.exec(id)
  if (!m || (divided && !articleKey)) return null
  const unit = `${m[1]} ${m[2]}`
  return `${cited}, ${articleKey ? `Art. ${articleNumeral(articleKey, articleTitle)} ${unit}` : unit}`
}

/**
 * Whether one side's text is divided into Artikel or laws — the `divided`
 * of `lawUnitCiteDe`: any unit with an Artikel, or units of more than one
 * law. Then a Ziffer or § without its Artikel names no single place.
 */
export function dividedText(units: readonly { key: string | null; law: string | null | undefined }[]): boolean {
  return units.some((u) => u.key) || new Set(units.map((u) => u.law ?? '')).size > 1
}

/**
 * The Artikel as the document prints it, where its title says so: a Land's
 * Novelle heads its one Artikel „Artikel I", and „Art. 1" would not be found
 * in it. Only where the title's numeral is the key; the key otherwise.
 */
function articleNumeral(key: string, title: string | null | undefined): string {
  const n = /^Art(?:ikel|\.)\s*([IVXLC]+|\d+)\b/.exec(title?.trim() ?? '')?.[1]
  if (!n) return key
  const value = /^\d+$/.test(n) ? Number(n) : romanToInt(n)
  return value !== null && String(value) === key ? n : key
}

/**
 * One § of a Textgegenüberstellung (11.11.2026): the annex named as
 * `DocumentList` names a draft's document, „Textgegenüberstellung zu
 * Ministerialentwurf 18/ME XXVIII. GP", then — in an annex of several laws —
 * the law under the heading the annex prints, then the §: „…, Artikel 1
 * Änderung des Arbeits- und Sozialgerichtsgesetzes, § 29".
 *
 * Null where the § could not be found by it: a designation that is no „§ n",
 * one the annex prints twice (`repeated`), and a § of an annex of several
 * laws that names none (`severalLaws` and no `law`).
 */
export function annexParagraphCiteDe(
  citeAs: string,
  designation: string | null,
  law: string | null,
  opts: { severalLaws: boolean; repeated?: boolean },
): string | null {
  const m = /^§\s*(\d+[a-z]*)\.?$/.exec(designation?.trim() ?? '')
  if (!m || !citeAs || opts.repeated || (opts.severalLaws && !law)) return null
  return citeLineDe(`Textgegenüberstellung zu ${citeAs}`, opts.severalLaws ? law : null, `§ ${m[1]}`)
}

/**
 * The document a version of a Land's law text stands in, as the Land's
 * pages cite it (11.11.2026): the draft as `LandDraftPage` cites it
 * (`citeAs`), the Landtag's Beilagen in the record's own words
 * („Regierungsvorlage, Beilage 898/2024", „Nr 148 der Beilagen …",
 * „Ausschussbericht Beilage 951/2024"), the Kundmachung by its number, and
 * the Land's Textgegenüberstellung — which prints both columns of the
 * comparison against the law in force — as `DocumentList` names a document
 * of the draft. Null for a label that carries no such number, and for a
 * document without an address.
 */
export function landTextCiteDe(
  station: 'geltend' | 'entwurf' | 'rv' | 'antrag' | 'ausschuss' | 'lgbl' | 'vorher' | 'nachher',
  document: { label: string; url: string | null } | null | undefined,
  citeAs: string | null | undefined,
): { cited: string; url: string } | null {
  const url = document?.url
  if (!document || !url) return null
  const label = document.label.trim()
  const BEILAGE = /Beilage\s+\d+\/\d{4}/
  let cited: string | null
  if (station === 'geltend') cited = citeAs ? `${label} zu ${citeAs}` : null
  else if (station === 'entwurf') cited = citeAs || null
  else if (station === 'rv') cited = BEILAGE.test(label) || /Nr\.?\s+\d+ der Beilagen/.test(label) ? label : null
  // An Initiativantrag (a Landesgesetz's page): only with a number that
  // names one Beilage — Oberösterreich's „Beilage 703/2023", Salzburg's
  // „Nr 547 der Beilagen (4. Session der 17. GP)"; a bare „Nr. 547" repeats
  // every session.
  else if (station === 'antrag') cited = BEILAGE.test(label) || /Nr\.?\s+\d+ der Beilagen \(\d+\. Session der \d+\. GP\)/.test(label) ? label : null
  else if (station === 'ausschuss') cited = BEILAGE.test(label) ? label : null
  // A Landesgesetz's page (12.11.2026): the § after the change, as „Salzburger … idF LGBl. Nr. 31/2026" —
  // only where the Landesgesetzblatt changed one law; the wording before it has no single citation.
  else if (station === 'nachher') cited = /\sidF LGBl\.?\s*Nr\.\s*\d+\/\d{4}$/.test(label) ? label : null
  else if (station === 'vorher') cited = null
  else cited = /^LGBl\.?\s*Nr\.\s*\d+\/\d{4}$/.test(label) ? label : null
  return cited ? { cited, url } : null
}

const BGBL = /\b(I{1,3})\s+Nr\.\s*(\d+)\/(\d{4})\b/

/**
 * „BGBl. I Nr. 69/2026" from any of the forms upstream writes the number in
 * („Bundesgesetzblatt I Nr. 69/2026", „BGBl. I Nr. 69/2026"); null for a
 * string that is no BGBl number.
 */
export function bgblShortDe(number: string): string | null {
  const m = BGBL.exec(number)
  return m ? `BGBl. ${m[1]} Nr. ${m[2]}/${m[3]}` : null
}

/**
 * The ELI address of a Bundesgesetzblatt — the European Legislation
 * Identifier RIS resolves to the authentic document
 * (`/eli/bgbl/I/2026/69` → BGBLA_2026_I_69, checked 21.10.2026). Stable by
 * design, where the `Dokument.wxe` link carries an internal document number.
 * Only from 2004 on: older issues are not in the authentic BGBl and RIS has
 * no ELI for them, so the caller keeps the link it has.
 */
export function bgblEliUrl(number: string): string | null {
  const m = BGBL.exec(number)
  if (!m || Number(m[3]) < 2004) return null
  return `https://www.ris.bka.gv.at/eli/bgbl/${m[1]}/${m[3]}/${m[2]}`
}

/**
 * A Landesgesetzblatt's address in RIS (22.10.2026): `LGBl. Nr. 45/2026`
 * → `https://www.ris.bka.gv.at/eli/lgbl/OB/2026/45`, `eliLand` being RIS's
 * code for the Land (Oberösterreich: `OB`). Checked for Oberösterreich over
 * 2020–2026, the years its drafts on the Land's lists reach: each address
 * opens that number's Kundmachung. RIS answers an unknown number with 200
 * too, so only numbers the Land itself recorded are linked.
 */
export function lgblEliUrl(eliLand: string, number: string): string | null {
  const m = /LGBl\.?\s*Nr\.\s*(\d+)\/(\d{4})/.exec(number)
  return m ? `https://www.ris.bka.gv.at/eli/lgbl/${eliLand}/${m[2]}/${m[1]}` : null
}

/** The copied string: the parts that exist, joined by commas. */
export function citeLineDe(...parts: (string | null | undefined)[]): string {
  return parts.map((p) => p?.trim()).filter(Boolean).join(', ')
}

const AMENDED_BY = /zuletzt geändert durch\s+(BGBl\.\s+(?:(I{1,3})\s+)?Nr\.\s*(\d+)\/(\d{4}))/

/**
 * The law's latest amendment, from the Kundmachungsorgan of its §
 * versions in force („BGBl. I Nr. 120/2002 zuletzt geändert durch BGBl. I
 * Nr. 50/2024") — what „idF" names in a citation (21.10.2026). Each §
 * version names the Novelle that made it; the law stands in the newest of
 * them, by year and then number. Null where no § was ever amended.
 *
 * **By number only inside one Teil.** BGBl. I and BGBl. II count separately,
 * so „II Nr. 20/2026" says nothing about coming after „I Nr. 8/2026": the
 * Bundesvergabegesetz Verteidigung und Sicherheit 2012 was cited „idF
 * BGBl. II Nr. 20/2026" (10.02.2026) where BGBl. I Nr. 8/2026 (27.02.2026)
 * is the newer (22.10.2026). The § versions carry no issue date to decide
 * by, so where the newest year holds two Teile there is no „idF" — a
 * citation without it is incomplete, one with the wrong Novelle is wrong.
 */
export function latestAmendmentOf(organs: readonly (string | null | undefined)[]): string | null {
  const amendments = organs.flatMap((organ) => {
    const m = AMENDED_BY.exec(organ ?? '')
    return m ? [{ cite: m[1]!.replace(/\s+/g, ' '), teil: m[2] ?? '', nr: Number(m[3]), year: Number(m[4]) }] : []
  })
  if (amendments.length === 0) return null
  const year = Math.max(...amendments.map((a) => a.year))
  const newest = amendments.filter((a) => a.year === year)
  if (new Set(newest.map((a) => a.teil)).size > 1) return null
  return newest.reduce((best, a) => (a.nr > best.nr ? a : best)).cite
}

/** „Universitätsgesetz 2002, BGBl. I Nr. 120/2002 idF BGBl. I Nr. 50/2024, <URL>". */
export function lawCiteDe(title: string, stammnorm: string, amendedBy: string | null, url: string): string {
  return citeLineDe(title, amendedBy ? `${stammnorm} idF ${amendedBy}` : stammnorm, url)
}

/**
 * The Amtsblatt reference as EUR-Lex prints it under a German act
 * (06.11.2026): „ABl. L 333 vom 27.12.2022, S. 80" for an act in a numbered
 * issue, „ABl. L, 2023/2413, 31.10.2023" for one published on its own, the
 * Journal's form since 01.10.2023. Without a page, the issue alone.
 */
export function euOjCiteDe(oj: EuOjReference): string {
  if (oj.form === 'act') return `ABl. ${oj.series}, ${oj.act}, ${formatDateDe(oj.date)}`
  return `ABl. ${oj.series} ${oj.issue} vom ${formatDateDe(oj.date)}${oj.page ? `, S. ${oj.page}` : ''}`
}

/**
 * An EU act as a footnote cites it (06.11.2026): the official title, the
 * Amtsblatt reference, the ELI — „Richtlinie (EU) 2022/2555 des
 * Europäischen Parlaments und des Rates vom 14. Dezember 2022 über …, ABl. L
 * 333 vom 27.12.2022, S. 80, http://data.europa.eu/eli/dir/2022/2555/oj".
 * The reference is the part looked up by hand; the title alone is copied
 * from any page. The short label and the EUR-Lex address where the Cellar
 * gave no title or ELI.
 */
export function euActCiteDe(act: { label: string; title: string | null; eurLexUrl: string }, oj: EuOjReference | null, eli: string | null): string {
  return citeLineDe(euActTitle(act.title) ?? act.label, oj ? euOjCiteDe(oj) : null, eli ?? act.eurLexUrl)
}
