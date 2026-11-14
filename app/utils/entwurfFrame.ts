/**
 * The opening frame of „Der Entwurf":
 * the facts of the draft as a reader consults them, in the order of the
 * Entwurf station's line — „Ändert …" · „Setzt EU-Recht um" · „Führt aus"
 * · „Setzt um" —, in the unfilled hairline frame of the box grammar, with
 * ONE credit line under its edge naming every source once.
 *
 * Pure: `EntwurfFrame.vue` renders what this returns.
 */
import type { AmendedLawsResponse, EuRechtResponse, LandBundesrechtResponse, TraceLink } from '#shared/types'
import { bundesrechtRows, type BundesrechtRowView } from './bundesrecht'
import { euFactView } from './euRecht'

/** A row of the frame — `FactList`'s `Fact`, restated so this module stays free of `.vue` imports. */
export interface Fact {
  key: string
  title?: string
  text?: string
}

export interface EntwurfFrameView {
  facts: Fact[]
  /** The Bund rows by label: „Führt aus" (Grundsatzgesetze), „Setzt um" (Art.-15a agreements). */
  fuehrtAus: BundesrechtRowView[]
  setztUm: BundesrechtRowView[]
}

/** Why no law in force is named, where the reader could not tell (`AmendedLawsResponse.unread`). */
const UNREAD_DE: Record<NonNullable<AmendedLawsResponse['unread']>, string> = {
  'no-text': 'Nicht lesbar: Der Monitor fand keinen Gesetzestext des Entwurfs, aus dem sich lesen ließe, welche Gesetze er ändert.',
  unnamed: 'Nicht lesbar: Welche Gesetze der Entwurf ändert, ließ sich aus seinem Text nicht lesen.',
}

/**
 * The rows. „Ändert" as before (`createsNewLaw`: „Geltendes Recht: Keines";
 * `unread`: „Geltendes Recht: Nicht lesbar");
 * the EU marker's own words as the label („Setzt EU-Recht um", „Begleitet
 * EU-Verordnungen", „Begleitet eine EU-Richtlinie"), only with a named act
 * — without one the station says it, and a row would only repeat it; „Führt
 * aus" and „Setzt um" on a Land's draft, named acts only.
 */
export function entwurfFrameView(input: { laws?: AmendedLawsResponse | null; eu?: EuRechtResponse | null; bundesrecht?: LandBundesrechtResponse | null; carried?: CarriedDraftLine | null }): EntwurfFrameView {
  const facts: Fact[] = []
  // An Initiativantrag's consulted draft first (decision 9 of 14.11.2026):
  // where the text came from, before what it changes.
  if (input.carried) facts.push({ key: 'begutachtet', title: 'Ministerialentwurf' })
  const a = input.laws
  if (a?.createsNewLaw) {
    facts.push({ key: 'neu', title: 'Geltendes Recht', text: 'Keines: Der Entwurf schafft neues Recht, es gibt keinen geltenden Text, gegen den er gehalten werden könnte.' })
  } else if (a?.laws.length) {
    facts.push({ key: 'recht', title: a.laws.length === 1 ? 'Ändert' : `Ändert ${a.laws.length} Gesetze` })
  } else if (a?.unread) {
    // A gap is said, never left as an absent row (14.11.2026): „neues
    // Gesetz" needs evidence, and without a law named the frame vanished.
    facts.push({ key: 'recht-offen', title: 'Geltendes Recht', text: UNREAD_DE[a.unread] })
  }
  const eu = euFactView(input.eu)
  if (eu?.acts.length) facts.push({ key: 'eu', title: eu.lead })
  const rows = bundesrechtRows(input.bundesrecht)
  const fuehrtAus = rows.filter((r) => r.key.startsWith('gg'))
  const setztUm = rows.filter((r) => r.key.startsWith('va'))
  if (fuehrtAus.length) facts.push({ key: 'fuehrt-aus', title: 'Führt aus' })
  if (setztUm.length) facts.push({ key: 'setzt-um', title: 'Setzt um' })
  return { facts, fuehrtAus, setztUm }
}

/**
 * The sentence that names the draft an Initiativantrag carries
 * (`carriedDraftDe`), the link inside it.
 */
export interface CarriedDraftLine {
  before: string
  link: { href: string; label: string }
  after: string
}

/** „Geltende Fassung, Vorblatt und Bundesgesetzblatt". */
function listDe(names: readonly string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`
}

export interface EntwurfFrameCredits {
  /** „Quellen:" before the items. */
  items: string[]
  /** The Land's documents the facts were read from, linked, once each — then „(Land Tirol)". */
  landDocs: TraceLink[]
  landPublisher: string | null
  /** „Verlinkt in der Fassung vom 01.10.2026" — which version the „Ändert" links open. */
  asOf: string | null
  /** The method texts the frame's „Methode" opens, in the rows' order: EU
   *  law where the frame shows it, Bund zu Land where it shows that — both
   *  where it shows both. Ids, not text: `EntwurfFrame.vue` maps each to its
   *  component in `app/components/method/` (14.11.2026; a /so-funktionierts
   *  anchor before, which could name only one of the two). */
  methods: EntwurfFrameMethod[]
}

/** A method text of the frame (`MethodEuRecht`, `MethodBundLand`). */
export type EntwurfFrameMethod = 'eu-recht' | 'bund-land'

/** The one credit line under the frame: every source the rows read, once. */
export function entwurfFrameCredits(input: { laws?: AmendedLawsResponse | null; eu?: EuRechtResponse | null; bundesrecht?: LandBundesrechtResponse | null; publisher?: string | null }, view: EntwurfFrameView): EntwurfFrameCredits {
  const shows = (key: string) => view.facts.some((f) => f.key === key)
  const ris: string[] = []
  if (shows('recht')) ris.push('Geltende Fassung')
  const eu = shows('eu') ? euFactView(input.eu) : null
  // A Bund draft's EU fact reads RIS documents; a Land's reads the Land's own (`input.publisher`).
  if (eu && !input.publisher) for (const s of eu.sources) if (s.publisher === 'ris' && !ris.includes(s.what)) ris.push(s.what)
  const bundShown = shows('fuehrt-aus') || shows('setzt-um')
  if (bundShown && (input.bundesrecht?.findings ?? []).some((f) => f.risUrl)) ris.push('Bundesgesetzblatt')
  const items = [
    ...(ris.length ? [`${listDe(ris)} (RIS)`] : []),
    ...(eu?.deadlines.length ? ['Fristen (EUR-Lex)'] : []),
    // The draft an Antrag carries is matched by wording (`antragPath.ts`):
    // Parliament links neither way, and the credit says so.
    ...(shows('begutachtet') ? ['Ministerialentwurf über den Wortlaut zugeordnet, das Parlament verweist nicht darauf'] : []),
  ]
  const landDocs: TraceLink[] = []
  if (input.publisher) {
    for (const s of [...(eu ? input.eu?.sources ?? [] : []), ...(bundShown ? input.bundesrecht?.sources ?? [] : [])]) {
      if (!landDocs.some((d) => d.url === s.url && d.label === s.label)) landDocs.push(s)
    }
  }
  return {
    items,
    landDocs,
    landPublisher: landDocs.length ? input.publisher ?? null : null,
    asOf: shows('recht') ? input.laws?.asOf ?? null : null,
    methods: [...(eu ? ['eu-recht' as const] : []), ...(bundShown ? ['bund-land' as const] : [])],
  }
}
