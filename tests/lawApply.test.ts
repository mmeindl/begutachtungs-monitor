import { describe, expect, it } from 'vitest'
import { applyNovelle, instructionsFromUnits, parsePayload, resolveTarget, splitSentences, stripPayloadQuotes, type Instruction, type StandingLaw } from '../server/utils/kons/lawApply'
import { makeNode, parseKonsParagraph, plainText, renderNode } from '../server/utils/lawtext/konsTree'
import { paraNode as para } from './helpers/builders'
import { parseInstruction, type NovaoAddress } from '../server/utils/kons/novao'

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
    const units = [{ article: null, articleNumber: null, id: 'Z1', heading: null, quotedHeadings: [], text: '', blocks: [{ kind: 'novao' as const, cls: '', text: '1. § 6 Abs. 1 lautet:', gld: null }, { kind: 'other' as const, cls: 'table:absatz/tabtext', text: '2022 7,5 Mio. Euro', gld: null }] }]
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

  // The guard that makes the loosening safe: without „jeweils" the address is
  // ONE place however many units it spans, and the phrase must be unique
  // across all of them. An instruction that names two Absätze and means one
  // of them must not write into both.
  it('keeps demanding one occurrence across the whole address without „jeweils"', () => {
    const { results } = run(twoAbsaetze(), instr('In § 81 Abs. 1 und 2 wird das Wort "Acten" durch das Wort "Akten" ersetzt.'))
    expect(results[0]!.reason).toMatch(/nicht eindeutig/)
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

  it('refuses a text that opens with a mark', () => {
    expect(parseInstruction('In § 5 Abs. 1 wird am Ende der Z 2 der Ausdruck ", oder" angefügt.').ops).toEqual([])
  })
})
