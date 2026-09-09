import { describe, expect, it } from 'vitest'
import { applyNovelle, parsePayload, resolveTarget, stripPayloadQuotes, type Instruction, type StandingLaw } from '../server/utils/lawApply'
import { makeNode, parseKonsParagraph, plainText, renderNode, type LawNode } from '../server/utils/lawStructure'
import { parseInstruction } from '../server/utils/novao'

/** A § with numbered Absätze, the shape RIS BrKons delivers. */
function para(id: string, heading: string, absaetze: (string | { text: string; ziffern: string[] })[]): LawNode {
  const node = makeNode('para', id, `§ ${id}.`, '', heading)
  absaetze.forEach((a, i) => {
    const abs = makeNode('abs', String(i + 1), `(${i + 1})`, typeof a === 'string' ? a : a.text)
    if (typeof a !== 'string') a.ziffern.forEach((z, j) => abs.children.push(makeNode('z', String(j + 1), `${j + 1}.`, z)))
    node.children.push(abs)
  })
  return node
}

function law(): StandingLaw {
  return {
    paragraphs: [
      para('5', 'Anwendungsbereich', ['Dieses Bundesgesetz gilt für alle Verfahren.', { text: 'Ausgenommen sind:', ziffern: ['Verfahren nach dem AVG,', 'Verfahren vor Gerichten.'] }]),
      para('6', 'Zuständigkeit', ['Zuständig ist die Behörde am Sitz der Partei.']),
    ],
  }
}

/** Parse an instruction line and pair it with its quoted payload lines. */
function instr(line: string, payloadLines: string[] = []): Instruction[] {
  const parsed = parseInstruction(line)
  expect(parsed.ops.length, `refused: ${parsed.reason}`).toBeGreaterThan(0)
  return parsed.ops.map((op) => ({ op, payload: parsePayload(payloadLines), line }))
}

function run(l: StandingLaw, ...instructions: Instruction[][]) {
  return applyNovelle(l, instructions.flat())
}

describe('parsePayload', () => {
  it('reads the markers the draft prints', () => {
    const nodes = parsePayload(['§ 5a. (1) Erster Absatz.', '(2) Zweiter Absatz.', '1. erste Ziffer,', 'a) erste Litera'])
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ level: 'para', id: '5a' })
    expect(nodes[0]!.children.map((c) => c.id)).toEqual(['1', '2'])
    expect(nodes[0]!.children[1]!.children[0]).toMatchObject({ level: 'z', id: '1' })
    expect(nodes[0]!.children[1]!.children[0]!.children[0]).toMatchObject({ level: 'lit', id: 'a' })
  })
})

describe('resolveTarget', () => {
  it('descends the address ladder and refuses a partial match', () => {
    const l = law()
    expect(resolveTarget(l, parseInstruction('§ 5 Abs. 2 Z 1 lautet:').ops[0]!.target!)).toMatchObject({ level: 'z', id: '1' })
    expect(resolveTarget(l, parseInstruction('§ 5 Abs. 9 lautet:').ops[0]!.target!)).toBeNull()
  })
})

describe('applyNovelle — unit operations', () => {
  it('replaces an Absatz and keeps the rest of the §', () => {
    const { law: out, results } = run(law(), instr('§ 5 Abs. 1 lautet:', ['(1) Dieses Bundesgesetz gilt nur für Verwaltungsverfahren.']))
    expect(results[0]!.applied).toBe(true)
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Dieses Bundesgesetz gilt nur für Verwaltungsverfahren.')
    expect(out.paragraphs[0]!.heading).toBe('Anwendungsbereich')
  })

  it('replaces a § with its heading only when the instruction says so', () => {
    const keep = run(law(), instr('§ 5 lautet:', ['§ 5. (1) Neuer Text.'])).law
    expect(keep.paragraphs[0]!.heading).toBe('Anwendungsbereich')
    const swap = run(law(), instr('§ 5 lautet samt Überschrift:', ['Neuer Titel', '§ 5. (1) Neuer Text.'])).law
    expect(plainText(swap.paragraphs[0]!)).toContain('Neuer Text')
  })

  it('appends an Absatz and inserts a § at the right place', () => {
    const appended = run(law(), instr('Dem § 5 wird folgender Abs. 3 angefügt:', ['(3) Ergänzender Absatz.'])).law
    expect(appended.paragraphs[0]!.children.map((c) => c.id)).toEqual(['1', '2', '3'])
    const inserted = run(law(), instr('Nach § 5 wird folgender § 5a samt Überschrift eingefügt:', ['Neue Überschrift', '§ 5a. (1) Neuer Paragraf.'])).law
    expect(inserted.paragraphs.map((p) => p.id)).toEqual(['5', '5a', '6'])
  })

  it('deletes every target an enumeration names', () => {
    const { law: out, results } = run(law(), instr('§ 5 Abs. 1 und 2 entfallen.'))
    expect(results[0]!.applied).toBe(true)
    expect(out.paragraphs[0]!.children).toHaveLength(0)
  })

  it('refuses to append onto a § that does not exist', () => {
    const { results, unresolved } = run(law(), instr('Dem § 99 wird folgender Abs. 2 angefügt:', ['(2) Text.']))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/nicht im geltenden Text/i)
    expect(unresolved.has('§ 99')).toBe(true)
  })

  it('refuses to insert a § that already exists', () => {
    const { results } = run(law(), instr('Nach § 5 wird folgender § 6 eingefügt:', ['§ 6. (1) Kollision.']))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/existiert bereits/)
  })
})

