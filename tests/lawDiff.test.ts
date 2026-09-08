import { describe, expect, it } from 'vitest'
import { alignUnits, diffLawUnits, diffTokens, summarizeDiff } from '../server/utils/lawDiff'
import { normalizeGld, parseLawUnits, parseParliamentHtml } from '../server/utils/lawText'

/** Minimal Word-filtered Parliament HTML in the legistic template classes. */
function law(parts: { heading?: string; gld: string; abs: string[]; ziff?: string[] }[], opts: { article?: string; title?: string } = {}) {
  const head = opts.article
    ? `<p class=41UeberschrG1>Artikel&nbsp;1</p><p class=43UeberschrG2>${opts.article}</p>`
    : `<p class=11Titel>${opts.title ?? 'Bundesgesetz &uuml;ber X'}</p>`
  const toc = parts.map((p) => `<p class=32InhaltEintrag>${p.gld} ${p.heading ?? ''}</p>`).join('')
  const body = parts
    .map((p) => {
      const h = p.heading ? `<p class=45UeberschrPara>${p.heading}</p>` : ''
      const [first, ...rest] = p.abs
      return (
        h +
        `<p class=51Abs><span class=991GldSymbol>${p.gld}</span> ${first}</p>` +
        rest.map((a) => `<p class=51Abs>${a}</p>`).join('') +
        (p.ziff ?? []).map((z) => `<p class=52Aufzaehle1Ziffer>${z}</p>`).join('')
      )
    })
    .join('')
  return `<html><body>${head}${toc}${body}<p class='MsoNormal'>&nbsp;</p></body></html>`
}

describe('parseParliamentHtml', () => {
  it('reads classes, the Gliederungssymbol and decodes entities', () => {
    const blocks = parseParliamentHtml(law([{ heading: 'Anwendungsbereich', gld: '&sect;&nbsp;1.', abs: ['(1) Dieses Gesetz gilt f&uuml;r alle.'] }]))
    const abs = blocks.find((b) => b.kind === 'abs')!
    expect(abs.gld).toBe('§ 1.')
    expect(abs.text).toBe('(1) Dieses Gesetz gilt für alle.')
    expect(blocks.find((b) => b.kind === 'para_head')!.text).toBe('Anwendungsbereich')
    expect(blocks.filter((b) => b.kind === 'toc')).toHaveLength(1)
    expect(blocks.filter((b) => b.cls === 'MsoNormal')).toHaveLength(0)
  })

  it('normalises Gliederungssymbole', () => {
    expect(normalizeGld('§ 5.')).toBe('§5')
    expect(normalizeGld('Artikel 3.')).toBe('Art.3')
    expect(normalizeGld('§ 12a.')).toBe('§12a')
  })
})

describe('parseLawUnits', () => {
  it('yields one unit per § with heading, Absätze and Ziffern', () => {
    const units = parseLawUnits(
      law(
        [
          { heading: 'Ziel', gld: '&sect;&nbsp;1.', abs: ['Ziel ist A.'] },
          { heading: 'Begriffe', gld: '&sect;&nbsp;2.', abs: ['(1) Es gilt:', '(2) Weiter gilt:'], ziff: ['1. Eins;', '2. Zwei.'] },
        ],
        { article: 'Bundesgesetz &uuml;ber Y' },
      ),
    )
    expect(units.map((u) => u.id)).toEqual(['§1', '§2'])
    expect(units[0]!.article).toBe('Bundesgesetz über Y')
    expect(units[1]!.heading).toBe('Begriffe')
    expect(units[1]!.text).toBe('(1) Es gilt: (2) Weiter gilt: 1. Eins; 2. Zwei.')
  })

  it('keeps a Novellierungsanordnung with its quoted § as one unit', () => {
    const html = `<html><body><p class=41UeberschrG1>Artikel&nbsp;2</p><p class=43UeberschrG2>&Auml;nderung des Z-Gesetzes</p>
      <p class=21NovAo1>1. &sect;&nbsp;3 lautet:</p>
      <p class=51Abs><span class=991GldSymbol>&bdquo;&sect;&nbsp;3.</span> Neuer Text.&ldquo;</p>
      <p class=21NovAo1>2. In &sect;&nbsp;7 entf&auml;llt Abs.&nbsp;2.</p></body></html>`
    const units = parseLawUnits(html)
    expect(units.map((u) => u.id)).toEqual(['Z1', 'Z2'])
    expect(units[0]!.article).toBe('Änderung des Z-Gesetzes')
    expect(units[0]!.text).toContain('Neuer Text.')
  })
})

