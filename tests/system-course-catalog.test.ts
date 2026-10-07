import { describe, expect, it } from 'vitest'
import { migrateCourseView, parseSystemCourseCatalog, type SystemCourseItem } from '../src/lib/system-course-catalog'

const courses: SystemCourseItem[] = [
  { id: 1, slug: 'pronunciation', title: '发音', desc: '声音', tag: '发音', series: '声音与标音', icon: '📖', file: '/data/system-courses/pronunciation/pronunciation.md', words: [], legacyIds: [1], legacyDefaultIds: [1], legacyHeadings: ['发音动作'] },
  { id: 2, slug: 'vowels', title: '元音', desc: '元音', tag: '发音', series: '声音与标音', icon: '📖', file: '/data/system-courses/pronunciation/vowels.md', words: [], legacyIds: [1], legacyDefaultIds: [], legacyHeadings: ['元音与舌位'] },
  { id: 3, slug: 'academic', title: '学术', desc: '论文', tag: '大学', series: '共通学术阅读', icon: '📖', file: '/data/system-courses/university/academic.md', words: [], legacyIds: [24], legacyDefaultIds: [24], legacyHeadings: ['引用与证据'] },
  { id: 4, slug: 'chemistry', title: '化学', desc: '化学式', tag: '中学', series: '化学', icon: '📖', file: '/data/system-courses/secondary/chemistry.md', words: [], legacyIds: [25], legacyDefaultIds: [25], legacyHeadings: [] },
]

describe('system course identities and migration', () => {
  it('uses the old heading to select a split booklet and resets obsolete offsets', () => {
    const result = migrateCourseView({ catalogVersion: 2, courseId: 1, searchQuery: '舌位', tag: '声音与拼写', collapsedCourseGroups: ['词汇与构词'], readingPositions: { 1: { tocId: 'heading-6', tocText: '4. 元音与舌位', scrollRatio: .8 } } }, courses)
    expect(result.courseSlug).toBe('vowels')
    expect(result.searchQuery).toBe('舌位')
    expect(result).not.toHaveProperty('tag')
    expect(result).not.toHaveProperty('collapsedSeries')
    expect(result.collapsedCourseGroups).toEqual(['构词'])
    expect(result.readingPositions).toEqual({ vowels: { tocText: '4. 元音与舌位', scrollRatio: 0 } })
  })
  it('only merges the research/paper pair in catalog version 1', () => {
    expect(migrateCourseView({ courseId: 25 }, courses).courseSlug).toBe('academic')
    expect(migrateCourseView({ catalogVersion: 2, courseId: 25 }, courses).courseSlug).toBe('chemistry')
  })
  it('keeps slug-based positions when the published list or file paths change', () => {
    const saved = { catalogVersion: 3, courseSlug: 'vowels', collapsedCourseGroups: ['语法'], readingPositions: { vowels: { tocId: 'heading-2', tocText: '新章节', scrollRatio: .4 } } }
    expect(migrateCourseView(saved, [...courses].reverse())).toEqual(saved)
    expect(migrateCourseView(saved, courses.map(course => ({ ...course, file: `/data/system-courses/pronunciation/${course.slug}.md` })))).toEqual(saved)
  })
  it('removes obsolete filters without changing current reading positions or category collapse', () => {
    const readingPositions = { vowels: { tocId: 'heading-2', tocText: '新章节', scrollRatio: .4 } }
    const saved = { catalogVersion: 3, courseSlug: 'vowels', courseTitle: '元音', searchQuery: '舌位', tag: '发音', collapsedCourseGroups: ['大学'], collapsedSeries: ['发音/声音与标音'], readingPositions }
    expect(migrateCourseView(saved, courses)).toEqual({ catalogVersion: 3, courseSlug: 'vowels', courseTitle: '元音', searchQuery: '舌位', collapsedCourseGroups: ['大学'], readingPositions })
  })
  it('falls back to a declared destination and drops unmapped records', () => {
    const result = migrateCourseView({ catalogVersion: 2, courseId: 1, readingPositions: { 1: { tocText: '旧标题已删除', scrollRatio: .5 }, 999: { scrollRatio: .8 } } }, courses)
    expect(result.courseSlug).toBe('pronunciation')
    expect(Object.keys(result.readingPositions!)).toEqual(['pronunciation'])
  })
  it('prioritizes the current record when several old lessons merge', () => {
    const result = migrateCourseView({ catalogVersion: 2, courseId: 24, readingPositions: { 24: { tocText: '引用', scrollRatio: .3 }, 27: { tocText: '材料', scrollRatio: .6 } } }, [{ ...courses[2], legacyIds: [24, 27], legacyDefaultIds: [24, 27] }])
    expect(result.readingPositions?.academic.tocText).toBe('引用')
  })
  it('rejects duplicate identities, unsafe paths and malformed metadata', () => {
    expect(parseSystemCourseCatalog(courses)).toEqual(courses)
    for (const changes of [{ file: '/data/system-courses/../../secret.md' }, { file: 'https://example.com/x.md' }, { file: '/data/system-courses/pronunciation/sounds/pronunciation.md' }, { file: '/data/system-courses/pronunciation.md' }, { title: 42 }, { series: [] }, { legacyIds: ['1'] }]) {
      expect(() => parseSystemCourseCatalog([{ ...courses[0], ...changes }])).toThrow()
    }
    expect(() => parseSystemCourseCatalog([courses[0], courses[0]])).toThrow()
  })
})
