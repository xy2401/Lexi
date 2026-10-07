import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import SystemCourseView from '../src/components/SystemCourseView.vue'
import { progressDb } from '../src/lib/progress-db'
import type { CourseDesktopLayout } from '../src/lib/desktop-layout'
import { COURSE_VISUAL_PRESETS } from '../src/lib/course-visual-presets.mjs'
import { courseSvgResponse } from './course-svg-fixture'

const courses = [
  { id: 1, slug: 'first', title: 'First course', desc: 'First', tag: '语法', series: '句子系统', icon: '', words: [], file: '/data/system-courses/grammar/first.md' },
  { id: 2, slug: 'second', title: 'Second course', desc: 'Second', tag: '语法', series: '句子系统', icon: '', words: [], file: '/data/system-courses/grammar/second.md' },
  { id: 3, slug: 'third', title: 'Third course', desc: 'Third', tag: '发音', series: '声音与标音', icon: '', words: [], file: '/data/system-courses/pronunciation/third.md' },
  { id: 4, slug: 'fourth', title: 'Fourth course', desc: 'Fourth', tag: '语法', series: '篇章与表达', icon: '', words: [], file: '/data/system-courses/grammar/fourth.md' },
]
let app: App | undefined
let host: HTMLDivElement
let workspaceWidth: number
let resize: () => void
const savedLayout: CourseDesktopLayout = { libraryWidth: 300, tocWidth: 260, libraryCollapsed: false, tocCollapsed: false }

beforeEach(async () => {
  await progressDb.settings.delete('course.view')
  workspaceWidth = 1000
  resize = () => {}
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe() {}
    disconnect() {}
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width: workspaceWidth, height: 600, top: 0, left: 0, right: workspaceWidth, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
  }))
  vi.stubGlobal('fetch', vi.fn(async (input: string) => input === '/data/system-courses.json'
    ? Response.json(courses)
    : courseSvgResponse(input) || new Response('# Test course\n\n## Overview\n\nA readable lesson.\n\n## Examples\n\nAn example.')))
  host = document.createElement('div')
  document.body.append(host)
})
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.innerHTML = ''
  window.history.replaceState({}, '')
  vi.unstubAllGlobals()
})

async function mount(mobile = false) {
  const layout = ref({ ...savedLayout })
  const active = ref(true)
  app = createApp(defineComponent({ setup: () => () => h(SystemCourseView, {
    desktopLayout: layout.value, active: active.value,
    'onUpdate:desktop-layout': (value: CourseDesktopLayout) => { layout.value = value },
  }) }))
  app.mount(host)
  if (mobile) await vi.waitFor(() => expect(host.querySelectorAll('.mobile-course-card')).toHaveLength(courses.length))
  else await vi.waitFor(() => expect(host.querySelector('.markdown-prose')?.textContent).toContain('A readable lesson'))
  return { layout, active }
}
function action(label: string) {
  const button = host.querySelector<HTMLButtonElement>(`.desktop-course-actions button[aria-label="${label}"]`)!
  expect(button).toBeTruthy()
  button.click()
  return button
}

