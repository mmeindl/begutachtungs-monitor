/**
 * Identity of an Anliegen (`AnliegenRoot`) — the path, Parliament's address,
 * the citation and the cache key, in one place, as `procedureRoot.ts` holds
 * them for a draft.
 *
 * The German copy of the kinds lives here and nowhere in a page, so a second
 * language replaces this module's strings and not a template.
 *
 * Pure module: no Nuxt auto-imports, so both runtimes and vitest read it.
 */
import type { AnliegenCourse, AnliegenItemType, AnliegenKind, AnliegenRoot, AnliegenState } from '../types'
import { GP_RE, gpWindow, intToRoman, parseInr, romanToInt } from './gp'

/** The section's address; every path of the object starts here. */
export const ANLIEGEN_PATH = '/anliegen'

/**
 * The section's name, wherever a page names the SECTION (list heading,
 * homepage block, footer, /wege, /datenlage, statistics, refusals, meta) —
 * one place to change it. „Anliegen an das Parlament" until 15.11.2026: with
 * the Petitionen an den Bundesrat in it, that name was false. Sentences about
 * the Nationalrat itself keep saying „Nationalrat".
 */
export const ANLIEGEN_SECTION_DE = 'Anliegen an das Parlament'

/** Every kind; the order of the list's tabs. */
export const ANLIEGEN_KINDS: readonly AnliegenKind[] = ['petition', 'buergerinitiative', 'volksbegehren', 'petition-bundesrat']

/** The kinds of the Nationalrat, read per Gesetzgebungsperiode. */
export const ANLIEGEN_NR_KINDS: readonly AnliegenKind[] = ['petition', 'buergerinitiative', 'volksbegehren']

/**
 * The path segment that stands for a period where an item has none: the
 * Bundesrat has no Gesetzgebungsperioden, and Parliament files a Petition an
 * den Bundesrat under „BR" (`/gegenstand/BR/PET-BR/56`).
 */
export const BUNDESRAT_SEGMENT = 'BR'

/** Whether the kind belongs to the Bundesrat, which has no periods. */
export function anliegenIsBundesrat(kind: AnliegenKind): boolean {
  return kind === 'petition-bundesrat'
}

/**
 * Whether an item arrived within a period's days (`gpWindow`, both ends
 * inclusive) — where a Petition an den Bundesrat, which has no period,
 * stands under „Alle" of a period's list. The page filters its rows by it
 * (`bundesratRowsInPeriod`) and the server reads those records first
 * (`getAnliegenRows`). No date, or a period the calendar does not reach: not
 * within.
 */
export function anliegenArrivedInGp(arrivedAt: string | null, gp: string): boolean {
  const w = gpWindow(gp)
  return w !== null && arrivedAt !== null && arrivedAt >= w.from && (w.to === null || arrivedAt <= w.to)
}

/**
 * The oldest period the list offers. The reader is measured on GP XXII to
 * XXVIII (`pnpm corpus:anliegen -- --gp …`, 15.11.2026: 1,100 Petitionen and
 * Bürgerinitiativen, one stage unread in XXII and one in XXV, 20 items of
 * XXII–XXIV read by hand against the record); an older period's list would
 * say states nobody checked. A page of an older item still answers (its
 * address is Parliament's).
 *
 * It equals `VOLKSBEGEHREN_FIRST_GP` (server/utils/parliament/anliegen.ts)
 * by measurement, not by definition: that one is where a Volksbegehren's
 * record starts to carry its course, this one where the reader was checked
 * over the Petitionen and Bürgerinitiativen. Two constants, so that moving
 * one does not move the other.
 */
export const ANLIEGEN_FIRST_LIST_GP = 'XXII'

/** The periods the list offers, newest first: the running one down to `ANLIEGEN_FIRST_LIST_GP`. */
export function anliegenListGps(currentGp: string): string[] {
  const first = romanToInt(ANLIEGEN_FIRST_LIST_GP)
  const current = romanToInt(currentGp)
  if (first === null || current === null || current < first) return [ANLIEGEN_FIRST_LIST_GP]
  const out: string[] = []
  for (let n = current; n >= first; n--) out.push(intToRoman(n))
  return out
}

/** `?gp=` → a period the list offers, or '' (the running one) for anything else. */
export function anliegenListGpOf(raw: unknown, currentGp: string | null): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v !== 'string' || !GP_RE.test(v)) return ''
  if (!currentGp) return romanToInt(v)! >= romanToInt(ANLIEGEN_FIRST_LIST_GP)! ? v : ''
  return anliegenListGps(currentGp).includes(v) ? v : ''
}

const ITEM_TYPE: Readonly<Record<AnliegenKind, AnliegenItemType>> = {
  petition: 'PET',
  buergerinitiative: 'BI',
  volksbegehren: 'I',
  'petition-bundesrat': 'PET-BR',
}

/** Singular and plural, as Parliament names them. */
export const ANLIEGEN_KIND_LABEL: Readonly<Record<AnliegenKind, { one: string; many: string }>> = {
  petition: { one: 'Petition', many: 'Petitionen' },
  buergerinitiative: { one: 'Bürgerinitiative', many: 'Bürgerinitiativen' },
  volksbegehren: { one: 'Volksbegehren', many: 'Volksbegehren' },
  'petition-bundesrat': { one: 'Petition an den Bundesrat', many: 'Petitionen an den Bundesrat' },
}

