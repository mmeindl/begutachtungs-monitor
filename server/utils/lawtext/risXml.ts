/**
 * RIS Begut main-document XML → the same flat blocks as the Parliament HTML
 * reader, and the one home for the RIS element vocabulary of a draft.
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 */
import type { BlockKind, TextBlock } from './lawUnits'
import { ARTICLE_RE } from './parliamentHtml'
import { stripTags } from './normalize'

// ---------------------------------------------------------------------------
// RIS layout XML (Applikation=Begut main document) → the same blocks
// ---------------------------------------------------------------------------

/**
 * RIS types → block kinds. Verified on three GP XXVII drafts (IFG, EAG,
 * EABG): ueberschrift typ para|g1|g1min|g2|titel|anlage, absatz typ
 * abs|novao1|novao2|satz|promkleinlsatz|tabtext|tabtextb|kz, listelem,
 * inhaltsvz. Page header/footer (`kzinhalt`) and `layoutdaten` are noise.
 */
const RIS_HEADING_KIND: Record<string, BlockKind> = {
  para: 'para_head',
  g1: 'article',
  g1min: 'section',
  g2: 'section',
  anlage: 'section',
  titel: 'title',
}
const RIS_ABSATZ_KIND: Record<string, BlockKind> = {
  abs: 'abs',
  novao1: 'novao',
  novao2: 'novao',
}

/**
 * `schlussteil` is the text that closes an enumeration — "… hat jede
 * Veränderung, insbesondere a) …, b) …, e) … *der Schulbehörde unverzüglich
 * anzuzeigen*". Leaving it out of this list dropped that closing sentence
 * from every RIS-XML document silently: from the payload of an amendment
 * instruction, and from both sides of the ME→RV comparison for GP XXVII and
 * earlier. `lawStructure.ts` had it from the start; this parser did not, and
 * the mismatch surfaced only when the two were compared against RIS
 * (Privatschulgesetz § 4, 2026-09-09).
 *
 * **RIS writes that clause under two names**, and which one a document
 * carries depends on the converter that produced it, not on the law: the 4.1
 * line writes `<schlussteil>`, the 3.x line `<schluss typ="…">`, 4.0
 * straddles. `lawStructure.ts` learned the older name on 2026-09-11 (402 of
 * 16.073 § documents in the offline corpus carry only it); this parser reads
 * the Begut main documents, where — unlike the § documents — both spellings
 * occur *inside one document*. Without the older name the payload of an
 * amendment instruction lost its closing clause, so the draft bags of the
 * annex check („nicht im Entwurf") lacked words the annex rightly shows as
 * new, and the ME→RV units lacked the same words on both sides.
 */
const RIS_BLOCK_RE = /<(ueberschrift|absatz|listelem|schlussteil|schluss|inhaltsvz)\b([^>]*)>([\s\S]*?)<\/\1>/g
const RIS_GLD_RE = /<gldsym>([\s\S]*?)<\/gldsym>/

function risText(inner: string): string {
  return stripTags(inner.replace(/<gdash\s*\/>/g, '-').replace(/<nbsp\s*\/>/g, ' '))
}

/** RIS Begut main-document XML → flat block list, same kinds as the Parliament HTML parser. */
export function parseRisXml(xml: string): TextBlock[] {
  // `fzinhalt` is the page FOOTER RIS prints under every page
  // ("www.ris.bka.gv.at   Seite 2 von 2"), the counterpart to the `kzinhalt`
  // header. Without it the footer came through as an ordinary Absatz with no
  // designation, which on the Erläuterungen is a passage the section shows:
  // measured over the offline cache on 22.09.2026, 180 of 314 readable
  // Erläuterungen documents carried it. The two sibling parsers strip all
  // three (`lawStructure.ts`, `textComparison.ts`); this one did not.
  const body = xml
    .replace(/<kzinhalt[\s\S]*?<\/kzinhalt>/g, '')
    .replace(/<fzinhalt[\s\S]*?<\/fzinhalt>/g, '')
    .replace(/<layoutdaten[\s\S]*?<\/layoutdaten>/g, '')
  // Blocks inside a table keep their kind (the ME→RV comparison reads cell
  // text like any other) but carry a `table:` prefix in `cls`, so the
  // amendment engine can refuse a payload that is a table.
  const tables = [...body.matchAll(/<table\b[\s\S]*?<\/table>/g)].map((t) => [t.index!, t.index! + t[0].length] as const)
  const inTable = (at: number): boolean => tables.some(([from, to]) => at >= from && at < to)
  const blocks: TextBlock[] = []
  for (const m of body.matchAll(RIS_BLOCK_RE)) {
    const tag = m[1]!
    const typ = /typ="([^"]+)"/.exec(m[2]!)?.[1] ?? ''
    const inner = m[3]!
    const gldMatch = RIS_GLD_RE.exec(inner)
    const gld = gldMatch ? risText(gldMatch[1]!) : null
    const text = risText(gldMatch ? inner.replace(gldMatch[0], ' ') : inner)
    if (!text && !gld) continue
    let kind: BlockKind
    if (tag === 'ueberschrift') {
      kind = RIS_HEADING_KIND[typ] ?? 'other'
      if (kind === 'article' || kind === 'section') kind = ARTICLE_RE.test(text) ? 'article' : 'section'
    } else if (tag === 'absatz') {
      if (typ === 'kz') continue
      kind = RIS_ABSATZ_KIND[typ] ?? 'other'
    } else if (tag === 'listelem') {
      kind = 'ziff'
    } else if (tag === 'schlussteil' || tag === 'schluss') {
      // Continuation of the Absatz that opened the list, not a unit of its
      // own — `parsePayload` and `segmentUnits` both append an unmarked
      // block to the Absatz above it, which is exactly right here. The older
      // spelling names the unit it closes in `typ` (Abs, Ziff, Lit, e<n>);
      // a flat block list has no slot for that level, and document order is
      // what the consumers need, so both spellings land the same way.
      kind = 'abs'
    } else {
      kind = 'toc'
    }
    blocks.push({ kind, cls: `${inTable(m.index!) ? 'table:' : ''}${tag}/${typ}`, text, gld: gld || null })
  }
  return blocks
}
