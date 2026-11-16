import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { BundesratObjection, EnactmentInfo, ProcedureRoot } from '../shared/types'
import {
  extractBgblLink,
  findBundesratArrival,
  findBundesratDecisionDate,
  findBundesratObjection,
  findHouseDecisionDate,
  lawOfEbr,
  readObjectionOutcome,
  type EbrContent,
} from '../server/utils/parliament/detailJson'
import { assembleVorlageDetail, type VorlageContent } from '../server/utils/parliament/vorlageDetailAssembly'
import { pickBgblIForItem, pickBgblIForVorlage } from '../server/utils/ris/bgblVorlage'
import type { BgblRecord } from '../server/utils/ris/bgblJoin'
import { finalDecisionOf, objectionUnresolved, promulgationState } from '../shared/utils/promulgation'
import {
  bundesratRowDe,
  enactmentStatusDe,
  laterStations,
  parliamentOutcome,
  parliamentStandDe,
  railSpeech,
  vorlageStations,
  vorlageStatusDe,
  type Station,
} from '../app/utils/spine'
import { viewOfDraft } from '../app/utils/entryView'
import { draftSummary } from './helpers/builders'
import { notFollowedOf } from '../app/utils/notFollowed'

/**
 * The Bundesrat's Einspruch (Art. 42 B-VG), 14.11.2026: read from the law's
 * own Verlauf and the Einspruch's item (type EBR), and what the pages say.
 *
 * Every record here is a recording of Parliament's detail JSON
 * (`tests/fixtures/einspruch/`, names of persons cut). Five laws of GP
 * XXVII the monitor misread until this day: 84/A and 481/A (Beharrungs-
 * beschluss), 1105/A (a changed text), 2597/A and 2455 d.B. — the
 * Vorlage of 251/ME — whose Einspruch the Nationalrat never decided.
 */

const TODAY = '2026-11-14'

function record<T = VorlageContent & EbrContent>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/einspruch/${name}.json`, import.meta.url), 'utf8')).content
}

/**
 * The law's outcome as `enactmentOfItem` assembles it, from the two
 * recorded records instead of the network: the same pure readers, the EBR
 * named by the stage — or, where the stage links none (1105/A), by the
 * period's EBR list, which names it through the EBR's „Bezug zu".
 */
function enactmentFor(lawName: string, item: ProcedureRoot, ebrName: string | null, currentGp: string): EnactmentInfo {
  const law = record(lawName)
  const anchor = findBundesratObjection(law.phase)
  const ebr = ebrName ? record<EbrContent>(ebrName) : null
  const ebrRef = anchor?.ebr ?? (ebrName ? { gp: ebrName.split('-')[0]!, inr: Number(ebrName.split('-')[2]), citation: `${ebrName.split('-')[2]} d.B.`, url: `https://www.parlament.gv.at/gegenstand/${ebrName.split('-')[0]}/I/${ebrName.split('-')[2]}` } : null)
  const read = readObjectionOutcome(ebr, ebrRef?.gp ?? item.gp, currentGp)
  const link = extractBgblLink(law.status?.bgbllinks) ?? extractBgblLink(ebr?.status?.bgbllinks)
  const objection: BundesratObjection | null = anchor || ebrName
    ? {
        date: anchor?.date ?? null,
        ebr: ebrRef ? { citation: ebrRef.citation, url: ebrRef.url } : null,
        outcome: read.outcome,
        decidedAt: read.decidedAt,
        ...(read.unknownCause ? { unknownCause: read.unknownCause } : {}),
      }
    : null
  return {
    rvCitation: item.ityp === 'A' ? `${item.inr}/A` : `${item.inr} d.B.`,
    rvUrl: `https://www.parlament.gv.at/gegenstand/${item.gp}/${item.ityp}/${item.inr}`,
    rvTextUrl: null,
    rvDate: null,
    furtherRv: [],
    bgblNumber: link?.number ?? null,
    bgblRisUrl: link?.url ?? null,
    amendedIn: [],
    committeeReport: null,
    plenaryAmendments: null,
    houseStatus: String(law.status?.number ?? ''),
    // Parliament's own status prose for these laws begins so; the classifier
    // reads „beschlossen" off it (`houseOutcomeOf`).
    houseStatusText: 'Beschlossen im Bundesrat Beschlossen im Nationalrat',
    vote: { infavor: ['ÖVP', 'GRÜNE', 'NEOS'], against: ['SPÖ', 'FPÖ'], passed: true },
    filingOpen: false,
    rvGpEnded: currentGp !== item.gp,
    notPromulgated: null,
    successor: null,
    decidedAt: findHouseDecisionDate(law.phase),
    bundesratArrivedAt: findBundesratArrival(law.phase),
    bundesratDecidedAt: objection ? read.bundesratDecidedAt : findBundesratDecisionDate(law.phase),
    bundesratObjection: objection,
  }
}

