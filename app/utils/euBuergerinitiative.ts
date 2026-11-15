/**
 * The page of one European Citizens' Initiative (step 5 of the EU cycle,
 * 15.11.2026), as words: `/eu-recht/buergerinitiative/2022/2`, by its
 * register number ECI(2022)000002.
 *
 * AN OBJECT OF ITS OWN, WITH A RAIL OF ITS OWN (maintainer's decision 4 of
 * 14.11.2026): no field of the register joins an initiative to a legal act,
 * so it is no station of an act and its page links none.
 *
 * THE SIBLINGS' GRAMMAR. The state card (`ProcedureCard`) naming the state, the
 * rail (`EuRail`), the door under the card while one can sign, a section per
 * REACHED station (`EuStationSection`), with the act page's builders
 * (`fact`, `framed`). The door stands once more at the end of „Sammlung"
 * (`EuRailSection.door`). It carries one sentence, that the link leads to
 * the initiative's collection system — sometimes the organisers' own site,
 * which the button cannot say — and NO QUOTE: unlike the Commission's
 * portal (`euFeedbackQuote.ts`), no sentence of the register on what a
 * signature brings was read.
 *
 * THE STATIONS, read from the register's `progress` — an unordered list of
 * `{ name, active, date, footnoteType }` whose active entry equals the
 * status. Its vocabulary, measured over 28 initiatives on 15.11.2026 (all
 * ten names that occurred, with how many initiatives carry each):
 *
 *   REGISTERED 28 · ONGOING 18 · COLLECTION_START_DATE 14 · CLOSED 10
 *   (footnote COLLECTION_EARLY_CLOSURE on 2) · VERIFICATION 7 · SUBMITTED 5
 *   · ANSWERED 4 · WITHDRAWN 3 · INSUFFICIENT_SUPPORT 3 ·
 *   INSUFFICIENT_SUPPORT_AFTER_VERIFICATION 2.
 *
 * The rail, in time order:
 *
 *   „Registrierung"           REGISTERED (and `registrationDate`) — every
 *                             initiative of the register is registered;
 *   „Sammlung"                begun with ONGOING, CLOSED or any later step;
 *                             its days from `startCollectionDate`,
 *                             COLLECTION_START_DATE or ONGOING, the end from
 *                             CLOSED / `earlyClosureDate`, or the `deadline`
 *                             while it runs; „vorzeitig beendet" where the
 *                             register marks the early closure;
 *   „Prüfung"                 VERIFICATION — the Member States check the
 *                             statements of support;
 *   „Einreichung"             SUBMITTED;
 *   „Antwort der Kommission"  ANSWERED, or an `answer`.
 *
 * A later step implies the earlier ones (an answered initiative was
 * collected, checked and handed in, whatever entries the register kept).
 * An initiative that ended otherwise ends on a station of its own, which
 * carries the highlight, and the stations it can never reach are not drawn —
 * as „Zurückgezogen" ends a withdrawn proposal: „Zurückgezogen" (WITHDRAWN)
 * and „Nicht genug Unterstützungen" (INSUFFICIENT_SUPPORT and
 * INSUFFICIENT_SUPPORT_AFTER_VERIFICATION), each with the register's day and
 * worded as the register's statement, „laut Register", without a judgement.
 * Stations not reached are ahead (hollow) and have no section; the first one
 * may carry one line. A step name outside the ten is shown nowhere as a
 * station, and the page says in a „Nicht im Monitor" sentence that the
 * register lists a step the monitor does not know.
 *
 * NO THRESHOLD. The register's answers carry the total and the count per
 * Member State, never how many each Member State needs nor whether it was
 * reached. The page shows the total and the Member State's own number
 * (`EU_MEMBER_STATE_ECI`, the view's `memberState`; none on a page that serves
 * no country), and says once that it shows no threshold.
 *
 * NOTHING OF THE ORGANISERS: no name, no funder, no logo, none of their
 * texts — the reader does not take them (`parseEciDetails`); the page links
 * the register for the objectives.
 *
 * All German copy of the page lives here. Pure: no Vue.
 */
