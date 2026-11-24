import { describe, expect, it } from 'vitest'
import { isRepealStub, kindKey, loadKey, matchArticle, misnumberedShown, noArticleFor, removalVerdict, repealNoteOf, scoredKey, unchangedClass } from '../scripts/harness/konsJudge'
import type { DraftArticle } from '../server/utils/lawtext/draftArticles'

// The BGBl bench's own bookkeeping (19.11.2026): what it got wrong is how a
// lost instruction line stayed invisible.

describe('scoredKey: a RIS label is scored under its own §', () => {
  it('„Art. 1 § 3" is § 3, not the Artikel (AlVG, BGBl. I Nr. 62/2026)', () => {
    expect(scoredKey('Art. 1 § 3')).toBe('3')
    expect(scoredKey('Art. 2 § 39b')).toBe('39b')
  })
  it('the plain labels keep their number', () => {
    expect(scoredKey('§ 5a')).toBe('5a')
    expect(scoredKey('Anl. 2')).toBe('2')
    expect(scoredKey('Art. 3')).toBe('3')
  })
})

describe('unchangedClass: why a § stood still', () => {
  const at = { refused: false, named: false, schedule: false, unkeyedSchedule: false }
  it('refused is the harmless class, and only refused is', () => {
    expect(unchangedClass({ ...at, refused: true, named: true })).toBe('verweigert')
    expect(unchangedClass({ ...at, named: true })).toBe('angewendet')
  })
  it('an Anlage counts as addressed only when the Novelle names a schedule RIS does not carry', () => {
    expect(unchangedClass({ ...at, schedule: true, unkeyedSchedule: true })).toBe('Anlage')
    expect(unchangedClass({ ...at, schedule: true })).toBe('ungenannt')
    expect(unchangedClass({ ...at, unkeyedSchedule: true })).toBe('ungenannt')
  })
  it('„§ 1" does not name „Anl. 1"', () => {
    expect(kindKey('§ 1', '1')).not.toBe(kindKey('Anl. 1', '1'))
    expect(kindKey('Anhang 1', '1')).toBe(kindKey('Anl. 1', '1'))
  })
})

const art = (index: number, title: string, organ: string | null, nummer = ''): DraftArticle => ({
  index,
  number: `Artikel ${index + 1}`,
  numeral: String(index + 1),
  title,
  key: title,
  amends: true,
  bgbl: organ ? { organ, nummer } : null,
  clause: null,
})

describe('matchArticle: the draft Artikel of the same law', () => {
  // ME of BGBl. I Nr. 39/2026: the Fremdenrechtspaket 100/2005 is the Stammnorm of three laws.
  const fremdenrecht = [
    art(0, 'Änderung des Asylgesetzes 2005', 'BGBl. I Nr.', '100/2005'),
    art(1, 'Änderung des BFA-Einrichtungsgesetzes', 'BGBl. Nr.', '87/2012'),
    art(4, 'Änderung des Fremdenpolizeigesetzes 2005', 'BGBl. I Nr.', '100/2005'),
    art(6, 'Änderung des Niederlassungs- und Aufenthaltsgesetzes', 'BGBl. I Nr.', '100/2005'),
  ]

  it('one Bundesgesetzblatt that created several laws is no tie: the heading decides among them', () => {
    const got = matchArticle(fremdenrecht, art(0, 'Änderung des Niederlassungs- und Aufenthaltsgesetzes', 'BGBl. I Nr.', '100/2005'))
    expect('reason' in got ? got.reason : got.title).toBe('Änderung des Niederlassungs- und Aufenthaltsgesetzes')
  })

  it('a missing Teil is no contradiction', () => {
    const got = matchArticle(fremdenrecht, art(2, 'Änderung des BFA-Einrichtungsgesetzes', 'BGBl. I Nr.', '87/2012'))
    expect('reason' in got ? got.reason : got.title).toBe('Änderung des BFA-Einrichtungsgesetzes')
  })

  it('a draft that does not carry the law says so', () => {
    const got = matchArticle(fremdenrecht, art(1, 'Änderung des Schulorganisationsgesetzes', 'BGBl. Nr.', '242/1962'))
    expect(got).toEqual({ reason: 'kein Artikel nennt das Gesetz, weder mit der Stammnorm noch im Titel' })
  })

  it('a shared Stammnorm with no clear heading stays refused', () => {
    const got = matchArticle(fremdenrecht, art(0, 'Änderung des Bundesgesetzes über die Gewährung von Asyl', 'BGBl. I Nr.', '100/2005'))
    expect(got).toEqual({ reason: '3 Artikel zitieren die Stammnorm, kein Titel passt eindeutig' })
  })
})

