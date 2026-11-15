/**
 * The steps of an EU act's procedure the monitor reads — the allowlist, and
 * the words for each.
 *
 * The Cellar types every step of a dossier (`cdm:event_legal_has_type_
 * concept_type_event_legal`); over the 208 dossiers of the map's 231 acts
 * there are 85 types (15.11.2026). Most are transmissions, referrals and
 * committee stages. The rail shows the DECISIONS: the proposal, what
 * Parliament and the Council decided, the opinions the Treaties ask for, the
 * signature. A type that is not in this table is counted on the page („N
 * weitere Schritte"), never shown and never taken for „did not happen".
 *
 * THE LABELS ARE THE CELLAR'S, read on 15.11.2026 from its authority table
 * (`skos:prefLabel@de` of `http://publications.europa.eu/resource/authority/
 * event/<code>`) and written down here, so the page says what the source
 * says. Two are corrected for grammar („geändertern", „Sozialausschuss"
 * after „des"); none is reworded. A new type is added with its label read
 * from the same table, not translated by hand.
 *
 * TWO VOCABULARIES. The Cellar's wording changed over the years: Parliament's
 * first-reading position is `ADP_R1_POS_byEP` in dossiers of today,
 * `AMEND_R1_byEP` and `OPI_R1_byEP` in older ones. All are listed; the role
 * says what they have in common.
 *
 * Pure module: auto-imported in `app/`, imported relatively by vitest and
 * the server.
 */

/**
 * What a step is to the rail: `proposal` and `amended-proposal` belong to
 * the station „Vorschlag"; `parliament`, `council`, `conciliation`,
 * `signature` and `opinion` to the station that carries the decision.
 * `publication` is the Official Journal's own station, which reads its date
 * from the act; the type is listed so that it is not counted as unread.
 */
export type EuEventRole =
  | 'proposal'
  | 'amended-proposal'
  | 'parliament'
  | 'council'
  | 'conciliation'
  | 'signature'
  | 'opinion'
  | 'publication'

export interface EuEventKind {
  /** The Cellar's German label for the type. */
  label: string
  role: EuEventRole
}

export const EU_EVENTS: Readonly<Record<string, EuEventKind>> = {
  // The Commission's proposal
  ADP_byCOM: { label: 'Annahme durch die Kommission', role: 'proposal' },
  ADP_PROPLEG_byCOM: { label: 'Annahme eines Vorschlags für einen Rechtsakt durch die Kommission', role: 'proposal' },
  ADP_PROPAME_byCOM: { label: 'Annahme eines geänderten Vorschlags durch die Kommission', role: 'amended-proposal' },
  ADP_PROPLEGAME_byCOM: { label: 'Annahme eines geänderten Vorschlags für einen Rechtsakt durch die Kommission', role: 'amended-proposal' },
  ADP_PROREEX_byCOM: { label: 'Annahme eines überprüften Vorschlags durch die Kommission', role: 'amended-proposal' },

  // The European Parliament
  ADP_R1_POS_byEP: { label: 'Standpunkt des EP in erster Lesung', role: 'parliament' },
  AMEND_R1_byEP: { label: 'Standpunkt des EP in erster Lesung', role: 'parliament' },
  OPI_R1_byEP: { label: 'Stellungnahme des Parlaments in 1. Lesung', role: 'parliament' },
  OPI_RSI_byEP: { label: 'Stellungnahme des Parlaments, einzige Lesung', role: 'parliament' },
  OPI_R2_byEP: { label: 'Stellungnahme des Parlaments in 2. Lesung', role: 'parliament' },
  AMEND_R2_byEP: { label: 'Annahme von Abänderungen am Standpunkt des Rates in erster Lesung durch das EP', role: 'parliament' },
  APR_R2_POS_CONSIL_byEP: { label: 'Billigung des Standpunkts des Rates in erster Lesung durch das EP (Annahme des Gesetzgebungsakts)', role: 'parliament' },
  DEC_R3_byEP: { label: 'Beschluss des Parlaments in 3. Lesung', role: 'parliament' },

  // The Council
  ADP_R1_POS_byCONSIL: { label: 'Standpunkt des Rates in erster Lesung und Begründung', role: 'council' },
  ADP_R1_byCONSIL: { label: 'Festlegung eines Standpunkts des Rates in 1. Lesung', role: 'council' },
  ADP_COMPOS_byCONSIL: { label: 'Annahme des Gemeinsamen Standpunktes durch den Rat', role: 'council' },
  APR_R1_byCONSIL: { label: 'Billigung des Standpunkts des EP in erster Lesung durch den Rat (Annahme des Gesetzgebungsakts)', role: 'council' },
  APR_R2_byCONSIL: { label: 'Billigung der Abänderungen des EP in zweiter Lesung durch den Rat (Annahme des Gesetzgebungsakts)', role: 'council' },
  DEC_R3_byCONSIL: { label: 'Beschluss des Rates in 3. Lesung', role: 'council' },
  ADP_FRM_byCONSIL: { label: 'Annahme des Gesetzgebungsakts', role: 'council' },

  // Between the two
  DEC_byCMT_CONC: { label: 'Beschluss des Vermittlungsausschusses', role: 'conciliation' },
  SIGN_byEP_CONSIL: { label: 'Unterzeichnung durch den Präsidenten des EP und den Präsidenten des Rates', role: 'signature' },

  // Opinions the Treaties provide for
  OPI_byEESC: { label: 'Stellungnahme des Europäischen Wirtschafts- und Sozialausschusses', role: 'opinion' },
  OPI_byESC: { label: 'Stellungnahme des Wirtschafts- und Sozialausschusses', role: 'opinion' },
  OPI_byCOR: { label: 'Stellungnahme des Europäischen Ausschusses der Regionen', role: 'opinion' },
  OPI_byECB: { label: 'Stellungnahme der Europäischen Zentralbank', role: 'opinion' },
  OPI_byEDPS: { label: 'Stellungnahme des Europäischen Datenschutzbeauftragten', role: 'opinion' },
  OPI_byECA: { label: 'Stellungnahme des Rechnungshofs', role: 'opinion' },

  // The Official Journal's own station
  PUB_OJ: { label: 'Veröffentlichung im Amtsblatt', role: 'publication' },
}

/** Whether the monitor reads a step of this type. */
export function isReadEuEvent(code: string): boolean {
  return Object.hasOwn(EU_EVENTS, code)
}

/**
 * The Cellar's German label of a procedure type, read from
 * `…/authority/procedure/<code>` on 15.11.2026 — only the types that occur
 * on the map's acts. Printed as a fact beside the procedure number; the
 * station's NAME is read from who adopted the act (`EuAdoptedBy`).
 */
export const EU_PROCEDURE_TYPES: Readonly<Record<string, string>> = {
  OLP: 'Ordentliches Gesetzgebungsverfahren',
  COD: 'Mitentscheidungsverfahren',
  CNS: 'Konsultationsverfahren',
  SYN: 'Verfahren der Zusammenarbeit',
  NLE: 'Rechtsetzungsverfahren ohne Gesetzescharakter',
  APP: 'Besonderes Rechtsetzungsverfahren – Zustimmung des Parlaments',
}