describe('applyNovelle — phrase operations', () => {
  it('substitutes a phrase that occurs exactly once', () => {
    const { law: out } = run(law(), instr('In § 5 Abs. 1 wird die Wortfolge "für alle Verfahren" durch die Wortfolge "für alle Verwaltungsverfahren" ersetzt.'))
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Dieses Bundesgesetz gilt für alle Verwaltungsverfahren.')
  })

  it('refuses when the phrase is not there', () => {
    const { results } = run(law(), instr('In § 5 Abs. 1 wird die Wortfolge "Steuerpflicht" durch die Wortfolge "Abgabenpflicht" ersetzt.'))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/nicht gefunden/)
  })

  it('refuses an ambiguous phrase rather than picking one', () => {
    // "Verfahren" occurs in the Absatz and in both Ziffern.
    const { results } = run(law(), instr('In § 5 Abs. 2 wird die Wortfolge "Verfahren" durch die Wortfolge "Sachen" ersetzt.'))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/nicht eindeutig/)
  })

  it('inserts a phrase behind its anchor', () => {
    const { law: out } = run(law(), instr('In § 6 Abs. 1 wird nach der Wortfolge "Zuständig ist" die Wortfolge "ausschließlich" eingefügt.'))
    expect(out.paragraphs[1]!.children[0]!.text).toBe('Zuständig ist ausschließlich die Behörde am Sitz der Partei.')
  })

  it('deletes a phrase and tidies the punctuation', () => {
    const { law: out } = run(law(), instr('In § 6 Abs. 1 entfällt die Wortfolge "am Sitz der Partei".'))
    expect(out.paragraphs[1]!.children[0]!.text).toBe('Zuständig ist die Behörde.')
  })
})

describe('applyNovelle — safety', () => {
  it('leaves the input law untouched', () => {
    const original = law()
    run(original, instr('§ 5 Abs. 1 lautet:', ['(1) Anderer Text.']))
    expect(original.paragraphs[0]!.children[0]!.text).toBe('Dieses Bundesgesetz gilt für alle Verfahren.')
  })

  it('reports every paragraph that carries a refusal', () => {
    const { unresolved } = run(
      law(),
      instr('§ 5 Abs. 1 lautet:', ['(1) Neu.']),
      instr('In § 6 Abs. 1 wird die Wortfolge "fehlt" durch die Wortfolge "auch" ersetzt.'),
    )
    expect([...unresolved]).toEqual(['§ 6'])
  })
})