describe('noArticleFor: a draft Artikel that became law in no Bundesgesetzblatt (24.11.2026)', () => {
  // 11/ME XXVIII: BGBl. I Nr. 45/2025 enacted the StGB alone, the StPO and the ZPO of the draft went nowhere.
  const bgbl45 = [art(0, 'Änderung des Strafgesetzbuches', 'BGBl. Nr.', '60/1974')]

  it('holds where no Artikel cites the Stammnorm and no heading fits', () => {
    expect(noArticleFor(bgbl45, art(2, 'Änderung der Strafprozeßordnung 1975', 'BGBl. Nr.', '631/1975'))).toBe(true)
    expect(noArticleFor([], art(2, 'Änderung der Strafprozeßordnung 1975', 'BGBl. Nr.', '631/1975'))).toBe(true)
  })

  it('does not hold for the law the Bundesgesetzblatt does carry', () => {
    expect(noArticleFor(bgbl45, art(0, 'Änderung des Strafgesetzbuches', 'BGBl. Nr.', '60/1974'))).toBe(false)
  })

  it('takes a tie on the Stammnorm for no proof of absence', () => {
    const fremdenrecht = [art(0, 'Änderung des Asylgesetzes 2005', 'BGBl. I Nr.', '100/2005'), art(4, 'Änderung des Fremdenpolizeigesetzes 2005', 'BGBl. I Nr.', '100/2005')]
    expect(noArticleFor(fremdenrecht, art(0, 'Änderung des Bundesgesetzes über die Gewährung von Asyl', 'BGBl. I Nr.', '100/2005'))).toBe(false)
  })
})

describe('loadKey', () => {
  // 19.11.2026: folded alone, „Anhang VIII" was „Anl. VIII", a label RIS
  // never carries — the ME bench and the fault injection loaded no Roman schedule.
  it('meets RIS’s label for a Roman Anhang, and leaves the rest as anlageLabelKey', () => {
    expect(loadKey('Anhang VIII')).toBe(loadKey('Anl. 8'))
    expect(loadKey('Anlage 2')).toBe('Anl. 2')
    expect(loadKey('Anhang')).toBe('Anl.')
    expect(loadKey('§ 8')).toBe('§ 8')
    expect(loadKey('Art. 2 § 3')).toBe('Art. 2 § 3')
  })
})

// The designations as the page shows them (`markerSequence`): a confirmed §
// under the wrong „(2)", „3." or „b)" would be shown as the law, and so
// would a § the second witness releases (audit of 20.11.2026). The bench
// printed the line „muss 0 sein" and exited 0 either way.
describe('misnumberedShown: the §§ the bench fails on for their designations', () => {
  it('counts a confirmed § and a witness-shown § whose designations differ', () => {
    expect(misnumberedShown({ 'abweichend|bestätigt|plausibel|—': 1 })).toBe(1)
    expect(misnumberedShown({ 'abweichend|bestätigt|unplausibel|—': 1 })).toBe(1)
    expect(misnumberedShown({ 'abweichend|widersprochen|plausibel|gezeigt': 2 })).toBe(2)
  })
  it('does not count a withheld § or one whose designations are the law', () => {
    // LMSVG § 28 of BGBl. I Nr. 75/2026: misnumbered, contradicted, not released.
    expect(misnumberedShown({ 'abweichend|widersprochen|plausibel|—': 1, 'abweichend|stumm|unplausibel|—': 2 })).toBe(0)
    expect(misnumberedShown({ 'gleich|bestätigt|plausibel|—': 459, 'gleich|widersprochen|plausibel|gezeigt': 152 })).toBe(0)
  })
})

