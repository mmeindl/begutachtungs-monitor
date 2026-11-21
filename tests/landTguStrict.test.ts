import { describe, expect, it } from 'vitest'
import type { LawDiffSegment, LawDiffUnit } from '../shared/types'
import { lawBlocksFromPdfPages } from '../server/utils/laender/draftPdfLaw'
import { guardTguUnits, undrafted } from '../server/utils/laender/landTguGuard'
import { draftWording, quoteRoles, strictTokens } from '../server/utils/laender/landTguStrict'

const unit = (over: Partial<LawDiffUnit>): LawDiffUnit => ({
  article: null, articleKey: null, fromArticleKey: null, id: '§5', fromId: '§5', heading: null, quotedHeading: null,
  change: 'changed', editorial: false, fromText: '', toText: '', segments: null, ...over,
})
/** A changed §, from the segments the page would show: `[new]` marks an inserted stretch, `{old}` a removed one. */
const changed = (id: string, marked: string, over: Partial<LawDiffUnit> = {}): LawDiffUnit => {
  const segments: LawDiffSegment[] = marked.split(/(\[[^\]]*\]|\{[^}]*\})/).filter((s) => s.trim()).map((s) => (
    s.startsWith('[') ? { type: 'inserted', text: s.slice(1, -1).trim() } : s.startsWith('{') ? { type: 'removed', text: s.slice(1, -1).trim() } : { type: 'equal', text: s.trim() }
  ))
  return unit({
    id, fromId: id, segments,
    fromText: segments.filter((s) => s.type !== 'inserted').map((s) => s.text).join(' '),
    toText: segments.filter((s) => s.type !== 'removed').map((s) => s.text).join(' '),
    ...over,
  })
}

const DRAFT = [
  'Gesetz vom ……, mit dem das Fischereigesetz 2002 geändert wird',
  'Der Salzburger Landtag hat beschlossen:',
  'Das Fischereigesetz 2002, LGBl Nr 81/2002, wird geändert wie folgt:',
  '1. § 5 Abs 2 lautet:',
  '„(2) Die Landesregierung hat die Fischereiberechtigten binnen 14 Tagen über jede Änderung der Schonzeiten schriftlich zu informieren. Sie hat ihnen Gelegenheit zur Stellungnahme zu geben.“',
  '2. Im § 17 Abs 1 wird die Zahl „19“ durch die Zahl „18“ ersetzt.',
  '3. Nach § 21 wird eingefügt:',
  '„Maßnahmengebiete',
  '§ 21a',
  '(1) Der Landesfischereiverband kann durch Verordnung Teilbereiche von Fischwässern zu Maßnahmengebieten erklären.',
  'Kundmachung',
  '§ 21b',
  '(1) Verordnungen nach § 21a sind im Landesgesetzblatt kundzumachen.“',
  '4. Im § 30 Abs 1 und 3 wird jeweils das Wort „Pachtentgelt“ durch das Wort „Entgelt“ ersetzt.',
  '5. Im § 31 wird das Wort „Bezirk“ in der jeweiligen grammatikalischen Form durch das Wort „Wahlkreis“ ersetzt.',
  '6. Im § 40 Z 2 wird am Ende der Punkt durch einen Strichpunkt ersetzt und folgende Z 3 angefügt:',
  '„3. die Mittelverwendungen im Ausmaß eines Zwölftels des Vorjahres zu tätigen.“',
  '7. § 41 Abs 2 entfällt.',
  '8. Im § 42 entfällt das Wort „eigene“ und nach dem Wort „Fischer“ wird die Wortfolge „von Bächen und Seen“ eingefügt.',
  '9. Im § 43 wird nach dem Wort „unterrepräsentiert“ die Wortfolge „ist oder es nach § 3 geboten“ eingefügt.',
].join('\n')
const blocks = lawBlocksFromPdfPages([DRAFT])!
const SHOWN_5 = '(1) Die Schonzeiten bestimmt die Landesregierung. (2) Die Landesregierung hat die Fischereiberechtigten {zu hören.} [binnen 14 Tagen über jede Änderung der Schonzeiten schriftlich zu informieren. Sie hat ihnen Gelegenheit zur Stellungnahme zu geben.]'
const ask = (...units: LawDiffUnit[]) => {
  const guard = guardTguUnits(units, blocks)
  return { strict: guard.strict.get(0)!, bag: guard.checks.get(0)!, off: undrafted(guard).get(0) }
}

