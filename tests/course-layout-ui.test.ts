import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import SystemCourseView from '../src/components/SystemCourseView.vue'
import { progressDb } from '../src/lib/progress-db'
import type { CourseDesktopLayout } from '../src/lib/desktop-layout'

const courses = [
  { id: 1, slug: 'first', title: 'First course', desc: 'First', tag: '句子与语法', icon: '', words: [], file: '/data/system-courses/first.md' },
  { id: 2, slug: 'second', title: 'Second course', desc: 'Second', tag: '句子与语法', icon: '', words: [], file: '/data/system-courses/second.md' },
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
    : new Response('# Test course\n\n## Overview\n\nA readable lesson.\n\n## Examples\n\nAn example.')))
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

async function mount() {
  const layout = ref({ ...savedLayout })
  const active = ref(true)
  app = createApp(defineComponent({ setup: () => () => h(SystemCourseView, {
    desktopLayout: layout.value, active: active.value,
    'onUpdate:desktop-layout': (value: CourseDesktopLayout) => { layout.value = value },
  }) }))
  app.mount(host)
  await vi.waitFor(() => expect(host.querySelector('.markdown-prose')?.textContent).toContain('A readable lesson'))
  return { layout, active }
}
function action(label: string) {
  const button = host.querySelector<HTMLButtonElement>(`.desktop-course-actions button[aria-label="${label}"]`)!
  expect(button).toBeTruthy()
  button.click()
  return button
}

describe('adaptive course panes', () => {
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
