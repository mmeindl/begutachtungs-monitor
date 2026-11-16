/**
 * The homepage's doors (16.11.2026): the ways of taking part that are open
 * today, one per row, each with what is open and the list it leads to —
 * `/wege` made live. The page used to be organised along one object's
 * stations (a draft's: Begutachtung, Regierungsvorlage, Beschluss,
 * Kundmachung); four objects with four rails take part now (a draft, an
 * Anliegen an das Parlament, an EU act, a European Citizens' Initiative),
 * so the page opens with where to act, and the following comes after.
 *
 * Every door is data here, tagged with its jurisdiction (`WegeJurisdiction`),
 * so a second country later is configuration — its doors with its own tag —
 * and no label, link or host name stands in the template.
 *
 * THE RULES OF A DOOR'S COUNT (docs/decisions.md, „The homepage"):
 * - shown only once its source answered; while it is on its way the page's
 *   loading words (`blockStateLine`), after a failure a gap sentence
 *   („Gerade nicht abrufbar: …"), never a zero and never silence;
 * - a true zero is said in words, and the row still links to its list;
 * - the number is the one the linked list states for the same set, derived
 *   by the function that list derives it with. Where no such function gives
 *   one number, the door says that it is possible, in words without a number
 *   (`parlament`, below).
 *
 * The German copy of the homepage lives here too (`HOME_DE`), so a second
 * language replaces this module's strings and not the template.
 *
 * Pure module: no Nuxt auto-imports, so vitest reads it as it is.
 */
import type { AnliegenListResponse, DashboardSecondRound, EuBuergerinitiativenResponse, EuFensterResponse } from '#shared/types'
import { ANLIEGEN_PATH } from '#shared/utils/anliegen'
import { formatNumberDe } from '#shared/utils/format'
import { gapDe } from '#shared/utils/gaps'
import { anliegenOpenCount, anliegenUnreadDe } from './anliegenView'
import type { HalfState } from './draftFilters'
import { EU_ECI_LIST_DE, euEciListView } from './euEciList'
import { EU_FENSTER_DE, euFensterView } from './euFenster'
import { blockStateLine } from './lateBlocks'
import { SECOND_ROUND_WINDOW } from './spine'
import { EU_BUERGERINITIATIVEN_HREF, EU_FENSTER_HREF, WEGE_PATH, WEGE_STATE, type WegeJurisdiction } from './wege'

/* ------------------------------------------------------------------ */
/* The page's own words                                                */
/* ------------------------------------------------------------------ */

/**
 * The header and the two chapter heads. The title still leads with the
 * product name: the homepage is what a search for the name finds.
 */
export const HOME_DE = {
  title: 'Begutachtungs-Monitor · Wo Sie bei Gesetzen mitreden können',
  /** The shared preview's title: the name, then the promise. */
  ogTitle: 'Begutachtungs-Monitor – wo Sie bei Gesetzen mitreden können',
  description:
    'Wo Sie bei Gesetzen mitreden können – Begutachtungen von Bund und Ländern, Regierungsvorlagen, Anliegen an das Parlament, die EU – und was aus jedem Entwurf wurde.',
  h1: 'Wo Sie bei Gesetzen mitreden können – und was daraus wird',
  /**
   * The lede, one sentence per thought: where, who may, what follows. The
   * first is short since 16.11.2026: it named every door below one by one,
   * and the doors say that themselves a screen further down.
   */
  lede: [
    'Bei Gesetzen von Bund, Ländern und EU: wo Sie jetzt mitreden können.',
    'Eine Stellungnahme abgeben kann jede und jeder, ohne Organisation, juristische Ausbildung oder bestimmte Form.',
    'Und was danach aus jedem Entwurf wurde – Regierungsvorlage, Beschluss, Gesetzblatt –, soweit Bund und Länder es veröffentlichen.',
  ],
  actHeading: 'Jetzt mitreden',
  followHeading: 'Was daraus wurde',
  wegeLink: { label: 'Alle Wege der Gesetzgebung', href: WEGE_PATH },
} as const

/* ------------------------------------------------------------------ */
/* The doors                                                           */
/* ------------------------------------------------------------------ */

export type DoorId = 'begutachtung' | 'parlament' | 'anliegen' | 'eu-rueckmeldung' | 'eu-buergerinitiative'

