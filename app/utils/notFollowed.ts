/**
 * The refusal of an item the monitor does not follow (14.11.2026) — an
 * Ausschussbericht, an Entschließungsantrag, an Einspruch of the Bundesrat
 * whose law is not known — on the page of a Vorlage or Antrag and on the
 * error page. Treaties have a page since the same day (step 5).
 *
 * The item exists at Parliament; the monitor has no page for it. Until this
 * day the page said „Vorlage nicht gefunden" and the error page „Die
 * angeforderte Seite existiert nicht", which denied an item Parliament
 * shows. The words are here, not in the templates, so a second language can
 * replace them.
 *
 * Pure module: no Nuxt auto-imports.
 */
import { isSafeLinkHref } from '#shared/utils/safeExternalUrl'

export const NOT_FOLLOWED_DE = {
  title: 'Kein Gegenstand, den der Monitor verfolgt',
  text: 'Diesen Gegenstand führt das Parlament, der Monitor folgt ihm aber nicht auf einer eigenen Seite. Er folgt Regierungsvorlagen, Ausschussanträgen, Gesetzesanträgen aus dem Bundesrat, den Anträgen von Abgeordneten auf ein Bundesgesetz und Staatsverträgen.',
  link: 'Auf parlament.gv.at ansehen',
} as const

/** What the API's refusal carries (`NotFollowedData` on the server). */
export interface NotFollowed {
  parliamentUrl: string | null
  followedAt: string | null
}

/**
 * The refusal's data out of an error — the API's body (`{ data: … }` inside
 * a fetch error's `data`) or a page error's own `data` — or null where the
 * error is no such refusal. Links are held to the client's check.
 */
export function notFollowedOf(err: unknown): NotFollowed | null {
  const outer = (err as { data?: unknown } | null | undefined)?.data
  const body = (outer as { data?: unknown } | null | undefined)?.data ?? outer
  const d = body as { parliamentUrl?: unknown; followedAt?: unknown; notFollowed?: unknown } | null | undefined
  if (!d || typeof d !== 'object') return null
  const parliamentUrl = typeof d.parliamentUrl === 'string' && isSafeLinkHref(d.parliamentUrl) ? d.parliamentUrl : null
  const followedAt = typeof d.followedAt === 'string' && d.followedAt.startsWith('/entwuerfe/') && isSafeLinkHref(d.followedAt)
    ? d.followedAt
    : null
  if (!parliamentUrl && !followedAt) return null
  return { parliamentUrl, followedAt }
}
