/**
 * What the Regierungsvorlage made of a Land's draft, for its station frame
 * (23.10.2026) — the Bund's `useVorlageOutcome`, for the Länder.
 *
 * Until then the comparison under the frame opened with two sentences: how
 * many changes after the Begutachtung, how many unchanged, and how many of
 * the Land's Begründungen it had changed. The Ministerialentwurf's page
 * moved the same two into the Vorlage's frame on 02.10.2026, as rows, and its
 * comparison opens with its list; a Land's page now does the same, with the
 * same words (`reasoningShareValueDe`). The change share's row went on
 * 17.11.2026, on both pages: the comparison's legend counts the changes per
 * kind, so this reads the Begründungen only.
 *
 * ONE REQUEST: the comparison (`LandLawDiffSection`) reads the same
 * response under the same key (`landReasoningKey`), with `dedupe: 'defer'`
 * as the Bund's — Nuxt's default `cancel` aborts the first caller's request
 * and sends it again.
 *
 * @param enabled Whether the draft has both texts (`LandDraftDetail.comparisons`).
 */
import { splitGap } from '#shared/utils/gaps'
import type { Ref } from 'vue'
import type { LandCode, LandReasoningResponse } from '#shared/types'
import { landReasoningKey } from '#shared/utils/laender'
import { reasoningShareValueDe } from '~/utils/outcomes'
import { substantiveReasoningChanges } from '~/utils/reasoningNotes'

export function useLandVorlageOutcome(source: () => { land: LandCode; number: string }, enabled: Ref<boolean>) {
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

  /** The count as the frame's row prints it; null while absent. */
  const reasoningDe = computed(() => {
    const r = reasoning.value
    if (!r) return null
    const stats = r.available ? r.stats : null
    if (stats?.compared) return reasoningShareValueDe(substantiveReasoningChanges(stats), stats.compared)
    // Not compared is said, never left out (24.10.2026): a missing row read as „the reasons did not change".
    // A gap sentence stands whole: its lead word already says why (`shared/utils/gaps.ts`).
    if (splitGap(r.unavailableReason)) return r.unavailableReason
    return `nicht verglichen – ${(r.unavailableReason ?? 'die Erläuterungen beider Texte decken keinen gemeinsamen Paragraphen ab.').replace(/^\p{Lu}/u, (c) => c.toLowerCase())}`
  })

  return { reasoningDe }
}
