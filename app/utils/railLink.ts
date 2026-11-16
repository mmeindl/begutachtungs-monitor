/**
 * The station name of a rail row as a link to its section: the whole row is
 * the target (stretched-link pattern), the name underlines on hover, and at
 * rest it carries no link styling — a rail is a table of contents, not a
 * column of blue lines. The reasoning in full stands at its first user,
 * `SpineRail`; `AnliegenRail` uses the same class so the two rails answer the
 * pointer alike. The row must be `relative group`, and must not be a
 * stacking context, for the overlay to size to it.
 */
export const RAIL_STATION_LINK = [
  'station rounded underline-offset-4 group-hover:underline group-hover:decoration-2',
  // The hit area, the pointer cursor and the focus ring, all on the row.
  'after:absolute after:inset-0 after:rounded-md',
  // The focus ring belongs around the whole row, not around the name. Two
  // halves: `focus-ring-off` takes the app's ring off the <a> — a plain
  // `focus-visible:outline-none` CANNOT, it is a `@layer utilities` rule and
  // the app's ring is unlayered, which is why this row quietly drew TWO
  // rings until 26.09.2026 (`main.css`, next to the ring itself) — and the
  // `after:` half draws it on the overlay instead. That half always worked:
  // the app's rule matches elements, not pseudo-elements.
  'focus-ring-off focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent',
  // The at-rest underline comes back where hover cannot be had: on a touch
  // device nothing would ever reveal these rows as targets.
  '[@media(hover:none)]:underline [@media(hover:none)]:decoration-baseline',
].join(' ')
