/**
 * Eine Zeile, vier Zonen — the one anatomy every list entry is rendered
 * from (docs/architecture.md §12.28).
 *
 * Until 18.09.2026 the lists carried six components for three kinds of row
 * (`DraftCard`/`DraftRow`, `RisConsultationCard`/`Row`,
 * `SecondRoundCard`/`Row`), each arranging the same handful of facts its own
 * way. Measured on `/entwuerfe?status=open`, 14 rows in one screenful: the
 * Stellungnahmen token began at x=388 on one row and x=556 on another — 168
 * px of drift, because it was the last token of a variable-length prose
 * line. A number that cannot form a column cannot be compared, and
 * comparing is the only thing a count is for.
 *
 * WHAT THIS MODULE IS: the place where each kind is mapped onto four fixed
 * zones, and — the harder half — where a zone decides what to say when the
 * kind cannot have that fact at all. Absence must read as „gibt es hier
 * nicht", never as zero and never as a defect.
 *
 * THREE THINGS KEPT APART, which the old components conflated:
 *  - **Position** follows the fact's identity. A count is in the count zone,
 *    in every section, always.
 *  - **Loudness** follows what the reader can act on. Only a running window
 *    is loud. Not the sort, not the section.
 *  - **Order** follows the sort, and nothing else.
 *
 * The section that ranks by Stellungnahmen used to promote the count into
 * the right-hand slot, where it EVICTED the station chip — and „846
 * Stellungnahmen → bisher keine Regierungsvorlage" is the accountability
 * story, not a leaderboard entry (§12.21 says so itself: what stopped that
 * section being a scoreboard were the chips). A ranked list shows its key by
 * order; the count needs alignment, not size.
 *
 * WHAT THIS DOES NOT DO — and §12.19 is still right about it: there is no
 * single row TYPE. `RisConsultation` does not grow nullable `citation`,
 * `statementCount` and `chain` fields so that one shape fits all; inventing
 * empty fields is what produces „0 Stellungnahmen" over two thirds of the
 * corpus. What is shared is the anatomy, and every absence in it is named
 * here, per kind, once.
 *
 * Pure module: no Nuxt auto-imports, so the pages, the components and vitest
 * all read the same mapping.
 */
import type {
  ClosedOutcome,
  DraftChain,
  DraftSummary,
  OpenVorlage,
  RisConsultation,
} from '../types'
import { aliasesFor } from './aliases'
import { type DeadlineTone, deadlineTone, isNewArrival } from './deadlines'
import { formatDateDe, formatDateWeekdayDe, fristLabel } from './format'
import { RIS_KIND_LABEL } from './risConsultations'

/**
 * Zone 3 — was an diesem Verfahren beteiligt wurde.
 *
 * Three states, and the third is the one the old rows got wrong. A record
 * without a Gegenstand at Parliament carries no Stellungnahmen count and
 * never will: they are filed with the Ressort, Parliament never sees them,
 * so nobody counts them (§12.16). That is `unpublished` — a permanent
 * property of the kind, not a missing value. `unavailable` is the temporary
 * one: we asked and could not read it.
 */
export type Participation =
  | { kind: 'count'; count: number }
  | { kind: 'unpublished' }
  | { kind: 'unavailable' }

/**
 * Zone 4 — wo das Verfahren steht, in zwei Zeilen: line 1 the state, line 2
 * what pins it down.
 *
 * `tone` is the deadline tone system and applies to line 1 only while a
 * window is open; every closed state is `inactive` and renders as calm text
 * — no pill, no dot, no wash. That is the change that lets a three-day
 * countdown win a screenful back from thirty yellow chips.
 */
export interface EntryState {
  /** The state itself, e.g. „Noch 3 Tage", „Kundgemacht". */
  label: string
  /** What pins it down: a date or a citation. Null → line 1 stands alone. */
  detail: string | null
  tone: DeadlineTone
  /** Something can still be filed — the one condition that may be loud. */
  actionable: boolean
}