/** `petition` → `PET`, `volksbegehren` → `I`. */
export function anliegenItemType(kind: AnliegenKind): AnliegenItemType {
  return ITEM_TYPE[kind]
}

/** A path segment's kind — the segment is the kind's own name; null for anything else. */
export function anliegenKindOfSegment(segment: string): AnliegenKind | null {
  return (ANLIEGEN_KINDS as readonly string[]).includes(segment) ? (segment as AnliegenKind) : null
}

/**
 * The kind of one of Parliament's items, from its type and document type;
 * null for everything that is no Anliegen. `I` alone says nothing — a
 * Regierungsvorlage is an `I` too — so a Volksbegehren needs its `DOKTYP`.
 */
export function anliegenKindOf(ityp: string | null | undefined, doktyp: string | null | undefined): AnliegenKind | null {
  if (ityp === 'PET') return 'petition'
  if (ityp === 'BI') return 'buergerinitiative'
  if (ityp === 'I' && doktyp === 'VOLKBG') return 'volksbegehren'
  if (ityp === 'PET-BR') return 'petition-bundesrat'
  return null
}

/**
 * The root a path's three segments name, or null where one of them is none.
 * A Petition an den Bundesrat stands under „BR" and nothing else; every
 * other kind under a period.
 */
export function anliegenRootOf(gp: string, segment: string, nr: string): AnliegenRoot | null {
  const kind = anliegenKindOfSegment(segment)
  const inr = parseInr(nr)
  if (!kind || inr === null) return null
  if (anliegenIsBundesrat(kind) ? gp !== BUNDESRAT_SEGMENT : !GP_RE.test(gp)) return null
  return { gp, kind, inr }
}

/** Our page of an Anliegen — `/anliegen/XXVIII/buergerinitiative/5`. */
export function anliegenPath(root: AnliegenRoot): string {
  return `${ANLIEGEN_PATH}/${root.gp}/${root.kind}/${root.inr}`
}

/** Its API base. */
export function anliegenApiBase(root: AnliegenRoot): string {
  return `/api${anliegenPath(root)}`
}

/** The item's own page at Parliament. */
export function anliegenParliamentUrl(root: AnliegenRoot): string {
  return `https://www.parlament.gv.at/gegenstand/${root.gp}/${ITEM_TYPE[root.kind]}/${root.inr}`
}

/**
 * Parliament's own form for an electronic Unterstützung of the item — the
 * shape of its `appformlink` (stage 103). Only ever offered while the item's
 * own `approvalstate` says open (`participationOf`).
 */
export function anliegenSupportFormUrl(root: AnliegenRoot): string {
  return `${anliegenParliamentUrl(root)}?selectedStage=103&appForm=1#appForm`
}

/**
 * Parliament's own form for a Stellungnahme to the item — the shape of its
 * `formlink` (stage 101). Only ever offered while the item's own
 * `statementsstate` says open.
 */
export function anliegenStatementFormUrl(root: AnliegenRoot): string {
  return `${anliegenParliamentUrl(root)}?selectedStage=101&persForm=1#persForm`
}

/**
 * „21/PET", „5/BI"; a Volksbegehren is a Beilage and cited „98 d.B.". A
 * Petition an den Bundesrat is cited by Parliament with its year,
 * „56/PET-BR/2024" (its record's `zitation`, list 101's „Nummer"), which the
 * root does not hold: where neither is at hand, „56/PET-BR".
 */
export function anliegenCitation(root: AnliegenRoot): string {
  return root.kind === 'volksbegehren' ? `${root.inr} d.B.` : `${root.inr}/${ITEM_TYPE[root.kind]}`
}

/** Parliament's citation of a Petition an den Bundesrat as list and record spell it — „56/PET-BR/2024", „15/PET-BR/97". */
export const BUNDESRAT_PETITION_CITATION_RE = /^\d{1,4}\/PET-BR\/\d{2,4}$/

/**
 * The cache key. It carries Parliament's type, like a draft root's
 * (`rootKey`): `XXVIII-BI-5` meets no key of a Vorlage, and a Volksbegehren
 * shares the Beilagen's number space, where no Vorlage has its number.
 */
export function anliegenKey(root: AnliegenRoot): string {
  return `${root.gp}-${ITEM_TYPE[root.kind]}-${root.inr}`
}

const KIND_OF_TYPE: Readonly<Record<AnliegenItemType, AnliegenKind>> = {
  PET: 'petition',
  BI: 'buergerinitiative',
  I: 'volksbegehren',
  'PET-BR': 'petition-bundesrat',
}

