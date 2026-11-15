/**
 * Treaties to BGBl. III (step 5 of `docs/research/umsetzungsplan-weitere-wege.md`):
 * the item kind and the treaty's kind, the exact Teil-III key, no 120-day
 * rule, the page's words and the list's option.
 *
 * The records are cut from the detail JSON of 119 d.B. (a Staatsvertrag,
 * BGBl. III Nr. 66/2026) and 388 d.B. XXVIII (an Art.-15a-Vereinbarung,
 * BGBl. I Nr. 16/2026), read 14.11.2026 — only the keys these readers touch.
 */
import { describe, expect, it } from 'vitest'
import type { EnactmentInfo, VorlageDetail } from '../shared/types'
import { assembleVorlageDetail, pageKindOf, treatyKindOf, type VorlageContent } from '../server/utils/parliament/vorlageDetailAssembly'
import { pickBgblForTreaty, pickBgblIForItem } from '../server/utils/ris/bgblVorlage'
import type { BgblRecord } from '../server/utils/ris/bgblJoin'
import { promulgationOverdue, promulgationState } from '../shared/utils/promulgation'
import { mapItemRow } from '../server/utils/parliament/list101'
import { needsTreatyLink, resolveTreatyBgbl, treatyKindOfVhg, treatyRowOf, treatyStateOf, treatyYearsOfPeriod } from '../server/utils/parliament/staatsvertraege'
import { BGBL_AUTH_FROM } from '../server/utils/ris/skippedLaws'
import { laterStations, parliamentStandDe, procedureStatusDe, vorlageStatusDe } from '../app/utils/spine'
import { filingClosedDe, itemBylineDe, itemCiteAsDe, itemCopyDe } from '../app/utils/itemKind'
import { viewOfTreaty } from '../app/utils/entryView'
import { ART_CHOICES, artChoiceLabel, artChoiceOf, coherentArt, draftFiltersFromQuery, draftRowsOf, treatyGapNotes, treatyRowsOf, treatyStationOf } from '../app/utils/draftFilters'
import { WEGE, wegFor } from '../app/utils/wege'

const phase119 = [
  { name: 'Einlangen NR', stages: [{ date: '12.06.2025', text: 'Einlangen im Nationalrat' }, { date: '13.06.2025', text: 'Vorgesehen für den Ausschuss für Arbeit und Soziales' }] },
  { name: 'Plenarberatungen NR', stages: [{ date: '10.07.2025', text: '37. Sitzung des Nationalrates: Genehmigung' }, { date: '10.07.2025', text: 'Beschluss im Nationalrat <a href="/gegenstand/XXVIII/BNR/56">56/BNR</a>' }] },
]
const content119: VorlageContent = {
  doktyp: 'RVS',
  title: 'Abkommen zwischen der Republik Österreich und der Mongolei über soziale Sicherheit',
  description: 'Abkommen zwischen der Republik Österreich und der Mongolei über soziale Sicherheit',
  einlangen: '2025-06-12T00:00:00',
  names: [{ funktext: 'Mitglied der Bundesregierung', frak_code: null, ltext: 'Bundesministerium für europäische und internationale Angelegenheiten' }],
  phase: phase119,
}
const content388: VorlageContent = {
  ...content119,
  title: 'Vereinbarung zwischen dem Bund, den Ländern und den Gemeinden über einen Österreichischen Stabilitätspakt 2025 – ÖStP 2025',
  phase: [
    { name: 'Einlangen NR', stages: [{ date: '20.01.2026', text: 'Einlangen im Nationalrat' }, { date: '20.01.2026', text: 'Vereinbarung gemäß Artikel 15a B-VG' }] },
    ...phase119.slice(1),
  ],
}

function rec(overrides: Partial<BgblRecord>): BgblRecord {
  return {
    id: 'BGBLA_2026_III_66', teil: 'Teil3', nummer: 'BGBl. III Nr. 66/2026', datum: '2026-06-05', kurztitel: null, titel: null, stelle: null,
    gp: 'XXVIII', regierungsvorlagen: [119], initiativantraege: [], ausschussberichte: [173], typ: 'Sonstiges', datumNationalrat: '2025-07-10',
    ...overrides,
  }
}

