export const SYSTEM_COURSE_CATEGORIES = ['发音', '构词', '语法', '生活', '中学', '大学', '工作'] as const
export const SYSTEM_COURSE_CATALOG_VERSION = 3

export interface SystemCourseItem {
  id: number
  slug: string
  title: string
  desc: string
  tag: string
  series?: string
  planId?: string
  kind?: 'chapter' | 'overview'
  icon: string
  file: string
  words: string[]
  legacyIds?: number[]
  legacyDefaultIds?: number[]
  legacyHeadings?: string[]
}

export interface CourseReadingPosition {
  tocId?: string
  tocText?: string
  scrollRatio: number
}

export interface CourseViewSetting {
  catalogVersion?: number
  courseId?: number
  courseSlug?: string
  courseTitle?: string
  searchQuery?: string
  /** Obsolete filter and series-collapse preferences, read only for cleanup. */
  tag?: string
  collapsedCourseGroups?: string[]
  collapsedSeries?: string[]
  readingPositions?: Record<string, CourseReadingPosition>
}

const legacyTags: Record<string, string> = {
  '声音与拼写': '发音', '词汇与构词': '构词', '句子与语法': '语法',
  '阅读与表达': '语法', '开发与技术': '工作', '科研与学术': '大学', '中小学': '中学',
}

export function courseSeriesKey(course: SystemCourseItem): string {
  return `${course.tag}/${course.series || course.tag}`
}

export function normalizeCourseHeading(text: string): string {
  return text.replace(/^[\d一二三四五六七八九十百]+[.、．]\s*/, '').replace(/`/g, '').trim()
}

export function migrateCourseView(saved: CourseViewSetting, courses: SystemCourseItem[]): CourseViewSetting {
  if (saved.catalogVersion === SYSTEM_COURSE_CATALOG_VERSION) {
    if (!('tag' in saved) && !('collapsedSeries' in saved)) return saved
    const { tag: _tag, collapsedSeries: _collapsedSeries, ...view } = saved
    return view
  }

  let legacyId = saved.courseId
  const positions = { ...(saved.readingPositions || {}) }
  // Catalog 1 had separate research and paper courses, merged into course 24 in catalog 2.
  if ((saved.catalogVersion || 1) < 2) {
    if (legacyId === 24 || legacyId === 25) legacyId = 24
    positions['24'] = saved.courseId === 25
      ? positions['25'] || positions['24']
      : positions['24'] || positions['25']
    delete positions['25']
  }

  const findTarget = (id: number, position?: CourseReadingPosition) => {
    const candidates = courses.filter(course => course.legacyIds?.includes(id))
    const heading = normalizeCourseHeading(position?.tocText || '')
    return candidates.find(course => heading && course.legacyHeadings?.some(text => normalizeCourseHeading(text) === heading))
      || candidates.find(course => course.legacyDefaultIds?.includes(id))
      || candidates[0]
      || courses.find(course => !course.legacyIds && course.id === id)
  }
  const readingPositions: Record<string, CourseReadingPosition> = {}
  const entries = Object.entries(positions).sort(([left], [right]) => Number(left === String(legacyId)) - Number(right === String(legacyId)))
  for (const [id, position] of entries) {
    if (!position) continue
    const course = findTarget(Number(id), position)
    if (!course) continue
    // A ratio or numeric heading from the old booklet cannot locate a rewritten chapter reliably.
    readingPositions[course.slug] = { tocText: position.tocText, scrollRatio: 0 }
  }
  const current = saved.courseSlug
    ? courses.find(course => course.slug === saved.courseSlug)
    : legacyId === undefined ? undefined : findTarget(legacyId, positions[String(legacyId)])
  return {
    catalogVersion: SYSTEM_COURSE_CATALOG_VERSION,
    courseSlug: current?.slug,
    searchQuery: saved.searchQuery,
    collapsedCourseGroups: [...new Set((saved.collapsedCourseGroups || []).map(tag => legacyTags[tag] || tag))],
    readingPositions,
  }
}

export function parseSystemCourseCatalog(value: unknown): SystemCourseItem[] {
  if (!Array.isArray(value) || !value.length) throw new Error('课程清单为空或格式不正确')
  const slugs = new Set<string>()
  const ids = new Set<number>()
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('课程条目格式不正确')
    const course = item as SystemCourseItem
    if (!Number.isInteger(course.id) || course.id < 1 || ids.has(course.id)
      || typeof course.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(course.slug) || slugs.has(course.slug)
      || [course.title, course.desc, course.tag].some(field => typeof field !== 'string' || !field.trim())
      || typeof course.icon !== 'string' || !Array.isArray(course.words)
      || course.words.some(word => typeof word !== 'string')
      || (course.series !== undefined && (typeof course.series !== 'string' || !course.series.trim()))
      || (course.kind !== undefined && !['chapter', 'overview'].includes(course.kind))
      || (course.planId !== undefined && (typeof course.planId !== 'string' || !/^[A-Z][A-Z0-9-]*\d{2}$/.test(course.planId)))
      || [course.legacyIds, course.legacyDefaultIds].some(list => list !== undefined && (!Array.isArray(list) || list.some(id => !Number.isInteger(id) || id < 1)))
      || (course.legacyHeadings !== undefined && (!Array.isArray(course.legacyHeadings) || course.legacyHeadings.some(text => typeof text !== 'string')))
      || typeof course.file !== 'string' || !/^\/data\/system-courses\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(course.file)) {
      throw new Error('课程条目包含重复身份、无效字段或不安全路径')
    }
    ids.add(course.id)
    slugs.add(course.slug)
    return course
  })
}
