/**
 * Die Ressortnennung aus dem Suchfeld (§12.31) — und die zwei Fehler, die
 * diese Regel machen könnte.
 *
 * ZU WENIG: Der Langtitel jeder Verordnung beginnt mit dem ganzen Portfolio
 * ihres Hauses, der Ressortname enthält es noch einmal. Bleibt eines davon
 * stehen, zieht „klima" weiter den gesamten Output des BMLUK.
 *
 * ZU VIEL: „Finanzen", „Justiz", „Inneres" sind auch gewöhnliche Sachwörter.
 * Eine Verordnung ÜBER die Finanzen von etwas muss unter „Finanzen"
 * auffindbar bleiben — deshalb fällt ein Portfolio nur in der
 * Ministerklausel, nie für sich.
 */
import { describe, expect, it } from 'vitest'
import { ministryToken, ministryTokens, stripMinistryMentions } from '../server/utils/searchHaystack'

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
    // Ein Token aus zwei Zeichen stünde in jedem zweiten Titel.
    expect(ministryToken('')).toBeNull()
    expect(ministryToken('  ')).toBeNull()
    expect(ministryToken('BMF')).toBeNull()
  })
})

describe('ministryTokens', () => {
  it('stellt das längste Token voran', () => {
    // Sonst bliebe von „Finanzen und Wirtschaft" nach dem Streichen von
    // „Finanzen" ein Rest stehen, den keine Klausel mehr trägt.
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
    const titel
      = 'Verordnung des Bundesministers für Land- und Forstwirtschaft, Klima- und Umweltschutz, '
        + 'Regionen und Wasserwirtschaft, mit der die GAP-Strategieplan-Anwendungsverordnung geändert wird'
    const out = stripMinistryMentions(titel, tokens).toLowerCase()
    expect(out).not.toContain('klima')
    // Der Gegenstand bleibt — er ist der Grund, warum der Langtitel überhaupt
    // durchsucht wird.
    expect(out).toContain('gap-strategieplan-anwendungsverordnung')
  })

  it('streicht auch das zweite Haus', () => {
    const titel = 'Verordnung des Bundesministers für Finanzen im Einvernehmen mit dem Bundesminister für '
      + 'Land- und Forstwirtschaft, Klima- und Umweltschutz, Regionen und Wasserwirtschaft über die Abgaben'
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
    // Beide am 21.09.2026 gemessen, beide hatten die starre Fassung verfehlt:
    // der fehlende Bindestrich und der halbe Name.
    const ohneBindestrich = 'Verordnung des Bundesministers für Land- und Forstwirtschaft, Klima und '
      + 'Umweltschutz, Regionen und Wasserwirtschaft, mit der die Rebsortenverordnung geändert wird'
    const halberName = 'Verordnung des Bundesministers für Land- und Forstwirtschaft, Klima- und '
      + 'Umweltschutz, mit der die Nachhaltige forstwirtschaftliche Biomasse-Verordnung geändert wird'
    expect(stripMinistryMentions(ohneBindestrich, tokens).toLowerCase()).not.toContain('klima')
    expect(stripMinistryMentions(ohneBindestrich, tokens).toLowerCase()).toContain('rebsortenverordnung')
    expect(stripMinistryMentions(halberName, tokens).toLowerCase()).not.toContain('klima')
    expect(stripMinistryMentions(halberName, tokens).toLowerCase()).toContain('biomasse')
  })

  it('nimmt nicht mehr weg, als der Ressortname hergibt', () => {
    // Die Wortkette endet mit dem Portfolio — was danach kommt, ist Gegenstand.
    const titel = 'Verordnung des Bundesministers für Finanzen und Sport über die Abgaben'
    const out = stripMinistryMentions(titel, tokens)
    expect(out).toContain('Abgaben')
    expect(out).toContain('Sport')
  })

  it('lässt das Portfolio als Sachwort stehen', () => {
    // Der eine Fall, an dem eine zu gierige Regel scheitern würde.
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
