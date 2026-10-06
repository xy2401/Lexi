import { ref } from 'vue'
import { marked } from 'marked'
import { loadCourseGuide, type CourseVersion } from '../lib/course-versions'
import type { CourseDocument, CourseUnitIndex } from '../lib/course-markdown'
import { sanitizeReaderHtml } from '../lib/reader-sanitize'

export function useCourseGuide() {
  const status = ref<'idle' | 'loading' | 'ready' | 'missing' | 'error'>('idle')
  const html = ref('')
  const document = ref<CourseDocument | null>(null)
  const error = ref('')
  let requestId = 0
  let controller: AbortController | undefined

  function reset() {
    requestId++
    controller?.abort()
    controller = undefined
    status.value = 'idle'
    html.value = ''
    document.value = null
    error.value = ''
  }

  async function load(version: CourseVersion, unit: CourseUnitIndex) {
    reset()
    const currentRequest = requestId
    const currentController = new AbortController()
    controller = currentController
    status.value = 'loading'
    try {
      const guide = await loadCourseGuide(version, unit, currentController.signal)
      if (currentRequest !== requestId) return
      if (!guide) {
        status.value = 'missing'
        return
      }
      html.value = sanitizeReaderHtml(marked.parse(guide.markdown, { async: false }))
      document.value = guide.document
      status.value = 'ready'
    } catch (cause) {
      if (currentRequest !== requestId) return
      error.value = cause instanceof Error ? cause.message : String(cause)
      status.value = 'error'
    } finally {
      if (currentRequest === requestId) controller = undefined
    }
  }

  return { status, html, document, error, load, reset }
}