/** „/gegenstand/XXVII/BI/53", „/gegenstand/BR/PET-BR/56", also on Parliament's absolute address. */
const ITEM_PATH_RE = /^(?:https?:\/\/(?:www\.)?parlament\.gv\.at)?\/gegenstand\/([IVXLC]+|BR)\/(PET-BR|PET|BI|I)\/(\d+)(?:[/?#]|$)/
/** „5/BI/XXVI. GP" and „2 d.B./XXVIII. GP", as the carry-over line cites the successor. */
const PERIOD_CITATION_RE = /^(\d+)\s*(?:\/\s*(PET|BI)|(d\.B\.))\s*\/\s*([IVXLC]+)\.\s*GP$/

/**
 * The root an address or a period citation of Parliament's names — or null.
 *
 * Read where one Anliegen names another of another period: the predecessor
 * in `reference[]` („Neuverteilung gem. § 21 Abs. 1a GOG-NR", url
 * „/gegenstand/XXVII/BI/53") and the successor in the carry-over line
 * („Verhandlungsgegenstand der nächstfolgenden GP … (5/BI/XXVI. GP)", „(2
 * d.B./XXVIII. GP)"). An `I` reads as a Volksbegehren: neither path nor
 * citation can tell it from another Beilage, so only the record of a
 * Volksbegehren may pass one here — which is where those lines stand.
 */
export function anliegenRootOfHref(href: string | null | undefined): AnliegenRoot | null {
  const text = (href ?? '').trim()
  const path = ITEM_PATH_RE.exec(text)
  const cited = path ? null : PERIOD_CITATION_RE.exec(text)
  const gp = path?.[1] ?? cited?.[4]
  const type = (path?.[2] ?? cited?.[2] ?? (cited?.[3] ? 'I' : undefined)) as AnliegenItemType | undefined
  const inr = parseInr(path?.[3] ?? cited?.[1] ?? '')
  if (!gp || !type || inr === null) return null
  const kind = KIND_OF_TYPE[type]
  // „BR" only with „PET-BR", and „PET-BR" only under „BR".
  if (anliegenIsBundesrat(kind) ? gp !== BUNDESRAT_SEGMENT : !GP_RE.test(gp)) return null
  return { gp, kind, inr }
}

/**
 * Where an item stands, in the order of the evidence: carried into the next
 * period; forwarded to a subject committee (with its report, where one
 * stands — what the plenary did with it is not read); taken note of in the
 * committee; to be passed to the Volksanwaltschaft (agreed by the plenary,
 * or the committee's motion alone); a Volksbegehren taken note of by the Nationalrat; the plenary
 * took note of a report with no disposal read; open in a period that has
 * ended (`periodEnded`, never without it); otherwise in deliberation.
 *
 * `end` „plenum" does not mean finished for a forwarded item — the plenary
 * took note of the Sammelbericht that reports the forwarding, and the item
 * lives on in the subject committee (1/BI XXVIII) — so the subject committee
 * is read before the plenary.
 */
export function anliegenStateOf(
  root: AnliegenRoot,
  course: Pick<AnliegenCourse, 'carriedTo' | 'subjectCommittee' | 'disposal' | 'plenary' | 'end' | 'transmission' | 'withdrawnAt'>,
  periodEnded: boolean | null | undefined,
): AnliegenState {
  // A Petition an den Bundesrat: passed to the administration, its report
  // taken note of by the Bundesrat, or withdrawn by § 16 Abs. 5 GO-BR —
  // otherwise in deliberation. No period can end it.
  if (anliegenIsBundesrat(root.kind)) {
    if (course.withdrawnAt) return { kind: 'zurueckgezogen', date: course.withdrawnAt }
    if (course.transmission) return { kind: 'uebermittelt', to: course.transmission.to, date: course.transmission.date }
    if (course.plenary) return { kind: 'bundesrat-bericht-zur-kenntnis', date: course.plenary.date }
    return { kind: 'in-behandlung' }
  }
  if (course.carriedTo) return { kind: 'uebernommen', successor: { gp: course.carriedTo.gp, kind: root.kind, inr: course.carriedTo.inr } }
  const sc = course.subjectCommittee
  if (sc) {
    if (sc.report) return { kind: 'weitergeleitet-bericht', committee: sc.name, report: sc.report.citation }
    return { kind: 'weitergeleitet', committee: sc.name, date: course.disposal?.date ?? null }
  }
  const disposal = course.disposal
  if (disposal) {
    switch (disposal.kind) {
      case 'kenntnisnahme':
        return { kind: 'kenntnisnahme-ausschuss', date: disposal.date }
      case 'volksanwaltschaft': {
        // Agreed only where the plenary's step is the vote on the Übermittlung.
        const agreed = course.plenary?.kind === 'uebermittlung-zugestimmt'
        return { kind: 'volksanwaltschaft', date: agreed ? course.plenary!.date : disposal.date, agreed }
      }
      case 'zuweisung':
        // Without a subject committee (never so far): the plenary's step below, else open.
        break
    }
  }
  if (course.plenary) {
    return root.kind === 'volksbegehren' && course.plenary.kind === 'kenntnisnahme'
      ? { kind: 'volksbegehren-kenntnisnahme', date: course.plenary.date }
      : { kind: 'bericht-zur-kenntnis', date: course.plenary.date }
  }
  if (course.end === 'offen' && periodEnded) return { kind: 'ohne-erledigung-periode-beendet' }
  return { kind: 'in-behandlung' }
}