export interface Door {
  id: DoorId
  /** Whose way it is: the country's (`WEGE_STATE`) or the EU's. */
  jurisdiction: WegeJurisdiction
  /** A verb phrase: what the reader can do. */
  label: string
  /** The list behind the door, which states the same count. */
  href: string
  /** One sentence under the label, where the label needs one; else null. */
  note: string | null
  /**
   * What is counted, as the subject of the page's loading and gap sentences
   * („Die offenen Fristen der Kommission werden noch geladen.").
   */
  subject: string
  /** Expanded: the door's body is a list of its own on the page, not a row. */
  expanded?: true
}

/**
 * In the order a law is made, nearest first: the country's three, then the
 * EU's two. The first is expanded — its body is the open list, the reason
 * the page exists.
 *
 * „Ein Anliegen … unterstützen oder Stellung nehmen", not „Petition oder
 * Bürgerinitiative unterstützen": the count is the list's „offen", which
 * holds the Volksbegehren too — a Stellungnahme, no Unterstützung, here
 * (decisions.md, „Anliegen an den Nationalrat") — and „offen" comes from
 * list 143, which never opens a door by itself; which of the two an item
 * takes is said on its page.
 */
export const DOORS: readonly Door[] = [
  {
    id: 'begutachtung',
    jurisdiction: WEGE_STATE,
    label: 'Stellung nehmen zu einem Entwurf',
    href: '/entwuerfe?status=open&station=begutachtung',
    note: null,
    subject: 'Die offenen Entwürfe',
    expanded: true,
  },
  {
    id: 'parlament',
    jurisdiction: WEGE_STATE,
    label: 'Stellung nehmen im Parlament',
    // The tab „Parlament / Landtag" alone (16.11.2026): the door's words and
    // the tab agree, and most of its rows stand there — every motion from
    // its Einlangen, a Vorlage once the Nationalrat has decided. The Vorlagen
    // the Nationalrat still has stand under „Regierungsvorlage"; the list
    // points there with their count (`otherStationPointerDe`). A link naming
    // both tabs was tried the same day and dropped: two tabs selected at
    // once is a state no control of the list can produce.
    href: '/entwuerfe?status=open&station=parlament',
    // The sentence of the section „Jetzt im Parlament" this row replaces:
    // where a Stellungnahme goes, never what it achieves (decisions.md, „Copy
    // about statements on a Regierungsvorlage"), and how long it is possible.
    note: `Auch zu einer Regierungsvorlage kann Stellung genommen werden – freigegebene Stellungnahmen gehen an die parlamentarischen Klubs. ${SECOND_ROUND_WINDOW}`,
    subject: 'Die Vorlagen, zu denen Stellung genommen werden kann,',
  },
  {
    id: 'anliegen',
    jurisdiction: WEGE_STATE,
    label: 'Ein Anliegen an das Parlament unterstützen oder Stellung nehmen',
    href: ANLIEGEN_PATH,
    note: 'Petitionen, Bürgerinitiativen und Volksbegehren, die der Nationalrat gerade behandelt.',
    subject: 'Die offenen Anliegen',
  },
  {
    id: 'eu-rueckmeldung',
    jurisdiction: 'eu',
    label: 'Rückmeldung an die EU-Kommission geben',
    href: EU_FENSTER_HREF,
    note: null,
    subject: 'Die offenen Fristen der Kommission',
  },
  {
    id: 'eu-buergerinitiative',
    jurisdiction: 'eu',
    label: 'Europäische Bürgerinitiative unterstützen',
    href: EU_BUERGERINITIATIVEN_HREF,
    note: null,
    subject: 'Die Initiativen in der Sammlung',
  },
]

export function homeDoorOf(id: DoorId): Door {
  const door = DOORS.find((d) => d.id === id)
  if (!door) throw new Error(`unknown door ${id}`)
  return door
}

/* ------------------------------------------------------------------ */
/* What a door says about what is open                                 */
/* ------------------------------------------------------------------ */

/**
 * A source's answer, as the door reads it: what is open in words (null
 * where its notes are all it can say — the Anliegen while a kind is
 * unread), and the notes the target list shows
 * beside the same count. `unread`: the answer came and says the source
 * could not be read — a failure, never a zero. `open`: something is open
 * behind the door today, so the row may show its status as the list's blue
 * chip („you can do something here"); a „Derzeit kein …" stays plain text.
 */
