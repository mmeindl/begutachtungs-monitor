/**
 * Writing to the monitor (17.11.2026): the words of the invitations and the
 * `mailto:` addresses they open. One place per language; the address itself
 * is configuration (`runtimeConfig.public.contactEmail`, `useContact`).
 *
 * WHY A PREFILLED MAIL AND NO FORM. A form needs a sending path with
 * credentials, protection against spam and its own section in the
 * Datenschutzerklärung: a standing cost, for a threshold nobody has measured
 * yet. A mail the reader sends from their own program costs nothing to run
 * and processes nothing the Datenschutzerklärung does not already name
 * (`/datenschutz#mail`). What a form would add is a report without a
 * sender's address; that waits for a decision.
 *
 * WHY THE PAGE IS IN THE MAIL. „Paragraph 4 ist falsch zugeordnet" is no use
 * without knowing on which page: the reader is on it and the link knows it,
 * so the link writes it down. The reader sees it before sending and can
 * delete it.
 */

/** The words at the foot of a section that shows a claim of ours; they open the note below. */
export const REPORT_LABEL_DE = 'Fehler melden'

/** What „Fehler melden" opens: these words, then the address as the link. */
export const REPORT_LEAD_DE = 'Hinweis an'

/**
 * The invitation to work with the monitor: one line in the footer of every
 * page (`AppFooter`), the heading in bold, then the asks, then the address
 * on a line of its own. Asks by name, because „Feedback" addresses nobody:
 * a reader with an introduction to offer or a workshop to ask for does not
 * see themselves in it. No price and no promise.
 */
export const COOPERATION_DE = {
  heading: 'Am Monitor mitwirken',
  line: 'eine Funktion wünschen, einen Kontakt vermitteln, einen Workshop anfragen',
  /** Subject of the mail the footer's address opens. */
  subject: 'Mitwirken am Monitor',
} as const

/** `mailto:` with subject and body; line breaks as CRLF (RFC 6068 § 5). */
export function mailtoOf(address: string, subject?: string, body?: string): string {
  const params: string[] = []
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`)
  if (body) params.push(`body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`)
  return `mailto:${address}${params.length ? `?${params.join('&')}` : ''}`
}

/**
 * The mail „Fehler melden" opens: the page in the subject (so a mailbox
 * sorts by it), the full address and the claim in the body, then the
 * question.
 *
 * `page.url` is absolute; `page.path` is what the subject shows. `claim` is what
 * the section's credit line calls ours: „Markierung", „Zählung",
 * „Einordnung der Einbringer:innen".
 */
export function reportMailtoOf(address: string, page: { url: string; path: string }, claim?: string): string {
  const lines = [`Seite: ${page.url}`]
  if (claim) lines.push(`Betrifft: ${claim}`)
  lines.push('', 'Was stimmt nicht?', '')
  return mailtoOf(address, `Fehlerhinweis: ${page.path}`, lines.join('\n'))
}
