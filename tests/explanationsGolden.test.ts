import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseExplanationsHtml } from '../server/utils/explanations/explanationsHtml'
import { readLandExplanations } from '../server/utils/laender/landExplanationsRead'

/**
 * Four real Erläuterungen, frozen, with what the readers make of them
 * (21.11.2026).
 *
 * Every other reasoning test is synthetic, and a synthetic fixture holds
 * only what was already understood; a change of Parliament's Word HTML or a
 * Land's PDF layout, or a reader regression on a real document, reached the
 * pages with every test green. So four documents are checked in as they
 * are (provenance: `tests/fixtures/README.md`):
 *
 * - `XXVIII-ME-37.html` and `XXVIII-I-210.html` — the Erläuterungen of
 *   37/ME XXVIII and of its Regierungsvorlage 210 d.B., Parliament's Word
 *   HTML as the Begründungsvergleich reads it (`parseExplanationsHtml`). A
 *   package of two Artikel, each passage under its Artikel.
 * - `ooe-16101-pages.json` — the text pages of Oberösterreich's draft 16101
 *   (Oö. Sozialhilfe-Ausführungsgesetz-Novelle 2025), Erläuterungen and law
 *   text in one PDF: three Artikel, the third the Inkrafttreten.
 * - `sbg-31199-pages.json` — the same for Salzburg's draft 31199
 *   (Dienstrechts-Sammelnovelle): four Artikel, its entries named by Ziffer
 *   alone („Zu Art II Z 1:"), the § read off the draft's instruction.
 *
 * The Land texts as pages, not as PDF: the test reads what
 * `readLandExplanations` reads, without pdf.js. A change here is a change of
 * what a page shows — read it before moving a value.
 */
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/erlaeuterungen/${name}`, import.meta.url)), 'utf8')

/** A passage as the golden holds it: Artikel, heading, §§, Ziffern, characters of its text. */
const passagesOf = (html: string) =>
  parseExplanationsHtml(html).special.map((p) => [p.article, p.heading, p.paragraphs, p.ziffern.map((z) => `${z.article ?? '–'}:${z.ziffer}`), p.text.join(' ').length])

describe('Parliament\'s Erläuterungen of 37/ME and 210 d.B. XXVIII', () => {
  const golden = [
    ['1', 'Zu Art. 1 (Änderung des Allgemeinen Sozialversicherungsgesetzes):', [], [], 0],
    ['1', 'Zu Z 1 (§ 44 Abs. 3 ASVG):', ['§ 44'], ['1:1'], 2269],
    ['2', 'Zu Art. 2 (Änderung des Arbeitsvertragsrechts-Anpassungsgesetzes):', [], [], 0],
    ['2', 'Zu Z 1 (§ 2j):', ['§ 2j'], ['2:1'], 1412],
  ]

  it('reads the Entwurf\'s passages, each under its Artikel', () => {
    expect(parseExplanationsHtml(fixture('XXVIII-ME-37.html')).general).toHaveLength(4)
    expect(passagesOf(fixture('XXVIII-ME-37.html'))).toEqual(golden)
  })

  it('reads the Vorlage\'s the same', () => {
    expect(parseExplanationsHtml(fixture('XXVIII-I-210.html')).general).toHaveLength(4)
    expect(passagesOf(fixture('XXVIII-I-210.html'))).toEqual(golden)
  })
})

/** A Land's draft read as its page reads it: the pages, from the one document the record lists. */
async function readLand(land: 'ooe' | 'sbg', pagesFile: string, title: string, document: { title: string; url: string }) {
  const pages = JSON.parse(fixture(pagesFile)) as string[]
  const read = await readLandExplanations(land, { draft: { title, documents: [document] } }, async () => new Uint8Array(), async () => pages)
  return read.response
}
const entriesOf = (particular: { heading: string; law: string | null; paras: string[]; text: string[] }[]) => particular.map((e) => [e.heading, e.law, e.paras, e.text.join(' ').length])

describe('Oberösterreich\'s draft 16101', () => {
  it('reads the general part and every entry, each at its Artikel\'s law', async () => {
    const r = await readLand('ooe', 'ooe-16101-pages.json', 'Landesgesetz, mit dem das Oö. Sozialhilfe-Ausführungsgesetz und das Oö. Sozialhilfegesetz 1998 geändert werden (Oö. Sozialhilfe-Ausführungsgesetz-Novelle 2025)', {
      title: 'Begutachtungsentwurf',
      url: 'https://www2.land-oberoesterreich.gv.at/internetltgbeilagen/Beilage%2016101/2025%20-%20Begutachtungsentwurf.pdf?id=21948&n=16101&j=2025',
    })
    expect(r.available).toBe(true)
    expect(r.general.map((g) => g.heading)).toEqual([
      'A. Allgemeiner Teil',
      'I. Anlass und Inhalt des Gesetzentwurfs',
      'II. Kompetenzgrundlagen',
      'III. Finanzielle Auswirkungen auf die Gebietskörperschaften',
      'IV. Finanzielle Auswirkungen auf Bürgerinnen und Bürger und auf Unternehmen',
      'V. Verhältnis zu Rechtsvorschriften der Europäischen Union',
      'VI. Auswirkungen auf die verschiedenen Gruppen der Gesellschaft, insbesondere auf Frauen und Männer',
      'VII. Auswirkungen in umweltpolitischer Hinsicht, insbesondere Klimaverträglichkeit',
      'VIII. Besonderheiten des Gesetzgebungsverfahrens',
    ])
    const sohag = 'Oö. Sozialhilfe-Ausführungsgesetz'
    expect(entriesOf(r.particular)).toEqual([
      ['Zu Artikel I (Änderung Oö. Sozialhilfe-Ausführungsgesetz):', sohag, [], 0],
      ['Zu Art. I Z 1 (§ 1 Abs. 2 Z 3a):', sohag, ['1'], 1012],
      ['Zu Art. I Z 2 und 3 (§ 12 Abs. 1, 2a und 2b):', sohag, ['12'], 4712],
      ['Zu Art. I Z 4 (§ 13 Abs. 5):', sohag, ['13'], 1980],
      ['Zu Art. I Z 5 (§ 14 Abs. 3):', sohag, ['14'], 502],
      ['Zu Art. I Z 6 bis 8 (§ 19):', sohag, ['19'], 1557],
      ['Zu Art. I Z 9 (§ 22 Abs. 4):', sohag, ['22'], 107],
      ['Zu Art. I Z 10 (§ 24 Abs. 1):', sohag, ['24'], 270],
      ['Zu Art. I Z 11 (§ 28 Abs. 2):', sohag, ['28'], 661],
      ['Zu Art. I Z 12 bis 17 (§ 41 Abs. 1, Abs. 7 und Abs. 7a):', sohag, ['41'], 5312],
      ['Zu Art. II (Änderung Oö. Sozialhilfegesetz 1998):', 'Oö. Sozialhilfegesetz 1998', [], 166],
      // The Inkrafttreten amends no law: under none.
      ['Zu Art. III (Inkrafttreten):', null, [], 248],
    ])
  })
})

describe('Salzburg\'s draft 31199', () => {
  it('reads every entry, its Ziffer resolved in its own Artikel', async () => {
    const r = await readLand('sbg', 'sbg-31199-pages.json', 'Gesetz, mit dem das Salzburger Landes-Beamtengesetz 1987, das Landes Vertragsbedienstetengesetz 2000 und das Landesbediensteten-Gehaltsgesetz geändert werden', {
      title: 'Entwurf',
      url: 'https://service.salzburg.gv.at/pub/get/31199',
    })
    expect(r.available).toBe(true)
    expect(r.general.map((g) => g.heading)).toEqual(['1. Allgemeines', '2. Verfassungsrechtliche Grundlage', '3. Übereinstimmung mit EU-Recht', '4. Kosten', '5. Erläuterungen zu den einzelnen Bestimmungen'])
    const lbg = 'Salzburger Landes-Beamtengesetz 1987'
    const lvbg = 'Landes-Vertragsbedienstetengesetz 2000'
    const gehg = 'Landesbediensteten-Gehaltsgesetz'
    expect(entriesOf(r.particular)).toEqual([
      ['Zu Art I (Salzburger Landes-Beamtengesetz 1987):', lbg, [], 0],
      ['Zu Art I Z 1:', lbg, ['112'], 970],
      ['Zu Art I Z 2:', lbg, ['130'], 155],
      ['Zu Art I Z 3:', lbg, ['136'], 105],
      ['Zu Art II (Landes-Vertragsbedienstetengesetz 2000):', lvbg, [], 0],
      // „1. Im § 1 Abs 3 entfällt die Z 5." of Artikel II, not Artikel I's Z 1 (§ 112).
      ['Zu Art II Z 1:', lvbg, ['1'], 429],
      ['Zu Art II Z 2:', lvbg, ['87'], 69],
      ['Zu Art III (Landesbediensteten-Gehaltsgesetz):', gehg, [], 0],
      ['Zu Art III Z 1 und 2:', gehg, ['3', '6'], 1397],
      ['Zu Art III Z 3:', gehg, ['38'], 35],
      ['Zu Art III Z 4:', gehg, ['46'], 35],
      ['Zu Art IV Z 5:', null, [], 156],
    ])
  })
})
