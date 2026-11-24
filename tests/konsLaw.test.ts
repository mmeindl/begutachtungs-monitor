import { describe, expect, it } from 'vitest'
import { bridgeVersionGap, longTitleOf, oneCharApart, pickByEqualName, pickByName, promulgatedBeforeInForce, soleUnlessContradicted, standingOnDay, type KonsLawAtDate, type KonsParagraphRef, type KonsVersion } from '../server/utils/ris/konsLaw'

/**
 * Which law of a Bundesgesetzblatt a caller meant.
 *
 * One BGBl regularly creates several laws — 532/1993 the Bankwesengesetz and
 * the Bausparkassengesetz, 663/1994 the Umsatzsteuergesetz and its
 * Binnenmarkt-Anhang — and the Stammnorm pair cannot separate them. The
 * Artikel heading can, and `paraTitleService` and `amendedLawsService` passed
 * the empty string instead until 19.09.2026, so every § of an ambiguous BGBl
 * went out without a name and without a RIS link.
 */
const laws = (...titles: string[]) => new Map(titles.map((t, i) => [`nr${i}`, { kurztitel: t }]))

describe('pickByName', () => {
  it('picks the law the Artikel heading names', () => {
    const m = laws('Bankwesengesetz', 'Bausparkassengesetz')
    expect(pickByName(m, 'Änderung des Bankwesengesetzes')?.[1].kurztitel).toBe('Bankwesengesetz')
    expect(pickByName(m, 'Änderung des Bausparkassengesetzes')?.[1].kurztitel).toBe('Bausparkassengesetz')
  })

  it('reads the genitive the draft writes', () => {
    // "Änderung des Glücksspielgesetzes" must find "Glücksspielgesetz";
    // "Änderung" and "des" are stopwords, the stem carries the match.
    expect(pickByName(laws('Glücksspielgesetz', 'Tabakgesetz'), 'Änderung des Glücksspielgesetzes')?.[1].kurztitel).toBe('Glücksspielgesetz')
  })

  it('refuses a tie rather than taking whichever came first', () => {
    expect(pickByName(laws('Umsatzsteuergesetz 1994', 'Umsatzsteuergesetz 1994'), 'Änderung des Umsatzsteuergesetzes 1994')).toBeNull()
  })

  it('refuses when nothing fits clearly enough', () => {
    expect(pickByName(laws('Bankwesengesetz', 'Bausparkassengesetz'), 'Änderung des Tabakgesetzes')).toBeNull()
  })

  it('refuses an Artikel that carries only a number', () => {
    // `articleBlocks` keys such an Artikel by its number; scoring it would be
    // scoring an empty token set, and the answer must stay a refusal.
    expect(pickByName(laws('Bankwesengesetz', 'Bausparkassengesetz'), 'Artikel 3')).toBeNull()
    expect(pickByName(laws('Bankwesengesetz', 'Bausparkassengesetz'), '')).toBeNull()
  })

  it('separates a law from its own annex, which is a near-namesake', () => {
    const m = laws('Umsatzsteuergesetz 1994', 'Umsatzsteuergesetz 1994 - Anhang (Binnenmarkt)')
    expect(pickByName(m, 'Änderung des Umsatzsteuergesetzes 1994')?.[1].kurztitel).toBe('Umsatzsteuergesetz 1994')
  })
})

describe('pickByEqualName — equality where the score cannot decide (20.11.2026)', () => {
  // BGBl. Nr. 311/1985 created both, and both are „StbG" (152/ME XXVIII).
  const stbg = new Map([
    ['10005579', { kurztitel: 'Staatsbürgerschaftsgesetz 1985', abkuerzung: 'StbG' }],
    ['10005577', { kurztitel: 'Staatsbürgerschafts-Übergangsrecht 1985', abkuerzung: 'StbG' }],
  ])
  it('takes the law whose Kurztitel is the name, its year aside', () => {
    expect(pickByName(stbg, 'Staatsbürgerschaftsgesetz')).toBeNull()
    expect(pickByEqualName(stbg, 'Staatsbürgerschaftsgesetz')?.[0]).toBe('10005579')
    expect(pickByEqualName(stbg, 'Staatsbürgerschaftsgesetz 1985')?.[0]).toBe('10005579')
  })
  it('refuses a name two laws carry, and a name that is only near', () => {
    expect(pickByEqualName(stbg, 'StbG')).toBeNull()
    expect(pickByEqualName(stbg, 'Änderung des Staatsbürgerschaftsgesetzes')).toBeNull()
    expect(pickByEqualName(stbg, '')).toBeNull()
  })
})

