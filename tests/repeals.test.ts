import { describe, expect, it } from 'vitest'
import { divisionPath, divisionsOf, draftRepeals, inRange, noRepeals, repealKey, repealsParagraph, showsRepeal } from '../server/utils/annex/repeals'
import { verifyAnnex, type AnnexSources } from '../server/utils/annex/verdict'
import { checkAnnexRows } from '../server/utils/annex/gateRows'
import type { TextBlock } from '../server/utils/lawtext/lawUnits'
import type { KonsLawAtDate, KonsParagraphRef } from '../server/utils/ris/konsLaw'
import { comparisonRow as row, draftArticle as article } from './helpers/builders'

const instruction = (text: string): TextBlock => ({ kind: 'novao', cls: 'absatz/novao1', text, gld: null })

/** One Artikel amending the X-Gesetz, BGBl. I Nr. 1/2020, with the given instruction lines. */
function draftOf(...lines: string[]): TextBlock[] {
  return [
    { kind: 'article', cls: 'ueberschrift/g1', text: 'Artikel 1', gld: null },
    { kind: 'section', cls: 'ueberschrift/g2', text: 'X-Gesetz', gld: null },
    { kind: 'other', cls: 'absatz/promkleinlsatz', text: 'Das X-Gesetz, BGBl. I Nr. 1/2020, wird wie folgt geändert:', gld: null },
    ...lines.map(instruction),
  ]
}

