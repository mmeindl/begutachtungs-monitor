import { describe, expect, it } from 'vitest'
import { GAP_LEAD_DE } from '../shared/utils/gaps'
import { PAUSE_LINES_404_DE, pauseLineFor } from '../app/utils/pauseLines'

/**
 * The pause line of the plain 404 (`docs/decisions.md`, „A pause line stands
 * on the plain 404 and says nothing about a draft"): which line a path gets,
 * and the rule that keeps a line from being read as information.
 */
describe('the line a path gets', () => {
  it('is the same on every call, so server and browser agree', () => {
    const path = '/entwuerfe/XXVIII/gibt-es-nicht'
    expect(pauseLineFor(PAUSE_LINES_404_DE, path)).toBe(pauseLineFor(PAUSE_LINES_404_DE, path))
    expect(PAUSE_LINES_404_DE).toContain(pauseLineFor(PAUSE_LINES_404_DE, path))
  })

  it('reaches every line over many paths', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 400; i++) seen.add(pauseLineFor(PAUSE_LINES_404_DE, `/seite-${i}`) ?? '')
    expect(seen.size).toBe(PAUSE_LINES_404_DE.length)
  })

  it('is null for an empty list, never undefined', () => {
    expect(pauseLineFor([], '/x')).toBeNull()
  })
})

describe('what a line on the 404 may say', () => {
  /* Words the monitor uses as information about a draft. On the address of
     a draft that does not exist, „keine Frist" or „nie kundgemacht" would be
     read as a fact. */
  const STATE_WORDS = /Frist|Kundmachung|kundgemacht|Beschluss|beschlossen|entf[aä]ll|zurückgezogen|Stellungnahme|Begutachtung|Regierungsvorlage|Entwurf|in Kraft/i

  it.each(PAUSE_LINES_404_DE)('uses no word of a draft\'s state: %s', (line) => {
    expect(line).not.toMatch(STATE_WORDS)
  })

  it('opens with no lead word of a gap sentence', () => {
    for (const line of PAUSE_LINES_404_DE) {
      for (const lead of Object.values(GAP_LEAD_DE)) expect(line.startsWith(lead)).toBe(false)
    }
  })

  it('addresses nobody and writes „Paragraph"', () => {
    for (const line of PAUSE_LINES_404_DE) {
      expect(line).not.toMatch(/\b(du|dich|dir|dein\w*|Sie|Ihnen|Ihr\w*)\b/)
      expect(line).not.toMatch(/Paragraf/)
    }
  })

  it('has no line twice', () => {
    expect(new Set(PAUSE_LINES_404_DE).size).toBe(PAUSE_LINES_404_DE.length)
  })

  /* The line stands directly under the title „Seite nicht gefunden". */
  it('does not say the title again', () => {
    for (const line of PAUSE_LINES_404_DE) expect(line).not.toMatch(/^Seite nicht gefunden/)
  })
})
