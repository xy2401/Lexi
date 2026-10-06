import { describe, expect, it } from 'vitest'
import { getWordForms } from '../src/lib/morphology'

describe('word forms by part of speech', () => {
  it('does not teach letter-name plurals as pronoun forms', () => {
    expect(getWordForms({ word: 'i', translation: 'pron. 我\\n[计] 电流', pos: 'p:100', exchange: 's:is' })).toEqual([])
    expect(getWordForms({ word: 'he', translation: 'pron. 他\\nn. 男孩', exchange: 's:they' })).toEqual([{ key: 's', label: '对应复数代词', value: 'they' }])
    expect(getWordForms({ word: 'they', translation: 'pron. 他们', exchange: '0:it' }, true)).toEqual([])
  })

  it('keeps verb forms while discarding unsupported noun plurals', () => {
    const forms = getWordForms({ word: 'be', translation: 'v. 是\\n[计] 后端', exchange: 'p:was/3:is/d:been/i:being/s:bes' })
    expect(forms.map(form => form.value)).toEqual(['is', 'was', 'been', 'being'])
    expect(forms.find(form => form.key === '3')?.label).toBe('第三人称单数')
    expect(getWordForms({ word: 'do', pos: 'v:100', exchange: '3:does/s:does' }).map(form => form.key)).toEqual(['3'])
  })

  it('preserves noun and verb senses in mixed entries, including duplicate spellings', () => {
    const forms = getWordForms({ word: 'book', translation: 'n. 书\\nv. 预订', exchange: 's:books/p:booked/3:books' })
    expect(forms.map(form => [form.label, form.value])).toEqual([
      ['第三人称单数', 'books'], ['名词复数', 'books'], ['过去式', 'booked'],
    ])
    expect(getWordForms({ word: 'good', pos: 'a:95/n:5', exchange: 'r:better/t:best/s:goods' }).map(form => form.value)).toEqual(['better', 'best', 'goods'])
  })

  it('supports both newline formats and adjective/adverb comparisons', () => {
    expect(getWordForms({ word: 'fast', translation: 'a. 快\nadv. 快速地', exchange: 'r:faster/t:fastest/s:fasts' }).map(form => form.key)).toEqual(['r', 't'])
    expect(getWordForms({ word: 'quickly', pos: 'ad:100', exchange: 'r:more quickly' })[0]?.value).toBe('more quickly')
  })

  it('omits metadata and unknown labels and only shows base forms when requested', () => {
    const entry = { word: 'books', pos: 'n:100', exchange: '0:book/1:s/z:metadata' }
    expect(getWordForms(entry)).toEqual([])
    expect(getWordForms(entry, true)).toEqual([{ key: '0', label: '原型', value: 'book' }])
    expect(getWordForms({ exchange: 's:guesses' })).toEqual([])
    expect(getWordForms(null)).toEqual([])
  })
})