describe('strictTokens', () => {
  it('keeps every number, which the bag rule\'s reading drops', () => {
    expect(strictTokens('(2) binnen 14 Tagen, § 5 Abs. 1 Z 3')).toEqual(['2', 'binnen', '14', 'tagen', '§', '5', 'abs', '1', 'z', '3'])
  })

  it('normalises typography only: quotes, dashes, a word broken at a line\'s end', () => {
    expect(strictTokens('„Verord- nung“ – Land- und Forstwirtschaft')).toEqual(strictTokens('Verordnung - Land- und Forstwirtschaft'))
    expect(strictTokens('Natura 2000- Schutzgüter')).toEqual(strictTokens('Natura 2000-Schutzgüter'))
    expect(strictTokens('Fach-Sozialbetreuung')).toEqual(['fachsozialbetreuung'])
  })

  it('reads what a misread font left in a line as the sign it stands for', () => {
    expect(strictTokens('ãnach Maflgabe ¸ber den T‰tigkeitsberichtÒ')).toEqual(strictTokens('„nach Maßgabe über den Tätigkeitsbericht“'))
  })
})

describe('quoteRoles', () => {
  const roles = (line: string) => quoteRoles(line).map((q) => q.role)

  it('tells the new wording from the old and from the place, with the verb at either end', () => {
    expect(roles('Im § 17 Abs. 1 wird die Zahl „19“ durch die Zahl „18“ ersetzt.')).toEqual(['old', 'new'])
    expect(roles('Im § 13 Abs. 3 wird nach dem Wortlaut „BGBl. II Nr. 281/2006,“ der Wortlaut „in der Fassung der Verordnung BGBl. II Nr. XX/XXX,“ eingefügt.')).toEqual(['anchor', 'new'])
    expect(roles('Im § 8 Abs. 3 entfällt die Wortfolge „in den Jahren 2013 bis 2022“.')).toEqual(['old'])
    expect(roles('Im § 7 hat die Wortfolge „bekannt gegebene Faxnummer oder“ und die Wortfolge „eine Faxnummer oder“ zu entfallen.')).toEqual(['old', 'old'])
    expect(roles('Im § 8 Abs. 1 entfällt die Wortfolge „oder des Erholungswertes“ und wird das Wort „Bezirkshauptmannschaft“ durch das Wort „Landesregierung“ ersetzt.')).toEqual(['old', 'old', 'new'])
    expect(roles('§ 25 Abs. 1 entfällt und die bisherigen Abs. 2, 3 und 3a erhalten die Bezeichnung „(1)“, „(2)“ und „(3)“.')).toEqual(['new', 'new', 'new'])
    expect(roles('Im § 19 Abs. 5 werden die Wörter „Vorlage“ und „Beibringung“ jeweils durch das Wort „Übermittlung“ ersetzt.')).toEqual(['old', 'old', 'new'])
    expect(roles('Im Abs 1 lautet der erste Satz: „Zur Mitfinanzierung leistet das Land Beiträge.“')).toEqual(['new'])
    // The verb before the first quotation is not the third one's: an auxiliary opens its clause (Oö. 2026-16120).
    expect(roles('Im § 7 Abs. 3 entfällt das Wort „geschlechtsbezogene“ und nach dem Wort „Verhaltensweisen“ wird die Wortfolge „in Bezug auf einen im § 3 Abs. 1 genannten Grund“ eingefügt.')).toEqual(['old', 'anchor', 'new'])
    // The place at the line's start, capitalised (Oö. 2026-16124, § 44a).
    expect(roles('Nach der Überschrift „VII. Abschnitt - Schluss- und Übergangsbestimmungen“ wird folgender neuer § 44a eingefügt:')).toEqual(['anchor'])
  })

  it('reads „„X“ wird durch …", a word replaced by a sign, and a payload that says „sinngemäß" itself (Oö. 2026-16120, 2026-16124, Tirol 575/2026, Salzburg 32075; 21.11.2026)', () => {
    expect(roles('Im § 2 Abs. 4 wird die Wortfolge „, die einem Geschlecht angehören,“ durch die Wortfolge „aus einem der Gründe“ ersetzt und die Wortfolge „Personen des anderen Geschlechts“ wird durch die Wortfolge „anderen Personen“ ersetzt.')).toEqual(['old', 'new', 'old', 'new'])
    expect(roles('Im § 27 Abs. 2 Z 6 wird das Wort „und“ am Ende von lit. a durch einen Strichpunkt ersetzt und nach lit. b folgende lit. c eingefügt:')).toEqual(['old'])
    expect(roles('Im § 22 Abs. 3 lit. f werden der Beistrich und das Wort „und“ am Ende durch einen Punkt ersetzt und die lit. g aufgehoben.')).toEqual(['old'])
    expect(roles('Im § 16 Abs 2 wird angefügt: „Den Umweltorganisationen ist der Bescheid unter sinngemäßer Anwendung des § 55a zuzustellen.“')).toEqual(['new'])
    // The sign replaces what its own clause names, not a quote of another clause (Oö. 2026-16124 § 27, Salzburg 32025 § 25).
    expect(roles('Im § 27 Abs. 2 wird in Z 9 nach dem Wort „Immissionsgrenzwertes“ die Wortfolge „bzw. einer Umweltqualitätsnorm“ eingefügt und der Punkt am Ende durch einen Strichpunkt ersetzt sowie folgende Z 10 angefügt:')).toEqual(['anchor', 'new'])
    expect(roles('Im § 25 Abs 1 erhalten die Z 3 und 4 die Bezeichnungen „2.“ und „3.“, wobei in der Z 3 neu der Punkt am Ende durch einen Strichpunkt ersetzt wird, und lautet die Z 4 neu:')).toEqual(['new', 'new'])
  })

  it('does not guess: a range of designations, a replacement left to the reader\'s grammar', () => {
    expect(roles('Im § 24a erhalten die bisherigen Abs. 1 bis 8 die Bezeichnungen „(2)“ bis „(9)“.')).toEqual(['new', null])
    expect(roles('Im § 31 wird das Wort „Bezirk“ in der jeweiligen grammatikalischen Form durch das Wort „Wahlkreis“ ersetzt.')).toContain(null)
  })
})

