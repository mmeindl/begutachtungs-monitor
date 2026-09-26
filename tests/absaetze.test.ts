import { describe, expect, it } from 'vitest'
import type { LawDiffSegment } from '../shared/types'
import { absaetze } from '../app/utils/absaetze'

const eq = (text: string): LawDiffSegment => ({ type: 'equal', text })
const ins = (text: string): LawDiffSegment => ({ type: 'inserted', text })
const del = (text: string): LawDiffSegment => ({ type: 'removed', text })

const texts = (blocks: LawDiffSegment[][]) => blocks.map((b) => b.map((s) => s.text))

describe('absaetze', () => {
  it('splits at the Absatz marker, not at the whitespace the diff removed', () => {
    expect(texts(absaetze([eq('(1) Erstens. (2) Zweitens. (3) Drittens.')]))).toEqual([
      ['(1) Erstens. '],
      ['(2) Zweitens. '],
      ['(3) Drittens.'],
    ])
  })

  it('reads a lettered Absatz as one', () => {
    expect(texts(absaetze([eq('(2) Alt. (2a) Neu.')]))).toEqual([['(2) Alt. '], ['(2a) Neu.']])
  })

  it('does not mistake a citation for an Absatz — „(EU) 2018/1808"', () => {
    // The documented edge case: the marker is digits in brackets, so the two
    // forms that stand right beside it in the same text miss it — „(EU)"
    // carries letters, „Abs. 1" carries no brackets.
    const one = '(1) Die Richtlinie (EU) 2018/1808 gilt sinngemäß, siehe Abs. 1 lit. b.'
    expect(texts(absaetze([eq(one)]))).toEqual([[one]])
  })

  it('cuts the text of a run without cutting its kind', () => {
    // A paragraph break inside an inserted run leaves both halves inserted.
    const blocks = absaetze([ins('(1) Erstens. (2) Zweitens.')])
    expect(blocks.map((b) => b.map((s) => s.type))).toEqual([['inserted'], ['inserted']])
  })

  it('keeps a block that spans several runs together', () => {
    expect(texts(absaetze([eq('(1) Der Text '), del('alt'), ins('neu'), eq(' bleibt.')]))).toEqual([
      ['(1) Der Text ', 'alt', 'neu', ' bleibt.'],
    ])
  })

  it('opens no empty block before the first marker', () => {
    expect(absaetze([eq('(1) Erstens.')])).toHaveLength(1)
  })

  it('leaves a § without markers as the one block it is', () => {
    expect(texts(absaetze([eq('Der Bundesminister kann durch Verordnung …')]))).toEqual([
      ['Der Bundesminister kann durch Verordnung …'],
    ])
  })

  it('hands an empty § back rather than nothing', () => {
    expect(absaetze([])).toEqual([[]])
  })
})

/**
 * Die Ziffern und Litera, seit 26.09.2026 (docs/architecture.md §12.12a).
 *
 * `(1)` ist selbstbegrenzend, `1.` nicht — deshalb steht hier neben jedem
 * Fall, der trennen MUSS, einer, der nicht trennen darf. Die Zahlen hinter
 * der Regel stehen im Kopf von `app/utils/absaetze.ts`; nachgemessen wird
 * mit `pnpm corpus:absatz-marker`, und zwar über genau diese Funktion.
 */
describe('absaetze — Ziffern und Litera', () => {
  it('trennt eine aufsteigende Ziffernfolge, auch ohne Absatzmarke', () => {
    expect(texts(absaetze([eq('Als Abfall gelten: 1. Stoffe, 2. Gegenstände, 3. Reste.')]))).toEqual([
      ['Als Abfall gelten: '],
      ['1. Stoffe, '],
      ['2. Gegenstände, '],
      ['3. Reste.'],
    ])
  })

  it('trennt die Litera unter der Ziffer', () => {
    expect(texts(absaetze([eq('1. Erstens: a) so, b) anders. 2. Zweitens.')]))).toEqual([
      ['1. Erstens: '],
      ['a) so, '],
      ['b) anders. '],
      ['2. Zweitens.'],
    ])
  })

  /* Die widerlegte Regel: „jede Form n." zerreißt in 13,5 % der Paragraphen
   * einen laufenden Satz. Ein einzelnes `1.` steht in keiner Folge und bleibt
   * deshalb Text — und selbst in einer Folge hält das Datum es zurück. */
  it('macht aus einem einzelnen „1." keine Ziffer', () => {
    const one = 'Diese Verordnung tritt mit 1. Jänner 2027 in Kraft.'
    expect(texts(absaetze([eq(one)]))).toEqual([[one]])
  })

  it('trennt nicht an einem Datum, auch wenn es eine Folge bildet', () => {
    const two = 'Er gilt ab 1. Jänner 2026 und endet am 2. Februar 2027.'
    expect(texts(absaetze([eq(two)]))).toEqual([[two]])
  })

  it('trennt nicht an einer Verweisung — „Abs. 2 Z 1."', () => {
    const ref = 'Es gilt die Regel gemäß Abs. 2 Z 1. 2. Für den Rest gilt Abs. 3.'
    // Getrennt wird vor der ECHTEN Ziffer, nicht vor der Verweisung davor.
    expect(texts(absaetze([eq(ref)]))).toEqual([
      ['Es gilt die Regel gemäß Abs. 2 Z 1. '],
      ['2. Für den Rest gilt Abs. 3.'],
    ])
  })

  it('trennt nicht an einer Ordnungszahl — „6. Abschnitt"', () => {
    const ord = 'Eine im 5. und 6. Abschnitt des 8. Hauptstückes genannte Frist.'
    expect(texts(absaetze([eq(ord)]))).toEqual([[ord]])
  })

  /* Die häufigste Erfindung der Regel ohne Ausnahmen: wo das RIS die
   * Untergliederung nicht ausgezeichnet hat, steht „a)" im Fließtext der
   * Ziffer und der Baum kennt dort keine Grenze. */
  it('trennt eine Literafolge gar nicht, die unmittelbar auf ihre Ziffer folgt', () => {
    // Ganz oder gar nicht: „b)" einen Block zu geben und „a)" nicht, wäre
    // eine Gliederung, die es so nirgends gibt.
    const inline = 'Berechtigt sind, die 1. a) dies und b) jenes tun, sowie 2. Erben.'
    expect(texts(absaetze([eq(inline)]))).toEqual([
      ['Berechtigt sind, die '],
      ['1. a) dies und b) jenes tun, sowie '],
      ['2. Erben.'],
    ])
  })

  it('schneidet eine Ziffernfolge quer über die Läufe, ohne ihre Art zu ändern', () => {
    const blocks = absaetze([eq('1. Alt '), del('weg'), ins('neu'), eq(' 2. Zweitens.')])
    expect(texts(blocks)).toEqual([['1. Alt ', 'weg', 'neu', ' '], ['2. Zweitens.']])
    expect(blocks.map((b) => b.map((s) => s.type))).toEqual([
      ['equal', 'removed', 'inserted', 'equal'],
      ['equal'],
    ])
  })
})
