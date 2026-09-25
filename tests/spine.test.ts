import { describe, expect, it } from 'vitest'
import type { DraftDetail, LawStationId } from '../shared/types'
import { formatNumberDe } from '../shared/utils/format'
import {
  houseOutcomeOf,
  lastParliamentStation,
  parliamentOutcome,
  procedureStatusDe,
  stations,
  voteLineDe,
} from '../app/utils/spine'

/* Only what `stations()` reads; the rest of DraftDetail is irrelevant here. */
function draft(overrides: Partial<DraftDetail> = {}): DraftDetail {
  return {
    arrivedAt: '2021-02-22',
    deadline: '2021-04-19',
    active: false,
    gpEnded: true,
    handoff: null,
    textEvolution: [],
    statements: { total: 143, organisations: 40, privatePersons: 100, nonPublic: 3, organisationList: [] },
    enactment: {
      rvCitation: '2238 d.B.',
      rvUrl: 'https://www.parlament.gv.at/gegenstand/XXVII/I/2238',
      rvTextUrl: null,
      rvDate: '2023-10-04',
      furtherRv: [],
      bgblNumber: 'Bundesgesetzblatt I Nr. 5/2024',
      bgblRisUrl: null,
      // The three fields the Vorlage's own record fills. Null here is the
      // "could not be read" case, which is what every test that does not
      // exercise them wants: the draft's mirror answers instead.
      amendedIn: null,
      houseStatus: null,
      houseStatusText: null,
      vote: null,
      filingOpen: false,
    },
    ...overrides,
  } as unknown as DraftDetail
}

const rvRow = (d: DraftDetail, ctx?: Parameters<typeof stations>[1]) =>
  stations(d, ctx).find((s) => s.id === 'rv')!

describe('stations — the Regierungsvorlage row', () => {
  it('adds the Vorlage\'s own Stellungnahmen after its date, phrased "zur Vorlage"', () => {
    expect(rvRow(draft(), { rvStatementTotal: 10 }).facts).toEqual(['04.10.2023, 30 Monate nach Fristende', '10 Stellungnahmen zur Vorlage'])
    expect(rvRow(draft(), { rvStatementTotal: 1 }).facts).toEqual(['04.10.2023, 30 Monate nach Fristende', '1 Stellungnahme zur Vorlage'])
  })

  it('says nothing about them while unknown or when there are none', () => {
    const date = ['04.10.2023, 30 Monate nach Fristende']
    expect(rvRow(draft()).facts).toEqual(date)
    expect(rvRow(draft(), { rvStatementTotal: 0 }).facts).toEqual(date)
    expect(rvRow(draft(), { rvStatementTotal: null }).facts).toEqual(date)
  })

  it('formats large counts the Austrian way, on both rows', () => {
    const d = draft({ statements: { total: 41376, organisations: 0, privatePersons: 0, nonPublic: 0, organisationList: [] } } as Partial<DraftDetail>)
    const list = stations(d, { rvStatementTotal: 41376 })
    // Whatever de-AT grouping Node's ICU produces (a narrow space here, a
    // dot in browsers) — the point is that both rows use the same one.
    const grouped = formatNumberDe(41376)
    expect(grouped).not.toBe('41376')
    expect(list.find((s) => s.id === 'begutachtung')!.facts[0]).toBe(`${grouped} Stellungnahmen`)
    expect(list.find((s) => s.id === 'rv')!.facts[1]).toBe(`${grouped} Stellungnahmen zur Vorlage`)
  })

  /* The whole point of the line: 115/ME XXVIII was tabled as 525 d.B. on the
     day the draft went out, two weeks before its own Frist ended. The bar
     used to show that as two identical dates in two rows. */
  it('names the distance to the Fristende, including when the Vorlage came first', () => {
    const at = (rvDate: string) => rvRow(draft({
      arrivedAt: '2026-06-10',
      deadline: '2026-06-24',
      enactment: { ...draft().enactment!, rvDate },
    })).facts[0]
    expect(at('2026-06-10')).toBe('10.06.2026, noch vor Fristende')
    expect(at('2026-06-24')).toBe('24.06.2026, am Tag des Fristendes')
    expect(at('2026-06-25')).toBe('25.06.2026, 1 Tag nach Fristende')
    expect(at('2026-07-14')).toBe('14.07.2026, 20 Tage nach Fristende')
    expect(at('2026-12-24')).toBe('24.12.2026, 6 Monate nach Fristende')
  })

  it('falls back to the citation when the stage carries no date', () => {
    const d = draft({ enactment: { ...draft().enactment!, rvDate: null } })
    expect(rvRow(d).facts[0]).toBe('2238 d.B.')
  })
})