describe('diffTokens', () => {
  it('finds word-level changes and a similarity', () => {
    const d = diffTokens('Die Frist beträgt sechs Wochen.', 'Die Frist beträgt acht Wochen.')
    expect(d.segments).toEqual([
      { type: 'equal', text: 'Die Frist beträgt' },
      { type: 'removed', text: 'sechs' },
      { type: 'inserted', text: 'acht' },
      { type: 'equal', text: 'Wochen.' },
    ])
    expect(d.similarity).toBeCloseTo(0.8, 5)
  })
})

describe('diffLawUnits: the renumbering trap', () => {
  const me = parseLawUnits(
    law([
      { heading: 'Ziel', gld: '&sect;&nbsp;1.', abs: ['Ziel ist der Ausbau.'] },
      { heading: 'Begriffe', gld: '&sect;&nbsp;2.', abs: ['Es gelten die Begriffe des EAG.'] },
      { heading: 'Verfahren', gld: '&sect;&nbsp;3.', abs: ['Das Verfahren dauert sechs Monate.'] },
      { heading: 'Inkrafttreten', gld: '&sect;&nbsp;4.', abs: ['Dieses Gesetz tritt am 1. J&auml;nner 2026 in Kraft.'] },
    ]),
  )
  const rv = parseLawUnits(
    law([
      { heading: 'Ziel', gld: '&sect;&nbsp;1.', abs: ['Ziel ist der Ausbau.'] },
      { heading: 'Begriffe', gld: '&sect;&nbsp;2.', abs: ['Es gelten die Begriffe des EAG.'] },
      { heading: 'Beteiligung', gld: '&sect;&nbsp;3.', abs: ['Die &Ouml;ffentlichkeit ist zu beteiligen.'] },
      { heading: 'Verfahren', gld: '&sect;&nbsp;4.', abs: ['Das Verfahren dauert vier Monate.'] },
      { heading: 'Inkrafttreten', gld: '&sect;&nbsp;5.', abs: ['Dieses Gesetz tritt am 1. J&auml;nner 2026 in Kraft.'] },
    ]),
  )

  it('aligns by heading, so shifted paragraphs are not "changed"', () => {
    const a = alignUnits(me, rv)
    expect(a.pairs.map((p) => `${p.me.id}>${p.rv.id}`)).toEqual(['§1>§1', '§2>§2', '§3>§4', '§4>§5'])
    expect(a.onlyRv.map((u) => u.id)).toEqual(['§3'])
    expect(a.onlyMe).toEqual([])
  })

  it('reports one insertion and one real change, in RV order', () => {
    const units = diffLawUnits(me, rv)
    expect(units.map((u) => `${u.id}:${u.change}`)).toEqual(['§1:unchanged', '§2:unchanged', '§3:inserted', '§4:changed', '§5:unchanged'])
    const changed = units.find((u) => u.change === 'changed')!
    expect(changed.meId).toBe('§3')
    expect(changed.segments!.some((s) => s.type === 'removed' && s.text === 'sechs')).toBe(true)
    expect(summarizeDiff(units)).toEqual({ total: 5, unchanged: 3, changed: 1, inserted: 1, removed: 0 })
  })

  it('places a removed § where it stood in the draft', () => {
    const units = diffLawUnits(rv, me) // reverse direction: § 3 Beteiligung disappears
    expect(units.map((u) => `${u.id}:${u.change}`)).toEqual(['§1:unchanged', '§2:unchanged', '§3:removed', '§3:changed', '§4:unchanged'])
  })
})