import type { EciAnswerLink, EciInitiative, EciProgressStep, EciSupport } from '#shared/types'
import { EU_MEMBER_STATE_ECI, EU_MEMBER_STATE_NAME_DE } from '#shared/utils/eu'
import { formatDateDe, formatNumberDe } from '#shared/utils/format'
import { gapDe } from '#shared/utils/gaps'
import { doorOf, type EuWindowActionView } from './euInitiative'
import { anchorOf, elementIdOf, fact, framed, type EuRailSection, type EuRailStation, type EuRailStationId, type EuSectionFact } from './euRail'

/** The ten step names measured on 15.11.2026 (see the head). Any other is shown nowhere as a station. */
export const ECI_KNOWN_STEPS: ReadonlySet<string> = new Set([
  'REGISTERED', 'COLLECTION_START_DATE', 'ONGOING', 'CLOSED', 'VERIFICATION',
  'SUBMITTED', 'ANSWERED', 'WITHDRAWN', 'INSUFFICIENT_SUPPORT', 'INSUFFICIENT_SUPPORT_AFTER_VERIFICATION',
])

const INSUFFICIENT = new Set(['INSUFFICIENT_SUPPORT', 'INSUFFICIENT_SUPPORT_AFTER_VERIFICATION'])

const CREDIT = 'Europäische Kommission, Register der Europäischen Bürgerinitiative'