const A = (inr: number): ProcedureRoot => ({ gp: 'XXVII', ityp: 'A', inr })

function pageOf(lawName: string, item: ProcedureRoot & { ityp: 'I' | 'A' }, ebrName: string | null, currentGp = 'XXVIII') {
  return assembleVorlageDetail({
    root: item,
    content: record(lawName),
    enactment: enactmentFor(lawName, item, ebrName, currentGp),
    currentGp,
    withoutBegutachtung: false,
  })
}

const rail = (stations: Station[]) => stations.map((s) => `${s.name}: ${s.state} [${s.facts.join(' · ')}]`)

describe('findBundesratObjection — the anchor in the law’s Verlauf', () => {
  it('reads the day and the EBR from „Antrag, Einspruch zu erheben, angenommen"', () => {
    expect(findBundesratObjection(record('XXVII-A-84').phase)).toEqual({
      date: '2019-12-19',
      ebr: { gp: 'XXVII', inr: 20, citation: '20 d.B.', url: 'https://www.parlament.gv.at/gegenstand/XXVII/I/20' },
    })
    expect(findBundesratObjection(record('XXVII-A-2597').phase)?.ebr?.citation).toBe('1615 d.B.')
    expect(findBundesratObjection(record('XXVII-I-2455').phase)).toMatchObject({ date: '2024-07-10', ebr: { inr: 2705 } })
    expect(findBundesratObjection(record('XXV-I-365').phase)).toMatchObject({ date: '2014-12-18', ebr: { gp: 'XXV', inr: 453 } })
  })

  it('skips the motion before it, which carries a GO number and never the EBR', () => {
    // 481/A: „Antrag, Einspruch zu erheben (1419/GO-BR/2020) angenommen"
    // stands first; the canonical stage after it links 150 d.B.
    expect(findBundesratObjection(record('XXVII-A-481').phase)).toMatchObject({ date: '2020-05-04', ebr: { inr: 150 } })
  })

  it('stands without an EBR where the stage links none — the period’s list names it', () => {
    // 1105/A: „917. Sitzung: Antrag, Einspruch zu erheben, angenommen Einhellig".
    expect(findBundesratObjection(record('XXVII-A-1105').phase)).toEqual({ date: '2020-12-17', ebr: null })
    // … and 616 d.B.'s „Bezug zu" names 1105/A.
    expect(lawOfEbr(record('XXVII-I-616').reference)).toEqual({ gp: 'XXVII', ityp: 'A', inr: 1105 })
  })

  it('TRAP: „Antrag, keinen Einspruch zu erheben, angenommen" is no Einspruch', () => {
    // On the EBR 616 d.B. itself (the changed text passed the Bundesrat) and
    // on a treaty whose Bundesrat raised none.
    expect(findBundesratObjection(record('XXVII-I-616').phase)).toBeNull()
    expect(findBundesratObjection(record('XXVII-I-1800').phase)).toBeNull()
  })

  it('TRAP: a Vorlage TITLED „Einspruch der Republik Österreich gegen …" is no Einspruch of the Bundesrat', () => {
    const treaty = record('XXVII-I-1800')
    expect(treaty.title).toMatch(/^Einspruch der Republik Österreich gegen/)
    expect(findBundesratObjection(treaty.phase)).toBeNull()
    // Its Bundesrat's Beschluss stays a Beschluss.
    expect(findBundesratDecisionDate(treaty.phase)).toBe('2023-04-14')
    // And read as an EBR it is no EBR.
    expect(readObjectionOutcome(treaty, 'XXVII', 'XXVIII')).toEqual({ outcome: 'unknown', unknownCause: 'unmapped', decidedAt: null, bundesratDecidedAt: null })
  })
})