describe('soleUnlessContradicted — a sole law needs no rival, only no contradiction (03.10.2026)', () => {
  const law = (kurztitel: string, abkuerzung = ''): [string, { kurztitel: string; abkuerzung: string }] => ['1', { kurztitel, abkuerzung }]
  it('refuses the wrong law a mistyped Stammnorm finds (58/ME XXVIII: 10/2013 is the BVwGG)', () => {
    expect(soleUnlessContradicted(law('Bundesverwaltungsgerichtsgesetz', 'BVwGG'), 'Änderung des Bundesvergabegesetzes Verteidigung und Sicherheit 2012')).toBeNull()
  })
  it('keeps a noisy but compatible title, and one that only the Abkürzung carries', () => {
    expect(soleUnlessContradicted(law('Versorgungssicherungsgesetz'), 'Änderung des Versorgungssicherungsgesetzes')).not.toBeNull()
    expect(soleUnlessContradicted(law('Einrichtung und Betrieb einer Abbaumanagementgesellschaft des Bundes', 'ABBAG-Gesetz'), 'Änderung des ABBAG-Gesetzes')).not.toBeNull()
  })
  it('keeps the right law whose name the draft paraphrases (22/ME XXVIII)', () => {
    expect(soleUnlessContradicted(law('Zivildienstgesetz 1986', 'ZDG'), 'Änderung des Bundesgesetzes über den Zivildienst')).not.toBeNull()
  })
  it('takes it without a name to hold against', () => {
    expect(soleUnlessContradicted(law('Bundesverwaltungsgerichtsgesetz'), null)).not.toBeNull()
  })
  it('keeps the law a clause names by its long title, word for word only (BGBl. I Nr. 16/2025)', () => {
    const orf: [string, { kurztitel: string; abkuerzung: string; langtitel: string }] = ['10000785', { kurztitel: 'ORF-Gesetz', abkuerzung: 'ORF-G', langtitel: 'Bundesgesetz über den Österreichischen Rundfunk' }]
    expect(soleUnlessContradicted(orf, 'Bundesgesetz über den Österreichischen Rundfunk')).not.toBeNull()
    expect(soleUnlessContradicted(orf, '16. Bundesgesetz, mit dem das Bundesgesetz über den Österreichischen Rundfunk geändert wird')).toBeNull()
    expect(soleUnlessContradicted(['1', { ...orf[1], langtitel: '' }], 'Bundesgesetz über den Österreichischen Rundfunk')).toBeNull()
  })
})

describe('longTitleOf — the long title out of RIS Titel (24.11.2026)', () => {
  it('drops the short forms in parentheses and the Stammfassung line', () => {
    expect(longTitleOf('Bundesgesetz über den Österreichischen Rundfunk (ORF-Gesetz, ORF-G)<br/>StF: BGBl. Nr. 379/1984 (WV) idF BGBl. Nr. 612/1986 (DFB)')).toBe('Bundesgesetz über den Österreichischen Rundfunk')
  })
  it('keeps a title that is its own short title, and reads nothing else', () => {
    expect(longTitleOf('Einkommensteuergesetz 1988<br/>StF: BGBl. Nr. 400/1988')).toBe('Einkommensteuergesetz 1988')
    expect(longTitleOf(undefined)).toBe('')
  })
})

