/**
 * The counter-check to „ohne Begutachtung".
 *
 * What is tested is not the similarity figure — that comes from `risJoin` and
 * has its own tests there — but the four decisions that turn this check into
 * a statement about a government project: an identical title counts, a
 * foreign one does not, a draft that started later never does, and the
 * generic Sammelnovelle must not slip through although the shorter title is
 * wholly contained in it (the false hit that decides the choice of Jaccard
 * over containment — 293 d.B. against 38/ME in GP XXVIII,
 * `docs/begutachtung-uebersprungen.md` §2).
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

  /* A draft that started only after the filing cannot be the prior history —
   * otherwise a later Novelle of the same law would retroactively declare the
   * Vorlage a consulted one. */
  it('ignores a draft that started after the Vorlage was filed', () => {
    expect(findPrecedingDraft(GEWERBEORDNUNG, [draft({ arrivedAt: '2026-08-01' })])).toBeNull()
  })

  /* Without a date on one of the two sides the title decides alone: better a
   * withheld note than a claimed one. */
  it('keeps the match when a date is missing', () => {
    expect(findPrecedingDraft({ ...GEWERBEORDNUNG, date: null }, [draft()])?.inr).toBe(73)
    expect(findPrecedingDraft(GEWERBEORDNUNG, [draft({ arrivedAt: '' })])?.inr).toBe(73)
  })

  /* The case that makes the check cautious in the first place: the Vorlage
   * is named like a law that was amended along the way in an unrelated
   * Sammelnovelle. Containment says 1,00 here. NOT raising a false alarm is
   * nonetheless not the aim — it SHOULD be found, because found means: the
   * row says nothing. */
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

  /* Among several candidates the closest one, not the first. */
  it('prefers the closest title among several candidates', () => {
    const weak = draft({ inr: 55, citation: '55/ME', title: 'Gewerbeordnung, Emissionsschutzgesetz für Kesselanlagen, Änderung' })
    expect(findPrecedingDraft(GEWERBEORDNUNG, [weak, draft()])?.inr).toBe(73)
  })
})
