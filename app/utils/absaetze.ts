/**
 * Die Lesefassung absatzweise, nicht als eine Wand.
 *
 * `bodyText` trennt die Absätze mit einem Zeilenumbruch, aber der Wortdiff
 * normalisiert Weißraum — in den Segmenten ist er weg (gemessen 19.09.2026:
 * 0 von 3 Segmenten trugen noch einen). Ein § mit achtzehn Absätzen stand
 * deshalb als ein Block, „(1) … (2) … (3) …" mitten im Fließtext: Die Marker
 * waren wieder da, die Gliederung nicht.
 *
 * Getrennt wird deshalb an der Marke selbst, und zwar OHNE die
 * Segmentgrenzen zu verletzen: Ein Segment ist ein Lauf gleicher Art
 * (`equal | inserted | removed`), und ein Absatzwechsel mitten darin
 * schneidet nur den Text, nie die Art. Ein eingefügter Absatz bleibt dadurch
 * grün, auch wenn er einen eigenen Block bekommt.
 *
 * Die Marke ist `(1)`, `(2a)` — Ziffern in Klammern am Wortanfang. „(EU)
 * 2018/1808" trifft sie nicht (Buchstaben), „Abs. 1" auch nicht (keine
 * Klammern); das sind die beiden Formen, die im selben Text daneben stehen.
 */
import type { LawDiffSegment } from '../../shared/types'

const ABS_MARK = /(?=\(\d+[a-z]?\)\s)/

export function absaetze(segments: LawDiffSegment[]): LawDiffSegment[][] {
  const out: LawDiffSegment[][] = []
  let current: LawDiffSegment[] = []
  for (const seg of segments) {
    const pieces = seg.text.split(ABS_MARK)
    for (const [i, text] of pieces.entries()) {
      if (!text) continue
      // Ein neuer Block beginnt bei jeder Marke außer der allerersten des
      // Paragraphen — sonst stünde ein leerer Block davor.
      const startsAbsatz = i > 0 || /^\(\d+[a-z]?\)\s/.test(text)
      if (startsAbsatz && current.length) {
        out.push(current)
        current = []
      }
      current.push({ ...seg, text })
    }
  }
  if (current.length) out.push(current)
  return out.length ? out : [segments]
}