describe('draftWording', () => {
  it('cuts a payload that prints several §§ at their designations, the headings with them', () => {
    const law = [...draftWording(blocks, (u) => (/Nach § 21/.test(u.text) ? ['§ 21a', '§ 21b'] : [])).values()][0]!
    expect(law.byKey.get('§ 21a')!.wordings.map((w) => w.tokens.filter((_, i) => !w.optional[i]).join(' '))).toEqual(['1 der landesfischereiverband kann durch verordnung teilbereiche von fischwässern zu maflnahmengebieten erklären'])
    expect(law.byKey.get('§ 21b')!.wordings[0]!.tokens.filter((_, i) => !law.byKey.get('§ 21b')!.wordings[0]!.optional[i]).slice(0, 4)).toEqual(['1', 'verordnungen', 'nach', '§'])
    // The anchor of the insertion gets none of it.
    expect(law.byKey.get('§ 21')!.wordings).toEqual([])
  })
})

describe('the strict check (20.11.2026)', () => {
  it('holds a § whose new text is the draft\'s wording, word for word', () => {
    const r = ask(changed('§5', SHOWN_5))
    expect(r.strict).toMatchObject({ state: 'holds', notInDraft: [], notShown: [] })
    expect(r.off).toBeUndefined()
  })

  it('sees a changed number, a wrongly read word and a lost sentence — none of which the bag rule sees', () => {
    const number = ask(changed('§5', SHOWN_5.replace('14 Tagen', '21 Tagen')))
    expect(number.bag.notInDraft).toBe(false)
    expect(number.strict).toMatchObject({ state: 'differs', notInDraft: ['21'], notShown: ['14'] })
    expect(number.off).toBe('draftDiffers')

    const word = ask(changed('§5', SHOWN_5.replace('schriftlich', 'mündlich')))
    expect(word.bag.notInDraft).toBe(false)
    expect(word.strict).toMatchObject({ state: 'differs', notInDraft: ['mündlich'], notShown: ['schriftlich'] })

    const sentence = ask(changed('§5', SHOWN_5.replace(' Sie hat ihnen Gelegenheit zur Stellungnahme zu geben.', '')))
    expect(sentence.bag.notInDraft).toBe(false)
    expect(sentence.strict.state).toBe('differs')
    expect(sentence.strict.notInDraft).toEqual([])
    expect(sentence.strict.notShown).toEqual(['sie', 'hat', 'ihnen', 'gelegenheit', 'zur', 'stellungnahme', 'zu', 'geben'])
  })

  it('sees words in another order', () => {
    expect(ask(changed('§5', SHOWN_5.replace('schriftlich zu informieren', 'zu informieren schriftlich'))).strict.state).toBe('differs')
  })

  it('holds a replacement quoted in the instruction\'s line, and sees another number in its place', () => {
    expect(ask(changed('§17', '(1) Die Berufsausübung setzt die Vollendung des {19.} [18.] Lebensjahres voraus.')).strict.state).toBe('holds')
    const off = ask(changed('§17', '(1) Die Berufsausübung setzt die Vollendung des {19.} [25.] Lebensjahres voraus.'))
    expect(off.strict).toMatchObject({ state: 'differs', notInDraft: ['25'], notShown: ['18'] })
  })

  it('takes „jeweils" for every place the stretch stands at', () => {
    expect(ask(changed('§30', '(1) Das {Pachtentgelt} [Entgelt] ist zu entrichten. (3) Das {Pachtentgelt} [Entgelt] gemäß Abs. 1 ist zu verteilen.')).strict.state).toBe('holds')
  })

  it('holds an inserted §, and one of two a payload prints, the heading and the designation aside', () => {
    const a = unit({ id: '§21a', fromId: null, change: 'inserted', heading: 'Maßnahmengebiete', toText: '(1) Der Landesfischereiverband kann durch Verordnung Teilbereiche von Fischwässern zu Maßnahmengebieten erklären.' })
    expect(ask(a).strict.state).toBe('holds')
    // The last sentence gone: the next §'s heading is not taken for it.
    expect(ask({ ...a, toText: '(1) Der Landesfischereiverband kann durch Verordnung Teilbereiche erklären.' }).strict).toMatchObject({ state: 'differs', notShown: ['von', 'fischwässern', 'zu', 'maflnahmengebieten'] })
  })

  it('does not take punctuation for a word, nor the cut of a diff for a difference', () => {
    // „am Ende der Punkt durch einen Strichpunkt ersetzt", and the new Ziffer cut one word early.
    expect(ask(changed('§40', '2. die Abgaben einzuheben und die Mittelaufbringungen zu {tätigen.} [tätigen; 3. die Mittelverwendungen im Ausmaß eines Zwölftels des Vorjahres zu] tätigen.')).strict.state).toBe('holds')
  })

  it('does not take for new a word the new stretch keeps of the removed one, wherever in it', () => {
    // The diff pairs „Fischer," with „Fischer" inside a longer stretch; the instruction inserts after it.
    expect(ask(changed('§42', 'wenn unerwünschte {eigene Fischer,} [Fischer von Bächen und Seen,] die Behörde stören.')).strict.state).toBe('holds')
  })

  it('finds a stretch quoted in an instruction\'s line at the other cut of the diff too (Oö. 2026-16120, § 9)', () => {
    expect(ask(changed('§43', 'wenn eine Gruppe unterrepräsentiert [ist oder es nach § 3 geboten] ist, kann die Behörde handeln.')).strict.state).toBe('holds')
  })

  it('reads „entfallen" at a repealed Absatz as the instruction, not as text', () => {
    expect(ask(changed('§41', '(1) Die Behörde entscheidet. (2) {Sie hört die Gemeinde.} [entfallen]')).strict.state).toBe('holds')
  })
})

