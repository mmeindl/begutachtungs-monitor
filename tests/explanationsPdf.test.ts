/**
 * A Vorlage's Erläuterungen read from Parliament's PDF: what makes a block,
 * a heading, a word and a table, on pages built by hand. What the reader does
 * on real documents is measured against their HTML (`docs/decisions.md`,
 * „Laws without a Begutachtung").
 */
import { describe, expect, it } from 'vitest'
import { explanationBlocks, type ExplanationPage, type ExplanationRun } from '../server/utils/explanations/explanationsPdf'
import { parseExplanationBlocks } from '../server/utils/explanations/explanationsHtml'

const LEFT = 85
const RIGHT = 510

/** One line of body text; `width` defaults to a short line, `full` runs to the right margin. */
const run = (text: string, y: number, over: Partial<ExplanationRun> = {}): ExplanationRun => ({
  x: LEFT,
  y,
  width: Math.min(RIGHT - LEFT, text.length * 4.5),
  text,
  size: 10,
  bold: false,
  ...over,
})
const full = (text: string, y: number, over: Partial<ExplanationRun> = {}) => run(text, y, { width: RIGHT - LEFT, ...over })
const page = (...runs: ExplanationRun[]): ExplanationPage => ({ width: 595, height: 842, runs, offTurn: 0 })
const texts = (...pages: ExplanationPage[]) => explanationBlocks(pages).blocks.map((b) => b.text)