describe('stations — how long the Frist ran', () => {
  const beg = (d: DraftDetail) => stations(d).find((s) => s.id === 'begutachtung')!.facts

  it('leads with the duration, in weeks where the span is a clean multiple', () => {
    expect(beg(draft({ arrivedAt: '2026-08-11', deadline: '2026-09-22', active: true })))
      .toEqual(['6 Wochen Frist, bis 22.09.2026', '143 Stellungnahmen'])
    expect(beg(draft({ arrivedAt: '2026-06-10', deadline: '2026-06-24' })))
      .toEqual(['143 Stellungnahmen', '2 Wochen Frist, endete am 24.06.2026'])
  })

  it('stays in days for spans that are not whole weeks', () => {
    expect(beg(draft({ arrivedAt: '2026-06-10', deadline: '2026-06-20' })))
      .toEqual(['143 Stellungnahmen', '10 Tage Frist, endete am 20.06.2026'])
  })

  /* The duration is derived; the date is upstream's. Where the subtraction
     cannot be made the row keeps exactly what it always said. */
  it('drops the duration rather than guessing it', () => {
    expect(beg(draft({ arrivedAt: null as unknown as string, deadline: '2026-06-24' })))
      .toEqual(['143 Stellungnahmen', 'Frist endete am 24.06.2026'])
    expect(beg(draft({ deadline: null })))
      .toEqual(['143 Stellungnahmen', 'keine Frist angegeben'])
  })
})

describe('procedureStatusDe — the card\'s one-line answer', () => {
  it('names the end of the chain where it was reached', () => {
    expect(procedureStatusDe(draft())).toBe('Gesetz geworden')
  })

  it('separates "still in parliament" from "the period ended without a vote"', () => {
    const noBgbl = { ...draft().enactment!, bgblNumber: null }
    expect(procedureStatusDe(draft({ enactment: noBgbl, gpEnded: false })))
      .toBe('Im Parlament')
    expect(procedureStatusDe(draft({ enactment: noBgbl, gpEnded: true })))
      .toBe('Ohne Beschluss – Gesetzgebungsperiode beendet')
  })

  it('is temporal, never a verdict, while no Regierungsvorlage exists', () => {
    expect(procedureStatusDe(draft({ enactment: null, active: true, gpEnded: false })))
      .toBe('In Begutachtung')
    expect(procedureStatusDe(draft({ enactment: null, active: false, gpEnded: false })))
      .toBe('Bisher keine Regierungsvorlage')
    expect(procedureStatusDe(draft({ enactment: null, active: false, gpEnded: true })))
      .toBe('Ohne Regierungsvorlage – Gesetzgebungsperiode beendet')
  })
})

/**
 * Where parliament changed the text, read from the Vorlage that supplies the
 * BGBl number — not from the draft's mirror of one sibling's document list
 * (ME→RV is 1:n, §13.4). Verified live 23.09.2026 on XXVIII/26/ME.
 */
