/**
 * Whose gap the committee's missing text is (15.11.2026): one map,
 * `LAND_COMMITTEE_TEXT`, decides the pair `texts/stations.ts` builds and
 * the sentence of the comparison's „Methode" (`MethodLandVergleich`).
 */
import { describe, expect, it, vi } from 'vitest'
import type { LandCode } from '../shared/types'
import { LAND_COMMITTEE_SENTENCE_DE, LAND_COMMITTEE_TEXT, landCommitteeSentenceDe, type LandCommitteeText } from '../shared/utils/laender'
import type { LandDraftRecord } from '../server/utils/laender/texts/stations'

// The Landesgesetzblatt's index is a cached Nitro function; no Kundmachung is read here.
vi.mock('../server/utils/laender/lgblIndex', () => ({ lgblXmlUrl: vi.fn() }))
const { textSources } = await import('../server/utils/laender/texts/stations')

/**
 * The Länder whose readers name a Vorlage text, the step `textSources`
 * reads as `rv`: Oberösterreich's and Tirol's Landtag records, Kärnten's
 * Vorlagen pages, Salzburg's report and law pages (`salzburgLandtag`,
 * `firstTextOf`). A reader that starts naming one adds its Land here and
 * to the map.
 */
const WITH_VORLAGE_TEXT: readonly LandCode[] = ['ktn', 'ooe', 'sbg', 't']

/** A draft with a Vorlage and a committee report, both with a PDF on a host
 *  the allowlist admits (`safeExternalUrl`). */
const record = {
  draft: { documents: [], stage: null },
  procedure: [{ date: null, label: 'Regierungsvorlage', url: 'https://www.salzburg.gv.at/rv.pdf', station: 'rv' }],
  landtag: { committee: null, subcommittee: false, report: { date: null, label: 'Ausschussbericht', url: 'https://www.salzburg.gv.at/ab.pdf' }, motions: [], decision: null },
} as unknown as LandDraftRecord

describe('LAND_COMMITTEE_TEXT', () => {
  it('has a state for every Land with a Vorlage text', () => {
    for (const land of WITH_VORLAGE_TEXT) expect(LAND_COMMITTEE_TEXT[land], land).toBeDefined()
  })

  it('compares the Vorlage with the report exactly where the report carries the text', () => {
    for (const land of WITH_VORLAGE_TEXT) {
      const t = textSources(land, record)
      expect(t.rv, land).toBeDefined()
      expect(Boolean(t.ausschuss), land).toBe(LAND_COMMITTEE_TEXT[land] === 'inReport')
    }
  })

  it('says one sentence per state, and the weakest for a Land outside the map', () => {
    const states = Object.keys(LAND_COMMITTEE_SENTENCE_DE) as LandCommitteeText[]
    expect(states.sort()).toEqual(['inReport', 'reportNotRead', 'reportWithoutText'])
    for (const land of WITH_VORLAGE_TEXT) expect(landCommitteeSentenceDe(land)).toBe(LAND_COMMITTEE_SENTENCE_DE[LAND_COMMITTEE_TEXT[land]!])
    expect(landCommitteeSentenceDe('ooe')).toBe('Was der Ausschuss geändert hat, zeigen wir aus seinem Bericht: Er enthält den Gesetzestext.')
    expect(landCommitteeSentenceDe('sbg')).toBe(
      'Was der Ausschuss geändert hat, zeigen wir hier nicht: Sein Bericht enthält den Gesetzestext nicht. Wir vergleichen die Regierungsvorlage mit dem kundgemachten Gesetz; darin steckt dann auch die redaktionelle Bearbeitung für die Kundmachung.',
    )
    const notRead = 'Was der Ausschuss geändert hat, zeigen wir hier nicht: Den Bericht des Ausschusses lesen wir für dieses Land noch nicht. Wir vergleichen die Regierungsvorlage mit dem kundgemachten Gesetz; darin steckt dann auch die redaktionelle Bearbeitung für die Kundmachung.'
    expect(landCommitteeSentenceDe('t')).toBe(notRead)
    expect(landCommitteeSentenceDe('ktn')).toBe(notRead)
    // Never „the Land publishes none" for a Land the map does not know.
    expect(landCommitteeSentenceDe('w')).toBe(notRead)
  })
})
