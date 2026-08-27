<script setup lang="ts">
import type { EnactmentInfo } from '#shared/types'

/**
 * The product thesis as UI: the full ME→RV→BGBl track, always visible in
 * both lifecycle states. Reached stages carry their date/citation, future
 * stages stay as visible empty slots — a stalled draft is visibly stalled
 * (the unfilled remainder IS the answer, no accusatory copy), a completed
 * chain is visibly complete. State is carried by the text under each
 * stage, never by dot fill alone (AAA).
 */
const props = defineProps<{
  arrivedAt: string
  deadline: string | null
  active: boolean
  enactment: EnactmentInfo | null
}>()

type StageState = 'done' | 'current' | 'open'

interface Stage {
  name: string
  state: StageState
  /** Visible text carrying the state (date, citation, "ausstehend", …) */
  info: string
  /** Upstream evidence link (RV, BGBl) */
  href?: string | null
}

const stages = computed<Stage[]>(() => {
  const e = props.enactment
  return [
    {
      name: 'Entwurf',
      state: 'done',
      info: formatDateDe(props.arrivedAt),
    },
    {
      name: 'Begutachtung',
      state: props.active ? 'current' : 'done',
      info: props.active
        ? fristLabel(props.deadline, true)
        : props.deadline
          ? `endete am ${formatDateDe(props.deadline)}`
          : 'abgeschlossen',
    },
    {
      name: 'Regierungsvorlage',
      state: e ? 'done' : 'open',
      // "bisher keine" is temporal, never accusatory (framing rule) — and
      // only claimed once the Frist has ended.
      info: e ? e.rvCitation : props.active ? 'ausstehend' : 'bisher keine',
      href: e?.rvUrl ?? null,
    },
    {
      name: 'Bundesgesetzblatt',
      state: e?.bgblNumber ? 'done' : 'open',
      // "ausstehend" while the chain can still continue; the bare dash
      // only once the Frist ended without any RV.
      info: e?.bgblNumber
        ? e.bgblNumber.replace(/^Bundesgesetzblatt\b/, 'BGBl.')
        : e || props.active
          ? 'ausstehend'
          : '–',
      href: e?.bgblRisUrl ?? null,
    },
  ]
})

const dotClass: Record<StageState, string> = {
  done: 'border-ink bg-ink',
  current: 'border-ink bg-mark',
  open: 'border-baseline bg-surface',
}
</script>

<template>
  <ol
    aria-label="Verfahrensstand"
    class="flex flex-col gap-4 sm:flex-row sm:gap-0"
  >
    <li
      v-for="(stage, i) in stages"
      :key="stage.name"
      :aria-current="stage.state === 'current' ? 'step' : undefined"
      class="relative flex gap-3 sm:block sm:flex-1 sm:pt-6 sm:text-center"
    >
      <!-- Connector to the next stage: ink once this stage is reached. -->
      <span
        v-if="i < stages.length - 1"
        aria-hidden="true"
        class="absolute -bottom-5 left-1.25 top-4 w-0.5 sm:bottom-auto sm:left-[calc(50%+0.75rem)] sm:right-[calc(-50%+0.75rem)] sm:top-1.25 sm:h-0.5 sm:w-auto"
        :class="stage.state === 'done' ? 'bg-ink' : 'bg-hairline'"
      />
      <span
        aria-hidden="true"
        class="relative z-10 mt-1 box-border size-3 shrink-0 rounded-full border-2 sm:absolute sm:left-1/2 sm:top-0 sm:mt-0 sm:-translate-x-1/2"
        :class="dotClass[stage.state]"
      />
      <div class="min-w-0">
        <p
          class="text-sm"
          :class="stage.state === 'open' ? 'font-normal text-ink-secondary' : 'font-medium text-ink'"
        >
          {{ stage.name }}
        </p>
        <p class="text-xs tabular-nums text-ink-secondary">
          <ExternalLink
            v-if="stage.href"
            :href="stage.href"
            class="tap-target rounded text-accent-deep underline underline-offset-2 hover:no-underline"
          >
            {{ stage.info }}
          </ExternalLink>
          <template v-else>{{ stage.info }}</template>
        </p>
      </div>
    </li>
  </ol>
</template>
