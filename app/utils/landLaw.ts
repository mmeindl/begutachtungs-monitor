/**
 * What a Landesgesetz's page says about a Begutachtung (§12.70) — one
 * sentence, the statement where the sources carry one, the reason where
 * they do not. Pure: the page and vitest read the same words.
 *
 * The wording rules of the Bund's laws hold: „ohne Begutachtung", never
 * „übersprungen" or „umgangen"; a procedural fact, no blame; and the wins
 * as prominent as the rest — a Vorlage that reports its Begutachtung says
 * so.
 */
import type { LandCode, LandLaw } from '#shared/types'

/**
 * Why, for a Land other than Salzburg, the sources cannot say whether a
 * Begutachtung took place — the second half of the page's sentence. Each
 * names what is missing for that Land: a register that keeps its drafts
 * long enough to be joined, or a Landtag document RIS links in a form the
 * monitor reads for this question (Salzburg's Vorlagen carry a heading
 * „Ergebnis des Begutachtungsverfahrens"; no such key is known for the
 * others).
 */
const GAP: Record<LandCode, string> = {
  bgld: 'Das Rechtsinformationssystem nennt die Nummer der Vorlage, verlinkt sie aber nicht, und ein Entwurf des Landes, den der Monitor diesem Gesetz zuordnet, ist nicht bekannt.',
  ktn: 'Das Rechtsinformationssystem nennt zu Kärntner Gesetzen keine Unterlagen des Landtags, und ein Entwurf des Landes, den der Monitor diesem Gesetz zuordnet, ist nicht bekannt.',
  noe: 'Das Land veröffentlicht einen Entwurf nur, solange seine Frist läuft – ob es vor diesem Gesetz einen gab, ist danach nicht mehr zu sehen.',
  ooe: 'Ein Entwurf des Landes, den der Monitor diesem Gesetz zuordnet, ist nicht bekannt, und die Unterlagen des Landtags liest der Monitor für diese Frage nicht.',
  sbg: 'Die Unterlagen des Landtags sind für dieses Gesetz nicht lesbar.',
  stmk: 'Ein Entwurf des Landes, den der Monitor diesem Gesetz zuordnet, ist nicht bekannt, und die Unterlagen des Landtags verlinkt das Rechtsinformationssystem nicht so, dass der Monitor sie lesen kann.',
  t: 'Das Land führt einen Gesetzesentwurf nur einige Wochen lang auf seiner Liste – ob es vor diesem Gesetz einen gab, ist danach nicht mehr zu sehen.',
  vbg: 'Das Land veröffentlicht nur laufende Entwürfe – ob es vor diesem Gesetz einen gab, ist danach nicht mehr zu sehen.',
  w: 'Die Stadt Wien veröffentlicht einen Entwurf höchstens ein Jahr lang, und die Unterlagen des Landtags liest der Monitor für diese Frage nicht.',
}

export function landLawGapDe(land: LandCode): string {
  return GAP[land]
}

/** „Das Gesetz kam als Initiativantrag in den Landtag." — wherever RIS states the route as such. */
function antragDe(law: Pick<LandLaw, 'route'>): string {
  return law.route?.kind === 'antrag' ? 'Das Gesetz kam als Initiativantrag in den Landtag. ' : ''
}

/**
 * The sentence for the statement (Salzburg) or for a doubt about it; null
 * for a Land whose sources carry none (`landLawGapDe` then says why) — with
 * the route sentence alone where RIS states an Initiativantrag.
 */
export function landLawStatementDe(law: Pick<LandLaw, 'route' | 'begutachtung'>): string | null {
  const b = law.begutachtung
  const doubt = 'Ob vor diesem Gesetz eine Begutachtung stattfand, sagt der Monitor hier nicht:'
  switch (b.kind) {
    case 'consulted':
      return b.by === 'heading'
        ? 'Die Erläuterungen der Regierungsvorlage berichten über das Ergebnis eines Begutachtungsverfahrens – vor diesem Gesetz war ein Entwurf in Begutachtung. Im Register des Landes ordnet der Monitor ihm keinen Entwurf zu.'
        : null
    case 'none':
      return law.route?.kind === 'antrag'
        ? `${antragDe(law)}Vor ihm ist kein Entwurf des Landes in Begutachtung erkennbar: Im Register des Landes steht keiner, der ihm zugeordnet ist oder ähnlich heißt, und weder der Antrag noch der Ausschussbericht berichtet über eine Begutachtung – das Gesetz kam ohne Begutachtung.`
        : 'Vor diesem Gesetz ist kein Entwurf des Landes in Begutachtung erkennbar: Im Register des Landes steht keiner, der ihm zugeordnet ist oder ähnlich heißt, und die Regierungsvorlage berichtet über kein Begutachtungsverfahren – das Gesetz kam ohne Begutachtung.'
    case 'silent':
      switch (b.reason) {
        case 'unsupported':
          return antragDe(law).trim() || null
        case 'budget':
          return 'Zu Budgetgesetzen sagt der Monitor nicht, ob eine Begutachtung stattfand.'
        case 'similar-draft':
          return `${antragDe(law)}${doubt} Im Register des Landes steht ein Entwurf mit ähnlichem Titel, den er diesem Gesetz nicht sicher zuordnen kann.`
        case 'mentions':
          return `${antragDe(law)}${doubt} Die Unterlagen des Landtags erwähnen eine Begutachtung, ein Entwurf im Register des Landes ist ihm aber nicht zugeordnet.`
        case 'contradictory':
          return `${doubt} Die Regierungsvorlage nennt ein Ergebnis des Begutachtungsverfahrens und sagt zugleich, dass keines stattfand.`
        case 'pending':
          return `${antragDe(law)}${doubt} Die Unterlagen des Landtags werden gerade gelesen.`
        case 'unread':
          return `${antragDe(law)}${doubt} Die Unterlagen des Landtags oder das Register des Landes waren gerade nicht lesbar.`
        case 'no-route':
          return `${doubt} Das Rechtsinformationssystem nennt weder eine Regierungsvorlage noch einen Initiativantrag, deren Text er lesen könnte.`
      }
  }
  return null
}
