/**
 * One RIS Begut record, flattened from the OGD JSON
 * (docs/api-exploration.md §2).
 *
 * PURE MODULE — no Nuxt auto-imports, only relative imports, so vitest and
 * the corpus audit in `scripts/verordnungen-corpus.ts` can execute it
 * directly. It used to live inside `ris.ts`, which pulls in the Nitro cache
 * and `#shared/*`; a measurement script could then only re-implement the
 * flattening, and a re-implemented mapper measures itself, not the product.
 */
import type { RisBegutRecord } from './risJoin'

/** The formats RIS offers for one document of a Begut record. */
export interface RisDocumentUrls {
  html: string | null
  xml: string | null
  pdf: string | null
}

/** RIS record plus the document URLs the UI needs. */
export interface RisBegutFlat extends RisBegutRecord {
  geaendert: string | null
  mainDocument: RisDocumentUrls
  /**
   * The ressort's own Textgegenüberstellung, when the draft carries one.
   * RIS offers it as XML, Parliament only as PDF (docs/api-exploration.md
   * §2c) — which is why this comes from here and not from the Parliament
   * document list the rest of the detail page uses.
   */
  textComparison: RisDocumentUrls | null
  /**
   * The Erläuterungen as their own RIS document — the Allgemeiner Teil a
   * reader triages a draft by, and the "Zu Z 4 (§ 54c …)" passages under it.
   * Carried for every record class; on a Verordnungsentwurf it is the only
   * reasoning the procedure publishes at all, because there is no
   * parliamentary Kurzinformation to fall back on.
   */
  explanations: RisDocumentUrls | null
  /**
   * The ressort's Begleitschreiben (`ContentType: "Letter"`) — it names the
   * address a Stellungnahme goes to. For a Ministerialentwurf that is a
   * convenience beside Parliament's own form; for a Verordnungsentwurf it is
   * the ONLY answer to "where do I send it?", because there is no form.
   */
  coverLetter: RisDocumentUrls | null
}

/** XML-to-JSON trap: one element → bare object, several → array. */
export function asArray<T>(x: T | T[] | null | undefined): T[] {
  if (x === null || x === undefined) return []
  return Array.isArray(x) ? x : [x]
}

/** ISO date `YYYY-MM-DD` or null; RIS dates arrive as `YYYY-MM-DD` or `YYYY-MM-DDT…`. */
function isoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v)
  return m ? m[1]! : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/**
 * The annex is named inconsistently across ressorts: "Textgegenüberstellung",
 * "TGÜ", "TGG", and a misspelt "Textgegenbüberstellung" all occur in the
 * corpus, so the match has to be loose (docs/api-exploration.md §2c).
 *
 * Known and deliberately NOT widened here: a Sammelnovelle can prefix the
 * abbreviation per law ("SAG_TGÜ" on 135/ME), which the anchored half of
 * this pattern misses. Widening it changes the input of the annex engine,
 * whose baseline is pinned per draft (`tests/fixtures/annex-baseline.json`)
 * and watched by the weekly drift alarm — so it is its own step, with its
 * own measurement, not a side effect of this one.
 */
const TEXT_COMPARISON_NAME = /gegen.?über|^TG(Ü|G|UE)$/i

/**
 * The Erläuterungen document. Spelt consistently across the corpus so far,
 * but matched loosely for the same reason the annex above is: a ressort's
 * spelling is not a contract.
 */
const EXPLANATIONS_NAME = /erl(ä|ae|a)uterung/i

/** Human-readable RIS page of one Begut record. */
export function risDocumentUrl(id: string): string {
  return `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Begut&Dokumentnummer=${encodeURIComponent(id)}`
}

// Loosely typed: the OGD JSON is generated from XML and not contractual.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function flattenRisRecord(doc: any): RisBegutFlat | null {
  const meta = doc?.Data?.Metadaten
  const id = str(meta?.Technisch?.ID)
  if (!id) return null
  const b = meta?.Bundesrecht ?? {}
  const bg = b?.Begut ?? {}
  const references = asArray<any>(doc?.Data?.Dokumentliste?.ContentReference)
  /** Formats of one reference, or null when the reference is absent. */
  const formatsOf = (ref: any): RisDocumentUrls | null => {
    if (!ref) return null
    const list = asArray<any>(ref?.Urls?.ContentUrl)
    const of = (type: string) => str(list.find((u) => u?.DataType === type)?.Url)
    return { html: of('Html'), xml: of('Xml'), pdf: of('Pdf') }
  }
  const named = (re: RegExp) => references.find((c) => re.test(String(c?.Name ?? '').trim()))
  const main = formatsOf(references.find((c) => c?.ContentType === 'MainDocument'))
  return {
    id,
    kurztitel: str(b?.Kurztitel),
    titel: str(b?.Titel),
    abk: str(bg?.Abkuerzung),
    stelle: str(bg?.EinbringendeStelle) ?? str(meta?.Technisch?.Organ),
    beginn: isoDate(bg?.BeginnBegutachtungsfrist),
    ende: isoDate(bg?.EndeBegutachtungsfrist),
    geaendert: isoDate(meta?.Allgemein?.Geaendert),
    mainDocument: main ?? { html: null, xml: null, pdf: null },
    textComparison: formatsOf(named(TEXT_COMPARISON_NAME)),
    explanations: formatsOf(named(EXPLANATIONS_NAME)),
    // By ContentType, not by name: "Begleitschreiben Begutachtungsentwurf"
    // is the usual wording, but the type is what RIS actually commits to.
    coverLetter: formatsOf(references.find((c) => c?.ContentType === 'Letter')),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Whether a document reference carries at least one usable format. */
export function hasDocument(d: RisDocumentUrls | null): boolean {
  return Boolean(d && (d.html || d.xml || d.pdf))
}

/**
 * Was this record in Begutachtung on `isoDay`?
 *
 * Both dates are required, and that is the known bound on every count built
 * on this: `EndeBegutachtungsfrist` is optional upstream
 * (docs/api-exploration.md §2), so a record without a Frist is invisible to
 * this predicate — the same bound RIS's own `InBegutachtungAm` filter has.
 * Every "N open" figure derived here is therefore a LOWER bound, and the UI
 * says so rather than claiming completeness.
 */
export function isOpenOn(r: Pick<RisBegutFlat, 'beginn' | 'ende'>, isoDay: string): boolean {
  return Boolean(r.beginn && r.ende && r.beginn <= isoDay && r.ende >= isoDay)
}