/** The four zones, for one entry of any kind. */
export interface EntryView {
  /** Stable key for `v-for`. */
  key: string
  /** Internal route, or null when the monitor has no page for this entry. */
  to: string | null
  /** Used only when `to` is null: the parlament.gv.at page instead. */
  href: string | null
  title: string
  /** Long form for `title=`, when upstream has one. */
  titleFull: string | null
  /** Zone 2, token 1: „Ministerialentwurf 132/ME", „Verordnungsentwurf". */
  kindLabel: string
  citation: string | null
  ministry: { code: string; name: string } | null
  /** Zone 2, last token — the debate name, quoted, ink. */
  alias: string | null
  /** A procedural fact that belongs to the identity, e.g. „ohne Begutachtung". */
  note: string | null
  isNew: boolean
  participation: Participation
  state: EntryState
}

/* ------------------------------------------------------------------ *
 * Zone 4, one wording per fact
 * ------------------------------------------------------------------ */

/**
 * Der Weekday steht nur auf einem künftigen Datum.
 *
 * Man plant um eine Frist herum — dafür ist „bis Fr., 16.10.2026" da. Ein
 * vergangenes Datum wird nachgeschlagen, nicht eingeplant, und der Wochentag
 * daneben ist dann Ballast in einer Spalte, die hundert Zeilen lang ist.
 */
function openState(deadline: string | null, active: boolean): EntryState {
  return {
    label: fristLabel(deadline, active),
    detail: deadline ? `bis ${formatDateWeekdayDe(deadline)}` : null,
    tone: deadlineTone(deadline, active),
    actionable: true,
  }
}

/**
 * Das offene Fenster ohne Frist: die Regierungsvorlage im Nationalrat.
 *
 * „Stellungnahme möglich", nicht „Zweite Runde". Beide sind wahr, aber nur
 * eines davon ist das, was jemand heute tun kann — und „zweite" wäre auf
 * einer Vorlage ohne Begutachtung schlicht falsch, weil es dort keine erste
 * Runde gab. „Zweite Runde" bleibt Vokabel der Überschrift und des Filters,
 * wo sie eine MENGE benennt, nicht den Zustand einer Zeile.
 *
 * Tone `neutral`: ohne Frist gibt es nichts, was dringend werden könnte.
 */
function openVorlageState(date: string | null): EntryState {
  return {
    label: 'Stellungnahme möglich',
    detail: date ? `zur Vorlage seit ${formatDateDe(date)}` : null,
    tone: 'neutral',
    actionable: true,
  }
}

/** Frist vorbei, und dahinter ist nichts bekannt oder nichts möglich. */
function endedState(deadline: string | null, label: string): EntryState {
  return {
    label,
    detail: deadline ? `Frist endete ${formatDateDe(deadline)}` : null,
    tone: 'inactive',
    actionable: false,
  }
}

/**
 * Was aus einem Ministerialentwurf geworden ist — aus der Stationskarte
 * (`DraftChain`) oder aus dem Kettenende (`ClosedOutcome`), die dasselbe in
 * zwei Typen sagen.
 *
 * Auf einer erreichten Station trägt Zeile 2 die Fundstelle, nicht das
 * Fristende: „594 d.B." und „BGBl. I Nr. 69/2026" sind das, womit sich die
 * Aussage nachschlagen lässt, und zwei Fakten in einem Slot wären wieder
 * die Vermischung, die dieses Modul auflöst. Auf „bisher keine
 * Regierungsvorlage" gibt es keine Fundstelle — dort steht das Fristende,
 * weil die verstrichene Zeit dort die Aussage IST.
 *
 * „Bisher" überlebt jede Kürzung: es ist das Wort, das „keine
 * Regierungsvorlage" einen Stand sein lässt und kein Urteil (Framing-Regel,
 * CLAUDE.md). Abgekürzt wird hier nichts mehr — die Spalte darf umbrechen,
 * seit die Pille weg ist, und die alten Kurzformen („Bisher keine Vorlage",
 * „Im Parlament") waren nur deren `whitespace-nowrap` geschuldet.
 */
