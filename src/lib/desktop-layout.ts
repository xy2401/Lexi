export interface DictionaryDesktopLayout {
  leftWidth: number
  leftCollapsed: boolean
}

export interface CourseDesktopLayout {
  libraryWidth: number
  tocWidth: number
  libraryCollapsed: boolean
  tocCollapsed: boolean
}

export interface DesktopLayoutSetting {
  sidebarCollapsed: boolean
  dictionary: DictionaryDesktopLayout
  course: CourseDesktopLayout
}

export const DEFAULT_DESKTOP_LAYOUT: DesktopLayoutSetting = {
  sidebarCollapsed: false,
  dictionary: {
    leftWidth: 320,
    leftCollapsed: false,
  },
  course: {
    libraryWidth: 300,
    tocWidth: 260,
    libraryCollapsed: false,
    tocCollapsed: false,
  },
}

export function clampPaneWidth(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.round(Math.min(max, Math.max(min, parsed)))
}

export function normalizeDesktopLayout(value: unknown): DesktopLayoutSetting {
  const input = value && typeof value === 'object' ? value as Partial<DesktopLayoutSetting> : {}
  const dictionary: Partial<DictionaryDesktopLayout> = input.dictionary && typeof input.dictionary === 'object'
    ? input.dictionary
    : {}
  const course: Partial<CourseDesktopLayout> = input.course && typeof input.course === 'object'
    ? input.course
    : {}
  return {
    sidebarCollapsed: typeof input.sidebarCollapsed === 'boolean'
      ? input.sidebarCollapsed
      : DEFAULT_DESKTOP_LAYOUT.sidebarCollapsed,
    dictionary: {
      leftWidth: clampPaneWidth(dictionary.leftWidth, 260, 440, DEFAULT_DESKTOP_LAYOUT.dictionary.leftWidth),
      leftCollapsed: typeof dictionary.leftCollapsed === 'boolean'
        ? dictionary.leftCollapsed
        : DEFAULT_DESKTOP_LAYOUT.dictionary.leftCollapsed,
    },
    course: {
      libraryWidth: clampPaneWidth(course.libraryWidth, 240, 420, DEFAULT_DESKTOP_LAYOUT.course.libraryWidth),
      tocWidth: clampPaneWidth(course.tocWidth, 210, 360, DEFAULT_DESKTOP_LAYOUT.course.tocWidth),
      libraryCollapsed: typeof course.libraryCollapsed === 'boolean'
        ? course.libraryCollapsed
        : DEFAULT_DESKTOP_LAYOUT.course.libraryCollapsed,
      tocCollapsed: typeof course.tocCollapsed === 'boolean'
        ? course.tocCollapsed
        : DEFAULT_DESKTOP_LAYOUT.course.tocCollapsed,
    },
  }
}
