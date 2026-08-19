import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

interface CourseItem {
  id: number
  slug: string
  title: string
  desc: string
  tag: string
  icon: string
  file: string
  words: string[]
}

describe('System Courses validation', () => {
  const root = resolve(__dirname, '..')
  const manifestPath = resolve(root, 'public/data/system-courses.json')

  it('has a valid system-courses.json manifest', () => {
    expect(existsSync(manifestPath)).toBe(true)
    const content = readFileSync(manifestPath, 'utf-8')
    const courses: CourseItem[] = JSON.parse(content)

    expect(Array.isArray(courses)).toBe(true)
    expect(courses.length).toBe(12)

    for (const course of courses) {
      expect(typeof course.id).toBe('number')
      expect(typeof course.slug).toBe('string')
      expect(typeof course.title).toBe('string')
      expect(typeof course.desc).toBe('string')
      expect(typeof course.tag).toBe('string')
      expect(typeof course.file).toBe('string')
      expect(Array.isArray(course.words)).toBe(true)
      expect(course.words.length).toBeGreaterThan(0)

      // 验证 Markdown 文件实际存在
      const relativeFile = course.file.replace(/^\//, '')
      const mdPath = resolve(root, 'public', relativeFile)
      expect(existsSync(mdPath)).toBe(true)

      const mdContent = readFileSync(mdPath, 'utf-8')
      expect(mdContent.length).toBeGreaterThan(100)
    }
  })

  it('verifies Lesson 01 phonetics content features', () => {
    const mdPath = resolve(root, 'public/data/system-courses/01-phonetics-mastery.md')
    const mdContent = readFileSync(mdPath, 'utf-8')

    expect(mdContent).toContain('48 个国际音标全景总览')
    expect(mdContent).toContain('元音全景分类表')
    expect(mdContent).toContain('辅音全景分类表')
    expect(mdContent).toContain('音素滑拼')
    expect(mdContent).toContain('音节核心法则')
    expect(mdContent).toContain('自然拼读')
  })

  it('verifies Lesson 02 numbers content features', () => {
    const mdPath = resolve(root, 'public/data/system-courses/02-numbers-and-math.md')
    const mdContent = readFileSync(mdPath, 'utf-8')

    expect(mdContent).toContain('三列表格对照')
    expect(mdContent).toContain('twelve')
    expect(mdContent).toContain('twenty')
    expect(mdContent).toContain('三位分节')
  })

  it('verifies Lesson 03 connected speech features', () => {
    const mdPath = resolve(root, 'public/data/system-courses/03-connected-speech-and-rhythm.md')
    const mdContent = readFileSync(mdPath, 'utf-8')
    expect(mdContent).toContain('连续语流音变')
    expect(mdContent).toContain('辅音 + 元音')
    expect(mdContent).toContain('失去爆破')
  })

  it('verifies Lesson 04 tense model features', () => {
    const mdPath = resolve(root, 'public/data/system-courses/04-tense-mental-model.md')
    const mdContent = readFileSync(mdPath, 'utf-8')
    expect(mdContent).toContain('timeline')
    expect(mdContent).toContain('状态维')
  })

  it('verifies Lesson 05-09 grammar and vocabulary features', () => {
    const l5 = readFileSync(resolve(root, 'public/data/system-courses/05-spatial-prepositions.md'), 'utf-8')
    const l6 = readFileSync(resolve(root, 'public/data/system-courses/06-non-finite-verbs.md'), 'utf-8')
    const l7 = readFileSync(resolve(root, 'public/data/system-courses/07-sentence-structures-and-clauses.md'), 'utf-8')
    const l8 = readFileSync(resolve(root, 'public/data/system-courses/08-golden-roots-and-affixes.md'), 'utf-8')
    const l9 = readFileSync(resolve(root, 'public/data/system-courses/09-core-verbs-and-spatial-phrases.md'), 'utf-8')

    expect(l5).toContain('空间介词')
    expect(l6).toContain('stateDiagram-v2')
    expect(l7).toContain('基本句型')
    expect(l8).toContain('classDiagram')
    expect(l9).toContain('动词短语')
  })

  it('verifies Lesson 10-12 tech courses features', () => {
    const l10 = readFileSync(resolve(root, 'public/data/system-courses/10-ai-and-llm-terms.md'), 'utf-8')
    const l11 = readFileSync(resolve(root, 'public/data/system-courses/11-developer-engineering-english.md'), 'utf-8')
    const l12 = readFileSync(resolve(root, 'public/data/system-courses/12-network-and-cloud-native.md'), 'utf-8')

    expect(l10).toContain('Generative Pre-trained Transformer')
    expect(l11).toContain('gitGraph')
    expect(l12).toContain('sequenceDiagram')
  })

  it('verifies system-courses spec.md existence and core guidelines', () => {
    const specPath = resolve(root, 'public/data/system-courses/spec.md')
    expect(existsSync(specPath)).toBe(true)
    const specContent = readFileSync(specPath, 'utf-8')
    expect(specContent).toContain('教学理念与语言文风规范')
    expect(specContent).toContain('gitGraph')
    expect(specContent).toContain('sequenceDiagram')
    expect(specContent).toContain('表格设计与列宽自适应规范')
  })
})
