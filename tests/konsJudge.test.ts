import { describe, expect, it } from 'vitest'
import { kindKey, loadKey, matchArticle, scoredKey, unchangedClass } from '../scripts/harness/konsJudge'
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
