/**
 * List 142 — Stellungnahmen: the row mapper with its GDPR path, the item's
 * page URL and the document behind it.
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports,
 * so vitest can execute the module directly.
 *
 * Row indices: docs/architecture.md §5 / docs/api-exploration.md §1,
 * verified live on 2026-08-15 (list 142: 23 columns).
 */
import type { StatementDocument, StatementMeta } from '../../../shared/types'
import { parseGermanDate, parseIsoDate } from './dates'
import type { RawDocumentGroup } from './detailJson'
import { absolutizeUrl, PARLIAMENT_BASE, stripHtmlToText } from './htmlText'
import { normalizeOrgName } from './organisations'
import { classifySubmitter, readUpstreamFlag } from './privacy'
import { asNumber, asString } from './rowCells'

// ---------------------------------------------------------------------------
// List 142 — Stellungnahmen (23 columns, 0-based)
// 0 gp · 1 ityp of the Stellungnahme (SNME on a Ministerialentwurf, SN on a
// Regierungsvorlage) · 2 its INR · 4 date (display) · 5 dateSort (ISO) ·
// 6 submitter (HTML <a> or placeholder text) · 12 endorsements ·
// 15 citation ("476/SN-88/ME" on an ME, "277139/SN" on an RV) ·
// 19 TYP — upstream's organisation ('I') / person ('P') flag
// Deviation from §5 noted: [5] DATUM_SORT is ISO and preferred;
// [4] (dd.mm.yyyy) serves only as fallback.
// The positions are asserted against the header at fetch time
// (`listHeaders.ts`), so a reorder upstream fails loudly instead of turning
// every submitter into "Privatperson".
// ---------------------------------------------------------------------------

/** The item types a Stellungnahme comes as — also the path segment of its page. */
export type StatementItemType = 'SNME' | 'SN'

export function statementPageUrl(gp: string, ityp: StatementItemType, inr: number): string {
  return `${PARLIAMENT_BASE}/gegenstand/${gp}/${ityp}/${inr}`
}

/**
 * The Stellungnahme's own document out of its detail JSON: the first PDF
 * in `content.documents[]`, else the page (web-form submissions have no
 * file; the text is inline). Two link shapes upstream:
 * `/dokument/XXVII/SNME/81457/imfname_942193.pdf` on a Ministerialentwurf,
 * `/PtWeb/api/s3serv/file/{uuid}` on a Regierungsvorlage — no extension,
 * but `type: "PDF"`, which is what decides here.
 */
export function pickStatementDocument(
  groups: RawDocumentGroup[] | null | undefined,
  pageUrl: string,
): StatementDocument {
  for (const group of groups ?? []) {
    for (const doc of group?.documents ?? []) {
      if ((doc?.type ?? '').toUpperCase() === 'PDF' && doc?.link) {
        return { kind: 'pdf', url: absolutizeUrl(doc.link) }
      }
    }
  }
  return { kind: 'page', url: pageUrl }
}

export function mapStatementRow(row: unknown[]): StatementMeta {
  const gp = asString(row[0])
  // 'SN' is the Stellungnahme on a Regierungsvorlage; everything else is the
  // SNME the monitor started with — the header check already vouches for
  // the column, this only keeps the URL well-formed.
  const ityp: StatementItemType = asString(row[1]) === 'SN' ? 'SN' : 'SNME'
  const snInr = asNumber(row[2])
  const citation = asString(row[15])

  // "<a …>Mustermann, Maria (237/SN-126/ME)</a>" → "Mustermann, Maria";
  // on a Regierungsvorlage the bracket reads "(277139/SN)".
  const rawSubmitter = stripHtmlToText(asString(row[6])).replace(
    /\s*\(\d+\/SN(?:-[^)]*)?\)\s*$/,
    '',
  )
  // Column 19 is upstream's own organisation/person flag (`I`/`P`). It is a
  // second opinion on the GDPR question, and it can only ever suppress a
  // name, never publish one — see `classifySubmitter`.
  const { kind, name } = classifySubmitter(rawSubmitter, readUpstreamFlag(row[19]))

  return {
    citation,
    date: parseIsoDate(row[5]) ?? parseGermanDate(asString(row[4])),
    submitterKind: kind,
    submitterName: name !== null ? normalizeOrgName(name) : null,
    endorsements: asNumber(row[12]),
    parliamentUrl: `${PARLIAMENT_BASE}/gegenstand/${gp}/${ityp}/${snInr}`,
  }
}