function enactment(overrides: Partial<EnactmentInfo> = {}): EnactmentInfo {
  return {
    rvCitation: '119 d.B.', rvUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/I/119', rvTextUrl: null, rvDate: '2025-06-12', furtherRv: [],
    bgblNumber: null, bgblRisUrl: null, amendedIn: [], committeeReport: null, plenaryAmendments: null,
    houseStatus: '5', houseStatusText: 'Beschlossen im Bundesrat 56/BNR', vote: null, filingOpen: false, rvGpEnded: false,
    notPromulgated: null, successor: null, decidedAt: '2025-07-10', bundesratDecidedAt: '2025-07-17', treaty: 'staatsvertrag',
    ...overrides,
  }
}

function treatyDetail(e: EnactmentInfo, content: VorlageContent = content119, inr = 119): VorlageDetail {
  return assembleVorlageDetail({ root: { gp: 'XXVIII', ityp: 'I', inr }, content, enactment: e, currentGp: 'XXVIII', withoutBegutachtung: false })
}

describe('the item kind and the treaty kind', () => {
  it('reads a treaty off the document type, its kind off the Verlauf — never the title', () => {
    expect(pageKindOf('I', 'RVS')).toBe('staatsvertrag')
    expect(treatyKindOf(content119)).toBe('staatsvertrag')
    expect(treatyKindOf(content388)).toBe('vereinbarung-15a')
    expect(treatyKindOf({ ...content119, doktyp: 'RV' })).toBeNull()
    // „Einspruch der Republik Österreich gegen …" is a treaty's subject (1800 d.B. XXVII).
    expect(treatyKindOf({ ...content119, title: 'Einspruch der Republik Österreich gegen den Beitritt …' } as VorlageContent)).toBe('staatsvertrag')
    expect(treatyKindOfVhg('RVS15')).toBe('vereinbarung-15a')
    expect(treatyKindOfVhg('RVS')).toBe('staatsvertrag')
  })

  it('assembles the page: the ministry, no Stellungnahmen, the kind words', () => {
    const d = treatyDetail(enactment())
    expect(d.itemKind).toBe('staatsvertrag')
    expect(d.treatyKind).toBe('staatsvertrag')
    expect(d.filing).toEqual({ possible: false, reason: 'treaty' })
    expect(itemBylineDe(d)).toBe('Eingebracht von der Bundesregierung, Bundesministerium für europäische und internationale Angelegenheiten')
    expect(itemCiteAsDe(d)).toBe('RV 119 BlgNR 28. GP')
    expect(itemCopyDe(d).word).toBe('Staatsvertrag')
    expect(filingClosedDe('treaty', d.treatyKind)).toBe('Zu Staatsverträgen nimmt das Parlament keine Stellungnahmen an.')
    const v = treatyDetail(enactment({ treaty: 'vereinbarung-15a' }), content388, 388)
    expect(itemCopyDe(v).word).toBe('Vereinbarung nach Art. 15a B-VG')
    expect(filingClosedDe('treaty', v.treatyKind)).toMatch(/^Zu Vereinbarungen nach Art\. 15a B-VG/)
  })

  it('redirects to the draft a treaty names, as a Regierungsvorlage does (331 d.B. XXVI → 79/ME)', () => {
    const d = treatyDetail(enactment(), { ...content388, preconst: [{ ityp: 'ME', gp_code: 'XXVI', inr: 79 }] })
    expect(d.draftPath).toBe('/entwuerfe/XXVI/79')
  })
})

describe('the Kundmachung by the exact key, in Teil III and Teil I', () => {
  it('matches period and Vorlage on a Teil-III record, which the law join never reads', () => {
    const records = [rec({})]
    expect(pickBgblForTreaty(records, 'XXVIII', 119)?.nummer).toBe('BGBl. III Nr. 66/2026')
    expect(pickBgblIForItem(records, 'XXVIII', { ityp: 'I', inr: 119 })).toBeNull()
  })

  it('finds an Art.-15a-Vereinbarung in Teil I', () => {
    const records = [rec({ id: 'BGBLA_2026_I_16', teil: 'Teil1', nummer: 'BGBl. I Nr. 16/2026', regierungsvorlagen: [388] })]
    expect(pickBgblForTreaty(records, 'XXVIII', 388)?.nummer).toBe('BGBl. I Nr. 16/2026')
  })

  it('never joins by title, another period, Teil II, or a later record over the first', () => {
    const titleOnly = rec({ gp: null, regierungsvorlagen: [], kurztitel: 'Abkommen zwischen der Republik Österreich und der Mongolei über soziale Sicherheit' })
    expect(pickBgblForTreaty([titleOnly], 'XXVIII', 119)).toBeNull()
    expect(pickBgblForTreaty([rec({ gp: 'XXVII' })], 'XXVIII', 119)).toBeNull()
    expect(pickBgblForTreaty([rec({ teil: 'Teil2' })], 'XXVIII', 119)).toBeNull()
    const later = rec({ id: 'BGBLA_2026_III_90', nummer: 'BGBl. III Nr. 90/2026', datum: '2026-08-01' })
    expect(pickBgblForTreaty([later, rec({})], 'XXVIII', 119)?.nummer).toBe('BGBl. III Nr. 66/2026')
  })
})