describe('draftRepeals', () => {
  it('reads a § the grammar deletes whole, and not a deletion inside one', () => {
    const r = draftRepeals(draftOf('1. § 32a samt Überschrift entfällt.', '2. In § 16 entfällt Abs. 3.'), article())
    expect([...r.paragraphs]).toEqual(['§ 32a'])
  })

  it('reads the lists and ranges the grammar refuses (GuKG-Novelle 2024, Bäderhygieneverordnung)', () => {
    const r = draftRepeals(draftOf('40. Die §§ 65, 66 bis 70a und 73 samt Überschriften entfallen.', '29. Die Anlagen 6, 7 und 10 entfallen.'), article())
    expect([...r.paragraphs].sort()).toEqual(['Anl 10', 'Anl 6', 'Anl 7', '§ 65', '§ 73'])
    expect(r.ranges).toEqual([['§ 66', '§ 70a']])
    // The headings named after the verb (Seeschifffahrts-Verordnung, 4D9E1224).
    const after = draftRepeals(draftOf('13. Die Anlagen 1 bis 27 sowie 30 entfallen samt Überschriften.'), article())
    expect([...after.paragraphs]).toEqual(['Anl 30'])
    expect(after.ranges).toEqual([['Anl 1', 'Anl 27']])
  })

  it('reads a Roman Anhang by its name', () => {
    const r = draftRepeals(draftOf('16. § 4 Abs. 4 sowie die §§ 94 und 182 samt Überschriften sowie Anhang XIII entfallen.'), article())
    expect(r.paragraphs.has(repealKey('Anhang XIII'))).toBe(true)
    expect(r.paragraphs.has('§ 4')).toBe(false)
  })

  it('reads whole divisions, innermost first', () => {
    const r = draftRepeals(draftOf('7. Der 9. Teil entfällt.', '3. Der 4a. Abschnitt entfällt.', '12. Der 5. Abschnitt samt Überschrift entfällt.'), article())
    expect([...r.divisions].sort()).toEqual(['4a. abschnitt', '5. abschnitt', '9. teil'])
    // The singular heading in a list too (IKT-Schulverordnung, 19.11.2026: „Überschriften?" read „Überschrifte").
    expect([...draftRepeals(draftOf('2. § 7 samt Überschrift entfällt.', '3. Die §§ 8 und 9 samt Überschrift entfallen.'), article()).paragraphs].sort()).toEqual(['§ 7', '§ 8', '§ 9'])
  })

  it('keeps a division qualified by another as a pair, never as the division alone (19.11.2026)', () => {
    // Keyed „3. abschnitt", it vouched for the 3. Abschnitt of every Hauptstück.
    const r = draftRepeals(draftOf('6. Der 3. Abschnitt des 6. Hauptstücks entfällt.', '7. Der II. Abschnitt des Teils A entfällt.'), article())
    expect(r.divisions.size).toBe(0)
    expect(r.qualified).toEqual([['3. abschnitt', '6. hauptstück'], ['ii. abschnitt', 'a. teil']])
  })

  // Seeschifffahrts-Verordnung, 4D9E1224 (19.11.2026): 177 repealed §§ withheld.
  it('reads lettered Teile and a plural list of divisions', () => {
    const r = draftRepeals(draftOf('8. Die Teile B und C entfallen.', '11. Die Teile J, K und L entfallen.', '12. Der Teil M entfällt.'), article())
    expect([...r.divisions].sort()).toEqual(['b. teil', 'c. teil', 'j. teil', 'k. teil', 'l. teil', 'm. teil'])
  })

  it('reads a division qualified by the law itself as the division (19.11.2026)', () => {
    const r = draftRepeals(draftOf('2. Der 1. Abschnitt des Gesetzes ( "Allgemeine Auskunftspflicht" ) entfällt.', '3. Der 3. Abschnitt des Bundesgesetzes entfällt.'), article())
    expect([...r.divisions].sort()).toEqual(['1. abschnitt', '3. abschnitt'])
  })

  it('counts no deleted heading as a repeal of its § (19.11.2026)', () => {
    // A § whose heading goes has moved or stays: exactly what the rule withholds.
    const r = draftRepeals(draftOf('4. Die Überschrift zu § 5 entfällt.', '5. Die Überschriften zu den §§ 7 bis 9 entfallen.'), article())
    expect(r.paragraphs.size + r.ranges.length).toBe(0)
  })

  it('counts nothing a renumbering or a rewrite says', () => {
    const r = draftRepeals(draftOf('23. Die §§ 88 bis 107 erhalten die Paragraphenbezeichnungen "§ 69." bis "§ 88." .', '8. § 12 lautet:', '5. In § 16 Abs. 1 wird die Wortfolge "A" durch die Wortfolge "B" ersetzt.'), article())
    expect(r.paragraphs.size + r.ranges.length + r.divisions.size).toBe(0)
  })

  it('reads only the instructions of the law asked about', () => {
    const blocks = [
      ...draftOf('1. § 1 entfällt.'),
      { kind: 'article', cls: 'ueberschrift/g1', text: 'Artikel 2', gld: null },
      { kind: 'section', cls: 'ueberschrift/g2', text: 'Y-Gesetz', gld: null },
      { kind: 'other', cls: 'absatz/promkleinlsatz', text: 'Das Y-Gesetz, BGBl. I Nr. 2/2020, wird wie folgt geändert:', gld: null },
      instruction('1. § 1 lautet:'),
    ] satisfies TextBlock[]
    const y = article({ index: 1, number: 'Artikel 2', numeral: '2', title: 'Y-Gesetz', key: 'Y-Gesetz', bgbl: { organ: 'BGBl. I', nummer: '2/2020' } })
    expect(draftRepeals(blocks, y).paragraphs.size).toBe(0)
    expect(draftRepeals(blocks, article()).paragraphs.has('§ 1')).toBe(true)
  })
})