export type DoorAnswer = { text: string | null; notes: string[]; open: boolean } | 'unread'

/**
 * Where a door stands, for the row: on its way, failed (a gap sentence),
 * or answered.
 */
export type DoorStatus =
  | { kind: 'loading'; text: string }
  | { kind: 'failed'; text: string }
  | { kind: 'answered'; text: string | null; notes: string[]; open: boolean }

/** The door's gap sentence: „Gerade nicht abrufbar: die offenen Fristen der Kommission." */
export function doorFailedDe(door: Door): string {
  const subject = door.subject.replace(/,$/, '')
  return gapDe('unavailable', `${subject.charAt(0).toLowerCase()}${subject.slice(1)}.`)
}

/**
 * The row's status from the block's state (`halfState`) and the answer
 * read through the door's own function below. `off` never reaches a door:
 * every door is always asked.
 */
export function doorStatus(door: Door, state: HalfState, answer: DoorAnswer | null): DoorStatus {
  if (state === 'failed' || answer === 'unread') return { kind: 'failed', text: doorFailedDe(door) }
  if (state !== 'ready' || !answer) {
    return { kind: 'loading', text: blockStateLine(door.subject, 'plural', 'loading') ?? '' }
  }
  return { kind: 'answered', text: answer.text, notes: answer.notes, open: answer.open }
}

/**
 * Stellung nehmen im Parlament — „Derzeit möglich", NO FIGURE, where some
 * are open (16.11.2026). The list behind the door
 * (`/entwuerfe?status=open&station=parlament`) states no single number for this
 * set: its count line splits it by kind (`draftCountLabel`), a Vorlage that
 * carries a Ministerialentwurf stands there as that Ministerialentwurf, and
 * the rows at „Parlament" stand under the next tab. A figure here would be
 * one the linked page never prints. So the row says in words that a
 * Stellungnahme is possible — an empty right side read as a row still
 * loading — and the zero, the same on both sides, in words too.
 */
export function parlamentDoorAnswer(r: Pick<DashboardSecondRound, 'items'>): DoorAnswer {
  return { text: r.items.length ? 'Derzeit möglich' : 'Derzeit zu keiner Vorlage möglich', notes: [], open: r.items.length > 0 }
}

/**
 * Anliegen: the list's own „N offen" (`anliegenCountLineDe`, counted by
 * `anliegenOpenCount`), with the list's gap sentences for a kind whose list
 * did not arrive and for rows whose participation was not read. No „keines
 * offen" while either is so: an absence needs its proof.
 */
export function anliegenDoorAnswer(r: AnliegenListResponse): DoorAnswer {
  const { open, unknown, unreadKinds } = anliegenOpenCount(r)
  const notes = [
    ...anliegenUnreadDe(unreadKinds, 'alle'),
    ...(unknown ? [gapDe('unreadable', `ob Unterstützung und Stellungnahme möglich sind, bei ${formatNumberDe(unknown)} Anliegen.`)] : []),
  ]
  if (open) return { text: `${formatNumberDe(open)} offen`, notes, open: true }
  return { text: notes.length ? null : 'Derzeit kein Anliegen offen', notes, open: false }
}

/**
 * The Commission's feedback windows: the list's count line on its first tab
 * („Alle", `euFensterView`, `EU_FENSTER_DE.count`), and its note where the
 * page cap cut what was read. A portal that could not be read is a failure.
 */
export function fensterDoorAnswer(r: EuFensterResponse): DoorAnswer {
  const view = euFensterView(r)
  if (!view.tabs) return 'unread'
  const notes = view.cut ? [gapDe('outOfScope', view.cut)] : []
  return { text: view.counts.alle ? EU_FENSTER_DE.count(view.counts.alle) : 'Derzeit keine offene Frist', notes, open: view.counts.alle > 0 }
}

/** The Citizens' Initiatives in collection: the list's count line (`euEciListView`, `EU_ECI_LIST_DE.count`). */
export function eciDoorAnswer(r: EuBuergerinitiativenResponse): DoorAnswer {
  const view = euEciListView(r)
  if (!view.rows) return 'unread'
  return { text: view.rows.length ? EU_ECI_LIST_DE.count(view.rows.length) : 'Derzeit keine Initiative in der Sammlung', notes: [], open: view.rows.length > 0 }
}
