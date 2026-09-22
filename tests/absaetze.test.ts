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
