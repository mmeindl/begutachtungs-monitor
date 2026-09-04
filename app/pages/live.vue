<script setup lang="ts">
/**
 * /live — the stable address behind the Demokratiewoche event listing
 * (buendnis2025.at links here as the online venue, 22.10.2026). Until the
 * video room exists this is a holding page with the event facts; once
 * MEETING_URL is set, the same address becomes a 302 into the room — so
 * the event page never needs to be touched again.
 */
const MEETING_URL = '' // Videokonferenz-URL eintragen + deployen → /live leitet weiter

if (MEETING_URL) {
  await navigateTo(MEETING_URL, { external: true, redirectCode: 302 })
}

useSeoMeta({
  title: 'Begutachtungs-Monitor live',
  description:
    'Online-Workshop bei der Demokratiewoche 2026: Donnerstag, 22. Oktober 2026, 19:00–20:30 Uhr. Der Teilnahmelink erscheint hier.',
})

const facts = [
  { label: 'Wann', value: 'Donnerstag, 22. Oktober 2026, 19:00–20:30 Uhr' },
  { label: 'Wo', value: 'Online – der Teilnahmelink erscheint auf dieser Seite' },
  { label: 'Kosten', value: 'Kostenlos, ohne Anmeldung' },
] as const
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <p class="text-sm font-medium uppercase tracking-wide text-ink-secondary">
      Online-Workshop · Demokratiewoche 2026
    </p>
    <h1 class="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
      Begutachtungs-Monitor live
    </h1>
    <p class="mt-3 text-xl text-ink">
      <span class="bg-mark px-1">Was wurde aus den Stellungnahmen?</span>
    </p>

    <dl class="mt-8 rounded-xl border border-hairline bg-surface p-5">
      <div
        v-for="(fact, i) in facts"
        :key="fact.label"
        class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-6"
        :class="i > 0 ? 'border-t border-hairline' : ''"
      >
        <dt class="w-24 shrink-0 text-sm font-medium text-ink-secondary sm:pt-0.5">
          {{ fact.label }}
        </dt>
        <dd class="font-medium text-ink">{{ fact.value }}</dd>
      </div>
    </dl>

    <!-- The promise this page exists for: the printed/linked URL stays,
         the destination changes. Wording must survive being read on
         22.10. at 18:55 by someone who just wants in. -->
    <div class="mt-6 rounded-xl bg-mark-wash p-5">
      <h2 class="font-semibold text-ink">Noch kein Teilnahmelink</h2>
      <p class="mt-2 leading-relaxed text-ink-secondary">
        Der Videokonferenz-Raum wird rechtzeitig vor der Veranstaltung
        eingerichtet. Diese Adresse bleibt gleich:
        <strong class="font-medium text-ink">begutachtungs-monitor.at/live</strong>
        führt dann direkt in den Raum – ohne Konto, ohne Installation.
      </p>
      <p class="mt-2 leading-relaxed text-ink-secondary">
        <a
          href="/live.ics"
          class="rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
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
          class="rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
        >Demokratiewoche 2026 des Bündnis 2025</ExternalLink>
        (19.–26. Oktober).
      </p>
      <p>
        Bis dahin:
        <NuxtLink
          to="/begutachtungen?status=open"
          class="rounded font-medium text-accent-deep underline underline-offset-2 hover:no-underline"
        >die laufenden Begutachtungen ansehen →</NuxtLink>
      </p>
    </div>
  </div>
</template>
