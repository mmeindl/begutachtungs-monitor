/**
 * What the Regierungsvorlage made of a Land's draft, for its station frame
 * (23.10.2026) — the Bund's `useVorlageOutcome`, for the Länder.
 *
 * Until then the comparison under the frame opened with two sentences: how
 * many changes after the Begutachtung, how many unchanged, and how many of
 * the Land's Begründungen it had changed. The Ministerialentwurf's page
 * moved the same two into the Vorlage's frame on 02.10.2026, as rows, and its
 * comparison opens with its list; a Land's page now does the same, with the
 * same words (`changeShareValueDe`, `reasoningShareValueDe`). Not the
 * period's range under the row: that one is measured on the Bund's drafts.
 *
 * ONE REQUEST EACH: the comparison (`LandLawDiffSection`) reads the same two
 * responses under the same keys (`landDiffKey`, `landReasoningKey`), with
 * `dedupe: 'defer'` as the Bund's — Nuxt's default `cancel` aborts the first
 * caller's request and sends it again.
 *
 * @param enabled Whether the draft has both texts (`LandDraftDetail.comparisons`).
 */
import type { Ref } from 'vue'
import type { LandCode, LandLawDiffResponse, LandReasoningResponse } from '#shared/types'
import { changeShareNounDe, ownChangeShare } from '#shared/utils/changeShare'
import { landDiffKey, landReasoningKey } from '#shared/utils/laender'
import { changeShareValueDe, reasoningShareValueDe } from '~/utils/outcomes'
import { substantiveReasoningChanges } from '~/utils/reasoningNotes'

export function useLandVorlageOutcome(source: () => { land: LandCode; number: string }, enabled: Ref<boolean>) {
  const { data: diff, status: diffStatus } = useFetch<LandLawDiffResponse>(
    () => `/api/laender/${source().land}/${source().number}/vergleich`,
    {
      query: { von: 'entwurf', bis: 'rv' },
      key: () => landDiffKey(source().land, source().number, 'entwurf', 'rv'),
      lazy: true,
      server: false,
      dedupe: 'defer',
      enabled,
      watch: [enabled],
    },
  )
  const { data: reasoning } = useFetch<LandReasoningResponse>(
    () => `/api/laender/${source().land}/${source().number}/begruendung`,
    {
      key: () => landReasoningKey(source().land, source().number),
      lazy: true,
      server: false,
      dedupe: 'defer',
      enabled,
      watch: [enabled],
    },
  )

  /** Null once the comparison is there and has nothing to count. */
  const share = computed(() => {
    const d = diff.value
    if (!d?.available) return null
    const s = ownChangeShare(d.stats)
    return s ? { ...s, noun: changeShareNounDe(d.units) } : null
  })
  /** Still on its way — the frame holds the row's place meanwhile. */
  const sharePending = computed(() => enabled.value && !diff.value && diffStatus.value !== 'error')

  /** The two counts as the frame's rows print them; null while absent. */
  const shareDe = computed(() => {
    const s = share.value
    return s ? changeShareValueDe(s.changed, s.own, s.noun) : null
  })
  const reasoningDe = computed(() => {
    const r = reasoning.value
    if (!r) return null
    const stats = r.available ? r.stats : null
    if (stats?.compared) return reasoningShareValueDe(substantiveReasoningChanges(stats), stats.compared)
    // Not compared is said, never left out (24.10.2026): a missing row read as „the reasons did not change".
    return `nicht verglichen – ${(r.unavailableReason ?? 'die Erläuterungen beider Texte decken keinen gemeinsamen Paragraphen ab.').replace(/^\p{Lu}/u, (c) => c.toLowerCase())}`
  })

  return { share, sharePending, shareDe, reasoningDe }
}
