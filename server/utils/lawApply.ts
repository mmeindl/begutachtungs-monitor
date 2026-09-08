/**
 * Applies Novellierungsanordnungen to the standing law (docs/architecture.md §12.12).
 *
 * PURE MODULE — relative imports only, so vitest runs it directly.
 *
 * `novao.ts` reads an instruction, `lawStructure.ts` holds the law it acts
 * on, and this module performs the act. It never improvises:
 *
 * 1. **A phrase operation must match exactly once** in its addressed scope.
 *    Zero matches means the address or the quoted text is wrong; several
 *    means the instruction is ambiguous without a human. Both are refused.
 * 2. **A target must exist.** Appending to a missing § silently invents law.
 * 3. **A created id must not exist yet**, or an insert would shadow a real
 *    paragraph.
 *
 * Every refusal comes back with a reason, and a paragraph that carries even
 * one refused operation must be shown as instructions, not as text — the
 * caller enforces that, `unresolved` reports it.
 */
import { childById, makeNode, plainText, type LawNode, type NodeLevel } from './lawStructure'
import { normalizeText, type LawUnit } from './lawText'
import { parseInstruction, type NovaoAddress, type NovaoOp } from './novao'

export interface StandingLaw {
  /** Paragraphs in printed order; insert and append change this list */
  paragraphs: LawNode[]
}

/** An instruction together with the text it installs, if any. */
export interface Instruction {
  op: NovaoOp
  /** The quoted new text of the draft, already split into blocks */
  payload: LawNode[]
  /** For the report: the instruction line as printed */
  line: string
}

export interface ApplyResult {
  line: string
  kind: NovaoOp['kind']
  applied: boolean
  reason: string | null
  /** The paragraph the instruction touched, e.g. "§ 5" */
  para: string | null
}

export interface ApplyReport {
  law: StandingLaw
  results: ApplyResult[]
  /** Paragraphs with at least one refused instruction — never publishable as text */
  unresolved: Set<string>
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

const PARA_LINE = /^§\s*(\d+[a-z]*)\.\s*/
const ABS_LINE = /^\((\d+[a-z]*)\)\s*/
const Z_LINE = /^(\d+[a-z]*)\.\s+/
const LIT_LINE = /^([a-z]{1,2})\)\s+/

/**
 * The quoted text of an instruction, as printed lines → nodes. The draft
 * prints its new text with the same markers the law uses, which is what
 * makes an inserted Absatz addressable the moment it lands.
 */
export function parsePayload(lines: readonly string[]): LawNode[] {
  const out: LawNode[] = []
  let para: LawNode | null = null
  let abs: LawNode | null = null
  let z: LawNode | null = null
  /** "§ 5 lautet samt Überschrift:" prints the new heading on its own line, above the §. */
  let pendingHeading: string | null = null
  for (const raw of lines) {
    const line = normalizeText(raw)
    if (!line) continue
    const pm = PARA_LINE.exec(line)
    if (pm) {
      para = makeNode('para', pm[1]!, `§ ${pm[1]}.`, '', pendingHeading)
      pendingHeading = null
      out.push(para)
      abs = null
      z = null
      const rest = line.slice(pm[0].length)
      const am = ABS_LINE.exec(rest)
      abs = makeNode('abs', am ? am[1]! : '', am ? `(${am[1]})` : '', am ? rest.slice(am[0].length) : rest)
      para.children.push(abs)
      continue
    }
    const am = ABS_LINE.exec(line)
    if (am) {
      abs = makeNode('abs', am[1]!, `(${am[1]})`, line.slice(am[0].length))
      z = null
      if (para) para.children.push(abs)
      else out.push(abs)
      continue
    }
    const lm = LIT_LINE.exec(line)
    if (lm) {
      const lit = makeNode('lit', lm[1]!, `${lm[1]})`, line.slice(lm[0].length))
      if (z) z.children.push(lit)
      else if (abs) abs.children.push(lit)
      else out.push(lit)
      continue
    }
    const zm = Z_LINE.exec(line)
    if (zm) {
      // "Dem § 3 wird folgende Z 15 angefügt:" installs a Ziffer with no
      // Absatz above it. Falling through left the marker inside the text,
      // and the harness scored the leaked number as invented law.
      z = makeNode('z', zm[1]!, `${zm[1]}.`, line.slice(zm[0].length))
      if (abs) abs.children.push(z)
      else out.push(z)
      continue
    }
    if (abs) abs.text = `${abs.text} ${line}`.trim()
    else if (pendingHeading === null) pendingHeading = line
    else out.push(makeNode('abs', '', '', line))
  }
  // A heading with nothing behind it is the payload of "Die Überschrift … lautet:".
  if (pendingHeading !== null && out.length === 0) out.push(makeNode('para', '', '', '', pendingHeading))
  return out
}

