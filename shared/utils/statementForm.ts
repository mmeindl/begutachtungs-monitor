/**
 * Parliament's Stellungnahme forms for an item, opened (15.11.2026).
 *
 * The item's page hides both forms: the Stellungnahmen tab (stage 101) shows
 * two closed accordions, „Formular für Privatperson" and „Formular für
 * Institution/Organisation", and the plain page opens on „Übersicht". These
 * addresses open the tab with one form expanded and scroll to it.
 *
 * `persForm` is Parliament's own `formlink`. `orgForm` is linked nowhere on
 * Parliament's pages; it was found by trying and confirmed in a browser on
 * 162/ME XXVIII. Should Parliament drop it, the address still opens the
 * Stellungnahmen tab, with the accordions closed — a longer way, never a dead
 * link.
 *
 * The same stage and parameters on every item type checked in a browser
 * (15.11.2026): Ministerialentwurf (162/ME), Regierungsvorlage (688 d.B.),
 * Ausschussantrag (684 d.B.), Petition (21/PET), Bürgerinitiative (7/BI) —
 * each page's own `formlink` reads `?selectedStage=101&persForm=1#persForm`.
 * NOT CHECKED: a Petition an den Bundesrat (`PET-BR`); none had an open
 * window to try. The rule: `docs/decisions.md`, „A door lands in the form".
 */

export type StatementFormKind = 'person' | 'organisation'

const FORM_PARAM: Record<StatementFormKind, string> = {
  person: 'persForm',
  organisation: 'orgForm',
}

/** `itemUrl`: the item's page, „https://www.parlament.gv.at/gegenstand/XXVIII/ME/162". */
export function statementFormUrl(itemUrl: string, kind: StatementFormKind): string {
  const base = itemUrl.replace(/[?#].*$/, '')
  const param = FORM_PARAM[kind]
  return `${base}?selectedStage=101&${param}=1#${param}`
}