describe('stations — what parliament did with the Vorlage', () => {
  const doc = (title: string) => ({ title, formats: [{ type: 'pdf' as const, url: `https://x/${title}.pdf` }] })
  const parlament = (d: DraftDetail) => stations(d).find((s) => s.id === 'parlament')!
  const bgbl = (d: DraftDetail) => stations(d).find((s) => s.id === 'bgbl')!

  const enacted = (
    over: Partial<NonNullable<DraftDetail['enactment']>> = {},
    textEvolution: DraftDetail['textEvolution'] = [],
  ) => draft({ textEvolution, enactment: { ...draft().enactment!, ...over } })

  /* The regression, in one case: the mirror is silent about a Vorlage the
     Ausschuss and the Plenum both changed, and the page said the opposite. */
  it('names the houses from the Vorlage even when the draft mirrors a sibling', () => {
    const d = enacted({ amendedIn: ['ausschuss', 'plenum'] })
    expect(parliamentOutcome(d)).toBe('amended')
    expect(parlament(d).facts).toEqual(['im Ausschuss und im Plenum geändert'])
  })

  /* And the other direction: a mirror full of a sibling's Ausschussfassungen
     may not turn an unchanged Vorlage into an amended one. */
  it('lets the Vorlage say it changed nothing, against a mirror that shows changes', () => {
    const d = enacted({ amendedIn: [] }, [doc('Geändert im Ausschuss')])
    expect(parliamentOutcome(d)).toBe('unchanged')
    expect(parlament(d).facts).toEqual(['Text unverändert beschlossen'])
  })

  /* The single-RV case — nearly all of them — where the mirror IS that
     Vorlage's list: both sources have to give the same answer, or this fix
     would have moved the majority case. */
  it('is identical to the mirror wherever the draft produced one Vorlage', () => {
    const cases: [LawStationId[], string[]][] = [
      [[], []],
      [['ausschuss'], ['Geändert im Ausschuss']],
      [['plenum'], ['Geändert im Plenum']],
      [['ausschuss', 'plenum'], ['Geändert im Ausschuss', 'Geändert im Plenum']],
    ]
    for (const [amendedIn, titles] of cases) {
      const docs = titles.map(doc)
      const fromRv = enacted({ amendedIn }, docs)
      const fromMirror = enacted({ amendedIn: null }, docs)
      expect(parliamentOutcome(fromRv)).toBe(parliamentOutcome(fromMirror))
      expect(parlament(fromRv).facts).toEqual(parlament(fromMirror).facts)
      expect(lastParliamentStation(fromRv)).toBe(lastParliamentStation(fromMirror))
    }
  })

  /* `amendedIn: null` is "the Vorlage's record was unreadable", never "it
     changed nothing" — so the mirror, the best evidence left, answers. */
  it('falls back to the mirror when the Vorlage could not be read', () => {
    expect(parlament(enacted({ amendedIn: null }, [doc('Geändert im Plenum')])).facts)
      .toEqual(['im Plenum geändert'])
  })

  /* The comparison is resolved from the draft's own document list
     (`server/utils/diff/stationDocuments.ts`), so a station that exists only
     on the sibling Vorlage has no text behind it. The fact is stated; the
     link is not offered. */
  it('offers the comparison only where the text is on this page', () => {
    expect(parlament(enacted({ amendedIn: ['plenum'] })).comparison).toBeNull()
    expect(lastParliamentStation(enacted({ amendedIn: ['plenum'] }))).toBeNull()
    expect(parlament(enacted({ amendedIn: ['plenum'] }, [doc('Geändert im Plenum')])).comparison)
      .toEqual({ id: 'parlament', question: 'Was das Parlament am Text geändert hat' })
  })

  it('keeps the Bundesgesetzblatt row on the enacted draft untouched', () => {
    const d = enacted({ amendedIn: ['ausschuss'] })
    expect(bgbl(d).state).toBe('done')
    expect(bgbl(d).facts).toEqual(['BGBl. I Nr. 5/2024'])
  })
})

/**
 * The house status, which was fetched and dropped until 23.09.2026. Seven
 * finished GP-XXVII/XXVIII Vorlagen carry no BGBl link, and the page
 * described every one of them wrongly.
 */
describe('houseOutcomeOf — reading the status record', () => {
  it('reads the four terminal facts out of upstream\'s own wording', () => {
    // XXVII/474 d.B. (out of 33/ME) and XXVII/1929 d.B. (out of 240/ME).
    expect(houseOutcomeOf('5', 'Der Gesetzentwurf wurde in dritter Lesung abgelehnt')).toBe('rejected')
    expect(houseOutcomeOf('5', 'in zweiter Lesung abgelehnt')).toBe('rejected')
    // XXVIII/87 d.B.
    expect(houseOutcomeOf('5', 'Zurückgezogen')).toBe('withdrawn')
    // XXVII/2049 d.B.
    expect(houseOutcomeOf('3', 'Zurückverwiesen an den Justizausschuss')).toBe('recommitted')
    // XXVII/1435 d.B. (out of 171/ME) and XXVIII/80 d.B. (out of 2/ME).
    expect(houseOutcomeOf('5', 'Beschlossen im Bundesrat 47/BNR, Beschlossen im Nationalrat 47/BNR')).toBe('decided')
  })

  it('asks in the order of finality, because the record keeps every step', () => {
    /* A Vorlage rejected in the third reading still carries the Beschlüsse of
       the earlier ones; reading „beschlossen" first would report it as
       decided. Same for a text sent back after a reading. */
    expect(houseOutcomeOf('5', 'Beschlossen im Nationalrat, in dritter Lesung abgelehnt')).toBe('rejected')
    expect(houseOutcomeOf('3', 'Beschlossen im Nationalrat, Zurückverwiesen an den Ausschuss')).toBe('recommitted')
  })

  it('takes the status number where the record carries no wording for it', () => {
    expect(houseOutcomeOf('3', null)).toBe('recommitted')
    expect(houseOutcomeOf('3', '')).toBe('recommitted')
  })

  it('claims nothing about a record it does not recognise', () => {
    expect(houseOutcomeOf('2', 'Zugewiesen an den Finanzausschuss')).toBeNull()
    expect(houseOutcomeOf('1', 'Einlangen im Nationalrat')).toBeNull()
    expect(houseOutcomeOf(null, null)).toBeNull()
  })

  it('reads whatever case upstream typed', () => {
    expect(houseOutcomeOf('5', 'ABGELEHNT')).toBe('rejected')
    expect(houseOutcomeOf('5', 'zurückgezogen')).toBe('withdrawn')
  })
})

