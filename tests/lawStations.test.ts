import { describe, expect, it } from 'vitest'
import type { LawStationId } from '../shared/types'
import {
  DEFAULT_LAW_STATION_PAIR,
  LAW_STATION_LABEL,
  LAW_STATION_ORDER,
  defaultFromFor,
  isLawStationId,
  isLawStationPair,
  isLicensedPair,
  lawStationOf,
  lawStationPairHint,
  lawStationPairQuestion,
  meTextTitleRank,
} from '../shared/utils/lawStations'

/**
 * The station vocabulary of the § comparison (docs/architecture.md §12.18).
 *
 * Measured over GP XXVI–XXVIII (651 Ministerialentwürfe,
 * scripts/corpus/stationen.ts). What earns tests here is the whitelist: the
 * titles are upstream free text, and two of the documents that share the
 * station list are not versions of the law text at all.
 */

const ALL = LAW_STATION_ORDER

describe('vocabulary', () => {
  it('names every station and orders them by the procedure', () => {
    for (const id of ALL) expect(LAW_STATION_LABEL[id]).toBeTruthy()
    expect([...ALL]).toEqual(['me', 'rv', 'ausschuss', 'plenum', 'bgbl'])
  })

  it('labels the version, not the event upstream names', () => {
    // "Geändert im Ausschuss" is a happening; a selector picks a thing.
    expect(LAW_STATION_LABEL.ausschuss).toBe('Ausschussfassung')
    expect(LAW_STATION_LABEL.plenum).toBe('Plenarfassung')
  })

  it('defaults to the comparison this product is about', () => {
    expect(DEFAULT_LAW_STATION_PAIR).toEqual({ from: 'me', to: 'rv' })
  })

  it('accepts only its own ids', () => {
    // TWO VOCABULARIES, two shared names — and that has been deliberate
    // since 19.09.2026. `app/utils/spine.ts` carries the PROCEDURAL stations
    // (begutachtung|rv|parlament|bgbl, the `?station=` filter), this module
    // the TEXT versions (`?von=`/`?bis=`). `rv` always stood in both; `bgbl`
    // now stands in both as well, because both exist: the station reached
    // and the promulgated text. What does NOT overlap stays the boundary
    // here — „begutachtung" and „parlament" are not text versions.
    for (const id of ALL) expect(isLawStationId(id)).toBe(true)
    for (const other of ['begutachtung', 'parlament', 'ME', '', null, 3]) {
      expect(isLawStationId(other)).toBe(false)
    }
  })

  it('refuses the one pair that no actor stands behind', () => {
    // Between the Plenum version and the Kundmachung nobody changes anything
    // any more; the pair would be systematically empty (§12.33).
    expect(isLawStationPair('plenum', 'bgbl')).toBe(false)
    expect(isLawStationPair('me', 'bgbl')).toBe(true)
    expect(isLawStationPair('rv', 'bgbl')).toBe(true)
    expect(isLawStationPair('ausschuss', 'bgbl')).toBe(true)
    expect(isLawStationPair('bgbl', 'me')).toBe(false)
  })
})

describe('lawStationOf', () => {
  it('maps the three titles that follow the draft', () => {
    expect(lawStationOf('Regierungsvorlage')).toBe('rv')
    expect(lawStationOf('Geändert im Ausschuss')).toBe('ausschuss')
    expect(lawStationOf('Geändert im Plenum')).toBe('plenum')
    expect(lawStationOf('  Geändert im Plenum  ')).toBe('plenum')
  })

  it('claims no station for a document that is not a version of the text', () => {
    // Both sit in the same upstream list. "Verhältnismäßigkeitsprüfung" is
    // the EU assessment for regulated professions (171/ME and 309/ME XXVII,
    // 160/ME XXVI), "Vertragstext" a Staatsvertrag (79/ME, 97/ME XXVI).
    // Offered as a station, the § parser would make paragraphs out of an
    // annex and the comparison would report an assessment as law.
    expect(lawStationOf('Verhältnismäßigkeitsprüfung')).toBeNull()
    expect(lawStationOf('Vertragstext')).toBeNull()
  })

  it('does not map the raw document title — the station name is upstream of it', () => {
    // `mapTextEvolution` renames "Gesetzestext" to "Regierungsvorlage"
    // first, because on one page that same word points at the draft's own
    // text and at the Vorlage's. Matching it here would make the draft its
    // own Regierungsvorlage.
    expect(lawStationOf('Gesetzestext')).toBeNull()
  })
})

