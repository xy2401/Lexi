import { describe, expect, it } from 'vitest'
import { getBasicFunctionWordGloss, isAllCapsReaderToken, resolveReaderAnnotation } from '../src/lib/reader-annotations'
import { mergeReaderPreferences } from '../src/lib/reader-types'
import { annotateHtml, tokenize } from '../src/lib/tokenizer'

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
  it('adds the disabled basic-word default to legacy saved preferences', () => {
    const merged = mergeReaderPreferences({ theme: 'dark', fontSize: 22 })
    expect(merged.theme).toBe('dark')
    expect(merged.fontSize).toBe(22)
    expect(merged.annotateBasicFunctionWords).toBe(false)
  })
})
