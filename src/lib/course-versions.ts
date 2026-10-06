import { parseCourseMarkdown, type CourseDocument, type CourseUnitIndex } from './course-markdown'

export interface CourseVersion {
  id: string
  label: string
  directory: string
  format: 'combined' | 'split'
  guideUnitIds: number[]
  practiceUnitIds?: number[]
}

export interface CourseVersionsManifest {
  defaultVersionId: string
  versions: CourseVersion[]
}

export const COURSE_VERSION_SETTING = 'duolingo.version'
export const COURSE_VERSION_VIEW_SETTING = 'duolingo.versionView'

export interface CourseVersionView {
  unitId?: number
  searchQuery: string
  panel: 'words' | 'guide' | 'practice'
  onlyWritten?: boolean
}

export function courseUnitAvailability(version: CourseVersion | undefined, unitId: number) {
  const guide = version?.guideUnitIds.includes(unitId) || false
  const practice = version?.format === 'combined'
    ? guide : version?.practiceUnitIds?.includes(unitId) || false
  return { guide, practice, written: guide || practice }
}

export function parseCourseVersions(value: unknown): CourseVersionsManifest {
  const manifest = value as CourseVersionsManifest | null
  if (!manifest || !Array.isArray(manifest.versions) || !manifest.versions.length) {
    throw new Error('讲义版本清单为空或格式错误')
  }
  const ids = new Set<string>()
  for (const version of manifest.versions) {
    if (!version || typeof version.id !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(version.id)
      || version.id.includes('..') || ids.has(version.id) || typeof version.label !== 'string' || !version.label.trim()) {
      throw new Error('讲义版本 ID 或名称无效')
    }
    ids.add(version.id)
    const original = version.id === 'original'
    if (version.format !== (original ? 'combined' : 'split')
      || version.directory !== (original ? 'duolingo-zs-en' : `duolingo-zs-en.${version.id}`)) {
      throw new Error(`讲义版本 ${version.id} 的目录或格式无效`)
    }
    if (!Array.isArray(version.guideUnitIds)
      || version.guideUnitIds.some(id => !Number.isSafeInteger(id) || id <= 0)
      || new Set(version.guideUnitIds).size !== version.guideUnitIds.length) {
      throw new Error(`讲义版本 ${version.id} 的单元清单无效`)
    }
    if (version.practiceUnitIds !== undefined && (!Array.isArray(version.practiceUnitIds)
      || version.practiceUnitIds.some(id => !Number.isSafeInteger(id) || id <= 0)
      || new Set(version.practiceUnitIds).size !== version.practiceUnitIds.length)) {
      throw new Error(`讲义版本 ${version.id} 的练习清单无效`)
    }
  }
  if (!ids.has(manifest.defaultVersionId)) throw new Error('默认讲义版本不存在')
  return manifest
}

export function courseGuideUrl(version: CourseVersion, unit: CourseUnitIndex): string {
  if (!/^\d{3}-[^<>:"/\\|?*]+\.md$/.test(unit.file) || unit.file.endsWith('.test.md')) {
    throw new Error('讲义文件名无效')
  }
  return `/data/${version.directory}/${encodeURIComponent(unit.file)}`
}

export async function loadCourseGuide(version: CourseVersion, unit: CourseUnitIndex, signal?: AbortSignal): Promise<{
  markdown: string
  document: CourseDocument | null
} | null> {
  if (!version.guideUnitIds.includes(unit.id)) return null
  const response = await fetch(courseGuideUrl(version, unit), { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const source = await response.text()
  if (response.headers.get('content-type')?.includes('text/html') || /^\s*<(?:!doctype|html)\b/i.test(source)) {
    throw new Error('收到 HTML 页面，未找到讲义文件')
  }
  if (!source.trim()) throw new Error('讲义文件为空')
  if (version.format === 'split') {
    if (/<\/?(?:quiz-[a-z0-9-]+|practice|exercise)\b/i.test(source) || /^\s*```lexi-(?:practice|exercise)\b/m.test(source)) throw new Error('新版讲义不能包含练习标签')
    return { markdown: source, document: null }
  }
  if (!source.includes('<quiz-word-list>')) return { markdown: source, document: null }
  const document = parseCourseMarkdown(source, unit.file)
  if (document.diagnostics.length) throw new Error(document.diagnostics.join('；'))
  return { markdown: document.guideMarkdown, document }
}