describe('readObjectionOutcome — what the Einspruch’s own Verlauf says followed', () => {
  it('Beharrungsbeschluss: „Wiederholung des Gesetzesbeschlusses", dated by the Beschluss im Nationalrat', () => {
    expect(readObjectionOutcome(record('XXVII-I-20'), 'XXVII', 'XXVIII')).toEqual({ outcome: 'beharrung', decidedAt: '2020-02-27', bundesratDecidedAt: null })
    expect(readObjectionOutcome(record('XXVII-I-150'), 'XXVII', 'XXVIII')).toMatchObject({ outcome: 'beharrung', decidedAt: '2020-05-13' })
  })

  it('a changed text: „Antrag auf Annahme des veränderten Gesetzesvorschlags … angenommen"', () => {
    expect(readObjectionOutcome(record('XXVII-I-616'), 'XXVII', 'XXVIII')).toEqual({ outcome: 'new-decision', decidedAt: '2020-12-21', bundesratDecidedAt: '2020-12-22' })
  })

  it('undecided: pending while the EBR’s period runs, lapsed once it has ended', () => {
    // The same undecided record, as if its period were the running one —
    // GP XXVII has ended by the calendar whatever the running GP says.
    expect(readObjectionOutcome(record('XXVII-I-1615'), 'XXVIII', 'XXVIII')).toMatchObject({ outcome: 'pending', decidedAt: null })
    expect(readObjectionOutcome(record('XXVII-I-1615'), 'XXVII', 'XXVIII')).toMatchObject({ outcome: 'lapsed', decidedAt: null })
    expect(readObjectionOutcome(record('XXVII-I-2705'), 'XXVII', 'XXVIII')).toMatchObject({ outcome: 'lapsed' })
    expect(readObjectionOutcome(record('XXV-I-453'), 'XXV', 'XXVIII')).toMatchObject({ outcome: 'lapsed' })
  })

  it('unknown: an unread record, and a finished one without a measured decision', () => {
    expect(readObjectionOutcome(null, 'XXVII', 'XXVIII')).toEqual({ outcome: 'unknown', unknownCause: 'unread', decidedAt: null, bundesratDecidedAt: null })
    const finishedUndecided = { ...record<EbrContent>('XXVII-I-1615'), status: { number: 5 } }
    expect(readObjectionOutcome(finishedUndecided, 'XXVII', 'XXVIII')).toMatchObject({ outcome: 'unknown', unknownCause: 'unmapped' })
  })

  it('every EBR names its law through „Bezug zu"', () => {
    expect(lawOfEbr(record('XXVII-I-20').reference)).toEqual({ gp: 'XXVII', ityp: 'A', inr: 84 })
    expect(lawOfEbr(record('XXVII-I-150').reference)).toEqual({ gp: 'XXVII', ityp: 'A', inr: 481 })
    expect(lawOfEbr(record('XXVII-I-1615').reference)).toEqual({ gp: 'XXVII', ityp: 'A', inr: 2597 })
    expect(lawOfEbr(record('XXVII-I-2705').reference)).toEqual({ gp: 'XXVII', ityp: 'I', inr: 2455 })
    expect(lawOfEbr(record('XXV-I-453').reference)).toEqual({ gp: 'XXV', ityp: 'I', inr: 365 })
  })

  it('the Kundmachung sits on the EBR, not on the law', () => {
    expect(extractBgblLink(record('XXVII-A-84').status?.bgbllinks)).toBeNull()
    expect(extractBgblLink(record('XXVII-I-20').status?.bgbllinks)?.number).toBe('Bundesgesetzblatt I Nr. 11/2020')
    expect(extractBgblLink(record('XXVII-I-616').status?.bgbllinks)?.number).toBe('Bundesgesetzblatt I Nr. 158/2020')
  })
})

