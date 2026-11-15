/**
 * The refusal of an item the monitor does not follow (14.11.2026) — an
 * Ausschussbericht, an Entschließungsantrag, an Einspruch of the Bundesrat
 * whose law is not known, a Volksbegehren before GP XXII — on the page of a
 * Vorlage or Antrag, on the page of an Anliegen and on the error page.
 * Treaties have a page since the same day (step 5); Petitionen,
 * Bürgerinitiativen and Volksbegehren since 15.11.2026, under `/anliegen`,
 * so the text names them among what is followed.
 *
 * The item exists at Parliament; the monitor has no page for it. Until this
 * day the page said „Vorlage nicht gefunden" and the error page „Die
 * angeforderte Seite existiert nicht", which denied an item Parliament
 * shows. The words are here, not in the templates, so a second language can
 * replace them.
 *
 * Pure module: no Nuxt auto-imports.
 */
import { ANLIEGEN_PATH, ANLIEGEN_SECTION_DE } from '#shared/utils/anliegen'
import { GP_RE } from '#shared/utils/gp'
import { isSafeLinkHref } from '#shared/utils/safeExternalUrl'

export const NOT_FOLLOWED_DE = {
  title: 'Kein Gegenstand, den der Monitor verfolgt',
  text: `Diesen Gegenstand führt das Parlament, der Monitor folgt ihm aber nicht auf einer eigenen Seite. Er folgt Regierungsvorlagen, Ausschussanträgen, Gesetzesanträgen aus dem Bundesrat, den Anträgen von Abgeordneten auf ein Bundesgesetz und Staatsverträgen, dazu Petitionen, Bürgerinitiativen und Volksbegehren im Nationalrat und Petitionen an den Bundesrat als ${ANLIEGEN_SECTION_DE}.`,
  link: 'Auf parlament.gv.at ansehen',
  /** Where a refused item is an Anliegen of a period the monitor does not follow: the section it follows them in. */
  anliegenLink: { label: `Alle ${ANLIEGEN_SECTION_DE}`, href: ANLIEGEN_PATH },
} as const

/**
 * The text for a Volksbegehren before the first period followed
 * (`anliegenFrom`): why there is no page, and from when there is one.
 */
export function notFollowedVolksbegehrenDe(firstGp: string): string {
  return `Dieses Volksbegehren führt das Parlament. Der Monitor folgt Volksbegehren ab der ${firstGp}. Gesetzgebungsperiode; die Einträge des Parlaments zu älteren sind zu lückenhaft für eine eigene Seite.`
}

/** What the API's refusal carries (`NotFollowedData` on the server). */
export interface NotFollowed {
  parliamentUrl: string | null
  followedAt: string | null
  /** The first period from which an Anliegen of this kind is followed; only on such a refusal. */
  anliegenFrom?: string
}

/* The page a refusal may lead to: a page of the monitor that follows the item. */
const FOLLOWED_PREFIXES = ['/entwuerfe/', `${ANLIEGEN_PATH}/`]

/**
 * The refusal's data out of an error — the API's body (`{ data: … }` inside
 * a fetch error's `data`) or a page error's own `data` — or null where the
 * error is no such refusal. Links are held to the client's check.
 */
export function notFollowedOf(err: unknown): NotFollowed | null {
  const outer = (err as { data?: unknown } | null | undefined)?.data
  const body = (outer as { data?: unknown } | null | undefined)?.data ?? outer
  const d = body as { parliamentUrl?: unknown; followedAt?: unknown; anliegenFrom?: unknown } | null | undefined
  if (!d || typeof d !== 'object') return null
  const parliamentUrl = typeof d.parliamentUrl === 'string' && isSafeLinkHref(d.parliamentUrl) ? d.parliamentUrl : null
  const target = typeof d.followedAt === 'string' ? d.followedAt : null
  const followedAt = target && FOLLOWED_PREFIXES.some((prefix) => target.startsWith(prefix)) && isSafeLinkHref(target)
    ? target
    : null
  if (!parliamentUrl && !followedAt) return null
  const anliegenFrom = typeof d.anliegenFrom === 'string' && GP_RE.test(d.anliegenFrom) ? d.anliegenFrom : null
  return anliegenFrom ? { parliamentUrl, followedAt, anliegenFrom } : { parliamentUrl, followedAt }
}
