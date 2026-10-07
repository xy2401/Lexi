import { createApp, nextTick, type App } from 'vue'
import CourseSpatialVisual from '../components/CourseSpatialVisual.vue'
import { COURSE_VISUAL_ASSETS, COURSE_VISUAL_PRESETS } from './course-visual-presets.mjs'
import { loadCourseSvg } from './course-svg'

export { COURSE_VISUAL_PRESETS }
export type CourseVisualPreset = typeof COURSE_VISUAL_PRESETS[number]

export function isCourseVisualPreset(value: string): value is CourseVisualPreset {
  return (COURSE_VISUAL_PRESETS as readonly string[]).includes(value)
}

export function renderCourseVisualBlock(text: string): string {
  const preset = text.trim()
  if (!isCourseVisualPreset(preset)) return '<p class="course-visual-unavailable" role="status">图示暂时无法显示，请参考相邻文字说明。</p>\n'
  return `<div class="course-visual-host" data-course-visual="${preset}"><p role="status">正在加载图示…</p></div>\n`
}

/** Each reader owns its mounts; clearing a lesson also stops its animations. */
export function createCourseVisualMounts() {
  const apps = new Map<HTMLElement, { app: App; ready: Promise<unknown> }>()
  function clear() {
    for (const { app } of apps.values()) app.unmount()
    apps.clear()
  }
  async function mount(root: HTMLElement | null) {
    for (const [element, { app }] of apps) {
      if (!root?.contains(element)) {
        app.unmount()
        apps.delete(element)
      }
    }
    if (!root) return
    for (const element of root.querySelectorAll<HTMLElement>('[data-course-visual]')) {
      if (apps.has(element)) continue
      const preset = element.dataset.courseVisual || ''
      if (!isCourseVisualPreset(preset)) {
        element.textContent = '图示暂时无法显示，请参考相邻文字说明。'
        continue
      }
      const app = createApp(CourseSpatialVisual, { preset })
      try {
        app.mount(element)
        apps.set(element, { app, ready: Promise.allSettled(COURSE_VISUAL_ASSETS[preset].map(loadCourseSvg)) })
      } catch (error) {
        app.unmount()
        element.textContent = '图示暂时无法显示，请参考相邻文字说明。'
        console.warn('[Course visual] 无法显示图示', error)
      }
    }
    await Promise.all([...apps.values()].map(({ ready }) => ready))
    // Assets and their bindings must reach the DOM before restoring a heading.
    await nextTick()
  }
  return { mount, clear }
}
