import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { marked } from 'marked'
import { transformCourseSemanticTags } from '../src/lib/system-course-markdown'

function render(markdown: string): string {
  return transformCourseSemanticTags(marked.parse(markdown) as string)
}

describe('system course semantic Markdown tags', () => {
  it('renders word forms with dictionary actions', () => {
    const changed = render('<lexi-word form="changed">`fifth`</lexi-word>')
    const irregular = render('<lexi-word form="irregular">`went`</lexi-word>')

    expect(changed).toContain('class="course-token token-word form-changed"')
    expect(changed).toContain('data-course-action="lookup"')
    expect(irregular).toContain('class="course-token token-word form-irregular"')
    expect(irregular).toContain('data-course-action="lookup"')
  })

  it('renders sentences with speech-only actions', () => {
    const html = render('<lexi-sentence>`The build passed.`</lexi-sentence>')

    expect(html).toContain('class="course-token token-sentence"')
    expect(html).toContain('data-course-action="speak"')
  })

  it('renders morphemes and phonemes without click actions', () => {
    const morpheme = render('<lexi-morpheme kind="prefix" form="variant">`im-`</lexi-morpheme>')
    const phoneme = render('<lexi-phoneme>`/ɪ/`</lexi-phoneme>')
    const notation = render('<lexi-notation>`F0 = 1 / T`</lexi-notation>')

    expect(morpheme).toContain('class="course-token token-morpheme morpheme-prefix form-variant"')
    expect(morpheme).not.toContain('data-course-action')
    expect(phoneme).toContain('class="course-token token-phoneme"')
    expect(phoneme).not.toContain('data-course-action')
    expect(notation).toContain('class="course-token token-notation"')
    expect(notation).not.toContain('data-course-action')
  })

  it('classifies ordinary inline words and sentences', () => {
    const html = render('`build` and `The build passed.`')

    expect(html).toContain('class="course-token token-word" data-course-action="lookup"')
    expect(html).toContain('class="course-token token-sentence" data-course-action="speak"')
  })

  it('splits lexical alternatives into independent dictionary actions', () => {
    const html = render('`decide / hope / plan / refuse / manage`')

    expect(html).not.toContain('token-sentence')
    expect((html.match(/data-course-action="lookup"/g) ?? [])).toHaveLength(5)
    expect(html).toContain('</code> / <code')
  })

  it('never renders delimited lexical lists in published courses as a sentence token', () => {
    const courseDir = resolve(__dirname, '../public/data/system-courses')
    const files = readdirSync(courseDir).filter(file => /^\d{2}-.*\.md$/.test(file))

    for (const file of files) {
      const html = render(readFileSync(resolve(courseDir, file), 'utf-8'))
      expect(html).not.toMatch(/class="course-token token-sentence"[^>]*>[^<]*(?:\s\/\s|\s→\s|\s\|\s|\s\+\s)/)
    }
  })

  it('supports transitional author tags', () => {
    const html = render('<lexi-irregular>`went`</lexi-irregular> <lexi-variant>`fifth`</lexi-variant>')

    expect(html).toContain('form-irregular')
    expect(html).toContain('form-changed')
  })

  it('does not transform examples inside fenced code blocks', () => {
    const html = render('```markdown\n<lexi-irregular>`went`</lexi-irregular>\n```')

    expect(html).toContain('&lt;lexi-irregular&gt;')
    expect(html).not.toContain('class="form-irregular"')
  })
})
