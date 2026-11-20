/**
 * The name a reader is shown for a law of a draft, where the key it is held
 * under is no name.
 *
 * An Artikel is keyed by the first line under its number, because the diff
 * units, the annex's rows and the Lesefassung all join on that string
 * (`DraftArticle.key`). In a law with constitutional rank that line is the
 * qualifier „(Verfassungsbestimmung)", printed above „Änderung des
 * Bundes-Verfassungsgesetzes" — and the § comparison titled its group with
 * it (127/ME XXVIII, 20.11.2026). The key stays what it is; wherever a
 * label is printed, it goes through here.
 *
 * `names`: key → printed name, as the server sends it for the keys that are
 * a qualifier (`articleNames` in `server/utils/lawtext/draftArticles.ts`).
 * Any other key is its own name.
 */
export function lawNameOf<K extends string | null>(names: Readonly<Record<string, string>> | null | undefined, key: K): K | string {
  return (key !== null && names?.[key]) || key
}