describe('pickBgblIForItem — RIS keys a law by its Antrag too', () => {
  const law = (over: Partial<BgblRecord>): BgblRecord => ({
    id: 'BGBLA_2020_I_11', teil: 'Teil1', nummer: 'BGBl. I Nr. 11/2020', datum: '2020-03-14', kurztitel: null, titel: null, stelle: null,
    gp: 'XXVII', regierungsvorlagen: [], initiativantraege: [84], ausschussberichte: [], typ: 'Bundesgesetz', datumNationalrat: '2020-02-27', ...over,
  })
  it('finds 84/A by `Initiativantrag`, never by a Vorlage of the same number', () => {
    expect(pickBgblIForItem([law({})], 'XXVII', { ityp: 'A', inr: 84 })?.nummer).toBe('BGBl. I Nr. 11/2020')
    expect(pickBgblIForItem([law({})], 'XXVII', { ityp: 'I', inr: 84 })).toBeNull()
    expect(pickBgblIForVorlage([law({})], 'XXVII', 84)).toBeNull()
    expect(pickBgblIForItem([law({})], 'XXVI', { ityp: 'A', inr: 84 })).toBeNull()
  })
})

describe('promulgationState — an Einspruch is no Beschluss of the Bundesrat', () => {
  const lapsed: BundesratObjection = { date: '2022-06-29', ebr: null, outcome: 'lapsed', decidedAt: null }
  it('is never overdue while the Einspruch stands undecided', () => {
    const facts = { decidedAt: '2022-06-15', bundesratDecidedAt: null, bundesratObjection: lapsed }
    expect(promulgationState(facts, TODAY)).toBeNull()
    expect(objectionUnresolved(lapsed)).toBe(true)
    // The reading before 14.11.2026: the Einspruch's sitting taken for a
    // Beschluss, and the law „seit 29.06.2022 nicht kundgemacht".
    expect(promulgationState({ decidedAt: '2022-06-15', bundesratDecidedAt: '2022-06-29' }, TODAY)).toBe('overdue')
  })
  it('counts from the final decision once there is one', () => {
    const beharrung: BundesratObjection = { date: '2019-12-19', ebr: null, outcome: 'beharrung', decidedAt: '2020-02-27' }
    expect(finalDecisionOf({ decidedAt: '2019-12-11', bundesratObjection: beharrung })).toBe('2020-02-27')
    expect(promulgationState({ decidedAt: '2019-12-11', bundesratObjection: beharrung }, TODAY)).toBe('overdue')
    expect(promulgationState({ decidedAt: '2026-07-01', bundesratObjection: { ...beharrung, decidedAt: '2026-10-01' } }, TODAY)).toBeNull()
    const changed: BundesratObjection = { date: '2020-12-17', ebr: null, outcome: 'new-decision', decidedAt: '2020-12-21' }
    expect(finalDecisionOf({ decidedAt: '2020-12-11', bundesratDecidedAt: '2020-12-22', bundesratObjection: changed })).toBe('2020-12-22')
  })
})

