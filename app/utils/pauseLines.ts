/**
 * The pause line (23.11.2026): one sentence, a little funny, that reminds
 * the reader of a break. It stands in one place, on the plain 404 of the
 * error page, as the sentence under the title „Seite nicht gefunden". The
 * rule and what was rejected: `docs/decisions.md`, „A pause line stands on
 * the plain 404 and says nothing about a draft".
 *
 * How a line is written:
 * - It reads directly under the title, so it does not say the title again.
 * - Its subject is the reader, the page or the outdoors, never a draft, its
 *   deadline or its state. No line uses a word the monitor uses as
 *   information (Frist, Beschluss, Kundmachung, Stellungnahme …), so none
 *   can be taken for one.
 * - It addresses nobody. Where the site addresses its reader it says „Sie"
 *   (the start page's title); a „du" here would be a second form on one
 *   site, and a „Sie" in an aside is stiff.
 *
 * What makes a line work, read off the candidates kept and dropped
 * (23.11.2026): a triad („kein …, kein …, kein …"), emptiness offered as a
 * gift, a concrete outdoor image that invites, effort recognised and a rest
 * allowed, a plain legal formula applied to the pause („Paragraph 404: …").
 * What does not: echo puns and antitheses, twisted proverbs, nature against
 * law as an aphorism, a personified internet, forced wordplay, and legal
 * terms only insiders know. Further lines, and a second language's, follow
 * the same patterns.
 *
 * The words are here, not in the templates, so a second language can replace
 * them. A second language writes its own lines; these do not translate.
 *
 * Pure module: no Nuxt auto-imports.
 */

/** The plain 404: the page is missing, so there is nothing to read. */
export const PAUSE_LINES_404_DE: readonly string[] = [
  'Keine Seite, kein Paragraph, kein Absatz. Fast wie Urlaub.',
  'Auf dieser Seite gibt es nichts zu tun. Nichtstun ist hier ausdrücklich erlaubt.',
  'Die Seite ist weg. Der Wald wartet.',
  'Kein Inhalt, kein Kleingedrucktes, kein Stress.',
  'Vielleicht ist die Seite spazieren gegangen. Keine schlechte Idee.',
  'Leere Seite. Einatmen, ausatmen, dann zurück zur Startseite.',
  'Diese Adresse führt ins Leere. Dort soll es ruhig sein.',
  'Die Seite ist nicht da. Die Sonne vielleicht schon, ein Blick aus dem Fenster kann das klären.',
  'Hier steht nichts. Das ist womöglich die erholsamste Seite im ganzen Netz.',
  'Hier ist es still. Das darf ruhig einen Moment so bleiben.',
  'Für diese Adresse gibt es keine Rechtsgrundlage. Für eine Tasse Tee schon.',
  'Paragraph 404: Diese Seite gibt es nicht. Absatz 2: Eine Pause schon.',
  'Verlaufen? Passiert im Wald auch. Dort ist es nur schöner.',
  'Weit und breit kein Text. So ähnlich fühlt sich eine Wiese an.',
  'Diese Seite ist leer. Der Kopf darf es für einen Moment auch sein.',
  'Eine Seite ohne Inhalt. Ein guter Platz, um kurz die Augen zu schließen.',
  'Dafür gibt es hier vielleicht fünf Minuten Ruhe.',
  'Hier gibt es nichts zu sehen. Draußen schon.',
]

/* FNV-1a, 32 bit: spreads short, similar strings (paths) evenly. */
function hashOf(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * The line for a seed, always the same one. The seed is the page's path:
 * server and browser hold the same path, so the two render the same line
 * without shared state. A date would differ between them around midnight, a
 * random number always.
 */
export function pauseLineFor(lines: readonly string[], seed: string): string | null {
  if (lines.length === 0) return null
  return lines[hashOf(seed) % lines.length] ?? null
}
