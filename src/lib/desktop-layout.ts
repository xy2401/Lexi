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
    libraryWidth: 260,
    tocWidth: 240,
    libraryCollapsed: false,
    tocCollapsed: false,
  },
}

export const MIN_COURSE_READING_WIDTH = 640
export const COURSE_PANE_SPACING = 32

/** Keep a readable center column; drawers use the actual workspace width. */
export function coursePaneModes(width: number, layout: CourseDesktopLayout) {
  const libraryInline = width >= MIN_COURSE_READING_WIDTH + layout.libraryWidth + COURSE_PANE_SPACING
  const librarySpace = libraryInline && !layout.libraryCollapsed
    ? layout.libraryWidth + COURSE_PANE_SPACING : 0
  const tocInline = width >= MIN_COURSE_READING_WIDTH + librarySpace + layout.tocWidth + COURSE_PANE_SPACING
  return {
    libraryInline,
    tocInline,
    libraryMaxWidth: Math.min(420, Math.max(240, width - MIN_COURSE_READING_WIDTH - COURSE_PANE_SPACING)),
    tocMaxWidth: Math.min(360, Math.max(210, width - MIN_COURSE_READING_WIDTH - librarySpace - COURSE_PANE_SPACING)),
  }
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