describe('meTextTitleRank', () => {
  it('takes the draft text under each title the ressorts use', () => {
    expect(meTextTitleRank('Gesetzestext')).toBe(0)
    expect(meTextTitleRank('Gesetzestext (korrigierte Version)')).toBeGreaterThan(0)
    expect(meTextTitleRank('Gesetzestext (ursprüngliche Version)')).toBeGreaterThan(
      meTextTitleRank('Gesetzestext (korrigierte Version)'),
    )
  })

  it('refuses a document that is more than the law text', () => {
    // Three GP-XXVI drafts publish one file for text, Vorblatt and
    // Erläuterungen. A prefix match would compare explanatory prose against
    // law text; the honest answer is that there is nothing to compare.
    expect(meTextTitleRank('Gesetzestext, Vorblatt und Erläuterungen')).toBe(-1)
    expect(meTextTitleRank('Gesetzestext samt Vorblatt und Erläuterungen')).toBe(-1)
    expect(meTextTitleRank('Textgegenüberstellung')).toBe(-1)
  })
})

describe('the default left side', () => {
  it('is the station immediately before the chosen one', () => {
    // So every difference belongs to one actor: the ministry after the
    // Begutachtung, then the committee, then the plenary.
    expect(defaultFromFor('rv')).toBe('me')
    expect(defaultFromFor('ausschuss')).toBe('rv')
    expect(defaultFromFor('plenum')).toBe('rv')
  })

  it('is nothing for the draft, which has no station before it', () => {
    expect(defaultFromFor('me')).toBeNull()
  })
})

describe('isLawStationPair', () => {
  it('accepts only an earlier → later pair', () => {
    expect(isLawStationPair('me', 'plenum')).toBe(true)
    expect(isLawStationPair('rv', 'ausschuss')).toBe(true)
    // A flipped pair would report every amendment backwards rather than
    // fail: the word diff calls one side removed and the other inserted.
    expect(isLawStationPair('plenum', 'me')).toBe(false)
    expect(isLawStationPair('rv', 'rv')).toBe(false)
  })
})

describe('lawStationPairQuestion', () => {
  const pairs: [LawStationId, LawStationId][] = [
    ['me', 'rv'],
    ['me', 'ausschuss'],
    ['me', 'plenum'],
    ['rv', 'ausschuss'],
    ['rv', 'plenum'],
    ['ausschuss', 'plenum'],
  ]

  it('keeps the wording the Regierungsvorlage section links to', () => {
    expect(lawStationPairQuestion('me', 'rv')).toBe('Was sich nach der Begutachtung geändert hat')
  })

  it('asks a distinct question for every pair', () => {
    const asked = pairs.map(([from, to]) => lawStationPairQuestion(from, to))
    expect(new Set(asked).size).toBe(pairs.length)
    for (const q of asked) expect(q.length).toBeGreaterThan(10)
  })

  it('stays temporal, never causal or accusatory', () => {
    // Framing rule (docs/architecture.md §4): a text changed after the
    // Begutachtung is not a text changed BY it, and no pair may read as a
    // verdict.
    for (const [from, to] of pairs) {
      const q = lawStationPairQuestion(from, to)
      expect(q, q).not.toMatch(/wegen|aufgrund|ignor|versäum|verwässer|abgeschwächt|durchgesetzt/i)
    }
  })
})

describe('lawStationPairHint', () => {
  it('points at the document that comes closest to the reason', () => {
    expect(lawStationPairHint('me', 'rv')).toContain('Erläuterungen der Regierungsvorlage')
    expect(lawStationPairHint('rv', 'ausschuss')).toContain('Ausschussbericht')
    expect(lawStationPairHint('rv', 'plenum')).toContain('Ausschussbericht')
  })

  it('never claims the comparison shows a cause', () => {
    for (const [from, to] of [['me', 'rv'], ['rv', 'plenum']] as [LawStationId, LawStationId][]) {
      expect(lawStationPairHint(from, to)).toMatch(/sagt der Text nicht/)
    }
  })
})

describe('isLicensedPair', () => {
  it('is true only where both sides are licensed parliamentary datasets', () => {
    // The Regierungsvorlage and the parliamentary versions are licensed;
    // the Ministerialentwurf belongs to the Begutachtungsverfahren, which
    // Parliament expressly excludes from open-data reuse (docs/architecture.md §13.1). A
    // joint "CC BY 4.0" over a pair containing the draft would be wrong for
    // that half.
    expect(isLicensedPair('rv', 'ausschuss')).toBe(true)
    expect(isLicensedPair('ausschuss', 'plenum')).toBe(true)
    expect(isLicensedPair('me', 'rv')).toBe(false)
    expect(isLicensedPair('me', 'plenum')).toBe(false)
  })
})
