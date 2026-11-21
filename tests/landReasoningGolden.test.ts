/**
 * A real Land draft and its Vorlage, frozen with what the Begründungsvergleich
 * makes of them (21.11.2026): Salzburg's Fördertransparenzgesetz (S.FTG), a
 * law enacted anew — draft 32441 and Vorlage Nr 543 der Beilagen (3. Session
 * der 17. GP), each one PDF with the law text and its Erläuterungen
 * (provenance: `tests/fixtures/README.md`). The Erläuterungen explain it §
 * by § („Zu § 9 (Leistungsmitteilungen):"), so every Begründung below comes
 * from the join by a §'s own designation; the § join reads none of them.
 *
 * The pages as `pagesOfBytes` gave them, so the test needs no pdf.js; the
 * comparison beside it is the route's own (`compareReadTexts`), read from
 * the same pages. A change here is a change of what the draft's page shows
 * at its changes — read it before moving a value.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type { LandDraftDetail, LandTextStation } from '../shared/types'
import { diffUnitKey } from '../shared/utils/diffKey'

vi.stubGlobal('defineCachedFunction', <A extends unknown[], T>(fn: (...a: A) => Promise<T>) => fn)
const { compareLandReasoning } = await import('../server/utils/laender/landReasoningService')
const { compareReadTexts } = await import('../server/utils/laender/landLawDiffService')
const { textSources } = await import('../server/utils/laender/texts/stations')

const fixture = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/erlaeuterungen/${name}`, import.meta.url)), 'utf8')) as string[]

const DRAFT = 'https://service.salzburg.gv.at/pub/get/32441'
const RV = 'https://www.salzburg.gv.at/00201lpi/17Gesetzgebungsperiode/3Session/543.pdf'
const pages: Record<string, string[]> = { [DRAFT]: fixture('sbg-32441-entwurf-pages.json'), [RV]: fixture('sbg-32441-vorlage-pages.json') }
const pagesOf = async (url: string) => pages[url]!

const detail = {
  draft: { title: 'Gesetz, über die Transparenz von Förderungen im Land Salzburg (Salzburger Fördertransparenzgesetz – S.FTG)', documents: [{ title: 'Entwurf', url: DRAFT }] },
  procedure: [{ date: null, label: 'Regierungsvorlage, Nr 543 der Beilagen (3. Session der 17. GP)', url: RV, station: 'rv' }],
  comparisons: [['entwurf', 'rv']],
} as unknown as LandDraftDetail

describe('Salzburg\'s Fördertransparenzgesetz, draft 32441 against its Vorlage', () => {
  it('compares the Begründung of each § present on both sides by its own designation', async () => {
    const sources = textSources('sbg', detail, pagesOf)
    const comparison = await compareReadTexts('entwurf' as LandTextStation, 'rv' as LandTextStation, [await sources.entwurf!.read(), await sources.rv!.read()], [sources.entwurf!.document, sources.rv!.document])
    const r = await compareLandReasoning('sbg', '32441', detail, { pagesOf, comparison: async () => comparison })
    const verdictOf = (key: string) => {
      const entry = r.units[key] ? r.entries[r.units[key]!]! : null
      if (!entry) return r.gaps?.[key] ? `Zeile: ${r.gaps[key]}` : '–'
      return !entry.comparable ? 'ohne Vergleich' : entry.changed ? (entry.editorial ? 'redaktionell' : 'geändert') : 'unverändert'
    }
    expect(r.available).toBe(true)
    // Draft §, Vorlage §, the law text's change, and the Begründung's: compared, or the line at the change, or nothing.
    expect(comparison.units.map((u) => [u.fromId ?? '–', u.id, u.change, verdictOf(diffUnitKey(u))])).toEqual([
      ['§1', '§1', 'unchanged', 'unverändert'],
      ['§2', '§2', 'unchanged', 'geändert'],
      ['§3', '§3', 'unchanged', 'geändert'],
      ['§4', '§4', 'unchanged', 'unverändert'],
      // „Zu den §§ 5, 6 und 7 (…):" opens no entry — the Land's reader knows „Zu den Z", not „Zu den §§" —,
      // so its text stands in § 4's on both sides, and §§ 5 to 7 have no passage; no line at a § whose text did not change.
      ['§5', '§5', 'unchanged', '–'],
      ['§6', '§6', 'unchanged', '–'],
      ['§7', '§7', 'unchanged', '–'],
      ['§8', '§8', 'unchanged', 'geändert'],
      ['§9', '§9', 'changed', 'geändert'],
      ['§10', '§10', 'unchanged', 'geändert'],
      ['§11', '§11', 'unchanged', 'unverändert'],
      ['§12', '§12', 'changed', 'geändert'],
      ['§13', '§13', 'unchanged', 'unverändert'],
      // The Vorlage's motion („Die Landesregierung stellt sohin den Antrag, …") is no part of the last §'s Begründung.
      ['§14', '§14', 'changed', 'unverändert'],
    ])
    expect(r.stats).toEqual({ compared: 11, changed: 6, editorial: 0, uncompared: 0 })
    expect(r.gaps).toEqual({})
  })
})