describe('the five laws, as their pages say it', () => {
  it('84/A: law by a Beharrungsbeschluss', () => {
    const d = pageOf('XXVII-A-84', { gp: 'XXVII', ityp: 'A', inr: 84 }, 'XXVII-I-20')
    expect(d.enactment.bgblNumber).toBe('Bundesgesetzblatt I Nr. 11/2020')
    expect(vorlageStatusDe(d, TODAY)).toBe('Gesetz geworden')
    expect(parliamentStandDe(d, TODAY, 'antrag')).toBe('Der Nationalrat hat den Text des Antrags unverändert beschlossen.')
    expect(bundesratRowDe(d.enactment.bundesratObjection!).text).toBe(
      'Der Bundesrat hat am 19.12.2019 Einspruch erhoben (20 d.B.); der Nationalrat hat seinen Beschluss am 27.02.2020 wiederholt (Beharrungsbeschluss).',
    )
    expect(rail(vorlageStations(d, {}, TODAY)).slice(2)).toEqual([
      'Parlament: done [Initiativantrag · 13.11.2019 · Text unverändert beschlossen · Einspruch des Bundesrates · Beharrungsbeschluss · ÖVP, GRÜNE und NEOS dafür, SPÖ und FPÖ dagegen]',
      'Bundesgesetzblatt: done [BGBl. I Nr. 11/2020]',
    ])
  })

  it('481/A: the same with the motion trap in its Verlauf', () => {
    const d = pageOf('XXVII-A-481', { gp: 'XXVII', ityp: 'A', inr: 481 }, 'XXVII-I-150')
    expect(vorlageStatusDe(d, TODAY)).toBe('Gesetz geworden')
    expect(bundesratRowDe(d.enactment.bundesratObjection!).text).toBe(
      'Der Bundesrat hat am 04.05.2020 Einspruch erhoben (150 d.B.); der Nationalrat hat seinen Beschluss am 13.05.2020 wiederholt (Beharrungsbeschluss).',
    )
  })

  it('1105/A: a changed text — never „unverändert"', () => {
    const d = pageOf('XXVII-A-1105', { gp: 'XXVII', ityp: 'A', inr: 1105 }, 'XXVII-I-616')
    expect(vorlageStatusDe(d, TODAY)).toBe('Gesetz geworden')
    expect(parliamentOutcome(d)).toBe('amended')
    expect(parliamentStandDe(d, TODAY, 'antrag')).toBe('Der Text wurde im Parlament weiter geändert.')
    expect(bundesratRowDe(d.enactment.bundesratObjection!).text).toBe(
      'Der Bundesrat hat am 17.12.2020 Einspruch erhoben (616 d.B.); der Nationalrat hat am 21.12.2020 einen geänderten Text beschlossen.',
    )
    const parlament = rail(vorlageStations(d, {}, TODAY))[2]!
    expect(parlament).toContain('Einspruch des Bundesrates · geänderter Text beschlossen')
    expect(parlament).not.toContain('unverändert')
  })

  it('2597/A: the Nationalrat never decided, the period ended', () => {
    const d = pageOf('XXVII-A-2597', { gp: 'XXVII', ityp: 'A', inr: 2597 }, 'XXVII-I-1615')
    expect(d.enactment.bgblNumber).toBeNull()
    expect(vorlageStatusDe(d, TODAY)).toBe('Einspruch des Bundesrates – Gesetzgebungsperiode beendet')
    expect(parliamentStandDe(d, TODAY, 'antrag')).toBe('Der Nationalrat hat den Text beschlossen.')
    expect(parliamentStandDe(d, TODAY, 'antrag')).not.toMatch(/Bundesrat haben|kundgemacht/)
    expect(bundesratRowDe(d.enactment.bundesratObjection!).text).toBe(
      'Der Bundesrat hat am 29.06.2022 Einspruch erhoben (1615 d.B.); bis zum Ende der Gesetzgebungsperiode hat der Nationalrat darüber nicht entschieden.',
    )
    expect(rail(vorlageStations(d, {}, TODAY)).slice(2)).toEqual([
      'Parlament: done [Initiativantrag · 19.05.2022 · beschlossen · Einspruch des Bundesrates · GP beendet · ÖVP, GRÜNE und NEOS dafür, SPÖ und FPÖ dagegen]',
      'Bundesgesetzblatt: never []',
    ])
  })

  it('2455 d.B. (251/ME): the draft page’s headline and stations read the same record', () => {
    const e = enactmentFor('XXVII-I-2455', { gp: 'XXVII', ityp: 'I', inr: 2455 }, 'XXVII-I-2705', 'XXVIII')
    expect(enactmentStatusDe({ enactment: e, textEvolution: [] }, TODAY)).toBe('Einspruch des Bundesrates – Gesetzgebungsperiode beendet')
    expect(parliamentStandDe({ enactment: e, textEvolution: [] }, TODAY)).toBe('Der Nationalrat hat den Text beschlossen.')
    const [parlament, bgbl] = laterStations({ enactment: e, textEvolution: [], gpEnded: true, active: false, antragPath: null }, TODAY)
    expect(parlament.facts).toContain('Einspruch des Bundesrates')
    expect(parlament.facts.join(' ')).not.toMatch(/nicht kundgemacht/)
    expect(bgbl).toMatchObject({ state: 'never', facts: [] })
  })

  it('pending and unknown, for the outcomes no current record has', () => {
    const base = enactmentFor('XXVII-A-2597', A(2597), 'XXVII-I-1615', 'XXVIII')
    const pending: EnactmentInfo = { ...base, rvGpEnded: false, bundesratObjection: { ...base.bundesratObjection!, outcome: 'pending' } }
    expect(enactmentStatusDe({ enactment: pending, textEvolution: [] }, TODAY)).toBe('Einspruch des Bundesrates')
    expect(bundesratRowDe(pending.bundesratObjection!).tail).toBe('; der Nationalrat hat darüber noch nicht entschieden.')
    const [, bgbl] = laterStations({ enactment: pending, textEvolution: [], gpEnded: false, active: false, antragPath: null }, TODAY)
    expect(bgbl).toMatchObject({ state: 'open', facts: ['ausstehend'] })

    const unread: BundesratObjection = { date: '2022-06-29', ebr: { citation: '1615 d.B.', url: 'https://www.parlament.gv.at/gegenstand/XXVII/I/1615' }, outcome: 'unknown', unknownCause: 'unread', decidedAt: null }
    expect(bundesratRowDe(unread).text).toBe('Der Bundesrat hat am 29.06.2022 Einspruch erhoben (1615 d.B.); was danach geschah, ist gerade nicht abrufbar.')
    expect(enactmentStatusDe({ enactment: { ...pending, bundesratObjection: unread }, textEvolution: [] }, TODAY)).toBe('Einspruch des Bundesrates')
  })

  it('the list row says it in the row’s words', () => {
    const row = viewOfDraft(draftSummary({
      gp: 'XXVII',
      inr: 251,
      active: false,
      chain: {
        station: 'parlament', rvCitation: '2455 d.B.', rvDate: '2024-02-21', bgblNumber: null, filingOpen: false, rvGpEnded: true,
        decidedAt: '2024-07-04', bundesratDecidedAt: null,
        bundesratObjection: { date: '2024-07-10', ebr: null, outcome: 'lapsed', decidedAt: null },
      },
    })).state
    expect(row).toEqual({ label: 'Einspruch des Bundesrates – GP beendet', detail: '10.07.2024', tone: 'inactive', actionable: false })
  })
})

