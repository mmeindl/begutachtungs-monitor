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

/** The copied string: the parts that exist, joined by commas. */
export function citeLineDe(...parts: (string | null | undefined)[]): string {
  return parts.map((p) => p?.trim()).filter(Boolean).join(', ')
}

const AMENDED_BY = /zuletzt geändert durch\s+(BGBl\.\s+(?:I{1,3}\s+)?Nr\.\s*(\d+)\/(\d{4}))/

/**
 * The law's latest amendment, from the Kundmachungsorgan of its §
 * versions in force („BGBl. I Nr. 120/2002 zuletzt geändert durch BGBl. I
 * Nr. 50/2024") — what „idF" names in a citation (21.10.2026). Each §
 * version names the Novelle that made it; the law stands in the newest of
 * them, by year and then number. Null where no § was ever amended.
 */
export function latestAmendmentOf(organs: readonly (string | null | undefined)[]): string | null {
  let best: { cite: string; year: number; nr: number } | null = null
  for (const organ of organs) {
    const m = AMENDED_BY.exec(organ ?? '')
    if (!m) continue
    const cand = { cite: m[1]!.replace(/\s+/g, ' '), year: Number(m[3]), nr: Number(m[2]) }
    if (!best || cand.year > best.year || (cand.year === best.year && cand.nr > best.nr)) best = cand
  }
  return best?.cite ?? null
}

/** „Universitätsgesetz 2002, BGBl. I Nr. 120/2002 idF BGBl. I Nr. 50/2024, <URL>". */
export function lawCiteDe(title: string, stammnorm: string, amendedBy: string | null, url: string): string {
  return citeLineDe(title, amendedBy ? `${stammnorm} idF ${amendedBy}` : stammnorm, url)
}
