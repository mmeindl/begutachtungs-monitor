/**
 * Which laws in force the draft would change — the "Geltendes Recht" end of
 * the version chain.
 *
 * Deliberately NOT part of `paraTitleService`, which answers a neighbouring
 * question with a much heavier apparatus: that one keys off the diff's
 * units, so it returns nothing until a Regierungsvorlage exists. The laws a
 * draft amends are knowable from the draft alone, and the case that needs
 * them most is the consultation that is still running — where a reader can
 * still act on what they find.
 *
 * The reference date is the draft's Einlangen, the same one the § titles
 * use: the law as the draft found it. RIS honours `FassungVom`, so the link
 * shows that version rather than today's — which for an enacted draft would
 * already contain the very change the draft made.
 *
 * A law the Promulgationsklausel names but RIS cannot resolve is kept and
 * marked, never dropped: the UGB's Stammnorm is "dRGBl. S. 219/1897", which
 * is no BGBl and yields no Gesetzesnummer (`lawtext/bgblCitation.ts`), and a
 * silently shortened list would misstate what the draft touches.
 */
import type { AmendedLaw, AmendedLawsResponse, ProcedureRoot } from '#shared/types'
import { meRoot, rootKey } from '#shared/utils/procedureRoot'
import type { TextBlock } from './lawUnits'
import { sameRisStammnorm, stammnormOf, type BgblCitation } from './bgblCitation'
import { clauseNameOf, isAmendmentClause, type ClauseName } from './draftArticles'
import { getDraftArticles, getMotionTextArticles, getRootDraftArticles, type DraftText } from './draftArticlesService'
import { lawListOfTitle, lawsOfTitleList, pickLawByName, titleLawName, type NamedRecord, type TitleLawName } from './titleLaws'
import { getDraftsForGp, getGegenstand } from '../parliament/drafts'
import { resolveKonsLaw } from '../kons/konsCache'
import { konsJson, konsLawUrl, konsQuery, konsRefOf } from '../ris/konsLaw'
import { mapWithConcurrency } from '../pool'
import { DERIVED_ANALYSIS_TTL_S } from '../cache/ttl'
import { storageKeyOf } from '../cache/key'
import { latestAmendmentOf } from '../../../shared/utils/citations'

/**
 * How many laws are looked up in RIS — not how many are listed. A
 * Sammelgesetz can name dozens; one slow RIS lookup must not hang a page.
 *
 * Until 22.10.2026 this cut the LIST: 116/ME XXVIII (Budgetbegleitgesetz
 * 2027–2028) names 65 laws, the page said „ändert 40 Gesetze" and 25 were
 * missing — the silently shortened list the header above rules out. The laws
 * beyond it stand in the list as the draft names them, without a RIS link,
 * which is how a law RIS cannot resolve already reads (`AmendedLawLine.vue`).
 */
const MAX_LAWS = 40
const CONCURRENCY = 6

/**
 * The Stammnorm named before the first instruction — the Promulgationsklausel
 * of a draft that amends exactly one law. Bounded to the head of the text so
 * a BGBl cited inside a § (a cross-reference) cannot be mistaken for it, and
 * `stammnormOf` returns null for an instruction line, which names no BGBl.
 */
function leadingStammnorm(blocks: readonly TextBlock[]): WantedLaw | null {
  let title: string | null = null
  for (const b of blocks) {
    if (b.kind === 'section' || b.kind === 'title') {
      if (title === null) title = b.text
      continue
    }
    if (isAmendmentClause(b.text)) {
      const bgbl = stammnormOf(b.text)
      if (bgbl) return { title, bgbl, clause: clauseNameOf(b.text), number: null }
    }
    // Past the first real instruction the clause can no longer follow.
    if (b.kind === 'novao') return null
  }
  return null
}

/** A law the text names: from an Artikel, a clause, or its title. */
interface WantedLaw {
  title: string | null
  bgbl: BgblCitation | null
  clause: ClauseName | null
  /** „Artikel 3"; null where the title is the text's own (a Novelle without Artikel). */
  number: string | null
}

/**
 * The one law RIS holds under exactly this name on `date`, with its
 * Stammnorm — `pickLawByName` over one search by title. Null for none, for
 * two, and where the law is not among the first hundred records the search
 * returns: a refusal, never a nearer name (`lawtext/titleLaws.ts`).
 *
 * A failure is not an answer (`readAmendedLaws` below): `konsJson` throws on
 * an unreachable RIS and on its error envelope, and nothing here catches.
 */