describe('„unverändert" needs more than a missing Plenarfassung', () => {
  it('an Abänderungsantrag adopted in plenary changed the text (437/A: AA-38, no Plenarfassung published)', () => {
    const e = enactmentFor('XXVII-A-84', A(84), 'XXVII-I-20', 'XXVIII')
    const withMotion: EnactmentInfo = {
      ...e,
      plenaryAmendments: { session: null, amendments: [{ label: 'AA-38', url: 'https://www.parlament.gv.at/gegenstand/XXVII/AA/38' }] },
    }
    expect(parliamentOutcome({ enactment: e, textEvolution: [] })).toBe('unchanged')
    expect(parliamentOutcome({ enactment: withMotion, textEvolution: [] })).toBe('amended')
    const [parlament] = laterStations({ enactment: withMotion, textEvolution: [], gpEnded: true, active: false, antragPath: null }, TODAY)
    expect(parlament.facts.slice(0, 2)).toEqual(['beschlossen', 'im Plenum geändert'])
  })

  /* A record without a text list (306 of GP XXVII, 14.11.2026): after a
     Beharrungsbeschluss the text is still not called unchanged — the list
     that would say so is missing, not empty. */
  it('a record without a text list is „beschlossen", after a Beharrungsbeschluss too', () => {
    const e: EnactmentInfo = { ...enactmentFor('XXVII-A-84', A(84), 'XXVII-I-20', 'XXVIII'), amendedIn: null }
    expect(parliamentOutcome({ enactment: e, textEvolution: [] })).toBe('decided')
    expect(parliamentStandDe({ enactment: e, textEvolution: [] }, TODAY, 'antrag')).toBe('Der Nationalrat hat den Text beschlossen.')
    const [parlament] = laterStations({ enactment: e, textEvolution: [], gpEnded: true, active: false, antragPath: null }, TODAY)
    expect(parlament.facts.slice(0, 3)).toEqual(['beschlossen', 'Einspruch des Bundesrates', 'Beharrungsbeschluss'])

    const withMotion: EnactmentInfo = {
      ...e,
      plenaryAmendments: { session: null, amendments: [{ label: 'AA-38', url: 'https://www.parlament.gv.at/gegenstand/XXVII/AA/38' }] },
    }
    const [amended] = laterStations({ enactment: withMotion, textEvolution: [], gpEnded: true, active: false, antragPath: null }, TODAY)
    expect(amended.facts.slice(0, 2)).toEqual(['beschlossen', 'im Plenum geändert'])
  })
})