describe('parseKonsParagraph', () => {
  it('reads a RIS BrKons document into the tree', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <kzinhalt typ="p"><absatz typ="kz">Bundesrecht konsolidiert</absatz></kzinhalt>
      <ueberschrift typ="titel">§/Artikel/Anlage</ueberschrift><absatz typ="erltext" ct="artikel_anlage">§ 9</absatz>
      <ueberschrift typ="para" ct="text">Sofortlotterien</ueberschrift>
      <absatz typ="abs" ct="text"><gldsym>§ 9.</gldsym> (1) Sofortlotterien sind Ausspielungen,</absatz>
      <liste><aufzaehlung><listelem ct="text"><symbol stellen="2">1.</symbol>erste Ziffer,</listelem></aufzaehlung></liste>
      <absatz typ="abs" ct="text">(2) Sonstige Sofortlotterien sind Wetten.</absatz>
    </abschnitt></nutzdaten></risdok>`
    const node = parseKonsParagraph(xml)!
    expect(node).toMatchObject({ level: 'para', id: '9', heading: 'Sofortlotterien' })
    expect(node.children.map((c) => c.id)).toEqual(['1', '2'])
    expect(node.children[0]!.children[0]).toMatchObject({ level: 'z', id: '1', text: 'erste Ziffer,' })
    // The metadata header must not leak into the law text.
    expect(plainText(node)).not.toContain('Bundesrecht konsolidiert')
    expect(renderNode(node)).toContain('§ 9. (1) Sofortlotterien')
  })
})

describe('a run of units replaced by a different number of units', () => {
  // "In § 1 wird der Abs. 3 durch folgende Abs. 3 bis 5 ersetzt" installed the
  // first block and silently dropped the rest, which deleted standing law
  // (IVS-Gesetz and Privatschulgesetz, 2026-09-09).
  it('splices one Absatz into three', () => {
    const { law: out, results } = run(law(), instr('In § 6 wird der Abs. 1 durch folgende Abs. 1 bis 3 ersetzt:', ['(1) Erster.', '(2) Zweiter.', '(3) Dritter.']))
    expect(results[0]!.reason).toBeNull()
    const abs = out.paragraphs.find((p) => p.id === '6')!.children
    expect(abs.map((a) => a.marker)).toEqual(['(1)', '(2)', '(3)'])
    expect(plainText(abs[2]!)).toBe('Dritter.')
  })

  it('splices two §§ into three, and the run keeps its place', () => {
    const { law: out, results } = run(law(), instr('Die §§ 5 und 6 werden durch folgende §§ 5 bis 7 ersetzt:', ['§ 5. (1) Neu fünf.', '§ 6. (1) Neu sechs.', '§ 7. (1) Neu sieben.']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs.map((p) => p.id)).toEqual(['5', '6', '7'])
  })

  it('refuses when a new designation would shadow a § outside the run', () => {
    const { law: out, results } = run(law(), instr('§ 5 wird durch folgende §§ 5 und 6 ersetzt:', ['§ 5. (1) Neu fünf.', '§ 6. (1) Kollision.']))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/existiert bereits/)
    expect(out.paragraphs.map((p) => p.id)).toEqual(['5', '6'])
  })

  it('keeps every Absatz when a § is restated in full', () => {
    const { law: out } = run(law(), instr('§ 6 lautet:', ['(1) Erster.', '(2) Zweiter.', '(3) Dritter.']))
    const six = out.paragraphs.find((p) => p.id === '6')!
    expect(six.heading).toBe('Zuständigkeit')
    expect(six.children.map((a) => a.marker)).toEqual(['(1)', '(2)', '(3)'])
  })
})

describe('payload quoting and Schlussteil', () => {
  // RIS keeps the § symbol in its own `gldsym`, so the opening quote arrives
  // after it: `§ 69.` + `" (1) …`. An anchored strip never saw it.
  it('strips an opening quote that follows the paragraph symbol', () => {
    expect(plainText(parsePayload(stripPayloadQuotes(['§ 9. " (1) Der Text.']))[0]!)).toBe('Der Text.')
  })

  it('strips a closing quote followed by the instruction full stop', () => {
    expect(plainText(parsePayload(stripPayloadQuotes(['"(1) Der Text zu verlangen.".']))[0]!)).toBe('Der Text zu verlangen.')
  })

  // "… hat jede Veränderung, insbesondere a) … e) … der Behörde anzuzeigen":
  // the closing part belongs behind the list, not folded into the Absatz text.
  it('renders a Schlussteil after the list it closes', () => {
    const nodes = parsePayload(['(1) Er hat jede Veränderung, insbesondere', 'a) in seiner Person,', 'b) in der Organisation', 'der Behörde anzuzeigen.'])
    expect(plainText(nodes[0]!)).toBe('Er hat jede Veränderung, insbesondere in seiner Person, in der Organisation der Behörde anzuzeigen.')
  })
})

describe('phrase operations address headings and single sentences', () => {
  it('deletes a phrase from the Überschrift, not from the text', () => {
    const { law: out, results } = run(law(), instr('In der Überschrift zu § 5 entfällt die Wortfolge "Anwendungs".'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs.find((p) => p.id === '5')!.heading).toBe('bereich')
  })

  // "In § 169 Abs. 5 dritter Satz wird das Wort X ersetzt": searching the
  // whole Absatz found X twice and refused as ambiguous. The sentence is the
  // scope the instruction named.
  it('replaces inside the addressed sentence when the word repeats elsewhere', () => {
    const l: StandingLaw = { paragraphs: [para('9', 'Halter', ['Der Halter haftet. Der Halter meldet. Der Halter zahlt.'])] }
    const { law: out, results } = run(l, instr('In § 9 Abs. 1 zweiter Satz wird das Wort "Halter" durch das Wort "Betreiber" ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    expect(plainText(out.paragraphs[0]!.children[0]!)).toBe('Der Halter haftet. Der Betreiber meldet. Der Halter zahlt.')
  })
})