const DE = {
  identity: 'Europäische Bürgerinitiative',
  heading: 'Die Initiative im Verfahren',
  untitled: (reference: string) => `Europäische Bürgerinitiative ${reference}`,
  originalTitle: 'Das Register führt den Titel nicht auf Deutsch; er steht hier in der Originalsprache.',
  source: 'Im Register der Europäischen Bürgerinitiative ansehen',
  name: {
    registrierung: 'Registrierung',
    sammlung: 'Sammlung',
    pruefung: 'Prüfung',
    einreichung: 'Einreichung',
    antwort: 'Antwort der Kommission',
    ruecknahme: 'Zurückgezogen',
    unterstuetzung: 'Nicht genug Unterstützungen',
  },
  // The card's heading: a state, no day (the days stand in the rail).
  status: {
    REGISTERED: 'Registriert',
    ONGOING: 'Sammlung läuft',
    CLOSED: 'Sammlung beendet',
    VERIFICATION: 'In Prüfung',
    SUBMITTED: 'Eingereicht',
    ANSWERED: 'Von der Kommission beantwortet',
    WITHDRAWN: 'Zurückgezogen',
    INSUFFICIENT: 'Nicht genug Unterstützungen laut Register',
  },
  undated: 'ohne Datum im Register',
  since: (d: string) => `seit ${d}`,
  until: (d: string) => `bis ${d}`,
  begun: (d: string) => `begonnen am ${d}`,
  ended: (d: string) => `beendet am ${d}`,
  early: 'vorzeitig beendet',
  byRegister: (d: string) => `laut Register am ${d}`,
  byRegisterUndated: 'laut Register, ohne Datum',
  ahead: {
    startsOn: (d: string) => `beginnt laut Register am ${d}`,
    noStart: 'Das Register nennt noch keinen Beginn der Sammlung.',
    verification: 'Nach der Sammlung prüfen die Mitgliedstaaten die Unterstützungsbekundungen.',
    // Art. 15 Abs. 2 Verordnung (EU) 2019/788, as `/wege` names the duty.
    answer: 'Binnen sechs Monaten antwortet die Kommission mit Gründen.',
  },
  fact: {
    registered: 'Registriert',
    decision: 'Beschluss der Kommission',
    decisionLink: 'Registrierung auf EUR-Lex',
    objectives: 'Ziele der Initiative',
    objectivesLink: 'im Register',
    start: 'Beginn',
    end: 'Ende',
    collected: 'Unterstützungen laut Register',
    asOf: (d: string) => `Stand ${d}`,
    memberState: `davon aus ${EU_MEMBER_STATE_NAME_DE}`,
    verification: 'Prüfung durch die Mitgliedstaaten',
    submitted: 'Eingereicht',
    submittedCount: 'Unterstützungen bei der Einreichung',
    answer: 'Antwort der Kommission',
    documents: 'Dokumente',
    withdrawn: 'Zurückgezogen',
    insufficient: 'Nicht genug Unterstützungen',
  },
  // Our translations of the register's three kinds of link.
  answerLink: {
    COMMUNICATION: 'Mitteilung der Kommission',
    PRESS_RELEASE: 'Pressemitteilung',
    FOLLOW_UP: 'Folgemaßnahmen',
  } as Readonly<Record<EciAnswerLink['kind'], string>>,
  language: { EN: 'englisch', FR: 'französisch' } as Readonly<Record<string, string>>,
  notes: {
    objectives: 'Ziele und Anhang einer Initiative sind Texte ihrer Organisatorinnen und Organisatoren. Der Monitor übernimmt sie nicht und verlinkt das Register.',
    threshold: gapDe('outOfScope', 'Wie viele Unterstützungen ein Mitgliedstaat braucht und ob diese Zahl erreicht ist, steht nicht in den Antworten des Registers; der Monitor zeigt daher keine Schwelle.'),
    noCount: gapDe('notPublished', 'Eine Zahl der Unterstützungen nennt das Register zu dieser Sammlung nicht.'),
    noCountSubmitted: gapDe('notPublished', 'Eine laufende Zahl der Unterstützungen nennt das Register zu dieser Sammlung nicht; die bei der Einreichung gezählten stehen unter „Einreichung“.'),
    noMemberState: gapDe('notPublished', `Eine Zahl für ${EU_MEMBER_STATE_NAME_DE} nennt das Register hier nicht.`),
    noAnswerLinks: gapDe('notPublished', 'Die Dokumente der Antwort nennt das Register nicht.'),
  },
  unknownSteps: (steps: string[]) => gapDe('outOfScope', steps.length === 1
    ? `Das Register verzeichnet einen Schritt, den der Monitor nicht kennt: ${steps[0]}.`
    : `Das Register verzeichnet Schritte, die der Monitor nicht kennt: ${steps.join(', ')}.`),
  action: {
    label: 'Bürgerinitiative unterstützen',
    openNoEnd: 'Unterstützung möglich',
    // The one sentence under the heading: what the button cannot say. The day is the heading's.
    note: 'Der Link führt zum Sammelsystem der Initiative.',
    noLink: gapDe('notPublished', 'Das Register nennt für diese Initiative keinen Link, über den sie unterstützt werden kann.'),
  },
  unread: 'Die Initiative konnte nicht gelesen werden: Das Register der Europäischen Bürgerinitiative hat nicht rechtzeitig oder nicht lesbar geantwortet.',
  unreadLink: 'Die Initiative im Register ansehen',
  unknown: (reference: string) => `Im Register der Europäischen Bürgerinitiative gibt es keine Initiative ${reference}.`,
  unknownDescription: 'Das Register hat auf die Frage nach dieser Nummer geantwortet, dass es sie nicht kennt.',
  back: 'Alle Bürgerinitiativen in der Sammlung',
  loading: 'Bürgerinitiative wird geladen …',
  seo: {
    fallbackTitle: 'Europäische Bürgerinitiative',
    description: (reference: string, status: string) => `Europäische Bürgerinitiative ${reference}: ${status}. Registrierung, Sammlung, Prüfung, Einreichung und Antwort der Kommission, Station für Station, laut Register.`,
    fallbackDescription: 'Eine Europäische Bürgerinitiative: Registrierung, Sammlung, Prüfung, Einreichung und Antwort der Kommission, laut Register.',
  },
  credits: ['Quelle:', CREDIT] as string[],
} as const

export const EU_BUERGERINITIATIVE_DE = DE

