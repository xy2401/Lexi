import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import CourseSvg from '../src/components/CourseSvg.vue'
import CourseSpatialVisual from '../src/components/CourseSpatialVisual.vue'
import { COURSE_SVG_SIZES } from '../src/lib/course-visual-presets.mjs'
import { loadCourseSvg, scopeCourseSvg, type CourseSvgAsset } from '../src/lib/course-svg'
import { courseSvgFixture, courseSvgResponse } from './course-svg-fixture'

let app: App | undefined
let host: HTMLDivElement
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  vi.stubGlobal('fetch', vi.fn(async (input: string) => courseSvgResponse(input)!))
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})
afterEach(() => {
  app?.unmount()
  app = undefined
  host.remove()
  vi.unstubAllGlobals()
})

describe('standalone course SVG assets', () => {
  it('opens every registered file as a complete SVG without Vue syntax or external styles', () => {
    for (const [asset, size] of Object.entries(COURSE_SVG_SIZES)) {
      const source = courseSvgFixture(asset as CourseSvgAsset)
      const xml = new DOMParser().parseFromString(source, 'image/svg+xml')
      expect(xml.querySelector('parsererror')).toBeNull()
      expect(xml.documentElement.getAttribute('viewBox')).toBe(`0 0 ${size.join(' ')}`)
      expect(xml.documentElement.getAttribute('role')).toBe('img')
      expect(xml.documentElement.getAttribute('aria-label')).toBeTruthy()
      expect(source).not.toMatch(/\{\{|\bv-(?:if|for|bind)\b|\s:[\w-]+=/)
      expect(xml.querySelector('style, script, foreignObject, image')).toBeNull()
      const ids = new Set([...xml.querySelectorAll('[id]')].map(node => node.id))
      for (const [, marker] of source.matchAll(/url\(#([\w-]+)\)/g)) expect(ids.has(marker)).toBe(true)
    }
  })

  it('shares a concurrent request and scopes marker references independently for repeated diagrams', async () => {
    const first = loadCourseSvg('spatial-viewpoint')
    const second = loadCourseSvg('spatial-viewpoint')
    expect(second).toBe(first)
    expect(fetch).toHaveBeenCalledTimes(1)
    const source = await first
    for (const instance of ['first', 'second']) {
      const xml = new DOMParser().parseFromString(scopeCourseSvg(source, instance), 'image/svg+xml')
      expect(xml.querySelector('marker')?.id).toBe(`${instance}-arrow`)
      expect(xml.querySelector('[data-part="front-arrow"]')?.getAttribute('marker-end')).toBe(`url(#${instance}-arrow)`)
    }
  })

  it('rejects unregistered paths without fetching them', async () => {
    await expect(loadCourseSvg('../spatial-screen' as CourseSvgAsset)).rejects.toThrow('未知课程 SVG')
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['<html>Not SVG</html>', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>', '<svg'])('rejects malformed or mismatched content: %s', async source => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(source)))
    await expect(loadCourseSvg('spatial-screen')).rejects.toThrow('课程 SVG 格式无效')
  })

  it('sanitizes loaded SVG while preserving its accessible labels and presentation attributes', async () => {
    const source = courseSvgFixture('spatial-screen').replace('</svg>', '<script>alert(1)</script><foreignObject><div>bad</div></foreignObject><image href="https://example.com/image"/><path onload="alert(1)" style="fill:red"/></svg>')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(source)))
    const safe = await loadCourseSvg('spatial-screen')
    expect(safe).not.toMatch(/script|foreignObject|<image|onload|style=/)
    expect(safe).toContain('role="img"')
    expect(safe).toContain('aria-label=')
    expect(safe).toContain('text-anchor="end"')
    expect(safe).toContain('font-size="17"')
  })
})

describe('asynchronous SVG lifecycle', () => {
  it('reserves space, disables interactive controls after a failed request, and allows retry', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockImplementation(async (input: string) => courseSvgResponse(input)!))
    app = createApp(CourseSpatialVisual, { preset: 'spatial-turning' })
    app.mount(host)
    const box = host.querySelector<HTMLElement>('.course-svg')!
    expect(box.style.aspectRatio).toBe('360 / 325')
    await vi.waitFor(() => expect(host.querySelector('.svg-placeholder button')?.textContent).toBe('重试图示'))
    expect(host.querySelector<HTMLButtonElement>('.play-button')?.disabled).toBe(true)
    host.querySelector<HTMLButtonElement>('.svg-placeholder button')!.click()
    await vi.waitFor(() => expect(host.querySelector<HTMLButtonElement>('.play-button')?.disabled).toBe(false))
    expect(host.querySelector('.motion-person')).not.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(box.style.aspectRatio).toBe('360 / 325')
  })

  it('ignores the old response when the file changes during loading', async () => {
    let finish: (response: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn((input: string) => input.endsWith('/spatial-viewpoint.svg')
      ? new Promise<Response>(resolve => { finish = resolve }) : Promise.resolve(courseSvgResponse(input)!)))
    const asset = ref<CourseSvgAsset>('spatial-viewpoint')
    app = createApp(defineComponent({ setup: () => () => h(CourseSvg, { asset: asset.value }) }))
    app.mount(host)
    asset.value = 'spatial-screen'
    await vi.waitFor(() => expect(host.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 360 310'))
    finish(new Response(courseSvgFixture('spatial-viewpoint')))
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()
    expect(host.querySelector('.viewpoint-person')).toBeNull()
    expect(host.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 360 310')
  })

  it('does not mount a late SVG or emit ready after the reader is removed', async () => {
    let finish: (response: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
    const ready = vi.fn()
    app = createApp(CourseSvg, { asset: 'spatial-route', onReady: ready })
    app.mount(host)
    app.unmount()
    app = undefined
    finish(new Response(courseSvgFixture('spatial-route')))
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()
    expect(host.querySelector('svg')).toBeNull()
    expect(ready).not.toHaveBeenCalledWith(true)
  })
})
