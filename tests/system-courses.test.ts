import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseSystemCourseCatalog, migrateCourseView, SYSTEM_COURSE_CATEGORIES } from '../src/lib/system-course-catalog'

const root = resolve(__dirname, '..')
const catalog = parseSystemCourseCatalog(JSON.parse(readFileSync(resolve(root, 'public/data/system-courses.json'), 'utf8')))
const body = (slug: string) => readFileSync(resolve(root, 'public' + catalog.find(course => course.slug === slug)!.file), 'utf8')

describe('published system curriculum', () => {
  it('publishes real chapters in seven categories without unregistered root lessons', () => {
    expect([...new Set(catalog.map(course => course.tag))]).toEqual([...SYSTEM_COURSE_CATEGORIES])
    const courseRoot = resolve(root, 'public/data/system-courses')
    expect(readdirSync(courseRoot).filter(file => file.endsWith('.md'))).toEqual(['_curriculum.md', '_spec.md'])
    for (const category of readdirSync(courseRoot, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
      expect(readdirSync(resolve(courseRoot, category.name), { withFileTypes: true }).every(entry => entry.isFile() && entry.name.endsWith('.md'))).toBe(true)
    }
    for (const course of catalog) {
      const content = body(course.slug)
      expect(content.match(/^# (.+)$/m)?.[1]).toBe(course.title)
      expect(course.file).toMatch(/^\/data\/system-courses\/[^/]+\/[^/]+\.md$/)
      expect(content.match(/^## /gm)!.length).toBeGreaterThanOrEqual(6)
      for (const link of content.matchAll(/\]\(#course=([^)]+)\)/g)) expect(catalog.some(item => item.slug === link[1])).toBe(true)
    }
  })

  it('has unambiguous default destinations for all 39 legacy courses', () => {
    for (let id = 1; id <= 39; id++) {
      expect(catalog.filter(course => course.legacyDefaultIds?.includes(id))).toHaveLength(1)
      const result = migrateCourseView({ catalogVersion: 2, courseId: id }, catalog)
      expect(catalog.find(course => course.slug === result.courseSlug)?.legacyIds).toContain(id)
    }
    expect(migrateCourseView({ catalogVersion: 2, courseId: 3 }, catalog).courseSlug).toBe('numbers-quantities-ratios-and-units')
    expect(migrateCourseView({ catalogVersion: 2, courseId: 5 }, catalog).courseSlug).toBe('pronouns-reference-and-agreement')
    expect(migrateCourseView({ catalogVersion: 2, courseId: 25 }, catalog).courseSlug).toBe('secondary-chemistry-reader')
  })

  it('illustrates the spatial chapter while keeping its eight-section structure', () => {
    const content = body('space-shape-size-direction-and-distance')
    expect(content.match(/^## /gm)).toHaveLength(8)
    expect([...content.matchAll(/```course-visual\n([^\n]+)\n```/g)].map(match => match[1])).toEqual([
      'spatial-viewpoint', 'spatial-route', 'spatial-turning', 'spatial-distance', 'spatial-screen', 'spatial-dimensions', 'spatial-shapes',
    ])
  })

  it('preserves reference material while separating school and university scopes', () => {
    const school = body('secondary-chemistry-reader')
    const organic = body('organic-names-and-structural-reading')
    const elements = school.split(/## \d+\. 118 个元素：按周期查阅/)[1]?.split(/^## /m)[0] || ''
    expect((elements.match(/<lexi-notation>/g) || []).length).toBe(118)
    expect(school).not.toContain('从甲、乙、丙、丁到')
    expect(organic).toContain('methanal')
    expect(organic).toContain('acetaldehyde')
    for (const course of catalog.filter(item => item.tag === '大学')) {
      for (const level of ['本科', '研究生', '博士']) expect(body(course.slug)).toContain(level)
    }
  })

  it('keeps a complete roadmap with resolvable anchors and records published additions', () => {
    const curriculum = readFileSync(resolve(root, 'public/data/system-courses/_curriculum.md'), 'utf8')
    expect([...curriculum.matchAll(/^## \d\. (.+)$/gm)].map(match => match[1])).toEqual([...SYSTEM_COURSE_CATEGORIES])
    const anchors = [...curriculum.matchAll(/<a id="([^"]+)"><\/a>/g)].map(match => match[1])
    expect(new Set(anchors).size).toBe(anchors.length)
    for (const link of curriculum.matchAll(/\]\(#([^)]+)\)/g)) expect(anchors).toContain(link[1])
    for (const [, relative] of curriculum.matchAll(/\]\(\.\/([^)]+\.md)\)/g)) expect(existsSync(resolve(root, 'public/data/system-courses', relative)), relative).toBe(true)
    expect([...curriculum.matchAll(/^\| (\d+) · `[^`]+` \|/gm)].map(match => Number(match[1]))).toEqual(Array.from({ length: 39 }, (_, index) => index + 1))
    for (const course of catalog.filter(item => !item.planId)) expect(curriculum).toContain('`' + course.slug + '`')
    expect(catalog.some(course => course.planId === 'P13')).toBe(false)
  })
})