describe('railSpeech — what the screen reader hears is what the row shows', () => {
  it('the pale Begutachtung of a law without a draft silences nothing behind it', () => {
    const speech = railSpeech([
      { id: 'begutachtung', name: 'Begutachtung', state: 'never', facts: ['nicht feststellbar'], comparison: null, trail: 'unknown' },
      { id: 'rv', name: 'Initiativantrag', state: 'done', facts: ['13.11.2019'], comparison: null },
      { id: 'parlament', name: 'Parlament', state: 'done', facts: ['beschlossen', 'seit 19.12.2019 nicht kundgemacht'], comparison: null },
      { id: 'bgbl', name: 'Bundesgesetzblatt', state: 'open', facts: ['nicht kundgemacht'], comparison: null },
    ])
    // Until 14.11.2026: facts [] and „ausstehend" announced under „nicht kundgemacht".
    expect(speech[3]).toEqual({ silent: false, facts: ['nicht kundgemacht'], announce: null })
  })

  it('a station behind one the text has not reached still falls silent, and says its state', () => {
    const speech = railSpeech([
      { id: 'rv', name: 'Regierungsvorlage', state: 'never', facts: ['keine – GP beendet'], comparison: null },
      { id: 'parlament', name: 'Parlament', state: 'never', facts: ['x'], comparison: null },
      { id: 'bgbl', name: 'Bundesgesetzblatt', state: 'open', facts: ['ausstehend'], comparison: null },
    ])
    expect(speech.map((s) => s.announce)).toEqual([null, 'nicht erreicht', 'ausstehend'])
    expect(speech[2]!.facts).toEqual([])
  })

  it('on the page of 2597/A every row speaks its own facts, none behind the pale first station', () => {
    const d = pageOf('XXVII-A-2597', { gp: 'XXVII', ityp: 'A', inr: 2597 }, 'XXVII-I-1615')
    const list = vorlageStations(d, {}, TODAY)
    const speech = railSpeech(list)
    list.forEach((s, i) => {
      // Never an announcement beside visible facts, never a silenced fact
      // behind the pale first station.
      if (speech[i]!.facts.length) expect(speech[i]!.announce).toBeNull()
      expect(speech[i]!.silent).toBe(false)
    })
  })
})

describe('notFollowedOf — the refusal of an item the monitor does not follow', () => {
  it('reads the API body inside a fetch error, and a page error’s own data', () => {
    const api = { statusCode: 404, data: { statusCode: 404, data: { parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVII/I/1800', followedAt: null } } }
    expect(notFollowedOf(api)).toEqual({ parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVII/I/1800', followedAt: null })
    const page = { statusCode: 404, data: { parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVII/I/616', followedAt: '/entwuerfe/XXVII/antrag/1105' } }
    expect(notFollowedOf(page)?.followedAt).toBe('/entwuerfe/XXVII/antrag/1105')
  })
  it('is no refusal without its data, and follows no link off the site', () => {
    expect(notFollowedOf({ statusCode: 404 })).toBeNull()
    expect(notFollowedOf({ data: { followedAt: '//evil.example/x' } })).toBeNull()
    expect(notFollowedOf({ data: { followedAt: '/impressum', parliamentUrl: 'javascript:alert(1)' } })).toBeNull()
  })
})