function outcomeState(
  o: { rvCitation: string | null; bgblNumber: string | null },
  deadline: string | null,
): EntryState {
  if (o.bgblNumber) {
    return {
      label: 'Kundgemacht',
      detail: o.bgblNumber.replace(/^Bundesgesetzblatt\b/, 'BGBl.'),
      tone: 'inactive',
      actionable: false,
    }
  }
  if (o.rvCitation) {
    return {
      label: 'Regierungsvorlage liegt vor',
      detail: o.rvCitation,
      tone: 'inactive',
      actionable: false,
    }
  }
  return endedState(deadline, 'Bisher keine Regierungsvorlage')
}

/** The chain's state, including the one case where it is still actionable. */
function chainState(chain: DraftChain, deadline: string | null): EntryState {
  if (chain.filingOpen) return openVorlageState(chain.rvDate)
  if (chain.station === 'parlament') {
    return { label: 'Im Parlament behandelt', detail: chain.rvCitation, tone: 'inactive', actionable: false }
  }
  return outcomeState(chain, deadline)
}

/* ------------------------------------------------------------------ *
 * The three adapters
 * ------------------------------------------------------------------ */

/**
 * Ministerialentwurf — mit oder ohne gelesene Station.
 *
 * `outcome` ist der Weg der Startseite: dort kommen die Zeilen aus
 * `/api/dashboard` und ihr Ausgang aus einem zweiten, teureren Endpunkt, der
 * fehlen darf. Fehlt er auf einer abgeschlossenen Zeile, sagt die Spalte
 * „Begutachtung abgeschlossen" — der letzte Stand, den wir BELEGEN können —
 * und nicht „bisher keine Regierungsvorlage", was eine Behauptung wäre, die
 * wir nicht geprüft haben.
 */
export function viewOfDraft(
  draft: DraftSummary,
  outcome?: { rvCitation: string | null; bgblNumber: string | null } | null,
): EntryView {
  const state = draft.active
    ? openState(draft.deadline, true)
    : outcome
      ? outcomeState(outcome, draft.deadline)
      : draft.chain
        ? chainState(draft.chain, draft.deadline)
        : endedState(draft.deadline, 'Begutachtung abgeschlossen')

  return {
    key: `me-${draft.gp}-${draft.inr}`,
    to: `/entwuerfe/${draft.gp}/${draft.inr}`,
    href: null,
    title: draft.title,
    titleFull: draft.title,
    kindLabel: 'Ministerialentwurf',
    citation: draft.citation,
    ministry: { code: draft.ministryCode, name: draft.ministryName },
    alias: aliasesFor(draft.gp, draft.inr)[0] ?? null,
    note: null,
    isNew: isNewArrival(draft.arrivedAt, draft.active),
    participation: { kind: 'count', count: draft.statementCount },
    state,
  }
}

/** The homepage's two accountability sections ship rows of this shape. */
export function viewOfOutcome(outcome: ClosedOutcome): EntryView {
  return viewOfDraft(outcome, outcome)
}

/**
 * Verordnungsentwurf und andere Sätze ohne Gegenstand im Parlament.
 *
 * Zwei Absenzen, beide dauerhaft und beide hier benannt statt leer gelassen:
 *
 *  - **Zone 3 sagt „ans Ministerium"**, nie eine Zahl. Bis 18.09.2026 stand
 *    „Stellungnahmen nicht veröffentlicht" in der Zeile, und das liest sich
 *    neben einer laufenden Frist als „noch nicht" — als würde nachgereicht,
 *    was nie erscheinen wird. „ans Ministerium" ist stattdessen habituell
 *    wahr, in beiden Zuständen gleich, sagt einer Einreicherin, wohin ihre
 *    Stellungnahme geht, und enthält KEINE Ziffer: das Auge, das die
 *    Zahlenspalte abfährt, überspringt die Zeile, was genau richtig ist —
 *    sie nimmt an dem Vergleich nicht teil.
 *  - **Zone 4 endet mit der Begutachtung.** Ohne Gegenstand im Parlament
 *    gibt es keine Regierungsvorlage, und „Begutachtung abgeschlossen" ist
 *    hier die WAHRE Endstation, keine fehlende. Über den Korpus steht sie
 *    auf ~200 Zeilen gleich, was für sich genommen Deko wäre; in der Liste
 *    stehen diese Zeilen aber zwischen Entwürfen, die etwas anderes sagen,
 *    und die leere Zelle wäre die einzige Variante, die als Defekt gelesen
 *    würde.
 */
