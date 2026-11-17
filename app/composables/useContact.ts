import { mailtoOf, reportMailtoOf } from '~/utils/contact'

/**
 * The monitor's contact address and the `mailto:` links built on it
 * (17.11.2026). The address is configuration, so no page writes it out: the
 * site moves to another name, and a copy run by someone else has its own.
 *
 * `reportHref` carries the page the reader is on (`app/utils/contact.ts`
 * says why). Without the fragment: the server never sees it, and an
 * attribute that differs between server and browser is not patched on
 * hydration.
 */
export function useContact() {
  const { contactEmail, siteUrl } = useRuntimeConfig().public
  const route = useRoute()

  return {
    /** The bare address, for display. */
    email: contactEmail,
    /** `mailto:` without a subject. */
    mailto: mailtoOf(contactEmail),
    /** `mailto:` with a subject of the caller's. */
    mailtoWith: (subject: string) => mailtoOf(contactEmail, subject),
    /** `mailto:` of „Fehler melden" for the current page; `claim` as in `reportMailtoOf`. */
    reportHref: (claim?: string) => {
      const path = route.fullPath.split('#')[0] ?? route.path
      return reportMailtoOf(contactEmail, { url: `${siteUrl}${path}`, path }, claim)
    },
  }
}
