import { describe, expect, it } from 'vitest'
import { LIST_STATE_DE, listBoxStatusOf } from '../app/utils/listState'
import { splitGap } from '../shared/utils/gaps'

/* A list shows its frame while loading (16.11.2026): what its box says in
 * the rows' place, from the fetch's status (`ListBoxState`). */
describe('the rows\' place while a list loads (listBoxStatusOf)', () => {
  const LOADING = 'Offene Fristen werden geladen …'

  it('loads while pending or idle without data, as `FetchGate` did', () => {
    expect(listBoxStatusOf({ status: 'idle', error: null, hasData: false }, LOADING)).toEqual({ loading: LOADING })
    expect(listBoxStatusOf({ status: 'pending', error: null, hasData: false }, LOADING)).toEqual({ loading: LOADING })
  })

  it('keeps the rows on a refresh: with data there is nothing to say', () => {
    expect(listBoxStatusOf({ status: 'pending', error: null, hasData: true }, LOADING)).toBeNull()
    expect(listBoxStatusOf({ status: 'error', error: new Error('x'), hasData: true }, LOADING)).toBeNull()
  })

  it('says a failed request in the lead word of the gap sentences, or in the list\'s own words', () => {
    const bare = listBoxStatusOf({ status: 'error', error: new Error('x'), hasData: false }, LOADING)
    expect(bare).toEqual({ failed: { text: LIST_STATE_DE.failed } })
    expect(splitGap(`${LIST_STATE_DE.failed}: x`)?.lead).toBe('Gerade nicht abrufbar')
    const own = { text: 'Anliegen: gerade nicht abrufbar', description: 'Die Quelle hat nicht geantwortet.' }
    expect(listBoxStatusOf({ status: 'error', error: {}, hasData: false }, LOADING, own)).toEqual({ failed: own })
  })

  it('has nothing to say for an answer without rows: that is the list\'s own empty state', () => {
    expect(listBoxStatusOf({ status: 'success', error: null, hasData: false }, LOADING)).toBeNull()
  })
})

describe('every list box loads through the one piece', () => {
  it('holds no centred spinner or grey bars in the lists that load', async () => {
    const { readFileSync } = await import('node:fs')
    for (const file of [
      'app/components/eu/EuFensterList.vue',
      'app/components/eu/EuEciList.vue',
      'app/components/eu/EuUmsetzungList.vue',
      'app/components/eu/EuFeedbackBlock.vue',
      'app/components/statements/StatementsPanel.vue',
      'app/pages/index.vue',
      'app/pages/anliegen/index.vue',
      'app/pages/eu-recht/index.vue',
    ]) {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      expect(src, file).not.toMatch(/<FetchGate|<LoadingState|<ListSkeleton/)
      expect(src, file).toMatch(/<ListBoxState|:state="/)
    }
  })
})