describe('bridgeVersionGap — a hole in RIS with one signature (03.10.2026)', () => {
  const v = (nor: string, from: string, to: string | null, novelle: string | null, kundmachung = 'BGBl. I Nr. 19/2016'): KonsVersion => ({
    ref: { nor, label: '§ 1', id: '1', inkrafttreten: from, ausserkrafttreten: to, kundmachungsorgan: null, stammnorm: null, gesetzesnummer: '20009507', xmlUrl: null },
    novelle,
    kundmachung,
  })
  // Kulturgüterrückgabegesetz § 1, as RIS holds it: the old version ends a
  // year early, the new one starts by an amendment of 2026.
  const old = v('OLD', '2016-04-14', '2025-03-24', null)
  const next = v('NEW', '2026-03-25', null, '10/2026', 'BGBl. I Nr. 19/2016 zuletzt geändert durch BGBl. I Nr. 10/2026')

  it('takes the earlier version for a Stichtag in the hole (34/ME XXVIII, 2025-07-22)', () => {
    expect(bridgeVersionGap([old, next], '2025-07-22')?.nor).toBe('OLD')
  })
  it('bridges nothing when an amendment of the same year could have ended it', () => {
    expect(bridgeVersionGap([old, v('NEW', '2026-03-25', null, '10/2025')], '2025-07-22')).toBeNull()
  })
  it('never bridges a repeal', () => {
    expect(bridgeVersionGap([old, v('REP', '2026-03-25', null, '10/2026', 'BGBl. I Nr. 19/2016 aufgehoben durch BGBl. I Nr. 10/2026')], '2025-07-22')).toBeNull()
    expect(bridgeVersionGap([v('REP', '2016-04-14', '2025-03-24', '5/2016', 'BGBl. … aufgehoben durch BGBl. I Nr. 5/2016'), next], '2025-07-22')).toBeNull()
  })
  it('needs both sides, and no version covering the date', () => {
    expect(bridgeVersionGap([old], '2025-07-22')).toBeNull()
    expect(bridgeVersionGap([next], '2025-07-22')).toBeNull()
    expect(bridgeVersionGap([old, v('MID', '2025-03-25', null, null), next], '2025-07-22')).toBeNull()
  })
})

describe('promulgatedBeforeInForce — law on paper, not yet in force (04.10.2026)', () => {
  const v = (nor: string, from: string, to: string | null, novelle: string | null, kundmachung = 'BGBl. I Nr. 169/1998 zuletzt geändert durch BGBl. I Nr. 21/2024'): KonsVersion => ({
    ref: { nor, label: '§ 260', id: '260', inkrafttreten: from, ausserkrafttreten: to, kundmachungsorgan: null, stammnorm: null, gesetzesnummer: '10011138', xmlUrl: null },
    novelle,
    kundmachung,
  })
  // ÄrzteG § 260 as RIS holds it: brought by BGBl. I Nr. 21/2024, in force from 2026-06-01.
  const first = v('FIRST', '2026-06-01', '2026-07-29', '21/2024')
  const later = v('LATER', '2026-07-30', null, '65/2026')

  it('takes the promulgated version for a Stichtag before it applies (95/ME XXVIII, 2026-04-10)', () => {
    expect(promulgatedBeforeInForce([later, first], '2026-04-10')?.nor).toBe('FIRST')
  })
  it('does not date a BGBl of the Stichtag\'s own year', () => {
    expect(promulgatedBeforeInForce([v('SAME', '2026-06-01', null, '21/2026')], '2026-04-10')).toBeNull()
  })
  it('stays out where any version began before the date', () => {
    expect(promulgatedBeforeInForce([v('OLD', '2020-01-01', '2025-12-31', null), first], '2026-04-10')).toBeNull()
  })
  it('never takes a repeal', () => {
    expect(promulgatedBeforeInForce([v('REP', '2026-06-01', null, '21/2024', 'BGBl. … aufgehoben durch BGBl. I Nr. 21/2024')], '2026-04-10')).toBeNull()
  })
})

describe('oneCharApart — the misquote misquotedStammnorm accepts (04.10.2026)', () => {
  it('takes a single mistyped digit (58/ME, 108/ME XXVIII)', () => {
    expect(oneCharApart('10/2013', '10/2012')).toBe(true)
    expect(oneCharApart('6/2015', '6/2025')).toBe(true)
  })
  it('refuses a re-enacted law, an equal number and a different length (30/ME WPFG)', () => {
    expect(oneCharApart('135/2013', '237/2022')).toBe(false)
    expect(oneCharApart('10/2012', '10/2012')).toBe(false)
    expect(oneCharApart('10/2012', '100/2012')).toBe(false)
  })
})