const lawByName = defineCachedFunction(
  async (name: string, abbreviation: string | null, date: string) => {
    const body = await konsJson(konsQuery({ Titel: name, 'Fassung.FassungVom': date, DokumenteProSeite: 'OneHundred' }))
    const refs = body?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference
    const records: NamedRecord[] = []
    for (const r of Array.isArray(refs) ? refs : refs ? [refs] : []) {
      const p = konsRefOf(r)
      const meta = r?.Data?.Metadaten?.Bundesrecht
      if (!p?.gesetzesnummer || !p.stammnorm) continue
      records.push({
        gesetzesnummer: p.gesetzesnummer,
        kurztitel: typeof meta?.Kurztitel === 'string' ? meta.Kurztitel : '',
        abkuerzung: typeof meta?.BrKons?.Abkuerzung === 'string' ? meta.BrKons.Abkuerzung : '',
        stammnorm: p.stammnorm,
      })
    }
    return pickLawByName(records, { name, abbreviation })
  },
  {
    name: 'law-by-name',
    base: DERIVED_CACHE,
    getKey: (name: string, abbreviation: string | null, date: string) => storageKeyOf(`${name}|${abbreviation ?? ''}|${date}`),
    maxAge: DERIVED_ANALYSIS_TTL_S,
    swr: false,
  },
)

const byName = (law: TitleLawName, date: string) => lawByName(law.name, law.abbreviation, date)

/**
 * The laws the text's own title names (14.11.2026), for a text whose clauses
 * name none: „Bundesverfassungsgesetz, mit dem das Bundes-Verfassungsgesetz
 * geändert wird" (51 d.B. XXVII, 53 d.B. XXIV — the B-VG's clause cites no
 * Stammnorm), or a package whose Artikel open on the instruction (1859 d.B.
 * XXVII). Each name only where RIS holds a law by exactly it, and the list
 * only where every name of it does (`lawsOfTitleList`). The title is the
 * first one before the text's first Artikel or instruction that is of that
 * shape; a motion prints it twice.
 */
async function lawsOfTitle(blocks: readonly TextBlock[], date: string): Promise<WantedLaw[] | null> {
  for (const b of blocks) {
    if (b.kind === 'article' || b.kind === 'novao') break
    if (b.kind !== 'title' && b.kind !== 'section') continue
    const list = lawListOfTitle(b.text)
    if (!list) continue
    const laws = await lawsOfTitleList(list, async (piece) => {
      const named = titleLawName(piece)
      const found = named ? await byName(named, date) : null
      return named && found ? { title: found.kurztitel, bgbl: found.stammnorm, clause: { name: named.name, abbreviation: named.abbreviation }, number: null } : null
    })
    if (laws) return laws
  }
  return null
}

/**
 * A name of the text that says it changes or repeals law, not that it makes
 * one — in the forms a law names ITSELF: „…, mit dem das B-VG geändert wird",
 * „Änderung des …", „…-Novelle". Not a bare „Änderung": a new law's title
 * quotes the EU act it carries out, and that act's title does („…zur Änderung
 * der Verordnung (EU) 2018/1724", 120/ME XXVIII and 352/ME XXVII, both new
 * laws, measured 14.11.2026).
 */
const AMENDING_NAME_RE = /\bmit (?:dem|der|denen)\b.*\b(?:geändert|abgeändert|novelliert|aufgehoben)\b|^(?:Änderung|Aufhebung|Novellierung)\b|novelle\b/i

/**
 * Does the text create law rather than amend it? Only on positive evidence
 * (14.11.2026): no law found, AND no Novellierungsanordnung in the text, AND
 * no name of it that says it amends or repeals.
 *
 * Until then it was „Artikel read, no law found", and a law the reader could
 * not name became a new one: 53 d.B. XXIV and 51 d.B. XXVII amend the B-VG,
 * whose Promulgationsklausel cites no Stammnorm („Art. 42 Abs. 2 wird
 * folgender Satz angefügt:"), and their pages said „neues Gesetz" and
 * „Geltendes Recht – Keines". Without the evidence the weaker state stands:
 * the laws could not be read (`unread`).
 */
export function createsNewLawFrom(text: DraftText, lawCount: number): boolean {
  if (lawCount > 0 || text.articles.length === 0) return false
  if (text.blocks.some((b) => b.kind === 'novao')) return false
  const names = [...text.articles.map((a) => a.title ?? a.key), ...text.blocks.filter((b) => b.kind === 'title').map((b) => b.text)]
  return !names.some((n) => n !== null && AMENDING_NAME_RE.test(n))
}

