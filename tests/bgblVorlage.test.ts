import { describe, expect, it } from 'vitest'
import { bgblRecordOf, type BgblRecord } from '../server/utils/ris/bgblJoin'
import { pickBgblIForVorlage } from '../server/utils/ris/bgblVorlage'

/**
 * The exact join from a Regierungsvorlage to its Kundmachung through RIS
 * (`server/utils/ris/bgblVorlage.ts`) — the second source for the BGBl
 * number where Parliament's record of the Vorlage carries no link.
 *
 * It is exact because RIS keys a law by period and Vorlage; what these
 * tests guard is that nothing looser creeps in — another period, another
 * Teil, a law from an Initiativantrag — since a wrong hit here states a
 * Kundmachung for a text that never had one.
 */

/** One `OgdDocumentReference` as RIS sends it, shortened to what is read. */
function reference(bgblAuth: Record<string, unknown>, id = 'BGBLA_2026_I_69') {
  return {
    Data: {
      Metadaten: {
        Technisch: { ID: id },
        Bundesrecht: { Kurztitel: 'Sterbeverfügungsgesetz-Novelle 2026', Titel: null, BgblAuth: bgblAuth },
      },
    },
  }
}

/** BGBl. I Nr. 69/2026 as RIS records it (read 03.10.2026). */
const NR_69 = {
  Bgblnummer: 'BGBl. I Nr. 69/2026',
  Teil: 'Teil1',
  Ausgabedatum: '2026-07-29',
  Typ: 'Bundesgesetz',
  Gesetzgebungsperiode: 'XXVIII',
  DatumNationalrat: '2026-07-07',
  Regierungsvorlage: { item: '525' },
}

const record = (over: Partial<BgblRecord>): BgblRecord => ({
  id: 'BGBLA_2026_I_69',
  teil: 'Teil1',
  nummer: 'BGBl. I Nr. 69/2026',
  datum: '2026-07-29',
  kurztitel: null,
  titel: null,
  stelle: null,
  gp: 'XXVIII',
  regierungsvorlagen: [525],
  datumNationalrat: '2026-07-07',
  ...over,
})

describe('bgblRecordOf — the parliamentary key of a law', () => {
  it('reads period, Vorlage and the day of the Nationalrat', () => {
    expect(bgblRecordOf(reference(NR_69))).toMatchObject({
      id: 'BGBLA_2026_I_69',
      teil: 'Teil1',
      nummer: 'BGBl. I Nr. 69/2026',
      datum: '2026-07-29',
      gp: 'XXVIII',
      regierungsvorlagen: [525],
      datumNationalrat: '2026-07-07',
    })
  })

  it('reads several Vorlagen when the field repeats', () => {
    const rec = bgblRecordOf(reference({ ...NR_69, Regierungsvorlage: { item: ['128', '129'] } }))
    expect(rec?.regierungsvorlagen).toEqual([128, 129])
  })

  /* BGBl. I Nr. 65/2025: Initiativantrag 416/A, no Vorlage. */
  it('leaves the key empty where RIS has none, and needs an ID', () => {
    const rec = bgblRecordOf(reference({ Bgblnummer: 'BGBl. I Nr. 65/2025', Teil: 'Teil1', Ausgabedatum: '2025-10-31', Initiativantrag: { item: '416/A' } }))
    expect(rec).toMatchObject({ gp: null, regierungsvorlagen: [], datumNationalrat: null })
    expect(bgblRecordOf({ Data: { Metadaten: { Technisch: {} } } })).toBeNull()
  })
})

describe('pickBgblIForVorlage', () => {
  it('finds the law by period and Vorlage', () => {
    expect(pickBgblIForVorlage([record({})], 'XXVIII', 525)?.nummer).toBe('BGBl. I Nr. 69/2026')
  })

  it('finds nothing for another Vorlage, another period, Teil II, or a law without a Vorlage', () => {
    expect(pickBgblIForVorlage([record({})], 'XXVIII', 80)).toBeNull()
    expect(pickBgblIForVorlage([record({ gp: 'XXVII' })], 'XXVIII', 525)).toBeNull()
    expect(pickBgblIForVorlage([record({ teil: 'Teil2' })], 'XXVIII', 525)).toBeNull()
    expect(pickBgblIForVorlage([record({ regierungsvorlagen: [] })], 'XXVIII', 525)).toBeNull()
  })

  it('matches a Vorlage among several the law enacts', () => {
    expect(pickBgblIForVorlage([record({ regierungsvorlagen: [128, 129] })], 'XXVIII', 129)).not.toBeNull()
  })

  /* The Vorlage reached the Bundesgesetzblatt with the first; a later law
   * naming it again is a correction, not its arrival. */
  it('takes the earliest issue when two laws name the Vorlage', () => {
    const later = record({ id: 'BGBLA_2026_I_90', nummer: 'BGBl. I Nr. 90/2026', datum: '2026-09-01' })
    const earlier = record({})
    expect(pickBgblIForVorlage([later, earlier], 'XXVIII', 525)?.nummer).toBe('BGBl. I Nr. 69/2026')
  })
})
