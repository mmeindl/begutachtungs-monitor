/**
 * The list „Jetzt offen: Rückmeldung an die Kommission" on `/eu-recht`
 * (step 3 of the EU cycle, 15.11.2026), as words: every window in which the
 * Commission takes feedback on its portal „Ihre Meinung zählt" today, by
 * closing day, the soonest first.
 *
 * ONE ROW PER WINDOW. An initiative with two windows at once — a Sondierung
 * and a public consultation launched together, 4 of 49 on 15.11.2026 —
 * stands twice, each row under its own stage: they are two places to
 * contribute, with their own form on the portal.
 *
 * DATES AND OBSERVATIONS, NO VERDICT (rule D6): the closing day is a date,
 * never „nur noch N Tage", and its box is the same grey on every row. No
 * count of contributions, no „most discussed", no order but the dates'
 * (plan, step 3): a count of contributions beside an open window would
 * read as a ranking of where it is worth writing.
 *
 * The tabs say where in the process the window sits, in the words the act's
 * rail already uses (`EU_RAIL_DE`): „Konsultation" before any proposal
 * (Sondierung, öffentliche Konsultation), „Vorschlag" on a proposal the
 * Commission adopted, „Entwurf eines Rechtsakts" on a draft of its own
 * delegated or implementing act. A stage the monitor has no word for
 * stands under „Alle" only, with the portal's code as its stage.
 *
 * All German copy of the list lives here, so a second language replaces
 * it here. Pure: no Vue.
 */
import type { EuFensterResponse, EuOpenInitiative, EuWindow } from '#shared/types'
import { euInitiativePath } from '#shared/utils/eu'
import { actTypeDe, windowStageDe } from '#shared/utils/euPortal'
import { formatDateWeekdayDe, fristLabel } from '#shared/utils/format'
import { deadlineTone } from './deadlines'
import type { EntryState } from './entryView'
import { EU_RAIL_DE } from './euRail'

export type EuFensterTab = 'alle' | 'konsultation' | 'vorschlag' | 'rechtsakt'

export const EU_FENSTER_TABS: readonly EuFensterTab[] = ['alle', 'konsultation', 'vorschlag', 'rechtsakt']

/** Which tab a stage belongs to; a stage not named here is under „Alle" only. */
const TAB_OF_STAGE: Readonly<Record<string, Exclude<EuFensterTab, 'alle'>>> = {
  ROADMAP: 'konsultation',
  PLANNING_WORKFLOW: 'konsultation',
  OPC_LAUNCHED: 'konsultation',
  ADOPTION_WORKFLOW: 'vorschlag',
  ISC_WORKFLOW: 'rechtsakt',
}

const DE = {
  heading: 'Jetzt offen: Rückmeldung an die Kommission',
  lede: 'Zu diesen Vorhaben nimmt die Europäische Kommission gerade Rückmeldungen entgegen: zu Plänen vor einem Vorschlag, zu ihren Vorschlägen und zu Entwürfen eigener Rechtsakte. Rückmelden kann man sich im Portal „Ihre Meinung zählt“ der Kommission; jede Zeile führt zur Seite des Vorhabens hier, und von dort ins Portal.',
  tab: {
    alle: 'Alle',
    konsultation: EU_RAIL_DE.name.konsultation,
    vorschlag: EU_RAIL_DE.name.vorschlag,
    rechtsakt: EU_RAIL_DE.portal.stage.ISC_WORKFLOW!,
  } as Readonly<Record<EuFensterTab, string>>,
  tabSelect: {
    alle: 'Alle offenen Fristen',
    konsultation: 'Konsultation vor einem Vorschlag',
    vorschlag: 'Rückmeldung zu einem Vorschlag',
    rechtsakt: 'Entwurf eines Rechtsakts der Kommission',
  } as Readonly<Record<EuFensterTab, string>>,
  tabsLabel: 'Wo im Verfahren',
  column: { title: 'Vorhaben', stage: 'Stadium', act: 'Vorgesehen', end: 'Rückmeldung' },
  englishTitle: 'Das Portal führt den Titel bisher nur auf Englisch',
  untitled: (id: number) => `Vorhaben Nr. ${id}`,
  said: { stage: 'Stadium', act: 'Vorgesehen' },
  state: {
    open: 'Rückmeldung möglich',
    noEnd: 'Enddatum im Portal nicht angegeben',
  },
  unread: 'Die offenen Fristen konnten nicht gelesen werden: Das Portal „Ihre Meinung zählt“ der Kommission hat nicht oder nicht lesbar geantwortet. Was dort offen ist, zeigt das Portal selbst:',
  portalLink: 'Portal „Ihre Meinung zählt“',
  none: 'Das Portal „Ihre Meinung zählt“ der Kommission listet heute kein Vorhaben, zu dem Rückmeldungen möglich sind.',
  cut: (read: number, total: number) => `Das Portal zählt ${total} Vorhaben mit offener Frist; der Monitor liest davon die ersten ${read}.`,
  empty: (tab: EuFensterTab) => `Keine offene Frist unter „${DE.tab[tab]}“.`,
  noMatch: (tab: EuFensterTab, q: string) => `Unter „${DE.tab[tab]}“ passt keine offene Frist zu „${q}“.`,
  clear: 'Suche löschen',
  search: 'Offene Fristen durchsuchen',
  count: (n: number) => (n === 1 ? '1 offene Frist' : `${n} offene Fristen`),
  loading: 'Offene Fristen werden geladen …',
  subscribe: 'Diese Fristen abonnieren:',
  subscribeCalendar: 'Kalender',
  subscribeFeed: 'RSS-Feed',
  credits: ['Quelle:', EU_RAIL_DE.portal.credit],
} as const

