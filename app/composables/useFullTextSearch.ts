/**
 * The second half of the search on `/entwuerfe`: the full text
 * (docs/architecture.md §12.31).
 *
 * ONE FIELD, TWO ANSWERS — since 21.09.2026, and the second one prevents the
 * false inference the field alone produces. The field searches title,
 * citation, debate name and the Ressort's short code (the Ressort NAME no
 * longer, since 21.09.2026: it carried the whole portfolio and matched
 * invisibly — `server/utils/search/searchHaystack.ts`). A title does not say
 * what a Sammelgesetz all amends: type „Klimaschutz", get two rows, conclude
 * „that is all there is" — and never see the third, open draft that carries
 * the word in its § 6. A false negative the reader cannot notice.
 *
 * WHAT DOES NOT MERGE is the rule and the set:
 *
 *  - **A different rule.** The list searches substrings over metadata, RIS
 *    whole words with AND and `*` over the documents. Same input, two rules —
 *    so two named answers, never one pooled list.
 *  - **A different set.** The list carries a whole Gesetzgebungsperiode, open
 *    and closed; the full text knows only what is open TODAY (7 to 25
 *    records). Hence below the list, and „außerdem" rather than „auch".
 *  - **A different price.** The list filter costs nothing and answers at
 *    once; the full text costs one RIS call (0,2–2,1 s) plus the documents
 *    for the Fundstelle. So its own, longer debounce, a minimum length,
 *    client-side and lazy — it never holds the list up.
 *
 * `/suche` was the second address for this question until 22.09.2026 and now
 * 301s onto the list — the argument that made two lists one on 17.09.2026
 * (§12.19).
 */
import type { Ref } from 'vue'
import type { BegutSearchHit, BegutSearchResponse } from '#shared/types'
import type { EntryView } from '~/utils/entryView'
import { viewOfDraft, viewOfRis } from '~/utils/entryView'
import type { DraftFilters } from '~/composables/useDraftFilters'

const FULLTEXT_MIN_LEN = 3
const FULLTEXT_DEBOUNCE_MS = 700