describe('what the strict check cannot hold is said, and the bag rule decides (20.11.2026)', () => {
  it('a § no instruction of the draft names', () => {
    const r = ask(changed('§77', '(1) Die Behörde [kann Auflagen vorschreiben].'))
    expect(r.strict).toMatchObject({ state: 'unchecked', reason: 'keine Anordnung des Entwurfs nennt den Paragraphen' })
    expect(r.off).toBeUndefined()
  })

  it('an instruction whose quotation is not the wording as it will stand', () => {
    const r = ask(changed('§31', 'Die Listen der {Bezirke} [Wahlkreise] sind zu veröffentlichen.'))
    expect(r.strict.state).toBe('unchecked')
    expect(r.strict.reason).toMatch(/^Anführung ohne lesbare Rolle/)
  })

  it('keeps the bag rule\'s verdict there, either way', () => {
    const foreign = '(1) Die Behörde entscheidet. [Die Gemeinde hat binnen vierzehn Tagen ein Verzeichnis sämtlicher Kraftfahrzeuge samt Kennzeichen elektronisch an die Bezirkshauptmannschaft zu übermitteln.]'
    const r = ask(changed('§31', foreign))
    expect(r.strict.state).toBe('unchecked')
    expect(r.bag.notInDraft).toBe(true)
    expect(r.off).toBe('notInDraft')
  })

  it('a draft that could not be read disarms both', () => {
    const guard = guardTguUnits([changed('§5', SHOWN_5.replace('14 Tagen', '21 Tagen'))], null)
    expect(guard.strict.size).toBe(0)
    expect(undrafted(guard).size).toBe(0)
  })
})

