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

// "Vergleichen Sie selbst": the honest manual precursor of the diff layer —
// the ME Gesetzestext next to the RV text, reader does the comparison.
// Doc titles are ministries' free text, so match defensively and fall back
// to the two Gegenstand pages (which always carry the texts).
const compareLinks = computed(() => {
  const d = data.value
  if (!d?.enactment) return null
  const meDoc = d.documents.find((doc) => doc.title.trim().startsWith('Gesetzestext'))
  const mePdf = meDoc?.formats.find((f) => f.type === 'pdf')?.url
  return {
    me: {
      url: mePdf ?? meDoc?.formats[0]?.url ?? d.parliamentUrl,
      label: mePdf ? 'Ministerialentwurf (PDF)' : 'Ministerialentwurf',
    },
    rv: {
      url: d.textEvolution[0]?.url ?? d.enactment.rvUrl,
      label: 'Regierungsvorlage',
    },
  }
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
          <template v-if="data.invitedBy">
            · Übermittelt von {{ data.invitedBy }}
          </template>
        </p>
      </header>

      <!-- The whole track, in both lifecycle states: hollow future stages
           on open pages say "we track this", the unfilled remainder on a
           stalled draft IS the answer. Replaces the old outcome chip. -->
      <div class="mt-6 rounded-xl border border-hairline bg-surface p-5">
        <StageBar
          :arrived-at="data.arrivedAt"
          :deadline="data.deadline"
          :active="data.active"
          :enactment="data.enactment"
        />
        <p class="mt-4 text-xs">
          <NuxtLink
            to="/so-funktionierts"
            class="tap-target rounded text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            Wie funktioniert das Verfahren? →
          </NuxtLink>
        </p>
      </div>

      <section
        v-if="description.length"
        class="mt-6"
        aria-labelledby="kurzinfo-heading"
      >
        <h2 id="kurzinfo-heading" class="sr-only">Kurzinformation</h2>
        <DraftSummary :blocks="description" />
      </section>

      <!-- Deadline, action and calendar welded into one card: the page's
           single door while the Frist runs. The plain upstream link earns
           its place only on closed pages, where it is the sole source link. -->
      <div
        v-if="data.active"
        class="mt-6 rounded-xl border border-hairline bg-surface p-5"
      >
        <p class="font-semibold text-ink">
          {{ fristLabel(data.deadline, true) }}<template v-if="data.deadline">
            – die Frist endet am {{ formatDateDe(data.deadline) }}</template
          >
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <UButton
            :to="data.parliamentUrl"
            target="_blank"
            rel="noopener"
            color="primary"
            class="min-h-11"
          >
            Stellungnahme auf parlament.gv.at abgeben<span aria-hidden="true"> ↗</span>
          </UButton>
          <UButton
            v-if="data.deadline"
            :to="`/begutachtungen/${gp}/${inr}/frist.ics`"
            external
            color="neutral"
            variant="outline"
            class="min-h-11"
          >
            Frist in den Kalender (.ics)
          </UButton>
        </div>
        <!-- The documented base fact (drafts get revised routinely), no
             per-Stellungnahme causality — the honest interim form of
             "your input changed §5" until the diff layer exists. -->
        <p class="mt-3 max-w-prose text-sm text-ink-secondary">
          Ministerien überarbeiten Entwürfe nach der Begutachtung regelmäßig.
          Der Monitor verfolgt auch bei diesem Entwurf, was daraus wird.
        </p>
      </div>
      <div v-else class="mt-6">
        <ExternalLink
          :href="data.parliamentUrl"
          class="inline-flex min-h-11 items-center rounded text-sm font-medium text-accent-deep hover:underline"
        >
          Auf parlament.gv.at ansehen
        </ExternalLink>
      </div>

      <!-- Section order is lifecycle-adaptive by construction: showOutcome is
           false for a typical active consultation, so during the Frist the page
           reads Kurzinfo → CTA → Stellungnahmen → Dokumente, while closed
           consultations lead with the accountability answer. -->
      <section v-if="showOutcome" class="mt-10 scroll-mt-6" aria-labelledby="outcome-heading">
        <h2 id="outcome-heading" class="text-lg font-semibold text-ink">
          Was wurde daraus?
        </h2>

        <!-- The marker moment: the highlighter marks what became of the
             input. Ink and accent-deep are AAA on mark-wash (main.css). -->
        <div v-if="data.enactment" class="mt-4 rounded-xl bg-mark-wash p-5">
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
          <!-- Mechanism 3, manual edition: invite the comparison the diff
               layer will one day automate. Temporal narrative, not causal.
               Only ink + accent-deep are AAA on accent-wash (main.css). -->
          <template v-if="compareLinks">
            <p class="mt-4 text-sm leading-relaxed text-ink">
              <template v-if="data.deadline && data.statements.total > 0">
                Bis zum Fristende am {{ formatDateDe(data.deadline) }} gingen
                {{ countLabelDe(data.statements.total, 'Stellungnahme', 'Stellungnahmen') }}
                ein.
              </template>
              Die Regierungsvorlage ist die Fassung, die die Regierung nach
              der Begutachtung dem Nationalrat vorgelegt hat. Ob und wie der
              Entwurf geändert wurde, zeigt der Vergleich der beiden Texte:
            </p>
            <ul class="mt-2 flex flex-wrap gap-2">
              <li>
                <ExternalLink
                  :href="compareLinks.me.url"
                  class="inline-flex min-h-11 items-center rounded-md border border-hairline bg-surface px-3.5 text-sm font-medium text-accent-deep hover:border-baseline hover:underline"
                >
                  {{ compareLinks.me.label }}
                </ExternalLink>
              </li>
              <li>
                <ExternalLink
                  :href="compareLinks.rv.url"
                  class="inline-flex min-h-11 items-center rounded-md border border-hairline bg-surface px-3.5 text-sm font-medium text-accent-deep hover:border-baseline hover:underline"
                >
                  {{ compareLinks.rv.label }}
                </ExternalLink>
              </li>
            </ul>
          </template>
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
          <h3 class="text-sm font-semibold text-ink">Textfassungen im Verlauf</h3>
          <!-- A first-time reader cannot know these chips ARE the law text
               at successive stations — say it once. -->
          <p class="mt-1 text-sm text-ink-secondary">
            Der Gesetzestext an den Stationen des Verfahrens:
          </p>
          <!-- rounded-md, not -full: interactive chip, not status pill
               (shape grammar, see TraceTimeline chips). -->
          <ul class="mt-2 flex flex-wrap gap-2">
            <li v-for="link in data.textEvolution" :key="link.url">
              <ExternalLink
                :href="link.url"
                class="inline-flex min-h-11 items-center rounded-md border border-hairline bg-surface px-3.5 text-sm text-accent-deep hover:border-baseline hover:underline"
              >
                {{ link.label }}
              </ExternalLink>
            </li>
          </ul>
          <p class="mt-2 text-xs text-ink-muted">
            Der direkte Textvergleich Entwurf ↔ Regierungsvorlage ist geplant.
          </p>
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
          <template v-else-if="data.statements.total > 0">
            <StatementsPanel :gp="gp" :inr="inr" :summary="data.statements" />
            <!-- Silent disagreement between the two upstream sources is the
                 one option that serves nobody — a journalist who cites the
                 card's number and screenshots this page must not find a
                 contradiction. -->
            <p
              v-if="
                data.statements.overviewTotal != null &&
                data.statements.overviewTotal !== data.statements.total
              "
              class="mt-3 text-xs text-ink-muted"
            >
              Die Übersicht des Parlaments zählt
              {{ formatNumberDe(data.statements.overviewTotal) }} Stellungnahmen
              – davon hier aufgeschlüsselt:
              {{ formatNumberDe(data.statements.total) }}.
              <template v-if="data.statements.overviewTotal > data.statements.total">
                Die Übersichtszahl kann Einträge enthalten, die noch nicht in
                der Liste veröffentlicht sind.
              </template>
            </p>
            <p v-if="data.statements.staleAsOf" class="mt-3 text-xs text-ink-muted">
              Stand der Liste: {{ formatDateTimeDe(data.statements.staleAsOf) }}
              – die aktuelle Liste ist auf parlament.gv.at derzeit nicht
              abrufbar.
            </p>
          </template>
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
