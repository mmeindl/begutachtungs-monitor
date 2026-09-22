import { describe, expect, it } from 'vitest'
import { punctuationTokens } from '../server/utils/text/punctuationTokens'

describe('punctuationTokens', () => {
  it('strips the punctuation a diff glues to a word', () => {
    expect(punctuationTokens('Wort, und „Wort" (Wort);')).toEqual(['Wort', 'und', 'Wort', 'Wort'])
  })

  it('keeps a number and its comma-free twin the same word', () => {
    expect(punctuationTokens('§ 36, Abs. 2')).toEqual(['§', '36', 'Abs', '2'])
  })

  it('strips brackets on both edges and drops what is left empty', () => {
    expect(punctuationTokens('[Text] . ]')).toEqual(['Text'])
    expect(punctuationTokens('   ')).toEqual([])
  })

  it('leaves the case and the hyphens alone — that is another module', () => {
    expect(punctuationTokens('Bundes-Verfassungsgesetz')).toEqual(['Bundes-Verfassungsgesetz'])
    expect(punctuationTokens('WORT wort')).toEqual(['WORT', 'wort'])
  })
})
