import { describe, expect, it } from 'vitest'
import { parseExplanationsHtml, passagesByParagraph } from '../server/utils/explanationsHtml'

/** Ein Erläuterungen-Dokument, wie das Parlament es aus Word ausgibt. */
function doc(...paragraphs: string[]): string {
  return `<html><body>${paragraphs.map((p) => `<p class=MsoNormal>${p}</p>`).join('')}</body></html>`
}

describe('parseExplanationsHtml', () => {
  it('splits the general part from the passages of the special part', () => {
    const parsed = parseExplanationsHtml(
      doc(
        'Allgemeiner Teil',
        'Mit dem Entwurf wird die Richtlinie umgesetzt.',
        'Besonderer Teil',
        'Zu Z 4 (§ 54c Abs. 1a und 1b):',
        'Die Änderung dient der Klarstellung.',
        'Zu Z 5 (§ 60):',
        'Redaktionelle Anpassung.',
      ),
    )
    expect(parsed.general).toEqual(['Mit dem Entwurf wird die Richtlinie umgesetzt.'])
    expect(parsed.special.map((p) => p.paragraphs)).toEqual([['§ 54c'], ['§ 60']])
    expect(parsed.special[0]!.text).toEqual(['Die Änderung dient der Klarstellung.'])
  })

  // Ein Fünftel der Dokumente druckt keine Überschrift „Besonderer Teil",
  // sondern beginnt einfach mit „Zu § 1:" — derselbe Befund, den
  // `explanations.ts` am RIS-XML gemacht hat.
  it('starts the special part at the first address heading, with no divider', () => {
    const parsed = parseExplanationsHtml(doc('Allgemeiner Teil', 'Vorbemerkung.', 'Zu § 1:', 'Begründung zu § 1.'))
    expect(parsed.general).toEqual(['Vorbemerkung.'])
    expect(parsed.special).toHaveLength(1)
    expect(parsed.special[0]!.paragraphs).toEqual(['§ 1'])
  })

  // „B e s o n d e r e r  T e i l" — gesperrt gesetzte Überschriften sind in
  // diesen Dokumenten die Regel (§12.29).
  it('recognises a letter-spaced part heading', () => {
    const parsed = parseExplanationsHtml(doc('B e s o n d e r e r  T e i l', 'Zu § 2:', 'Text.'))
    expect(parsed.general).toEqual([])
    expect(parsed.special[0]!.paragraphs).toEqual(['§ 2'])
  })

  // Prosa, die zufällig einen Paragraphen zitiert, eröffnet keine Passage —
  // sonst hinge die Begründung des nächsten § an der falschen Adresse.
  it('does not open a passage on prose that merely cites a §', () => {
    const parsed = parseExplanationsHtml(doc('Allgemeiner Teil', 'Zum Verhältnis zu § 5 ist zu sagen: nichts.'))
    expect(parsed.special).toEqual([])
    expect(parsed.general).toHaveLength(1)
  })

  it('leaves an orphan paragraph of the special part unattributed', () => {
    const parsed = parseExplanationsHtml(doc('Besonderer Teil', 'Ein Absatz ohne Adresse.', 'Zu § 3:', 'Begründung.'))
    expect(parsed.special).toHaveLength(1)
    expect(parsed.special[0]!.text).toEqual(['Begründung.'])
  })
})

describe('passagesByParagraph', () => {
  it('keys the passages by the § number both sides form', () => {
    const parsed = parseExplanationsHtml(doc('Besonderer Teil', 'Zu § 12:', 'Begründung zu zwölf.', 'Zu §§ 12 bis 14:', 'Gemeinsame Begründung.'))
    const byPara = passagesByParagraph(parsed)
    expect([...byPara.keys()].sort()).toEqual(['12', '13', '14'])
    expect(byPara.get('12')).toHaveLength(2)
  })

  /**
   * Die Aufzählung, seit 22.09.2026 gelesen: „Zu §§ 12 und 13" erklärt beide
   * Paragraphen in einem Atemzug, und vorher bekam nur der erste die
   * Passage. Geteilter Code mit dem RIS-Pfad, deshalb dort gemessen
   * (`pnpm audit:erlaeuterungen -- --join`, §12.30).
   */
  it('reads an enumeration as well as a range', () => {
    const byPara = passagesByParagraph(parseExplanationsHtml(doc('Besonderer Teil', 'Zu §§ 12 und 13:', 'Gemeinsame Begründung.')))
    expect([...byPara.keys()].sort()).toEqual(['12', '13'])
  })
})
