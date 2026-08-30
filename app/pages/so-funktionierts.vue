<script setup lang="ts">
/**
 * The Verfahrens explainer: static, zero data, zero ops — makes every
 * StageBar and TraceTimeline in the product retroactively legible for the
 * audience that lands from a shared link and has never heard the word
 * "Regierungsvorlage". Anchor IDs let detail pages deep-link each term.
 */
useSeoMeta({
  title: "So funktioniert's",
  description:
    'Wie ein Gesetz in Österreich entsteht: vom Ministerialentwurf über die Begutachtung und die Regierungsvorlage bis zur Kundmachung im Bundesgesetzblatt.',
})

const steps = [
  {
    id: 'ministerialentwurf',
    name: 'Ministerialentwurf',
    text: 'Ein Ministerium legt den Entwurf eines Gesetzes vor. Ab jetzt ist er öffentlich einsehbar – lange bevor das Parlament darüber abstimmt.',
  },
  {
    id: 'begutachtung',
    name: 'Begutachtung',
    text: 'Mehrere Wochen lang kann jede und jeder eine Stellungnahme abgeben – Privatpersonen genauso wie Kammern, Vereine und Unternehmen. Die Frist dafür setzt das Ministerium; abgegeben wird die Stellungnahme direkt auf parlament.gv.at.',
    link: { to: '/begutachtungen?status=open', label: 'Alle offenen Begutachtungen →' },
  },
  {
    id: 'regierungsvorlage',
    name: 'Regierungsvorlage',
    text: 'Das Ministerium überarbeitet den Entwurf, oft auf Basis der Stellungnahmen; die Regierung beschließt die Vorlage an den Nationalrat. Manche Entwürfe kommen nie so weit – auch das zeigt der Monitor.',
  },
  {
    id: 'parlament',
    name: 'Parlament',
    text: 'Nationalrat und Bundesrat beraten die Vorlage; im Ausschuss und im Plenum kann sich der Text weiter ändern.',
  },
  {
    id: 'bundesgesetzblatt',
    name: 'Bundesgesetzblatt',
    text: 'Mit der Kundmachung im Bundesgesetzblatt wird das Gesetz verbindlich.',
  },
] as const
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
      So funktioniert die Begutachtung
    </h1>
    <p class="mt-3 leading-relaxed text-ink-secondary">
      Bevor ein Gesetzesentwurf ins Parlament kommt, durchläuft er fünf
      Stationen. Der Monitor verfolgt jeden Entwurf über alle fünf – und
      zeigt, was aus dem Input der Öffentlichkeit wird.
    </p>

    <!-- Numbers + text carry the sequence; the connector line and the
         marker tiles are decorative (meaning never on color/shape alone). -->
    <ol class="mt-10">
      <li
        v-for="(step, i) in steps"
        :id="step.id"
        :key="step.id"
        class="relative scroll-mt-6 pb-10 pl-14 last:pb-0"
      >
        <span
          v-if="i < steps.length - 1"
          aria-hidden="true"
          class="absolute bottom-0 left-4.5 top-10 w-0.5 bg-hairline"
        />
        <span
          aria-hidden="true"
          class="absolute left-0 top-0 inline-flex size-9 items-center justify-center rounded-md bg-mark font-heading text-lg font-semibold text-ink"
        >
          {{ i + 1 }}
        </span>
        <h2 class="pt-1 text-lg font-semibold text-ink">
          <span class="sr-only">Schritt {{ i + 1 }}: </span>{{ step.name }}
        </h2>
        <p class="mt-2 leading-relaxed text-ink-secondary">{{ step.text }}</p>
        <p v-if="'link' in step && step.link" class="mt-2">
          <NuxtLink
            :to="step.link.to"
            class="tap-target rounded text-sm font-medium text-accent-deep hover:underline"
          >
            {{ step.link.label }}
          </NuxtLink>
        </p>
      </li>
    </ol>

    <p class="mt-16 leading-relaxed text-ink-secondary">
      Der Monitor zeigt Verfahren mit weiterem Verlauf genauso wie Verfahren
      ohne – Nachverfolgung, nicht Bewertung.
      <NuxtLink
        to="/ueber"
        class="rounded text-accent-deep underline underline-offset-2 hover:no-underline"
      >Mehr über das Projekt</NuxtLink>
    </p>
  </div>
</template>
