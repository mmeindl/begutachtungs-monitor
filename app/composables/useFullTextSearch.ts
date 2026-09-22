/**
 * Die zweite Hälfte der Suche auf `/entwuerfe`: der Volltext (§12.31).
 *
 * EIN FELD, ZWEI ANTWORTEN — seit 21.09.2026, und die zweite verhindert den
 * Fehlschluss, den das Feld allein erzeugt.
 *
 * Das Feld durchsucht Titel, Zitat, Debattennamen und das Ressortkürzel
 * (den Ressort-NAMEN seit 21.09.2026 nicht mehr — er trug das ganze
 * Portfolio und traf unsichtbar, siehe `server/utils/search/searchHaystack.ts`).
 * Ein Titel sagt aber nicht, was ein Sammelgesetz alles ändert: Wer
 * „Klimaschutz" eingibt und zwei Zeilen bekommt, schließt „mehr ist es
 * nicht" — und sieht nicht, dass ein dritter, offener Entwurf das Wort in
 * seinem § 6 führt. Ein falsches Negativ, das der Leser nicht bemerken kann.
 *
 * Bis dahin hing dafür ein Link auf `/suche` an dieser Seite, und das war
 * dieselbe Sache zweimal an zwei Orten — genau das Argument, mit dem am
 * 17.09. die zwei Listen eine wurden (§12.19). Erst ging der Link, am
 * 22.09. die Seite: Eine zweite Adresse für dieselbe Frage ist das, was
 * dort abgeschafft wurde, also durfte sie auch nicht unverlinkt
 * weiterlaufen. `/suche` 301t seither auf die Liste.
 *
 * WAS NICHT VERSCHMILZT, ist die Regel und die Menge:
 *
 *  - **Andere Regel.** Die Liste sucht als Teilstring über Metadaten, das
 *    RIS ganze Wörter mit UND und `*` über die Dokumente. „Klimaschutz"
 *    trifft den TITEL „Klimaschutzgesetz" und denselben Wortstamm im TEXT
 *    nur mit Stern. Dieselbe Eingabe, zwei Regeln — also zwei benannte
 *    Antworten, nie eine gepoolte Liste.
 *  - **Andere Menge.** Die Liste führt eine ganze Gesetzgebungsperiode,
 *    offen wie abgeschlossen; der Volltext kennt nur, was HEUTE offen ist
 *    (7 bis 25 Sätze). Deshalb steht er unter der Liste und heißt
 *    „außerdem", nicht „auch".
 *  - **Anderer Preis.** Der Listenfilter kostet nichts und antwortet
 *    sofort; der Volltext kostet einen RIS-Aufruf (0,2–2,1 s) plus die
 *    Dokumente für die Fundstelle. Also eigene, längere Verzögerung, eine
 *    Mindestlänge, clientseitig und lazy — er hält die Liste nie auf.
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

  /** Die laufende Periode ist die neueste, die die Filter kennen. */
  const currentGp = computed(() => availableGps.value[0] ?? '')

  /**
   * Kann der Volltext unter diesen Filtern überhaupt etwas sagen?
   *
   * Er kennt nur die laufenden Begutachtungen. Unter „Abgeschlossen", in
   * einer alten Periode und unter einer Station NACH der Begutachtung gibt es
   * nichts, wonach er suchen könnte — und ein Block laufender Verfahren würde
   * dort dem Filter widersprechen, den der Leser gesetzt hat. Statt dessen
   * sagt eine Zeile über der Liste, dass hier nur die Titel durchsucht sind.
   *
   * Art und Ressort stehen NICHT in dieser Bedingung: Sie schließen keine
   * Suche aus, sie schneiden die Treffer (`fullTextHits`).
   */
  const fullTextApplies = computed(() => {
    if (statusFilter.value === 'closed') return false
    if (gp.value && currentGp.value && gp.value !== currentGp.value) return false
    if (stations.value.length && !stations.value.includes('begutachtung')) return false
    return true
  })

  /**
   * Der Begriff, der ans RIS geht — mit eigener Verzögerung.
   *
   * 700 ms statt der 300 der Liste, und erst ab drei Zeichen: Jeder Wert hier
   * ist ein Aufruf ans RIS samt bis zu zwölf nachgeladenen Dokumentsätzen.
   * Die Liste filtert unterdessen weiter bei jedem Tastendruck.
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
  /* Ein geteilter Link bringt den Begriff in der URL mit — der hat keine
   * Tipppause, auf die man warten müsste. */
  onMounted(() => scheduleFullText(0))
  onUnmounted(() => clearTimeout(fullTextTimer))

  /**
   * Clientseitig, lazy und von Hand ausgelöst.
   *
   * `watch: false` plus `execute()`: sonst liefe bei jedem geleerten Feld eine
   * leere Suche ans RIS. `execute()` bricht die laufende Anfrage ab, wer also
   * weitertippt, wartet nie auf die vorige Antwort.
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

  /** Ob unter der Liste überhaupt eine Volltext-Antwort steht. */
  const fullTextActive = computed(
    () => fullTextApplies.value && qDebounced.value.length >= FULLTEXT_MIN_LEN,
  )
  /**
   * Zwischen der Listen-Verzögerung und der eigenen liegen 400 ms, in denen
   * die Antwort von vorhin noch dasteht. Sie gehört zu einem anderen Wort,
   * also ist sie hier „wird gesucht", nicht „gefunden".
   */
  const fullTextPending = computed(
    () =>
      fullTextActive.value &&
      (fullTextTerm.value !== qDebounced.value || fullTextStatus.value === 'pending'),
  )

  /** Die Treffer, die die aktiven Filter überstehen — Art und Ressort. */
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
   * Ein Entwurf, zweimal getroffen, steht EINMAL da.
   *
   * Wer den Titeltreffer und den Volltexttreffer als zwei Zeilen zeigt, hat
   * aus einer Auskunft einen Dublettenverdacht gemacht. Also: Was die Liste
   * schon führt, bekommt den Beleg an seiner Zeile — dort ist er der Zugewinn
   * („das Wort steht in § 6") —, und nur der Rest wird zur eigenen Liste
   * darunter. Der Schlüssel kommt aus demselben Adapter wie die Zeile
   * (`entryView`), damit die beiden Hälften nie auseinanderlaufen.
   */
  const listedKeys = computed(() => new Set(entries.value.map((e) => e.key)))
  /** Ein Schlüssel, ein Beleg — für beide Listen dieselbe Karte. */
  const hitByKey = computed(() => new Map(fullTextViews.value.map((v) => [v.view.key, v.hit])))
  const fullTextExtra = computed(() => fullTextViews.value.filter((v) => !listedKeys.value.has(v.view.key)))
  /** Die Zeilen der zweiten Liste — als Computed, nicht als `.map()` im Prop:
   *  Ein Array, das die Vorlage baut, ist bei jedem Rendern ein neues. */
  const fullTextExtraEntries = computed(() => fullTextExtra.value.map((v) => v.view))
  const fullTextInList = computed(() => fullTextViews.value.length - fullTextExtra.value.length)
  /**
   * WAS DIE FILTER WEGGENOMMEN HABEN, und warum das eine eigene Zahl ist.
   *
   * Gemessen beim Fahren der Seite am 21.09.2026: Unter „Verordnungsentwürfe"
   * sagte dieser Block „‚Klimaschutz' kommt in den Dokumenten der 9 laufenden
   * Begutachtungen nicht vor" — und das Wort kam in dreien vor, der Art-Filter
   * hatte sie entfernt. Eine Aussage über den Korpus, wo der Leser nur seinen
   * eigenen Filter gesehen hat: genau die Sorte Satz, die dieses Produkt nie
   * erfinden darf (§12.13). Also wird beides getrennt gezählt und getrennt
   * gesagt — samt dem Weg zurück.
   */
  const fullTextFilteredOut = computed(
    () => (fullText.value?.hits.length ?? 0) - fullTextHits.value.length,
  )

  /**
   * Wie viele Begutachtungen durchsucht wurden, im Genitiv. „Kommt in DIE 7
   * Begutachtungen nicht vor" stand einmal da, bis die gerenderte Seite es
   * zeigte: Ein Werkzeug, das über Gesetzestexte spricht, darf seinen eigenen
   * Satz nicht falsch beugen.
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