describe('adaptive course panes', () => {
  it('lays out every illustration before restoring the retained chapter heading', async () => {
    const markdown = '# Test course\n\n## Overview\n\nA readable lesson.\n\n' + COURSE_VISUAL_PRESETS.map(preset => '```course-visual\n' + preset + '\n```').join('\n\n') + '\n\n## Examples\n\nAn example.'
    vi.stubGlobal('fetch', vi.fn(async (input: string) => input === '/data/system-courses.json' ? Response.json(courses) : courseSvgResponse(input) || new Response(markdown)))
    await progressDb.settings.put({ key: 'course.view', value: { catalogVersion: 3, courseSlug: 'first', readingPositions: { first: { tocId: 'toc-h2-2', tocText: 'Examples', scrollRatio: .5 } } }, updatedAt: Date.now() })
    const scroll = vi.fn(() => {
      expect(host.querySelectorAll('.course-spatial-visual')).toHaveLength(7)
      expect(host.querySelectorAll('.course-svg svg')).toHaveLength(12)
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
    try {
      await mount()
      await vi.waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: 'start' }))
      expect(host.querySelector('.course-visual-host pre')).toBeNull()
    } finally { Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView') }
  })

  it('cancels playing illustrations during rapid chapter changes and ignores a late visual response', async () => {
    const markdown = '# Test\n\nA readable lesson.\n\n```course-visual\nspatial-turning\n```'
    vi.stubGlobal('fetch', vi.fn(async (input: string) => input === '/data/system-courses.json' ? Response.json(courses) : courseSvgResponse(input) || new Response(markdown)))
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    await mount()
    await vi.waitFor(() => expect(host.querySelector<HTMLButtonElement>('.play-button')?.disabled).toBe(false))
    host.querySelector<HTMLButtonElement>('.play-button')!.click()
    let finish: (value: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn((input: string) => input.includes('second.md')
      ? new Promise<Response>(resolve => { finish = resolve }) : Promise.resolve(courseSvgResponse(input) || new Response(markdown))))
    const card = (title: string) => [...host.querySelectorAll<HTMLButtonElement>('.unit-card')].find(button => button.textContent?.includes(title))!
    card('Second course').click()
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(42)
    await nextTick()
    card('First course').click()
    await vi.waitFor(() => expect(host.querySelector('.play-button')?.textContent).toBe('播放演示'))
    finish(new Response('# Late\n\n```course-visual\nspatial-viewpoint\n```'))
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(host.querySelectorAll('.course-spatial-visual')).toHaveLength(1)
    expect(host.querySelector('[data-preset="spatial-viewpoint"]')).toBeNull()
  })

  it('cleans up illustrations on leaving and recreates them across desktop and mobile reading bodies', async () => {
    let changeMobile: (event: { matches: boolean }) => void = () => {}
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false,
      addEventListener: (_name: string, callback: typeof changeMobile) => { if (query.includes('767.98')) changeMobile = callback }, removeEventListener: vi.fn(),
    }))
    const markdown = '# Test\n\nA readable lesson.\n\n```course-visual\nspatial-viewpoint\n```'
    vi.stubGlobal('fetch', vi.fn(async (input: string) => input === '/data/system-courses.json' ? Response.json(courses) : courseSvgResponse(input) || new Response(markdown)))
    const { active } = await mount()
    await vi.waitFor(() => expect(host.querySelectorAll('.course-spatial-visual')).toHaveLength(1))
    await vi.waitFor(() => expect(host.querySelector<HTMLButtonElement>('[aria-label="人物朝向"] button')?.disabled).toBe(false))
    host.querySelectorAll<HTMLButtonElement>('[aria-label="人物朝向"] button')[1].click()
    await nextTick()
    active.value = false
    await vi.waitFor(() => expect(host.querySelector('.course-spatial-visual')).toBeNull())
    active.value = true
    await vi.waitFor(() => expect(host.querySelectorAll('.course-spatial-visual')).toHaveLength(1))
    changeMobile({ matches: true })
    await vi.waitFor(() => expect(host.querySelector('.mobile-course-library')).not.toBeNull())
    expect(host.querySelector('.course-spatial-visual')).toBeNull()
    const card = [...host.querySelectorAll<HTMLButtonElement>('.mobile-course-card')].find(button => button.textContent?.includes('First course'))!
    card.click()
    await vi.waitFor(() => expect(host.querySelectorAll('.course-spatial-visual')).toHaveLength(1))
    expect(host.querySelector('[aria-label="人物朝向"] button')?.getAttribute('aria-pressed')).toBe('true')
    changeMobile({ matches: false })
    await vi.waitFor(() => expect(host.querySelector('.markdown-prose .course-spatial-visual')).not.toBeNull())
    expect(host.querySelectorAll('.course-spatial-visual')).toHaveLength(1)
  })

  it('shows a readable fallback for an unknown illustration instead of its control syntax', async () => {
    const markdown = '# Test\n\nA readable lesson.\n\n```course-visual\nunknown\n```'
    vi.stubGlobal('fetch', vi.fn(async (input: string) => input === '/data/system-courses.json' ? Response.json(courses) : new Response(markdown)))
    await mount()
    expect(host.querySelector('.course-visual-unavailable')?.textContent).toContain('图示暂时无法显示')
    expect(host.querySelector('.markdown-prose')?.textContent).not.toContain('unknown')
  })

  it('keeps the introduction visible when restoring a chapter saved at the beginning', async () => {
    await progressDb.settings.put({ key: 'course.view', value: { catalogVersion: 3, courseSlug: 'first', readingPositions: { first: { tocId: 'toc-h2-1', tocText: 'Overview', scrollRatio: 0 } } }, updatedAt: Date.now() })
    const scroll = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
    try {
      await mount()
      expect(scroll).not.toHaveBeenCalled()
      expect(host.querySelector('.markdown-body')?.scrollTop).toBe(0)
    } finally { Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView') }
  })

  it('restores a retained heading after migrating a legacy reading record', async () => {
    await progressDb.settings.put({ key: 'course.view', value: { catalogVersion: 2, courseId: 1, readingPositions: { 1: { tocId: 'old-heading', tocText: 'Overview', scrollRatio: .7 } } }, updatedAt: Date.now() })
    const scroll = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
    try {
      await mount()
      await vi.waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: 'start' }))
    } finally { Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView') }
  })
  it('drops obsolete filters, lists chapters directly, and navigates across series within a category', async () => {
    await progressDb.settings.put({ key: 'course.view', value: { catalogVersion: 3, courseSlug: 'first', tag: '发音', collapsedSeries: ['语法/句子系统'] }, updatedAt: Date.now() })
    await mount()
    expect(host.querySelector('.course-tag-strip')).toBeNull()
    expect(host.querySelector('.series-heading')).toBeNull()
    expect(host.querySelectorAll('.course-group-courses > .unit-card')).toHaveLength(4)
    const group = host.querySelector<HTMLButtonElement>('.group-header[aria-label="折叠 语法"]')!
    group.click()
    await nextTick()
    expect(group.getAttribute('aria-expanded')).toBe('false')
    await vi.waitFor(async () => expect((await progressDb.settings.get('course.view'))?.value).toMatchObject({ collapsedCourseGroups: ['语法'] }))
    const search = host.querySelector<HTMLInputElement>('.duo-search')!
    search.value = '句子系统'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(host.querySelectorAll('.unit-card')).toHaveLength(2)
    expect(group.getAttribute('aria-expanded')).toBe('true')
    host.querySelectorAll<HTMLButtonElement>('.unit-card')[1].click()
    await vi.waitFor(() => expect(host.querySelector('.desktop-course-title-row h2')?.textContent).toBe('Second course'))
    const next = [...host.querySelectorAll<HTMLButtonElement>('.desktop-course-actions button')].find(button => button.textContent?.includes('下一篇'))!
    expect(host.querySelector('.desktop-course-progress')?.textContent).toBe('2 / 3')
    expect(next.disabled).toBe(false)
    await vi.waitFor(async () => expect((await progressDb.settings.get('course.view'))?.value).toMatchObject({ catalogVersion: 3, courseSlug: 'second', searchQuery: '句子系统' }))
    next.click()
    await vi.waitFor(() => expect(host.querySelector('.desktop-course-title-row h2')?.textContent).toBe('Fourth course'))
    expect(next.disabled).toBe(true)
    const saved = (await progressDb.settings.get('course.view'))?.value as Record<string, unknown>
    expect(saved).not.toHaveProperty('tag')
    expect(saved).not.toHaveProperty('collapsedSeries')
  })

  it('uses the same flat categories and continuous chapter navigation on mobile', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    await mount(true)
    expect(host.querySelector('.course-tag-strip')).toBeNull()
    expect(host.querySelector('.series-heading')).toBeNull()
    expect(host.querySelectorAll('.mobile-group-courses > .mobile-course-card')).toHaveLength(4)
    const card = [...host.querySelectorAll<HTMLButtonElement>('.mobile-course-card')].find(button => button.textContent?.includes('Second course'))!
    card.click()
    await vi.waitFor(() => expect(host.querySelector('.mobile-reader-content .markdown-body')?.textContent).toContain('A readable lesson'))
    expect(host.querySelector('.mobile-lesson-progress')?.textContent).toBe('2 / 3')
    const next = host.querySelector<HTMLButtonElement>('.mobile-lesson-nav button:last-child')!
    expect(next.disabled).toBe(false)
    next.click()
    await vi.waitFor(() => expect(host.querySelector('.mobile-reader-content h2')?.textContent).toBe('Fourth course'))
    expect(next.disabled).toBe(true)
    host.querySelector<HTMLButtonElement>('[aria-label="返回课程库"]')!.click()
    await vi.waitFor(() => expect(host.querySelector('.mobile-course-library')).not.toBeNull())
    const search = host.querySelector<HTMLInputElement>('.mobile-course-search input')!
    search.value = '句子系统'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(host.querySelectorAll('.mobile-course-card')).toHaveLength(2)
    search.value = 'Second'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(host.querySelectorAll('.mobile-course-card')).toHaveLength(1)
    expect(host.querySelector('.mobile-course-num')?.textContent).toBe('02')
  })

  it('ignores an outdated response after the user switches back to another chapter', async () => {
    await mount()
    let finish: (value: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn((input: string) => input.includes('second.md')
      ? new Promise<Response>(resolve => { finish = resolve })
      : Promise.resolve(new Response('# Current\n\n## Overview\n\nA readable lesson.'))))
    const card = (title: string) => [...host.querySelectorAll<HTMLButtonElement>('.unit-card')].find(button => button.querySelector('.unit-name')?.textContent === title)!
    card('Second course').click()
    await nextTick()
    card('First course').click()
    await vi.waitFor(() => expect(host.querySelector('.markdown-prose')?.textContent).toContain('A readable lesson.'))
    finish(new Response('# Outdated second chapter'))
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(host.querySelector('.markdown-prose')?.textContent).not.toContain('Outdated')
    expect(host.querySelector('.desktop-course-title-row h2')?.textContent).toBe('First course')
  })

  it('loads internal chapter links and offers retry on a failed request', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => input === '/data/system-courses.json'
      ? Response.json(courses)
      : new Response('# First\n\nA readable lesson.\n\n[Read second](#course=second)')))
    await mount()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    host.querySelector<HTMLAnchorElement>('.markdown-prose a')!.click()
    await vi.waitFor(() => expect(host.querySelector('.content-error')?.textContent).toContain('讲义加载失败'))
    expect(host.querySelector('.desktop-course-title-row h2')?.textContent).toBe('Second course')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('# Retry\n\nA recovered lesson.')))
    host.querySelector<HTMLButtonElement>('.content-error button')!.click()
    await vi.waitFor(() => expect(host.querySelector('.markdown-prose')?.textContent).toContain('A recovered lesson.'))
  })

  it('opens the table of contents as a drawer without replacing or scrolling the lesson', async () => {
    const { layout } = await mount()
    expect(host.querySelector('.duo-menu-sidebar.is-desktop-drawer')).toBeNull()
    expect(host.querySelector('.toc-sidebar')).toBeNull()
    const article = host.querySelector<HTMLElement>('.markdown-body')!
    article.scrollTop = 120
    const trigger = action('打开课程目录')
    await nextTick()
    await nextTick()
    const drawer = host.querySelector<HTMLElement>('.toc-sidebar[role="dialog"]')!
    expect(drawer).not.toBeNull()
    expect(drawer.contains(document.activeElement)).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await nextTick()
    await nextTick()
    expect(host.querySelector('.toc-sidebar')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(host.querySelector('.markdown-body')).toBe(article)
    expect(article.scrollTop).toBe(120)
    expect(layout.value).toEqual(savedLayout)
  })

  it('uses a course drawer in narrower workspaces and keeps course/search state on selection', async () => {
    workspaceWidth = 700
    const { layout } = await mount()
    expect(host.querySelector('.duo-menu-sidebar')).toBeNull()
    action('展开课程列表')
    await nextTick()
    const drawer = host.querySelector<HTMLElement>('.duo-menu-sidebar[role="dialog"]')!
    expect(drawer).not.toBeNull()
    const search = drawer.querySelector<HTMLInputElement>('input')!
    search.value = 'Second'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(drawer.querySelectorAll('.unit-card')).toHaveLength(1)
    expect(drawer.querySelector('.unit-num')?.textContent).toBe('2')
    drawer.querySelector<HTMLButtonElement>('.unit-card')!.click()
    await nextTick()
    expect(host.querySelector('.duo-menu-sidebar')).toBeNull()
    await vi.waitFor(() => expect(host.querySelector('.desktop-course-title-row h2')?.textContent).toBe('Second course'))
    action('展开课程列表')
    await nextTick()
    expect(host.querySelector<HTMLInputElement>('.duo-menu-sidebar input')?.value).toBe('Second')
    expect(layout.value).toEqual(savedLayout)
  })

  it('adapts to resizing and only persists deliberate pane collapse actions', async () => {
    const { layout } = await mount()
    workspaceWidth = 1500
    resize()
    await nextTick()
    expect(host.querySelector('.toc-sidebar')).not.toBeNull()
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    action('折叠课程列表')
    await nextTick()
    expect(layout.value.libraryCollapsed).toBe(true)
    expect(host.querySelector('.duo-menu-sidebar')).toBeNull()
    workspaceWidth = 700
    resize()
    await nextTick()
    action('展开课程列表')
    await nextTick()
    host.querySelector<HTMLElement>('.desktop-course-drawer-mask')!.click()
    await nextTick()
    expect(layout.value.libraryCollapsed).toBe(true)
    expect(host.querySelector('[role="dialog"]')).toBeNull()
  })

  it('closes transient drawers when leaving the module', async () => {
    const { active } = await mount()
    action('打开课程目录')
    await nextTick()
    expect(host.querySelector('.desktop-course-drawer-mask')).not.toBeNull()
    active.value = false
    await nextTick()
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})