describe('inRange, divisionsOf, showsRepeal', () => {
  it('puts § 68a between § 66 and § 70a, and § 71 outside', () => {
    expect(inRange('§ 68a', ['§ 66', '§ 70a'])).toBe(true)
    expect(inRange('§ 70a', ['§ 66', '§ 70a'])).toBe(true)
    expect(inRange('§ 70b', ['§ 66', '§ 70a'])).toBe(false)
    expect(inRange('Anl 68', ['§ 66', '§ 70a'])).toBe(false)
  })

  it('reads the divisions RIS files over a §, in either order', () => {
    expect(divisionsOf('9. Teil Integrierter österreichischer Netzinfrastrukturplan Integrierter Netzinfrastrukturplan (NIP)')).toEqual(['9. teil'])
    // A lettered Teil, as RIS prints it over § 1 of the Seeschifffahrts-Verordnung — and no lower-case letter after a word.
    expect(divisionsOf('TEIL A Grundsätzliche Bestimmungen I. ABSCHNITT Allgemeines')).toEqual(['a. teil', 'i. abschnitt'])
    expect(divisionsOf('der zweite Teil a der Liste; Teil des Ganzen')).toEqual([])
    expect(divisionsOf('ABSCHNITT II BUNDESBEHINDERTENBEIRAT')).toEqual(['ii. abschnitt'])
    expect(divisionsOf('Anwendung des 3. Abschnitts')).toEqual([])
  })

  it('proves by a division only where the caller knows the §\'s division', () => {
    const r = { ...noRepeals(), divisions: new Set(['3. abschnitt']) }
    expect(repealsParagraph(r, '§ 10.', ['3. abschnitt'])).toBe(true)
    expect(repealsParagraph(r, '§ 10.', [])).toBe(false)
  })

  it('proves a qualified division only where the path holds both', () => {
    const r = { ...noRepeals(), qualified: [['ii. abschnitt', 'a. teil']] as [string, string][] }
    expect(repealsParagraph(r, '§ 3.', ['ii. abschnitt', 'a. teil'])).toBe(true)
    expect(repealsParagraph(r, '§ 18.', ['ii. abschnitt', 'b. teil'])).toBe(false)
    expect(repealsParagraph(r, '§ 3.', ['ii. abschnitt'])).toBe(false)
  })
})

