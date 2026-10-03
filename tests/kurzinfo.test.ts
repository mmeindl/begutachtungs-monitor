import { describe, expect, it } from 'vitest'
import type { DescriptionBlock } from '../shared/types'
import { withoutMainPoints } from '../app/utils/kurzinfo'

/* The Kurzinformation's usual shape: Ziel, Inhalt, Hauptgesichtspunkte. */
const KURZINFO: DescriptionBlock[] = [
  { kind: 'heading', text: 'Ziel' },
  { kind: 'paragraph', text: 'Ein Ziel.' },
  { kind: 'heading', text: 'Inhalt' },
  { kind: 'list', items: ['Eins', 'Zwei'] },
  { kind: 'heading', text: 'Hauptgesichtspunkte des Entwurfs:' },
  { kind: 'paragraph', text: 'Der Allgemeine Teil in kürzeren Worten.' },
  { kind: 'list', items: ['Drei'] },
]

describe('withoutMainPoints', () => {
  it('drops the Hauptgesichtspunkte section, heading included', () => {
    expect(withoutMainPoints(KURZINFO)).toEqual(KURZINFO.slice(0, 4))
  })

  it('cuts only up to the next heading', () => {
    const after: DescriptionBlock[] = [{ kind: 'heading', text: 'Finanzielle Auswirkungen' }, { kind: 'paragraph', text: 'Keine.' }]
    expect(withoutMainPoints([...KURZINFO, ...after])).toEqual([...KURZINFO.slice(0, 4), ...after])
  })

  it('keeps a lead without a heading and a heading that only mentions the word', () => {
    const blocks: DescriptionBlock[] = [
      { kind: 'paragraph', text: 'Vorspann.' },
      { kind: 'heading', text: 'Die Hauptgesichtspunkte' },
      { kind: 'paragraph', text: 'Bleibt.' },
    ]
    expect(withoutMainPoints(blocks)).toEqual(blocks)
  })
})