describe('the four house outcomes on the page', () => {
  const at = (houseStatus: string | null, houseStatusText: string | null, over: Partial<DraftDetail> = {}) =>
    draft({
      gpEnded: false,
      enactment: { ...draft().enactment!, bgblNumber: null, houseStatus, houseStatusText },
      ...over,
    })
  const row = (d: DraftDetail, id: string) => stations(d).find((s) => s.id === id)!

  it('says what happened instead of „Im Parlament"', () => {
    expect(procedureStatusDe(at('5', 'in dritter Lesung abgelehnt'))).toBe('Im Nationalrat abgelehnt')
    expect(procedureStatusDe(at('5', 'Zurückgezogen'))).toBe('Zurückgezogen')
    expect(procedureStatusDe(at('5', 'Beschlossen im Nationalrat'))).toBe('Beschlossen – Kundmachung ausständig')
    // Sent back to committee, the text IS still in parliament — the one of
    // the four where the old headline was right.
    expect(procedureStatusDe(at('3', 'Zurückverwiesen an den Ausschuss'))).toBe('Im Parlament')
  })

  it('says it after the period ended too, where it used to read „Ohne Beschluss"', () => {
    // XXVII/1435 d.B. out of 171/ME: decided in both chambers, no BGBl link,
    // GP long over — the page called it „Ohne Beschluss".
    const d = at('5', 'Beschlossen im Bundesrat, Beschlossen im Nationalrat', { gpEnded: true })
    expect(procedureStatusDe(d)).toBe('Beschlossen – Kundmachung ausständig')
    expect(row(d, 'parlament').facts).toEqual(['beschlossen'])
  })

  it('states one fact per row: „in Behandlung" beside „abgelehnt" would be two', () => {
    expect(row(at('5', 'abgelehnt'), 'parlament').facts).toEqual(['abgelehnt'])
    expect(row(at('5', 'Zurückgezogen'), 'parlament').facts).toEqual(['zurückgezogen'])
    expect(row(at('3', 'Zurückverwiesen'), 'parlament').facts).toEqual(['an den Ausschuss zurückverwiesen'])
  })

  it('keeps the amendment beside a Beschluss, where the reader is still owed it', () => {
    const d = draft({
      gpEnded: false,
      enactment: {
        ...draft().enactment!,
        bgblNumber: null,
        houseStatus: '5',
        houseStatusText: 'Beschlossen im Nationalrat',
        amendedIn: ['ausschuss'],
      },
    })
    expect(row(d, 'parlament').facts).toEqual(['beschlossen', 'im Ausschuss geändert'])
  })

  it('leaves the Parlament station reached, not unreachable, once the house is done', () => {
    for (const text of ['abgelehnt', 'Zurückgezogen', 'Beschlossen im Nationalrat']) {
      expect(row(at('5', text, { gpEnded: true }), 'parlament').state).toBe('done')
    }
  })

  it('keeps the Kundmachung ahead of a Beschluss, and takes it off the other two', () => {
    /* A Beschluss outlives its period: the Kundmachung follows it, so the row
       stays open even after the GP ended. A rejected or withdrawn Vorlage will
       not be promulgated whatever the calendar says. */
    const decided = at('5', 'Beschlossen im Nationalrat', { gpEnded: true })
    expect(row(decided, 'bgbl').state).toBe('open')
    expect(row(decided, 'bgbl').facts).toEqual(['ausstehend'])
    for (const text of ['in dritter Lesung abgelehnt', 'Zurückgezogen']) {
      expect(row(at('5', text), 'bgbl').state).toBe('never')
      expect(row(at('5', text), 'bgbl').facts).toEqual([])
    }
  })

  it('leaves a Vorlage nobody has decided about where it was', () => {
    expect(procedureStatusDe(at('2', 'Zugewiesen an den Finanzausschuss'))).toBe('Im Parlament')
    expect(procedureStatusDe(at(null, null, { gpEnded: true })))
      .toBe('Ohne Beschluss – Gesetzgebungsperiode beendet')
    expect(row(at('2', 'Zugewiesen'), 'parlament').facts).toEqual(['in Behandlung'])
  })

  it('never lets the status record outrank the Bundesgesetzblatt', () => {
    /* What is in the Bundesgesetzblatt was decided — the citation is the end
       of the chain, and no reading of the prose beside it may move the page
       off „Gesetz geworden". */
    const d = draft({
      enactment: { ...draft().enactment!, houseStatus: '5', houseStatusText: 'Beschlossen im Nationalrat' },
    })
    expect(procedureStatusDe(d)).toBe('Gesetz geworden')
    expect(parliamentOutcome(d)).toBe('unchanged')
  })
})

