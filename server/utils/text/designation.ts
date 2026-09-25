/**
 * How the engines read a designation — „§ 285b.", „Anlage 2", „Art. 3".
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * Only the readings that were written twice live here. Three further
 * designation readers exist and stay where they are, because they answer a
 * different question: `designationKey` in `annex/annexText.ts` (keeps the
 * KIND, so an Anlage 1 never matches a § 1), `paraIdOfGld` in
 * `kons/tguOracle.ts` (anchored at the start of the Gliederungssymbol) and
 * `idOfMarker` in `annex/annexPdf.ts` (carries the kind into the id it
 * builds). They differ on purpose.
 */

/**
 * The bare number of a designation: „§ 5" → „5", „Art. 3" → „3",
 * „Anlage 2" → „2", „§ 285b." → „285b".
 *
 * The first number anywhere in the label, with its optional letter and the
 * dotted form („§ 12.1"). Null where there is none.
 */
export function bareParaId(label: string | null): string | null {
  if (!label) return null
  const m = /(\d+[a-z]*(?:\.\d+)?)/.exec(label)
  return m ? m[1]! : null
}

/** RIS prints a schedule as „Anl. 2", an instruction says „Anlage 2". */
export function anlageLabelKey(label: string): string {
  return label.replace(/\s+/g, ' ').trim().replace(/^(?:Anlage|Anhang)\b/, 'Anl.')
}

/**
 * The Artikel of a law that is itself divided into Artikel, as RIS keys it:
 * „II" → „2", „2" → „2". Null for a numeral this cannot read.
 *
 * A null is a refusal at every call site, and that is the point. The draft
 * writes the numeral in roman („Artikel II § 3"), RIS arabic („Art. 2 § 3"),
 * and the two have to be joined before a § of such a law can be looked up at
 * all — leaving the Artikel off does not widen the search, it finds nothing,
 * because under „§ 3" RIS carries no document in that law (§12.12a). A join
 * that guessed at an unreadable numeral would edit another Artikel's § 3
 * instead, which is the one outcome `kons/novao.ts` exists to prevent.
 *
 * Roman is parsed greedily and then written back, so only the canonical
 * spelling is accepted: „IIII" and „VX" are no numerals and come back null
 * rather than as 4 and 5.
 */
const ROMAN: readonly (readonly [string, number])[] = [
  ['M', 1000], ['CM', 900], ['D', 500], ['CD', 400], ['C', 100], ['XC', 90],
  ['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1],
]

function romanOf(n: number): string {
  let out = ''
  let rest = n
  for (const [symbol, value] of ROMAN) {
    while (rest >= value) {
      out += symbol
      rest -= value
    }
  }
  return out
}

export function articleNumberKey(numeral: string): string | null {
  const t = numeral.trim()
  if (/^\d+$/.test(t)) {
    const n = Number(t)
    return n > 0 ? String(n) : null
  }
  const upper = t.toUpperCase()
  if (!/^[IVXLCDM]+$/.test(upper)) return null
  let value = 0
  let rest = upper
  for (const [symbol, amount] of ROMAN) {
    while (rest.startsWith(symbol)) {
      value += amount
      rest = rest.slice(symbol.length)
    }
  }
  if (rest.length > 0 || value === 0) return null
  return romanOf(value) === upper ? String(value) : null
}
