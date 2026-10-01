/**
 * A spaced dash stays on the line of the word before it — German
 * typesetting's rule, and on a phone the official titles broke against it:
 * „Mehrstimmrechtsaktien-Gesetz / – MSAG", „Industriestrompreisgesetz – /
 * ISPG;" was the good case (measured at 320 px, 30.09.2026). A no-break space
 * before the dash moves the break behind it.
 *
 * Covers the en and em dash and the plain hyphen the sources type in their
 * place („Strompreiskrisenmechanismus-Gesetz - SPKMG"). A hyphen inside a
 * word has no spaces around it and is left alone.
 *
 * For display only: `title=` and anything a reader copies as a reference keep
 * the source's own text.
 */
export function keepDashWithPrecedingWord(text: string): string {
  return text.replace(/ +([–—-]) +/g, ' $1 ')
}