describe('the third-reading vote on the Parlament row', () => {
  const vote = (infavor: string[], against: string[], passed = true) => ({ infavor, against, passed })
  const withVote = (v: ReturnType<typeof vote> | null, over: Partial<NonNullable<DraftDetail['enactment']>> = {}) =>
    draft({ enactment: { ...draft().enactment!, vote: v, ...over } })
  const row = (d: DraftDetail) => stations(d).find((s) => s.id === 'parlament')!

  it('reads as one phrase, in the bar and in the section alike', () => {
    expect(voteLineDe(vote(['ÖVP', 'SPÖ', 'NEOS'], ['FPÖ', 'GRÜNE'])))
      .toBe('ÖVP, SPÖ und NEOS dafür, FPÖ und GRÜNE dagegen')
    expect(voteLineDe(vote(['ÖVP'], ['FPÖ']))).toBe('ÖVP dafür, FPÖ dagegen')
  })

  /* Never „einstimmig": parliament counts the show of hands per Klub, so a
     club is what we can report — a single deputy is invisible to it. */
  it('says „alle Klubs dafür" where nobody was against', () => {
    expect(voteLineDe(vote(['ÖVP', 'SPÖ', 'NEOS', 'FPÖ', 'GRÜNE'], []))).toBe('alle Klubs dafür')
    expect(voteLineDe(vote([], ['ÖVP', 'SPÖ']))).toBe('alle Klubs dagegen')
  })

  it('claims nothing where upstream kept no club list, and nothing before the vote', () => {
    expect(voteLineDe(null)).toBeNull()
    expect(voteLineDe(vote([], []))).toBeNull()
    expect(row(withVote(null)).facts).toEqual(['Text unverändert beschlossen'])
  })

  it('comes after the amendment, so the row reads in procedural order', () => {
    const d = withVote(vote(['ÖVP', 'GRÜNE'], ['SPÖ']), {
      bgblNumber: null,
      houseStatus: '5',
      houseStatusText: 'Beschlossen im Nationalrat',
      amendedIn: ['ausschuss'],
    })
    expect(row(d).facts).toEqual(['beschlossen', 'im Ausschuss geändert', 'ÖVP und GRÜNE dafür, SPÖ dagegen'])
  })

  it('states it on a rejected Vorlage too — who was for it is the finding there', () => {
    const d = withVote(vote(['ÖVP', 'GRÜNE'], ['SPÖ', 'FPÖ', 'NEOS'], false), {
      bgblNumber: null,
      houseStatus: '5',
      houseStatusText: 'in dritter Lesung abgelehnt',
    })
    expect(row(d).facts).toEqual(['abgelehnt', 'ÖVP und GRÜNE dafür, SPÖ, FPÖ und NEOS dagegen'])
  })

  it('says nothing at all where there is no Vorlage to vote on', () => {
    expect(row(draft({ enactment: null })).facts).toEqual([])
  })
})
