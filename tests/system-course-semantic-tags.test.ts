import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
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
    const publicDir = resolve(__dirname, '../public')
    const courses: { file: string }[] = JSON.parse(readFileSync(resolve(publicDir, 'data/system-courses.json'), 'utf8'))

    for (const course of courses) {
      const html = render(readFileSync(resolve(publicDir, course.file.slice(1)), 'utf-8'))
      expect(html).not.toMatch(/class="course-token token-sentence"[^>]*>[^<]*(?:\s\/\s|\s→\s|\s\|\s|\s\+\s)/)
    }
  })

  it('renders every published author tag without exposing its source markup', () => {
    const publicDir = resolve(__dirname, '../public')
    const courses: { file: string }[] = JSON.parse(readFileSync(resolve(publicDir, 'data/system-courses.json'), 'utf8'))
    for (const course of courses) {
      const html = render(readFileSync(resolve(publicDir, course.file.slice(1)), 'utf8'))
      expect(html, course.file).not.toMatch(/(?:<|&lt;)\/?lexi-[a-z-]+\b/)
    }
  })

  it('renders the time and date examples as complete static notation tokens', () => {
    const markdown = readFileSync(resolve(__dirname, '../public/data/system-courses/daily-life/time-dates-calendars-time-zones-and-schedules.md'), 'utf8')
    const element = document.createElement('div')
    element.innerHTML = render(markdown)
    const tokens = [...element.querySelectorAll('.token-notation')]
    expect(tokens.map(token => token.textContent)).toEqual(['14:30', '08/09/2026', '2026-08-23'])
    expect(tokens.every(token => !token.hasAttribute('data-course-action'))).toBe(true)
    expect(element.textContent).not.toContain('lexi-')
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