/**
 * The quotation marks around a payload belong to the *instruction*, not to
 * the law text it installs — "In § 60 wird folgender Abs. 44 angefügt:
 * \u0022(44) …\u0022". Leaving them in put a stray quote into the consolidated
 * text and made an otherwise perfect § 60 fail the harness (2026-09-08).
 */
export function stripPayloadQuotes(lines: readonly string[]): string[] {
  const out = lines.map((l) => normalizeText(l)).filter(Boolean)
  if (out.length === 0) return out
  out[0] = out[0]!.replace(/^["\u00ab\u2039]\s*/, '')
  const last = out.length - 1
  out[last] = out[last]!.replace(/\s*["\u00bb\u203a]$/, '')
  return out
}

/**
 * One payload block as a printed line.
 *
 * A § symbol arrives separately in `gld`, but a Ziffer or Litera marker is
 * part of the block text and RIS prints it without a space ("1.Altersprädikat").
 * `parsePayload` then fails to see a marker and the number leaks into the law
 * text — which the harness scored as the engine inventing a token. The space
 * is restored here rather than in the parser, because the ME↔RV comparison
 * reads the same blocks from two sources that print markers differently, and
 * changing what counts as compared text there stops units from pairing.
 */
function payloadLine(b: { kind: string; text: string; gld: string | null }): string {
  if (b.gld) return `${b.gld} ${b.text}`
  if (b.kind !== 'ziff') return b.text
  return b.text.replace(/^(\d+[a-z]*\.|[a-z]\))(?=\S)/, '$1 ')
}

/**
 * The instructions of a parsed Novelle, each with the text it installs.
 *
 * A unit can hold more than one instruction: "§ 20 wird wie folgt geändert:"
 * is a container whose a) and b) sub-instructions follow in the same unit,
 * and they inherit its address. Treating them as payload swallowed them
 * silently — which is why the split lives here and not in a script.
 */
export function instructionsFromUnits(units: readonly LawUnit[]): { instructions: Instruction[]; refused: { line: string; reason: string }[] } {
  const instructions: Instruction[] = []
  const refused: { line: string; reason: string }[] = []
  for (const unit of units) {
    const groups: { line: string; payload: string[] }[] = []
    for (const b of unit.blocks) {
      if (b.kind === 'novao') groups.push({ line: b.text, payload: [] })
      else if (groups.length) groups[groups.length - 1]!.payload.push(payloadLine(b))
    }
    let container: NovaoAddress | null = null
    for (const group of groups) {
      const parsed = parseInstruction(group.line, container)
      if (parsed.ops.length === 0) {
        refused.push({ line: group.line, reason: parsed.reason ?? 'nicht gelesen' })
        continue
      }
      for (const op of parsed.ops) {
        if (op.kind === 'container') {
          container = op.target
          continue
        }
        instructions.push({ op, payload: parsePayload(stripPayloadQuotes(group.payload)), line: group.line })
      }
    }
  }
  return { instructions, refused }
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

function paraKey(a: NovaoAddress): string | null {
  return a.para
}

/** "§ 5" → the id "5"; "Art. 3" → "3"; "Anlage 2" → "2". */
function idOf(label: string | null): string | null {
  if (!label) return null
  const m = /(\d+[a-z]*(?:\.\d+)?)/.exec(label)
  return m ? m[1]! : null
}

function findParagraph(law: StandingLaw, a: NovaoAddress): LawNode | null {
  const id = idOf(a.para)
  return id === null ? null : (law.paragraphs.find((p) => p.id === id) ?? null)
}

/**
 * A § whose text is not split into numbered Absätze still gets one node, with
 * an empty id — a definition paragraph ("§ 2. Im Sinne dieses Bundesgesetzes
 * bedeuten:") hangs its Ziffern there. An address like "§ 2 Z 3" names no
 * Absatz, so the descent has to pass through that unnumbered node instead of
 * failing. Found by the harness on the Energieausweis-Vorlage-Gesetz.
 */
function childThrough(node: LawNode, level: NodeLevel, id: string): LawNode | null {
  const direct = childById(node, level, id)
  if (direct) return direct
  for (const child of node.children) {
    if (child.id === '' && child.level !== level) {
      const nested = childById(child, level, id)
      if (nested) return nested
    }
  }
  return null
}

/**
 * The node an address points at, descending Abs → Z → lit. Returns null as
 * soon as a level is missing: a partially resolved address is not a target.
 */
export function resolveTarget(law: StandingLaw, a: NovaoAddress, overrideDeepest?: string): LawNode | null {
  const para = findParagraph(law, a)
  if (!para) return null
  const levels: (readonly [NodeLevel, string | null])[] = [
    ['abs', a.abs],
    ['z', a.z],
    ['lit', a.lit],
  ]
  let node: LawNode = para
  let deepestIndex = -1
  levels.forEach(([, id], i) => {
    if (id !== null) deepestIndex = i
  })
  for (const [i, [level, id]] of levels.entries()) {
    if (id === null) continue
    const wanted = overrideDeepest !== undefined && i === deepestIndex ? overrideDeepest : id
    const child = childThrough(node, level, wanted)
    if (!child) return null
    node = child
  }
  return node
}

// ---------------------------------------------------------------------------
// Text operations
// ---------------------------------------------------------------------------

/** Every text-carrying node in the subtree, in printed order. */
function textNodes(node: LawNode): LawNode[] {
  return [node, ...node.children.flatMap(textNodes)]
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let n = 0
  let i = haystack.indexOf(needle)
  while (i >= 0) {
    n++
    i = haystack.indexOf(needle, i + needle.length)
  }
  return n
}

/**
 * Rule 1 in practice: find the one node whose text contains `needle` exactly
 * once, across the whole addressed scope. Anything else — not found,
 * found twice, found in two nodes — is a refusal, not a choice.
 */
function uniqueHost(scope: LawNode, needle: string): { node: LawNode } | { error: string } {
  const hosts = textNodes(scope).filter((n) => n.text.includes(needle))
  const total = textNodes(scope).reduce((sum, n) => sum + countOccurrences(n.text, needle), 0)
  if (total === 0) return { error: `Textstelle nicht gefunden: "${needle.slice(0, 60)}"` }
  if (total > 1) return { error: `Textstelle ${total}× gefunden, nicht eindeutig: "${needle.slice(0, 60)}"` }
  return { node: hosts[0]! }
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

const ORDINALS: Record<string, number> = {
  erster: 0, zweiter: 1, dritter: 2, vierter: 3, fünfter: 4, sechster: 5, siebenter: 6, siebter: 6, achter: 7, neunter: 8, zehnter: 9,
}

/** Sentence-level addressing ("§ 5 Abs. 1 zweiter Satz"), on the node's own text. */
function replaceSentence(node: LawNode, satz: string, replacement: string): string | null {
  const parts = node.text.match(/[^.!?]+[.!?]+(?:\s|$)/g)
  if (!parts) return null
  const index = satz === 'letzter' ? parts.length - 1 : satz === 'vorletzter' ? parts.length - 2 : (ORDINALS[satz] ?? -1)
  if (index < 0 || index >= parts.length) return null
  parts[index] = replacement.endsWith(' ') ? replacement : `${replacement} `
  return parts.join('').trim()
}

function levelOf(child: string): NodeLevel | null {
  return child === 'abs' || child === 'z' || child === 'lit' || child === 'para' ? (child as NodeLevel) : null
}

/** Insert `nodes` into `host.children` behind (or in front of) the anchor. */
function spliceChildren(host: LawNode, anchorId: string | null, level: NodeLevel, nodes: LawNode[], where: 'after' | 'before'): boolean {
  if (anchorId === null) {
    host.children.push(...nodes)
    return true
  }
  const at = host.children.findIndex((c) => c.level === level && c.id === anchorId)
  if (at < 0) return false
  host.children.splice(where === 'after' ? at + 1 : at, 0, ...nodes)
  return true
}

/**
 * Applies one instruction. Mutates `law`; returns null on success or the
 * reason for refusal.
 */
function applyOne(law: StandingLaw, { op, payload }: Instruction): string | null {
  switch (op.kind) {
    case 'toc':
      // The table of contents follows from the headings; deriving it is
      // safer than applying instructions to it.
      return null
    case 'container':
      return null

    case 'replaceHeading': {
      const para = findParagraph(law, op.target)
      if (!para) return `§ nicht im geltenden Text: ${op.target.para}`
      const heading = payload.map((p) => plainText(p)).join(' ').trim()
      if (!heading) return 'Überschrift ohne neuen Text'
      para.heading = heading
      return null
    }

    case 'replace': {
      const ids = [op.target.level === 'para' ? (idOf(op.target.para) ?? '') : deepestId(op.target), ...op.target.siblings]
      if (op.target.level === 'para') {
        const para = findParagraph(law, op.target)
        if (!para) return `§ nicht im geltenden Text: ${op.target.para}`
        // The payload of a § replacement is the § itself; a heading line in
        // front of it is that §'s new Überschrift, not a block of its own.
        const replacement = payload.find((p) => p.level === 'para') ?? payload[0]
        if (!replacement) return 'Ersetzung ohne neuen Text'
        const at = law.paragraphs.indexOf(para)
        const next = { ...replacement, level: 'para' as const, id: para.id, marker: para.marker, heading: op.withHeading ? replacement.heading : para.heading }
        law.paragraphs.splice(at, 1, next)
        return null
      }
      if (ids.length !== payload.length && payload.length > 0 && ids.length > 1) {
        return `${ids.length} Ziele, aber ${payload.length} Textblöcke`
      }
      for (const [i, id] of ids.entries()) {
        const node = resolveTarget(law, op.target, id)
        if (!node) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
        const block = payload[i] ?? payload[0]
        if (!block) return 'Ersetzung ohne neuen Text'
        if (op.target.satz) {
          const next = replaceSentence(node, op.target.satz, plainText(block))
          if (next === null) return `Satz ${op.target.satz} nicht auffindbar`
          node.text = next
        } else {
          node.text = block.text || plainText(block)
          node.children = block.children
        }
      }
      return null
    }

    case 'delete': {
      const ids = [deepestId(op.target), ...op.target.siblings]
      for (const id of ids) {
        if (op.target.level === 'para') {
          const at = law.paragraphs.findIndex((p) => p.id === id)
          if (at < 0) return `§ nicht im geltenden Text: § ${id}`
          law.paragraphs.splice(at, 1)
          continue
        }
        const node = resolveTarget(law, op.target, id)
        if (!node) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
        const parent = parentOf(law, node)
        if (!parent) return 'Elternknoten nicht gefunden'
        parent.children.splice(parent.children.indexOf(node), 1)
      }
      return null
    }

    case 'append': {
      const host = resolveTarget(law, op.target)
      if (!host) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
      if (payload.length === 0) return 'Anfügung ohne Text'
      // A Satz is not a node: it joins the target's own text. Common enough
      // that refusing it cost a fifth of the appends in the harness.
      if (op.child === 'satz') {
        const added = payload.map((p) => plainText(p)).join(' ').trim()
        if (!added) return 'Anfügung ohne Text'
        host.text = `${host.text} ${added}`.replace(/\s+/g, ' ').trim()
        return null
      }
      const level = levelOf(op.child)
      if (!level) return 'Angefügte Einheit nicht bestimmbar'
      const nodes = payload.map((p) => ({ ...p, level }))
      for (const n of nodes) if (n.id && childById(host, level, n.id)) return `${n.marker} existiert bereits`
      host.children.push(...nodes)
      return null
    }

    case 'insertAfter': {
      const level = levelOf(op.child)
      if (!level) return 'Eingefügte Einheit nicht bestimmbar'
      if (payload.length === 0) return 'Einfügung ohne Text'
      if (level === 'para') {
        const anchor = findParagraph(law, op.anchor)
        if (!anchor) return `Anker nicht im geltenden Text: ${op.anchor.para}`
        for (const p of payload) if (p.id && law.paragraphs.some((x) => x.id === p.id)) return `§ ${p.id} existiert bereits`
        const at = law.paragraphs.indexOf(anchor)
        law.paragraphs.splice(op.where === 'after' ? at + 1 : at, 0, ...payload.map((p) => ({ ...p, level: 'para' as const })))
        return null
      }
      // A sub-unit insert names its anchor at the same level inside the §.
      const para = findParagraph(law, op.anchor)
      if (!para) return `§ nicht im geltenden Text: ${op.anchor.para}`
      const host = op.anchor.level === 'para' ? para : (resolveTarget(law, op.anchor) ?? para)
      const anchorId = op.anchor.level === 'para' ? null : deepestId(op.anchor)
      const container = anchorId && host !== para ? (parentOf(law, host) ?? para) : para
      const nodes = payload.map((p) => ({ ...p, level }))
      for (const n of nodes) if (n.id && childById(container, level, n.id)) return `${n.marker} existiert bereits`
      if (!spliceChildren(container, anchorId, level, nodes, op.where)) return `Anker nicht gefunden: ${op.anchor.raw.slice(0, 60)}`
      return null
    }

    case 'renumber': {
      const node = op.target.level === 'para' ? findParagraph(law, op.target) : resolveTarget(law, op.target)
      if (!node) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
      const id = idOf(op.to) ?? op.to.replace(/[^\w]/g, '')
      if (!id) return 'Neue Bezeichnung nicht lesbar'
      node.id = id
      node.marker = op.to
      return null
    }

    case 'replacePhrase': {
      const scope = scopeOf(law, op.target)
      if (!scope) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
      if (op.everywhere) {
        let hits = 0
        for (const n of scope.flatMap(textNodes)) {
          const c = countOccurrences(n.text, op.from)
          if (c) {
            hits += c
            n.text = n.text.split(op.from).join(op.to)
          }
        }
        return hits === 0 ? `Textstelle nicht gefunden: "${op.from.slice(0, 60)}"` : null
      }
      const found = uniqueHostIn(scope, op.from)
      if ('error' in found) return found.error
      found.node.text = found.node.text.replace(op.from, op.to)
      return null
    }

    case 'insertPhrase': {
      const scope = scopeOf(law, op.target)
      if (!scope) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
      const found = uniqueHostIn(scope, op.anchor)
      if ('error' in found) return found.error
      const node = found.node
      const at = node.text.indexOf(op.anchor)
      node.text = op.where === 'after'
        ? `${node.text.slice(0, at + op.anchor.length)} ${op.text}${node.text.slice(at + op.anchor.length)}`.replace(/\s+/g, ' ')
        : `${node.text.slice(0, at)}${op.text} ${node.text.slice(at)}`.replace(/\s+/g, ' ')
      return null
    }

    case 'deletePhrase': {
      const scope = scopeOf(law, op.target)
      if (!scope) return `Nicht im geltenden Text: ${op.target.raw.slice(0, 60)}`
      const found = uniqueHostIn(scope, op.text)
      if ('error' in found) return found.error
      found.node.text = found.node.text.replace(op.text, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim()
      return null
    }
  }
}

function deepestId(a: NovaoAddress): string {
  return a.lit ?? a.z ?? a.abs ?? idOf(a.para) ?? ''
}

/** All nodes an address scopes over — several when the address lists siblings. */
function scopeOf(law: StandingLaw, a: NovaoAddress): LawNode[] | null {
  if (a.level === 'document') return law.paragraphs
  const ids = [deepestId(a), ...a.siblings]
  const nodes: LawNode[] = []
  for (const id of ids) {
    const node = a.level === 'para' ? (law.paragraphs.find((p) => p.id === id) ?? null) : resolveTarget(law, a, id)
    if (!node) return null
    nodes.push(node)
  }
  return nodes
}

function uniqueHostIn(scope: LawNode[], needle: string): { node: LawNode } | { error: string } {
  if (scope.length === 1) return uniqueHost(scope[0]!, needle)
  const hits = scope.map((s) => uniqueHost(s, needle)).filter((r): r is { node: LawNode } => 'node' in r)
  if (hits.length === 0) return { error: `Textstelle nicht gefunden: "${needle.slice(0, 60)}"` }
  if (hits.length > 1) return { error: `Textstelle in ${hits.length} Einheiten, nicht eindeutig` }
  return hits[0]!
}

function parentOf(law: StandingLaw, node: LawNode): LawNode | null {
  for (const para of law.paragraphs) {
    const stack: LawNode[] = [para]
    while (stack.length) {
      const n = stack.pop()!
      if (n.children.includes(node)) return n
      stack.push(...n.children)
    }
  }
  return null
}

/** Deep copy, so a refused run leaves the standing law untouched. */
export function cloneLaw(law: StandingLaw): StandingLaw {
  const clone = (n: LawNode): LawNode => ({ ...n, children: n.children.map(clone) })
  return { paragraphs: law.paragraphs.map(clone) }
}

/**
 * Applies a Novelle. Instructions run in printed order — legistic drafting
 * assumes that, e.g. renumbering before a later instruction addresses the
 * new number.
 */
export function applyNovelle(input: StandingLaw, instructions: readonly Instruction[]): ApplyReport {
  const law = cloneLaw(input)
  const results: ApplyResult[] = []
  const unresolved = new Set<string>()
  for (const instruction of instructions) {
    const { op, line } = instruction
    const target = 'target' in op ? op.target : 'anchor' in op ? op.anchor : null
    const para = target?.para ?? null
    let reason: string | null
    try {
      reason = applyOne(law, instruction)
    } catch (err) {
      reason = `Fehler beim Anwenden: ${String(err)}`
    }
    results.push({ line, kind: op.kind, applied: reason === null, reason, para })
    if (reason !== null && para) unresolved.add(para)
  }
  return { law, results, unresolved }
}