export async function useFullTextSearch(
  filters: DraftFilters,
  /** Newest period first — the first is the running one. */
  availableGps: Ref<string[]>,
  /** The rows the list itself already shows, so a draft hit twice stands once. */
  entries: Ref<EntryView[]>,
) {
  const { statusFilter, art, gp, ministry, q, qDebounced, stations } = filters

  /** The running period is the newest one the filters know. */
  const currentGp = computed(() => availableGps.value[0] ?? '')

  /**
   * Can the full text say anything at all under these filters?
   *
   * It knows only the running Begutachtungen. Under „Abgeschlossen", in an
   * older period and under a station AFTER the Begutachtung there is nothing
   * for it to search — and a block of running Verfahren there would
   * contradict the filter the reader set. Instead a line above the list says
   * that only the titles were searched here.
   *
   * Art and Ressort are NOT part of this condition: they exclude no search,
   * they cut the hits (`fullTextHits`).
   */
  const fullTextApplies = computed(() => {
    if (statusFilter.value === 'closed') return false
    if (gp.value && currentGp.value && gp.value !== currentGp.value) return false
    if (stations.value.length && !stations.value.includes('begutachtung')) return false
    return true
  })

  /**
   * The term that goes to RIS — with a debounce of its own.
   *
   * 700 ms instead of the list's 300, and only from three characters up:
   * every value here is a call to RIS plus up to twelve document sets fetched
   * after it. The list meanwhile keeps filtering on every keystroke.
   */
  const fullTextTerm = ref('')
  let fullTextTimer: ReturnType<typeof setTimeout> | undefined

  function scheduleFullText(delay = FULLTEXT_DEBOUNCE_MS): void {
    clearTimeout(fullTextTimer)
    const term = q.value.trim()
    if (!fullTextApplies.value || term.length < FULLTEXT_MIN_LEN) {
      fullTextTerm.value = ''
      return
    }
    if (term === fullTextTerm.value) return
    fullTextTimer = setTimeout(() => {
      fullTextTerm.value = term
    }, delay)
  }

  watch([q, fullTextApplies], () => scheduleFullText())
  /* A shared link brings the term along in the URL — there is no typing
   * pause to wait for there. */
  onMounted(() => scheduleFullText(0))
  onUnmounted(() => clearTimeout(fullTextTimer))

  /**
   * Client-side, lazy and triggered by hand.
   *
   * `watch: false` plus `execute()`: otherwise every cleared field would send
   * an empty search to RIS. `execute()` aborts the running request, so
   * whoever keeps typing never waits for the previous answer.
   */
  const {
    data: fullText,
    status: fullTextStatus,
    error: fullTextError,
    execute: runFullText,
    clear: clearFullText,
  } = await useFetch<BegutSearchResponse>('/api/suche', {
    query: { q: fullTextTerm },
    server: false,
    lazy: true,
    immediate: false,
    watch: false,
  })

  watch(fullTextTerm, (term) => {
    if (term) runFullText()
    else clearFullText()
  })

  /** Whether a full-text answer stands below the list at all. */
  const fullTextActive = computed(
    () => fullTextApplies.value && qDebounced.value.length >= FULLTEXT_MIN_LEN,
  )
  /**
   * 400 ms lie between the list's debounce and this one, and in them the
   * previous answer still stands. It belongs to a different word, so here it
   * is „wird gesucht", not „gefunden".
   */
  const fullTextPending = computed(
    () =>
      fullTextActive.value &&
      (fullTextTerm.value !== qDebounced.value || fullTextStatus.value === 'pending'),
  )

  /** The hits that survive the active filters — Art and Ressort. */
  const fullTextHits = computed<BegutSearchHit[]>(() =>
    (fullText.value?.hits ?? []).filter((hit) => {
      if (art.value === 'verordnung' && hit.entry.kind === 'draft') return false
      if (art.value === 'ministerialentwurf' && hit.entry.kind === 'ris') return false
      if (ministry.value) {
        const code =
          hit.entry.kind === 'draft' ? hit.entry.draft.ministryCode : hit.entry.consultation.ministryCode
        if ((code ?? '').toUpperCase() !== ministry.value.toUpperCase()) return false
      }
      return true
    }),
  )

  const fullTextViews = computed(() =>
    fullTextHits.value.map((hit) => ({
      hit,
      view: hit.entry.kind === 'draft' ? viewOfDraft(hit.entry.draft) : viewOfRis(hit.entry.consultation),
    })),
  )

  /**
   * A draft hit twice stands ONCE.
   *
   * Showing the title hit and the full-text hit as two rows turns information
   * into a suspicion of duplicates. So: what the list already carries gets the
   * evidence on its own row — that is where it adds something („das Wort steht
   * in § 6") — and only the rest becomes a list of its own below. The key
   * comes from the same adapter as the row (`entryView`), so the two halves
   * cannot drift apart.
   */
  const listedKeys = computed(() => new Set(entries.value.map((e) => e.key)))
  /** One key, one piece of evidence — the same map for both lists. */
  const hitByKey = computed(() => new Map(fullTextViews.value.map((v) => [v.view.key, v.hit])))
  const fullTextExtra = computed(() => fullTextViews.value.filter((v) => !listedKeys.value.has(v.view.key)))
  /** The second list's rows — as a computed, not a `.map()` in the prop: an
   *  array the template builds is a new one on every render. */
  const fullTextExtraEntries = computed(() => fullTextExtra.value.map((v) => v.view))
  const fullTextInList = computed(() => fullTextViews.value.length - fullTextExtra.value.length)
  /**
   * WHAT THE FILTERS TOOK AWAY, and why that is a number of its own.
   *
   * Seen while driving the page on 21.09.2026: under „Verordnungsentwürfe"
   * this block said „‚Klimaschutz' kommt in den Dokumenten der 9 laufenden
   * Begutachtungen nicht vor" — and the word occurred in three of them, which
   * the Art filter had removed. A statement about the corpus where the reader
   * had only seen his own filter: exactly the kind of sentence this product
   * must never invent (docs/architecture.md §12.13). So both are counted
   * separately and said separately, with the way back.
   */
  const fullTextFilteredOut = computed(
    () => (fullText.value?.hits.length ?? 0) - fullTextHits.value.length,
  )

  /**
   * How many Begutachtungen were searched, in the genitive. „Kommt in DIE 7
   * Begutachtungen nicht vor" stood here once, until the rendered page showed
   * it: a tool that talks about Gesetzestexte must not decline its own
   * sentence wrongly.
   */
  const fullTextCorpus = computed(() => {
    const n = fullText.value?.corpusSize ?? 0
    return n === 1 ? 'der einen laufenden Begutachtung' : `der ${n} laufenden Begutachtungen`
  })

  return {
    FULLTEXT_MIN_LEN,
    fullText,
    fullTextApplies,
    fullTextActive,
    fullTextPending,
    fullTextError,
    fullTextHits,
    hitByKey,
    fullTextExtra,
    fullTextExtraEntries,
    fullTextInList,
    fullTextFilteredOut,
    fullTextCorpus,
  }
}
