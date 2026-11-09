import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findLawStations } from '../server/utils/diff/stationDocuments'
import {
  amendedStationsOf,
  extractBgblLink,
  findCommitteeReport,
  findHouseDecisionDate,
  findPlenaryAmendments,
  parseVote,
} from '../server/utils/parliament/detailJson'
import { statementRowMatchesParent } from '../server/utils/parliament/list142'
import { DRAFT_LAW_STATIONS, LAW_STATION_LABEL, lawDiffScopeOf, lawDiffSteps } from '../shared/utils/lawStations'
import { itypOfKind, meRoot, rootCitation, rootKey, vorlagePath } from '../shared/utils/procedureRoot'

/* Live detail JSON of six laws of GP XXVIII without a Begutachtung, cut to
 * what the procedure page reads (tests/fixtures/README.md). */
function record(name: string) {
  return JSON.parse(readFileSync(new URL(`./fixtures/vorlage/${name}.json`, import.meta.url), 'utf8')).content
}
const tail = (url: string | null | undefined) => url?.split('/').slice(-3).join('/') ?? null

describe('rootKey', () => {
  it('keeps a draft’s key what every derived cache has used', () => {
    expect(rootKey(meRoot('XXVIII', 97))).toBe('XXVIII-97')
  })
  it('separates the number spaces the three item types share', () => {
    expect(rootKey({ gp: 'XXVIII', ityp: 'I', inr: 97 })).toBe('XXVIII-I-97')
    expect(rootKey({ gp: 'XXVIII', ityp: 'A', inr: 97 })).toBe('XXVIII-A-97')
  })
})

describe('identity', () => {
  it('names the item as Parliament cites it', () => {
    expect(rootCitation({ gp: 'XXVIII', ityp: 'I', inr: 589 })).toBe('589 d.B.')
    expect(rootCitation({ gp: 'XXVIII', ityp: 'A', inr: 1007 })).toBe('1007/A')
    expect(rootCitation(meRoot('XXVIII', 133))).toBe('133/ME')
  })
  it('maps the path segment to the item type and back', () => {
    expect(itypOfKind('vorlage')).toBe('I')
    expect(itypOfKind('antrag')).toBe('A')
    expect(itypOfKind('me')).toBeNull()
    expect(vorlagePath('XXVIII', 'A', 372)).toBe('/entwuerfe/XXVIII/antrag/372')
  })
})

describe('findLawStations on a Vorlage’s own record', () => {
  it('files the Vorlage’s Gesetzestext as `rv`, never as the draft’s', () => {
    const found = findLawStations(record('XXVIII-I-589'), 'I')
    expect([...found.keys()]).toEqual(['rv'])
    expect(tail(found.get('rv')?.html)).toBe('I/589/fnameorig_1770355.html')
    expect(tail(found.get('rv')?.fallbackUrl)).toBe('I/589/fname_1770355.pdf')
  })
  it('reads the same record as a draft’s the old way — the reason for the parameter', () => {
    expect([...findLawStations(record('XXVIII-I-589')).keys()]).toEqual(['me'])
  })
})

describe('findLawStations on an Antrag’s own record', () => {
  it('takes the ParlDion text as `antrag` and the parliamentary versions after it', () => {
    const found = findLawStations(record('XXVIII-A-372'), 'A')
    expect([...found.keys()]).toEqual(['antrag', 'ausschuss', 'plenum'])
    expect(tail(found.get('antrag')?.html)).toBe('A/372/fnameorig_1702313.html')
    expect(tail(found.get('ausschuss')?.html)).toBe('I/204/fnameorig_1711020.html')
    expect(tail(found.get('plenum')?.html)).toBe('BNR/63/fnameorig_1713048.html')
  })
  it('never offers the Initiativantrag document, which carries the Begründung', () => {
    const urls = [...findLawStations(record('XXVIII-A-1007'), 'A').values()].flatMap((s) => [s.html, s.fallbackUrl])
    expect(urls.map(tail)).toEqual(['A/1007/fnameorig_1779907.html', 'A/1007/fname_1779907.pdf'])
  })
})

describe('the Vorlage’s readers apply to an Antrag’s record as is', () => {
  const a372 = record('XXVIII-A-372')
  it('finds Kundmachung, Beschluss, committee report and plenary motion', () => {
    expect(extractBgblLink(a372.status.bgbllinks)?.number).toBe('Bundesgesetzblatt I Nr. 56/2025')
    expect(findHouseDecisionDate(a372.phase)).toBe('2025-09-24')
    expect(findCommitteeReport(a372.phase)?.label).toBe('204 d.B.')
    expect(findPlenaryAmendments(a372.phase)?.amendments.map((m) => m.label)).toEqual(['AA-24'])
    expect(amendedStationsOf(a372.statements.documents)).toEqual(['ausschuss', 'plenum'])
  })
  it('reads a namentliche Abstimmung as no club vote, as on a Vorlage', () => {
    expect(parseVote(a372.vote)).toBeNull()
    expect(parseVote(record('XXVIII-A-1007').vote)?.against).toEqual(['GRÜNE'])
  })
})

describe('list 142 rows of an Antrag', () => {
  it('match their parent by both readings of the filter', () => {
    const row: unknown[] = []
    row[7] = 'XXVIII'
    row[8] = '372'
    row[9] = 'A'
    row[18] = '/gegenstand/XXVIII/A/372'
    expect(statementRowMatchesParent(row, 'XXVIII', 'A', 372)).toBe(true)
    expect(statementRowMatchesParent(row, 'XXVIII', 'I', 372)).toBe(false)
  })
})

describe('stations of a comparison by origin', () => {
  it('keeps the draft endpoints’ vocabulary without the Antrag', () => {
    expect([...DRAFT_LAW_STATIONS]).toEqual(['me', 'rv', 'ausschuss', 'plenum', 'bgbl'])
  })
  it('declines the Antrag’s label like the -ung names', () => {
    expect(LAW_STATION_LABEL.antrag).toBe('Antragsfassung')
    expect(lawDiffScopeOf('antrag')).toBeNull()
  })
  it('starts the parliamentary steps and the whole way at the first text', () => {
    expect(lawDiffSteps('parlament', ['ausschuss', 'plenum'], 'antrag')).toEqual([
      { from: 'antrag', to: 'ausschuss' },
      { from: 'ausschuss', to: 'plenum' },
    ])
    expect(lawDiffSteps('bgbl', [], 'rv')).toEqual([{ from: 'rv', to: 'bgbl' }])
    expect(lawDiffSteps('rv', [], 'rv')).toEqual([])
    // A draft's page asks what it always asked.
    expect(lawDiffSteps('bgbl', [])).toEqual([{ from: 'me', to: 'bgbl' }])
    expect(lawDiffSteps('parlament', ['plenum'])).toEqual([{ from: 'rv', to: 'plenum' }])
  })
})
