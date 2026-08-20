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
    expect(courses.length).toBe(20)

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
    const mdPath = resolve(root, 'public/data/system-courses/03-numbers-and-math.md')
    const mdContent = readFileSync(mdPath, 'utf-8')

    expect(mdContent).toContain('三列表格对照')
    expect(mdContent).toContain('twelve')
    expect(mdContent).toContain('twenty')
    expect(mdContent).toContain('三位分节')
  })

  it('verifies Lesson 03 connected speech features', () => {
    const mdPath = resolve(root, 'public/data/system-courses/02-connected-speech-and-rhythm.md')
    const mdContent = readFileSync(mdPath, 'utf-8')
    expect(mdContent).toContain('连续语流音变')
    expect(mdContent).toContain('辅音 + 元音')
    expect(mdContent).toContain('失去爆破')
  })

  it('verifies Lesson 04 tense model features', () => {
    const mdPath = resolve(root, 'public/data/system-courses/08-tense-mental-model.md')
    const mdContent = readFileSync(mdPath, 'utf-8')
    expect(mdContent).toContain('timeline')
    expect(mdContent).toContain('状态维')
  })

  it('verifies Lesson 05-09 grammar and vocabulary features', () => {
    const l5 = readFileSync(resolve(root, 'public/data/system-courses/12-spatial-prepositions.md'), 'utf-8')
    const l6 = readFileSync(resolve(root, 'public/data/system-courses/13-non-finite-verbs.md'), 'utf-8')
    const l7 = readFileSync(resolve(root, 'public/data/system-courses/14-sentence-structures-and-clauses.md'), 'utf-8')
    const l8 = readFileSync(resolve(root, 'public/data/system-courses/16-golden-roots-and-affixes.md'), 'utf-8')
    const l9 = readFileSync(resolve(root, 'public/data/system-courses/17-core-verbs-and-spatial-phrases.md'), 'utf-8')

    expect(l5).toContain('空间介词')
    expect(l6).toContain('stateDiagram-v2')
    expect(l7).toContain('基本句型')
    expect(l8).toContain('classDiagram')
    expect(l9).toContain('动词短语')
  })

  it('verifies Lesson 10-12 tech courses features', () => {
    const l10 = readFileSync(resolve(root, 'public/data/system-courses/18-ai-and-llm-terms.md'), 'utf-8')
    const l11 = readFileSync(resolve(root, 'public/data/system-courses/19-developer-engineering-english.md'), 'utf-8')
    const l12 = readFileSync(resolve(root, 'public/data/system-courses/20-network-and-cloud-native.md'), 'utf-8')

    expect(l10).toContain('Generative Pre-trained Transformer')
    expect(l11).toContain('gitGraph')
    expect(l12).toContain('sequenceDiagram')
  })

  it('verifies Lesson 13-16 beginner grammar courses features', () => {
    const l13 = readFileSync(resolve(root, 'public/data/system-courses/04-nouns-and-articles.md'), 'utf-8')
    const l14 = readFileSync(resolve(root, 'public/data/system-courses/05-pronouns-and-determiners.md'), 'utf-8')
    const l15 = readFileSync(resolve(root, 'public/data/system-courses/06-adjectives-adverbs-and-comparison.md'), 'utf-8')
    const l16 = readFileSync(resolve(root, 'public/data/system-courses/07-interrogative-and-negation.md'), 'utf-8')

    expect(l13).toContain('可数与不可数')
    expect(l13).toContain('ord-special')
    expect(l14).toContain('人称代词')
    expect(l14).toContain('数量限定词')
    expect(l15).toContain('比较级')
    expect(l15).toContain('最高级')
    expect(l16).toContain('反意疑问句')
    expect(l16).toContain('do-support')
  })

  it('verifies Lesson 17-20 advanced grammar courses features', () => {
    const l17 = readFileSync(resolve(root, 'public/data/system-courses/09-modal-verbs.md'), 'utf-8')
    const l18 = readFileSync(resolve(root, 'public/data/system-courses/10-passive-and-causative.md'), 'utf-8')
    const l19 = readFileSync(resolve(root, 'public/data/system-courses/11-conditionals-and-subjunctive.md'), 'utf-8')
    const l20 = readFileSync(resolve(root, 'public/data/system-courses/15-advanced-syntax.md'), 'utf-8')

    expect(l17).toContain('have done')
    expect(l18).toContain('使役')
    expect(l18).toContain('be + 过去分词')
    expect(l19).toContain('混合条件句')
    expect(l19).toContain('wish')
    expect(l20).toContain('完全倒装')
    expect(l20).toContain('主谓一致')
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
