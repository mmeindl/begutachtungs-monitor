import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { LandConsultation } from '../shared/types'
import { type LgblEntry, lgblWords, matchLgbl } from '../server/utils/laender/lgblSearch'

const TODAY = '2026-10-22'

const draft = (o: Partial<LandConsultation>): LandConsultation => ({
  id: 'sbg-1',
  land: 'sbg',
  kind: 'gesetz',
  title: '',
  startedAt: '2025-01-10',
  deadline: null,
  url: 'https://service.salzburg.gv.at/pub/get/1',
  documents: [],
  active: false,
  ...o,
})
const lgbl = (o: Partial<LgblEntry>): LgblEntry => ({ nr: 'LGBl. Nr. 1/2025', typ: 'Landesgesetz', titel: '', datum: '2025-03-01', url: null, ...o })
/* The index as RIS holds it: it begins in 2015, so a miss after that is a
   miss and not „vor RIS". */
const FIRST_IN_RIS = lgbl({ nr: 'LGBl. Nr. 1/2015', typ: 'Sonstiges', titel: 'Kundmachung', datum: '2015-01-09' })
const match = (drafts: LandConsultation[], entries: LgblEntry[]) => matchLgbl(drafts, [FIRST_IN_RIS, ...entries], TODAY)

describe('matchLgbl — the oracle (docs/architecture.md §12.43)', () => {
  /* The 83 Oberösterreich Gesetze whose Landtag record names the LGBl,
     matched blind. Measured on 22.10.2026: 77 right, 2 wrong, 4 not found
     — and the same through this module.
     The two wrong are one class — the same law amended twice inside the
     window — and the test holds the line there, not at zero. */
  const oracle = JSON.parse(readFileSync(new URL('./fixtures/laender/lgbl-oracle-ooe-2026-10-22.json', import.meta.url), 'utf8')) as {
    drafts: { id: string; kind: 'gesetz'; title: string; startedAt: string | null; deadline: string | null; lgbl: string }[]
    lgbl: Omit<LgblEntry, 'url'>[]
  }

  it('finds 77 of 83 and is wrong at most twice', () => {
    const drafts = oracle.drafts.map((d) => draft({ id: d.id, land: 'ooe', kind: d.kind, title: d.title, startedAt: d.startedAt, deadline: d.deadline }))
    const results = matchLgbl(drafts, oracle.lgbl.map((e) => ({ ...e, url: null })), TODAY)
    let right = 0
    let wrong = 0
    for (const d of oracle.drafts) {
      const r = results.get(d.id)
      if (r?.state !== 'gefunden') continue
      if (r.stage.detail === d.lgbl) right++
      else wrong++
    }
    expect(right).toBeGreaterThanOrEqual(77)
    expect(wrong).toBeLessThanOrEqual(2)
  })
})