describe("one rule for the Kundmachung: RIS's key first, Parliament's link where RIS has none", () => {
  const row = (inr: number, gp = 'XXVII') => mapItemRow([gp, 'I', String(inr), null, '01.01.2021', 'RVS', 'Vereinbarung …', `${inr} d.B.`, '20210101', '05', '5', 'RVS', 'N', 'Regierungsvorlage: Staatsvertrag', `/gegenstand/${gp}/I/${inr}`, null, null, 'RVS15'])
  const ris1041 = rec({ id: 'BGBLA_2021_I_193', teil: 'Teil1', nummer: 'BGBl. I Nr. 193/2021', datum: '2021-11-15', gp: 'XXVII', regierungsvorlagen: [1041] })
  const covid = rec({ id: 'BGBLA_2021_I_187', teil: 'Teil1', nummer: 'BGBl. I Nr. 187/2021', datum: '2021-10-28', gp: 'XXVII', regierungsvorlagen: [] })
  const link187 = { number: 'Bundesgesetzblatt I Nr. 187/2021', url: 'https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=BGBLA_2021_I_187' }

  it('where they disagree RIS wins, on the page and in the list alike (1041 d.B. XXVII)', () => {
    expect(resolveTreatyBgbl({ number: 'Bundesgesetzblatt I Nr. 193/2021', url: 'u', datum: '2021-11-15' }, link187))
      .toEqual({ number: 'Bundesgesetzblatt I Nr. 193/2021', url: 'u', date: '2021-11-15', source: 'ris' })
    const t = treatyRowOf(row(1041), [ris1041, covid], false, link187)
    expect(t.bgbl).toEqual({ number: 'BGBl. I Nr. 193/2021', date: '2021-11-15' })
    expect(needsTreatyLink(row(1041), [ris1041])).toBe(false)
  })

  it('where RIS has no record the link stands, with its date from the Jahrgänge (510 d.B. XXVI)', () => {
    const link = { number: 'Bundesgesetzblatt III Nr. 128/2019', url: 'https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BgblAuth&Dokumentnummer=BGBLA_2019_III_128' }
    expect(resolveTreatyBgbl(null, link)).toMatchObject({ number: link.number, date: null, source: 'parliament' })
    const unkeyed = rec({ id: 'BGBLA_2019_III_128', nummer: 'BGBl. III Nr. 128/2019', datum: '2019-06-20', gp: null, regierungsvorlagen: [] })
    expect(needsTreatyLink(row(510, 'XXVI'), [unkeyed])).toBe(true)
    const t = treatyRowOf(row(510, 'XXVI'), [unkeyed], false, link)
    expect(t.state).toBe('promulgated')
    expect(t.bgbl).toEqual({ number: link.number, date: '2019-06-20' })
    expect(viewOfTreaty(t).state).toMatchObject({ label: 'Kundgemacht', detail: 'BGBl. III Nr. 128/2019' })
    // Neither source: no Kundmachung, never a claim of one.
    expect(resolveTreatyBgbl(null, null)).toBeNull()
    expect(treatyRowOf(row(510, 'XXVI'), [unkeyed], false, null).state).toBe('unlisted')
  })

  it('unread Jahrgänge are no „RIS has no record": the link is neither read nor used (14.11.2026)', () => {
    const link = { number: 'Bundesgesetzblatt III Nr. 128/2019', url: 'https://www.ris.bka.gv.at/x' }
    expect(needsTreatyLink(row(510, 'XXVI'), null)).toBe(false)
    const t = treatyRowOf(row(510, 'XXVI'), null, false, link)
    expect(t.bgbl).toBeNull()
    expect(t.state).not.toBe('promulgated')
  })
})

