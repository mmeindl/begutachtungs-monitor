/**
 * Die Gegenprobe zu „ohne Begutachtung".
 *
 * Getestet wird nicht die Ähnlichkeitszahl — die kommt aus `risJoin` und hat
 * dort ihre eigenen Tests —, sondern die vier Entscheidungen, die diese
 * Prüfung zu einer Aussage über ein Regierungsvorhaben machen: gleicher
 * Titel zählt, ein fremder nicht, ein später begonnener Entwurf nie, und die
 * generische Sammelnovelle darf nicht durchrutschen, obwohl der kürzere
 * Titel restlos in ihr aufgeht (der Fehltreffer, an dem sich die Wahl von
 * Jaccard statt Containment entscheidet — 293 d.B. gegen 38/ME auf
 * GP XXVIII, `docs/begutachtung-uebersprungen.md` §2).
 */
import { describe, expect, it } from 'vitest'
import type { DraftSummary } from '../shared/types'
import { findPrecedingDraft } from '../server/utils/parliament/precedingDraft'
import { draftSummary } from './helpers/builders'

/** 73/ME Gewerbeordnung — the draft every assertion below is about. */
const draft = (overrides: Partial<DraftSummary> = {}): DraftSummary => draftSummary({
  inr: 73,
  citation: '73/ME',
  title: 'Gewerbeordnung, Änderung',
  ministryCode: 'BMWET',
  ministryName: 'Bundesministerium für Wirtschaft, Energie und Tourismus',
  arrivedAt: '2025-12-29',
  deadline: '2026-02-20',
  statementCount: 35,
  parliamentUrl: 'https://www.parlament.gv.at/gegenstand/XXVIII/ME/73',
  ...overrides,
})

const GEWERBEORDNUNG = { title: 'Gewerbeordnung, Änderung', date: '2026-07-01' }

describe('findPrecedingDraft', () => {
  it('finds the draft whose title the Vorlage carried on', () => {
    expect(findPrecedingDraft(GEWERBEORDNUNG, [draft()])?.inr).toBe(73)
  })

  it('finds nothing where no draft resembles the Vorlage', () => {
    const v = { title: 'Behinderteneinstellungsgesetz, Änderung', date: '2026-07-08' }
    expect(findPrecedingDraft(v, [draft()])).toBeNull()
  })

  /* Ein Entwurf, der erst nach dem Einlangen begann, kann die Vorgeschichte
   * nicht sein — sonst würde eine spätere Novelle desselben Gesetzes die
   * Vorlage rückwirkend zur begutachteten erklären. */
  it('ignores a draft that started after the Vorlage was filed', () => {
    expect(findPrecedingDraft(GEWERBEORDNUNG, [draft({ arrivedAt: '2026-08-01' })])).toBeNull()
  })

  /* Ohne Datum auf einer der beiden Seiten entscheidet der Titel allein:
   * lieber eine zurückgehaltene Notiz als eine behauptete. */
  it('keeps the match when a date is missing', () => {
    expect(findPrecedingDraft({ ...GEWERBEORDNUNG, date: null }, [draft()])?.inr).toBe(73)
    expect(findPrecedingDraft(GEWERBEORDNUNG, [draft({ arrivedAt: '' })])?.inr).toBe(73)
  })

  /* Der Fall, der die Prüfung überhaupt vorsichtig macht: die Vorlage heißt
   * wie ein Gesetz, das in einer fremden Sammelnovelle mitgeändert wurde.
   * Containment sagt hier 1,00. Trotzdem KEIN Fehlalarm ist nicht das Ziel —
   * gefunden werden SOLL er, denn gefunden heißt: die Zeile schweigt. */
  it('treats a generic collective amendment as a reason to say nothing', () => {
    const asvg = { title: 'Allgemeines Sozialversicherungsgesetz, Änderung', date: '2025-11-18' }
    const sammelnovelle = draft({
      inr: 38,
      citation: '38/ME',
      title: 'Gesundheitstelematikgesetz, Allgemeine Sozialversicherungsgesetz, Änderung',
      arrivedAt: '2025-07-29',
    })
    expect(findPrecedingDraft(asvg, [sammelnovelle])?.inr).toBe(38)
  })

  /* Bei mehreren Kandidaten der ähnlichste, nicht der erste. */
  it('prefers the closest title among several candidates', () => {
    const weak = draft({ inr: 55, citation: '55/ME', title: 'Gewerbeordnung, Emissionsschutzgesetz für Kesselanlagen, Änderung' })
    expect(findPrecedingDraft(GEWERBEORDNUNG, [weak, draft()])?.inr).toBe(73)
  })
})