describe('explanationBlocks', () => {
  it('ends a paragraph where the lines stand further apart than their step', () => {
    expect(texts(page(full('Erste Zeile', 700), run('zweite Zeile.', 689), run('Neuer Absatz.', 674)))).toEqual(['Erste Zeile zweite Zeile.', 'Neuer Absatz.'])
  })

  it('takes Parliament’s stamps off, wherever on the page’s edge they stand', () => {
    const stamped = page(
      run('127 der Beilagen XXVIII. GP - Regierungsvorlage - Erläuterungen', 800, { x: 163 }),
      run('1 von 9', 800, { x: 480 }),
      run('Text.', 700),
      run('www.parlament.gv.at', 15, { x: 258 }),
    )
    expect(texts(stamped)).toEqual(['Text.'])
  })

  it('keeps a stamp’s words where they stand in the text', () => {
    expect(texts(page(run('3 von 26', 500)))).toEqual(['3 von 26'])
  })

  it('carries a paragraph over a page only from a full line', () => {
    expect(texts(page(full('Text', 700), full('der bis zum Rand geht', 689)), page(run('und weitergeht.', 760)))).toEqual(['Text der bis zum Rand geht und weitergeht.'])
    expect(texts(page(full('Text bis zum Rand', 700), run('endet kurz.', 689)), page(run('Neuer Absatz.', 760)))).toEqual(['Text bis zum Rand endet kurz.', 'Neuer Absatz.'])
  })

  it('ends a paragraph at a line that stops short of the margin, at the same step', () => {
    expect(texts(page(full('Erster Absatz', 700), run('endet hier.', 689), full('Der zweite', 678), run('auch.', 667)))).toEqual(['Erster Absatz endet hier.', 'Der zweite auch.'])
  })

  it('sets a bold heading apart from the prose under it, at the same step', () => {
    const blocks = explanationBlocks([page(run('Zu Z 1 (§ 5):', 700, { bold: true }), run('Die Begründung.', 689))]).blocks
    expect(blocks.map((b) => b.text)).toEqual(['Zu Z 1 (§ 5):', 'Die Begründung.'])
    expect(blocks[0]!.cls).toMatch(/Ueberschr/)
  })

  it('reads a „zu …" at a line’s start as the sentence going on, never as a heading', () => {
    const blocks = explanationBlocks([page(run('Das gilt auch', 700), run('zu § 3 und weiteren.', 685))]).blocks
    expect(parseExplanationBlocks(blocks).special).toEqual([])
  })

  it('stops at a Textgegenüberstellung bound into the same document', () => {
    expect(texts(page(run('Text.', 700), run('Textgegenüberstellung', 660, { bold: true }), run('Geltende Fassung', 640)))).toEqual(['Text.'])
  })

  it('stops at the annex’s two columns even where its title is not set apart', () => {
    const head = [run('Geltende Fassung', 660, { x: 100, width: 80 }), run('Vorgeschlagene Fassung', 660, { x: 400, width: 100 })]
    expect(texts(page(run('Text.', 700), ...head, run('§ 1. Alt', 640, { x: 100, width: 50 }), run('§ 1. Neu', 640, { x: 400, width: 50 })))).toEqual(['Text.'])
  })

  it('takes a ministry’s page number off the head of the page', () => {
    expect(texts(page(run('(2)', 809, { x: 42 }), run('Text.', 700)))).toEqual(['Text.'])
  })

  it('takes off a marking that repeats at the foot of several pages', () => {
    const foot = (y: number) => run('TLP gelb (Adressatenkreis)', y, { x: 20 })
    expect(texts(page(run('Eins.', 700), foot(18)), page(run('Zwei.', 700), foot(18)))).toEqual(['Eins.', 'Zwei.'])
  })

  it('counts a table’s lines and leaves them out', () => {
    const row = (y: number, a: string, b: string) => [run(a, y, { width: 40 }), run(b, y, { x: 300, width: 60 })]
    const out = explanationBlocks([page(run('Davor.', 700), ...row(680, 'Jahr', '2026'), ...row(669, 'Summe', '1 000'), run('Danach.', 650))])
    expect(out.blocks.map((b) => b.text)).toEqual(['Davor.', 'Danach.'])
    expect(out.tableLines).toBe(2)
  })

  it('does not read a list’s label and its text as a table', () => {
    const item = (y: number, label: string, text: string) => [run(label, y, { width: 8 }), run(text, y, { x: 125, width: 200 })]
    const out = explanationBlocks([page(...item(700, '1.', 'Erstens.'), ...item(685, '2.', 'Zweitens.'))])
    expect(out.tableLines).toBe(0)
    expect(out.blocks).toHaveLength(2)
  })

  it('sets a footnote behind the paragraph that points to it, never inside a sentence running over the page', () => {
    const mark = run('1', 712, { x: LEFT + 40, width: 3, size: 6.5 })
    const out = texts(
      page(full('Erstens', 720), run('Mit Note', 709, { width: 40 }), mark, run('und mehr', 709, { x: LEFT + 60, width: RIGHT - LEFT - 60 }), full('und der Satz geht weiter', 698), run('1 Siehe die Quelle.', 80, { size: 8 })),
      page(run('auf der nächsten Seite.', 760)),
    )
    expect(out).toEqual(['Erstens Mit Note 1 und mehr und der Satz geht weiter auf der nächsten Seite.', '[1] Siehe die Quelle.'])
  })

  it('reports a page of words that are no German', () => {
    const noise = Array.from({ length: 40 }, () => 'GHU%HLODJHQ').join(' ')
    expect(explanationBlocks([page(run(noise, 700))]).garbledPages).toBe(1)
  })

  it('keeps a word’s own hyphen in a document Word did not hyphenate', () => {
    expect(texts(page(full('ein risk-', 700), run('based approach', 689)))).toEqual(['ein risk-based approach'])
  })

  it('takes the line’s hyphen out where the document prints the word whole', () => {
    expect(texts(page(full('die Voraus-', 700), run('setzung und die Voraussetzung', 689)))).toEqual(['die Voraussetzung und die Voraussetzung'])
  })

  it('keeps „Bundes- und Landesrecht" apart', () => {
    expect(texts(page(full('das Bundes-', 700), run('und Landesrecht', 689)))).toEqual(['das Bundes- und Landesrecht'])
  })

  it('takes a raised run as a word of its own, as the HTML’s <sup> reads', () => {
    const line = [run('StGB', 700, { width: 22 }), run('12', 703, { x: LEFT + 22, width: 6, size: 6.5 })]
    expect(texts(page(...line))).toEqual(['StGB 12'])
  })
})
