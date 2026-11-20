import { describe, expect, it } from 'vitest'
import { explainedParagraphs } from '../server/utils/laender/landExplanationsRead'
import { segmentUnits, type TextBlock } from '../server/utils/lawtext/lawUnits'

const blk = (kind: TextBlock['kind'], text: string): TextBlock => ({ kind, cls: '', text, gld: null })

// A „Zu Z 1:" entry names only the draft's Ziffer; the § is read off the
// draft's instruction 1. With „1a." read as „1", the short real Z 1 was
// dropped and „Zu Z 1" was filed under the § of 1a (19.11.2026).
describe('explainedParagraphs: a Ziffer is looked up under its own number', () => {
  const units = segmentUnits([
    blk('other', 'Das Salzburger Testgesetz, LGBl Nr 1/2000, wird geändert wie folgt:'),
    blk('novao', '1. Im § 3 Abs 2 wird das Wort „alt“ durch das Wort „neu“ ersetzt.'),
    blk('novao', '1a. Im § 4 Abs 1 entfällt der zweite Satz.'),
  ])
  const parse = { general: [], labelled: false, particular: [{ article: null, paras: [], heading: 'Zu Z 1:', text: ['Die Änderung ist redaktionell.'] }] }

  it('„Zu Z 1" is the § instruction 1 changes, not the one of 1a', () => {
    expect(explainedParagraphs(parse, units, 'Gesetz, mit dem das Salzburger Testgesetz geändert wird')[0]!.paras).toEqual(['3'])
  })
})
