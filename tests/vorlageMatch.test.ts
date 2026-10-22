import { describe, expect, it } from 'vitest'
import { containedIn, pickByVorlage, shingles } from '../server/utils/laender/vorlageMatch'

describe('vorlageMatch — which Landesgesetzblatt holds the draft', () => {
  const draft = shingles('Im § 28 wird angefügt: (3) Das Land kann Schulerhaltern der unter dieses Gesetz fallenden Schulen einzelne Unterrichtsmittel bereitstellen.')

  it('finds the draft in its own Regierungsvorlage, with the Landtag\'s front matter around it', () => {
    const vorlage = shingles('Nr 148 der Beilagen. Vorlage der Landesregierung. Im § 28 wird angefügt: (3) Das Land kann Schulerhaltern der unter dieses Gesetz fallenden Schulen einzelne Unterrichtsmittel bereitstellen. Erläuterungen …')
    expect(containedIn(draft, vorlage)).toBe(1)
  })

  it('picks a candidate only with the threshold and twice the runner-up', () => {
    expect(pickByVorlage([{ candidate: 'a', share: 0.9 }, { candidate: 'b', share: 0.1 }])).toBe('a')
    expect(pickByVorlage([{ candidate: 'a', share: 0.9 }, { candidate: 'b', share: 0.5 }])).toBeNull()
    expect(pickByVorlage([{ candidate: 'a', share: 0.5 }])).toBeNull()
  })
})