export interface EuBuergerinitiativeView {
  title: string
  /** The note where only the original-language title exists; null otherwise. */
  titleNote: string | null
  /** „Europäische Bürgerinitiative · ECI(2026)000009". */
  identity: string
  /** The card's heading: the state. */
  status: string
  /** The door card under the state card: only while the collection runs. */
  action: EuWindowActionView | null
  heading: string
  stations: EuRailStation[]
  sections: EuRailSection[]
  /** The gap sentence on steps the monitor does not know, under the rail; null where there are none. */
  unknownSteps: string | null
  registerUrl: string
}

/** The step of this name with a day where one has a day, else the first of the name; null where none. */
function stepOf(progress: readonly EciProgressStep[], name: string): EciProgressStep | null {
  const all = progress.filter((p) => p.name === name)
  return all.find((p) => p.date !== null) ?? all[0] ?? null
}

const day = (iso: string | null): string => (iso ? formatDateDe(iso) : DE.undated)

const station = (id: EuRailStationId, name: string, facts: string[], gap: string | null = null, ahead = false): EuRailStation =>
  ({ id, name, current: false, facts, gap, anchor: anchorOf(id), ...(ahead ? { ahead: true } : {}) })

const section = (st: EuRailStation, facts: EuSectionFact[], notes: string[] = []): EuRailSection =>
  ({ id: st.id, elementId: elementIdOf(st.id), heading: st.name, record: null, credits: [...DE.credits], ...framed(facts, null, notes) })

/** „1.502.319", „Stand 15.11.2026" — the parts of a count's fact. */
function countFacts(key: string, title: string, support: EciSupport, asOf: string | null, memberState: string | null): EuSectionFact[] {
  const own = ownCount(support, memberState)
  return [
    ...(support.total !== null ? [fact(key, title, [formatNumberDe(support.total), ...(asOf ? [DE.fact.asOf(formatDateDe(asOf))] : [])])] : []),
    ...(own !== null ? [fact(`${key}-mitgliedstaat`, DE.fact.memberState, [formatNumberDe(own)])] : []),
  ]
}

/** The count of the country the page serves; null where the page serves none, or the register lists no entry for it. */
const ownCount = (support: EciSupport | null | undefined, memberState: string | null): number | null =>
  (support && memberState ? support.byCountry[memberState] ?? null : null)

const linkLabel = (l: EciAnswerLink) => {
  const words = DE.answerLink[l.kind]
  if (l.language === 'DE') return words
  return `${words} (${(l.language && DE.language[l.language]) ?? 'nicht auf Deutsch'})`
}

function statusOf(i: EciInitiative, deadlinePassed: boolean): string {
  if (INSUFFICIENT.has(i.status)) return DE.status.INSUFFICIENT
  if (i.status === 'ONGOING') return deadlinePassed ? DE.status.CLOSED : DE.status.ONGOING
  return (DE.status as Record<string, string>)[i.status] ?? DE.heading
}

/**
 * The page of one initiative as words. `today` (ISO, Vienna) decides
 * whether the collection still runs — the register's status alone may be a
 * day old in the cache, and its deadline is the last day.
 */
/**
 * `memberState`: the register's code of the country the page serves — its
 * count stands beside the total. Null on a page that serves no country:
 * then no country's count is shown and none is said to be missing.
 */
