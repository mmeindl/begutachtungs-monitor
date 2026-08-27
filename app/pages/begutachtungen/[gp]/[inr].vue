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

// "Was wurde daraus?" leads the page for closed consultations (trace,
// text versions, or at least the neutral no-RV note). While the Frist
// runs it appears only if a real outcome (RV) already exists: an active
// consultation's trace/text links merely repeat the header and the
// document list, and the question itself isn't answerable yet.
const showOutcome = computed(() => {
  const d = data.value
  if (!d) return false
  return Boolean(d.enactment) || !d.active
})

// Compact answer to the page's core question, shown in the header status
// row; links to the full section. Mirrors showOutcome's gating, and stays
// neutral in every state (Nachverfolgung, not a scoreboard).
const outcomeChip = computed(() => {
  const d = data.value
  if (!d) return null
  if (d.enactment?.bgblNumber) {
    // Chip real estate: canonical short citation; the card below keeps the long form.
    return `Kundgemacht: ${d.enactment.bgblNumber.replace(/^Bundesgesetzblatt\b/, 'BGBl.')}`
  }
  if (d.enactment) return 'Regierungsvorlage liegt vor'
  if (!d.active) return 'Bisher keine Regierungsvorlage'
  return null
})

// Months of pipeline latency between Begutachtungsende and RV are normal,
// so a recently ended consultation must not read as shelved — the second
// sentence of the no-RV card carries that temporal honesty.
const noRvNote = computed(() => {
  const days = daysUntil(data.value?.deadline)
  const recent = days !== null && days >= -RV_LATENCY_CONTEXT_DAYS
  return recent
    ? 'Zwischen Begutachtungsende und Regierungsvorlage liegen häufig mehrere Monate – dieser Stand kann sich noch ändern.'
    : 'Ob und wie es weitergeht, ist offen.'
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
    .join(' · ')
    .replace(/\s+/g, ' ')
    .trim()
  if (prose) return truncate(prose, 160)
  return `Ministerialentwurf ${d.citation}: Frist, Stellungnahmen und weiterer Verlauf.`
})

// Structured facts travel better than prose when a link unfurls in
// Slack/Signal/X: the preview answers "when, how much, who" at a glance.
const ogFacts = computed(() => {
  const d = data.value
  if (!d) return null
  const frist = d.active
    ? d.deadline
      ? `Frist bis ${formatDateDe(d.deadline)}`
      : 'Begutachtung läuft'
    : d.deadline
      ? `Begutachtung endete am ${formatDateDe(d.deadline)}`
      : 'Begutachtung abgeschlossen'
  return [
    frist,
    countLabelDe(d.statements.total, 'Stellungnahme', 'Stellungnahmen'),
    d.ministryName,
  ]
    .filter(Boolean)
    .join(' · ')
})

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  // The full official title for shares — journalists cite exactly.
  ogTitle: () => data.value?.title ?? 'Begutachtung',
  ogDescription: ogFacts,
  ogType: 'article',
})

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
          <a v-if="outcomeChip" href="#outcome-heading" class="tap-target rounded-full">
            <!-- Only ink + accent-deep are AAA on accent-wash (see main.css). -->
            <span
              class="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-accent-wash px-2.5 py-0.5 text-xs font-medium text-accent-deep hover:underline"
            >
              {{ outcomeChip }}
              <UIcon name="i-lucide-arrow-down" class="size-3" aria-hidden="true" />
              <span class="sr-only">– zum Abschnitt „Was wurde daraus?“</span>
            </span>
          </a>
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

      <!-- The documented base fact (drafts get revised routinely), no
           per-Stellungnahme causality — the honest interim form of
           "your input changed §5" until the diff layer exists. -->
      <p v-if="data.active" class="mt-3 max-w-prose text-sm text-ink-secondary">
        Ministerien überarbeiten Entwürfe nach der Begutachtung regelmäßig.
        Der Monitor verfolgt auch bei diesem Entwurf, was daraus wird.
      </p>

      <!-- Section order is lifecycle-adaptive by construction: showOutcome is
           false for a typical active consultation, so during the Frist the page
           reads Kurzinfo → CTA → Stellungnahmen → Dokumente, while closed
           consultations lead with the accountability answer. -->
      <section v-if="showOutcome" class="mt-10 scroll-mt-6" aria-labelledby="outcome-heading">
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

        <!-- Framing rule: both outcomes get the same card shape and type
             scale — tone differs (wash vs. surface), weight never does. -->
        <div
          v-if="!data.enactment && !data.active"
          class="mt-4 rounded-xl border border-hairline bg-surface p-5"
        >
          <p class="font-medium">Bisher keine Regierungsvorlage</p>
          <p class="mt-1.5 text-sm text-ink-secondary">
            Der Entwurf wurde nach Ende der Begutachtung bislang nicht als
            Regierungsvorlage eingebracht. {{ noRvNote }}
          </p>
        </div>

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

      <section class="mt-10" aria-labelledby="statements-heading">
        <h2 id="statements-heading" class="text-lg font-semibold text-ink">
          Stellungnahmen
        </h2>
        <div class="mt-4">
          <p
            v-if="data.statements.degraded"
            class="rounded-xl border border-hairline bg-surface p-5 text-sm leading-relaxed text-ink-secondary"
          >
            {{ countLabelDe(data.statements.total, 'Stellungnahme', 'Stellungnahmen') }}
            laut Übersicht – die Liste ist auf parlament.gv.at derzeit nicht
            abrufbar, daher können Details hier nicht angezeigt werden.
            <ExternalLink :href="data.parliamentUrl" :class="linkClasses"
              >Auf parlament.gv.at ansehen</ExternalLink
            >
          </p>
          <StatementsPanel
            v-else-if="data.statements.total > 0"
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

      <section v-if="data.documents.length" class="mt-10" aria-labelledby="docs-heading">
        <h2 id="docs-heading" class="text-lg font-semibold text-ink">
          Entwurfsdokumente
        </h2>
        <div class="mt-4">
          <DocumentList :documents="data.documents" />
        </div>
      </section>

      <p class="mt-12 text-xs text-ink-muted">
        Quelle: Parlamentsdirektion, parlament.gv.at (CC BY 4.0). Volltexte der
        Stellungnahmen nur auf parlament.gv.at.
      </p>
    </article>
  </div>
</template>
