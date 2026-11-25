/**
 * Who publishes the monitor (25.11.2026): the Medieninhaber of `/impressum`
 * and the controller of `/datenschutz`. Both pages wrote name and address
 * out; they now read them here, because a fact stated twice drifts apart.
 *
 * Since 25.11.2026 that is the Verein, in the words of its register entry
 * (Zentrales Vereinsregister, extract of 25.11.2026). Before, it was the
 * maintainer as a private person.
 *
 * WHY THE BOARD STANDS HERE BY NAME. § 25 Abs 2 MedienG asks a Verein that
 * is Medieninhaber for its board and its purpose. The names are the
 * maintainer's decision and, like the address, a deliberate exception to
 * „no personal data in the repository"; all four stand in the public
 * register. The functions are the register's own words.
 *
 * WHY NO RULE OF REPRESENTATION. The register carries it in full (who signs
 * alone, what needs two signatures). Half of it here would be relied on.
 *
 * WHY THE ADDRESS HAS NO DOOR NUMBER. The page showed street and house
 * number before the Verein existed, and that stays: it is where post
 * arrives, in care of the Obmann. The register holds the full
 * Zustellanschrift for whoever needs it.
 *
 * A copy of the monitor run by someone else replaces this file: its
 * Impressum is its own.
 */
export const PUBLISHER = {
  name: 'ViewYourState – Verein für Transparenz und Beteiligung in der Gesetzgebung',
  /** The name without its statutory addition, for running text. */
  shortName: 'ViewYourState',
  careOf: 'Manuel Meindl',
  street: 'Steingasse 1',
  place: '4020 Linz, Österreich',
  /** Number in the Zentrales Vereinsregister. */
  zvr: '1362744418',
  board: [
    { name: 'Manuel Meindl', role: 'Obmann' },
    { name: 'Severin Ströhle', role: 'Obmann-Stellvertreter' },
    { name: 'Regina Meindl', role: 'Kassierin' },
    { name: 'Tanja Roither', role: 'weiteres Vorstandsmitglied' },
  ],
} as const

/** The board in one line: „Name (Funktion), Name (Funktion), …". */
export function boardLineOf(board: ReadonlyArray<{ name: string; role: string }>): string {
  return board.map((member) => `${member.name} (${member.role})`).join(', ')
}
