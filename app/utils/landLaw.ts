/**
 * What a Landesgesetz's page says about a Begutachtung — the first
 * station of its card, one fact and a short reason, pale where none took
 * place or none can be told (`begutachtungStation`). Pure: the bar and
 * vitest read the same words.
 *
 * The wording rules of the Bund's laws hold: „ohne Begutachtung", never
 * „übersprungen" or „umgangen"; a procedural fact, no blame; and the wins
 * as prominent as the rest — a Vorlage that reports its Begutachtung is an
 * ordinary, ink station.
 */
import type { BgblLawsResponse, LandCode, LandLaw } from '#shared/types'
import { fassungFacts, type FassungFact } from './geltendeFassung'

/**
 * Why a draft may have existed and is no longer to be seen, where the
 * Land's register does not reach back far enough for this law
 * (`registerCovers` false) — in the Land's own terms where it states a
 * limit, else the register's reach.
 */
const SHORT_REGISTER: Partial<Record<LandCode, string>> = {
  noe: 'Niederösterreich veröffentlicht Entwürfe nur während der Frist',
  t: 'Tirol führt Gesetzesentwürfe nur einige Wochen auf seiner Liste',
  vbg: 'Vorarlberg veröffentlicht nur laufende Entwürfe',
  w: 'Wien veröffentlicht Entwürfe höchstens ein Jahr lang',
}

const MAY_HAVE_EXISTED = 'ein Entwurf kann es gegeben haben und ist nicht mehr veröffentlicht'

/** The facts of the Begutachtung station, and whether it is pale. */
export function landLawBegutachtungFacts(law: Pick<LandLaw, 'land' | 'route' | 'begutachtung' | 'registerCovers'>): { facts: string[]; pale: boolean } {
  const b = law.begutachtung
  const unknown = (reason: string) => ({ facts: ['nicht feststellbar', reason], pale: true })
  const beyondReach = () => ({ facts: ['nicht feststellbar', SHORT_REGISTER[law.land] ?? 'das Register des Landes reicht nicht so weit zurück', MAY_HAVE_EXISTED], pale: true })
  switch (b.kind) {
    case 'consulted':
      return b.by === 'heading'
        ? { facts: ['laut Erläuterungen der Regierungsvorlage durchgeführt'], pale: false }
        : { facts: ['durchgeführt', 'Entwurf im Register des Landes'], pale: false }
    case 'none':
      return {
        facts: ['ohne Begutachtung', law.route?.kind === 'antrag'
          ? 'keine erkennbar: kein Entwurf im Register, Antrag und Ausschussbericht nennen keine'
          : 'keine erkennbar: kein Entwurf im Register, Regierungsvorlage und Ausschussbericht nennen keine'],
        pale: true,
      }
    case 'silent':
      switch (b.reason) {
        case 'unsupported':
        case 'register-reach':
          if (law.registerCovers === null) return unknown('das Register des Landes ist gerade nicht lesbar')
          return law.registerCovers ? unknown('kein Entwurf im Register des Landes zugeordnet') : beyondReach()
        case 'budget':
          return unknown('Landeshaushaltsgesetz')
        case 'similar-draft':
          return unknown('ein Entwurf mit ähnlichem Titel ist ihm nicht sicher zuzuordnen')
        case 'mentions':
          return unknown('die Unterlagen des Landtags erwähnen eine Begutachtung')
        case 'contradictory':
          return unknown('die Regierungsvorlage nennt ein Ergebnis und zugleich keine Begutachtung')
        case 'pending':
          return unknown('die Unterlagen des Landtags werden gerade gelesen')
        case 'unread':
          return unknown('die Unterlagen des Landtags sind gerade nicht lesbar')
        case 'no-route':
          return unknown('das RIS nennt weder Regierungsvorlage noch Initiativantrag')
      }
  }
  return unknown('kein Beleg')
}

/** How long RIS's consolidation may trail a Kundmachung before „noch nicht eingearbeitet" stops being the likely reading. */
const CONSOLIDATION_DAYS = 60

/**
 * The Bund's three cases (`fassungFacts`) for a Landesgesetz — with one
 * difference: a law RIS has not consolidated after two months may never
 * be (a Landesverfassungsgesetz, a law RIS keeps outside LrKons), and
 * „folgt mit einigen Tagen Verzug" would then promise what does not come.
 * Then the fact says only what the search found: nothing.
 */
export function landFassungFacts(fassung: BgblLawsResponse | null | undefined, kundgemacht: string | null, today: string = new Date().toISOString().slice(0, 10)): FassungFact[] {
  const facts = fassungFacts(fassung, 'Gesetze')
  const old = kundgemacht !== null && Date.parse(today) - Date.parse(kundgemacht) > CONSOLIDATION_DAYS * 86_400_000
  return facts.map((f) => (f.key === 'fassung' && f.text && old
    ? { ...f, text: 'Im RIS ist keine konsolidierte Fassung verzeichnet, die dieses Landesgesetzblatt nennt.' }
    : f))
}
