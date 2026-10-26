import { describe, expect, it } from 'vitest'
import { applyNovelle, instructionsFromUnits, parsePayload, renamedOrigins, resolveTarget, splitSentences, stripPayloadQuotes, type Instruction, type StandingLaw } from '../server/utils/kons/lawApply'
import { bodyText, makeNode, parseKonsParagraph, plainText, renderNode, type LawNode } from '../server/utils/lawtext/konsTree'
import { paraNode as para } from './helpers/builders'
import { opAddress, parseAddress, parseInstruction, type NovaoAddress } from '../server/utils/kons/novao'

function law(): StandingLaw {
  return {
    paragraphs: [
      para('5', 'Anwendungsbereich', ['Dieses Bundesgesetz gilt für alle Verfahren.', { text: 'Ausgenommen sind:', ziffern: ['Verfahren nach dem AVG,', 'Verfahren vor Gerichten.'] }]),
      para('6', 'Zuständigkeit', ['Zuständig ist die Behörde am Sitz der Partei.']),
    ],
  }
}

/** Parse an instruction line and pair it with its quoted payload lines. */
function instr(line: string, payloadLines: Parameters<typeof parsePayload>[0] = []): Instruction[] {
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

/**
 * The address of the instruction's first operation. Every kind of `NovaoOp`
 * carries one except `insertAfter`, which addresses an *anchor* — so the
 * narrowing is the type saying that, not a formality.
 */
function targetOf(instruction: string): NovaoAddress {
  const op = parseInstruction(instruction).ops[0]!
  if (!('target' in op)) throw new Error(`Anweisung ohne Ziel: ${instruction}`)
  return op.target
}

describe('resolveTarget', () => {
  it('descends the address ladder and refuses a partial match', () => {
    const l = law()
    expect(resolveTarget(l, targetOf('§ 5 Abs. 2 Z 1 lautet:'))).toMatchObject({ level: 'z', id: '1' })
    expect(resolveTarget(l, targetOf('§ 5 Abs. 9 lautet:'))).toBeNull()
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
    const inserted = run(law(), instr('Nach § 5 wird folgender § 5a samt Überschrift eingefügt:', ['Neue Überschrift', '§ 5a. (1) Neuer Paragraph.'])).law
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
  // KommAustria-Gesetz § 35 as RIS serves it (26.10.2026): Abs. 14 typed as
  // `erltext`, the tag RIS uses for notes — and a note that repeats a
  // marker the § has stays out.
  it('reads an Absatz RIS typed as a note, and only that', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">§ 35</absatz>
      <absatz typ="abs" ct="text"><gldsym>§ 35.</gldsym> (1) Eins.</absatz>
      <absatz typ="abs" ct="text">(13) Dreizehn.</absatz>
      <absatz typ="erltext" ct="text">(14) Für die Mitglieder ist Ersatz zu leisten.</absatz>
      <absatz typ="erltext" ct="text">(1) Eine Anmerkung, die eine Marke wiederholt.</absatz>
      <ueberschrift typ="titel">Zuletzt aktualisiert am</ueberschrift><absatz typ="erltext" ct="geaendert">24.04.2026</absatz>
    </abschnitt></nutzdaten></risdok>`
    const node = parseKonsParagraph(xml)!
    expect(node.children.map((c) => c.id)).toEqual(['1', '13', '14'])
    expect(node.children[2]!.text).toBe('Für die Mitglieder ist Ersatz zu leisten.')
  })

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

  it('opens an Absatz from a symbol that carries its first Ziffer, and reads „a." as a Litera', () => {
    // UStG 1994 § 26 Abs. 3 („(3) 1.") and FPG § 76 Abs. 3 Z 6 („a.").
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="abs" ct="text"><gldsym>§ 26.</gldsym>(2) Zweiter Absatz.</absatz>
      <liste><aufzaehlung ebene="2"><listelem ct="text"><symbol stellen="6">(3) 1.</symbol>Erste Ziffer,</listelem><listelem ct="text"><symbol>2.</symbol>zweite Ziffer, sofern</listelem></aufzaehlung>
      <aufzaehlung ebene="2"><listelem ct="text"><symbol>a.</symbol>erstens,</listelem><listelem ct="text"><symbol>b.</symbol>zweitens.</listelem></aufzaehlung></liste>
    </abschnitt></nutzdaten></risdok>`
    const node = parseKonsParagraph(xml)!
    expect(node.children.map((c) => c.id)).toEqual(['2', '3'])
    expect(node.children[1]!.children.map((c) => `${c.level}:${c.id}`)).toEqual(['z:1', 'z:2'])
    expect(node.children[1]!.children[1]!.children.map((c) => `${c.level}:${c.id}`)).toEqual(['lit:a', 'lit:b'])
  })

  it('refuses an address into a designation that stands twice', () => {
    // BAO § 323: two Novellen each added an „Abs. 90"; the first one found used to answer.
    const p = para('323', 'I', ['eins', 'zwei'])
    p.children[1]!.id = '1'
    const { results } = run({ paragraphs: [p] }, instr('In § 323 Abs. 1 wird das Wort "zwei" durch das Wort "drei" ersetzt.'))
    expect(results[0]!.applied).toBe(false)
  })

  it('puts an unnumbered block behind a list behind it, as the Schlussteil', () => {
    // KFG § 102 Abs. 3a: RIS writes the closing part as a plain `<absatz typ="abs">`.
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="abs" ct="text"><gldsym>§ 102.</gldsym>(3a) Durch Verordnung ist festzusetzen,</absatz>
      <liste><aufzaehlung>
        <listelem ct="text"><symbol stellen="2">1.</symbol>in welchen Verkehrssituationen,</listelem>
        <listelem ct="text"><symbol stellen="2">2.</symbol>auf welchen Straßen.</listelem>
      </aufzaehlung></liste>
      <absatz typ="abs" ct="text">Im Falle von Testfahrten kann eine Bescheinigung ausgestellt werden.</absatz>
    </abschnitt></nutzdaten></risdok>`
    const abs = parseKonsParagraph(xml)!.children[0]!
    expect(abs.text).toBe('Durch Verordnung ist festzusetzen,')
    expect(abs.children.map((c) => `${c.level}:${c.id}`)).toEqual(['z:1', 'z:2', 'schluss:schluss'])
    expect(abs.children.at(-1)!.text).toBe('Im Falle von Testfahrten kann eine Bescheinigung ausgestellt werden.')
  })

  // A law that is itself divided into Artikel prints both designations in one
  // Gliederungssymbol. The id was read off the FIRST number, so the third § of
  // the second Artikel arrived as "2" — a twin of the same law's § 2. Nothing
  // noticed while `kons/novao.ts` refused every address into such a law
  // (§12.12a, Lebensmittelbewirtschaftungsgesetz 1997).
  it('reads the § of an article-qualified designation, not the Artikel', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">Art. 2 § 3</absatz>
      <absatz typ="abs" ct="text"><gldsym>§ 3.</gldsym> (1) Der Bundesminister kann Lenkungsmaßnahmen erlassen.</absatz>
    </abschnitt></nutzdaten></risdok>`
    expect(parseKonsParagraph(xml)!.id).toBe('3')
  })

  // The § there is a cross-reference, not a container, and the Anlage keeps
  // its own number — so the rule above is anchored at the Artikel.
  it('leaves a § cited inside an Anlage designation alone', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">Anlage 5 zu § 14</absatz>
      <absatz typ="abs" ct="text"><gldsym>Anlage 5.</gldsym> Erster Punkt.</absatz>
    </abschnitt></nutzdaten></risdok>`
    expect(parseKonsParagraph(xml)!.id).toBe('5')
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

  // RIS spells the closing clause of an enumeration two ways, and which one a
  // document uses depends on the converter that produced it, not on the law:
  // `<schlussteil>` from version 4.0 on, `<schluss typ="Abs">` before it.
  // Reading only the newer name ended 402 of the 16.073 cached § documents
  // with their enumeration — StGB § 321c lost "ist mit Freiheitsstrafe von
  // einem bis zu zehn Jahren zu bestrafen.", which the annex quotes.
  it('reads the closing clause of an enumeration in the older spelling', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">§ 321c</absatz>
      <ueberschrift typ="para" ct="text">Kriegsverbrechen gegen Eigentum</ueberschrift>
      <absatz typ="abs" ct="text"><gldsym>§ 321c.</gldsym> Wer im Zusammenhang mit einem bewaffneten Konflikt</absatz>
      <liste><ziffernliste ebene="1">
        <listelem ct="text"><symbol stellen="2">1.</symbol>plündert,</listelem>
        <listelem ct="text"><symbol stellen="2">2.</symbol>Kulturgut zerstört, oder</listelem>
      </ziffernliste>
      <schluss typ="Abs" ct="text">ist mit Freiheitsstrafe von einem bis zu zehn Jahren zu bestrafen.</schluss></liste>
    </abschnitt></nutzdaten></risdok>`
    const node = parseKonsParagraph(xml)!
    expect(plainText(node)).toBe('Kriegsverbrechen gegen Eigentum Wer im Zusammenhang mit einem bewaffneten Konflikt plündert, Kulturgut zerstört, oder ist mit Freiheitsstrafe von einem bis zu zehn Jahren zu bestrafen.')
    expect(node.children[0]!.children.at(-1)).toMatchObject({ level: 'schluss' })
  })

  // The older spelling names the unit it closes, and reading that matters
  // twice: the enumeration can continue after the clause ("oder" closes
  // Ziffer 1 of Börsegesetz § 131 Abs. 1 and Ziffer 2 follows it), and
  // `textSlot` resolves "Im Schlussteil des Absatzes" to the Absatz's last
  // `schluss` child — filing a Ziffer's clause there would take that slot.
  // Over the corpus that is 89 §§ whose Absatz slot would hold the wrong text.
  it('hangs a Ziffer’s closing clause off the Ziffer, not off the Absatz', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">§ 131</absatz>
      <absatz typ="abs" ct="text"><gldsym>§ 131.</gldsym> (1) Finanzinstrumente sind Instrumente, die</absatz>
      <liste><ziffernliste ebene="1"><listelem ct="text"><symbol stellen="2">1.</symbol>dem Inhaber bei Fälligkeit</listelem></ziffernliste>
      <literaliste ebene="2">
        <listelem ct="text"><symbol stellen="2">a)</symbol>das unbedingte Recht auf Erwerb verleihen,</listelem>
        <listelem ct="text"><symbol stellen="2">b)</symbol>ein Ermessen verleihen</listelem>
      </literaliste>
      <schluss typ="Ziff" ct="text">oder</schluss>
      <ziffernliste ebene="1"><listelem ct="text"><symbol stellen="2">2.</symbol>nicht unter Z 1 fallen.</listelem></ziffernliste></liste>
    </abschnitt></nutzdaten></risdok>`
    const abs = parseKonsParagraph(xml)!.children[0]!
    expect(plainText(abs)).toBe('Finanzinstrumente sind Instrumente, die dem Inhaber bei Fälligkeit das unbedingte Recht auf Erwerb verleihen, ein Ermessen verleihen oder nicht unter Z 1 fallen.')
    // The Absatz keeps no Schlussteil of its own; the Ziffer carries it.
    expect(abs.children.some((c) => c.level === 'schluss')).toBe(false)
    expect(abs.children[0]!.children.at(-1)).toMatchObject({ level: 'schluss', text: 'oder' })
  })

  // The newer spelling names the level in `ebene`, read since 26.09.2026:
  // 0/0.5 Absatz, 1 Ziffer, 2 and deeper Litera. Measured on `harness:kons`
  // over 40 Sammelnovellen — identisch 762 → 764, „kein geltender Text"
  // 27 → 25 — and the variant that files a clause ENDING its list on the
  // Absatz instead is worse (763 / 26), so it closes its Ziffer like any
  // other (docs/architecture.md §12.13).
  it('reads the level of a closing clause from `ebene`, list ended or not', () => {
    const xml = (tail: string): string => `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">§ 7</absatz>
      <absatz typ="abs" ct="text"><gldsym>§ 7.</gldsym> (1) Zu ersetzen sind die Kosten, die</absatz>
      <liste><ziffernliste ebene="1"><listelem ct="text"><symbol stellen="2">1.</symbol>für Unterkunft erwachsen,</listelem></ziffernliste>
      <schlussteil ebene="1" ct="text">soweit sie angemessen sind,</schlussteil>${tail}</liste>
    </abschnitt></nutzdaten></risdok>`
    for (const tail of ['', '<ziffernliste ebene="1"><listelem ct="text"><symbol stellen="2">2.</symbol>sonst anfallen.</listelem></ziffernliste>']) {
      const abs = parseKonsParagraph(xml(tail))!.children[0]!
      expect(abs.children.some((c) => c.level === 'schluss')).toBe(false)
      expect(abs.children[0]!.children.at(-1)).toMatchObject({ level: 'schluss', text: 'soweit sie angemessen sind,' })
    }
  })

  // The newer spelling carries no level and keeps the Absatz it has always
  // been given, and an Absatz without any enumeration is untouched by all of
  // this — the regression guard for 2.824 documents that read fine today.
  it('leaves the newer spelling and an Absatz without enumeration alone', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">§ 4</absatz>
      <absatz typ="abs" ct="text"><gldsym>§ 4.</gldsym> (1) Er hat jede Veränderung, insbesondere</absatz>
      <liste><literaliste ebene="2"><listelem ct="text"><symbol stellen="2">a)</symbol>in seiner Person,</listelem></literaliste>
      <schlussteil ebene="0" ct="text">der Behörde anzuzeigen.</schlussteil></liste>
      <absatz typ="abs" ct="text">(2) Der Antrag ist schriftlich zu stellen.</absatz>
    </abschnitt></nutzdaten></risdok>`
    const node = parseKonsParagraph(xml)!
    expect(plainText(node)).toBe('Er hat jede Veränderung, insbesondere in seiner Person, der Behörde anzuzeigen. Der Antrag ist schriftlich zu stellen.')
    expect(node.children[0]!.children.at(-1)).toMatchObject({ level: 'schluss', text: 'der Behörde anzuzeigen.' })
    expect(node.children[1]!.children).toEqual([])
  })

  // 14 of the 47 `typ="e…"` blocks carry nothing but a RIS editorial note.
  // They are not law, no Novelle can address them, and the standing text is
  // the ruler the annex is scored against — a note in it is a word the
  // ressort's column can never offer.
  it('strips a RIS annotation that stands in a closing clause', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">§ 113</absatz>
      <absatz typ="abs" ct="text"><gldsym>§ 113.</gldsym> (4) Der Beförderungsunternehmer hat die Kosten zu ersetzen, die</absatz>
      <liste><ziffernliste ebene="1"><listelem ct="text"><symbol stellen="2">1.</symbol>für Unterkunft erwachsen,</listelem></ziffernliste>
      <schluss typ="e1" ct="text"><i>(Anm.: Z 2 aufgehoben durch BGBl. I Nr. 87/2012)</i></schluss></liste>
    </abschnitt></nutzdaten></risdok>`
    expect(plainText(parseKonsParagraph(xml)!)).toBe('Der Beförderungsunternehmer hat die Kosten zu ersetzen, die für Unterkunft erwachsen,')
  })

  it('hangs dashes one ebene deeper under the Ziffer before them (UStG § 26, 28.09.2026)', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">§ 26</absatz>
      <absatz typ="abs" ct="text"><gldsym>§ 26.</gldsym> (1) Es gilt:</absatz>
      <liste><aufzaehlung ebene="2"><listelem ct="text"><symbol>1.</symbol>die Regel,</listelem>
      <listelem ct="text"><symbol>2.</symbol>die Ausnahme, wenn</listelem></aufzaehlung>
      <aufzaehlung ebene="3"><listelem ct="text"><symbol>–</symbol>dies,</listelem>
      <listelem ct="text"><symbol>–</symbol>jenes.</listelem></aufzaehlung></liste>
    </abschnitt></nutzdaten></risdok>`
    const abs = parseKonsParagraph(xml)!.children[0]!
    expect(abs.children.map((c) => `${c.level}:${c.id}`)).toEqual(['z:1', 'z:2'])
    expect(abs.children[1]!.children.map((c) => c.text)).toEqual(['dies,', 'jenes.'])
    // „Z 2 lautet" now takes its dashes with it.
    const { law: out } = run({ paragraphs: [parseKonsParagraph(xml)!] }, instr('§ 26 Abs. 1 Z 2 lautet:', ['2. die Ausnahme.']))
    expect(plainText(out.paragraphs[0]!)).toBe('Es gilt: die Regel, die Ausnahme.')
  })

  it('strips one whose colon stands apart from „Anm." (KFG § 102, 28.09.2026)', () => {
    const xml = `<risdok><nutzdaten><abschnitt>
      <absatz typ="erltext" ct="artikel_anlage">§ 102</absatz>
      <absatz typ="abs" ct="text"><gldsym>§ 102.</gldsym> (12) Der Lenker ist anwesend. <i>(Anm. : Abs. 13 aufgehoben durch BGBl. I Nr. 175/2004)</i></absatz>
    </abschnitt></nutzdaten></risdok>`
    expect(plainText(parseKonsParagraph(xml)!)).toBe('Der Lenker ist anwesend.')
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

  // "In § 22 samt Überschrift … wird das Wort X durch Y ersetzt" renamed the
  // body and left the heading standing — and the § passed the Anhang gate
  // that way (StPO § 22, Bundesstaatsanwaltschaft-Entwurf, 2026-09-19).
  it('renames the heading as well when the address names it alongside the text', () => {
    const l: StandingLaw = { paragraphs: [para('22', 'Generalprokuratur', ['Die Generalprokuratur wirkt an allen Strafverfahren mit.'])] }
    const { law: out, results } = run(l, instr('In § 22 samt Überschrift wird jeweils das Wort "Generalprokuratur" durch das Wort "Bundesstaatsanwaltschaft" ersetzt.'))
    expect(results.every((r) => r.reason === null)).toBe(true)
    expect(out.paragraphs[0]!.heading).toBe('Bundesstaatsanwaltschaft')
    expect(plainText(out.paragraphs[0]!.children[0]!)).toBe('Die Bundesstaatsanwaltschaft wirkt an allen Strafverfahren mit.')
  })

  it('refuses when the named heading does not carry the phrase, instead of renaming half of it', () => {
    const l: StandingLaw = { paragraphs: [para('22', 'Anklagebehörde', ['Die Generalprokuratur wirkt mit.'])] }
    const { results } = run(l, instr('In § 22 samt Überschrift wird das Wort "Generalprokuratur" durch das Wort "Bundesstaatsanwaltschaft" ersetzt.'))
    expect(results.some((r) => r.reason !== null)).toBe(true)
  })

  // The heading belongs to the §, not to the Absatz the address happens to
  // name: "§ 15a Abs. 1 und 2 samt Überschrift" (Apothekengesetz, 2026-09-19).
  it('lifts the heading twin to the paragraph when the address names an Absatz', () => {
    const l: StandingLaw = { paragraphs: [para('15a', 'Verweise auf das Apothekengesetz', ['Das Apothekengesetz gilt.', 'Unberührt bleibt das Apothekengesetz.'])] }
    const { law: out, results } = run(l, instr('In § 15a Abs. 1 samt Überschrift wird das Wort "Apothekengesetz" durch das Wort "ApG" ersetzt.'))
    expect(results.every((r) => r.reason === null)).toBe(true)
    expect(out.paragraphs[0]!.heading).toBe('Verweise auf das ApG')
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Das ApG gilt.')
    expect(out.paragraphs[0]!.children[1]!.text).toBe('Unberührt bleibt das Apothekengesetz.')
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
    // "ab dem 3. Tag" — sentence end, or an ordinal like "1. Jänner"?
    expect(splitSentences('Es gilt ab dem 3. Tag. Der Bund zahlt.')).toBeNull()
  })

  it('ends a sentence behind the number of a designation (26.09.2026)', () => {
    // „Z 3" is a Ziffer's number, never an ordinal. This stood above as
    // undecidable until the Transparenzdatenbankgesetz 2012 § 25 Abs. 2 asked
    // for its second sentence.
    expect(splitSentences('Es gilt Z 3. Der Bund zahlt.')).toEqual(['Es gilt Z 3.', 'Der Bund zahlt.'])
    expect(splitSentences('Abs. 1 gilt nicht für § 8 Abs. 1 Z 6. Die Ziffern gelten nur nach § 23 Abs. 1 Z 2. Z 11 gilt nur für Förderungen.')).toHaveLength(3)
    // A full stop inside a citation that goes on down the address stays open.
    expect(splitSentences('Im Sinne des § 4 Abs. 1. Z 1 lit. b gilt das. Mehr nicht.')).toBeNull()
  })

  it('reads a genitive ordinal as an ordinal', () => {
    // InvFG 2011 § 164 Abs. 1.
    expect(splitSentences('Er wird verwaltet. Die Bestimmungen des 2. Teiles 1. Hauptstückes sind anzuwenden.')).toEqual(['Er wird verwaltet.', 'Die Bestimmungen des 2. Teiles 1. Hauptstückes sind anzuwenden.'])
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
    // „3. Tag" may be an ordinal and a noun; „Z 3." could not (below).
    const l2: StandingLaw = { paragraphs: [para('9', 'H', ['Es gilt ab dem 3. Tag. Der Bund zahlt. Ende.'])] }
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

  it('changes the renumbered unit under its new designation when the same line goes on', () => {
    // Reisegebührenvorschrift 1955 § 7, BGBl. I Nr. 43/2026: the phrase half
    // addressed „Abs. 6" after its own first half had made it Abs. 5.
    const l: StandingLaw = { paragraphs: [para('7', 'Kosten', ['Eins.', 'Zwei.', 'Die Summe darf höchstens 2.450,00 Euro betragen.'])] }
    const { law: out, results } = run(
      l,
      instr('§ 7 Abs. 2 entfällt.'),
      instr('In § 7 erhält Abs. 3 die Absatzbezeichnung "(2)" und wird die Wortfolge "höchstens 2.450,00 Euro betragen" durch die Wortfolge "die Kosten nicht übersteigen" ersetzt.'),
    )
    expect(results.map((r) => r.reason)).toEqual([null, null, null])
    expect(out.paragraphs[0]!.children.map((c) => `${c.id}:${c.text}`)).toEqual(['1:Eins.', '2:Die Summe darf die Kosten nicht übersteigen.'])
  })

  it('enumerates a run of Litterae, as of Ziffern (D9552AF8, 3697C718; 26.10.2026)', () => {
    // „Zielbezeichnungen d) bis m) nicht aufzählbar": the last designation of
    // the run was read for a number, and a letter has none.
    const l = (): StandingLaw => {
      const p = makeNode('para', '3', '§ 3.', '', 'Begriffe')
      const body = makeNode('abs', '', '', 'Im Sinne dieser Verordnung bedeutet:')
      const z6 = makeNode('z', '6', '6.', 'Stoffe:')
      ;['a', 'b', 'c', 'd', 'e', 'f'].forEach((x) => z6.children.push(makeNode('lit', x, `${x})`, `alt ${x}`)))
      body.children.push(z6)
      p.children.push(body)
      return { paragraphs: [p] }
    }
    const lits = (out: StandingLaw) => out.paragraphs[0]!.children[0]!.children[0]!.children.map((c) => `${c.id}:${c.text}`)
    const down = run(
      l(),
      instr('In § 3 Z 6 entfällt die lit. b und die bisherigen lit. c bis e erhalten die Literabezeichnungen "b)" bis "d)".'),
      instr('In § 3 Z 6 erhält die bisherige lit. f die Literabezeichnung "e)" und lautet:', ['e) neu e']),
    )
    expect(down.results.map((r) => r.reason)).toEqual([null, null, null, null])
    expect(lits(down.law)).toEqual(['a:alt a', 'b:alt c', 'c:alt d', 'd:alt e', 'e:neu e'])
    // Upwards, and the insertion into the number the run vacated.
    const up = run(l(), instr('In § 3 Z 6 erhalten die lit. c bis f die Bezeichnung "d)" bis "g)"; nach lit. b wird folgende lit. c eingefügt:', ['c) neu c']))
    expect(up.results.map((r) => r.reason)).toEqual([null, null])
    expect(lits(up.law)).toEqual(['a:alt a', 'b:alt b', 'c:neu c', 'd:alt c', 'e:alt d', 'f:alt e', 'g:alt f'])
  })
})

describe('a unit replaced by one under another designation (26.10.2026)', () => {
  const l = (): StandingLaw => ({ paragraphs: [para('19', 'Neunzehn', ['Eins.', 'Zwei.', 'Drei.', 'Vier.', 'Fünf.'])] })
  const absaetze = (out: StandingLaw) => out.paragraphs[0]!.children.map((c) => `${c.marker} ${c.text}`)

  it('installs the new units under their own designations (74/ME XXVIII, BFA-VG § 19)', () => {
    // One to one, Abs. 5 kept its number and carried the text of the new Abs. 2.
    const { law: out, results } = run(l(), instr('In § 19 entfallen die Abs. 2 bis 4; Abs. 5 wird durch folgenden Abs. 2 ersetzt:', ['(2) Neu zwei.']))
    expect(results.map((r) => r.reason)).toEqual([null, null])
    expect(absaetze(out)).toEqual(['(1) Eins.', '(2) Neu zwei.'])
  })

  it('licenses a later „(neu)" on the new number', () => {
    const { law: out, results } = run(
      l(),
      instr('In § 19 entfallen die Abs. 2 bis 4; Abs. 5 wird durch folgenden Abs. 2 ersetzt:', ['(2) Neu zwei.']),
      instr('In § 19 Abs. 2 (neu) wird das Wort "Neu" durch das Wort "Nunmehr" ersetzt.'),
    )
    expect(results.map((r) => r.reason)).toEqual([null, null, null])
    expect(absaetze(out)).toEqual(['(1) Eins.', '(2) Nunmehr zwei.'])
  })

  it('refuses a „lautet" whose text carries another number, and a new number another unit still holds', () => {
    expect(run(l(), instr('§ 19 Abs. 5 lautet:', ['(2) Neu zwei.'])).results[0]!.reason).toBe('Neuer Text trägt eine andere Bezeichnung ((2)), die die Anweisung nicht ankündigt')
    const { law: out, results } = run(l(), instr('In § 19 werden die Abs. 2 und 3 durch folgende Abs. 3 und 4 ersetzt:', ['(3) Neu drei.', '(4) Neu vier.']))
    expect(results[0]!.reason).toBe('(4) existiert bereits')
    expect(absaetze(out)).toEqual(absaetze(l()))
  })
})

describe('a § the Novelle brings into being (22.10.2026)', () => {
  const standing = (): StandingLaw => ({ paragraphs: [para('43', 'Alt', ['Text des alten § 43.']), para('44', 'Stehend', ['Absatz 1 des stehenden § 44.'])] })

  it('refuses „Dem neuen § 44" where no renumbering or insertion made § 44', () => {
    // The renumbering „Der bisherige § 43 erhält die Bezeichnung § 44" was
    // refused by the grammar; the append landed on the STANDING § 44.
    const { law: out, results, unresolved } = run(standing(), instr('Dem neuen § 44 wird folgender Absatz 6 angefügt:', ['(6) Gemeint für den umbenannten § 43.']))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/neuer § 44/)
    expect(unresolved.has('§ 44')).toBe(true)
    expect(plainText(out.paragraphs[1]!)).not.toMatch(/umbenannten/)
  })

  it('applies it once the renumbering that made § 44 went through', () => {
    const l: StandingLaw = { paragraphs: [para('43', 'Alt', ['Text des alten § 43.'])] }
    const { law: out, results } = run(l, instr('Der bisherige § 43 erhält die Bezeichnung "§ 44".'), instr('Dem neuen § 44 wird folgender Abs. 2 angefügt:', ['(2) Neu.']))
    expect(results.map((r) => r.reason)).toEqual([null, null])
    expect(out.paragraphs.map((p) => p.id)).toEqual(['44'])
    expect(out.paragraphs[0]!.children.map((c) => c.id)).toEqual(['1', '2'])
  })

  it('applies it once an insertion made the §', () => {
    const l: StandingLaw = { paragraphs: [para('13', 'A', ['Eins.'])] }
    const { results } = run(
      l,
      instr('Nach § 13 wird folgender § 13l samt Überschrift eingefügt:', [{ text: 'Neu', heading: true }, '§ 13l. (1) Eins.', '(5) Fünf.']),
      instr('Nach dem neuen § 13l Abs. 5 wird folgender Abs. 6 eingefügt:', ['(6) Sechs.']),
    )
    expect(results.map((r) => r.reason)).toEqual([null, null])
  })

  it('reads „neu" of the § the address names, not of the § the line creates', () => {
    // „Nach § 8 wird ein neuer § 8a … eingefügt": the anchor is § 8.
    const l: StandingLaw = { paragraphs: [para('8', 'A', ['Eins.']), para('9', 'B', ['Zwei.'])] }
    const { law: out, results } = run(l, instr('Nach § 8 wird ein neuer § 8a samt Überschrift eingefügt:', [{ text: 'Neu', heading: true }, '§ 8a. Neuer Text.']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs.map((p) => p.id)).toEqual(['8', '8a', '9'])
  })

  it('leaves the new number of a failed renumbering unresolved, and the §§ a failed insertion announces', () => {
    // The standing law carries a § 44, so „§ 43 → § 44" collides; a later
    // „In § 44 …" would land on the standing one.
    const renumbering = run(standing(), instr('Der bisherige § 43 erhält die Bezeichnung "§ 44".'))
    expect(renumbering.results[0]!.applied).toBe(false)
    expect([...renumbering.unresolved].sort()).toEqual(['§ 43', '§ 44'])
    const insertion = run(standing(), instr('Nach § 43 wird folgender § 44 eingefügt:', ['§ 44. Neuer Text.']))
    expect(insertion.results[0]!.applied).toBe(false)
    expect([...insertion.unresolved].sort()).toEqual(['§ 43', '§ 44'])
  })

  it('names a failed schedule insertion’s new unit a schedule, not the § of its number', () => {
    // AIFMG, BGBl. I Nr. 57/2026: the lock belongs to the Anlage, § 5 is not
    // touched. Refused here because an Anlage 5 stands already.
    const anlage = (n: string) => {
      const node = makeNode('para', n, `Anl. ${n}`, '', null)
      node.children.push(makeNode('abs', '', '', `Anlage ${n}.`))
      return node
    }
    const l: StandingLaw = { paragraphs: [para('5', 'Fünf', ['Text.']), anlage('4'), anlage('5')] }
    const { results, unresolved } = run(l, instr('Nach der Anlage 4 zu § 30 wird folgende Anlage 5 zu § 14 eingefügt:', ['Anlage 5 zu § 14', 'Inhalt.']))
    expect(results[0]!.applied).toBe(false)
    expect(unresolved.has('§ 5')).toBe(false)
    expect(unresolved.has('Anlage 5')).toBe(true)
  })

  it('inserts a new § beside a schedule of its number (26.10.2026)', () => {
    const anlage = makeNode('para', '1', 'Anl. 1', '', null)
    anlage.children.push(makeNode('abs', '', '', 'Anlage eins.'))
    const l: StandingLaw = { paragraphs: [para('2', 'Zwei', ['Text.']), anlage] }
    const { law: out, results } = run(l, instr('Nach dem 1. Abschnitt wird folgender § 1 eingefügt:', ['§ 1. Neu.']))
    expect(results[0]!.applied).toBe(true)
    expect(out.paragraphs.map((p) => p.marker)).toEqual(['§ 1.', '§ 2.', 'Anl. 1'])
  })

  it('never inserts a new schedule as the § of its number (26.10.2026)', () => {
    // Marked „§ 5." it collided with § 5 — or, where the law has no § 5,
    // stood as a § the law does not have (88/ME XXVIII). A schedule's
    // designation and title stand outside the text RIS compares, so it is
    // refused as a schedule, and the lock is the Anlage's.
    const anlage = makeNode('para', '4', 'Anl. 4', '', null)
    anlage.children.push(makeNode('abs', '', '', 'Anlage vier.'))
    const l: StandingLaw = { paragraphs: [anlage] }
    const { law: out, results, unresolved } = run(l, instr('Nach der Anlage 4 zu § 30 wird folgende Anlage 5 zu § 14 eingefügt:', ['Anlage 5 zu § 14', 'Inhalt.']))
    expect(results[0]!.reason).toMatch(/Neue Anlage/)
    expect(out.paragraphs.map((p) => p.marker)).toEqual(['Anl. 4'])
    expect([...unresolved].sort()).toEqual(['Anlage 4', 'Anlage 5'])
  })
})

describe('a unit replaced by a text that opens with its own list (22.10.2026)', () => {
  // „§ 2 Z 2 lautet: ‚2. a) … b) …'": the list went into Z 2's text AND
  // stayed below it as Literae.
  const defs = (): StandingLaw => {
    const p = makeNode('para', '2', '§ 2.', '', 'Begriffsbestimmungen')
    const abs = makeNode('abs', '', '', 'Im Sinne dieses Bundesgesetzes bedeuten:')
    const z2 = makeNode('z', '2', '2.', '')
    z2.children.push(makeNode('lit', 'a', 'a)', 'alte Litera a;'), makeNode('lit', 'b', 'b)', 'alte Litera b;'))
    abs.children.push(makeNode('z', '1', '1.', 'Behörde: die Bezirksverwaltungsbehörde;'), z2, makeNode('z', '3', '3.', 'Antrag: das Ansuchen.'))
    p.children.push(abs)
    return { paragraphs: [p] }
  }

  it('installs the list once, as the unit’s children', () => {
    const { law: out, results } = run(defs(), instr('§ 2 Z 2 lautet:', ['2. a) neue Litera a;', 'b) neue Litera b;']))
    expect(results[0]!.reason).toBeNull()
    const z2 = out.paragraphs[0]!.children[0]!.children[1]!
    expect(z2.text).toBe('')
    expect(z2.children.map((c) => `${c.id}:${c.text}`)).toEqual(['a:neue Litera a;', 'b:neue Litera b;'])
    expect(plainText(out.paragraphs[0]!)).toBe('Begriffsbestimmungen Im Sinne dieses Bundesgesetzes bedeuten: Behörde: die Bezirksverwaltungsbehörde; neue Litera a; neue Litera b; Antrag: das Ansuchen.')
  })

  it('keeps the words in front of a list, and a text without markers whole', () => {
    // Without its own marker the new text is a § node carrying its words in `heading`.
    const intro = run(law(), instr('§ 5 Abs. 2 lautet:', ['Ausgenommen sind nur:', '1. Verfahren nach dem AVG.']))
    expect(intro.results[0]!.reason).toBeNull()
    const abs2 = intro.law.paragraphs[0]!.children[1]!
    expect(abs2.text).toBe('Ausgenommen sind nur:')
    expect(abs2.children.map((c) => c.text)).toEqual(['Verfahren nach dem AVG.'])
    const bare = run(law(), instr('§ 5 Abs. 1 lautet:', ['Dieses Bundesgesetz gilt für Verwaltungsverfahren.']))
    expect(bare.law.paragraphs[0]!.children[0]!.text).toBe('Dieses Bundesgesetz gilt für Verwaltungsverfahren.')
  })
})

describe('an insertion behind a unit whose number the § repeats (22.10.2026)', () => {
  // KfzStG-like: a § that prints „(6)" twice. The anchor fell back on the §
  // and the new Absatz went behind the FIRST „(6)", reported applied.
  const twice = (): StandingLaw => {
    const p = makeNode('para', '5', '§ 5.', '', 'Steuersätze')
    p.children.push(makeNode('abs', '6', '(6)', 'Erster Absatz sechs.'), makeNode('abs', '7', '(7)', 'Absatz sieben.'), makeNode('abs', '6', '(6)', 'Zweiter Absatz sechs.'))
    return { paragraphs: [p] }
  }

  it('refuses the insertion instead of choosing one of them', () => {
    const { law: out, results, unresolved } = run(twice(), instr('Nach § 5 Abs. 6 wird folgender Abs. 6a eingefügt:', ['(6a) Neu.']))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/^Anker nicht eindeutig/)
    expect(unresolved.has('§ 5')).toBe(true)
    expect(out.paragraphs[0]!.children.map((c) => c.id)).toEqual(['6', '7', '6'])
  })

  it('still inserts behind a unit that stands once, and refuses one that is missing as before', () => {
    const { law: out, results } = run(twice(), instr('Nach § 5 Abs. 7 wird folgender Abs. 7a eingefügt:', ['(7a) Neu.']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children.map((c) => c.id)).toEqual(['6', '7', '7a', '6'])
    expect(run(twice(), instr('Nach § 5 Abs. 9 wird folgender Abs. 9a eingefügt:', ['(9a) Neu.'])).results[0]!.reason).toMatch(/^Anker nicht gefunden/)
  })
})

describe('Anlagen sind keine Paragraphen (26.09.2026)', () => {
  /** A law that carries a § 1 and an Anl. 1 — the collision RIS's own numbering produces. */
  function withSchedule(): StandingLaw {
    const schedule = makeNode('para', '1', 'Anl. 1', 'Die Liste der unlauteren Praktiken.', 'Anhang')
    return { paragraphs: [para('1', 'Anwendungsbereich', ['Dieses Bundesgesetz gilt für alle Verfahren.']), schedule] }
  }

  it('sends an Anlage address to the Anlage and a § address to the §', () => {
    const one = run(withSchedule(), instr('In Anlage 1 wird das Wort "Liste" durch das Wort "Aufzählung" ersetzt.'))
    expect(one.results[0]!.reason).toBeNull()
    expect(one.law.paragraphs[1]!.text).toBe('Die Aufzählung der unlauteren Praktiken.')
    expect(one.law.paragraphs[0]!.children[0]!.text).toBe('Dieses Bundesgesetz gilt für alle Verfahren.')

    const two = run(withSchedule(), instr('In § 1 wird das Wort "Verfahren" durch das Wort "Sachen" ersetzt.'))
    expect(two.law.paragraphs[0]!.children[0]!.text).toBe('Dieses Bundesgesetz gilt für alle Sachen.')
    expect(two.law.paragraphs[1]!.text).toBe('Die Liste der unlauteren Praktiken.')
  })

  it('refuses an Anlage the law does not carry instead of taking the § of that number', () => {
    const { results } = run(withSchedule(), instr('In Anlage 2 wird das Wort "Liste" durch das Wort "Aufzählung" ersetzt.'))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/Nicht im geltenden Text/)
  })

  // Zweite Außenwirtschaftsverordnung 2019 (22.10.2026): „Die Anlage 1 und 2
  // lauten:" replaced § 1 — whichever of the two stood first in the stock.
  it('replaces, deletes and renames the Anlage an address names, never the § of its number', () => {
    const replaced = run(withSchedule(), instr('Die Anlage 1 lautet:', ['Die neue Liste.']))
    expect(replaced.results[0]!.reason).toBeNull()
    expect(plainText(replaced.law.paragraphs[0]!)).toBe('Anwendungsbereich Dieses Bundesgesetz gilt für alle Verfahren.')
    expect(replaced.law.paragraphs[1]!.marker).toBe('Anl. 1')
    expect(plainText(replaced.law.paragraphs[1]!)).toBe('Die neue Liste.')

    const deleted = run(withSchedule(), instr('Die Anlage 1 entfällt.'))
    expect(deleted.results[0]!.reason).toBeNull()
    expect(deleted.law.paragraphs.map((p) => p.marker)).toEqual(['§ 1.'])

    const renamed = run(withSchedule(), instr('§ 1 erhält die Paragraphenbezeichnung "§ 2".'))
    expect(renamed.results[0]!.reason).toBeNull()
    expect(renamed.law.paragraphs.map((p) => `${p.marker}:${p.id}`)).toEqual(['§ 2.:2', 'Anl. 1:1'])
  })

  // 26.10.2026: keyed by the bare number, „Anlage 1 erhält die Bezeichnung
  // ‚Anlage 2'" collided with a § 2, and where it went through it reported
  // § 1 as vacated and § 2 as the Anlage's — and the Anlage came out as „§ 2.".
  it('renames an Anlage as an Anlage, under the key the page holds it by', () => {
    const law = (): StandingLaw => ({ paragraphs: [...withSchedule().paragraphs.slice(0, 1), para('2', 'Zwei', ['Zwei.']), withSchedule().paragraphs[1]!] })
    const { law: out, results, renamed } = run(law(), instr('Die Anlage 1 erhält die Bezeichnung "Anlage 2".'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs.map((p) => `${p.marker}:${p.id}`)).toEqual(['§ 1.:1', '§ 2.:2', 'Anl. 2:2'])
    expect(renamed).toMatchObject([{ level: 'para', para: 'Anl. 2', from: 'Anl. 1', to: 'Anl. 2', origin: 'Anl. 1' }])
    const origin = renamedOrigins(renamed)
    expect(['Anl. 2', 'Anl. 1', '1', '2'].map(origin)).toEqual(['Anl. 1', null, '1', '2'])
    // A schedule takes a number or nothing.
    expect(run(law(), instr('Die Anlage 1 erhält die Bezeichnung "Anlage B".')).results[0]!.reason).toBe('Neue Bezeichnung nicht lesbar')
  })
})

describe('Schreibweise einer Fundstelle (26.09.2026)', () => {
  const cited = (): StandingLaw => ({ paragraphs: [para('5', 'A', ['Die Betreuung erfolgt nach dem BBU-Errichtungsgesetz, BGBl. I Nr. 53/2019.'])] })

  it('finds a citation the standing law spells with another dash', () => {
    const { law: out, results } = run(cited(), instr('In § 5 wird der Ausdruck "BBU - Errichtungsgesetz" durch den Ausdruck "BBU - G" ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    // And writes it the way this document writes its dashes, because the
    // ressort spells the name loose on both sides of its own instruction.
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Die Betreuung erfolgt nach dem BBU-G, BGBl. I Nr. 53/2019.')
  })

  it('does not tolerate a missing full stop in a citation', () => {
    const l: StandingLaw = { paragraphs: [para('5', 'A', ['Es gilt § 20 Abs. 1 und 7.'])] }
    const { results } = run(l, instr('In § 5 wird der Verweis auf "§ 20 Abs 1 und 7" durch den Verweis auf "§ 20 Abs. 1, 4 und 7" ersetzt.'))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/nicht gefunden/)
  })

  it('refuses where only the tolerance makes the text ambiguous', () => {
    const l: StandingLaw = { paragraphs: [para('5', 'A', ['Das BBU-Errichtungsgesetz und das BBU–Errichtungsgesetz.'])] }
    const { results } = run(l, instr('In § 5 wird der Ausdruck "BBU - Errichtungsgesetz" durch den Ausdruck "BBU - G" ersetzt.'))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/anderer Schreibweise 2×/)
  })

  it('leaves the draft\'s spelling alone where the document itself writes it loose', () => {
    // The place being replaced sets its own dash loose, so nothing here says
    // the new text should be set tight: the draft's spelling goes in as written.
    const l: StandingLaw = { paragraphs: [para('5', 'A', ['Das BBU – Errichtungsgesetz ist anzuwenden.'])] }
    const { law: out } = run(l, instr('In § 5 wird der Ausdruck "BBU - Errichtungsgesetz" durch den Ausdruck "GVG - B 2005" ersetzt.'))
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Das GVG - B 2005 ist anzuwenden.')
  })

  it('takes the tight spelling from the place it replaces', () => {
    // „BBU-Errichtungsgesetz" in the §, „BBU - Errichtungsgesetz" in the
    // instruction: the § is set tight, so the new name goes in tight too —
    // even one the § does not carry yet (BFA-VG § 28, BGBl. I Nr. 39/2026).
    const { law: out } = run(cited(), instr('In § 5 wird der Ausdruck "BBU - Errichtungsgesetz" durch den Ausdruck "BBU - Errichtungsgesetzes (BBU - G)" ersetzt.'))
    expect(out.paragraphs[0]!.children[0]!.text).toContain('dem BBU-Errichtungsgesetzes (BBU-G), BGBl.')
  })
})

describe('compound lines and punctuation (2026-09-09)', () => {
  it('refuses a compound line whole when one half is not read', () => {
    // Half-applying turned a full stop into a comma and stopped there.
    const units = [{ article: null, articleNumber: null, id: 'Z1', heading: null, quotedHeadings: [], stammnorm: null, text: '', blocks: [{ kind: 'novao' as const, cls: '', text: '1. In § 5 Abs. 1 wird der Punkt am Ende durch einen Beistrich ersetzt und es wird folgende Wendung angefügt:', gld: null }, { kind: 'abs' as const, cls: '', text: '"sofern nichts anderes bestimmt ist."', gld: null }] }]
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

  it('numbers the bisherige Inhalt as Abs. 1 and appends Abs. 2 behind it', () => {
    // Notariatsprüfungsgesetz § 29, BGBl. I Nr. 63/2026: the § had no Absatz
    // numbering, and the line in front of the Abs. 2 used to rename it § 1.
    const l: StandingLaw = { paragraphs: [makeNode('para', '29', '§ 29.', '', 'Übergang')] }
    l.paragraphs[0]!.children.push(makeNode('abs', '', '', 'Der bisherige Text.'))
    const { law: out, results } = run(
      l,
      instr('Der bisherige Inhalt des § 29 erhält die Absatzbezeichnung "(1)" .'),
      instr('Dem § 29 wird folgender Abs. 2 angefügt:', ['(2) Der neue Text.']),
    )
    expect(results.map((r) => r.reason)).toEqual([null, null])
    expect(out.paragraphs.map((p) => p.id)).toEqual(['29'])
    expect(out.paragraphs[0]!.children.map((c) => [c.id, c.marker, c.text])).toEqual([
      ['1', '(1)', 'Der bisherige Text.'],
      ['2', '(2)', 'Der neue Text.'],
    ])
  })

  it('refuses to draw in a level where the § already has numbered Absätze', () => {
    const { results } = run(law(), instr('Der bisherige Inhalt des § 5 erhält die Absatzbezeichnung "(1)".'))
    expect(results[0]!.applied).toBe(false)
  })

  it('refuses a heading replacement whose payload is a whole §', () => {
    const { results } = run(law(), instr('Die Überschrift des § 6 lautet:', ['§ 6. (1) Erster.', '(2) Zweiter.']))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/Fließtext/)
  })

  it('reads the same line as two operations where it carries two', () => {
    // "Es entfällt die Überschrift des § 6 und § 6 lautet: …" says both things
    // outright, and since 26.09.2026 the conjunction separates them. It was
    // refused as one ambiguous heading replacement before — the reading above
    // is what remains dangerous, and it is the one without the conjunction.
    const { law: out, results } = run(law(), instr('Es entfällt die Überschrift des § 6 und § 6 lautet:', ['§ 6. (1) Erster.', '(2) Zweiter.']))
    expect(results.map((r) => r.applied)).toEqual([true, true])
    expect(out.paragraphs[1]!.heading).toBeNull()
    expect(out.paragraphs[1]!.children.map((c) => c.text)).toEqual(['Erster.', 'Zweiter.'])
  })

  it('refuses a payload that is a table, and a standing § that holds one', () => {
    const units = [{ article: null, articleNumber: null, id: 'Z1', heading: null, quotedHeadings: [], stammnorm: null, text: '', blocks: [{ kind: 'novao' as const, cls: '', text: '1. § 6 Abs. 1 lautet:', gld: null }, { kind: 'other' as const, cls: 'table:absatz/tabtext', text: '2022 7,5 Mio. Euro', gld: null }] }]
    const { instructions, refused } = instructionsFromUnits(units)
    expect(instructions).toHaveLength(0)
    expect(refused[0]!.reason).toMatch(/Tabelle/)
    // The standing § is read since 26.09.2026 — the table as ONE opaque
    // block, its cells never as Absätze (§12.12).
    const node = parseKonsParagraph('<risdok><nutzdaten><abschnitt><absatz typ="abs" ct="text"><gldsym>§ 26.</gldsym> Text</absatz><table><tr><td><absatz typ="tabtext" ct="text">Zelle</absatz></td></tr></table></abschnitt></nutzdaten></risdok>')!
    expect(node.children.map((c) => `${c.level}:${c.id}`)).toEqual(['abs:'])
    expect(node.children[0]!.children.map((c) => `${c.level}:${c.id}`)).toEqual(['schluss:tabelle'])
    expect(plainText(node)).toBe('Text Zelle')
  })

  // The other half of reading them: the Gebührengesetz prints its
  // Tarifposten as headings inside § 14, so the § holds a dozen Absätze
  // „(2)" and „§ 14 Tarifpost 8 Abs. 2" would edit the first of them.
  it('leaves a § with a table unloaded when its designations do not tell the units apart', () => {
    const xml = (second: string): string =>
      `<risdok><nutzdaten><abschnitt><absatz typ="abs" ct="text"><gldsym>§ 14.</gldsym> (1) Erster Tarifposten</absatz>` +
      `<table><tr><td><absatz typ="tabtext" ct="text">21 Euro</absatz></td></tr></table>` +
      `<absatz typ="abs" ct="text">(${second}) Zweiter Tarifposten</absatz></abschnitt></nutzdaten></risdok>`
    expect(parseKonsParagraph(xml('1'))).toBeNull()
    expect(parseKonsParagraph(xml('2'))).not.toBeNull()
  })

  // A closing clause and a table are both `schluss` nodes; only the clause
  // answers „Im Schlussteil des Absatzes".
  it('does not let a table take the Schlussteil slot', () => {
    const abs = makeNode('abs', '1', '(1)', 'Zu entrichten sind')
    abs.children.push(makeNode('schluss', 'schluss', '', 'je Bogen.'), makeNode('schluss', 'tabelle', '', '21 Euro'))
    const p = makeNode('para', '9', '§ 9.', '')
    p.children.push(abs)
    const { law: out, results } = run({ paragraphs: [p] }, instr('Im Schlussteil des § 9 Abs. 1 wird das Wort "Bogen" durch das Wort "Blatt" ersetzt.', []))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children.map((c) => c.text)).toEqual(['je Blatt.', '21 Euro'])
  })
})

describe('an appended unit goes to the end of the list, not past its closing clause (2026-09-23)', () => {
  /** "(1) Anzuzeigen sind 1. … 2. … Die Anzeige hat schriftlich zu erfolgen." */
  function withSchlussteil(): StandingLaw {
    const abs = makeNode('abs', '1', '(1)', 'Anzuzeigen sind')
    abs.children.push(makeNode('z', '1', '1.', 'der Beginn,'), makeNode('z', '2', '2.', 'das Ende.'), makeNode('schluss', 'schluss', '', 'Die Anzeige hat schriftlich zu erfolgen.'))
    const p = makeNode('para', '7', '§ 7.', '', 'Anzeigepflicht')
    p.children.push(abs)
    return { paragraphs: [p] }
  }

  // `host.children.push(...)` put the new Ziffer behind the Schlussteil, and
  // the closing clause then read as part of the enumeration. No word is
  // invented and the size barely moves, so `guardParagraph` passes it — the
  // kind of error only the order of the children shows.
  it('inserts the new Ziffer in front of the Schlussteil', () => {
    const { law: out, results } = run(withSchlussteil(), instr('Dem § 7 Abs. 1 wird folgende Z 3 angefügt:', ['3. die Unterbrechung.']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children.map((c) => `${c.level}:${c.id}`)).toEqual(['z:1', 'z:2', 'z:3', 'schluss:schluss'])
    expect(plainText(out.paragraphs[0]!)).toBe('Anzeigepflicht Anzuzeigen sind der Beginn, das Ende. die Unterbrechung. Die Anzeige hat schriftlich zu erfolgen.')
  })

  it('still appends at the end where the host has no closing clause', () => {
    const { law: out } = run(law(), instr('Dem § 5 Abs. 2 wird folgende Z 3 angefügt:', ['3. Verfahren vor dem Verfassungsgerichtshof.']))
    expect(out.paragraphs[0]!.children[1]!.children.map((c) => c.id)).toEqual(['1', '2', '3'])
  })
})

describe('a word operand matches whole words only (2026-09-23)', () => {
  // "das Wort 'Amt' durch das Wort 'Behörde'" over "Die Amtsstelle
  // entscheidet." produced "Die Behördesstelle entscheidet." The guard caught
  // it as `unerklärt` and withheld the § — with a reason about unexplained
  // words, which says nothing about the real fault.
  it('refuses a word that occurs only inside a longer one', () => {
    const l: StandingLaw = { paragraphs: [para('5', 'Zuständigkeit', ['Die Amtsstelle entscheidet.'])] }
    const { law: out, results } = run(l, instr('In § 5 Abs. 1 wird das Wort "Amt" durch das Wort "Behörde" ersetzt.'))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/^Textstelle nicht gefunden/)
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Die Amtsstelle entscheidet.')
  })

  it('replaces the standing word where it stands on its own', () => {
    const l: StandingLaw = { paragraphs: [para('5', 'Zuständigkeit', ['Das Amt entscheidet, die Amtsstelle berät.'])] }
    const { law: out, results } = run(l, instr('In § 5 Abs. 1 wird das Wort "Amt" durch das Wort "Behörde" ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Das Behörde entscheidet, die Amtsstelle berät.')
  })

  // "jeweils" over the same text: only the standalone occurrences move.
  it('leaves the inner occurrences alone when every occurrence is meant', () => {
    const l: StandingLaw = { paragraphs: [para('5', 'Zuständigkeit', ['Das Amt entscheidet, die Amtsstelle berät, das Amt schließt ab.'])] }
    const { law: out } = run(l, instr('In § 5 Abs. 1 wird jeweils das Wort "Amt" durch das Wort "Behörde" ersetzt.'))
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Das Behörde entscheidet, die Amtsstelle berät, das Behörde schließt ab.')
  })

  // A Wortfolge may begin or end mid-word by design, and demanding a boundary
  // there would refuse instructions that are perfectly sound.
  it('leaves a Wortfolge matching as a substring', () => {
    const l: StandingLaw = { paragraphs: [para('5', 'Zuständigkeit', ['Die Amtsstelle entscheidet.'])] }
    const { law: out, results } = run(l, instr('In § 5 Abs. 1 wird die Wortfolge "Amtsstelle" durch die Wortfolge "Behörde" ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Die Behörde entscheidet.')
  })
})

describe('„jeweils" über mehrere Einheiten einer Adresse (26.09.2026)', () => {
  // „In § 81 Abs. 1 und 2 wird das Wort „Acten" jeweils durch das Wort
  // „Akten" ersetzt" is ONE address over two Absätze, and the word stands
  // once in each. Asked across the union it is found twice and the whole
  // instruction is refused — 95 of 804 refusals over the corpus, the largest
  // class of instructions that were read correctly and then not carried out.
  //
  // `everyOccurrence` in `kons/novao.ts` has stated the rule since it was
  // written: with several places „jeweils" distributes over them and inside
  // each the phrase must still be unique. The reading half obeyed it, the
  // applying half never got the units to obey it in.
  const twoAbsaetze = (): StandingLaw => ({
    paragraphs: [para('81', 'Akteneinsicht', ['Die Acten sind zu führen.', 'Die Acten sind aufzubewahren.'])],
  })

  it('applies the change once in each addressed Absatz', () => {
    const { law: out, results } = run(twoAbsaetze(), instr('In § 81 Abs. 1 und 2 wird das Wort "Acten" jeweils durch das Wort "Akten" ersetzt.'))
    expect(results.every((r) => r.reason === null), results.map((r) => r.reason).join(' | ')).toBe(true)
    expect(plainText(out.paragraphs[0]!.children[0]!)).toBe('Die Akten sind zu führen.')
    expect(plainText(out.paragraphs[0]!.children[1]!)).toBe('Die Akten sind aufzubewahren.')
  })

  it('deletes and inserts per unit too', () => {
    const l: StandingLaw = { paragraphs: [para('34', 'Mitwirkung', ['Die Behörden der Länder wirken mit.', 'Die Ämter der Länder berichten.'])] }
    const { law: del, results: r1 } = run(l, instr('In § 34 Abs. 1 und 2 entfällt jeweils die Wortfolge "der Länder".'))
    expect(r1.every((r) => r.reason === null)).toBe(true)
    expect(plainText(del.paragraphs[0]!.children[0]!)).toBe('Die Behörden wirken mit.')
    expect(plainText(del.paragraphs[0]!.children[1]!)).toBe('Die Ämter berichten.')

    const l2: StandingLaw = { paragraphs: [para('12', 'Verweise', ['Es gilt Abs. 4 sinngemäß.', 'Auch Abs. 4 bleibt unberührt.'])] }
    const { law: ins, results: r2 } = run(l2, instr('In § 12 Abs. 1 und 2 wird nach dem Zitat "Abs. 4" jeweils das Zitat "oder § 46a" eingefügt.'))
    expect(r2.every((r) => r.reason === null), r2.map((r) => r.reason).join(' | ')).toBe(true)
    expect(plainText(ins.paragraphs[0]!.children[0]!)).toContain('Abs. 4 oder § 46a')
    expect(plainText(ins.paragraphs[0]!.children[1]!)).toContain('Abs. 4 oder § 46a')
  })

  // Without „jeweils" the address is ONE place however many units it spans,
  // and the phrase must be unique across all of them — with one reading more
  // since 06.10.2026 (`locatePhrase`): once in EACH named unit and nowhere
  // twice is the instruction meant unit by unit. The worry the rule names,
  // an address of two units that means one, has the phrase in one of them.
  it('reads the phrase once in each named unit as meant unit by unit', () => {
    const { law: out, results } = run(twoAbsaetze(), instr('In § 81 Abs. 1 und 2 wird das Wort "Acten" durch das Wort "Akten" ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    expect(plainText(out.paragraphs[0]!.children[0]!)).toBe('Die Akten sind zu führen.')
    expect(plainText(out.paragraphs[0]!.children[1]!)).toBe('Die Akten sind aufzubewahren.')
  })

  it('applies once where only one of the named units carries the phrase', () => {
    const l: StandingLaw = { paragraphs: [para('81', 'Akteneinsicht', ['Die Acten sind zu führen.', 'Die Unterlagen sind aufzubewahren.'])] }
    const { law: out, results } = run(l, instr('In § 81 Abs. 1 und 2 wird das Wort "Acten" durch das Wort "Akten" ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    expect(plainText(out.paragraphs[0]!.children[0]!)).toBe('Die Akten sind zu führen.')
  })

  it('keeps refusing where one named unit carries the phrase twice', () => {
    const l: StandingLaw = { paragraphs: [para('81', 'Akteneinsicht', ['Die Acten sind zu führen, die Acten sind zu ordnen.', 'Die Acten sind aufzubewahren.'])] }
    const { law: out, results } = run(l, instr('In § 81 Abs. 1 und 2 wird das Wort "Acten" durch das Wort "Akten" ersetzt.'))
    expect(results[0]!.reason).toMatch(/nicht eindeutig/)
    expect(plainText(out.paragraphs[0]!.children[1]!)).toBe('Die Acten sind aufzubewahren.')
  })

  // „jeweils" is the ressort saying every one of the units carries the
  // phrase. A unit that does not is a disagreement about the standing text,
  // so the instruction is refused rather than half-applied.
  it('refuses when one of the addressed units does not carry the phrase', () => {
    const l: StandingLaw = { paragraphs: [para('81', 'Akteneinsicht', ['Die Acten sind zu führen.', 'Die Unterlagen sind aufzubewahren.'])] }
    const { law: out, results } = run(l, instr('In § 81 Abs. 1 und 2 wird das Wort "Acten" jeweils durch das Wort "Akten" ersetzt.'))
    expect(results[0]!.reason).toMatch(/nicht gefunden/)
    // …and nothing is written: a half-applied instruction is the one outcome
    // the engine may never produce.
    expect(plainText(out.paragraphs[0]!.children[0]!)).toBe('Die Acten sind zu führen.')
  })

  // The single-place reading of „jeweils" is untouched: there it still means
  // every occurrence INSIDE the one unit.
  it('still means every occurrence where the address names one place', () => {
    const l: StandingLaw = { paragraphs: [para('5', 'Amt', ['Das Amt entscheidet, das Amt verkündet.'])] }
    const { law: out, results } = run(l, instr('In § 5 wird jeweils das Wort "Amt" durch das Wort "Behörde" ersetzt.'))
    expect(results.every((r) => r.reason === null)).toBe(true)
    expect(plainText(out.paragraphs[0]!.children[0]!)).toBe('Das Behörde entscheidet, das Behörde verkündet.')
  })
})

describe('an Abschnitt is not the § of its number (02.10.2026)', () => {
  // The standing text holds no Abschnitt. Looked up by the number, every one
  // of these wrote into § 4 and reported success.
  // The § the refused Abschnitt's text would install is locked with it
  // (`createdParagraphs`, 26.10.2026): it stands nowhere in the result, and a
  // standing § 10 must not be shown as if the line had never been written.
  it.each([
    ['Die Überschrift des 4. Abschnitts lautet:', ['Schlussbestimmungen'], ['Abschnitt 4']],
    ['Der 4. Abschnitt lautet:', ['§ 10. Neu.'], ['Abschnitt 4', '§ 10']],
    ['Im 4. Abschnitt wird das Wort "Amt" durch das Wort "Behörde" ersetzt.', [], ['Abschnitt 4']],
    ['Abschnitt 4 entfällt.', [], ['Abschnitt 4']],
  ])('refuses „%s"', (line, payload, locked) => {
    const l: StandingLaw = { paragraphs: [para('4', 'Zuständigkeit', ['Das Amt entscheidet.'])] }
    const { law: out, results, unresolved } = run(l, instr(line, payload))
    expect(results[0]!.reason).toMatch(/Gliederung über dem Paragraphen/)
    expect(out.paragraphs[0]!.heading).toBe('Zuständigkeit')
    expect(plainText(out.paragraphs[0]!)).toBe('Zuständigkeit Das Amt entscheidet.')
    expect([...unresolved]).toEqual(locked)
  })

  // Gaswirtschaftsgesetz 2011: a new § is wholly its payload, so it goes where
  // its number puts it — not behind § 2, where the Abschnitt's number sent it.
  it('inserts the §§ an Abschnitt anchors by their number', () => {
    const l: StandingLaw = { paragraphs: [para('2', 'A', ['Zwei.']), para('148', 'B', ['Alt.']), para('149', 'C', ['Neun.'])] }
    const { law: out, results } = run(l, instr('Nach der Überschrift zum 2. Abschnitt des 15. Teils werden folgende §§ 148a und 148b samt Überschriften eingefügt:', ['§ 148a. Erstens', 'Text a.', '§ 148b. Zweitens', 'Text b.']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs.map((p) => p.id)).toEqual(['2', '148', '148a', '148b', '149'])
  })
})

describe('„jeweils" bei einer Operation an einer Stelle (02.10.2026)', () => {
  // „In § 35 Abs. 1c und 1d entfällt jeweils der letzte Satz" (KommAustria-
  // Gesetz): the sentence branch resolved the address once, struck the
  // sentence from the first Absatz and reported the line applied.
  const twoAbsaetze = (): StandingLaw => ({
    paragraphs: [para('35', 'Aufsicht', ['Die Behörde prüft. Sie berichtet jährlich.', 'Der Beirat berät. Er tagt jährlich.', 'Das bleibt.'])],
  })

  it('strikes the sentence from every Absatz the address lists', () => {
    const { law: out, results } = run(twoAbsaetze(), instr('In § 35 Abs. 1 und 2 entfällt jeweils der letzte Satz.'))
    expect(results.every((r) => r.applied), results.map((r) => r.reason).join(' | ')).toBe(true)
    expect(out.paragraphs[0]!.children.map((c) => plainText(c))).toEqual(['Die Behörde prüft.', 'Der Beirat berät.', 'Das bleibt.'])
  })

  it('appends the sentence to every Absatz, and the Absatz to every §', () => {
    const { law: out, results } = run(twoAbsaetze(), instr('Dem § 35 Abs. 1 und 2 wird jeweils folgender Satz angefügt:', ['Näheres regelt eine Verordnung.']))
    expect(results.every((r) => r.applied), results.map((r) => r.reason).join(' | ')).toBe(true)
    expect(plainText(out.paragraphs[0]!.children[0]!)).toBe('Die Behörde prüft. Sie berichtet jährlich. Näheres regelt eine Verordnung.')
    expect(plainText(out.paragraphs[0]!.children[1]!)).toBe('Der Beirat berät. Er tagt jährlich. Näheres regelt eine Verordnung.')
    expect(plainText(out.paragraphs[0]!.children[2]!)).toBe('Das bleibt.')

    const l: StandingLaw = { paragraphs: [para('34', 'A', ['Eins.', 'Zwei.']), para('35', 'B', ['Eins.', 'Zwei.'])] }
    const { law: both, results: r2 } = run(l, instr('Den §§ 34 und 35 wird jeweils folgender Abs. 3 angefügt:', ['(3) Drei.']))
    expect(r2.every((r) => r.applied), r2.map((r) => r.reason).join(' | ')).toBe(true)
    expect(both.paragraphs.map((p) => p.children.map((c) => c.id))).toEqual([['1', '2', '3'], ['1', '2', '3']])
  })

  // Without „jeweils" the last sentence of each Absatz and the last of the
  // two together are both readings; the line is refused, not guessed.
  it('refuses the same line without „jeweils"', () => {
    expect(parseInstruction('In § 35 Abs. 1 und 2 entfällt der letzte Satz.').reason).toMatch(/ohne „jeweils"/)
    expect(parseInstruction('Dem § 35 Abs. 1 und 2 wird folgender Satz angefügt:').reason).toMatch(/ohne „jeweils"/)
  })

  // The engine's own guard, for an op that reaches it with siblings anyway.
  it('refuses an op at one place whose address still lists several units', () => {
    const op = parseInstruction('In § 35 Abs. 1 entfällt der letzte Satz.').ops[0]!
    if (op.kind !== 'delete') throw new Error(op.kind)
    const { law: out, results } = applyNovelle(twoAbsaetze(), [{ op: { ...op, target: { ...op.target, siblings: ['2'] } }, payload: [], line: '' }])
    expect(results[0]!.reason).toMatch(/Mehrere Einheiten für eine Stelle/)
    expect(plainText(out.paragraphs[0]!.children[0]!)).toBe('Die Behörde prüft. Sie berichtet jährlich.')
  })
})

describe('a list extended by the clause behind its last Ziffer (26.09.2026)', () => {
  it('appends the new Ziffern to the Absatz, in front of its Schlussteil', () => {
    const l: StandingLaw = { paragraphs: [para('31a', 'Pflichten', [{ text: 'Der Arbeitgeber hat', ziffern: ['A zu tun,', 'B zu tun.'] }])] }
    const { law: out, results } = run(l, instr('In § 31a Abs. 1 wird der Punkt am Ende der Z 2 durch einen Strichpunkt ersetzt; folgende Z 3 und 4 werden angefügt:', ['3. C zu tun;', '4. D zu tun.']))
    expect(results.map((r) => r.reason)).toEqual([null, null])
    expect(out.paragraphs[0]!.children[0]!.children.map((c) => `${c.id}:${c.text}`)).toEqual(['1:A zu tun,', '2:B zu tun;', '3:C zu tun;', '4:D zu tun.'])
  })

  it('appends Ziffern of a § without Absatz numbering inside its one Absatz', () => {
    // Fern- und Auswärtsgeschäfte-Gesetz § 3: the Ziffern hang off the unnumbered Absatz.
    const p = makeNode('para', '3', '§ 3.', '', 'Begriffe')
    const body = makeNode('abs', '', '', 'Im Sinne dieses Gesetzes bedeutet')
    body.children.push(makeNode('z', '1', '1.', 'eins;'), makeNode('z', '2', '2.', 'zwei.'))
    p.children.push(body)
    const { law: out, results } = run({ paragraphs: [p] }, instr('In § 3 wird der Punkt am Ende der Z 2 durch einen Strichpunkt ersetzt; folgende Z 3 wird angefügt:', ['3. drei.']))
    expect(results.map((r) => r.reason)).toEqual([null, null])
    expect(out.paragraphs[0]!.children).toHaveLength(1)
    expect(out.paragraphs[0]!.children[0]!.children.map((c) => `${c.id}:${c.text}`)).toEqual(['1:eins;', '2:zwei;', '3:drei.'])
  })
})

describe('a list of §§ is every § it names (26.09.2026)', () => {
  it('marks every § of a failed list unresolved, not the first one only', () => {
    // § 13 stood unmarked, so a loaded § 13 would have been shown untouched.
    const l: StandingLaw = { paragraphs: [para('12a', 'A', ['a'])] }
    const { results, unresolved } = run(l, instr('Die §§ 12a und 13 entfallen samt Überschriften.'))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toBe('§ nicht im geltenden Text: § 13')
    expect([...unresolved].sort()).toEqual(['§ 12a', '§ 13'])
  })

  it('replaces a range whose last § is new, where the payload spells out each one', () => {
    // BUAG, BGBl. I Nr. 66/2026: „Die §§ 34a bis 34e samt Überschriften lauten:", § 34e new.
    const l: StandingLaw = { paragraphs: [para('34', 'Z', ['z']), para('34a', 'A', ['alt a']), para('34b', 'B', ['alt b']), para('35', 'N', ['n'])] }
    const { law: out, results } = run(l, instr('Die §§ 34a bis 34c samt Überschriften lauten:', [{ text: 'Neu A', heading: true }, '§ 34a. neu a', { text: 'Neu B', heading: true }, '§ 34b. neu b', { text: 'Neu C', heading: true }, '§ 34c. neu c']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs.map((p) => p.id)).toEqual(['34', '34a', '34b', '34c', '35'])
    expect(out.paragraphs.find((p) => p.id === '34c')!.heading).toBe('Neu C')
  })

  it('refuses such a range where the payload is not exactly the named §§', () => {
    const l: StandingLaw = { paragraphs: [para('34a', 'A', ['alt a']), para('34b', 'B', ['alt b'])] }
    const { results } = run(l, instr('Die §§ 34a bis 34c samt Überschriften lauten:', ['§ 34a. neu a', '§ 34b. neu b']))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toBe('§ nicht im geltenden Text: § 34c')
  })
})

describe('the sentences of a § without Absatz numbering (26.09.2026)', () => {
  /** § 8 as RIS files it: one Absatz without designation. */
  function unnumbered(text: string, ziffern: string[] = [], schluss: string | null = null): StandingLaw {
    const p = makeNode('para', '8', '§ 8.', '', 'Auskunftspflicht')
    const body = makeNode('abs', '', '', text)
    ziffern.forEach((z, i) => body.children.push(makeNode('z', String(i + 1), `${i + 1}.`, z)))
    if (schluss) body.children.push(makeNode('schluss', 'schluss', '', schluss))
    p.children.push(body)
    return { paragraphs: [p] }
  }

  it('counts the sentences of its one Absatz', () => {
    // Erneuerbaren-Ausbau-Gesetz § 8, BGBl. I Nr. 47/2026.
    const { law: out, results } = run(unnumbered('Alle sind verpflichtet, Daten zur Prüfung und zur Planung zu übermitteln. Das gilt auch sonst.'), instr('In § 8 erster Satz entfällt die Wortfolge "und zur Planung".'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Alle sind verpflichtet, Daten zur Prüfung zu übermitteln. Das gilt auch sonst.')
  })

  it('finds the Schlussteil behind its list', () => {
    // Pflichtschulabschluss-Prüfungs-Gesetz § 11, BGBl. I Nr. 76/2026.
    const { law: out, results } = run(unnumbered('Den Prüfern der', ['ersten Kommission,', 'zweiten Kommission'], 'gebührt eine Abgeltung gemäß dem Prüfungstaxengesetz - Schulen/Pädagogische Hochschulen.'), instr('Im Schlussteil des § 8 entfällt die Wendung " - Schulen/Pädagogische Hochschulen".'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children.at(-1)!.text).toBe('gebührt eine Abgeltung gemäß dem Prüfungstaxengesetz.')
  })

  it('appends a sentence to its one Absatz, not beside it', () => {
    const { law: out, results } = run(unnumbered('Der erste Satz.'), instr('Dem § 8 wird folgender Satz angefügt:', ['Der zweite Satz.']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children).toHaveLength(1)
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Der erste Satz. Der zweite Satz.')
  })
})

describe('the sentences of an Absatz that carries a list (26.09.2026)', () => {
  /** § 9 Abs. 1 with an Einleitung, a list and optionally a Schlussteil. */
  function listed(lead: string, ziffern: string[], schluss: string | null): StandingLaw {
    const p = para('9', 'Beirat', [{ text: lead, ziffern }])
    if (schluss) p.children[0]!.children.push(makeNode('schluss', 'schluss', '', schluss))
    return { paragraphs: [p] }
  }
  const textOf = (out: StandingLaw) => plainText(out.paragraphs[0]!.children[0]!)

  it('finds the last sentence in the Schlussteil behind the tail of the list sentence', () => {
    // Gesundheitsqualitätsgesetz § 9a Abs. 1, BGBl. I Nr. 64/2026.
    const l = listed('Die Bundesministerin hat eine Kommission unter Einbeziehung von Vertretern', ['des Bundes,', 'der Länder'], 'einzurichten. Neben den in Z 1 bis 2 genannten Vertretern können weitere beigezogen werden.')
    const { law: out, results } = run(l, instr('In § 9 Abs. 1 letztem Satz wird die Zahl "2" durch die Zahl "3" ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    expect(textOf(out)).toContain('Neben den in Z 1 bis 3 genannten')
  })

  it('takes the whole Schlussteil as the last sentence where it opens one of its own', () => {
    // Umweltförderungsgesetz § 23 Abs. 1: the last Ziffer closes with a full stop.
    const l = listed('Angestrebt werden Maßnahmen, die', ['Energie sparen oder', 'Emissionen senken.'], 'Insgesamt soll damit ein Beitrag zum Umweltschutz geleistet werden.')
    const { law: out, results } = run(l, instr('In § 9 Abs. 1 letzter Satz wird das Wort "Umweltschutz" durch den Ausdruck "Klima- und Umweltschutz" ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    expect(textOf(out)).toContain('Beitrag zum Klima- und Umweltschutz geleistet')
  })

  it('counts the complete sentences in front of the list from the front', () => {
    // Stabilitätsabgabegesetz § 5 Abs. 1.
    const l = listed('Für die Kalenderjahre 2025 und 2026 ist eine Sonderzahlung zu entrichten. Dabei gilt:', ['Die Sonderzahlung beträgt 1 %.', 'Sie ist sofort fällig.'], null)
    const { law: out, results } = run(l, instr('In § 9 Abs. 1 erster Satz wird die Wortfolge "Kalenderjahre 2025 und 2026" durch die Wortfolge "Kalenderjahre 2025 bis 2029" ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Für die Kalenderjahre 2025 bis 2029 ist eine Sonderzahlung zu entrichten. Dabei gilt:')
  })

  it('opens the sentence that runs through the list to a phrase in one of its pieces', () => {
    // Volksanwaltschaftsgesetz 1982 § 1 Abs. 2: the whole Absatz is one sentence.
    const l = listed('Außer der Geschäftsverteilung gemäß Art. 148h Abs. 4 B-VG unterliegen dem Kollegium:', ['Empfehlungen gemäß Art. 148c B-VG,', 'Berichte gemäß Art. 148d B-VG.'], null)
    const { law: out, results } = run(l, instr('In § 9 Abs. 1 erster Satz wird der Ausdruck "Art. 148h Abs. 4" durch den Ausdruck "Art. 148h Abs. 5" ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Außer der Geschäftsverteilung gemäß Art. 148h Abs. 5 B-VG unterliegen dem Kollegium:')
  })

  it('still refuses to replace or delete the sentence that runs through the list', () => {
    const l = () => listed('Ausgenommen sind:', ['Verfahren nach dem AVG,', 'Verfahren vor Gerichten'], 'soweit nichts anderes bestimmt ist. Das gilt sinngemäß.')
    expect(run(l(), instr('§ 9 Abs. 1 erster Satz lautet:', ['Neu.'])).results[0]!.applied).toBe(false)
    expect(run(l(), instr('In § 9 Abs. 1 entfällt der erste Satz.')).results[0]!.applied).toBe(false)
    // The sentence behind it is an ordinary one.
    const { law: out, results } = run(l(), instr('In § 9 Abs. 1 entfällt der letzte Satz.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children.at(-1)!.text).toBe('soweit nichts anderes bestimmt ist.')
  })

  it('refuses to count forward past the list', () => {
    const l = listed('Ausgenommen sind:', ['Verfahren nach dem AVG,', 'Verfahren vor Gerichten'], 'soweit nichts anderes bestimmt ist. Das gilt sinngemäß.')
    expect(run(l, instr('In § 9 Abs. 1 zweiter Satz wird das Wort "sinngemäß" durch das Wort "entsprechend" ersetzt.')).results[0]!.applied).toBe(false)
  })
})

describe('an insertion in front of the mark that ends the unit (27.09.2026)', () => {
  it('writes before the last full stop, not before any', () => {
    // Zahnärztegesetz § 22 Abs. 2: „gemäß § 5 Abs. 1" carries full stops of its own.
    const l: StandingLaw = { paragraphs: [para('22', 'Pflichten', ['Sie haben gemäß § 5 Abs. 1 teilzunehmen.'])] }
    const { law: out, results } = run(l, instr('In § 22 Abs. 1 wird vor dem Punkt am Ende der Halbsatz " , sofern Standards betroffen sind" eingefügt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Sie haben gemäß § 5 Abs. 1 teilzunehmen, sofern Standards betroffen sind.')
  })

  it('refuses where the unit does not end on that mark', () => {
    const l: StandingLaw = { paragraphs: [para('22', 'Pflichten', ['Sie haben teilzunehmen:'])] }
    expect(run(l, instr('In § 22 Abs. 1 wird vor dem Punkt am Ende der Halbsatz " , sofern x" eingefügt.')).results[0]!.applied).toBe(false)
  })
})

describe('a new heading keeps a quotation it ends on (27.09.2026)', () => {
  it('does not strip the heading a second time', () => {
    // AsylG 2005 § 59: `segmentUnits` has unquoted the heading line already.
    const lines = stripPayloadQuotes([{ text: 'Verfahren und der "Aufenthaltsberechtigung besonderer Schutz"', heading: true }])
    expect(lines).toEqual([{ text: 'Verfahren und der "Aufenthaltsberechtigung besonderer Schutz"', heading: true }])
    // The body behind a heading still loses the instruction's closing mark.
    expect(stripPayloadQuotes([{ text: 'Titel', heading: true }, '§ 5. (1) Text."'])).toEqual([{ text: 'Titel', heading: true }, '§ 5. (1) Text.'])
  })
})

describe('a Halbsatz is where the new text says it ends (27.09.2026)', () => {
  const l = (): StandingLaw => ({ paragraphs: [para('169', 'Strafen', ['Die Behörde kann vom Halter Auskünfte darüber verlangen, wer das Luftfahrzeug verwendet hat. Diese Auskünfte sind zu erteilen.'])] })

  it('replaces the first Halbsatz up to the comma the new text ends on', () => {
    // LFG § 169 Abs. 5, BGBl. I Nr. 80/2026.
    const { law: out, results } = run(l(), instr('§ 169 Abs. 1 erster Halbsatz lautet:', ['Die Behörde kann vom Halter oder von der Halterin Auskünfte darüber verlangen,']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Die Behörde kann vom Halter oder von der Halterin Auskünfte darüber verlangen, wer das Luftfahrzeug verwendet hat. Diese Auskünfte sind zu erteilen.')
  })

  it('replaces a later Halbsatz between the words it begins and ends with', () => {
    // RAO § 50 Abs. 2 Z 2 lit. a: the Halbsätze stand around a semicolon.
    const l2: StandingLaw = { paragraphs: [para('50', 'V', ['die Beitragspflicht von zwölf Monaten; in der Satzung kann Näheres bestimmt werden;'])] }
    const { law: out, results } = run(l2, instr('§ 50 Abs. 1 zweiter Halbsatz lautet:', ['in der Satzung kann Weiteres bestimmt werden;']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('die Beitragspflicht von zwölf Monaten; in der Satzung kann Weiteres bestimmt werden;')
  })

  it('ends a Halbsatz that changes its own ending at the next semicolon', () => {
    // RAO § 50 Abs. 2 Z 2 lit. a, BGBl. I Nr. 63/2026: the second Halbsatz becomes two.
    // The Litera carries a third Halbsatz behind it, which stays.
    const l2: StandingLaw = { paragraphs: [para('50', 'V', ['die Beitragspflicht von zwölf Monaten; in der Satzung kann Näheres bestimmt werden; eine Pension kann vorgesehen werden;'])] }
    const { law: out, results } = run(l2, instr('§ 50 Abs. 1 zweiter Halbsatz wird durch folgende Halbsätze ersetzt:', ['in der Satzung kann Weiteres bestimmt werden; ein solcher Erwerb ist zulässig;']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('die Beitragspflicht von zwölf Monaten; in der Satzung kann Weiteres bestimmt werden; ein solcher Erwerb ist zulässig; eine Pension kann vorgesehen werden;')
  })

  it('refuses where the old text does not carry the new ending exactly once', () => {
    const { results } = run(l(), instr('§ 169 Abs. 1 erster Halbsatz lautet:', ['Die Behörde kann vom Halter Auskünfte fordern,']))
    expect(results[0]!.applied).toBe(false)
  })

  it('looks for a phrase of a Halbsatz in its sentence, and nowhere else', () => {
    const { law: out, results } = run(l(), instr('In § 169 Abs. 1 wird im letzten Halbsatz das Wort "Auskünfte" durch das Wort "Angaben" ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Die Behörde kann vom Halter Auskünfte darüber verlangen, wer das Luftfahrzeug verwendet hat. Diese Angaben sind zu erteilen.')
  })
})

describe('a Halbsatz or a sentence appended behind the mark it replaces (27.09.2026)', () => {
  it('replaces the mark the unit ends on and joins the Halbsatz there', () => {
    // LFG § 19 Abs. 1: „der Punkt am Ende des Satzes" in an Absatz of two sentences.
    const l: StandingLaw = { paragraphs: [para('19', 'F', ['Die Beurkundung gilt nicht mehr. Die Urkunden sind zurückzugeben.'])] }
    const { law: out, results } = run(l, instr('In § 19 Abs. 1 wird der Punkt am Ende des Satzes durch einen Beistrich ersetzt und danach folgender Halbsatz angefügt:', ['außer der Status kann abgefragt werden.']))
    // One step: the mark and the text behind it (`mergeEndMarks`).
    expect(results.map((r) => r.reason)).toEqual([null])
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Die Beurkundung gilt nicht mehr. Die Urkunden sind zurückzugeben, außer der Status kann abgefragt werden.')
  })

  it('writes into the sentence the line names, not at the end of the Absatz', () => {
    // § 57 Abs. 2 erster Satz; the first sentence carries „31. Dezember", so its Punkt is not unique.
    const l: StandingLaw = { paragraphs: [para('57', 'F', ['Der Beitrag ist bis 31. Dezember zu leisten. Er ist zu melden.'])] }
    const { law: out, results } = run(l, instr('In § 57 Abs. 1 erster Satz wird am Ende der Punkt durch einen Beistrich ersetzt und folgender Halbsatz angefügt:', ['wobei der Tag der Zahlung zählt.']))
    expect(results.map((r) => r.reason)).toEqual([null])
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Der Beitrag ist bis 31. Dezember zu leisten, wobei der Tag der Zahlung zählt. Er ist zu melden.')
  })

  it('refuses where the unit does not end on the mark to be replaced', () => {
    const l: StandingLaw = { paragraphs: [para('19', 'F', ['Die Urkunden sind zurückzugeben:'])] }
    expect(run(l, instr('In § 19 Abs. 1 wird der Punkt am Ende durch einen Beistrich ersetzt.')).results[0]!.applied).toBe(false)
  })
})

describe('the Halbsatz behind a replaced semicolon (27.09.2026)', () => {
  it('ends the sentence at the new full stop and drops what followed', () => {
    // RAO § 27 Abs. 2 letzter Satz, BGBl. I Nr. 63/2026.
    const l: StandingLaw = { paragraphs: [para('27', 'B', ['Die Beiträge sind gleich hoch. Sie können nachgesehen werden; insbesondere kann die Plenarversammlung das beschließen.'])] }
    const { law: out, results } = run(l, instr('In § 27 Abs. 1 letzter Satz wird der Strichpunkt durch einen Punkt ersetzt; der nachfolgende Halbsatz entfällt.'))
    expect(results.map((r) => r.reason)).toEqual([null])
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Die Beiträge sind gleich hoch. Sie können nachgesehen werden.')
  })

  it('refuses where the sentence carries more than one such mark', () => {
    const l: StandingLaw = { paragraphs: [para('27', 'B', ['Sie können nachgesehen werden; das gilt; insbesondere hier.'])] }
    expect(run(l, instr('In § 27 Abs. 1 letzter Satz wird der Strichpunkt durch einen Punkt ersetzt; der nachfolgende Halbsatz entfällt.')).results[0]!.applied).toBe(false)
  })
})

describe('a Halbsatz quoted in the line and joined at the end (27.09.2026)', () => {
  it('appends it behind the last character of the unit', () => {
    // Glücksspiel draft, § … Abs. 2 Z 1: „wird am Ende der Halbsatz ‚…;' angefügt".
    const l: StandingLaw = { paragraphs: [para('5', 'S', [{ text: 'Die Spielbank hat', ziffern: ['die Identität festzustellen;', 'Aufzeichnungen zu führen.'] }])] }
    const { law: out, results } = run(l, instr('In § 5 Abs. 1 Z 1 wird am Ende der Halbsatz "die Vorlage kann entfallen;" angefügt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children[0]!.text).toBe('die Identität festzustellen; die Vorlage kann entfallen;')
  })
})

describe('a range below the § whose last unit is new (28.09.2026)', () => {
  it('replaces the run where the payload spells out every named unit', () => {
    // Waldresilienzfondsgesetz § 1: „§ 1 Z 1 bis 5 lautet:", Z 5 new.
    const l: StandingLaw = { paragraphs: [para('1', 'Ziele', [{ text: 'Ziele sind:', ziffern: ['a,', 'b,', 'c.'] }])] }
    const { law: out, results } = run(l, instr('§ 1 Abs. 1 Z 1 bis 4 lautet:', ['1. A,', '2. B,', '3. C,', '4. D.']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children.map((c) => `${c.id}:${c.text}`)).toEqual(['1:A,', '2:B,', '3:C,', '4:D.'])
  })

  it('refuses where the payload is not exactly the named units', () => {
    const l: StandingLaw = { paragraphs: [para('1', 'Ziele', [{ text: 'Ziele sind:', ziffern: ['a,', 'b,', 'c.'] }])] }
    expect(run(l, instr('§ 1 Abs. 1 Z 1 bis 4 lautet:', ['1. A,', '2. B,', '3. C.'])).results[0]!.applied).toBe(false)
  })
})

describe('a quoted word joined at the end of its unit (28.09.2026)', () => {
  const l = (): StandingLaw => ({ paragraphs: [para('5', 'S', [{ text: 'Verboten ist,', ziffern: ['zu täuschen,', 'zu schaden'] }])] })

  it('„angefügt" joins it behind everything, the closing mark included', () => {
    // Lebensmittelsicherheitsgesetz § 5 Abs. 1 Z 3: „entsprechen," → „entsprechen, oder".
    const { law: out, results } = run(l(), instr('In § 5 Abs. 1 wird der Z 1 das Wort " oder" angefügt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children[0]!.text).toBe('zu täuschen, oder')
  })

  it('„am Ende … eingefügt" holds where the unit ends without a mark, and only there', () => {
    const { law: out, results } = run(l(), instr('In § 5 Abs. 1 Z 2 wird am Ende das Wort " sowie" eingefügt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children[1]!.text).toBe('zu schaden sowie')
    expect(run(l(), instr('In § 5 Abs. 1 Z 1 wird am Ende das Wort " sowie" eingefügt.')).results[0]!.applied).toBe(false)
  })

  it('joins a text that opens with a mark only where no mark ends the unit', () => {
    const { law: out, results } = run(l(), instr('In § 5 Abs. 1 wird am Ende der Z 2 der Ausdruck ", oder" angefügt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children[1]!.text).toBe('zu schaden, oder')
    expect(run(l(), instr('In § 5 Abs. 1 wird am Ende der Z 1 der Ausdruck ", oder" angefügt.')).results[0]!.applied).toBe(false)
  })

  it('reads the text quoted behind „folgende Wortfolge angefügt:"', () => {
    const { law: out, results } = run(l(), instr('In § 5 Abs. 1 Z 2 wird folgende Wortfolge angefügt: " und zu stören"'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children[1]!.text).toBe('zu schaden und zu stören')
  })

  it('appends a mark named in words only where none ends the unit', () => {
    const { law: out, results } = run(l(), instr('In § 5 Abs. 1 wird der Z 2 ein Strichpunkt angefügt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children[1]!.text).toBe('zu schaden;')
    expect(run(l(), instr('In § 5 Abs. 1 wird der Z 1 ein Strichpunkt angefügt.')).results[0]!.applied).toBe(false)
  })
})

describe('a mark named in words inserted behind a quoted word (28.09.2026)', () => {
  it('joins the mark to the anchor', () => {
    const l: StandingLaw = { paragraphs: [para('5', 'S', ['Wer in der Absicht handelt und schadet'])] }
    const { law: out, results } = run(l, instr('In § 5 Abs. 1 wird nach dem Wort "Absicht" ein Beistrich eingefügt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Wer in der Absicht, handelt und schadet')
  })
})

describe('a deletion in front of a closing parenthesis (28.09.2026)', () => {
  it('leaves no space inside it', () => {
    const l: StandingLaw = { paragraphs: [para('10', 'S', ['Sie sind zu verbringen (§ 43 BFA-VG).'])] }
    const { law: out } = run(l, instr('In § 10 Abs. 1 entfällt der Ausdruck " BFA-VG".'))
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Sie sind zu verbringen (§ 43).')
  })
})

describe('a Satzteil or Wortfolge announced with its text as payload (28.09.2026)', () => {
  it('joins it at the end of the unit, behind the closing Beistrich', () => {
    // Lebensmittelsicherheitsgesetz § 38 Abs. 1 Z 2: „bereitzustellen," → „bereitzustellen, oder ihnen …".
    const l: StandingLaw = { paragraphs: [para('38', 'S', [{ text: 'Sie haben', ziffern: ['zu nennen,', 'bereitzustellen,', 'zu dulden.'] }])] }
    const { law: out, results } = run(l, instr('In § 38 Abs. 1 Z 2 wird folgender Satzteil angefügt:', ['oder ihnen die Ware zu übergeben,']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children[1]!.text).toBe('bereitzustellen, oder ihnen die Ware zu übergeben,')
  })
})

describe('a mark as the anchor of an insertion (28.09.2026)', () => {
  const l = (): StandingLaw => ({ paragraphs: [para('69', 'S', [{ text: 'Zu prüfen sind', ziffern: ['die Strategien; die Verfahren,', 'die Mittel, die Wege,'] }])] })

  it('inserts in front of the unit\'s only Strichpunkt', () => {
    const { law: out, results } = run(l(), instr('In § 69 Abs. 1 Z 1 wird vor dem Strichpunkt die Wortfolge " und Pläne" eingefügt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children[0]!.text).toBe('die Strategien und Pläne; die Verfahren,')
  })

  it('refuses where the mark stands twice', () => {
    expect(run(l(), instr('In § 69 Abs. 1 Z 2 wird vor dem Beistrich die Wortfolge " und Pläne" eingefügt.')).results[0]!.applied).toBe(false)
  })

  it('reads „am Ende der Z 2 vor dem Beistrich" as the closing one', () => {
    const { law: out, results } = run(l(), instr('Im § 69 Abs. 1 wird am Ende der Z 2 vor dem Beistrich die Wortfolge " und Ziele" eingefügt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children[1]!.text).toBe('die Mittel, die Wege und Ziele,')
  })
})

describe('nouns read against the refusals of 28.09.2026', () => {
  it('replaces a sentence named with its text inside the Schlussteil', () => {
    // LFG § 169 Abs. 1: „Im Schlussteil … wird der Satz ‚…' durch die Sätze ‚…' ersetzt".
    const abs = makeNode('abs', '1', '(1)', 'Wer')
    abs.children.push(makeNode('z', '1', '1.', 'fliegt,'), makeNode('schluss', 'schluss', '', 'begeht eine Übertretung. In Fällen A ist B zu verhängen.'))
    const p = makeNode('para', '169', '§ 169', '')
    p.children.push(abs)
    const { law: out, results } = run({ paragraphs: [p] }, instr('Im Schlussteil des § 169 Abs. 1 wird der Satz "In Fällen A ist B zu verhängen." durch die Sätze "In Fällen C. Sonst D." ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children[1]!.text).toBe('begeht eine Übertretung. In Fällen C. Sonst D.')
  })

  it('does not find a number inside a longer one', () => {
    const l: StandingLaw = { paragraphs: [para('10', 'S', ['Die Gebühr beträgt 150 Euro, ermäßigt 50 Euro.'])] }
    const { law: out, results } = run(l, instr('In § 10 werden die Beträge "50" jeweils durch die Beträge "70" ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Die Gebühr beträgt 150 Euro, ermäßigt 70 Euro.')
  })
})

describe('a spaced abbreviation inside a sentence (28.09.2026)', () => {
  it('„z. B." does not end a sentence, so the last Halbsatz can be found', () => {
    // Bäderhygieneverordnung § 57 Abs. 6.
    const t = 'Die Dauer hat fünf Minuten zu betragen. Gutachten sind vorzulegen; weitere Unterlagen (z. B. Betriebsanleitung) sind anzuschließen; auf Verlangen der Behörde oder der oder des Sachverständigen ist Einsicht zu gewähren.'
    expect(splitSentences(t)).toHaveLength(2)
    const l: StandingLaw = { paragraphs: [para('57', 'S', [t])] }
    const { law: out, results } = run(l, instr('In § 57 Abs. 1 wird im letzten Halbsatz vor der Wortfolge "des Sachverständigen" das Wort "oder" durch das Wort "bzw." ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe(t.replace('der oder des', 'der bzw. des'))
  })
})

describe('the anchor of a replacement, where the operand recurs (28.09.2026)', () => {
  const t = 'Auf Verlangen der Behörde oder der oder des Sachverständigen ist Einsicht zu gewähren.'
  const l = (): StandingLaw => ({ paragraphs: [para('57', 'S', [t])] })

  it('replaces the operand that stands right beside the anchor', () => {
    // Bäderhygieneverordnung § 57 Abs. 6, AWG 2002 § 42 Abs. 4.
    const { law: out, results } = run(l(), instr('In § 57 Abs. 1 wird vor der Wortfolge "des Sachverständigen" das Wort "oder" durch das Wort "bzw." ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Auf Verlangen der Behörde oder der bzw. des Sachverständigen ist Einsicht zu gewähren.')
  })

  it('joins a mark behind the anchor without a space', () => {
    const l2: StandingLaw = { paragraphs: [para('4', 'S', ['nach Art. 12 und Art. 14 und Art. 16 der Verordnung'])] }
    const { law: out, results } = run(l2, instr('In § 4 Abs. 1 wird nach der Zeichenfolge "Art. 14" die Zeichenfolge "und" durch einen Beistrich ersetzt.'))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.text).toBe('nach Art. 12 und Art. 14, Art. 16 der Verordnung')
  })

  it('refuses where the operand does not stand beside the anchor', () => {
    expect(run(l(), instr('In § 57 Abs. 1 wird nach der Wortfolge "Verlangen" das Wort "oder" durch das Wort "bzw." ersetzt.')).results[0]!.applied).toBe(false)
  })
})

describe('an Absatz quoted with its Paragraph around it (28.09.2026)', () => {
  it('replaces the Absatz, not nests the § inside it', () => {
    // RAO § 24 Abs. 1: „§ 24 Abs. 1 lautet:" with the payload „§ 24. (1) …".
    const l: StandingLaw = { paragraphs: [para('24', 'Wahlen', [{ text: 'Es werden', ziffern: ['der Präsident,', 'die Prüfer'] }, 'Die Wahl ist geheim.'])] }
    const { law: out, results } = run(l, instr('§ 24 Abs. 1 lautet:', ['§ 24. (1) Es werden', '1. der Präsident und', '2. die Prüfer gewählt.']))
    expect(results[0]!.reason).toBeNull()
    const abs = out.paragraphs[0]!.children
    expect(abs.map((a) => a.id)).toEqual(['1', '2'])
    expect(abs[0]!.children.map((c) => c.level)).toEqual(['z', 'z'])
    expect(plainText(abs[0]!)).toBe('Es werden der Präsident und die Prüfer gewählt.')
  })
})

describe('a Schlussteil appended to a unit with a list (28.09.2026)', () => {
  it('closes the list, and only where there is one and no Schlussteil yet', () => {
    // UStG § 26 Abs. 3 Z 2: „Dem § 26 Abs. 3 Z 2 wird folgender Schlussteil angefügt:".
    const z2 = makeNode('z', '2', '2.', 'Abweichend davon, wenn')
    z2.children.push(makeNode('lit', '–', '–', 'dies,'), makeNode('lit', '–', '–', 'jenes.'))
    const abs = makeNode('abs', '3', '(3)', '')
    abs.children.push(makeNode('z', '1', '1.', 'Die Regel.'), z2)
    const p = makeNode('para', '26', '§ 26.', '')
    p.children.push(abs)
    const { law: out, results } = run({ paragraphs: [p] }, instr('Dem § 26 Abs. 3 Z 2 wird folgender Schlussteil angefügt:', ['Das gilt auch sonst.']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children[1]!.children.at(-1)).toMatchObject({ level: 'schluss', text: 'Das gilt auch sonst.' })
    expect(run({ paragraphs: [p] }, instr('Dem § 26 Abs. 3 Z 1 wird folgender Schlussteil angefügt:', ['Das gilt auch sonst.'])).results[0]!.applied).toBe(false)
  })
})

describe('several insertions under one „eingefügt" (28.09.2026)', () => {
  it('inserts the same text behind each anchor', () => {
    const l: StandingLaw = { paragraphs: [para('34b', 'S', ['Die geführten Konten und diesen Konten zugeordnete Werte.'])] }
    const { law: out, results } = run(l, instr('In § 34b Abs. 1 wird nach den Wortfolgen "geführten Konten" und "diesen Konten" jeweils die Wortfolge " und Depots" eingefügt.'))
    expect(results.every((r) => r.reason === null)).toBe(true)
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Die geführten Konten und Depots und diesen Konten und Depots zugeordnete Werte.')
  })

  it('reads pairs, a mark named in words among them', () => {
    // AsylG § 61 Abs. 3.
    const l: StandingLaw = { paragraphs: [para('61', 'S', ['Er ist abzuliefern, wenn er führt und bleibt.'])] }
    const { law: out, results } = run(l, instr('In § 61 Abs. 1 wird nach dem Wort "abzuliefern" die Wortfolge " ; dies gilt nicht" und nach dem Wort "führt" ein Beistrich eingefügt.'))
    expect(results.every((r) => r.reason === null)).toBe(true)
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Er ist abzuliefern; dies gilt nicht, wenn er führt, und bleibt.')
  })

  it('keeps refusing a line whose first quotation is deleted, not an anchor', () => {
    expect(parseInstruction('In § 20 wird das Wort "zuletzt" gestrichen sowie nach der Wortfolge "A" die Wortfolge "B" eingefügt.').ops).toEqual([])
  })
})

describe('two sentences of one unit (30.09.2026)', () => {
  it('changes the phrase once in each, and refuses where one of them lacks it', () => {
    const l = (): StandingLaw => ({ paragraphs: [para('22', 'E', ['Die Aufhebung des Schutzes ergeht mündlich. Sie gilt. Über die Aufhebung des Schutzes wird entschieden.'])] })
    const { law: out, results } = run(l(), instr('In § 22 Abs. 1 wird im ersten und letzten Satz jeweils das Wort "Schutzes" durch die Wortfolge "Rechts auf Verbleib" ersetzt.'))
    expect(results.map((r) => r.reason)).toEqual([null, null])
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Die Aufhebung des Rechts auf Verbleib ergeht mündlich. Sie gilt. Über die Aufhebung des Rechts auf Verbleib wird entschieden.')
    // BFA-VG § 52 Abs. 3: the word stands in the first and the third sentence.
    const wrong = run(l(), instr('In § 22 Abs. 1 wird im ersten und im zweiten Satz jeweils das Wort "Schutzes" durch die Wortfolge "Rechts auf Verbleib" ersetzt.'))
    expect(wrong.results.some((r) => !r.applied)).toBe(true)
  })

  it('changes the later sentence before the earlier one can split', () => {
    // „ oder" → „." makes two sentences out of the first; run in the order
    // written, „dritter" would have counted the new one.
    const l: StandingLaw = { paragraphs: [para('5', 'S', ['Eins oder zwei. Zwei. Drei oder vier.'])] }
    const { law: out, results } = run(l, instr('In § 5 Abs. 1 wird im ersten und dritten Satz jeweils das Wort " oder" durch einen Punkt ersetzt.'))
    expect(results.every((r) => r.reason === null)).toBe(true)
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Eins. zwei. Zwei. Drei. vier.')
  })
})

describe('a new unit without its designation (30.09.2026)', () => {
  const l = (): StandingLaw => ({ paragraphs: [para('7', 'G', ['Eins.', 'Zwei.', 'Drei.'])] })

  it('is refused, not inserted empty', () => {
    // Bundesstraßengesetz-Entwurf § 7: the bare sentence came out as a heading,
    // and an Absatz with no number and no text went in.
    const { law: out, results } = run(l(), instr('In § 7 wird nach Abs. 2 folgender Abs. 2a eingefügt:', ['Neu.']))
    expect(results[0]).toMatchObject({ applied: false, reason: 'Eingefügte Einheit ohne eigene Bezeichnung' })
    expect(out.paragraphs[0]!.children.map((c) => c.id)).toEqual(['1', '2', '3'])
  })

  it('goes in where it prints one', () => {
    const { law: out, results } = run(l(), instr('In § 7 wird nach Abs. 2 folgender Abs. 2a eingefügt:', ['(2a) Neu.']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children.map((c) => [c.id, c.text])).toEqual([['1', 'Eins.'], ['2', 'Zwei.'], ['2a', 'Neu.'], ['3', 'Drei.']])
  })
})

describe('„als Abs. 9 bezeichnet" (30.09.2026)', () => {
  it('renumbers, then inserts under the freed number', () => {
    // Bundesstraßengesetz-Entwurf § 7.
    const l: StandingLaw = { paragraphs: [para('7', 'G', ['Eins.', 'Zwei.', 'Drei.', 'Vier.', 'Fünf.', 'Sechs.', 'Sieben.', 'Acht.'])] }
    const { law: out, results } = run(l, instr('In § 7 wird der bisherige Abs. 8 als Abs. 9 bezeichnet und nach Abs. 7 folgender Abs. 8 eingefügt:', ['(8) Neu acht.']))
    expect(results.map((r) => r.reason)).toEqual([null, null])
    expect(out.paragraphs[0]!.children.slice(6).map((c) => [c.id, c.marker, c.text])).toEqual([['7', '(7)', 'Sieben.'], ['8', '(8)', 'Neu acht.'], ['9', '(9)', 'Acht.']])
  })
})

describe('a sentence inserted after or before a named sentence (06.10.2026)', () => {
  const l = (): StandingLaw => ({ paragraphs: [para('16', 'Aufsicht', ['Die Behörde prüft. Sie entscheidet binnen vier Wochen. Die Frist ist zu verlängern.'])] })

  it('joins the new sentence behind the named one', () => {
    const { law: out, results } = run(l(), instr('In § 16 Abs. 1 wird nach dem ersten Satz folgender Satz eingefügt:', ['Sie hört die Partei an.']))
    expect(results[0]!.reason).toBeNull()
    expect(plainText(out.paragraphs[0]!.children[0]!)).toBe('Die Behörde prüft. Sie hört die Partei an. Sie entscheidet binnen vier Wochen. Die Frist ist zu verlängern.')
  })

  it('puts it in front of the named one with „vor"', () => {
    const { law: out, results } = run(l(), instr('In § 16 Abs. 1 wird vor dem letzten Satz folgender Satz eingefügt:', ['Sie hört die Partei an.']))
    expect(results[0]!.reason).toBeNull()
    expect(plainText(out.paragraphs[0]!.children[0]!)).toBe('Die Behörde prüft. Sie entscheidet binnen vier Wochen. Sie hört die Partei an. Die Frist ist zu verlängern.')
  })

  it('takes several sentences as one block', () => {
    const { law: out } = run(l(), instr('In § 16 Abs. 1 werden nach dem zweiten Satz folgende Sätze eingefügt:', ['Sie hört an. Sie begründet.']))
    expect(plainText(out.paragraphs[0]!.children[0]!)).toBe('Die Behörde prüft. Sie entscheidet binnen vier Wochen. Sie hört an. Sie begründet. Die Frist ist zu verlängern.')
  })

  it('refuses where the named sentence is not there, and writes nothing', () => {
    const { law: out, results } = run(l(), instr('In § 16 Abs. 1 wird nach dem fünften Satz folgender Satz eingefügt:', ['Sie hört die Partei an.']))
    expect(results[0]!.reason).toMatch(/nicht auffindbar/)
    expect(plainText(out.paragraphs[0]!.children[0]!)).toBe('Die Behörde prüft. Sie entscheidet binnen vier Wochen. Die Frist ist zu verlängern.')
  })
})

describe('an Absatz „angefügt" beside one of its own level (25.10.2026)', () => {
  const ids = (l: StandingLaw): string[] => l.paragraphs[0]!.children.map((c) => c.id)

  it('stands in front of the Absatz „vor" names, not inside it', () => {
    // KommAustria-Gesetz § 35, 48/ME XXVIII: (1h) printed after (2).
    const l: StandingLaw = { paragraphs: [para('35', 'Finanzierung', ['Eins.', 'Zwei.', 'Drei.'])] }
    const { law: out, results } = run(l, instr('In § 35 wird vor Abs. 2 folgender Abs. 1h angefügt:', ['(1h) Neu.']))
    expect(results[0]!.reason).toBeNull()
    expect(ids(out)).toEqual(['1', '1h', '2', '3'])
    expect(out.paragraphs[0]!.children.every((c) => c.children.length === 0)).toBe(true)
  })

  it('stands behind the whole Absatz „nach" names, its Schlussteil included', () => {
    // Abfallwirtschaftsgesetz 2002 § 13b, 94/ME XXVIII: (2a) landed between
    // the list of Abs. 2 and the sentence that closes it.
    const l: StandingLaw = { paragraphs: [para('13b', 'Koordinierung', ['Eins.', { text: 'Betraut werden kann, wenn', ziffern: ['erstens,', 'zweitens.'] }, 'Drei.'])] }
    l.paragraphs[0]!.children[1]!.children.push(makeNode('schluss', 'schluss', '', 'Die Betrauung kann unbefristet erfolgen.'))
    const { law: out, results } = run(l, instr('Im § 13b wird nach Abs. 2 folgender Abs. 2a angefügt:', ['(2a) Neu.']))
    expect(results[0]!.reason).toBeNull()
    expect(ids(out)).toEqual(['1', '2', '2a', '3'])
    expect(out.paragraphs[0]!.children[1]!.children.at(-1)!.text).toBe('Die Betrauung kann unbefristet erfolgen.')
  })

  it('refuses a number that stands already instead of printing it twice', () => {
    // Kontenregister- und Konteneinschaugesetz § 15, 27/ME XXVIII: Abs. 8
    // came in by another Novelle; nested into Abs. 7, the second „(8)" was
    // never checked against the first.
    const l: StandingLaw = { paragraphs: [para('15', 'Inkrafttreten', ['Eins.', 'Zwei.', 'Drei.', 'Vier.', 'Fünf.', 'Sechs.', 'Sieben.', 'Acht.'])] }
    const { results } = run(l, instr('Dem § 15 wird nach Abs. 7 folgender Abs. 8 angefügt:', ['(8) Neu acht.']))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/existiert bereits/)
  })

  it('never hangs a unit inside one of its own level, whoever asks', () => {
    const l: StandingLaw = { paragraphs: [para('35', 'Finanzierung', ['Eins.', 'Zwei.'])] }
    const target = parseAddress('§ 35 Abs. 2')!
    const { results } = applyNovelle(l, [{ op: { kind: 'append', target, child: 'abs', childIds: ['2a'] }, payload: parsePayload(['(2a) Neu.']), line: 'x' }])
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/gleichrangige Einheit/)
  })
})

describe('a sentence that brings a list of its own (25.10.2026)', () => {
  // AVG § 41 Abs. 1, 35/ME XXVIII: the new second sentence carries Z 1 to 3,
  // and written as text into the sentence's slot it lost them.
  const avg = (rest = ''): StandingLaw => ({
    paragraphs: [para('41', 'Mündliche Verhandlung', [`Die Anberaumung hat durch Verständigung zu erfolgen. Wenn andere Personen in Betracht kommen, ist die Verhandlung an der Amtstafel kundzumachen.${rest}`, 'Zweiter Absatz.'])],
  })
  const payload = ['Wenn andere Personen in Betracht kommen, ist die Verhandlung überdies', '1. durch Verlautbarung im RIS oder', '2. an der Amtstafel', 'kundzumachen.']

  it('keeps the Ziffern as Ziffern, and the comparison form as it was', () => {
    const { law: out, results } = run(avg(), instr('§ 41 Abs. 1 zweiter Satz lautet:', payload))
    expect(results[0]!.reason).toBeNull()
    const abs = out.paragraphs[0]!.children[0]!
    expect(abs.text).toBe('Die Anberaumung hat durch Verständigung zu erfolgen. Wenn andere Personen in Betracht kommen, ist die Verhandlung überdies')
    expect(abs.children.map((c) => [c.level, c.marker, c.text])).toEqual([['z', '1.', 'durch Verlautbarung im RIS oder'], ['z', '2.', 'an der Amtstafel'], ['schluss', '', 'kundzumachen.']])
    expect(bodyText(out.paragraphs[0]!)).toContain('überdies\n1. durch Verlautbarung im RIS oder\n2. an der Amtstafel\nkundzumachen.\n(2) Zweiter Absatz.')
    // The oracle and the guard read this form; it must not move.
    expect(plainText(abs)).toBe('Die Anberaumung hat durch Verständigung zu erfolgen. Wenn andere Personen in Betracht kommen, ist die Verhandlung überdies durch Verlautbarung im RIS oder an der Amtstafel kundzumachen.')
  })

  it('carries the sentences behind the replaced one into the Schlussteil', () => {
    const { law: out } = run(avg(' Die Frist beträgt eine Woche.'), instr('§ 41 Abs. 1 zweiter Satz lautet:', payload))
    expect(out.paragraphs[0]!.children[0]!.children.at(-1)!.text).toBe('kundzumachen. Die Frist beträgt eine Woche.')
  })

  it('appends such a sentence at the end of the unit, and inserts it in front of a named one', () => {
    const appended = run(avg(), instr('Dem § 41 Abs. 1 wird folgender Satz angefügt:', payload))
    expect(appended.results[0]!.reason).toBeNull()
    expect(appended.law.paragraphs[0]!.children[0]!.text).toMatch(/kundzumachen\. Wenn andere Personen in Betracht kommen, ist die Verhandlung überdies$/)
    const inserted = run(avg(), instr('In § 41 Abs. 1 wird vor dem letzten Satz folgender Satz eingefügt:', payload))
    expect(inserted.results[0]!.reason).toBeNull()
    expect(inserted.law.paragraphs[0]!.children[0]!.children.at(-1)!.text).toBe('kundzumachen. Wenn andere Personen in Betracht kommen, ist die Verhandlung an der Amtstafel kundzumachen.')
  })

  it('refuses where the unit carries a list already, and writes nothing', () => {
    const l: StandingLaw = { paragraphs: [para('5', 'A', [{ text: 'Erster Satz. Ausgenommen sind:', ziffern: ['a,', 'b.'] }])] }
    const { law: out, results } = run(l, instr('§ 5 Abs. 1 erster Satz lautet:', payload))
    expect(results[0]!.applied).toBe(false)
    expect(results[0]!.reason).toMatch(/Aufzählung/)
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Erster Satz. Ausgenommen sind:')
  })

  it('leaves a sentence the ressort quoted with its Absatz number a sentence', () => {
    const { law: out, results } = run(avg(), instr('§ 41 Abs. 1 erster Satz lautet:', ['(1) Die Anberaumung erfolgt schriftlich.']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.children[0]!.children).toEqual([])
    expect(out.paragraphs[0]!.children[0]!.text).toMatch(/^Die Anberaumung erfolgt schriftlich\. Wenn andere/)
  })
})

describe('a § replaced by one bare line, and a heading named by the § below it (25.10.2026)', () => {
  const zweck = (): StandingLaw => ({ paragraphs: [para('1', 'Zweck', ['Dieses Bundesgesetz dient der Verordnung (EU) Nr. 1286/2014.'])] })

  it('takes the line for the §\'s text and keeps its Überschrift', () => {
    // PRIIP-Vollzugsgesetz § 1, 30/ME XXVIII: the sentence became the
    // heading, and the page struck the whole body.
    const { law: out, results } = run(zweck(), instr('§ 1 lautet:', ['Dieses Bundesgesetz dient der Verordnung (EU) 2023/2869.']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.heading).toBe('Zweck')
    expect(bodyText(out.paragraphs[0]!)).toBe('Dieses Bundesgesetz dient der Verordnung (EU) 2023/2869.')
  })

  it('refuses one line that has to be heading and text at once', () => {
    const { results } = run(zweck(), instr('§ 1 lautet samt Überschrift:', ['Dieses Bundesgesetz dient der Verordnung (EU) 2023/2869.']))
    expect(results[0]!.applied).toBe(false)
  })

  it('replaces the heading „die Überschrift vor §" names, and keeps the text', () => {
    // Unternehmensgesetzbuch § 283, 4/ME XXVIII.
    const l: StandingLaw = { paragraphs: [para('283', 'Zwangsstrafen', ['Die Vertreter sind zu bestrafen.'])] }
    const { law: out, results } = run(l, instr('Die Überschrift vor § 283 wird durch folgende Paragrafenüberschrift ersetzt:', ['Zwangsstrafen wegen nicht zeitgerechter Offenlegung']))
    expect(results[0]!.reason).toBeNull()
    expect(out.paragraphs[0]!.heading).toBe('Zwangsstrafen wegen nicht zeitgerechter Offenlegung')
    expect(out.paragraphs[0]!.children[0]!.text).toBe('Die Vertreter sind zu bestrafen.')
  })
})

describe('renamedOrigins — which standing § a § of the result came from', () => {
  // `unit` is the § that moved, `origin` its number in the standing law.
  const r = (from: string, to: string, batch: number, unit: number, origin: string | null) => ({ level: 'para' as const, para: `§ ${to}`, from, to, batch, instruction: batch, unit, origin })

  it('resolves the moves of one renumbering together — an upward shift does not chain', () => {
    // „Die §§ 8 und 9 erhalten die Bezeichnungen §§ 9 und 10": the new § 10 is the old § 9.
    const origin = renamedOrigins([r('8', '9', 0, 1, '8'), r('9', '10', 0, 2, '9')])
    expect([origin('9'), origin('10'), origin('8'), origin('7')]).toEqual(['8', '9', null, '7'])
  })

  it('follows one renumbering into the next, and a downward shift alike (144/ME XXVIII: § 15 → § 14, § 17 → § 15)', () => {
    expect(renamedOrigins([r('15', '14', 0, 1, '15'), r('17', '15', 0, 2, '17')])('15')).toBe('17')
    const chained = renamedOrigins([r('8', '15', 0, 1, '8'), r('15', '22', 1, 1, '8')])
    expect([chained('22'), chained('15'), chained('8')]).toEqual(['8', null, null])
  })

  it('follows the § that moved, not the number, where a number stands twice for a while (E0399A69)', () => {
    // „§ 15 erhält die Bezeichnung ‚16'", later „§ 16 wird durch folgenden § 17 ersetzt" — the old § 16.
    const origin = renamedOrigins([r('15', '16', 0, 1, '15'), r('16', '17', 1, 2, '16')])
    expect([origin('16'), origin('17'), origin('15')]).toEqual(['15', '16', null])
  })

  it('carries the batch on the record the engine writes', () => {
    const law: StandingLaw = { paragraphs: [para('8', 'Acht', ['Acht.']), para('9', 'Neun', ['Neun.'])] }
    const { renamed } = run(law, instr('Die §§ 8 und 9 erhalten die Paragraphenbezeichnungen "§ 9." bis "§ 10."'))
    expect(renamed.map((x) => [x.from, x.to, x.batch])).toEqual([['8', '9', 0], ['9', '10', 0]])
    expect(renamedOrigins(renamed)('10')).toBe('9')
  })
})

/** A unit of instruction and payload blocks, as `segmentUnits` hands them over. */
function unitOf(blocks: { kind: 'novao' | 'abs' | 'para_head' | 'other'; text: string; gld?: string; cls?: string }[]) {
  return { article: null, articleNumber: null, id: 'Z1', heading: null, quotedHeadings: [], stammnorm: null, text: '', blocks: blocks.map((b) => ({ kind: b.kind, cls: b.cls ?? '', text: b.text, gld: b.gld ?? null })) }
}

describe('a new Abschnitt is an insertion of its §§ (26.10.2026)', () => {
  // UGB, 4/ME XXVIII: „Nach § 285 wird folgender fünfter Abschnitt
  // eingefügt:" — the payload is two §§, and the line was refused as
  // „Eingefügte Einheit nicht bestimmbar".
  const unit = (line: string) => unitOf([
    { kind: 'novao', text: line },
    { kind: 'para_head', text: 'Neues' },
    { kind: 'abs', gld: '§ 5a.', text: '(1) Erster Absatz.' },
    { kind: 'para_head', text: 'Weiteres' },
    { kind: 'abs', gld: '§ 5b.', text: 'Einziger Absatz.' },
  ])

  it('inserts the §s behind the § the line names', () => {
    const { instructions, refused } = instructionsFromUnits([unit('1. Nach § 5 wird folgender fünfter Abschnitt eingefügt:')])
    expect(refused).toEqual([])
    expect(instructions[0]!.op).toMatchObject({ kind: 'insertAfter', child: 'para', childIds: ['5a', '5b'] })
    const { law: out, results } = applyNovelle(law(), instructions)
    expect(results[0]!.applied).toBe(true)
    expect(out.paragraphs.map((p) => p.id)).toEqual(['5', '5a', '5b', '6'])
  })

  it('puts them where their numbers go when the line names an Abschnitt', () => {
    const { instructions } = instructionsFromUnits([unit('1. Nach dem 2. Abschnitt werden folgende Abschnitte 3 und 4 eingefügt:')])
    const { law: out, results } = applyNovelle(law(), instructions)
    expect(results[0]!.applied).toBe(true)
    expect(out.paragraphs.map((p) => p.id)).toEqual(['5', '5a', '5b', '6'])
  })

  it('leaves a payload that is not §§ alone as it was read', () => {
    const { instructions } = instructionsFromUnits([unitOf([{ kind: 'novao', text: '1. Nach § 5 wird folgender Abschnitt eingefügt:' }, { kind: 'abs', text: '"(1) Loser Absatz."' }])])
    expect(instructions[0]!.op).toMatchObject({ kind: 'insertAfter', child: 'unknown' })
  })
})

describe('a line on the whole text that goes on in a list below it (26.10.2026)', () => {
  // 145/ME XXVIII: head, one dash per operand pair, the participle — four
  // lines, each refused on its own.
  const units = [unitOf([
    { kind: 'novao', text: '1. Im gesamten Gesetzestext wird jeweils' },
    { kind: 'novao', text: '- die Wortfolge "die Behörde am Sitz" durch die Wortfolge "das Amt am Sitz"' },
    { kind: 'novao', text: '- die Wortfolge "Verfahren vor Gerichten" durch die Wortfolge "gerichtliche Verfahren"' },
    { kind: 'novao', text: 'ersetzt.' },
  ])]

  it('reads it as the one sentence it is', () => {
    const { instructions, refused } = instructionsFromUnits(units)
    expect(refused).toEqual([])
    expect(instructions.map((i) => [i.op.kind, opAddress(i.op)?.level])).toEqual([['replacePhrase', 'document'], ['replacePhrase', 'document']])
    const { law: out, results } = applyNovelle(law(), instructions)
    expect(results.every((r) => r.applied)).toBe(true)
    expect(plainText(out.paragraphs[0]!)).toContain('gerichtliche Verfahren.')
    expect(plainText(out.paragraphs[1]!)).toBe('Zuständigkeit Zuständig ist das Amt am Sitz der Partei.')
  })

  it('takes a phrase the loaded §§ do not carry for no failure — they are not the whole law', () => {
    const { results } = run(law(), instr('Im gesamten Gesetzestext wird die Wortfolge "Bundesministerin für Inneres" durch die Wortfolge "Bundesministerin für Justiz" ersetzt.'))
    expect(results[0]!.applied).toBe(true)
    // One unit named: not finding the phrase there stays a refusal.
    expect(run(law(), instr('In § 5 wird die Wortfolge "Bundesministerin für Inneres" durch die Wortfolge "Bundesministerin für Justiz" ersetzt.')).results[0]!.applied).toBe(false)
  })
})

describe('a replacement whose new text carries other numbers (26.10.2026)', () => {
  const l = (): StandingLaw => ({ paragraphs: [para('10', 'Zehn', ['Alt zehn.']), para('11', 'Elf', ['Alt elf.']), para('12', 'Zwölf', ['Alt zwölf.'])] })

  it('installs the new §§ under their own numbers where the line says so', () => {
    // 51/ME XXVIII: kept one to one, § 11 carried the text of the new § 18.
    const { law: out, results } = run(l(), instr('Im 3. Abschnitt werden die bisherigen §§ 11 und 12 samt Überschriften durch folgende §§ 18 und 19 ersetzt:', [{ text: 'Achtzehn', heading: true }, '§ 18. Neu achtzehn.', { text: 'Neunzehn', heading: true }, '§ 19. Neu neunzehn.']))
    expect(results[0]!.applied).toBe(true)
    expect(out.paragraphs.map((p) => p.id)).toEqual(['10', '18', '19'])
    const renamed = run(l(), instr('Der bisherige § 10 wird zu § 17 und lautet samt Überschrift:', [{ text: 'Siebzehn', heading: true }, '§ 17. Neu siebzehn.']))
    expect(renamed.results[0]!.applied).toBe(true)
    expect(renamed.law.paragraphs.map((p) => p.id)).toEqual(['17', '11', '12'])
  })

  it('refuses a number the line does not announce', () => {
    const { results, unresolved } = run(l(), instr('§ 10 lautet:', ['§ 16. Ein anderer Paragraph.']))
    expect(results[0]!.applied).toBe(false)
    expect([...unresolved].sort()).toEqual(['§ 10', '§ 16'])
  })
})

describe('a § replaced by one under another number is that § renamed (26.10.2026)', () => {
  const l = (): StandingLaw => ({ paragraphs: [para('8', 'Acht', ['Alt acht.']), para('10', 'Zehn', ['Alt zehn.']), para('11', 'Elf', ['Alt elf.']), para('12', 'Zwölf', ['Alt zwölf.'])] })

  it('records „wird zu § 17 und lautet" as a renaming, so the new § is held against the old one', () => {
    // 51/ME XXVIII: the Beilage sets „§ 10." beside „§ 17."; without the
    // record the page printed § 17 as wholly inserted.
    const { renamed, results } = run(l(), instr('Der bisherige § 10 wird zu § 17 und lautet samt Überschrift:', [{ text: 'Siebzehn', heading: true }, '§ 17. Neu siebzehn.']))
    expect(results[0]!.applied).toBe(true)
    expect(renamed).toMatchObject([{ level: 'para', para: '§ 17', from: '10', to: '17', batch: 0, instruction: 0, origin: '10' }])
    const origin = renamedOrigins(renamed)
    expect([origin('17'), origin('10'), origin('11')]).toEqual(['10', null, '11'])
  })

  it('reads „durch folgenden § 3e ersetzt" the same way, and keeps the Überschrift the new text does not bring (AC8FD757)', () => {
    const { renamed, law: out } = run(l(), instr('§ 11 wird durch folgenden § 11a ersetzt:', ['§ 11a. Neu elf a.']))
    expect(renamed.map((r) => [r.from, r.to])).toEqual([['11', '11a']])
    expect(out.paragraphs.map((p) => `${p.id}:${p.heading}`)).toEqual(['8:Acht', '10:Zehn', '11a:Elf', '12:Zwölf'])
    // A heading in the new text is the new heading; „samt Überschrift" without one is refused.
    expect(run(l(), instr('Der bisherige § 10 wird zu § 17 und lautet:', [{ text: 'Siebzehn', heading: true }, '§ 17. Neu.'])).law.paragraphs[1]!.heading).toBe('Siebzehn')
    expect(run(l(), instr('Der bisherige § 10 wird zu § 17 und lautet samt Überschrift:', ['§ 17. Neu.'])).results.map((r) => r.reason)).toContain('samt Überschrift, aber keine Überschrift im neuen Text')
  })

  it('records a run of several as no renaming — it claims no succession one by one', () => {
    const { renamed, results } = run(l(), instr('Im 3. Abschnitt werden die bisherigen §§ 11 und 12 samt Überschriften durch folgende §§ 18 und 19 ersetzt:', ['§ 18. Neu achtzehn.', '§ 19. Neu neunzehn.']))
    expect(results[0]!.applied).toBe(true)
    expect(renamed).toEqual([])
  })

  it('puts it in a batch of its own behind a renumbering, and records nothing where it fails', () => {
    const { renamed } = run(
      l(),
      instr('§ 8 erhält die Paragraphenbezeichnung "§ 9."'),
      instr('Der bisherige § 10 wird zu § 17 und lautet:', ['§ 17. Neu siebzehn.']),
      // § 11 still stands: the replacement is refused, and nothing moved.
      instr('Der bisherige § 12 wird zu § 11 und lautet:', ['§ 11. Neu elf.']),
    )
    expect(renamed.map((r) => [r.from, r.to, r.batch])).toEqual([['8', '9', 0], ['10', '17', 1]])
  })

  it('licenses a later „(neu)", as a renumbering does', () => {
    const { results } = run(l(), instr('§ 10 wird durch folgenden § 17 ersetzt:', ['§ 17. Neu siebzehn.']), instr('In § 17 (neu) wird das Wort "siebzehn" durch das Wort "zehn" ersetzt.'))
    expect(results.map((r) => r.reason)).toEqual([null, null])
  })
})

describe('a § renumbered with its new designation written out (26.10.2026)', () => {
  const l = (): StandingLaw => ({ paragraphs: [para('9', 'Haftung', ['IVS-Diensteanbieter haften.']), para('14', 'Verweisungen', ['Soweit verwiesen wird, gilt die geltende Fassung.']), para('16', 'Vollziehung', ['Betraut ist die Bundesministerin.'])] })

  it('moves the § and records the move (51/ME XXVIII: § 14 → § 22)', () => {
    const { law: out, results, renamed } = run(l(), instr('Der bisherige § 14 wird zu § 22.'))
    expect(results[0]!.applied).toBe(true)
    expect(out.paragraphs.map((p) => p.marker)).toEqual(['§ 9.', '§ 22.', '§ 16.'])
    expect(renamedOrigins(renamed)('22')).toBe('14')
  })

  it('refuses a number another § still holds, and locks both (51/ME: § 9 → § 16 before § 16 → § 24)', () => {
    const { results, unresolved } = run(l(), instr('Der bisherige § 9 wird zu § 16.'))
    expect(results[0]!.reason).toBe('Bezeichnung 16 existiert bereits')
    expect([...unresolved].sort()).toEqual(['§ 16', '§ 9'])
  })
})

describe('a number two §§ carry for a while: ascending chains (26.10.2026)', () => {
  const l = (): StandingLaw => ({ paragraphs: [para('14', 'Vierzehn', ['Alt vierzehn.']), para('15', 'Fünfzehn', ['Alt fünfzehn eins.', 'Alt fünfzehn zwei.']), para('16', 'Sechzehn', ['Alt sechzehn.']), para('17', 'Siebzehn', ['Alt siebzehn.'])] })
  const text = (out: StandingLaw) => out.paragraphs.map((p) => `${p.id}:${plainText(p)}`)

  it('carries out the moves of E0399A69 in the order of the old numbers', () => {
    const { law: out, results, renamed } = run(
      l(),
      instr('Nach § 14 wird folgender § 15 samt Überschrift eingefügt:', [{ text: 'Neu', heading: true }, '§ 15. Neu fünfzehn.']),
      instr('§ 15 erhält die Paragraphenbezeichnung "16".'),
      // The § that has just become § 16 — the Beilage changes the old § 15's Abs. 2.
      instr('§ 16 Abs. 2 lautet:', ['(2) Neu zwei.']),
      // The § standing under 16 from the start.
      instr('§ 16 wird durch folgenden § 17 ersetzt:', ['§ 17. Neu siebzehn.']),
      instr('§ 17 erhält die Paragraphenbezeichnung "§ 18".'),
    )
    expect(results.map((r) => r.reason)).toEqual([null, null, null, null, null])
    expect(text(out)).toEqual([
      '14:Vierzehn Alt vierzehn.',
      '15:Neu Neu fünfzehn.',
      '16:Fünfzehn Alt fünfzehn eins. Neu zwei.',
      '17:Sechzehn Neu siebzehn.',
      '18:Siebzehn Alt siebzehn.',
    ])
    const origin = renamedOrigins(renamed)
    expect(['15', '16', '17', '18'].map(origin)).toEqual([null, '15', '16', '17'])
  })

  it('refuses the line that took the number where nothing frees it, and runs the Novelle again without it', () => {
    // § 17 stays: „§ 16 → § 17" fails, and with it the number 16 is never
    // freed — so „§ 15 → § 16" is refused too, and nothing moves.
    const { law: out, results } = run(l(), instr('§ 15 erhält die Paragraphenbezeichnung "16".'), instr('§ 16 erhält die Paragraphenbezeichnung "17".'))
    expect(results.map((r) => r.reason)).toEqual(['Bezeichnung 16 existiert bereits', 'Bezeichnung 17 existiert bereits'])
    expect(out.paragraphs.map((p) => p.id)).toEqual(['14', '15', '16', '17'])
    expect(run(l(), instr('Nach § 14 wird folgender § 15 eingefügt:', ['§ 15. Neu.'])).results[0]!.reason).toBe('§ 15 existiert bereits')
  })

  it('records which § an instruction acted on, whatever number it carried then (BGBl. I Nr. 24/2026: § 15 (neu))', () => {
    const law: StandingLaw = { paragraphs: [para('8', 'Acht', ['Alt acht.']), para('15', 'Fünfzehn', ['Alt fünfzehn.'])] }
    const report = run(law, instr('§ 15 erhält die Paragraphenbezeichnung "§ 23." ; § 8 erhält die Paragraphenbezeichnung "§ 15."'), instr('§ 15 (neu) lautet:', ['Neu fünfzehn.']))
    const [now15, now23] = ['15', '23'].map((id) => report.law.paragraphs.find((p) => p.id === id)!)
    // „§ 15 (neu)" means the old § 8; the old § 15, now § 23, only moved.
    expect([report.touches(2, now15!), report.touches(2, now23!)]).toEqual([true, false])
    expect([report.touches(0, now23!), report.touches(1, now15!)]).toEqual([true, true])
  })
})

describe('what a refused line would have created (26.10.2026)', () => {
  it('keeps the §§ its new text spells out, and none of a table of contents', () => {
    // DC0E9C30: „Der 3. Unterabschnitt des 2. Abschnitts lautet:" refused for
    // a table, over §§ the line never names.
    const { refused } = instructionsFromUnits([unitOf([
      { kind: 'novao', text: '1. Der 3. Unterabschnitt des 2. Abschnitts lautet:' },
      { kind: 'abs', gld: '§ 10.', text: '"Text zehn."' },
      { kind: 'abs', gld: '§ 10a.', text: 'Text zehn a.', cls: 'table:1' },
    ])])
    expect(refused.map((r) => [r.reason, r.created])).toEqual([['Tabelle im neuen Text — nicht als Gesetzestext abbildbar', ['§ 10', '§ 10a']]])
    const toc = instructionsFromUnits([unitOf([
      { kind: 'novao', text: '1. Im Inhaltsverzeichnis lauten die Einträge zu den §§ 40 bis 40e:' },
      { kind: 'abs', gld: '§ 40a.', text: 'Eintrag.', cls: 'table:1' },
    ])])
    expect(toc.refused.map((r) => r.created)).toEqual([[]])
  })

  it('locks what the words of a failed line announce beyond its operation', () => {
    // 51/ME XXVIII: read as the insertion alone; § 23 was neither counted nor locked.
    const { unresolved } = run(law(), instr('Der bisherige § 15 wird zu § 23 Abs. 1; ihm wird folgender Abs. 2 angefügt:', ['(2) Neu.']))
    expect(unresolved.has('§ 23')).toBe(true)
  })
})

describe('a number restated before the line that moves „the former" § of it (26.10.2026)', () => {
  const l = (): StandingLaw => ({ paragraphs: [para('5', 'Fünf', ['Alt fünf eins.', 'Alt fünf zwei.']), para('6', 'Sechs', ['Alt sechs.'])] })
  const text = (out: StandingLaw) => out.paragraphs.map((p) => `${p.id}:${plainText(p)}`)

  it('sets the new § beside the standing one, which keeps its text under its new number', () => {
    // „1. § 5 lautet: … 2. Der bisherige § 5 erhält die Bezeichnung § 7." —
    // restated in place, § 7 carried the NEW text and the old one was gone.
    const report = run(l(), instr('§ 5 lautet:', ['Neu fünf.']), instr('Der bisherige § 5 erhält die Bezeichnung § 7.'))
    expect(report.results.map((r) => r.reason)).toEqual([null, null])
    expect(text(report.law)).toEqual(['5:Fünf Neu fünf.', '7:Fünf Alt fünf eins. Alt fünf zwei.', '6:Sechs Alt sechs.'])
    const [now5, now7] = ['5', '7'].map((id) => report.law.paragraphs.find((p) => p.id === id)!)
    expect([report.touches(0, now5!), report.touches(0, now7!), report.touches(1, now7!)]).toEqual([true, false, true])
    expect(['5', '7'].map(renamedOrigins(report.renamed))).toEqual([null, '5'])
  })

  it('restates in place where no later line calls the § the former one, and where that line fails', () => {
    // Without „bisherig" the later line moves the § as it stands then.
    expect(text(run(l(), instr('§ 5 lautet:', ['Neu fünf.']), instr('§ 5 erhält die Bezeichnung § 7.')).law)).toEqual(['7:Fünf Neu fünf.', '6:Sechs Alt sechs.'])
    // § 6 is taken: the move fails, the number is never freed, and the restatement is refused with it.
    const stuck = run(l(), instr('§ 5 lautet:', ['Neu fünf.']), instr('Der bisherige § 5 erhält die Bezeichnung § 6.'))
    expect(stuck.results.map((r) => r.applied)).toEqual([false, false])
    expect(text(stuck.law)).toEqual(['5:Fünf Alt fünf eins. Alt fünf zwei.', '6:Sechs Alt sechs.'])
  })

  it('below the § as well: the new unit beside the standing one, which moves on with its text (BGBl. I Nr. 25/2026, § 110 Abs. 2a)', () => {
    const { results, law: out } = run(l(), instr('§ 5 Abs. 2 lautet:', ['(2) Neu zwei.']), instr('Der bisherige Abs. 2 des § 5 erhält die Bezeichnung "(3)".'))
    expect(results.map((r) => r.reason)).toEqual([null, null])
    expect(out.paragraphs[0]!.children.map((c) => `${c.marker} ${c.text}`)).toEqual(['(1) Alt fünf eins.', '(2) Neu zwei.', '(3) Alt fünf zwei.'])
    // It took nothing out, and the guard must not charge it with the old text (`ApplyResult.units`).
    expect(results[0]!.units).toEqual([null])
  })

  it('refuses the restatement of several units beside the standing ones', () => {
    const three: StandingLaw = { paragraphs: [para('5', 'Fünf', ['Alt eins.', 'Alt zwei.', 'Alt drei.'])] }
    const { results } = run(three, instr('§ 5 Abs. 2 und 3 lauten:', ['(2) Neu zwei.', '(3) Neu drei.']), instr('Der bisherige Abs. 2 des § 5 erhält die Bezeichnung "(4)".'))
    expect(results[0]!.reason).toBe('Neufassung unter einer Nummer, deren bisherige Einheit eine spätere Zeile umbenennt')
  })
})

describe('a number two units below the § carry for a while (26.10.2026)', () => {
  /** A § of numbered Absätze, `[id, text]` each. */
  const absPara = (id: string, absaetze: [string, string][]): LawNode => {
    const p = makeNode('para', id, `§ ${id}.`, '', 'Titel')
    for (const [abs, text] of absaetze) p.children.push(makeNode('abs', abs, `(${abs})`, text))
    return p
  }
  const absaetze = (out: StandingLaw) => out.paragraphs[0]!.children.map((c) => `${c.marker} ${c.text}`)

  it('carries out an ascending chain of moves, the „nunmehrige" unit meaning the one that arrived (BGBl. I Nr. 25/2026, ArbVG § 110)', () => {
    const l: StandingLaw = { paragraphs: [absPara('110', [['1', 'Eins.'], ['2', 'Zwei.'], ['2a', 'Alt zwei a.'], ['2b', 'Alt zwei b.'], ['2c', 'Alt zwei c.'], ['2d', 'Alt zwei d.'], ['3', 'Drei.']])] }
    const { law: out, results } = run(
      l,
      instr('§ 110 Abs. 2a lautet:', ['(2a) Neu zwei a.']),
      instr('Der bisherige Abs. 2a des § 110 erhält die Bezeichnung "Abs. 2b".'),
      instr('Im nunmehrigen § 110 Abs. 2b wird das Wort "Alt" durch das Wort "Bisher" ersetzt.'),
      instr('Der bisherige Abs. 2b des § 110 erhält die Bezeichnung "Abs. 2c".'),
      instr('Der bisherige Abs. 2c des § 110 erhält die Bezeichnung "Abs. 2d".'),
      instr('Der bisherige Abs. 2d des § 110 erhält die Bezeichnung "Abs. 2e".'),
    )
    expect(results.map((r) => r.reason)).toEqual([null, null, null, null, null, null])
    expect(absaetze(out)).toEqual(['(1) Eins.', '(2) Zwei.', '(2a) Neu zwei a.', '(2b) Bisher zwei a.', '(2c) Alt zwei b.', '(2d) Alt zwei c.', '(2e) Alt zwei d.', '(3) Drei.'])
  })

  it('inserts into a number a later line vacates, behind the anchor the address means (AC8FD757)', () => {
    const l: StandingLaw = { paragraphs: [absPara('4', [['1', 'Eins.'], ['2', 'Zwei.'], ['3', 'Alt drei.']])] }
    const { law: out, results } = run(l, instr('In § 4 wird nach Abs. 2 folgender Abs. 3 eingefügt:', ['(3) Neu drei.']), instr('In § 4 erhält Abs. 3 die Absatzbezeichnung "(4)".'))
    expect(results.map((r) => r.reason)).toEqual([null, null])
    expect(absaetze(out)).toEqual(['(1) Eins.', '(2) Zwei.', '(3) Neu drei.', '(4) Alt drei.'])
  })

  it('inserts before a run that brings the units in under the numbers above (114/ME XXVIII § 28)', () => {
    const p = makeNode('para', '28', '§ 28.', '', 'Aufgaben')
    const body = makeNode('abs', '', '', 'Aufgaben sind:')
    ;['eins', 'zwei', 'alt drei', 'alt vier', 'alt fünf'].forEach((t, i) => body.children.push(makeNode('z', String(i + 1), `${i + 1}.`, t)))
    p.children.push(body)
    const { law: out, results } = run(
      { paragraphs: [p] },
      instr('In § 28 wird nach Z 2 folgende Z 3 eingefügt:', ['3. neu drei']),
      instr('In § 28 werden Z 3 bis 5 durch folgende Z 4 bis 6 ersetzt:', ['4. neu vier', '5. neu fünf', '6. neu sechs']),
    )
    expect(results.map((r) => r.reason)).toEqual([null, null])
    expect(out.paragraphs[0]!.children[0]!.children.map((c) => `${c.marker} ${c.text}`)).toEqual(['1. eins', '2. zwei', '3. neu drei', '4. neu vier', '5. neu fünf', '6. neu sechs'])
  })

  it('moves into a number the same line repeals, the „bisherige" unit meaning the standing one (BGBl. I Nr. 39/2026, BFA-VG § 52a)', () => {
    const l: StandingLaw = { paragraphs: [absPara('52a', [['1', 'Eins.'], ['2', 'Alt zwei.'], ['2a', 'Alt zwei a.'], ['3', 'Alt drei.'], ['4', 'Alt vier.']])] }
    const { law: out, results } = run(
      l,
      instr('In § 52a wird nach Abs. 1 folgender Abs. 2 eingefügt:', ['(2) Neu zwei.']),
      instr('In § 52a erhalten der bisherige Abs. 2 und Abs. 2a die Absatzbezeichnungen "(3)" und "(7)"; der bisherige Abs. 3 und Abs. 4 entfallen.'),
      instr('In § 52a Abs. 3 (neu) wird das Wort "Alt" durch das Wort "Bisher" ersetzt.'),
    )
    expect(results.map((r) => r.reason)).toEqual([null, null, null, null, null])
    expect(absaetze(out)).toEqual(['(1) Eins.', '(2) Neu zwei.', '(3) Bisher zwei.', '(7) Alt zwei a.'])
  })

  it('refuses the line that took the number where nothing frees it, and runs the Novelle again without it', () => {
    // § 4 Abs. 4 stands and no line moves it: „Abs. 3 → (4)" fails, the
    // number 3 is never freed, and the insertion is refused with it.
    const l: StandingLaw = { paragraphs: [absPara('4', [['1', 'Eins.'], ['2', 'Zwei.'], ['3', 'Alt drei.'], ['4', 'Alt vier.']])] }
    const { law: out, results, unresolved } = run(l, instr('In § 4 wird nach Abs. 2 folgender Abs. 3 eingefügt:', ['(3) Neu drei.']), instr('In § 4 erhält Abs. 3 die Absatzbezeichnung "(4)".'))
    expect(results.map((r) => r.reason)).toEqual(['(3) existiert bereits', 'Bezeichnung 4 existiert bereits'])
    expect(absaetze(out)).toEqual(absaetze(l))
    expect(unresolved.has('§ 4')).toBe(true)
  })
})