// A § the engine took out of the law had no node, and the bench skipped it
// before any tally: a wrong repeal and a right one were both invisible
// (audit of 20.11.2026).
describe('removalVerdict: whether RIS repealed a § the engine took out', () => {
  const bgbl = 'BGBl. I Nr. 62/2026'
  it('confirms it where RIS says the § was repealed by this Bundesgesetzblatt, even with a version of it in between (GSVG § 27f)', () => {
    expect(removalVerdict(null, 'BGBl. Nr. 560/1978 aufgehoben durch BGBl. I Nr. 62/2026', bgbl)).toBe('confirmed')
    expect(removalVerdict(['Beitragsgrundlage … (2) Neu gefasst …'], 'BGBl. Nr. 560/1978 aufgehoben durch BGBl. I Nr. 62/2026', bgbl)).toBe('confirmed')
  })
  it('calls it wrong where RIS keeps the § or another Bundesgesetzblatt repealed it', () => {
    expect(removalVerdict(null, 'BGBl. Nr. 560/1978 zuletzt geändert durch BGBl. I Nr. 81/2022', bgbl)).toBe('wrong')
    expect(removalVerdict(null, 'BGBl. Nr. 560/1978 aufgehoben durch BGBl. I Nr. 7/2027', bgbl)).toBe('wrong')
    expect(removalVerdict(null, null, bgbl)).toBe('wrong')
  })
  it('holds a version this Novelle made of the § to a repeal note, and calls an unreadable one unverifiable', () => {
    expect(removalVerdict(['Aufgehoben.'], 'BGBl. I Nr. 1/2020 zuletzt geändert durch BGBl. I Nr. 62/2026', bgbl)).toBe('confirmed')
    expect(removalVerdict(['Der Antrag ist schriftlich einzubringen.'], 'BGBl. I Nr. 1/2020 zuletzt geändert durch BGBl. I Nr. 62/2026', bgbl)).toBe('wrong')
    expect(removalVerdict([null], 'BGBl. I Nr. 1/2020 zuletzt geändert durch BGBl. I Nr. 62/2026', bgbl)).toBe('unverifiable')
  })
  // BMSVG § 26a, BGBl. I Nr. 88/2026: repealed, and RIS keeps the heading with a note.
  it('confirms a stub that names this Bundesgesetzblatt, and nothing that only resembles one', () => {
    const organ = 'BGBl. I Nr. 100/2002 zuletzt geändert durch BGBl. I Nr. 119/2024'
    const n88 = 'BGBl. I Nr. 88/2026'
    expect(removalVerdict(['Risikomanagement (Anm.: § 26a aufgehoben durch Art. 8 Z 24, BGBl. I Nr. 88/2026)'], organ, n88)).toBe('confirmed')
    expect(removalVerdict(['Risikomanagement (Anm.: § 26a aufgehoben durch Art. 8 Z 24, BGBl. I Nr. 8/2026)'], organ, n88)).toBe('wrong')
    expect(removalVerdict(['Risikomanagement (1) Die Kasse hat vorzusorgen. (Anm.: Abs. 2 aufgehoben durch BGBl. I Nr. 88/2026)'], organ, n88)).toBe('wrong')
    expect(isRepealStub('Die Kasse hat vorzusorgen. (Anm.: Abs. 2 aufgehoben durch BGBl. I Nr. 88/2026)', n88)).toBe(false)
  })
  it('reads the repeal note out of a version\'s XML, which the § tree does not carry', () => {
    const xml = '<absatz><ueberschrift>Risikomanagement</ueberschrift></absatz><absatz typ="erltext">(<i>Anm.:</i> § 26a aufgehoben durch Art. 8 Z 24,&#xA0;BGBl. I Nr. 88/2026)</absatz>'
    const note = repealNoteOf(xml)
    expect(note).toBe('(Anm.: § 26a aufgehoben durch Art. 8 Z 24, BGBl. I Nr. 88/2026)')
    expect(isRepealStub(`Risikomanagement ${note}`, 'BGBl. I Nr. 88/2026')).toBe(true)
    expect(repealNoteOf('<absatz>Die Kasse hat vorzusorgen.</absatz>')).toBeNull()
  })
})
