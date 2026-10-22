import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftSummary } from '../shared/types'
import { firstQueryValue } from '../shared/utils/queryParams'
import { buildIcsCalendar, buildRssFeed, buildSitemap } from '../server/utils/feeds'
import { foldJointDraft } from '../server/utils/parliament/draftList'
import { draftSummary } from './helpers/builders'
import type { FakeEvent } from './helpers/nitroGlobals'

/**
 * A draft two Ressorts sent is ONE entry wherever drafts are listed
 * (22.10.2026).
 *
 * List 81 carries such a draft once per Ressort — GP XXVII 302/ME (BMFFIM ∥
 * BMJ), 266/ME and 114/ME; GP XXVIII has none today. `/api/drafts` folded
 * them since 23.09.2026 (`dedupeDraftList`), but the feed, the calendar,
 * the sitemap and the homepage did not: two RSS items under one guid, two
 * VEVENTs under one UID — invalid under RFC 5545 —, two places of the five
 * in the volume ranking, and a per-draft calendar file that named whichever
 * Ressort upstream happened to list first.
 *
 * The routes are executed: the list-81 leaf is mocked as a module (it is
 * Nitro), their auto-imports are globals here, and the builders, the fold
 * and the query helpers are the real ones.
 */

const SITE = 'https://example.test'

/** GP XXVIII with a jointly issued 302/ME (two rows) and five more drafts, all open. */
const open = { active: true, deadline: '2099-12-31' }
const joint = [
  draftSummary({ ...open, inr: 302, citation: '302/ME', title: 'Gemeinsamer Entwurf', ministryCode: 'BMJ', ministryName: 'Bundesministerium für Justiz', statementCount: 900 }),
  draftSummary({ ...open, inr: 302, citation: '302/ME', title: 'Gemeinsamer Entwurf', ministryCode: 'BMFFIM', ministryName: 'Bundeskanzleramt – Frauen, Familie, Integration und Medien', statementCount: 900 }),
]
const others = [1, 2, 3, 4, 5].map((n) =>
  draftSummary({ ...open, inr: n, citation: `${n}/ME`, title: `Entwurf ${n}`, statementCount: n }),
)
/** The period before, with a jointly issued draft whose Frist outlives the Wechsel (§12.35). */
const carried = joint.map((row) => ({ ...row, gp: 'XXVII', inr: 352, citation: '352/ME', statementCount: 0 }))
const LIST_81: Record<string, DraftSummary[]> = { XXVIII: [...joint, ...others], XXVII: carried }

const getDraftsForGp = vi.fn(async (gp: string) => ({ gp, items: LIST_81[gp] ?? [] }))
const identity = <T>(x: T): T => x

vi.mock('../server/utils/parliament/drafts', () => ({
  getDraftsForGp: (gp: string) => getDraftsForGp(gp),
  reconcileActive: identity,
}))

type Handler = (event: unknown) => Promise<unknown>

async function handlerOf(...segments: string[]): Promise<Handler> {
  const path: string = join(import.meta.dirname, '..', 'server', ...segments)
  return ((await import(/* @vite-ignore */ path)) as { default: Handler }).default
}

const event = (over: FakeEvent = {}): FakeEvent => ({ __query: {}, __params: {}, ...over })

beforeEach(() => {
  // h3 and Nitro: the handler itself, the site URL, the body as the route hands it out.
  vi.stubGlobal('defineEventHandler', identity)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { siteUrl: SITE } }))
  vi.stubGlobal('respondWithEtag', (_event: unknown, body: string) => body)
  // Ours, auto-imported in the routes: the real ones where they are pure.
  vi.stubGlobal('firstQueryValue', firstQueryValue)
  vi.stubGlobal('buildRssFeed', buildRssFeed)
  vi.stubGlobal('buildIcsCalendar', buildIcsCalendar)
  vi.stubGlobal('buildSitemap', buildSitemap)
  vi.stubGlobal('getCurrentGp', async () => 'XXVIII')
  vi.stubGlobal('getDraftsForGp', getDraftsForGp)
  vi.stubGlobal('reconcileActive', identity)
  vi.stubGlobal('withRisActiveOn', identity)
  vi.stubGlobal('getRisOnlyForGp', async () => ({ items: [] }))
  vi.stubGlobal('getCarryOverDrafts', async () => [])
  vi.stubGlobal('getCarryOverRisConsultations', async () => [])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const count = (text: string, needle: string) => text.split(needle).length - 1

