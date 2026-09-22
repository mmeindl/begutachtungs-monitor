/**
 * Die Erläuterungen eines Entwurfs: einmal geholt, von zwei Abschnitten
 * gelesen — und serverseitig nur so lange, wie es schnell geht
 * (docs/architecture.md §12.29).
 *
 * ZWEI LESER, EIN ABRUF. Der Allgemeine Teil steht oben unter „Was das
 * Ressort begründet", die Passagen des Besonderen Teils hängen unten an den
 * §§ der Gegenüberstellung (§12.30). Beides kommt aus demselben Dokument.
 * Dass es trotzdem eine Anfrage bleibt, hing bisher daran, dass `useFetch`
 * nach URL schlüsselt — eine Eigenschaft der Bibliothek, die keiner der
 * beiden Abschnitte aussprach und die jede Änderung an den Optionen des
 * einen still im anderen bezahlt hätte. Jetzt steht der Schlüssel hier.
 *
 * SERVERSEITIG, MIT FRIST. Der Abschnitt trägt die Substanz der Seite und ist
 * CC BY — er gehört ins ausgelieferte HTML, nicht erst in den zweiten
 * Rendergang. Dagegen stand der Grund, aus dem er am 18.09.2026 zunächst rein
 * client-seitig geladen wurde: Ein RIS-Abruf im SSR-Pfad macht die Detailseite
 * von einer fremden Antwortzeit abhängig, und `getText` (`risKons.ts`) wartet
 * 20 s und versucht es dreimal — eine kranke Gegenstelle könnte eine
 * Seitenauslieferung damit knapp eine Minute lang aufhalten.
 *
 * Beides zusammen geht, weil die Frist kurz sein darf: Gemessen am 19.09.2026
 * über zehn Entwürfe der GP XXVIII brauchte der Endpunkt kalt 40–178 ms
 * (Dokument noch nicht im Cache, RIS-Abruf plus Parser), warm Millisekunden;
 * die Detailseite selbst rendert kalt rund 800 ms. Die Frist unten ist das
 * Vier- bis Fünffache des langsamsten gemessenen Kaltfalls und bleibt damit
 * unter dem, was die Seite ohnehin braucht.
 *
 * DER ABBRUCH GILT DEM RENDERN, NICHT DEM ABRUF. `Promise.race` lässt die
 * angefangene Anfrage weiterlaufen: Sie füllt den Cache, und der Nachschlag
 * des Clients trifft ihn Sekundenbruchteile später warm an. Ein `timeout` von
 * `useAsyncData` hätte stattdessen abgebrochen — dieselbe Arbeit zweimal, und
 * ein Fehlerzustand, der „das RIS ist weg" und „wir haben nicht gewartet"
 * nicht mehr auseinanderhält.
 *
 * `null` heißt deshalb genau eine Sache: Der Server hat die Frist gerissen.
 * Der Client holt es nach dem ersten Bild nach, und bis dahin zeigt der
 * Abschnitt seinen Ladezustand — nicht seinen Fehlerzustand, denn nichts ist
 * schiefgegangen.
 */
import type { ExplanationsResponse } from '#shared/types'

/** Siehe oben: gemessener Kaltfall 40–178 ms, Kaltrender der Seite ~800 ms. */
const SSR_DEADLINE_MS = 800

/**
 * @param source Die Adresse des Entwurfs, als Getter — die beiden Seiten
 * erreichen dasselbe Dokument auf verschiedenen Wegen (Ministerialentwurf
 * über den RIS↔ME-Join, Begutachtung ohne Gegenstand über ihre RIS-ID), und
 * bei einer Navigation von Entwurf zu Entwurf wechselt sie unter der
 * Komponente. Der Schlüssel folgt ihr.
 */
export function useExplanations(source: () => { gp?: string; inr?: number; risId?: string }) {
  const endpoint = computed(() => {
    const { gp, inr, risId } = source()
    return risId ? `/api/ris-drafts/${risId}/erlaeuterungen` : `/api/drafts/${gp}/${inr}/erlaeuterungen`
  })

  const { data, status, refresh } = useAsyncData<ExplanationsResponse | null>(
    () => `erlaeuterungen:${endpoint.value}`,
    () => {
      const read = $fetch<ExplanationsResponse>(endpoint.value)
      if (!import.meta.server) return read
      return Promise.race([read, new Promise<null>((resolve) => { setTimeout(() => resolve(null), SSR_DEADLINE_MS) })])
    },
    // `lazy`, damit eine Navigation im Browser nicht auf das RIS wartet: Auf
    // dem Server wird trotzdem gewartet (Nuxt hängt den Abruf an
    // `onServerPrefetch`), und genau dort greift die Frist oben.
    //
    // `dedupe: 'defer'`, weil der gemeinsame Schlüssel allein die zweite
    // Anfrage NICHT verhindert: Nuxts Voreinstellung ist `cancel`, und der
    // zweite Abschnitt, der denselben Schlüssel anmeldet, bricht damit den
    // laufenden Abruf des ersten ab und startet einen eigenen. Gemessen am
    // 19.09.2026 mit einer Sonde im Endpunkt: zwei Aufrufe je Seitenaufbau,
    // schon vor dieser Datei. `defer` gibt dem zweiten den laufenden Abruf.
    { lazy: true, dedupe: 'defer' },
  )

  // NACH der Hydration, nicht in `onMounted`: Während sie läuft, beantwortet
  // Nuxt jeden `refresh` aus der Nutzlast der Seite — und die enthält genau
  // das `null`, das wir gerade ersetzen wollen. Das ist kein Randfall, es war
  // der Normalfall: Der Abschnitt blieb mit „wird geladen" stehen, bis jemand
  // die Seite neu lud (gemessen am 19.09.2026 mit `--dump-dom`, bevor diese
  // Zeile so hieß). `onNuxtReady` läuft, wenn die Hydration durch ist.
  //
  // Beide Abschnitte rufen das hier auf; der zweite findet den Nachschlag
  // bereits als `pending` vor und löst keinen zweiten aus.
  onNuxtReady(() => {
    if (status.value === 'success' && data.value === null) refresh()
  })

  return { data, status }
}