describe('no 120-day rule for a treaty (decision 5)', () => {
  const long = { decidedAt: '2025-07-10', bundesratDecidedAt: '2025-07-17' }
  it('a law past the window is overdue, a treaty never', () => {
    expect(promulgationOverdue(long, null, '2026-06-01')).toBe(true)
    expect(promulgationOverdue({ ...long, treaty: 'staatsvertrag' }, null, '2026-06-01')).toBe(false)
    expect(promulgationOverdue({ ...long, treaty: 'vereinbarung-15a' }, null, '2026-06-01')).toBe(false)
    expect(promulgationState({ ...long, treaty: 'staatsvertrag', bgblNumber: null }, '2026-06-01')).toBeNull()
  })

  it('the page says „ausstehend" while the period runs, only a statement about the search after it', () => {
    const today = '2026-06-01'
    const running = treatyDetail(enactment())
    expect(vorlageStatusDe(running, today)).toBe('Genehmigt – Kundmachung ausstehend')
    const [parlament, bgbl] = laterStations({ enactment: running.enactment, textEvolution: [], gpEnded: false, active: false, antragPath: null }, today)
    expect(parlament.facts).toContain('genehmigt')
    expect(parlament.facts.join(' ')).not.toMatch(/beschlossen|kundgemacht/)
    expect(bgbl.facts).toEqual(['ausstehend'])
    expect(bgbl.state).toBe('open')

    const ended = treatyDetail(enactment({ rvGpEnded: true }))
    expect(vorlageStatusDe(ended, today)).toBe('Genehmigt – im RIS bisher nicht verzeichnet')
    const [, endedBgbl] = laterStations({ enactment: ended.enactment, textEvolution: [], gpEnded: true, active: false, antragPath: null }, today)
    expect(endedBgbl.facts).toEqual(['im RIS bisher nicht verzeichnet'])
  })

  it('„Kundgemacht", never „Gesetz geworden"; the Nationalrat approves, it decides no text', () => {
    const e = enactment({ bgblNumber: 'Bundesgesetzblatt III Nr. 66/2026' })
    const d = treatyDetail(e)
    expect(vorlageStatusDe(d)).toBe('Kundgemacht')
    expect(parliamentStandDe({ enactment: e, textEvolution: [] })).toBe('Der Nationalrat hat den Staatsvertrag genehmigt.')
    expect(parliamentStandDe({ enactment: enactment({ treaty: 'vereinbarung-15a' }), textEvolution: [] })).toBe('Der Nationalrat hat die Vereinbarung genehmigt.')
    expect(parliamentStandDe({ enactment: enactment({ houseStatus: '2', houseStatusText: null, decidedAt: null, bundesratDecidedAt: null }), textEvolution: [] }))
      .toBe('Der Staatsvertrag ist im Nationalrat in Behandlung.')
    // A draft whose Vorlage is a treaty (79/ME XXVI): its headline too.
    expect(procedureStatusDe({ enactment: e, textEvolution: [] } as never)).toBe('Kundgemacht')
  })
})