describe('a jointly issued draft', () => {
  it('is one RSS item, naming both Ressorts', async () => {
    const rss = (await (await handlerOf('routes', 'feed.xml.get.ts'))(event())) as string
    expect(count(rss, '<guid isPermaLink="false">me-XXVIII-302@')).toBe(1)
    expect(count(rss, '<item>')).toBe(6)
    expect(rss).toContain('Bundesministerium für Justiz')
    expect(rss).toContain('Bundeskanzleramt – Frauen, Familie, Integration und Medien')
  })

  it('stays in the feed of the Ressort that is not its lead, under that Ressort\'s name', async () => {
    const handler = await handlerOf('routes', 'feed.xml.get.ts')
    for (const code of ['BMJ', 'BMFFIM']) {
      const rss = (await handler(event({ __query: { ressort: code } }))) as string
      expect(count(rss, 'me-XXVIII-302@'), code).toBe(1)
    }
    // The fold sorts by code, so BMFFIM leads and BMJ is the co-Ressort.
    const bmj = (await handler(event({ __query: { ressort: 'bmj' } }))) as string
    expect(bmj).toContain('<title>Begutachtungs-Monitor – Begutachtungsverfahren (Bundesministerium für Justiz)</title>')
  })

  it('is one calendar event: one UID per VEVENT, as RFC 5545 requires', async () => {
    const ics = (await (await handlerOf('routes', 'kalender.ics.get.ts'))(event())) as string
    expect(count(ics, 'UID:me-XXVIII-302@')).toBe(1)
    expect(count(ics, 'BEGIN:VEVENT')).toBe(6)
  })

  it('is one sitemap URL', async () => {
    const xml = (await (await handlerOf('routes', 'sitemap.xml.get.ts'))(event())) as string
    expect(count(xml, `<loc>${SITE}/entwuerfe/XXVIII/302</loc>`)).toBe(1)
  })

  it('has its calendar file built from the folded row, naming both Ressorts', async () => {
    const requireDraft = vi.fn(async () => foldJointDraft(joint))
    vi.stubGlobal('requireDraft', requireDraft)
    const ics = (await (await handlerOf('routes', 'entwuerfe', '[gp]', '[inr]', 'frist.ics.get.ts'))(
      event({ __params: { gp: 'xxviii', inr: '302' } }),
    )) as string
    expect(requireDraft).toHaveBeenCalledWith('XXVIII', 302)
    expect(ics).toContain('Bundesministerium für Justiz')
    expect(ics).toContain('Bundeskanzleramt – Frauen')
  })

  it('takes one row of the homepage\'s open list and one place in its ranking', async () => {
    const dashboard = (await (await handlerOf('api', 'dashboard.get.ts'))(event())) as {
      open: DraftSummary[]
      ranked: { items: DraftSummary[]; total: number }
    }
    expect(dashboard.open.filter((d) => d.inr === 302)).toHaveLength(1)
    expect(dashboard.open).toHaveLength(7)
    expect(dashboard.ranked.items.filter((d) => d.inr === 302)).toHaveLength(1)
    expect(dashboard.ranked.items.map((d) => d.inr)).toEqual([302, 5, 4, 3, 2])
    expect(dashboard.ranked.total).toBe(6)
  })

  it('carried over from the period before, is one row that still names its co-Ressort', async () => {
    // The carry-over hands its rows out unfolded and the homepage folds after
    // merging (`carryOver.ts`): folded twice, the row would lose its
    // co-Ressort, because a second fold rebuilds `coMinistries` from the one
    // row it is given.
    const dashboard = (await (await handlerOf('api', 'dashboard.get.ts'))(event())) as { open: DraftSummary[] }
    const rows = dashboard.open.filter((d) => d.gp === 'XXVII' && d.inr === 352)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.ministryCode).toBe('BMFFIM')
    expect(rows[0]!.coMinistries.map((m) => m.code)).toEqual(['BMJ'])
  })
})
