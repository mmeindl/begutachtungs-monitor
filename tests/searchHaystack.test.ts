/**
 * Taking the ressort mention out of the search field (§12.31) — and the two
 * mistakes this rule could make.
 *
 * TOO LITTLE: every Verordnung's long title begins with its house's whole
 * portfolio, and the ressort name carries it once more. If one of the two is
 * left standing, „klima" keeps pulling the BMLUK's entire output.
 *
 * TOO MUCH: „Finanzen", „Justiz", „Inneres" are ordinary subject words too.
 * A Verordnung ABOUT the finances of something has to stay findable under
 * „Finanzen" — which is why a portfolio falls only inside the ministerial
 * clause, never on its own.
 */
import { describe, expect, it } from 'vitest'
import { ministryToken, ministryTokens, stripMinistryMentions } from '../server/utils/search/searchHaystack'

const BMLUK = 'Bundesministerium für Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft'
const BMF = 'Bundesministerium für Finanzen'

describe('ministryToken', () => {
  it('nimmt das Portfolio hinter dem „für“', () => {
    expect(ministryToken(BMLUK)).toEqual({
      text: 'Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft',
      clauseOnly: true,
    })
  })

  it('nimmt einen Namen ohne „für“ als Eigennamen', () => {
    expect(ministryToken('Bundeskanzleramt')).toEqual({ text: 'Bundeskanzleramt', clauseOnly: false })
  })

  it('macht aus einem leeren oder zu kurzen Namen kein Token', () => {
    // A token of two characters would stand in every second title.
    expect(ministryToken('')).toBeNull()
    expect(ministryToken('  ')).toBeNull()
    expect(ministryToken('BMF')).toBeNull()
  })
})

describe('ministryTokens', () => {
  it('stellt das längste Token voran', () => {
    // Otherwise a remnant of „Finanzen und Wirtschaft" would be left after
    // „Finanzen" is struck, one no clause carries any more.
    const tokens = ministryTokens([BMF, 'Bundesministerium für Finanzen und Wirtschaft'])
    expect(tokens.map((t) => t.text)).toEqual(['Finanzen und Wirtschaft', 'Finanzen'])
  })

  it('führt jedes Token einmal, auch wenn zwei Häuser es tragen', () => {
    expect(ministryTokens([BMF, BMF]).length).toBe(1)
  })
})

describe('stripMinistryMentions', () => {
  const tokens = ministryTokens([BMLUK, BMF, 'Bundeskanzleramt'])

  it('streicht die Ministerklausel aus dem Langtitel einer Verordnung', () => {
    const titel =
      'Verordnung des Bundesministers für Land- und Forstwirtschaft, Klima- und Umweltschutz, ' +
      'Regionen und Wasserwirtschaft, mit der die GAP-Strategieplan-Anwendungsverordnung geändert wird'
    const out = stripMinistryMentions(titel, tokens).toLowerCase()
    expect(out).not.toContain('klima')
    // The subject matter stays — it is the reason the long title is searched
    // at all.
    expect(out).toContain('gap-strategieplan-anwendungsverordnung')
  })

  it('streicht auch das zweite Haus', () => {
    const titel = 'Verordnung des Bundesministers für Finanzen im Einvernehmen mit dem Bundesminister für ' +
      'Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft über die Abgaben'
    const out = stripMinistryMentions(titel, tokens).toLowerCase()
    expect(out).not.toContain('klima')
    expect(out).not.toContain('finanzen')
    expect(out).toContain('abgaben')
  })

  it('streicht die Schreibweise des Datensatzes genauso', () => {
    const out = stripMinistryMentions(`Erlass des ${BMLUK} über Vieles`, tokens)
    expect(out.toLowerCase()).not.toContain('umweltschutz')
    expect(out.toLowerCase()).toContain('vieles')
  })

  it('hält die Schreibweisen aus, die im Bestand wirklich vorkommen', () => {
    // Both measured on 21.09.2026, both had missed the rigid version: the
    // absent hyphen and the half name.
    const ohneBindestrich = 'Verordnung des Bundesministers für Land- und Forstwirtschaft, Klima und ' +
      'Umweltschutz, Regionen und Wasserwirtschaft, mit der die Rebsortenverordnung geändert wird'
    const halberName = 'Verordnung des Bundesministers für Land- und Forstwirtschaft, Klima- und ' +
      'Umweltschutz, mit der die Nachhaltige forstwirtschaftliche Biomasse-Verordnung geändert wird'
    expect(stripMinistryMentions(ohneBindestrich, tokens).toLowerCase()).not.toContain('klima')
    expect(stripMinistryMentions(ohneBindestrich, tokens).toLowerCase()).toContain('rebsortenverordnung')
    expect(stripMinistryMentions(halberName, tokens).toLowerCase()).not.toContain('klima')
    expect(stripMinistryMentions(halberName, tokens).toLowerCase()).toContain('biomasse')
  })

  it('nimmt nicht mehr weg, als der Ressortname hergibt', () => {
    // The word chain ends with the portfolio — what follows is subject matter.
    const titel = 'Verordnung des Bundesministers für Finanzen und Sport über die Abgaben'
    const out = stripMinistryMentions(titel, tokens)
    expect(out).toContain('Abgaben')
    expect(out).toContain('Sport')
  })

  it('lässt das Portfolio als Sachwort stehen', () => {
    // The one case a too greedy rule would fail on.
    const titel = 'Verordnung über die Finanzen der Sozialversicherungsträger'
    expect(stripMinistryMentions(titel, tokens)).toContain('Finanzen')
  })

  it('streicht einen Eigennamen auch ohne Klausel', () => {
    expect(stripMinistryMentions('Richtlinie des Bundeskanzleramtes', tokens)).not.toContain('Bundeskanzleramt')
  })

  it('kommt mit leerem Text und leerer Liste zurecht', () => {
    expect(stripMinistryMentions('', tokens)).toBe('')
    expect(stripMinistryMentions('Klimagesetz', [])).toBe('Klimagesetz')
  })
})