describe('matchLgbl — the rule', () => {
  it('compares the distinctive words, not the template', () => {
    expect([...lgblWords('Gesetz vom 3. Juli 2019, mit dem das Salzburger Landwirtschaftskammergesetz 2000 geändert wird')])
      .toEqual(['landwirtschaftskammergesetz'])
    const r = match(
      [draft({ title: 'Gesetz, mit dem das Salzburger Wettunternehmergesetz – S.WuG geändert wird' })],
      [lgbl({ titel: 'Gesetz vom 3. Juli 2019, mit dem das Salzburger Landwirtschaftskammergesetz 2000 geändert wird' })],
    )
    expect(r.get('sbg-1')).toEqual({ state: 'nicht-gefunden' })
  })

  it('finds the Kundmachung and links it, marked as our finding', () => {
    const r = match(
      [draft({ title: 'Gesetz, mit dem das Fiakergesetz geändert wird' })],
      [lgbl({ nr: 'LGBl. Nr. 42/2026', titel: 'Gesetz vom 29. April 2026, mit dem das Fiakergesetz geändert wird', datum: '2026-05-13', url: 'https://www.ris.bka.gv.at/eli/lgbl/SA/2026/42' })],
    )
    expect(r.get('sbg-1')).toEqual({
      state: 'gefunden',
      stage: { station: 'bgbl', label: 'Kundgemacht', detail: 'LGBl. Nr. 42/2026', date: '2026-05-13', url: 'https://www.ris.bka.gv.at/eli/lgbl/SA/2026/42', via: 'suche' },
    })
  })

  it('takes the earliest of equal titles: the next year’s novella is not this one', () => {
    const title = 'Gesetz, mit dem das Salzburger Tourismusgesetz geändert wird'
    const r = match([draft({ title })], [
      lgbl({ nr: 'LGBl. Nr. 9/2026', titel: title, datum: '2026-02-01' }),
      lgbl({ nr: 'LGBl. Nr. 30/2025', titel: title, datum: '2025-05-01' }),
    ])
    expect(r.get('sbg-1')).toMatchObject({ stage: { detail: 'LGBl. Nr. 30/2025' } })
  })

  it('looks only after the start and within two years, and only at the right type', () => {
    const title = 'Verordnung, mit der die Seenschutzverordnung geändert wird'
    const r = match([draft({ kind: 'verordnung', title })], [
      lgbl({ typ: 'Verordnung', titel: title, datum: '2024-12-01' }),
      lgbl({ typ: 'Verordnung', titel: title, datum: '2027-03-01' }),
      lgbl({ typ: 'Landesgesetz', titel: title, datum: '2025-03-01' }),
    ])
    expect(r.get('sbg-1')).toEqual({ state: 'nicht-gefunden' })
  })

  it('finds a short-named law under the title that lists every law it amends', () => {
    const r = match(
      [draft({ land: 'ooe', title: 'Oö. Deregulierungsgesetz 2025' })],
      [lgbl({ titel: 'Landesgesetz, mit dem das Oö. Abgabengesetz, die Oö. Bauordnung 1994, das Oö. EAP-Gesetz und das Oö. Tourismusgesetz 2018 geändert werden (Oö. Deregulierungsgesetz 2025)' })],
    )
    expect(r.get('sbg-1')?.state).toBe('gefunden')
  })

  it('lets a second Begutachtung of the same law share the first one’s Kundmachung', () => {
    const title = 'Landesgesetz, mit dem das Oö. Feuerwehrgesetz 2015 geändert wird'
    const r = match([
      draft({ id: 'ooe-1', land: 'ooe', title, startedAt: null, deadline: '2023-04-25' }),
      draft({ id: 'ooe-2', land: 'ooe', title, startedAt: null, deadline: '2024-03-25' }),
    ], [lgbl({ nr: 'LGBl. Nr. 95/2024', titel: title, datum: '2024-11-14' })])
    expect(r.get('ooe-1')).toMatchObject({ stage: { detail: 'LGBl. Nr. 95/2024' } })
    expect(r.get('ooe-2')).toMatchObject({ stage: { detail: 'LGBl. Nr. 95/2024' } })
  })

  it('says „vor RIS" for a draft older than the Land’s gazette in RIS', () => {
    const r = matchLgbl([draft({ title: 'Gesetz X', startedAt: '2012-05-01' })], [lgbl({ titel: 'Gesetz Y', datum: '2015-01-09' })], TODAY)
    expect(r.get('sbg-1')).toEqual({ state: 'vor-ris' })
  })

  it('leaves out running drafts and those the Land records itself', () => {
    const title = 'Gesetz, mit dem das Fiakergesetz geändert wird'
    const r = match([
      draft({ id: 'sbg-1', title, deadline: '2026-11-01' }),
      draft({ id: 'ooe-2', land: 'ooe', title, stage: null }),
    ], [lgbl({ titel: title, datum: '2026-05-13' })])
    expect(r.size).toBe(0)
  })
})