describe('divisionPath', () => {
  // The Seeschifffahrts-Verordnung as RIS files its headings: each over the first § of its division.
  const headings = [
    ['a. teil', 'i. abschnitt'], [], ['ii. abschnitt'], [], // §§ 1–4
    ['b. teil', 'i. abschnitt'], ['ii. abschnitt'], [], // §§ 16, 18, 19
    ['c. teil', 'i. abschnitt'], [], ['iii. abschnitt'], [], // §§ 27, 28, 37, 40
  ]
  it('walks back to the Abschnitt and past the earlier ones to the Teil', () => {
    expect(divisionPath(headings, 10)).toEqual(['iii. abschnitt', 'c. teil'])
    expect(divisionPath(headings, 3)).toEqual(['ii. abschnitt', 'a. teil'])
    expect(divisionPath(headings, 4)).toEqual(['i. abschnitt', 'b. teil'])
  })

  it('stops at a § the check did not fetch, and at a kind whose order the law never shows', () => {
    const gap = [...headings]
    gap[7] = undefined as unknown as string[]
    expect(divisionPath(gap, 10)).toEqual(['iii. abschnitt'])
    // No list ever shows „hauptstück" against „abschnitt": unknown, so not taken, and the walk ends.
    expect(divisionPath([['3. hauptstück'], ['2. abschnitt'], []], 2)).toEqual(['2. abschnitt'])
  })

  it('sees a repeal only where nothing of the § stands in the proposed column', () => {
    expect(showsRepeal([row({ change: 'removed', current: 'Text', proposed: '' })])).toBe(true)
    // The annex printing „entfällt" says so itself: its row is changed.
    expect(showsRepeal([row({ change: 'changed', current: 'Text', proposed: 'entfällt' })])).toBe(false)
    expect(showsRepeal([row({ change: 'removed', current: 'A', proposed: '' }), row({ change: 'unchanged', current: 'B', proposed: 'B' })])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The gate (19.11.2026): a § shown as repealed is withheld unless the draft repeals it
// ---------------------------------------------------------------------------

const STANDING = 'Das Weinbaugebiet Vulkanland Steiermark entspricht den politischen Bezirken Südoststeiermark, Hartberg-Fürstenfeld und Weiz sowie den Gemeinden des Bezirkes Leibnitz.'

function sources(paragraphs: Record<string, string | { text: string; heading: string }>): AnnexSources {
  const refs: Record<string, KonsParagraphRef> = {}
  for (const label of Object.keys(paragraphs)) {
    refs[label] = { nor: label, label, id: label.replace(/^\D*/, ''), inkrafttreten: null, ausserkrafttreten: null, kundmachungsorgan: null, stammnorm: null, gesetzesnummer: 'X', xmlUrl: `https://ris.example/${label}` }
  }
  const law: KonsLawAtDate = { gesetzesnummer: 'X', kurztitel: 'X-Gesetz', paragraphs: refs }
  return {
    resolveLaw: async () => law,
    standingText: async (ref) => {
      const t = paragraphs[ref.label]!
      return typeof t === 'string' ? { text: t, heading: '' } : t
    },
  }
}

const removed = (gld: string) => row({ gld, para: gld, paraAfter: null, change: 'removed', current: `${gld} ${STANDING}`, proposed: '' })

describe('verifyAnnex: a repeal the page would show', () => {
  it('withholds a § shown as repealed that the draft rewrites (Weinrecht-Sammelverordnung 2024, DAC-VO Vulkanland § 1)', async () => {
    // The right column printed „„§ 1. Das Herkunftsgebiet …“" under „§ 1
    // lautet:", the reader missed the quoted marker, and the § went out as
    // „entfällt" — confirmed, because the left column is the law in force.
    const check = await verifyAnnex([removed('§ 1.')], { articles: [article()], asOf: '2024-04-29', blocks: draftOf('1. § 1 lautet:') }, sources({ '§ 1': STANDING }))
    expect(check.verdicts['#§ 1.']).toBe('withheld')
    expect(check.withheldCauses['#§ 1.']).toBe('repealUnproven')
    const rows = checkAnnexRows([removed('§ 1.')], check)
    expect(rows.rows[0]).toMatchObject({ check: 'withheld', current: '', withheldCause: 'repealUnproven' })
    expect(rows.withheldByCause.repealUnproven).toBe(1)
  })

  it('still confirms a repeal the draft orders', async () => {
    const check = await verifyAnnex([removed('§ 1.')], { articles: [article()], asOf: '2024-04-29', blocks: draftOf('1. § 1 samt Überschrift entfällt.') }, sources({ '§ 1': STANDING }))
    expect(check.verdicts['#§ 1.']).toBe('verified')
  })

  it('withholds it even where the check never reached RIS', async () => {
    // No Stammnorm resolves: the § was „nicht geprüft" and still read „entfällt".
    const none: AnnexSources = { resolveLaw: async () => null, standingText: async () => null }
    const check = await verifyAnnex([removed('§ 1.')], { articles: [article()], asOf: '2024-04-29', blocks: draftOf('1. § 1 lautet:') }, none)
    expect(check.verdicts['#§ 1.']).toBe('withheld')
    expect(check.uncheckedReasons['#§ 1.']).toBeUndefined()
  })

  it('confirms the §§ of a division the draft repeals, walking back to the § RIS names it over (COVID-19-Förderungsprüfungsgesetz)', async () => {
    const check = await verifyAnnex([removed('§ 9.'), removed('§ 10.')], { articles: [article()], asOf: '2025-10-01', blocks: draftOf('2. Der 3. Abschnitt entfällt.') }, sources({
      '§ 9': { text: STANDING, heading: '3. Abschnitt Prüfung' },
      '§ 10': STANDING,
    }))
    expect(check.verdicts['#§ 9.']).toBe('verified')
    expect(check.verdicts['#§ 10.']).toBe('verified')
  })

  it('does not let another division vouch', async () => {
    const check = await verifyAnnex([removed('§ 9.')], { articles: [article()], asOf: '2025-10-01', blocks: draftOf('2. Der 4. Abschnitt entfällt.') }, sources({ '§ 9': { text: STANDING, heading: '3. Abschnitt Prüfung' } }))
    expect(check.withheldCauses['#§ 9.']).toBe('repealUnproven')
  })

  it('leaves the rule disarmed where the draft could not be read', async () => {
    const check = await verifyAnnex([removed('§ 1.')], { articles: [article()], asOf: '2024-04-29', blocks: [] }, sources({ '§ 1': STANDING }))
    expect(check.withheldCauses['#§ 1.']).toBeUndefined()
  })
})
