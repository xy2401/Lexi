import { describe, expect, it } from 'vitest'
import {
  getDictionaryTagAnnotation,
  matchesDictionaryTagFilter,
  nextTagFilterMode,
  type TagStates,
} from '../src/stores/dict'
import { annotateHtml } from '../src/lib/tokenizer'

function states(changes: Partial<TagStates> = {}): TagStates {
  return {
    zk: 'neutral', gk: 'neutral', cet4: 'neutral', cet6: 'neutral',
    ky: 'neutral', ielts: 'neutral', toefl: 'neutral', gre: 'neutral',
    ...changes,
  }
}

describe('dictionary tag annotation state', () => {
  it('preserves the existing cycle and appends annotation before neutral', () => {
    expect(nextTagFilterMode('neutral')).toBe('include')
    expect(nextTagFilterMode('include')).toBe('exclude')
    expect(nextTagFilterMode('exclude')).toBe('annotate')
    expect(nextTagFilterMode('annotate')).toBe('neutral')
  })

  it('does not use annotation state as a list filter', () => {
    const tagStates = states({ ielts: 'annotate' })
    expect(matchesDictionaryTagFilter('gk', tagStates)).toBe(true)
    expect(matchesDictionaryTagFilter('ielts', tagStates)).toBe(true)
    expect(matchesDictionaryTagFilter('', tagStates)).toBe(true)
  })

  it('shows the lowest-level tag when a marked word has several tags', () => {
    const tagStates = states({ ielts: 'annotate' })
    expect(getDictionaryTagAnnotation('gk cet4 ielts toefl', tagStates)).toBe('gk')
    expect(getDictionaryTagAnnotation('ielts toefl', tagStates)).toBe('ielts')
  })

  it('keeps translations for words that do not match an annotation state', () => {
    expect(getDictionaryTagAnnotation('gk cet4', states({ ielts: 'annotate' }))).toBeNull()
  })

  it('keeps exclusion above annotation and include as a union', () => {
    const tagStates = states({ gk: 'exclude', ielts: 'annotate', toefl: 'include' })
    expect(matchesDictionaryTagFilter('gk ielts toefl', tagStates)).toBe(false)
    expect(matchesDictionaryTagFilter('ielts toefl', tagStates)).toBe(true)
    expect(matchesDictionaryTagFilter('ielts', tagStates)).toBe(false)
  })

  it('marks tag annotations separately from translated ruby text', () => {
    const html = annotateHtml('<p>academic</p>', () => ({ text: 'gk', kind: 'tag' }))
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const ruby = doc.querySelector('ruby')
    expect(ruby?.dataset.annotationKind).toBe('tag')
    expect(ruby?.querySelector('rt')?.textContent).toBe('gk')
  })
})
