export interface DocumentFormat {
  type: 'pdf' | 'html'
  url: string
}

export interface DraftDocument {
  title: string
  formats: DocumentFormat[]
}

/**
 * One block of the Kurzinformation (`content.shortinfo`).
 *
 * Upstream ships real semantic HTML — `<h4>Ziel</h4>`, `<ul><li>…` — and the
 * server maps it into these typed blocks rather than flattening it to text or
 * forwarding the markup. Every field is plain text, so nothing upstream can
 * inject HTML into our pages.
 */
export type DescriptionBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }

/** Who published a document the page read: the federal RIS or Parliament (`#shared/utils/provenance`). */
export type Publisher = 'ris' | 'parlament'

export interface TraceLink {
  label: string
  url: string
}

export interface LawDiffSegment {
  type: 'equal' | 'removed' | 'inserted'
  text: string
}
