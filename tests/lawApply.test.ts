import { describe, expect, it } from 'vitest'
import { applyNovelle, instructionsFromUnits, parsePayload, resolveTarget, splitSentences, stripPayloadQuotes, type Instruction, type StandingLaw } from '../server/utils/lawApply'
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

  // Every Inkrafttretensbestimmung is built this way: the designation, then a
  // bare list, with no numbered Absatz anywhere. The Ziffern hung off an
  // Absatz that did not exist and were dropped on the floor — § 26c of one
  // law is 48.010 characters of XML and 149 Ziffern, and it parsed to the
  // empty string (2026-09-09). That is the text the engine applies
  // instructions to, so it was never only a gap in a measurement.
  it('keeps the Ziffern of a § that has no numbered Absatz', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">§ 26c</absatz>
      <absatz typ="abs" ct="text"><gldsym>§ 26c.</gldsym></absatz>
      <liste><aufzaehlung>
        <listelem ct="text"><symbol stellen="2">1.</symbol>§ 11 ist erstmals 2005 anzuwenden.</listelem>
        <listelem ct="text"><symbol stellen="2">2.</symbol>§ 22 tritt mit 1. Jänner 2006 in Kraft.</listelem>
      </aufzaehlung></liste>
    </abschnitt></nutzdaten></risdok>`
    const node = parseKonsParagraph(xml)!
    expect(node.children[0]!.children.map((c) => c.id)).toEqual(['1', '2'])
    expect(plainText(node)).toContain('§ 22 tritt mit 1. Jänner 2006 in Kraft.')
  })

  // An Anlage is a bare list with no <absatz> at all, so the § node was never
  // created and the whole document parsed to null (6.521 characters of one
  // law's Anlage 1 became nothing).
  it('reads an Anlage that has no Absatz at all', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">Anlage 1</absatz>
      <ueberschrift typ="anlage" ct="text">Anlage 1</ueberschrift>
      <liste><aufzaehlung><listelem ct="text"><symbol stellen="2">1.</symbol>Verteilerleitungen der Netzebene 1</listelem></aufzaehlung></liste>
    </abschnitt></nutzdaten></risdok>`
    const node = parseKonsParagraph(xml)!
    expect(node.id).toBe('1')
    expect(plainText(node)).toContain('Verteilerleitungen der Netzebene 1')
  })

  // RIS ships the headings of a group of §§ inside each § document: § 12 of
  // one law carries six of them above its own. They are not the §'s text — a
  // Novelle replacing the § does not replace them — but the ressort's
  // comparison prints them over the § and something has to recognise them.
  it('separates the headings above a § from the §’s own', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">§ 12</absatz>
      <ueberschrift typ="g1" ct="text">3. Teil</ueberschrift>
      <ueberschrift typ="g2" ct="text">Der Betrieb von Netzen</ueberschrift>
      <ueberschrift typ="g1min" ct="text">1. Hauptstück</ueberschrift>
      <ueberschrift typ="para" ct="text">Marktgebiete</ueberschrift>
      <absatz typ="abs" ct="text"><gldsym>§ 12.</gldsym> (1) Das Leitungsnetz besteht aus Marktgebieten.</absatz>
    </abschnitt></nutzdaten></risdok>`
    const node = parseKonsParagraph(xml)!
    expect(node.heading).toBe('Marktgebiete')
    expect(node.context).toEqual(['3. Teil', 'Der Betrieb von Netzen', '1. Hauptstück'])
    expect(plainText(node)).not.toContain('Hauptstück')
  })

  // An Anlage's body is written as `<absatz typ="erltext" ct="text">` and it
  // is binding law. Read as metadata, three Anlagen of one Verordnung parsed
  // to nothing.
  it('reads an Anlage whose body is written as erltext', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">Anlage 2</absatz>
      <ueberschrift typ="anlage" ct="text">Anlage 2 zu § 5</ueberschrift>
      <absatz typ="erltext" ct="text">Die Radonkonzentration ist in den beiden meistgenützten Aufenthaltsräumen zu messen.</absatz>
      <absatz typ="erltext" ct="text">Die Messdauer hat mindestens sechs Monate zu betragen.</absatz>
    </abschnitt></nutzdaten></risdok>`
    const node = parseKonsParagraph(xml)!
    expect(node.id).toBe('2')
    expect(plainText(node)).toContain('Die Messdauer hat mindestens sechs Monate zu betragen.')
  })

  // In a § that has proper Absätze the same tag carries something else, and
  // taking it as text glued it onto the last Absatz — 15 paragraphs the
  // engine had reproduced exactly then counted as incomplete.
  it('ignores erltext where the § has Absätze of its own', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">§ 4</absatz>
      <absatz typ="abs" ct="text"><gldsym>§ 4.</gldsym> (1) Der Antrag ist schriftlich zu stellen.</absatz>
      <absatz typ="erltext" ct="text">Angefügter Block, der nicht zum Absatz gehört.</absatz>
    </abschnitt></nutzdaten></risdok>`
    expect(plainText(parseKonsParagraph(xml)!)).not.toContain('Angefügter Block')
  })

  // A § without its own heading used to take the name of the Abschnitt above
  // it — a wrong name on someone's paragraph, which is worse than none.
  it('does not give a § the name of the Abschnitt above it', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">§ 4</absatz>
      <ueberschrift typ="g1" ct="text">2. Abschnitt</ueberschrift>
      <absatz typ="abs" ct="text"><gldsym>§ 4.</gldsym> (1) Der Antrag ist schriftlich zu stellen.</absatz>
    </abschnitt></nutzdaten></risdok>`
    const node = parseKonsParagraph(xml)!
    expect(node.heading).toBeNull()
    expect(node.context).toEqual(['2. Abschnitt'])
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

describe('sentence splitting (2026-09-09)', () => {
  // The old splitter cut at every full stop, so "§ 5 Abs. 2" counted as two
  // sentences and "erster Satz lautet" replaced a fragment — 11 of 33
  // divergences in the 261-paragraph harness were this.
  it('does not end a sentence after an abbreviation or an ordinal date', () => {
    expect(splitSentences('Die Behörde nach § 5 Abs. 2 entscheidet. Sie hört den Antragsteller.')).toEqual(['Die Behörde nach § 5 Abs. 2 entscheidet.', 'Sie hört den Antragsteller.'])
    expect(splitSentences('Das Gesetz tritt am 1. Jänner 2027 in Kraft. Es gilt bis 2030.')).toEqual(['Das Gesetz tritt am 1. Jänner 2027 in Kraft.', 'Es gilt bis 2030.'])
    expect(splitSentences('Es gilt BGBl. I Nr. 25/2025. Der Rest bleibt.')).toEqual(['Es gilt BGBl. I Nr. 25/2025.', 'Der Rest bleibt.'])
  })

  it('keeps a full stop inside a quotation in its sentence', () => {
    expect(splitSentences('Der Hinweis "Nikotin macht abhängig. Nicht für Nichtraucher." ist anzubringen. Er muss lesbar sein.')).toHaveLength(2)
  })

  it('refuses when a number before the full stop leaves the boundary open', () => {
    // "gemäß Z 3. Der Bund" — sentence end, or an ordinal like "1. Jänner"?
    expect(splitSentences('Es gilt Z 3. Der Bund zahlt.')).toBeNull()
  })
})

describe('sentence operations (2026-09-09)', () => {
  const l = (): StandingLaw => ({
    paragraphs: [para('9', 'Halter', ['Der Halter nach § 5 Abs. 2 haftet. Der Halter meldet. Der Halter zahlt. Der Halter schweigt.'])],
  })

  it('replaces exactly the addressed sentence, abbreviations notwithstanding', () => {
    const { law: out, results } = run(l(), instr('§ 9 Abs. 1 erster Satz lautet:', ['Der Betreiber haftet.']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Der Betreiber haftet. Der Halter meldet. Der Halter zahlt. Der Halter schweigt.')
  })

  it('deletes a run of sentences, and only that run', () => {
    // "entfallen die letzten beiden Sätze" used to delete the whole Absatz.
    const { law: out, results } = run(l(), instr('In § 9 Abs. 1 entfallen die letzten beiden Sätze.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Der Halter nach § 5 Abs. 2 haftet. Der Halter meldet.')
  })

  it('replaces two sentences by the whole payload', () => {
    const { law: out } = run(l(), instr('§ 9 Abs. 1 erster und zweiter Satz lautet:', ['Neu eins. Neu zwei.']))
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Neu eins. Neu zwei. Der Halter zahlt. Der Halter schweigt.')
  })

  it('replaces the Einleitungssatz and keeps the list beneath it', () => {
    // "In § 40 Abs. 1 lautet der Einleitungssatz:" replaced the whole Absatz,
    // list included (Luftfahrtgesetz, 2026-09-09).
    const { law: out, results } = run(law(), instr('In § 5 Abs. 2 lautet der Einleitungssatz:', ['Nicht erfasst sind:']))
    expect(results[0]!.reason).toBeNull()
    const abs = out.paragraphs[0]!.children[1]!
    expect(abs.text).toBe('Nicht erfasst sind:')
    expect(abs.children).toHaveLength(2)
  })

  it('refuses an ordinal sentence on an Absatz that carries a list', () => {
    // The first "sentence" of § 5 Abs. 2 runs through its Ziffern.
    const { results } = run(law(), instr('§ 5 Abs. 2 erster Satz lautet:', ['Neu.']))
    expect(results[0]!.applied).toBe(false)
  })

  it('refuses an Einleitungssatz where there is no list, and a Schlusssatz where there is none', () => {
    expect(run(law(), instr('In § 5 Abs. 1 lautet der Einleitungssatz:', ['Neu.'])).results[0]!.applied).toBe(false)
    expect(run(law(), instr('In § 5 Abs. 2 entfällt der Schlusssatz.')).results[0]!.applied).toBe(false)
  })

  it('refuses a sentence address when the boundaries are not decidable', () => {
    const l2: StandingLaw = { paragraphs: [para('9', 'H', ['Es gilt Z 3. Der Bund zahlt. Ende.'])] }
    const { results } = run(l2, instr('§ 9 Abs. 1 zweiter Satz lautet:', ['Neu.']))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/nicht auffindbar/)
  })
})

describe('payload headings and nested markers (2026-09-09)', () => {
  it('reads a heading line that carries the § symbol, and hangs the Absätze off it', () => {
    // "„§ 15. Dauer der Verleihung.“" then "(1) …": the heading was dropped
    // and "§ 15 lautet:" kept the old one while RIS installed the new.
    const nodes = parsePayload([{ text: '§ 15. Dauer der Verleihung.', heading: true }, '(1) Erster.', '(2) Zweiter.'])
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ level: 'para', id: '15', heading: '§ 15. Dauer der Verleihung.' })
    expect(nodes[0]!.children.map((c) => c.id)).toEqual(['1', '2'])
  })

  it('wraps a heading and a bare sentence into one §', () => {
    const nodes = parsePayload([{ text: '§ 1. Geltungsbereich.', heading: true }, 'Dieses Bundesgesetz regelt die Privatschulen.'])
    expect(nodes).toHaveLength(1)
    expect(plainText(nodes[0]!)).toBe('§ 1. Geltungsbereich. Dieses Bundesgesetz regelt die Privatschulen.')
  })

  it('splits "1. a) …" into a Ziffer with its first Litera', () => {
    // RIS prints Ziffer and first Litera as one symbol; the "a)" leaked into the text.
    const nodes = parsePayload(['1. a) die Staatsangehörigkeit besitzt, oder', 'b) eine juristische Person ist'])
    expect(nodes[0]).toMatchObject({ level: 'z', id: '1', text: '' })
    expect(nodes[0]!.children.map((c) => `${c.id}:${c.text}`)).toEqual(['a:die Staatsangehörigkeit besitzt, oder', 'b:eine juristische Person ist'])
  })

  it('installs the printed heading even without "samt Überschrift", and refuses "samt Überschrift" without one', () => {
    const l = law()
    const swapped = run(l, [{ op: parseInstruction('§ 5 lautet:').ops[0]!, payload: parsePayload([{ text: 'Geltungsbereich', heading: true }, '§ 5. (1) Neu.']), line: '§ 5 lautet:' }])
    expect(swapped.law.paragraphs[0]!.heading).toBe('Geltungsbereich')
    const refused = run(law(), instr('§ 5 lautet samt Überschrift:', ['§ 5. (1) Neu.']))
    expect(refused.results[0]!.applied).toBe(false)
  })

  it('refuses a plain "lautet" whose payload holds more §§ than it names', () => {
    // A stale heading of the § before made "§ 30 lautet:" carry two blocks;
    // splicing them in inserted a § 27b that consisted of a heading alone.
    const { results, law: out } = run(law(), instr('§ 6 lautet:', ['§ 5a. (1) Fremd.', '§ 6. (1) Neu.']))
    expect(results[0]!.applied).toBe(false)
    expect(out.paragraphs.map((p) => p.id)).toEqual(['5', '6'])
  })

  it('names an inserted § from the instruction when the payload has no marker line', () => {
    const { results, law: out } = run(law(), instr('Nach § 5 wird folgender § 5a eingefügt:', ['(1) Ohne Symbol.']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs.map((p) => p.id)).toEqual(['5', '5a', '6'])
  })
})

describe('renumbering (2026-09-09)', () => {
  it('renumbers a run and lets a later "(neu)" address land on the new numbering', () => {
    // A Vollziehungsklausel hangs its Ziffern off an unnumbered Absatz.
    const p = makeNode('para', '107', '§ 107.', '', 'Vollziehung')
    const body = makeNode('abs', '', '', 'Betraut sind:')
    ;['eins', 'zwei', 'drei', 'vier', 'fünf'].forEach((t, i) => body.children.push(makeNode('z', String(i + 1), `${i + 1}.`, t)))
    p.children.push(body)
    const l: StandingLaw = { paragraphs: [p] }
    const { law: out, results } = run(
      l,
      instr('In § 107 entfällt Z 2; die Z 3 bis 5 erhalten die Ziffernbezeichnungen "2." bis "4".'),
      instr('§ 107 Z 3 (neu) lautet:', ['3. neu vier']),
    )
    expect(results.every((r) => r.applied)).toBe(true)
    expect(out.paragraphs[0]!.children[0]!.children.map((c) => `${c.id}:${c.text}`)).toEqual(['1:eins', '2:drei', '3:neu vier', '4:fünf'])
  })

  it('refuses a "(neu)" address when no renumbering in that § went through', () => {
    // LMSVG § 107: the standing § had no Z 9, the renumbering was refused,
    // and "Z 6 (neu)" would have landed on the old Z 6.
    const { results } = run(law(), instr('§ 5 Abs. 2 Z 1 (neu) lautet:', ['1. neu']))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/neu/)
  })

  it('applies the renumberings of one line at once, so a swap does not collide with itself', () => {
    // "Die §§ 5 bis 7 erhalten § 7 bis § 9; die §§ 8 bis 13 erhalten § 15 bis
    // § 20": one after the other, § 5 → § 7 collides with the § 7 the second
    // half is about to move (IVS-Gesetz).
    const l: StandingLaw = { paragraphs: [para('5', 'A', ['a']), para('6', 'B', ['b']), para('7', 'C', ['c'])] }
    const { law: out, results } = run(l, instr('Die §§ 5 und 6 erhalten die Paragraphenbezeichnungen "§ 6." bis "§ 7."; § 7 erhält die Paragraphenbezeichnung "§ 9.".'))
    expect(results.map((r) => r.applied)).toEqual([true, true])
    expect(out.paragraphs.map((p) => p.id)).toEqual(['6', '7', '9'])
  })

  it('refuses when the new run is not as long as the old one, or collides', () => {
    const l = (): StandingLaw => ({ paragraphs: [para('5', 'A', ['a']), para('6', 'B', ['b']), para('8', 'C', ['c'])] })
    expect(run(l(), instr('Die §§ 5 und 6 erhalten die Paragraphenbezeichnungen "§ 6." bis "§ 8."')).results[0]!.applied).toBe(false)
    expect(run(l(), instr('§ 5 erhält die Paragraphenbezeichnung "§ 8."')).results[0]!.applied).toBe(false)
  })
})

describe('compound lines and punctuation (2026-09-09)', () => {
  it('refuses a compound line whole when one half is not read', () => {
    // Half-applying turned a full stop into a comma and stopped there.
    const units = [{ article: null, articleNumber: null, id: 'Z1', heading: null, quotedHeadings: [], text: '', blocks: [{ kind: 'novao' as const, cls: '', text: '1. In § 5 Abs. 1 wird der Punkt am Ende durch einen Beistrich ersetzt und es wird folgende Wendung angefügt:', gld: null }, { kind: 'abs' as const, cls: '', text: '"sofern nichts anderes bestimmt ist."', gld: null }] }]
    const { instructions, refused } = instructionsFromUnits(units)
    expect(instructions).toHaveLength(0)
    expect(refused).toHaveLength(1)
  })

  it('leaves no space in front of a comma the operand brought along', () => {
    // "die Wort- und Zeichenfolge „ , 10c“" inserted after a word read
    // "Erzeugnissen , die"; four §§ diverged on that space alone.
    const { law: out } = run(law(), instr('In § 6 Abs. 1 wird nach dem Wort "Behörde" die Wort- und Zeichenfolge " , die zuständig ist," eingefügt.'))
    expect(out.paragraphs[1]!.children[0]!.text).toBe('Zuständig ist die Behörde, die zuständig ist, am Sitz der Partei.')
    const glued = run(law(), instr('In § 6 Abs. 1 wird nach dem Wort "Behörde" die Wortfolge " ,BGBl. Nr. 1/2000," eingefügt.'))
    expect(glued.law.paragraphs[1]!.children[0]!.text).toBe('Zuständig ist die Behörde, BGBl. Nr. 1/2000, am Sitz der Partei.')
  })

  it('appends a sentence behind the list of an Absatz, not in front of it', () => {
    const { law: out } = run(law(), instr('Dem § 5 Abs. 2 wird folgender Satz angefügt:', ['Weitere Ausnahmen regelt die Verordnung.']))
    expect(plainText(out.paragraphs[0]!.children[1]!)).toBe('Ausgenommen sind: Verfahren nach dem AVG, Verfahren vor Gerichten. Weitere Ausnahmen regelt die Verordnung.')
  })
})

describe('forms from the held-out corpus (2026-09-09)', () => {
  it('replaces every occurrence with proper seams', () => {
    // "/" → "bzw." inside "Bundesministerin/der" read "Bundesministerinbzw.der".
    const l: StandingLaw = { paragraphs: [para('9', 'Z', ['Die Bundesministerin/der Bundesminister und die Landesrätin/der Landesrat.'])] }
    const { law: out } = run(l, instr('In § 9 Abs. 1 wird jeweils das Zeichen "/" durch die Wort- und Zeichenfolge "bzw." ersetzt.'))
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Die Bundesministerin bzw. der Bundesminister und die Landesrätin bzw. der Landesrat.')
  })

  it('drops an Absatz designation and keeps the text', () => {
    const { law: out, results } = run(law(), instr('In § 6 Abs. 1 entfällt die Absatzbezeichnung "(1)".'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[1]!.children[0]).toMatchObject({ id: '', marker: '', text: 'Zuständig ist die Behörde am Sitz der Partei.' })
  })

  it('refuses a heading replacement whose payload is a whole §', () => {
    const { results } = run(law(), instr('Es entfällt die Überschrift des § 6 und § 6 lautet:', ['§ 6. (1) Erster.', '(2) Zweiter.']))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/Fließtext/)
  })

  it('refuses a payload that is a table, and a standing § that holds one', () => {
    const units = [{ article: null, articleNumber: null, id: 'Z1', heading: null, quotedHeadings: [], text: '', blocks: [{ kind: 'novao' as const, cls: '', text: '1. § 6 Abs. 1 lautet:', gld: null }, { kind: 'other' as const, cls: 'table:absatz/tabtext', text: '2022 7,5 Mio. Euro', gld: null }] }]
    const { instructions, refused } = instructionsFromUnits(units)
    expect(instructions).toHaveLength(0)
    expect(refused[0]!.reason).toMatch(/Tabelle/)
    expect(parseKonsParagraph('<risdok><nutzdaten><abschnitt><absatz typ="abs" ct="text"><gldsym>§ 26.</gldsym> Text</absatz><table><tr><td><absatz typ="tabtext" ct="text">Zelle</absatz></td></tr></table></abschnitt></nutzdaten></risdok>')).toBeNull()
  })
})