export function viewOfRis(c: RisConsultation): EntryView {
  return {
    key: `ris-${c.id}`,
    to: `/entwuerfe/${c.id}`,
    href: null,
    title: c.title,
    titleFull: c.longTitle ?? c.title,
    kindLabel: RIS_KIND_LABEL[c.kind],
    citation: null,
    ministry: c.ministryCode ? { code: c.ministryCode, name: c.ministryName ?? c.ministryCode } : null,
    alias: null,
    note: null,
    isNew: isNewArrival(c.startedAt, c.active),
    participation: { kind: 'unpublished' },
    /**
     * Zone 4 endet NICHT mehr zwangsläufig mit der Begutachtung.
     *
     * Bis 19.09.2026 stand hier auf jeder abgeschlossenen Zeile
     * „Begutachtung abgeschlossen" — mit der Begründung, ohne Gegenstand im
     * Parlament sei das die wahre Endstation. Das stimmte, solange niemand
     * das Bundesgesetzblatt las. Jetzt gibt es die Kundmachung (§12.32),
     * und damit gilt für diese Zeilen dieselbe Regel wie für die
     * Ministerialentwürfe nebenan: erreichte Station oben, Fundstelle
     * darunter.
     *
     * NUR der belegte Ausgang wandert hierher. `ausstehend` und `keine`
     * bleiben „Begutachtung abgeschlossen": Eine Spalte, die über zwei
     * Drittel des Korpus „bisher nicht kundgemacht" schreibt, wäre ein
     * Vorwurf in Serie — und bei 84,2 % Trefferquote in jedem zwölften Fall
     * ein falscher. Was wir NICHT gefunden haben, sagt die Detailseite in
     * einem ganzen Satz, nicht die Spalte in zwei Wörtern.
     */
    state: c.active
      ? openState(c.deadline, true)
      : c.outcome?.state === 'kundgemacht' && c.outcome.nummer
        ? { label: 'Kundgemacht', detail: c.outcome.nummer, tone: 'inactive', actionable: false }
        : endedState(c.deadline, 'Begutachtung abgeschlossen'),
  }
}

/**
 * Eine Regierungsvorlage, zu der es nie eine Begutachtung gab.
 *
 * Kein Ressort in den Daten, keine Frist von Natur aus — das Fenster
 * schließt mit der Abstimmung. Die fehlende Frist ist deshalb kein Loch,
 * sondern ein anderer Zustand, und Zone 4 sagt ihn aus: „Stellungnahme
 * möglich" über dem Datum des Einlangens.
 *
 * Zwei Ziele, wie vorher: eine Vorlage aus einer Begutachtung zeigt auf die
 * eigene Seite, eine ohne hat hier keine und zeigt ans Parlament — als
 * Verfahrensfakt benannt, nie als Vorwurf (Framing-Regel).
 *
 * Die Notiz hängt aber NICHT am Ziel, sondern am Belegten: „ohne
 * Begutachtung" steht nur auf `none`, also wenn auch die Gegenprobe gegen
 * Liste 81 keinen vorausgehenden Entwurf fand. Auf `unknown` — kein Zeiger,
 * aber ein plausibler Entwurf — verlinkt die Zeile genauso nach außen und
 * sagt dazu nichts. Bis 18.09.2026 waren beides dieselbe Zeile, und der
 * fehlende Zeiger allein trug den Satz (`shared/types.ts`, `OpenVorlage`).
 */
export function viewOfVorlage(v: OpenVorlage): EntryView {
  const c = v.consultation
  return {
    key: `rv-${v.citation}`,
    to: c.kind === 'draft' ? `/entwuerfe/${c.gp}/${c.inr}` : null,
    href: c.kind === 'draft' ? null : v.parliamentUrl,
    title: v.title,
    titleFull: v.title,
    kindLabel: 'Regierungsvorlage',
    citation: v.citation,
    ministry: null,
    alias: null,
    note: c.kind === 'none' ? 'ohne Begutachtung' : null,
    isNew: false,
    participation:
      v.statementCount === null ? { kind: 'unavailable' } : { kind: 'count', count: v.statementCount },
    state: openVorlageState(v.date || null),
  }
}
