import { describe, expect, it } from 'vitest'
import { parseLawUnits, parseLawUnitsFromRis } from '../server/utils/lawtext/lawUnits'
import { diffLawPackage } from '../server/utils/diff/lawDiff'

/**
 * The null comparison, network-free: one instruction written once as
 * Parliament's Word HTML and once as RIS's legistic XML, the way the two
 * sources print the same law (19.11.2026). Read by the page's two readers
 * and compared by the page's comparison, every pair must come out
 * „unverändert", and neither side may print markup, an entity or a file
 * path as the law's words.
 *
 * Each case is a reader artefact the corpus showed on a served page: a
 * „geändert" for nothing, or a promulgated text printed wrong. The corpus
 * form of the same check is `scripts/harness/station.ts`.
 */

const html = (instruction: string, payload: string): string =>
  `<html><body><p class=11Titel>Bundesgesetz, mit dem das X-Gesetz ge&auml;ndert wird</p>` +
  `<p class=12PromKlEinlSatz>Das X-Gesetz, BGBl. I Nr. 1/2000, wird wie folgt ge&auml;ndert:</p>` +
  `<p class=21NovAo1>1. ${instruction}</p><p class=51Abs>${payload}</p></body></html>`

const ris = (instruction: string, payload: string): string =>
  `<risdok><nutzdaten><abschnitt><ueberschrift typ="titel">Bundesgesetz, mit dem das X-Gesetz ge&auml;ndert wird</ueberschrift>` +
  `<absatz typ="promkleinlsatz">Das X-Gesetz, BGBl. I Nr. 1/2000, wird wie folgt ge&auml;ndert:</absatz>` +
  `<absatz typ="novao1">1. ${instruction}</absatz><absatz typ="abs">${payload}</absatz></abschnitt></nutzdaten></risdok>`

/** [what the case is, Parliament's spelling, RIS's spelling, what both must read]. */
const CASES: [string, string, string, string][] = [
  // 116/ME BVWG-Gesetz Z 5 on ME → Kundmachung: „geändert" for -„[m&sup2;]" +„[m²]".
  ['an entity with a digit in its name', 'Fl&auml;che [m&sup2;]', 'Fläche [m²]', 'Fläche [m²]'],
  // 71/ME Z 32: „geändert" for -„&plusmn;" +„±".
  ['plus-minus', 'Toleranz &plusmn; 5 %', 'Toleranz ± 5 %', 'Toleranz ± 5 %'],
  ['micro and times', '100 &micro;T bei 2 &times; 3', '100 µT bei 2 × 3', '100 µT bei 2 × 3'],
  // 4/ME: the three that were added first, kept by this test.
  ['degree, per mille, ordinal', '20 &deg;C, 5 &permil;, 1&ordm;', '20 °C, 5 ‰, 1º', '20 °C, 5 ‰, 1º'],
  // 60/ME, BGBl. I Nr. 115/2025: „Hypertonie ( 140/90mmHg)", the „>" shown as removed.
  ['RIS greater-than and less-than', 'Hypertonie (&gt; 140/90mmHg), Wert &lt; 5', 'Hypertonie (<gt /> 140/90mmHg), Wert <lt/> 5', 'Hypertonie (> 140/90mmHg), Wert < 5'],
  // 61/ME, BGBl. I Nr. 97/2025: „beträ g t 2 0 Prozent".
  ['RIS letter-spacing inside a word', 'Der Betrag betr&auml;gt 20 Prozent.', 'Der Betrag beträ<gs>g</gs>t 2<gs>0 </gs>Prozent.', 'Der Betrag beträgt 20 Prozent.'],
  // 16/ME, BGBl. I Nr. 25/2025: a U+202C after „25 200".
  ['a bidi control behind a number', 'h&ouml;chstens jedoch 25 200', 'höchstens jedoch 25 200‬', 'höchstens jedoch 25 200'],
  // RIS `<amp/>` — mapped by the reader, before the tags go.
  ['RIS ampersand', 'Forschung &amp; Entwicklung', 'Forschung <amp/> Entwicklung', 'Forschung & Entwicklung'],
  // 62/ME StVO Z 6: the image's file path inserted as the law's words.
  [
    'an image',
    'Zusatztafel <img width=40 height=20 src="image001.png"> wie abgebildet',
    'Zusatztafel <binary alt="Kamera"><src>/Dokumente/BgblAuth/BGBLA_2026_I_17/x.img1is.png</src></binary> wie abgebildet',
    'Zusatztafel [Abbildung] wie abgebildet',
  ],
]

describe('one instruction, two sources: the readers agree (null comparison)', () => {
  for (const [name, parliament, risText, reads] of CASES) {
    it(name, () => {
      const from = parseLawUnits(html('§ 2 lautet:', parliament))
      const to = parseLawUnitsFromRis(ris('§ 2 lautet:', risText))
      expect(from.map((u) => u.id)).toEqual(['Z1'])
      expect(to.map((u) => u.id)).toEqual(['Z1'])
      expect(from[0]!.text).toContain(reads)
      expect(to[0]!.text).toContain(reads)
      const diff = diffLawPackage(from, to)
      expect(diff.unpaired).toBe(false)
      expect(diff.units.map((u) => u.change)).toEqual(['unchanged'])
      for (const u of [...from, ...to]) {
        expect(u.text).not.toMatch(/&[a-z][a-z0-9]*;/i)
        expect(u.text).not.toMatch(/\/Dokumente\//)
        expect(u.text).not.toMatch(/[<>](?:\/?[a-z])/)
      }
    })
  }
})