describe('the strict check\'s own misses, closed (21.11.2026)', () => {
  const DRAFT_2 = [
    'Gesetz vom ……, mit dem das Naturschutzgesetz 1999 geändert wird',
    'Der Salzburger Landtag hat beschlossen:',
    'Das Naturschutzgesetz 1999, LGBl Nr 73/1999, wird geändert wie folgt:',
    '1. Nach § 48 wird eingefügt:',
    '„Besondere Verfahren',
    '§ 48a',
    '(1) Die Entscheidungspflicht der Behörde richtet sich nach',
    '§ 73 AVG; die Entscheidungsfrist beginnt mit Einlangen des Antrages zu laufen.',
    '(2) Tötungen geschützter Arten gelten nicht als absichtlich.“',
    '2. Im § 47 werden am Ende der Z 8 der Beistrich durch einen Punkt ersetzt und die Z 9 aufgehoben.',
    '3. Im § 38 Abs 2 und 2a wird jeweils der letzte Satz durch folgende Sätze ersetzt: „Der Befund ist der Behörde zu übermitteln. Die Meldepflicht ist elektronisch zu erfüllen.“',
    '4. Im § 8 Abs 2 lautet der Einleitungsteil: „Die Fertigstellung ist der Behörde anzuzeigen. Die Anzeige ist in elektronischer Form zu übermitteln. Der Anzeige sind anzuschließen:“',
    '5. § 9 Abs 1 lautet:',
    '„(1) Die Anzeige ist in elektronischer Form zu übermitteln.“',
  ].join('\n')
  const blocks2 = lawBlocksFromPdfPages([DRAFT_2])!
  const strict2 = (u: LawDiffUnit) => guardTguUnits([u], blocks2).strict.get(0)!

  it('reads a citation the draft wrapped onto a line of its own as the sentence\'s end, not as a § (Salzburg 32025, § 48a)', () => {
    const whole = unit({ id: '§48a', fromId: null, change: 'inserted', heading: 'Besondere Verfahren', toText: '(1) Die Entscheidungspflicht der Behörde richtet sich nach § 73 AVG; die Entscheidungsfrist beginnt mit Einlangen des Antrages zu laufen. (2) Tötungen geschützter Arten gelten nicht als absichtlich.' })
    expect(strict2(whole).state).toBe('holds')
    // The last Absatz lost: the payload is the §'s to its end, so its words are missing.
    expect(strict2({ ...whole, toText: whole.toText!.replace(/ \(2\).*$/, '') })).toMatchObject({ state: 'differs', notShown: ['2', 'tötungen', 'geschützter', 'arten', 'gelten', 'nicht', 'als', 'absichtlich'] })
  })

  it('does not take a single new word from the address an instruction names (Tirol 728/2026, § 47)', () => {
    const shown = (n: string) => changed('§47', `Umgesetzt werden: 8. Richtlinie A, ABl. L 1, S. {1, 9. Richtlinie B, ABl. L 2, S. 82.} [${n}.]`)
    expect(strict2(shown('1')).state).toBe('holds')
    // „am Ende der Z 8": the 8 is the instruction's place, not its wording.
    expect(strict2(shown('8'))).toMatchObject({ state: 'differs', notInDraft: ['8'] })
  })

  it('does not take part of a quoted wording for the instruction\'s text where the whole stands elsewhere (Oö. 2025-16103, § 38)', () => {
    const at2a = '(2a) Die Anlage ist zu melden. {Der Befund ist vorzulegen.} [Der Befund ist der Behörde zu übermitteln. Die Meldepflicht ist elektronisch zu erfüllen.]'
    expect(strict2(changed('§38', `(2) Der Antrag ist zu stellen. {Der Befund ist vorzulegen.} [Der Befund ist der Behörde zu übermitteln. Die Meldepflicht ist elektronisch zu erfüllen.] ${at2a}`)).state).toBe('holds')
    // „jeweils": the second sentence lost at Abs. 2, whole at Abs. 2a.
    expect(strict2(changed('§38', `(2) Der Antrag ist zu stellen. {Der Befund ist vorzulegen.} [Der Befund ist der Behörde zu übermitteln.] ${at2a}`)).state).toBe('differs')
  })

  it('says a § differs where the draft\'s wording for it is missing, though its new text stands elsewhere in the draft (Salzburg 34728, § 8)', () => {
    expect(strict2(changed('§8', '(1) … (2) Die Fertigstellung ist der Behörde anzuzeigen. {Dabei} [Die Anzeige ist in elektronischer Form zu übermitteln. Der Anzeige] sind {folgende Unterlagen} anzuschließen:')).state).toBe('holds')
    // „Der Anzeige" lost: the quoted Einleitungsteil does not stand, whoever else writes the sentence before it (§ 9).
    expect(strict2(changed('§8', '(1) … (2) Die Fertigstellung ist der Behörde anzuzeigen. {Dabei} [Die Anzeige ist in elektronischer Form zu übermitteln.] sind {folgende Unterlagen} anzuschließen:')).state).toBe('differs')
  })
})
