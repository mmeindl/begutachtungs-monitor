/**
 * Who a draft is, for the two sections that can be shown for both halves of
 * the corpus (docs/architecture.md §12.16).
 *
 * PURE MODULE — relative imports only.
 *
 * A Ministerialentwurf is addressed by (GP, Nummer), because that is what
 * Parliament and every link on the site use. Two thirds of the
 * Begutachtungen — Verordnungsentwürfe above all — have no Gegenstand at
 * Parliament and therefore neither number; they are addressed by their RIS
 * document id.
 *
 * Both travel as the same three fields so that everything below the entry
 * point is ONE code path. The alternative was a second service per section,
 * and the reading, the gate and the counting would then exist twice — the
 * copy that ages is always the one nobody looks at.
 */
export interface DraftIdentity {
  gp: string | null
  inr: number | null
  risId: string | null
}

/**
 * „XXVIII-40" or the RIS document id — one string for a cache key.
 *
 * The two spaces cannot collide: a RIS document id is `BEGUT_…` and carries
 * no hyphen-separated period, and a GP is never empty where `inr` is set.
 */
export function identityKey(who: DraftIdentity): string {
  return who.risId ?? `${who.gp}-${who.inr}`
}
