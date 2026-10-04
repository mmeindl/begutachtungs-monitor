/**
 * The sentence above the § comparison that explains the disclosures below
 * it (`LawDiffSection`): how many of the Ressort's Begründungen changed
 * between two versions. Out of the component on 04.10.2026, so its wording
 * can be pinned by a test like its neighbours in `lawPackage.ts`.
 *
 * Here rather than on every row: printing „unverändert" on 33 rows would be
 * noise, naming the rate once is the information. And it names both numbers —
 * how often the reasoning moved with the text and how often it did not —
 * because an unchanged reasoning for a changed text is a statement of its
 * own.
 */
import type { ReasoningDiffResponse } from '#shared/types'

export function reasoningRateNote(stats: ReasoningDiffResponse['stats'] | null | undefined): string | null {
  if (!stats?.compared) return null
  const { compared, changed } = stats
  // Shorter since 30.09.2026; „— aufklappbar an der Änderung" went, the
  // disclosure at each change announces itself. Counts Begründungen since
  // 01.10.2026, not Paragraphen: what is compared is the ressort's passage to
  // a change — one passage on three Ziffern is one Begründung, and only where
  // the Erläuterungen are titled by § is it the Paragraph's.
  //
  // Shorter again on 01.10.2026: „die beide Fassungen zu den Änderungen
  // führen" became „die in beiden Fassungen stehen" — the same restriction,
  // the one the count needs to be read right.
  if (compared === 1) {
    return changed === 0
      ? 'Die Begründung, die in beiden Fassungen steht, hat das Ressort nicht geändert.'
      : 'Die Begründung, die in beiden Fassungen steht, hat das Ressort geändert.'
  }
  //
  // „…, die in beiden Fassungen stehen" left the plural on 02.10.2026: it
  // shares a paragraph with the pointer to the Erläuterungen now, and the
  // restriction stands on /so-funktionierts. The singular keeps it — „Die
  // Begründung" alone would not say which one.
  if (changed === 0) return `Keine der ${compared} Begründungen hat das Ressort geändert.`
  if (changed === compared) return `Alle ${compared} Begründungen hat das Ressort geändert.`
  return `${changed} der ${compared} Begründungen hat das Ressort geändert.`
}
