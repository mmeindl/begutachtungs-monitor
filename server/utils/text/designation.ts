/**
 * How the engines read a designation — „§ 285b.", „Anlage 2", „Art. 3".
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * Only the readings that were written twice live here. Three further
 * designation readers exist and stay where they are, because they answer a
 * different question: `annexCheck.designationKey` (keeps the KIND, so an
 * Anlage 1 never matches a § 1), `tguOracle.paraIdOfGld` (anchored at the
 * start of the Gliederungssymbol) and `annexPdf.idOfMarker` (carries the kind
 * into the id it builds). They differ on purpose.
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
