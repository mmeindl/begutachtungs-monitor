<script setup lang="ts">
import type { ConsultationDetail } from '#shared/types'
import { GP_RE, INR_RE } from '#shared/utils/gp'

definePageMeta({
  validate: (route) =>
    GP_RE.test(String(route.params.gp ?? '')) && INR_RE.test(String(route.params.inr ?? '')),
})

const route = useRoute()

const gp = computed(() => String(route.params.gp ?? ''))
const inr = computed(() => Number(route.params.inr ?? 0))
const url = computed(() => `/api/consultations/${gp.value}/${inr.value}`)

const { data, error, refresh, status } = await useFetch<ConsultationDetail>(url)

if (error.value?.statusCode === 404) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Begutachtung nicht gefunden',
    fatal: true,
  })
}

// Array.isArray guards: cached payloads (dev disk cache, future upstream
// drift) can predate the current DescriptionBlock[] shape — degrade to
// "no description" instead of crashing SSR.
const description = computed(() =>
  Array.isArray(data.value?.description) ? data.value.description : [],
)

// "Was wurde daraus?" renders whenever there is process history to show —
// or, for closed consultations, at least the neutral no-RV note.
const showOutcome = computed(() => {
  const d = data.value
  if (!d) return false
  return (
    Boolean(d.enactment) ||
    d.trace.length > 0 ||
    d.textEvolution.length > 0 ||
    !d.active
  )
})

const seoTitle = computed(() => {
  const t = data.value?.title
  return t ? truncate(t, 60) : 'Begutachtung'
})

const seoDescription = computed(() => {
  const d = data.value
  if (!d) return 'Details zu einem Ministerialentwurf im Begutachtungsverfahren.'
  // Headings are structure, not content: a snippet opening with the bare word
  // "Ziel" wastes the ~160 characters a search result actually shows.
  const prose = description.value
    .flatMap((b) => (b.kind === 'heading' ? [] : b.kind === 'list' ? b.items : [b.text]))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (prose) return truncate(prose, 160)
  return `Ministerialentwurf ${d.citation}: Frist, Stellungnahmen und weiterer Verlauf.`
})

useSeoMeta({ title: seoTitle, description: seoDescription })

const linkClasses =
  'rounded text-accent-deep underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-deep'
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <div v-if="status === 'pending' && !data">
      <LoadingState label="Begutachtung wird geladen …" />
    </div>
    <div v-else-if="error">
      <ErrorState @retry="refresh()" />
    </div>
    <article v-else-if="data">
      <header>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium text-ink-muted">{{ data.citation }}</span>
          <MinistryBadge :code="data.ministryCode" :name="data.ministryName" />
          <DeadlineBadge :deadline="data.deadline" :active="data.active" />
        </div>
        <h1 class="mt-3 text-2xl font-semibold text-ink sm:text-3xl">
          {{ data.title }}
        </h1>
        <p class="mt-2 text-sm text-ink-secondary">
          Eingelangt am {{ formatDateDe(data.arrivedAt) }} ·
          <template v-if="data.deadline">
            Frist bis {{ formatDateDe(data.deadline) }}
          </template>
          <template v-else>keine Frist</template>
        </p>
      </header>

      <section
        v-if="description.length"
        class="mt-6"
        aria-labelledby="kurzinfo-heading"
      >
        <h2 id="kurzinfo-heading" class="sr-only">Kurzinformation</h2>
        <DraftSummary :blocks="description" />
      </section>

      <div class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <UButton
          v-if="data.active"
          :to="data.parliamentUrl"
          target="_blank"
          rel="noopener"
          color="primary"
          class="min-h-11"
        >
          Stellungnahme auf parlament.gv.at abgeben<span aria-hidden="true"> ↗</span>
        </UButton>
        <ExternalLink
          :href="data.parliamentUrl"
          class="inline-flex min-h-11 items-center rounded text-sm font-medium text-accent-deep hover:underline"
        >
          Auf parlament.gv.at ansehen
        </ExternalLink>
      </div>

      <section v-if="data.documents.length" class="mt-10" aria-labelledby="docs-heading">
        <h2 id="docs-heading" class="text-lg font-semibold text-ink">
          Entwurfsdokumente
        </h2>
        <div class="mt-4">
          <DocumentList :documents="data.documents" />
        </div>
      </section>

      <section class="mt-10" aria-labelledby="statements-heading">
        <h2 id="statements-heading" class="text-lg font-semibold text-ink">
          Stellungnahmen
        </h2>
        <div class="mt-4">
          <StatementsPanel
            v-if="data.statements.total > 0"
            :gp="gp"
            :inr="inr"
            :summary="data.statements"
          />
          <EmptyState
            v-else
            title="Noch keine Stellungnahmen"
            :description="
              data.active
                ? 'Zu diesem Entwurf ist noch keine Stellungnahme eingelangt – die Frist läuft.'
                : 'Zu diesem Entwurf sind keine Stellungnahmen eingelangt.'
            "
          />
        </div>
      </section>

      <section v-if="showOutcome" class="mt-10" aria-labelledby="outcome-heading">
        <h2 id="outcome-heading" class="text-lg font-semibold text-ink">
          Was wurde daraus?
        </h2>

        <div v-if="data.enactment" class="mt-4 rounded-xl bg-accent-wash p-5">
          <p class="font-medium">
            <ExternalLink :href="data.enactment.rvUrl" :class="linkClasses">
              Regierungsvorlage {{ data.enactment.rvCitation }}
            </ExternalLink>
          </p>
          <p v-if="data.enactment.bgblNumber" class="mt-1.5 text-sm">
            <ExternalLink
              v-if="data.enactment.bgblRisUrl"
              :href="data.enactment.bgblRisUrl"
              :class="linkClasses"
            >
              Kundgemacht als {{ data.enactment.bgblNumber }}
            </ExternalLink>
            <span v-else class="text-accent-deep">
              Kundgemacht als {{ data.enactment.bgblNumber }}
            </span>
          </p>
        </div>

        <p v-if="!data.enactment && !data.active" class="mt-4 text-sm text-ink-muted">
          Bisher keine Regierungsvorlage zu diesem Entwurf.
        </p>

        <div v-if="data.trace.length" class="mt-6">
          <TraceTimeline :steps="data.trace" />
        </div>

        <div v-if="data.textEvolution.length" class="mt-6">
          <h3 class="text-sm font-semibold text-ink">Textentwicklung</h3>
          <ul class="mt-2 flex flex-wrap gap-2">
            <li v-for="link in data.textEvolution" :key="link.url">
              <ExternalLink
                :href="link.url"
                class="inline-flex min-h-11 items-center rounded-full border border-hairline bg-surface px-3.5 text-sm text-accent-deep hover:border-baseline hover:underline"
              >
                {{ link.label }}
              </ExternalLink>
            </li>
          </ul>
        </div>
      </section>

      <p class="mt-12 text-xs text-ink-muted">
        Quelle: Parlamentsdirektion, parlament.gv.at (CC BY 4.0). Volltexte der
        Stellungnahmen nur auf parlament.gv.at.
      </p>
    </article>
  </div>
</template>