describe('standingOnDay — a version promulgated after the reference date did not stand on it (20.11.2026)', () => {
  const ref = (nor: string, label: string, from: string, to: string | null, by: string | null): KonsParagraphRef => ({
    nor,
    label,
    id: label.replace(/^§\s*/, ''),
    inkrafttreten: from,
    ausserkrafttreten: to,
    kundmachungsorgan: by ? `BGBl. Nr. 376/1967 zuletzt geändert durch ${by}` : 'BGBl. Nr. 376/1967',
    stammnorm: null,
    gesetzesnummer: '10008220',
    xmlUrl: null,
  })
  const version = (r: KonsParagraphRef): KonsVersion => ({ ref: r, novelle: null, kundmachung: r.kundmachungsorgan ?? '' })
  const lawOf = (...refs: KonsParagraphRef[]): KonsLawAtDate => ({ gesetzesnummer: '10008220', kurztitel: 'FLAG', paragraphs: Object.fromEntries(refs.map((r) => [r.label, r])) })
  const issued: Record<string, string> = {
    'BGBl. I Nr. 64/2025': '2025-10-31',
    'BGBl. I Nr. 84/2026': '2026-10-16',
    'BGBl. I Nr. 98/2024': '2024-07-18',
    'BGBl. I Nr. 50/2025': '2025-07-24',
    'BGBl. I Nr. 12/2026': '2026-03-01',
  }
  const sources = (history: KonsVersion[] | null) => ({ issued: async (c: string) => issued[c] ?? null, history: async () => history })

  // FLAG § 3 as RIS holds it: BGBl. I Nr. 84/2026, issued 16.10.2026, gives
  // it a version from 12.06.2026, the first day of 117/ME XXVIII's
  // Begutachtung; the annex quotes the version of BGBl. I Nr. 64/2025.
  const prior = ref('PRIOR', '§ 3', '2025-11-01', '2026-06-11', 'BGBl. I Nr. 64/2025')
  const retro = ref('RETRO', '§ 3', '2026-06-12', '2026-06-29', 'BGBl. I Nr. 84/2026')
  const flag = [version(ref('OLD', '§ 3', '2022-03-12', '2025-10-31', 'BGBl. I Nr. 135/2022')), version(prior), version(retro), version(ref('LATER', '§ 3', '2026-06-30', '2026-06-11', 'BGBl. I Nr. 64/2025'))]

  it('takes the version that ran up to the day the later-promulgated one begins (117/ME XXVIII, FLAG § 3)', async () => {
    const out = await standingOnDay(lawOf(retro), '2026-06-12', sources(flag))
    expect(out.paragraphs['§ 3']?.nor).toBe('PRIOR')
  })

  it('takes a version RIS closed before it began, where the later one began on its day (20/ME XXVIII, BBG § 10)', async () => {
    const cancelled = ref('CANCELLED', '§ 10', '2024-07-19', '2024-07-18', 'BGBl. I Nr. 98/2024')
    const over = ref('OVER', '§ 10', '2024-07-19', null, 'BGBl. I Nr. 50/2025')
    const before = ref('BEFORE', '§ 10', '2020-01-01', '2024-07-18', 'BGBl. I Nr. 100/2018')
    const out = await standingOnDay(lawOf(over), '2025-05-07', sources([before, cancelled, over].map(version)))
    expect(out.paragraphs['§ 10']?.nor).toBe('CANCELLED')
  })

  it('leaves a version alone whose BGBl was issued by the day, and reads no history then', async () => {
    const law = lawOf(retro, ref('S4', '§ 4', '2026-03-02', null, 'BGBl. I Nr. 12/2026'))
    let asked = false
    const out = await standingOnDay(law, '2026-10-20', { issued: async (c) => issued[c] ?? null, history: async () => ((asked = true), flag) })
    expect(out).toBe(law)
    expect(asked).toBe(false)
  })

  it('keeps RIS\'s answer where it cannot decide: an unknown issue date, no history, no exact predecessor', async () => {
    const unknown = ref('UNK', '§ 3', '2026-06-12', null, 'BGBl. I Nr. 99/2026')
    expect((await standingOnDay(lawOf(unknown), '2026-06-12', sources(flag))).paragraphs['§ 3']?.nor).toBe('UNK')
    expect((await standingOnDay(lawOf(retro), '2026-06-12', sources(null))).paragraphs['§ 3']?.nor).toBe('RETRO')
    const gap = [version(ref('GAP', '§ 3', '2025-11-01', '2026-05-30', 'BGBl. I Nr. 64/2025')), version(retro)]
    expect((await standingOnDay(lawOf(retro), '2026-06-12', sources(gap))).paragraphs['§ 3']?.nor).toBe('RETRO')
  })

  it('without a readable history, takes the law on the day before — only a version that ended on that day (33/ME XXVIII, ABGB § 1159)', async () => {
    const lawOn = async (day: string) => (day === '2026-06-11' ? lawOf(prior) : null)
    expect((await standingOnDay(lawOf(retro), '2026-06-12', { ...sources(null), lawOn })).paragraphs['§ 3']?.nor).toBe('PRIOR')
    const stillRunning = ref('RUNNING', '§ 3', '2025-11-01', null, 'BGBl. I Nr. 64/2025')
    const other = async () => lawOf(stillRunning)
    expect((await standingOnDay(lawOf(retro), '2026-06-12', { ...sources(null), lawOn: other })).paragraphs['§ 3']?.nor).toBe('RETRO')
  })

  it('names the § it replaced, with the later BGBl and its issue date, so the page can say it (117/ME XXVIII, FLAG § 3)', async () => {
    const out = await standingOnDay(lawOf(retro, ref('S4', '§ 4', '2025-01-01', null, 'BGBl. I Nr. 12/2026')), '2026-06-12', sources(flag))
    expect(out.superseded).toEqual({ '§ 3': { cite: 'BGBl. I Nr. 84/2026', issued: '2026-10-16' } })
  })

  it('asks the issue date of a BGBl of a later year, which the replacement itself never needs (23/ME XXVIII)', async () => {
    const late = ref('LATE', '§ 3', '2025-11-01', null, 'BGBl. I Nr. 84/2026')
    const before = ref('BEFORE', '§ 3', '2022-03-12', '2025-10-31', 'BGBl. I Nr. 135/2022')
    const asked: string[] = []
    const out = await standingOnDay(lawOf(late), '2025-12-01', { issued: async (c) => (asked.push(c), issued[c] ?? null), history: async () => [version(before), version(late)] })
    expect(out.paragraphs['§ 3']?.nor).toBe('BEFORE')
    expect(out.superseded).toEqual({ '§ 3': { cite: 'BGBl. I Nr. 84/2026', issued: '2026-10-16' } })
    expect(asked).toEqual(['BGBl. I Nr. 84/2026'])
  })

  it('keeps the replacement where the issue date cannot be read, and names the BGBl without it', async () => {
    const late = ref('LATE', '§ 3', '2025-11-01', null, 'BGBl. I Nr. 84/2026')
    const before = ref('BEFORE', '§ 3', '2022-03-12', '2025-10-31', 'BGBl. I Nr. 135/2022')
    const out = await standingOnDay(lawOf(late), '2025-12-01', { issued: async () => { throw new Error('RIS down') }, history: async () => [version(before), version(late)] })
    expect(out.paragraphs['§ 3']?.nor).toBe('BEFORE')
    expect(out.superseded).toEqual({ '§ 3': { cite: 'BGBl. I Nr. 84/2026', issued: null } })
  })

  it('names nothing where it kept RIS\'s answer', async () => {
    expect((await standingOnDay(lawOf(retro), '2026-06-12', sources(null))).superseded).toBeUndefined()
    const gap = [version(ref('GAP', '§ 3', '2025-11-01', '2026-05-30', 'BGBl. I Nr. 64/2025')), version(retro)]
    expect((await standingOnDay(lawOf(retro), '2026-06-12', sources(gap))).superseded).toBeUndefined()
    expect((await standingOnDay(lawOf(retro), '2026-10-20', sources(flag))).superseded).toBeUndefined()
  })

  it('never takes a repeal, nor a predecessor promulgated after the day itself', async () => {
    const repealed = ref('REP', '§ 3', '2025-11-01', '2026-06-11', null)
    repealed.kundmachungsorgan = 'BGBl. Nr. 376/1967 aufgehoben durch BGBl. I Nr. 64/2025'
    expect((await standingOnDay(lawOf(retro), '2026-06-12', sources([version(repealed), version(retro)]))).paragraphs['§ 3']?.nor).toBe('RETRO')
    const alsoLate = ref('LATE2', '§ 3', '2025-11-01', '2026-06-11', 'BGBl. I Nr. 84/2026')
    expect((await standingOnDay(lawOf(retro), '2026-06-12', sources([version(alsoLate), version(retro)]))).paragraphs['§ 3']?.nor).toBe('RETRO')
  })
})
