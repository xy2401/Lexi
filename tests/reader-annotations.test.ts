import { describe, expect, it } from 'vitest'
import {
  getBasicFunctionWordGloss,
  isAllCapsReaderToken,
  resolveReaderAnnotation,
  resolveReaderEntryAnnotation,
} from '../src/lib/reader-annotations'
import { mergeReaderPreferences } from '../src/lib/reader-types'
import { createNeutralTagStates, type TagStates } from '../src/lib/dictionary-tags'
import { annotateHtml, tokenize } from '../src/lib/tokenizer'

function states(changes: Partial<TagStates> = {}): TagStates {
  return { ...createNeutralTagStates(), ...changes }
}

describe('basic function word annotations', () => {
  it('hides basic function words by default', () => {
    for (const word of ['a', 'is', 'can', 'may', 'will', 'the']) {
      expect(resolveReaderAnnotation(word, '不应使用的 ECDICT 第一义项')).toBeNull()
    }
  })

  it('uses curated compact glosses when explicitly enabled', () => {
    const options = { includeBasicFunctionWords: true }
    expect(resolveReaderAnnotation('a', '第一个字母 A', options)).toBe('一个')
    expect(resolveReaderAnnotation('is', 'be的现在式第三人称', options)).toBe('是/处于')
    expect(resolveReaderAnnotation('can', 'vt. 装罐', options)).toBe('能/可以')
    expect(resolveReaderAnnotation('may', 'n. 五月', options)).toBe('可能/可以')
    expect(resolveReaderAnnotation('will', 'n. 意志', options)).toBe('将/会')
  })

  it('supports contractions and curly apostrophes', () => {
    expect(getBasicFunctionWordGloss("I'm")).toBe('我是')
    expect(getBasicFunctionWordGloss("isn't")).toBe('不是')
    expect(getBasicFunctionWordGloss("can't")).toBe('不能')
    expect(getBasicFunctionWordGloss("won't")).toBe('不会/将不')
    expect(getBasicFunctionWordGloss('isn’t')).toBe('不是')
    expect(tokenize('I’m sure it isn’t.').filter(token => token.isWord).map(token => token.text)).toEqual(['I’m', 'sure', 'it', 'isn’t'])
  })

  it('does not treat uppercase acronyms as lower-case pronouns', () => {
    expect(isAllCapsReaderToken('US')).toBe(true)
    expect(getBasicFunctionWordGloss('US')).toBeNull()
    expect(resolveReaderAnnotation('US', 'pron. 我们', { includeBasicFunctionWords: true })).toBeNull()
    expect(getBasicFunctionWordGloss('I')).toBe('我')
  })

  it('keeps existing compact dictionary behavior for content words', () => {
    expect(resolveReaderAnnotation('book', 'n. 书, 书籍')).toBe('书')
    expect(resolveReaderAnnotation('treasure', 'n. 金银财宝, 财富')).toBe('金银财宝')
  })

  it('keeps hidden words clickable while content words retain ruby', () => {
    const translations: Record<string, string> = { a: '第一个字母 A', is: 'be的现在式第三人称', book: 'n. 书' }
    const html = annotateHtml('<p>a is book</p>', word => resolveReaderAnnotation(word, translations[word.toLowerCase()]))
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(Array.from(doc.querySelectorAll('ruby')).map(element => element.getAttribute('data-word'))).toEqual(['book'])
    expect(Array.from(doc.querySelectorAll('.word-plain')).map(element => element.getAttribute('data-word'))).toEqual(['a', 'is'])
  })
})

describe('reader preference compatibility', () => {
  it('migrates legacy annotation settings to pure reading', () => {
    const merged = mergeReaderPreferences({ theme: 'dark', fontSize: 22, annotationsEnabled: true })
    expect(merged.theme).toBe('dark')
    expect(merged.fontSize).toBe(22)
    expect(merged.annotationTagStates).toEqual(states())
    expect(merged.annotateBasicFunctionWords).toBe(false)
  })

  it('normalizes persisted four-state tags', () => {
    const merged = mergeReaderPreferences({
      annotationTagStates: { ...states(), gre: 'annotate', gk: 'exclude' },
      annotateBasicFunctionWords: true,
    })
    expect(merged.annotationTagStates).toEqual(states({ gre: 'annotate', gk: 'exclude' }))
    expect(merged.annotateBasicFunctionWords).toBe(true)
  })

  it('migrates the development three-mode settings', () => {
    const merged = mergeReaderPreferences({
      annotationMode: 'tag',
      annotationTags: ['gre', 'gk', 'gre'],
      annotateBasicFunctionWords: true,
    })
    expect(merged.annotationTagStates).toEqual(states({ gre: 'annotate', gk: 'annotate' }))
    expect(merged.annotateBasicFunctionWords).toBe(true)
  })
})

describe('reader four-state annotations', () => {
  const academic = { tags: 'gk ielts gre', translation: 'adj. 学术的, 学院的' }

  it('keeps all-neutral reading free of annotations', () => {
    expect(resolveReaderEntryAnnotation('academic', academic, { tagStates: states() })).toBeNull()
  })

  it('shows only the lowest actual tag for words marked as Tag', () => {
    expect(resolveReaderEntryAnnotation('academic', academic, { tagStates: states({ gre: 'annotate' }) }))
      .toEqual({ text: 'gk', kind: 'tag' })
    expect(resolveReaderEntryAnnotation('academic', academic, { tagStates: states({ cet4: 'annotate' }) })).toBeNull()
    expect(resolveReaderEntryAnnotation('academic', academic, { tagStates: states({ ielts: 'annotate', gre: 'annotate' }) }))
      .toEqual({ text: 'gk', kind: 'tag' })
  })

  it('shows meanings only for matching tags', () => {
    expect(resolveReaderEntryAnnotation('academic', academic, { tagStates: states({ gre: 'include' }) })).toBe('学术的')
    expect(resolveReaderEntryAnnotation('academic', academic, { tagStates: states({ cet4: 'include' }) })).toBeNull()
  })

  it('applies exclude above Tag and Tag above meaning', () => {
    expect(resolveReaderEntryAnnotation('academic', academic, {
      tagStates: states({ gre: 'annotate', gk: 'exclude' }),
    })).toBeNull()
    expect(resolveReaderEntryAnnotation('academic', academic, {
      tagStates: states({ gre: 'include', ielts: 'annotate' }),
    })).toEqual({ text: 'gk', kind: 'tag' })
  })

  it('limits curated basic glosses to matching meaning states', () => {
    const entry = { tags: 'zk gk', translation: 'be的现在式第三人称' }
    expect(resolveReaderEntryAnnotation('is', entry, {
      tagStates: states({ gk: 'include' }), includeBasicFunctionWords: true,
    })).toBe('是/处于')
    expect(resolveReaderEntryAnnotation('is', entry, {
      tagStates: states({ gk: 'include' }), includeBasicFunctionWords: false,
    })).toBeNull()
    expect(resolveReaderEntryAnnotation('is', entry, {
      tagStates: states({ gk: 'annotate' }), includeBasicFunctionWords: true,
    })).toEqual({ text: 'zk', kind: 'tag' })
  })

  it('keeps plain words clickable in pure reading', () => {
    const html = annotateHtml('<p>academic reading</p>', word => (
      resolveReaderEntryAnnotation(word, academic, { tagStates: states() })
    ))
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.querySelectorAll('ruby')).toHaveLength(0)
    expect(Array.from(doc.querySelectorAll('.word-plain')).map(element => element.getAttribute('data-word')))
      .toEqual(['academic', 'reading'])
  })
})
