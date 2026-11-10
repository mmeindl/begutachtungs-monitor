/**
 * A law's address, checked before anything is read (§12.70): a Land the
 * monitor knows, a year of four digits, a number without leading zeros —
 * `/entwuerfe/salzburg/lgbl/2026/57`. Pure.
 */
export function lawParams(land: string | undefined, year: string | undefined, nr: string | undefined, lands: readonly string[]): { land: string; year: number; number: number } | null {
  if (!land || !lands.includes(land)) return null
  if (!/^(?:19|20)\d{2}$/.test(year ?? '') || !/^[1-9]\d{0,3}$/.test(nr ?? '')) return null
  return { land, year: Number(year), number: Number(nr) }
}
