<script setup lang="ts">
/**
 * /live — the stable address behind the Demokratiewoche event listing
 * (buendnis2025.at links here as the online venue, 22.10.2026). Until the
 * video room exists this is a holding page with the event facts; once
 * MEETING_URL is set, the same address becomes a 302 into the room — so
 * the event page never needs to be touched again.
 *
 * Reachable by URL only, on purpose: nothing in the site links here and the
 * sitemap (`server/utils/feeds.ts`) does not list it — the page belongs to
 * one event on one evening, not to the product.
 */
import type { Fact } from '~/components/ui/FactList.vue'

const MEETING_URL = '' // Videokonferenz-URL eintragen + deployen → /live leitet weiter

if (MEETING_URL) {
  await navigateTo(MEETING_URL, { external: true, redirectCode: 302 })
}

usePageSeo({
  title: 'Begutachtungs-Monitor live',
  description:
    'Online-Workshop bei der Demokratiewoche 2026: Donnerstag, 22. Oktober 2026, 19:00–20:30 Uhr. Der Teilnahmelink erscheint hier.',
})

// In FactList's grammar, a name over each fact, as the draft pages' fact
// lists have it (02.10.2026), in the same unfilled frame (03.10.2026). A
// label column stood here, the form FactList records as having read as a
// form.
const facts: Fact[] = [
  // Word joiners around the dash and a no-break space before „Uhr": the range
  // broke as „19:00– / 20:30 Uhr" on a phone (30.09.2026).
  { key: 'wann', title: 'Wann', text: 'Donnerstag, 22. Oktober 2026, 19:00\u2060–\u206020:30\u00a0Uhr' },
  { key: 'wo', title: 'Wo', text: 'Online – der Teilnahmelink erscheint auf dieser Seite' },
  { key: 'kosten', title: 'Kosten', text: 'Kostenlos, ohne Anmeldung' },
]
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <p class="text-sm font-medium uppercase tracking-wide text-ink-secondary">
      Online-Workshop · Demokratiewoche 2026
    </p>
    <h1 class="mt-2 page-title">
      Begutachtungs-Monitor live
    </h1>
    <p class="mt-3 text-xl text-ink">
      <span class="bg-mark px-1">Was wurde aus den Stellungnahmen?</span>
    </p>

    <FactList :facts="facts" class="mt-8" />

    <!-- The promise this page exists for: the printed/linked URL stays,
         the destination changes. Wording must survive being read on
         22.10. at 18:55 by someone who just wants in. -->
    <div class="mt-6 rounded-xl bg-mark-wash p-4">
      <h2 class="card-heading">Noch kein Teilnahmelink</h2>
      <p class="mt-2 leading-relaxed text-ink-secondary">
        Der Videokonferenz-Raum wird rechtzeitig vor der Veranstaltung
        eingerichtet. Diese Adresse bleibt gleich:
        <!-- The domain whole, a break only before „/live": it split at its
             own hyphen, „begutachtungs- / monitor.at/live". No U+2011 — a
             copied address must stay one. -->
        <strong class="font-medium text-ink"><span class="whitespace-nowrap">begutachtungs-monitor.at</span><wbr>/live</strong>
        führt dann direkt in den Raum – ohne Konto, ohne Installation.
      </p>
      <p class="mt-2 leading-relaxed text-ink-secondary">
        <a
          href="/live.ics"
          class="link-inline font-medium"
        >Termin in den Kalender übernehmen</a>
      </p>
    </div>

    <div class="mt-10 space-y-4 leading-relaxed text-ink-secondary">
      <p>
        Jedes Jahr gehen dutzende Gesetzesentwürfe in öffentliche Begutachtung
        – aber was wird aus den Stellungnahmen? Im Workshop schauen wir
        gemeinsam in laufende Begutachtungen und verfolgen an konkreten
        Gesetzen nach, ob und wo sich Entwürfe danach verändert haben:
        Übernommenes wie Liegengebliebenes. Keine Vorkenntnisse nötig, Fragen
        und Kritik ausdrücklich erwünscht.
      </p>
      <p>
        Die Veranstaltung ist Teil der
        <ExternalLink
          href="https://buendnis2025.at/veranstaltungen/begutachtungs-monitor-live/"
          class="link-inline font-medium"
        >Demokratiewoche 2026 des Bündnis 2025</ExternalLink>
        (19.–26. Oktober).
      </p>
      <p>
        Bis dahin:
        <NuxtLink
          to="/entwuerfe?status=open&station=begutachtung"
          class="link-inline font-medium"
        >die laufenden Begutachtungen ansehen →</NuxtLink>
      </p>
    </div>
  </div>
</template>
