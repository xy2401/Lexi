import { afterEach, describe, expect, it, vi } from 'vitest'
import { courseGuideUrl, courseUnitAvailability, loadCourseGuide, parseCourseVersions, type CourseVersion } from '../src/lib/course-versions'
import { useCourseGuide } from '../src/composables/useCourseGuide'

const unit = { id: 1, name: '喜好 1', desc: '', words: ['I'], file: '001-喜好 1.md' }
const version: CourseVersion = {
  id: 'gpt-6.1', label: 'GPT-6.1', directory: 'duolingo-zs-en.gpt-6.1', format: 'split', guideUnitIds: [1],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

afterEach(() => vi.unstubAllGlobals())

describe('versioned course loading', () => {
  it('tracks lectures and practice independently and includes combined legacy practice', () => {
    const split = { ...version, practiceUnitIds: [2] }
    expect(courseUnitAvailability(split, 1)).toEqual({ guide: true, practice: false, written: true })
    expect(courseUnitAvailability(split, 2)).toEqual({ guide: false, practice: true, written: true })
    expect(courseUnitAvailability(split, 3)).toEqual({ guide: false, practice: false, written: false })
    expect(courseUnitAvailability({ ...version, format: 'combined', practiceUnitIds: [] }, 1)).toEqual({ guide: true, practice: true, written: true })
    expect(courseUnitAvailability(undefined, 1)).toEqual({ guide: false, practice: false, written: false })
  })

  it('validates version registration and encodes the source filename', () => {
    expect(parseCourseVersions({ defaultVersionId: version.id, versions: [version] }).versions).toEqual([version])
    expect(() => parseCourseVersions({ defaultVersionId: 'unknown', versions: [version] })).toThrow('默认')
    expect(() => parseCourseVersions({ defaultVersionId: version.id, versions: [version, version] })).toThrow('ID')
    expect(courseGuideUrl(version, unit)).toBe(`/data/${version.directory}/001-${encodeURIComponent('喜好 1.md')}`)
    expect(() => courseGuideUrl(version, { ...unit, file: '001-喜好 1.test.md' })).toThrow('文件名')
  })

  it('does not fetch a lecture declared unavailable', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await loadCourseGuide({ ...version, guideUnitIds: [] }, unit)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders the entire standalone lecture and sanitizes executable markup', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('# 喜好\n\n## 自然场景\n\n新内容。<script>alert(1)</script>')))
    const guide = useCourseGuide()
    await guide.load(version, unit)
    expect(guide.status.value).toBe('ready')
    expect(guide.html.value).toContain('<h1>喜好</h1>')
    expect(guide.html.value).toContain('自然场景')
    expect(guide.html.value).not.toContain('<script>')
    expect(guide.document.value).toBeNull()
  })

  it('distinguishes loading errors from unpublished lectures and permits retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response('# 喜好\n\n已恢复。'))
    vi.stubGlobal('fetch', fetchMock)
    const guide = useCourseGuide()
    await guide.load(version, unit)
    expect(guide.status.value).toBe('error')
    expect(guide.error.value).toBe('HTTP 500')
    await guide.load(version, unit)
    expect(guide.status.value).toBe('ready')
    expect(guide.error.value).toBe('')
  })

  it('rejects SPA HTML fallbacks and embedded exercise tags', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('<html>app</html>', { headers: { 'content-type': 'text/html' } }))
      .mockResolvedValueOnce(new Response('# 喜好\n\n<quiz-listening></quiz-listening>'))
      .mockResolvedValueOnce(new Response('# 喜好\n\n<practice unit="1" format="2"></practice>')))
    await expect(loadCourseGuide(version, unit)).rejects.toThrow('HTML')
    await expect(loadCourseGuide(version, unit)).rejects.toThrow('练习标签')
    await expect(loadCourseGuide(version, unit)).rejects.toThrow('练习标签')
  })

  it('ignores a stale successful response even when fetch ignores cancellation', async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise))
    const guide = useCourseGuide()
    const oldLoad = guide.load(version, unit)
    const newLoad = guide.load({ ...version, id: 'next', directory: 'duolingo-zs-en.next' }, unit)
    expect(guide.html.value).toBe('')
    second.resolve(new Response('# 最新版本\n\n新内容。'))
    await newLoad
    first.resolve(new Response('# 过期版本\n\n旧请求。'))
    await oldLoad
    expect(guide.status.value).toBe('ready')
    expect(guide.html.value).toContain('最新版本')
    expect(guide.html.value).not.toContain('过期版本')
  })

  it('ignores stale failures and clears pending state on reset', async () => {
    const pending = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(pending.promise))
    const guide = useCourseGuide()
    const loading = guide.load(version, unit)
    guide.reset()
    pending.reject(new Error('Late failure'))
    await loading
    expect(guide.status.value).toBe('idle')
    expect(guide.error.value).toBe('')
  })
})
