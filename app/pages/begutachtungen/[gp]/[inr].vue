<script setup lang="ts">
import type { ConsultationDetail, ConsultationDocument } from '#shared/types'
import { GP_RE, INR_RE } from '#shared/utils/gp'

definePageMeta({
  // Messenger/autocorrect lowercasing kills valid shared links — 301 to
  // the canonical uppercase URL instead of 404ing (one URL truth for SEO).
  middleware: [
    (to) => {
      const gpParam = String(to.params.gp ?? '')
      const canonical = gpParam.toUpperCase()
      if (gpParam !== canonical && GP_RE.test(canonical)) {
        return navigateTo(
          `/begutachtungen/${canonical}/${String(to.params.inr ?? '')}`,
          { redirectCode: 301 },
        )
      }
    },
  ],
  // Case-insensitive so the middleware gets to redirect regardless of
  // middleware/validate ordering; non-GP garbage still 404s.
  validate: (route) =>
    GP_RE.test(String(route.params.gp ?? '').toUpperCase()) &&
    INR_RE.test(String(route.params.inr ?? '')),
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

/* Decision and sign convention live in shared/utils/deadlines.ts, next to
 * the other deadline rules and covered by tests — a flipped sign here would
 * tell a submitter the wrong date. */
const divergence = computed(() =>
  fristDivergence(data.value?.risDraft ?? null, Boolean(data.value?.active)),
)

/* One draft text, up to three formats — a DocumentList row, not a chip per
 * format: a chip has to carry the format in its label ("Entwurfstext (PDF)"),
 * so the noun repeats and the row grows with every format RIS adds. The
 * RIS-Eintrag itself is a catalogue page, not a document, and stays a link
 * in the lead sentence. */
const risDocuments = computed<(ConsultationDocument & { hint?: string })[]>(() => {
  const doc = data.value?.risDraft?.risDocument
  if (!doc) return []
  const formats = ([['pdf', doc.pdf], ['html', doc.html]] as const)
    .filter((pair): pair is readonly ['pdf' | 'html', string] => Boolean(pair[1]))
    .map(([type, url]) => ({ type, url }))
  return formats.length
    ? [{ title: 'Entwurfstext', hint: 'Fassung im RIS des Bundes', formats }]
    : []
})

// The StageBar already states "Regierungsvorlage · bisher keine", so the
// card must not say it again. Its job is the bracket the bar cannot carry:
// elapsed time. Once the quiet stretch exceeds the latency window, the
// quotable verdict sentence leads; before that there is no headline at
// all — months of pipeline latency are normal, and a fresh silence is
// "noch nicht", not a verdict to put in bold.
const noRvVerdict = computed(() => noRvVerdictDe(data.value?.deadline))

const noRvBody = computed(() => {
  if (noRvVerdict.value) return 'Ob und wie es weitergeht, ist offen.'
  // No Frist, no bracket to measure — the only branch where the card
  // restates the bar, because otherwise it would say nothing at all.
  if (daysUntil(data.value?.deadline) === null) {
    return 'Der Entwurf wurde bislang nicht als Regierungsvorlage eingebracht. Ob und wie es weitergeht, ist offen.'
  }
  return 'Zwischen Begutachtungsende und Regierungsvorlage liegen häufig mehrere Monate – dieser Stand kann sich noch ändern.'
})

/* The one fact the upstream stage list holds that the StageBar cannot:
 * when parliament handed the Stellungnahmen to the ressort. That is where
 * the ministry's clock starts, so it belongs to "Was wurde daraus?" as a
 * sentence — temporal, no causality claimed (framing rule). */
const handoffSentence = computed(() => {
  const h = data.value?.handoff
  if (!h?.date) return null
  return `Die Stellungnahmen wurden am ${formatDateDe(h.date)} an ${h.recipient} übermittelt.`
})

const seoTitle = computed(() => {
  const d = data.value
  if (!d) return 'Begutachtung'
  // The short name is what fits a tab and what insiders search for;
  // og:title keeps the full official title for exact citation.
  return truncate(d.shortTitle ?? d.title, 60)
})

const { siteUrl } = useRuntimeConfig().public

// Ready-made citation for the clipboard — the journalist's copy-paste
// lede: citation, name, deadline state, canonical URL.
const citationText = computed(() => {
  const d = data.value
  if (!d) return ''
  const frist = d.deadline
    ? d.active
      ? ` – Begutachtungsfrist bis ${formatDateDe(d.deadline)}`
      : ` – Begutachtung endete am ${formatDateDe(d.deadline)}`
    : ''
  return `${d.citation} (${d.gp}. GP): ${d.shortTitle ?? d.title}${frist}. ${siteUrl}/begutachtungen/${d.gp}/${d.inr}`
})

/* The async clipboard API is denied in embedded webviews and non-HTTPS
 * origins — fall back to the legacy execCommand path, and when both are
 * blocked SAY so and reveal the text itself (a silent catch here cost a
 * real user their copy: nothing happened, nothing explained). */
type CopyState = 'idle' | 'copied' | 'blocked'
const copyState = ref<CopyState>('idle')
let copiedTimer: ReturnType<typeof setTimeout> | undefined

function writeClipboardFallback(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

async function copyCitation() {
  if (!citationText.value) return
  let ok = false
  try {
    await navigator.clipboard.writeText(citationText.value)
    ok = true
  } catch {
    ok = writeClipboardFallback(citationText.value)
  }
  copyState.value = ok ? 'copied' : 'blocked'
  clearTimeout(copiedTimer)
  // The blocked state stays: it carries the manual-copy recourse.
  if (ok) {
    copiedTimer = setTimeout(() => {
      copyState.value = 'idle'
    }, 2000)
  }
}
onUnmounted(() => clearTimeout(copiedTimer))

const COPY_LABEL: Record<CopyState, string> = {
  idle: 'Zitierlink kopieren',
  copied: 'Kopiert',
  blocked: 'Kopieren blockiert',
}
const COPY_ANNOUNCE: Record<CopyState, string> = {
  idle: '',
  copied: 'Zitierlink in die Zwischenablage kopiert',
  blocked:
    'Der Browser hat den Zugriff auf die Zwischenablage blockiert. Der Zitierlink wird zum manuellen Kopieren angezeigt.',
}

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
      <!-- Shared-link landers (the declared primary case) need a way into
           the corpus that preserves the item's GP — the nav loses it. -->
      <div class="mb-4">
        <NuxtLink
          :to="`/begutachtungen?gp=${data.gp}`"
          class="inline-flex min-h-11 items-center rounded text-sm font-medium text-accent-deep hover:underline"
        >
          ← Alle Begutachtungen (GP {{ data.gp }})
        </NuxtLink>
      </div>
      <header>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium text-ink-muted">{{ data.citation }}</span>
          <!-- Every Ressort gets a de-facto page for free: the filtered
               list URL. Only here — cards are themselves links. -->
          <NuxtLink
            :to="`/begutachtungen?ministry=${data.ministryCode}&gp=${data.gp}`"
            :aria-label="`Alle Begutachtungen des Ressorts ${data.ministryName} anzeigen`"
            class="tap-target rounded"
          >
            <MinistryBadge
              :code="data.ministryCode"
              :name="data.ministryName"
              class="transition-colors hover:border-baseline hover:underline"
            />
          </NuxtLink>
          <!-- Only while it runs: the badge exists to carry urgency (tone +
               "Noch 3 Tage"). Closed, it degrades to "Endete am …" — which
               the StageBar states 100px below, better. -->
          <DeadlineBadge
            v-if="data.active"
            :deadline="data.deadline"
            :active="data.active"
          />
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-link"
            class="ml-auto"
            @click="copyCitation"
          >
            {{ COPY_LABEL[copyState] }}
          </UButton>
          <span aria-live="polite" class="sr-only">{{
            COPY_ANNOUNCE[copyState]
          }}</span>
        </div>
        <!-- Manual recourse when the clipboard is blocked: the citation
             itself, one tap/click to select. -->
        <p
          v-if="copyState === 'blocked'"
          class="mt-2 select-all rounded-md border border-hairline bg-surface p-2.5 text-sm text-ink-secondary"
        >
          {{ citationText }}
        </p>
        <h1 class="mt-3 text-2xl font-semibold text-ink sm:text-3xl">
          {{ data.shortTitle ?? data.title }}
        </h1>
        <!-- The official Sammeltitel stays on the page (and in og:title)
             so citations remain exact — it just no longer IS the h1. -->
        <p v-if="data.shortTitle" class="mt-1 text-sm text-ink-secondary">
          {{ data.title }}
        </p>
        <!-- Eingelangt/Frist deliberately absent: the StageBar below states
             both, and the pill above already repeats the Frist. What is left
             is the one fact no other surface carries. -->
        <p v-if="data.invitedBy" class="mt-2 text-sm text-ink-secondary">
          Übermittelt von {{ data.invitedBy }}
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
            class="tap-target rounded text-ink-muted hover:text-ink hover:underline"
          >
            Wie funktioniert das Verfahren? →
          </NuxtLink>
        </p>
      </div>

      <section
        v-if="description.length"
        class="page-section"
        aria-labelledby="kurzinfo-heading"
      >
        <!-- Was sr-only: sighted readers got a section whose first visible
             marker was a 14px "Ziel". The page now reads as a question
             sequence — worum geht es, was wurde daraus. -->
        <h2 id="kurzinfo-heading" class="section-heading">Worum geht es?</h2>
        <div class="mt-4">
          <DraftSummary :blocks="description" />
        </div>
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
        <!-- Directly under the date it qualifies, above the CTA: whoever is
             about to submit reads it before acting, and the sentence ends by
             naming the date that governs. -->
        <p v-if="divergence" class="mt-2 max-w-prose text-sm text-ink-secondary">
          Zweite amtliche Quelle, andere Frist: Das Rechtsinformationssystem
          nennt als Fristende
          <ExternalLink
            v-if="divergence.url"
            :href="divergence.url"
            class="tap-target rounded font-medium text-accent-deep hover:underline"
          >
            {{ formatDateDe(divergence.date) }}</ExternalLink
          ><span v-else class="font-medium text-ink">{{
            formatDateDe(divergence.date)
          }}</span>
          – {{ countLabelDe(divergence.days, 'Tag', 'Tage') }}
          {{ divergence.later ? 'später' : 'früher' }}. Eingebracht wird beim
          Parlament<template v-if="data.deadline">, maßgeblich ist daher der
          {{ formatDateDe(data.deadline) }}</template>.
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
      <section
        v-if="showOutcome"
        class="page-section scroll-mt-6"
        aria-labelledby="outcome-heading"
      >
        <h2 id="outcome-heading" class="section-heading">
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
          <!-- ME→RV is 1:n: without this the second Regierungsvorlage of a
               split draft is invisible (4 of 132 in the XXVIII corpus). -->
          <p v-if="data.enactment.furtherRv.length" class="mt-1.5 text-sm">
            Aus dem Entwurf ging außerdem
            <template v-for="(rv, i) in data.enactment.furtherRv" :key="rv.url"
              ><span v-if="i > 0">, </span
              ><ExternalLink :href="rv.url" :class="linkClasses">{{ rv.label }}</ExternalLink></template
            >
            hervor.
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
          <!-- The card states the outcome; the comparison itself lives in
               its own section below and is linked, not duplicated — the two
               source PDFs used to sit here as chips, a placeholder from
               before the diff existed. -->
          <p v-if="data.enactment" class="mt-4 text-sm leading-relaxed text-ink">
            <template v-if="data.deadline && data.statements.total > 0">
              Bis zum Fristende am {{ formatDateDe(data.deadline) }} gingen
              {{ countLabelDe(data.statements.total, 'Stellungnahme', 'Stellungnahmen') }}
              ein.
            </template>
            Die Regierungsvorlage ist die Fassung, die die Regierung nach
            der Begutachtung dem Nationalrat vorgelegt hat. Ob und wie der
            Entwurf geändert wurde, zeigt
            <a href="#textvergleich" class="font-medium text-accent-deep underline decoration-hairline underline-offset-2 hover:decoration-current">der Vergleich der beiden Texte</a>
            weiter unten.
          </p>
        </div>

        <!-- Framing rule: both outcomes get the same card shape and type
             scale — tone differs (wash vs. surface), weight never does. -->
        <div
          v-if="!data.enactment && !data.active"
          class="mt-4 rounded-xl border border-hairline bg-surface p-5"
        >
          <p v-if="noRvVerdict" class="font-medium">{{ noRvVerdict }}</p>
          <p
            class="text-sm text-ink-secondary"
            :class="noRvVerdict ? 'mt-1.5' : ''"
          >
            {{ noRvBody }}
          </p>
        </div>

        <!-- The record under the StageBar's claim. Its own h3, like the
             sibling "Textfassungen im Verlauf": two timelines on one page
             must read as summary and detail, not as the answer twice. -->
        <!-- The moment the ressort takes over — the accountability clock's
             start, and the only thing the raw stage list adds. -->
        <p v-if="handoffSentence" class="mt-3 text-sm text-ink-secondary">
          {{ handoffSentence }}
        </p>

        <div v-if="data.textEvolution.length" class="mt-8">
          <h3 class="text-base font-semibold text-ink">Spätere Textfassungen</h3>
          <!-- A first-time reader cannot know these rows ARE the law text
               at successive stations — say it once. The Regierungsvorlage
               itself is not among them: the comparison above offers it, and
               the same link under two headings is what this page had too
               much of. -->
          <p class="mt-1 text-sm text-ink-secondary">
            Der Text wurde nach der Regierungsvorlage im Parlament weiter
            geändert:
          </p>
          <!-- Documents wear the Entwurfsdokumente pattern: one row per
               station, formats as buttons. Chips are for actions inside the
               page. -->
          <div class="mt-2">
            <DocumentList :documents="data.textEvolution" />
          </div>
        </div>

        <!-- The accountability core: what became of the draft, § by §, both
             ways — changed and unchanged alike (CLAUDE.md framing rule). Only
             once a Regierungsvorlage exists; before that there is nothing to
             hold the draft against. -->
        <LawDiffSection v-if="data.enactment" :gp="data.gp" :inr="data.inr" />
      </section>

      <section class="page-section" aria-labelledby="statements-heading">
        <h2 id="statements-heading" class="section-heading">
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

      <!-- Both sources of the SAME draft live here, not under "Was wurde
           daraus?": the RIS entry is the draft at this stage from a second
           authority, not an outcome — and showOutcome is false for an open
           consultation, which hid the RIS text on exactly the pages that
           want it. Two lists under two headings rather than one merged
           list: merged, "Gesetzestext" would appear twice with nothing to
           tell the sources apart. -->
      <section
        v-if="data.documents.length || data.risDraft"
        class="page-section"
        aria-labelledby="docs-heading"
      >
        <h2 id="docs-heading" class="section-heading">
          Entwurfsdokumente
        </h2>
        <div v-if="data.documents.length" class="mt-4">
          <DocumentList :documents="data.documents" />
        </div>

        <!-- RIS carries the text as HTML/XML back to 2004 — the raw material
             of the planned Entwurf ↔ Regierungsvorlage comparison. "Not in
             RIS" is a state worth showing, not an error (docs/ris-join.md
             §2): a dozen drafts per GP never get there. -->
        <div v-if="data.risDraft" class="mt-8">
          <h3 class="text-base font-semibold text-ink">
            Zweite Quelle: Rechtsinformationssystem (RIS)
          </h3>
          <template v-if="data.risDraft.risUrl">
            <p class="mt-1 max-w-prose text-sm text-ink-secondary">
              Das RIS des Bundes führt denselben Entwurf mit Text, Erläuterungen
              und Textgegenüberstellung im
              <ExternalLink :href="data.risDraft.risUrl" :class="linkClasses"
                >RIS-Eintrag</ExternalLink
              >.
            </p>
            <div v-if="risDocuments.length" class="mt-2">
              <DocumentList :documents="risDocuments" source="ris.bka.gv.at" />
            </div>
          </template>
          <p v-else class="mt-1 max-w-prose text-sm text-ink-secondary">
            Zu diesem Entwurf ist im RIS keine Veröffentlichung zu finden.
          </p>
        </div>
      </section>

    </article>
  </div>
</template>
