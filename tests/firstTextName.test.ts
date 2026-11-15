import { describe, expect, it } from 'vitest'
import type { LawDiffResponse, LawStationId, ProcedureItemKind } from '../shared/types'
import {
  LAW_STATION_LABEL,
  LAW_STATION_ORDER,
  OBJECTION_STEPS_NOTE_DE,
  firstTextNameOf,
  lawStationGenitiveDe,
  lawStationLabelOf,
  lawStationPairQuestion,
} from '../shared/utils/lawStations'
import { lawTextCiteDe } from '../shared/utils/citations'
import { MOTION_TEXT_NOT_COMPARED_DE, missingStationReason } from '../server/utils/diff/stationDocuments'
import { lawDiffCredits } from '../app/utils/lawDiffCredits'
import { droppedLawsNote, mergedLawsNote } from '../app/utils/lawPackage'
import { NO_COMPARISON_DE, itemCopyDe, treatyComparisonGapDe } from '../app/utils/itemKind'

/**
 * The first text of a committee's or the Bundesrat's motion stands at the
 * comparison's `rv` station and is named by its kind wherever a comparison
 * names it (14.11.2026). Everything else must read as before.
 */

const BUA = firstTextNameOf({ itemKind: 'ausschussantrag' })!
const GABR = firstTextNameOf({ itemKind: 'bundesratsantrag', variant: 'bundesrat' })!
const GABR13 = firstTextNameOf({ itemKind: 'bundesratsantrag', variant: 'drittel' })!

describe('firstTextNameOf', () => {
  it('names only the kinds whose first text is no Regierungsvorlage', () => {
    for (const kind of ['regierungsvorlage', 'initiativantrag', 'staatsvertrag'] as ProcedureItemKind[]) {
      expect(firstTextNameOf({ itemKind: kind })).toBeNull()
    }
    expect(firstTextNameOf(null)).toBeNull()
    expect(BUA.label).toBe('Ausschussantrag')
    expect(GABR.label).toBe('Gesetzesantrag des Bundesrates')
    expect(GABR13.label).toBe('Gesetzesantrag von Mitgliedern des Bundesrates')
    // An unknown mover reads as the page's title does.
    expect(firstTextNameOf({ itemKind: 'bundesratsantrag', variant: null })).toEqual(GABR)
  })

  it('uses the item page\'s own word for the kind', () => {
    expect(BUA.label).toBe(itemCopyDe({ itemKind: 'ausschussantrag' }).word)
    expect(GABR.label).toBe(itemCopyDe({ itemKind: 'bundesratsantrag', variant: 'bundesrat' }).word)
    expect(GABR13.label).toBe(itemCopyDe({ itemKind: 'bundesratsantrag', variant: 'drittel' }).word)
  })
})

describe('labels, genitive and questions', () => {
  it('renames the rv station only, and only with a first text', () => {
    for (const id of LAW_STATION_ORDER) {
      expect(lawStationLabelOf(id)).toBe(LAW_STATION_LABEL[id])
      expect(lawStationLabelOf(id, BUA)).toBe(id === 'rv' ? 'Ausschussantrag' : LAW_STATION_LABEL[id])
    }
  })

  it('declines the side after „der Gesetzestext"', () => {
    expect(lawStationGenitiveDe('me')).toBe('des Entwurfs')
    expect(lawStationGenitiveDe('rv')).toBe('der Regierungsvorlage')
    expect(lawStationGenitiveDe('antrag')).toBe('der Antragsfassung')
    expect(lawStationGenitiveDe('bgbl')).toBe('der Fassung im Bundesgesetzblatt')
    expect(lawStationGenitiveDe('rv', BUA)).toBe('des Ausschussantrags')
    expect(lawStationGenitiveDe('rv', GABR13)).toBe('des Gesetzesantrags von Mitgliedern des Bundesrates')
    expect(lawStationGenitiveDe('plenum', BUA)).toBe('der Plenarfassung')
  })

  it('asks the item\'s questions, and the old ones without a first text', () => {
    expect(lawStationPairQuestion('rv', 'bgbl', BUA)).toBe('Was sich vom Ausschussantrag bis zum Gesetz geändert hat')
    expect(lawStationPairQuestion('rv', 'plenum', GABR)).toBe('Was das Parlament am Gesetzesantrag geändert hat')
    expect(lawStationPairQuestion('rv', 'ausschuss', GABR13)).toBe('Was der Ausschuss am Gesetzesantrag geändert hat')
    expect(lawStationPairQuestion('ausschuss', 'plenum', BUA)).toBe('Was im Plenum noch geändert wurde')
    expect(lawStationPairQuestion('rv', 'bgbl')).toBe('Was sich von der Regierungsvorlage bis zum Gesetz geändert hat')
    expect(lawStationPairQuestion('me', 'bgbl')).toBe('Was sich vom Entwurf bis zum kundgemachten Gesetz geändert hat')
  })

  it('never says „Regierungsvorlage" for a first text with its own name', () => {
    const pairs: [LawStationId, LawStationId][] = [['rv', 'ausschuss'], ['rv', 'plenum'], ['rv', 'bgbl'], ['me', 'rv']]
    for (const name of [BUA, GABR, GABR13]) {
      for (const [from, to] of pairs) expect(lawStationPairQuestion(from, to, name)).not.toContain('Regierungsvorlage')
    }
  })
})