describe('the list option „Staatsverträge" (decision 3)', () => {
  it('stands outside „Alle Arten", with no group parameter, and holds no draft', () => {
    const f = draftFiltersFromQuery({ art: 'staatsvertraege' })
    expect(f.art).toBe('staatsvertraege')
    expect(artChoiceLabel(artChoiceOf(f.art, f.begutachtung))).toBe('Staatsverträge')
    expect(ART_CHOICES.find((c) => c.value === 'staatsvertraege')?.group).toBe('nationalrat')
    expect(coherentArt('staatsvertraege', 'ohne')).toBe('')
    expect(treatyRowsOf('staatsvertraege')).toBe(true)
    expect(treatyRowsOf('')).toBe(false)
    expect(draftRowsOf('staatsvertraege')).toEqual({ me: false, ris: false, laender: false })
  })

  it('states each row from its list row and RIS, never „Stellungnahme möglich"', () => {
    expect(treatyStateOf('5', { nummer: 'BGBl. III Nr. 66/2026' }, true)).toBe('promulgated')
    expect(treatyStateOf('5', null, true)).toBe('approved')
    expect(treatyStateOf('5', null, false)).toBe('unlisted')
    expect(treatyStateOf('2', null, true)).toBe('pending')
    expect(treatyStateOf('2', null, false)).toBe('lapsed')
    expect(treatyStationOf('pending')).toBe('rv')
    expect(treatyStationOf('promulgated')).toBe('bgbl')
    expect(treatyStationOf('unlisted')).toBe('parlament')

    const row = mapItemRow(['XXVIII', 'I', '388', null, '20.01.2026', 'RVS', 'Vereinbarung … ÖStP 2025', '388 d.B.', '20260120', '05', '5', 'RVS', 'N', 'Regierungsvorlage: Staatsvertrag', '/gegenstand/XXVIII/I/388', null, null, 'RVS15'])
    const t = treatyRowOf(row, [rec({ id: 'BGBLA_2026_I_16', teil: 'Teil1', nummer: 'BGBl. I Nr. 16/2026', datum: '2026-04-23', regierungsvorlagen: [388] })], true)
    expect(t).toMatchObject({ treatyKind: 'vereinbarung-15a', state: 'promulgated', bgbl: { number: 'BGBl. I Nr. 16/2026', date: '2026-04-23' } })
    const view = viewOfTreaty(t)
    expect(view.to).toBe('/entwuerfe/XXVIII/staatsvertrag/388')
    expect(view.kindLabel).toBe('Vereinbarung nach Art. 15a B-VG')
    expect(view.state.label).toBe('Kundgemacht')
    expect(view.state.actionable).toBe(false)
    const unread = viewOfTreaty(treatyRowOf(row, null, false))
    expect(unread.state.label).toBe('Genehmigt – im RIS bisher nicht verzeichnet')
  })

  it('/wege: the treaty row is followed and opens the option', () => {
    const w = WEGE.find((x) => x.id === 'staatsvertrag')!
    expect(w.notFollowed).toBeNull()
    expect(w.href).toBe('/entwuerfe?art=staatsvertraege')
    expect(wegFor({ source: 'vorlage', ityp: 'I', withoutBegutachtung: false, itemKind: 'staatsvertrag' })).toBe('staatsvertrag')
  })
})

describe('the Bundesgesetzblatt in RIS begins 2004 (15.11.2026)', () => {
  it('reads no Jahrgang before the source begins, and the later ones of every period', () => {
    // XXI ended 19.12.2002: its late Kundmachungen can still stand in 2004 and after.
    expect(treatyYearsOfPeriod('XXI', '2026-11-15')).toEqual(Array.from({ length: 23 }, (_, i) => 2004 + i))
    expect(treatyYearsOfPeriod('XXII', '2026-11-15')[0]).toBe(2004)
    expect(treatyYearsOfPeriod('XXVIII', '2026-11-15')).toEqual([2024, 2025, 2026])
    expect(treatyYearsOfPeriod('XIII', '2026-11-15')).toEqual([])
  })

  it('says what RIS cannot show for a period that began before it — never „gerade"', () => {
    const coversFrom = BGBL_AUTH_FROM
    const reach = 'Ob ein Staatsvertrag vor dem 01.01.2004 kundgemacht wurde, lässt sich im RIS nicht prüfen: Das Bundesgesetzblatt steht im RIS erst ab 2004.'
    expect(treatyGapNotes({ gp: 'XXI', coversFrom, bgblUnread: false })).toEqual([reach])
    expect(treatyGapNotes({ gp: 'XXII', coversFrom, bgblUnread: false })).toEqual([reach])
    expect(treatyGapNotes({ gp: 'XXII', coversFrom, bgblUnread: true })).toEqual([reach, 'Ob ein Staatsvertrag kundgemacht ist, ist gerade nicht abrufbar.'])
    expect(treatyGapNotes({ gp: 'XXIII', coversFrom, bgblUnread: false })).toEqual([])
    expect(treatyGapNotes({ gp: 'XXVIII', coversFrom, bgblUnread: true })).toEqual(['Ob ein Staatsvertrag kundgemacht ist, ist gerade nicht abrufbar.'])
    expect(treatyGapNotes(null)).toEqual([])
  })
})