/**
 * **A failure is not an answer** — the rule `kons/konsCache.ts` states for
 * `resolveKonsLaw` and `annex/annexGuardService.ts` for the annex, and this
 * function is the third place it applies.
 *
 * It is cached for a day, so every upstream call in it used to be able to
 * pin a wrong fact for that long: a blip in list 81 dropped `asOf` and with
 * it every RIS link, a blip in the RIS map or the Gesetzestext produced an
 * empty block list, and the page then read „dieser Entwurf ändert kein
 * Gesetz" — the one claim this section must never invent. Nothing is caught
 * here any more: a genuine absence is already an answer (no document, no
 * row, no matching law), an outage propagates, nothing is stored, and the
 * next request tries again. The section arrives client-side and lazily, so
 * the page simply renders without it (`app/pages/entwuerfe/[gp]/[inr].vue`).
 */
const readAmendedLaws = defineCachedFunction(
  async (root: ProcedureRoot): Promise<AmendedLawsResponse> => {
    const { gp, inr } = root
    const isMe = root.ityp === 'ME'
    // A draft missing from its own GP's list is an answer (`asOf` stays
    // null); a list that cannot be read is not. A Vorlage or Antrag without
    // a Begutachtung has no list row: its own record dates it (10.11.2026).
    const asOf = isMe
      ? (await getDraftsForGp(gp)).items.find((i) => i.inr === inr)?.arrivedAt || null
      : (await getGegenstand(gp, root.ityp, inr)).content?.einlangen?.slice(0, 10) || null

    // The draft's own text — never the Regierungsvorlage's: the question is
    // what the DRAFT proposed to change. Its own source reading, and its own
    // cache entry under it: this section prefers the Parliament copy of the
    // Ministerialentwurf, the three sections of the draft page read the RIS
    // XML (`lawtext/draftArticlesService.ts`).
    // Without a draft, the item's own first text is the proposal.
    let text = isMe ? await getDraftArticles(gp, inr, 'parliament-first') : await getRootDraftArticles(root)
    // A motion of the Bundesrat that files its text as „Gesetzesantrag" or
    // „Antrag" instead of „Gesetzestext" (`motionTextOf`, 14.11.2026).
    if (!isMe && root.ityp === 'I' && text.blocks.length === 0) text = await getMotionTextArticles(root)
    const { blocks, articles } = text
    let wanted: WantedLaw[] = articles.filter((a) => a.amends).map((a) => ({ title: a.title, bgbl: a.bgbl, clause: a.clause, number: a.number }))

    // A single-law Novelle prints no "Artikel" line, and its
    // Promulgationsklausel reads as an instruction, so `draftArticles` —
    // which exists to key units by Artikel for the diff join — legitimately
    // finds nothing to key and returns an empty list (92/ME: 22 blocks, 0
    // articles). The law it amends is still named, in the clause before the
    // first instruction, so read it there rather than reporting no law.
    if (wanted.length === 0) {
      const fallback = leadingStammnorm(blocks)
      if (fallback) wanted = [fallback]
    }
    // No clause names a law: the title may (`lawsOfTitle`, 14.11.2026).
    if (wanted.length === 0 && asOf) wanted = (await lawsOfTitle(blocks, asOf)) ?? []

    // A clause that names the law and cites no Stammnorm the reader can take
    // („Das Sozialversicherungs-Organisationsgesetz in der Fassung des BGBl.
    // I Nr. 100/2018 wird wie folgt abgeändert", 627 d.B. XXVI): the law is
    // looked up by that name, exactly, and its Stammnorm is RIS's.
    if (asOf) {
      wanted = await mapWithConcurrency(wanted, CONCURRENCY, async (w, index) => {
        if (w.bgbl || !w.clause || index >= MAX_LAWS) return w
        const found = await byName({ name: w.clause.name, abbreviation: w.clause.abbreviation }, asOf)
        return found ? { ...w, bgbl: found.stammnorm } : w
      })
    }

    const laws: AmendedLaw[] = []
    const seen = new Set<string>()
    const jobs = wanted.filter((w) => {
      // The citation AND the name: one Bundesgesetzblatt creates several laws
      // (BGBl. I Nr. 100/2005 the FPG 2005, the NAG and the AsylG 2005; 110/2010
      // the ElWOG 2010 and the E-ControlG), and a key of the number alone kept
      // the first of them and dropped the others (76/ME and 58/ME XXVII,
      // 15.11.2026, once their names found their Stammnorm).
      const name = (w.clause?.name ?? w.title ?? '').toLowerCase()
      const key = w.bgbl ? `${w.bgbl.organ} ${w.bgbl.nummer}|${name}` : `title:${w.title ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // One RIS round trip per law, in parallel, for the first `MAX_LAWS`: a
    // Sammelgesetz names dozens (116/ME 65) and sequentially that was 36 s
    // cold. Every law is listed; the ceiling bounds the lookups only.
    const results = await mapWithConcurrency(jobs, CONCURRENCY, async (w, index) => {
      const cited = w.bgbl ? `${w.bgbl.organ} ${w.bgbl.nummer}` : null
      const resolved = w.bgbl && asOf && index < MAX_LAWS
        // `w.title` is the Artikel heading this entry came from — the same
        // disambiguator `annex/annexGuardService.ts` passes, with the
        // clause's own name of the law as the second witness (`clause`,
        // 04.10.2026: 28/55/27/58/108/ME XXVIII resolve only with it), and the string
        // used as the display fallback one line below. Withheld from the
        // lookup it turned every law of an ambiguous Bundesgesetzblatt into
        // a row without a RIS link and with the draft's own wording instead
        // of the law's name.
        //
        // Uncaught: `resolveKonsLaw` already answers null where RIS knows
        // no such law or cannot tell two apart, and throws only when RIS
        // is unreachable — the distinction its own doc comment draws
        // (`kons/konsCache.ts`). Catching it here undid that one layer up.
        ? await resolveKonsLaw(w.bgbl.organ, w.bgbl.nummer, asOf, w.title ?? '', w.clause)
        : null
      // Where the law was found by its name despite a misprinted Stammnorm,
      // the citation stays as the draft wrote it and RIS's own stands beside
      // it — a link to the right law under the wrong number reads as our
      // error otherwise.
      const held = resolved ? Object.values(resolved.paragraphs).find((p) => p.stammnorm)?.stammnorm ?? null : null
      // Unresolved, a Novelle without Artikel is named by its clause („Das
      // Sozialversicherungs-Organisationsgesetz …"), not by its own long
      // title („Bundesgesetz, mit dem das … abgeändert wird").
      const named = w.number === null && w.clause ? w.clause.name : w.title
      return {
        title: resolved?.kurztitel || named || cited || 'Unbenanntes Gesetz',
        bgbl: cited,
        risUrl: resolved ? konsLawUrl(resolved.gesetzesnummer, asOf) : null,
        risBgbl: held && w.bgbl && !sameRisStammnorm(held, w.bgbl) ? `${held.organ} ${held.nummer}` : null,
        amendedBy: resolved ? latestAmendmentOf(Object.values(resolved.paragraphs).map((p) => p.kundmachungsorgan)) : null,
      }
    })
    // One law in RIS is one row, however many Artikel led to it: two Artikel
    // of 305 d.B. XXVIII cite BGBl. I Nr. 82/2023 under two names and both
    // resolve to the eEltern-Kind-Pass-Gesetz (15.11.2026) — the dedupe by
    // number alone, above, used to hide that.
    const linked = new Set<string>()
    for (const r of results) {
      if (!r) continue
      if (r.risUrl) {
        const law = /Gesetzesnummer=(\d+)/.exec(r.risUrl)?.[1] ?? r.risUrl
        if (linked.has(law)) continue
        linked.add(law)
      }
      laws.push(r)
    }

    const createsNewLaw = createsNewLawFrom(text, laws.length)
    // A gap is an answer the page states, not an empty list it falls silent on.
    const unread = laws.length > 0 || createsNewLaw ? null : blocks.length === 0 ? 'no-text' : 'unnamed'
    return { gp, inr, asOf, createsNewLaw, laws, unread }
  },
  // `rootKey` keeps a draft's key what it always was.
  { name: 'amended-laws', base: DERIVED_CACHE, getKey: (root: ProcedureRoot) => rootKey(root), maxAge: DERIVED_ANALYSIS_TTL_S, swr: false },
)

export function getAmendedLaws(gp: string, inr: number): Promise<AmendedLawsResponse> {
  return readAmendedLaws(meRoot(gp, inr))
}

/** The same for a Vorlage or Antrag without a Begutachtung. */
export function getRootAmendedLaws(root: ProcedureRoot): Promise<AmendedLawsResponse> {
  return readAmendedLaws(root)
}
