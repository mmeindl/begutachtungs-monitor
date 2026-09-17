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
 * is no BGBl and yields no Gesetzesnummer (`lawTitles.ts`), and a silently
 * shortened list would misstate what the draft touches.
 */
import type { AmendedLaw, AmendedLawsResponse } from '#shared/types'
import { fetchLawHtml, findLawStations } from './lawDiffService'
import { parseParliamentHtml, parseRisXml, type TextBlock } from './lawText'
import { draftArticles, isAmendmentClause, stammnormOf, type BgblCitation } from './lawTitles'
import { getDraftsForGp, getGegenstand } from './parliament'
import { getRisMapForGp } from './ris'
import { resolveKonsLaw } from './konsCache'

const TTL_S = 60 * 60 * 24
/** A Sammelgesetz can name dozens; one slow RIS lookup must not hang a page. */
const MAX_LAWS = 40
const CONCURRENCY = 6

/**
 * The Stammnorm named before the first instruction — the Promulgationsklausel
 * of a draft that amends exactly one law. Bounded to the head of the text so
 * a BGBl cited inside a § (a cross-reference) cannot be mistaken for it, and
 * `stammnormOf` returns null for an instruction line, which names no BGBl.
 */
function leadingStammnorm(blocks: readonly TextBlock[]): { title: string | null, bgbl: BgblCitation } | null {
  let title: string | null = null
  for (const b of blocks) {
    if (b.kind === 'section' || b.kind === 'title') {
      if (title === null) title = b.text
      continue
    }
    if (isAmendmentClause(b.text)) {
      const bgbl = stammnormOf(b.text)
      if (bgbl) return { title, bgbl }
    }
    // Past the first real instruction the clause can no longer follow.
    if (b.kind === 'novao') return null
  }
  return null
}

/** RIS consolidated law, at the version in force on `date`. */
export function konsLawUrl(gesetzesnummer: string, date: string | null): string {
  const base = `https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=${gesetzesnummer}`
  return date ? `${base}&FassungVom=${date}` : base
}

/** The draft's own text — never the Regierungsvorlage's: the question is
 *  what the DRAFT proposed to change. */
async function draftBlocks(gp: string, inr: number, detail: Awaited<ReturnType<typeof getGegenstand>>): Promise<TextBlock[]> {
  const me = findLawStations(detail.content ?? {}).get('me')
  if (me?.html) return parseParliamentHtml(await fetchLawHtml(me.html))
  const row = (await getRisMapForGp(gp).catch(() => null))?.rows.find((r) => r.inr === inr) ?? null
  const xml = row?.risDocument?.xml
  return xml ? parseRisXml(await fetchLawHtml(xml)) : []
}

export const getAmendedLaws = defineCachedFunction(
  async (gp: string, inr: number): Promise<AmendedLawsResponse> => {
    const detail = await getGegenstand(gp, 'ME', inr)
    const listed = (await getDraftsForGp(gp).catch(() => null))?.items.find((i) => i.inr === inr) ?? null
    const asOf = listed?.arrivedAt || null

    let blocks: TextBlock[] = []
    try {
      blocks = await draftBlocks(gp, inr, detail)
    } catch {
      blocks = []
    }
    const articles = draftArticles(blocks)
    let wanted = articles.filter((a) => a.amends).map((a) => ({ title: a.title, bgbl: a.bgbl }))

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

    const laws: AmendedLaw[] = []
    const seen = new Set<string>()
    const jobs = wanted.filter((w) => {
      const key = w.bgbl ? `${w.bgbl.organ} ${w.bgbl.nummer}` : `title:${w.title ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, MAX_LAWS)

    // One RIS round trip per law, in parallel: a Sammelgesetz names dozens
    // (116/ME hits the ceiling at 40) and sequentially that was 36 s cold.
    const queue = [...jobs.entries()]
    const results = new Array<AmendedLaw | null>(jobs.length).fill(null)
    const worker = async (): Promise<void> => {
      for (;;) {
        const job = queue.shift()
        if (!job) return
        const [i, w] = job
        const cited = w.bgbl ? `${w.bgbl.organ} ${w.bgbl.nummer}` : null
        const resolved = w.bgbl && asOf
          ? await resolveKonsLaw(w.bgbl.organ, w.bgbl.nummer, asOf, '').catch(() => null)
          : null
        results[i] = {
          title: resolved?.kurztitel || w.title || cited || 'Unbenanntes Gesetz',
          bgbl: cited,
          risUrl: resolved ? konsLawUrl(resolved.gesetzesnummer, asOf) : null,
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    for (const r of results) if (r) laws.push(r)

    return { gp, inr, asOf, createsNewLaw: articles.length > 0 && laws.length === 0, laws }
  },
  { name: 'amended-laws', base: DERIVED_CACHE, getKey: (gp: string, inr: number) => `${gp}-${inr}`, maxAge: TTL_S, swr: false },
)
