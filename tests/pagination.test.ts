import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import PaginationBar from '../src/components/PaginationBar.vue'
import { scrollToListAnchor } from '../src/lib/scroll-anchor'

let app: App | undefined
let host: HTMLDivElement
const rect = (top: number, height = 0) => ({ top, bottom: top + height, height } as DOMRect)

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function mountList() {
  const page = ref(1)
  const size = ref(20)
  app = createApp(defineComponent({ setup: () => () => h('section', { style: { overflowY: 'auto' } }, [
    h('div', { class: 'list' }, [true, false].map(top => h(PaginationBar, {
      top, currentPage: page.value, pageSize: size.value, totalPages: 5, totalItems: 100,
      'onUpdate:currentPage': (value: number) => { page.value = value },
      'onUpdate:pageSize': (value: number) => { size.value = value },
    }))),
  ]) }))
  app.mount(host)
  const pane = host.querySelector('section')!
  pane.scrollTop = 600
  pane.scrollTo = vi.fn()
  vi.spyOn(pane, 'getBoundingClientRect').mockReturnValue(rect(80))
  const top = host.querySelector<HTMLElement>('.top-pagination')!
  vi.spyOn(top, 'getBoundingClientRect').mockReturnValue(rect(-480))
  return { pane, page, size }
}

describe('pagination scroll destination', () => {
  it('scrolls the desktop list pane after the new page is rendered', async () => {
    const { pane, page } = mountList()
    const next = host.querySelectorAll<HTMLButtonElement>('.pagination-bar:not(.top-pagination) button')[2]
    next.click()
    expect(pane.scrollTo).not.toHaveBeenCalled()
    await nextTick()
    expect(page.value).toBe(2)
    expect(host.querySelector<HTMLSelectElement>('.page-select')?.value).toBe('2')
    expect(pane.scrollTo).toHaveBeenCalledWith({ top: 28, behavior: 'smooth' })
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('also returns to the list anchor on a bottom page-size change', async () => {
    const { pane, page, size } = mountList()
    page.value = 3
    await nextTick()
    const select = host.querySelector<HTMLSelectElement>('.pagination-bar:not(.top-pagination) .page-size-select')!
    select.value = '10'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect([page.value, size.value]).toEqual([1, 10])
    expect(pane.scrollTo).toHaveBeenCalledOnce()
  })

  it('does not move the page when using top pagination', async () => {
    const { pane } = mountList()
    host.querySelectorAll<HTMLButtonElement>('.top-pagination button')[2].click()
    await nextTick()
    expect(pane.scrollTo).not.toHaveBeenCalled()
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('uses the mobile document and leaves space for the sticky app bar', () => {
    const header = document.createElement('header')
    header.className = 'mobile-app-bar'
    host.append(header)
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(rect(0, 52))
    const target = document.createElement('div')
    host.append(target)
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect(100))
    vi.stubGlobal('scrollY', 800)
    scrollToListAnchor(target)
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 836, behavior: 'smooth' })
  })

  it('uses the nearest pane, clamps the destination and honors reduced motion', () => {
    const outer = document.createElement('div')
    const inner = document.createElement('div')
    const target = document.createElement('div')
    outer.style.overflowY = inner.style.overflowY = 'auto'
    outer.append(inner)
    inner.append(target)
    host.append(outer)
    outer.scrollTo = vi.fn()
    inner.scrollTo = vi.fn()
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect(-100))
    vi.spyOn(inner, 'getBoundingClientRect').mockReturnValue(rect(0))
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    scrollToListAnchor(target)
    expect(inner.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
    expect(outer.scrollTo).not.toHaveBeenCalled()
  })
})