export function euBuergerinitiativeView(i: EciInitiative, today: string, memberState: string | null = EU_MEMBER_STATE_ECI): EuBuergerinitiativeView {
  const step = (name: string) => stepOf(i.progress, name)
  const has = (name: string) => step(name) !== null

  const withdrawnStep = step('WITHDRAWN')
  const withdrawn = i.status === 'WITHDRAWN' || withdrawnStep !== null
  const insufficientStep = step('INSUFFICIENT_SUPPORT_AFTER_VERIFICATION') ?? step('INSUFFICIENT_SUPPORT')
  const insufficient = !withdrawn && (INSUFFICIENT.has(i.status) || insufficientStep !== null)

  // A later step implies the earlier ones.
  const answered = has('ANSWERED') || i.answer !== null
  const submitted = answered || has('SUBMITTED')
  const verified = submitted || has('VERIFICATION')
  const start = i.collectionStart ?? step('COLLECTION_START_DATE')?.date ?? step('ONGOING')?.date ?? null
  const closed = step('CLOSED')
  const withdrawnOn = withdrawnStep?.date ?? null
  // Withdrawn after a start day without a recorded ONGOING: begun only where the start lies before the withdrawal.
  const begunBeforeWithdrawal = withdrawn && start !== null && withdrawnOn !== null && start <= withdrawnOn
  const collected = verified || insufficient || has('ONGOING') || closed !== null || begunBeforeWithdrawal

  const deadlinePassed = i.deadline !== null && i.deadline < today
  const running = i.status === 'ONGOING' && !deadlinePassed && !withdrawn && !insufficient
  const early = closed?.earlyClosure === true || i.earlyClosure !== null
  const endDay = closed?.date ?? i.earlyClosure ?? (deadlinePassed ? i.deadline : null)

  const stations: EuRailStation[] = []
  const sections: EuRailSection[] = []
  let countsShown = false
  const thresholdOnce = (): string[] => {
    if (countsShown) return []
    countsShown = true
    return [DE.notes.threshold]
  }

  // „Registrierung": always reached.
  const registered = i.registered ?? step('REGISTERED')?.date ?? null
  const reg = station('registrierung', DE.name.registrierung, [day(registered)])
  stations.push(reg)
  sections.push(section(reg, [
    fact('registriert', DE.fact.registered, [day(registered)]),
    ...(i.registrationDecisionUrl ? [fact('beschluss', DE.fact.decision, [{ href: i.registrationDecisionUrl, label: DE.fact.decisionLink }])] : []),
    fact('ziele', DE.fact.objectives, [{ href: i.registerUrl, label: DE.fact.objectivesLink }]),
  ], [DE.notes.objectives]))

  // „Sammlung".
  if (collected) {
    const railFacts = running
      ? [...(start ? [DE.since(formatDateDe(start))] : []), ...(i.deadline ? [DE.until(formatDateDe(i.deadline))] : [])]
      : [...(start ? [DE.begun(formatDateDe(start))] : []), ...(endDay ? [DE.ended(formatDateDe(endDay))] : []), ...(early ? [DE.early] : [])]
    const st = station('sammlung', DE.name.sammlung, railFacts.length ? railFacts : [DE.undated])
    stations.push(st)
    const endParts = running
      ? (i.deadline ? [DE.until(formatDateDe(i.deadline))] : [])
      : [...(endDay ? [DE.ended(formatDateDe(endDay))] : []), ...(early ? [DE.early] : [])]
    const counts = i.collected ? countFacts('unterstuetzungen', DE.fact.collected, i.collected, i.collected.asOf, memberState) : []
    const notes = counts.length
      ? [...(memberState && ownCount(i.collected, memberState) === null ? [DE.notes.noMemberState] : []), ...thresholdOnce()]
      : [i.submitted ? DE.notes.noCountSubmitted : DE.notes.noCount]
    sections.push(section(st, [
      ...(start ? [fact('beginn', DE.fact.start, [formatDateDe(start)])] : []),
      ...(endParts.length ? [fact('ende', DE.fact.end, endParts)] : []),
      ...counts,
    ], notes))
  }

  if (withdrawn) {
    // Ends here: the later stations are never reached and are not drawn.
    const d = withdrawnOn ? DE.byRegister(formatDateDe(withdrawnOn)) : DE.byRegisterUndated
    const st = station('ruecknahme', DE.name.ruecknahme, [d])
    stations.push(st)
    sections.push(section(st, [fact('zurueckgezogen', DE.fact.withdrawn, [d])]))
  } else if (insufficient) {
    if (has('VERIFICATION')) {
      const v = step('VERIFICATION')!
      const st = station('pruefung', DE.name.pruefung, [day(v.date)])
      stations.push(st)
      sections.push(section(st, [fact('pruefung', DE.fact.verification, [v.date ? DE.begun(formatDateDe(v.date)) : DE.byRegisterUndated])]))
    }
    const d = insufficientStep?.date ? DE.byRegister(formatDateDe(insufficientStep.date)) : DE.byRegisterUndated
    const st = station('unterstuetzung', DE.name.unterstuetzung, [d])
    stations.push(st)
    sections.push(section(st, [fact('zu-wenig', DE.fact.insufficient, [d])]))
  } else {
    // The ordinary track: what is not reached stands ahead, hollow, without a section; the first one ahead may say one thing.
    let firstAhead = true
    const ahead = (id: EuRailStationId, name: string, line: string | null) => {
      stations.push(station(id, name, [], firstAhead ? line : null, true))
      firstAhead = false
    }
    if (!collected) ahead('sammlung', DE.name.sammlung, start ? DE.ahead.startsOn(formatDateDe(start)) : DE.ahead.noStart)

    if (verified) {
      const v = step('VERIFICATION')
      const st = station('pruefung', DE.name.pruefung, [day(v?.date ?? null)])
      stations.push(st)
      sections.push(section(st, [fact('pruefung', DE.fact.verification, [v?.date ? DE.begun(formatDateDe(v.date)) : DE.byRegisterUndated])]))
    } else {
      ahead('pruefung', DE.name.pruefung, collected ? DE.ahead.verification : null)
    }

    if (submitted) {
      const s = step('SUBMITTED')
      const st = station('einreichung', DE.name.einreichung, [day(s?.date ?? null)])
      stations.push(st)
      const counts = i.submitted ? countFacts('eingereicht-zahl', DE.fact.submittedCount, i.submitted, null, memberState) : []
      sections.push(section(st, [
        fact('eingereicht', DE.fact.submitted, [day(s?.date ?? null)]),
        ...counts,
      ], counts.length ? [...(memberState && ownCount(i.submitted, memberState) === null ? [DE.notes.noMemberState] : []), ...thresholdOnce()] : []))
    } else {
      ahead('einreichung', DE.name.einreichung, null)
    }

    if (answered) {
      const a = step('ANSWERED')
      const date = i.answer?.date ?? a?.date ?? null
      const st = station('antwort', DE.name.antwort, [day(date)])
      stations.push(st)
      const links = i.answer?.links ?? []
      sections.push(section(st, [
        fact('antwort', DE.fact.answer, [day(date)]),
        ...(links.length ? [fact('dokumente', DE.fact.documents, links.map((l) => ({ href: l.url, label: linkLabel(l) })))] : []),
      ], links.length ? [] : [DE.notes.noAnswerLinks]))
    } else {
      ahead('antwort', DE.name.antwort, submitted ? DE.ahead.answer : null)
    }
  }

  // The highlight: the last station reached that shows something.
  const reached = stations.filter((s) => !s.ahead)
  const current = [...reached].reverse().find((s) => s.facts.length > 0) ?? reached[reached.length - 1] ?? stations[0]!
  current.current = true

  const unknown = i.progress.filter((p) => !ECI_KNOWN_STEPS.has(p.name)).map((p) => (p.date ? `„${p.name}“ (${formatDateDe(p.date)})` : `„${p.name}“`))

  const end = running ? i.deadline : null
  const action: EuWindowActionView | null = running
    ? {
        end,
        heading: end ? null : DE.action.openNoEnd,
        href: i.supportLink,
        label: DE.action.label,
        note: i.supportLink ? DE.action.note : null,
        quote: null,
        gap: i.supportLink ? null : DE.action.noLink,
      }
    : null
  // The door again, at the end of „Sammlung", where one decides to sign.
  const door = doorOf(action)
  const sammlung = sections.find((sec) => sec.id === 'sammlung')
  if (door && sammlung) sammlung.door = door
  return {
    title: i.title ?? DE.untitled(i.reference),
    titleNote: i.title && !i.titleIsGerman ? DE.originalTitle : null,
    identity: `${DE.identity} · ${i.reference}`,
    status: statusOf(i, deadlinePassed),
    action,
    heading: DE.heading,
    stations,
    sections,
    unknownSteps: unknown.length ? DE.unknownSteps([...new Set(unknown)]) : null,
    registerUrl: i.registerUrl,
  }
}