describe('citation of the first text', () => {
  const draft = { citation: '14/ME', gp: 'XXVIII' }
  const doc = (n: number, gp = 'XXVIII') => ({ label: 'x', url: `https://www.parlament.gv.at/dokument/${gp}/I/${n}/fnameorig_1.html` })

  it('cites a committee\'s motion as „AB", a Bundesrat motion by its bare Beilage', () => {
    expect(lawTextCiteDe('rv', doc(14), draft, null, 'ausschussantrag')?.cited).toBe('AB 14 BlgNR 28. GP')
    expect(lawTextCiteDe('rv', doc(452, 'XXV'), draft, null, 'bundesratsantrag')?.cited).toBe('452 BlgNR 25. GP')
    expect(lawTextCiteDe('rv', doc(589), draft)?.cited).toBe('RV 589 BlgNR 28. GP')
  })
})

describe('credit line and package notes', () => {
  const data = {
    available: true,
    fromDocument: { label: 'Ausschussantrag, Gesetzestext', url: 'https://example.org/a' },
    toDocument: { label: 'BGBl', url: 'https://example.org/b' },
    fromSource: 'parlament',
    toSource: 'ris',
  } as LawDiffResponse

  it('names the side by the item\'s kind in the credit line', () => {
    const { sources, sides } = lawDiffCredits(data, null, { from: 'rv', to: 'bgbl' }, 0, BUA)
    expect(sides.map((s) => s.label)).toEqual(['Ausschussantrag (Parlament)', 'Fassung im Bundesgesetzblatt (RIS)'])
    expect(sources[0]!.what).toBe('Ausschussantrag')
    expect(lawDiffCredits(data, null, { from: 'rv', to: 'bgbl' }, 0).sides[0]!.label).toBe('Regierungsvorlage (Parlament)')
  })

  it('declines the masculine name in the package sentences', () => {
    const laws = [{ article: 'Allgemeines Sozialversicherungsgesetz', units: 1 }]
    expect(droppedLawsNote(laws, 'rv', 'bgbl', GABR)).toMatch(/^Der Gesetzesantrag des Bundesrates ändert ein Gesetz, das in dieser Fassung im Bundesgesetzblatt/)
    expect(mergedLawsNote(laws, 'rv', 'bgbl', null, null, BUA)).toContain('das in diesem Ausschussantrag nicht vorkommt')
    expect(mergedLawsNote(laws, 'rv', 'bgbl')).toContain('das in dieser Regierungsvorlage nicht vorkommt')
  })
})

describe('what cannot be compared, and why', () => {
  it('says why a motion\'s first text is missing, without „noch keine Regierungsvorlage"', () => {
    expect(missingStationReason('rv', true, null, BUA)).toBe('Nicht veröffentlicht: Einen Gesetzestext als eigenes Dokument führt das Parlament zu diesem Ausschussantrag nicht.')
    expect(missingStationReason('rv', true, null, GABR13, true)).toBe(MOTION_TEXT_NOT_COMPARED_DE)
    expect(MOTION_TEXT_NOT_COMPARED_DE).toContain('Begründung')
    // A Vorlage's page keeps its sentence.
    expect(missingStationReason('rv', true)).toContain('Regierungsvorlage')
  })

  it('keeps the no-comparison sentence for treaties only', () => {
    expect(Object.keys(NO_COMPARISON_DE)).toEqual(['staatsvertrag'])
  })

  it('names the treaty on the draft page, never a „Gesetz"', () => {
    expect(treatyComparisonGapDe('vereinbarung-15a')).toBe('Nicht im Monitor: ein Textvergleich vom Entwurf bis zur kundgemachten Vereinbarung. Der Vergleich liest Gesetzestexte, keinen Vertragstext.')
    expect(treatyComparisonGapDe('staatsvertrag')).toContain('zum kundgemachten Staatsvertrag')
  })

  it('says the steps end at the first Beschluss after an Einspruch', () => {
    expect(OBJECTION_STEPS_NOTE_DE).toContain('nach dem Einspruch des Bundesrates')
    expect(OBJECTION_STEPS_NOTE_DE).toContain('ersten Beschluss')
  })

  it('writes „Paragraph", never „Paragraf"', () => {
    for (const s of [MOTION_TEXT_NOT_COMPARED_DE, OBJECTION_STEPS_NOTE_DE, treatyComparisonGapDe('staatsvertrag')]) expect(s).not.toMatch(/Paragraf/)
  })
})
