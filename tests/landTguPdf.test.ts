import { describe, expect, it } from 'vitest'
import { textState } from '../server/utils/laender/landTguPdf'

/** pdf.js's operator numbers, as far as the text state reads them. */
const OPS = { save: 1, restore: 2, transform: 3, beginText: 4, setFont: 5, setCharSpacing: 6, setWordSpacing: 7, setHScale: 8, setLeading: 9, setTextMatrix: 10, moveText: 11, setLeadingMoveText: 12, nextLine: 13, nextLineShowText: 14, nextLineSetSpacingShowText: 15 }
const glyph = (unicode: string, width: number) => ({ unicode, width, isSpace: unicode === ' ' })

describe('textState — where a page\'s text operators put a glyph (20.11.2026)', () => {
  it('starts a run at its text matrix and moves on by each glyph\'s width in the font size', () => {
    const t = textState(OPS)
    t.read(OPS.beginText, [])
    t.read(OPS.setFont, ['f1', 10])
    t.read(OPS.setTextMatrix, [[1, 0, 0, 1, 70, 500]])
    expect(t.show(glyph('A', 600))).toEqual({ u: 'A', x: 70, w: 6, y: 500 })
    expect(t.show(glyph('b', 500))).toMatchObject({ x: 76, w: 5 })
  })

  it('moves without drawing at a number of a text array: negative to the right', () => {
    const t = textState(OPS)
    t.read(OPS.setFont, ['f1', 10])
    t.read(OPS.setTextMatrix, [[1, 0, 0, 1, 0, 0]])
    t.show(glyph(' ', 278))
    t.show(-221)
    expect(t.show(glyph('e', 556))!.x).toBeCloseTo(2.78 + 2.21)
  })

  it('restores the character spacing with the graphics state — Word sets it inside one run\'s q … Q', () => {
    const t = textState(OPS)
    t.read(OPS.save, [])
    t.read(OPS.setCharSpacing, [0.1])
    t.read(OPS.restore, [])
    t.read(OPS.setFont, ['f1', 10])
    t.read(OPS.setTextMatrix, [[1, 0, 0, 1, 0, 0]])
    t.show(glyph('a', 500))
    expect(t.show(glyph('b', 500))!.x).toBe(5)
    // …and applies it where it is set: to every glyph, the word spacing to a space.
    t.read(OPS.setCharSpacing, [1])
    t.read(OPS.setWordSpacing, [2])
    t.read(OPS.setTextMatrix, [[1, 0, 0, 1, 0, 0]])
    t.show(glyph(' ', 300))
    expect(t.show(glyph('c', 500))!.x).toBe(6)
  })

  it('follows a moved line and the transformation around the text', () => {
    const t = textState(OPS)
    t.read(OPS.transform, [2, 0, 0, 2, 10, 20])
    t.read(OPS.beginText, [])
    t.read(OPS.setFont, ['f1', 10])
    t.read(OPS.moveText, [5, 7])
    expect(t.show(glyph('a', 500))).toEqual({ u: 'a', x: 20, w: 10, y: 34 })
  })

  it('answers nothing for text that is not upright', () => {
    const t = textState(OPS)
    t.read(OPS.setFont, ['f1', 10])
    t.read(OPS.setTextMatrix, [[0, 1, -1, 0, 100, 100]])
    expect(t.show(glyph('a', 500))).toBeNull()
  })
})