export const EU_FENSTER_DE = DE

export interface EuFensterRowView {
  /** Initiative and stage: unique, as an initiative has each stage once. */
  key: string
  /** The monitor's page of the initiative. */
  path: string
  title: string
  /** „Das Portal führt den Titel bisher nur auf Englisch" where the German title is missing; null otherwise. */
  titleNote: string | null
  /** „Sondierung", „Öffentliche Konsultation", … — the portal's words. */
  stage: string
  /** „Delegierte Verordnung", or the portal's code; null where it names none. */
  act: string | null
  /** The closing day in the lists' state box: the days left, the day, and the tone of a Frist that is close — as a draft's row. */
  state: EntryState
  tab: Exclude<EuFensterTab, 'alle'> | null
  /** For the sort: the ISO closing day; '9999' where none. */
  end: string
  /** What the search reads. */
  haystack: string
}

function rowOf(i: EuOpenInitiative, w: EuWindow): EuFensterRowView {
  const title = i.title ?? DE.untitled(i.id)
  const stage = windowStageDe(w.stage)
  const act = actTypeDe(i.actType)
  return {
    key: `${i.id}|${w.stage}`,
    // The reader takes only numbers the address can carry (`parseOpenWindows`).
    path: euInitiativePath(i.id)!,
    title,
    titleNote: i.title && !i.titleIsGerman ? DE.englishTitle : null,
    stage,
    act,
    // The draft list's box for an open Frist, word for word and tone for tone (`openState`): one deadline reads the same in every list and on its page's door.
    state: w.end
      ? { label: fristLabel(w.end, true), detail: `bis ${formatDateWeekdayDe(w.end)}`, tone: deadlineTone(w.end, true), actionable: true }
      : { label: DE.state.open, detail: DE.state.noEnd, tone: 'neutral', actionable: true },
    tab: TAB_OF_STAGE[w.stage] ?? null,
    end: w.end ?? '9999',
    haystack: [title, stage, act ?? '', i.reference ?? '', String(i.id), ...i.topics].join(' '),
  }
}

export interface EuFensterView {
  /**
   * The rows per tab, each by closing day, the soonest first, then by the
   * portal's number. Null where the portal could not be read: the page
   * says so, and shows no empty list.
   */
  tabs: Record<EuFensterTab, EuFensterRowView[]> | null
  /** How many rows each tab holds, for its label. */
  counts: Record<EuFensterTab, number>
  /** The sentence that the page cap cut the list; null where it did not. */
  cut: string | null
}

export function euFensterView(r: EuFensterResponse): EuFensterView {
  const zero = { alle: 0, konsultation: 0, vorschlag: 0, rechtsakt: 0 }
  const cut = r.cut ? DE.cut(r.cut.read, r.cut.total) : null
  if (!r.initiatives) return { tabs: null, counts: zero, cut }
  const all = r.initiatives
    .flatMap((i) => i.windows.map((w) => rowOf(i, w)))
    .sort((a, b) => a.end.localeCompare(b.end) || a.key.localeCompare(b.key, 'en', { numeric: true }))
  const tabs: Record<EuFensterTab, EuFensterRowView[]> = {
    alle: all,
    konsultation: all.filter((x) => x.tab === 'konsultation'),
    vorschlag: all.filter((x) => x.tab === 'vorschlag'),
    rechtsakt: all.filter((x) => x.tab === 'rechtsakt'),
  }
  return {
    tabs,
    counts: { alle: all.length, konsultation: tabs.konsultation.length, vorschlag: tabs.vorschlag.length, rechtsakt: tabs.rechtsakt.length },
    cut,
  }
}
