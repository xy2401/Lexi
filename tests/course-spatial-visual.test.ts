import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import CourseSpatialVisual from '../src/components/CourseSpatialVisual.vue'
import { COURSE_VISUAL_PRESETS, createCourseVisualMounts, renderCourseVisualBlock, type CourseVisualPreset } from '../src/lib/course-visuals'
import { COURSE_VISUAL_ASSETS } from '../src/lib/course-visual-presets.mjs'
import { courseSvgResponse } from './course-svg-fixture'

let app: App | undefined
let host: HTMLDivElement
let callbacks: Map<number, FrameRequestCallback>
let nextFrame: number
let reduced = false

beforeEach(() => {
  reduced = false
  callbacks = new Map()
  nextFrame = 0
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { callbacks.set(++nextFrame, callback); return nextFrame }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => callbacks.delete(id)))
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.stubGlobal('fetch', vi.fn(async (input: string) => courseSvgResponse(input)!))
  host = document.createElement('div')
  document.body.append(host)
})
afterEach(() => {
  app?.unmount()
  app = undefined
  host.remove()
  vi.unstubAllGlobals()
})
async function mount(preset: CourseVisualPreset) {
  app = createApp(CourseSpatialVisual, { preset })
  app.mount(host)
  await vi.waitFor(() => expect(host.querySelectorAll('svg[role="img"]')).toHaveLength(COURSE_VISUAL_ASSETS[preset].length))
  await nextTick()
}
async function frame(timestamp: number) {
  const pending = [...callbacks.values()]
  callbacks.clear()
  pending.forEach(callback => callback(timestamp))
  await nextTick()
}

describe('spatial lesson illustrations', () => {
  it.each(COURSE_VISUAL_PRESETS)('renders the %s diagram with accessible labels and unique markers', async preset => {
    await mount(preset)
    expect(host.querySelector('figcaption')?.textContent).toBeTruthy()
    for (const svg of host.querySelectorAll('svg[role="img"]')) expect(svg.getAttribute('aria-label')).toBeTruthy()
    const ids = [...host.querySelectorAll('marker')].map(marker => marker.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(fetch).toHaveBeenCalledTimes(COURSE_VISUAL_ASSETS[preset].length)
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('keeps landmarks fixed while updating all four relative directions and explanations', async () => {
    await mount('spatial-viewpoint')
    const expected = [
      ['up', 'right', 'down', 'left'],
      ['right', 'down', 'left', 'up'],
      ['down', 'left', 'up', 'right'],
      ['left', 'up', 'right', 'down'],
    ]
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('[aria-label="人物朝向"] button')]
    for (const [index, button] of buttons.entries()) {
      button.click()
      await nextTick()
      expect(button.getAttribute('aria-pressed')).toBe('true')
      for (const [relationIndex, relation] of ['front', 'right', 'back', 'left'].entries()) {
        expect(host.querySelector(`[data-relation="${relation}"]`)?.getAttribute('data-screen-position')).toBe(expected[index][relationIndex])
      }
      expect(host.querySelector('[aria-live="polite"]')?.textContent).toContain('人物朝画面')
      expect(host.querySelectorAll('.landmark-letter')[0].textContent).toBe('A')
    }
    expect(host.querySelector('svg[aria-label*="球在盒子上方"]')).not.toBeNull()
  })

  it.each([
    ['straight', 0, [180, 80, 0]],
    ['left', 1, [70, 170, -90]],
    ['right', 2, [290, 170, 90]],
    ['clockwise', 3, [180, 82, 450]],
    ['counterclockwise', 4, [180, 82, -450]],
  ] as const)('plays and replays %s only after an explicit action', async (_motion, index, ending) => {
    await mount('spatial-turning')
    host.querySelectorAll<HTMLButtonElement>('[aria-label="移动方式"] button')[index].click()
    await nextTick()
    const play = host.querySelector<HTMLButtonElement>('.play-button')!
    const start = host.querySelector('.motion-person')!.getAttribute('transform')
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
    play.click()
    await nextTick()
    expect(play.disabled).toBe(true)
    await frame(0)
    await frame(1000)
    expect(host.querySelector('.motion-person')!.getAttribute('data-progress')).toBe('0.5')
    await frame(2000)
    const values = host.querySelector('.motion-person')!.getAttribute('transform')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    ending.forEach((value, coordinate) => expect(values[coordinate]).toBeCloseTo(value))
    expect(play.disabled).toBe(false)
    expect(play.textContent).toBe('重播')
    expect(callbacks.size).toBe(0)
    play.click()
    await nextTick()
    expect(host.querySelector('.motion-person')!.getAttribute('transform')).toBe(start)
  })

  it('cancels the old animation when the action changes and on unmount', async () => {
    await mount('spatial-turning')
    host.querySelector<HTMLButtonElement>('.play-button')!.click()
    expect(callbacks.size).toBe(1)
    host.querySelectorAll<HTMLButtonElement>('[aria-label="移动方式"] button')[1].click()
    await nextTick()
    expect(callbacks.size).toBe(0)
    expect(host.querySelector('.play-button')?.textContent).toBe('播放演示')
    host.querySelector<HTMLButtonElement>('.play-button')!.click()
    app!.unmount()
    app = undefined
    expect(callbacks.size).toBe(0)
  })

  it('shows the end pose without animation when reduced motion is enabled', async () => {
    reduced = true
    await mount('spatial-turning')
    host.querySelector<HTMLButtonElement>('.play-button')!.click()
    await nextTick()
    expect(host.querySelector('.motion-person')?.getAttribute('transform')).toBe('translate(180 80) rotate(0)')
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
    expect(host.querySelector('.play-button')?.textContent).toBe('重播')
    expect(host.textContent).toContain('已减少动态效果')
  })

  it('finishes an active animation when reduced motion is turned on', async () => {
    let changed: (event: { matches: boolean }) => void = () => {}
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: (_name: string, callback: typeof changed) => { changed = callback }, removeEventListener: vi.fn() }))
    await mount('spatial-turning')
    host.querySelector<HTMLButtonElement>('.play-button')!.click()
    changed({ matches: true })
    await nextTick()
    expect(callbacks.size).toBe(0)
    expect(host.querySelector('.motion-person')?.getAttribute('data-progress')).toBe('1')
  })
})

describe('course visual block rendering and lifecycle', () => {
  it('accepts one registered preset and keeps unknown or unsafe source out of the reader', () => {
    expect(renderCourseVisualBlock(' spatial-viewpoint\n')).toContain('data-course-visual="spatial-viewpoint"')
    for (const input of ['unknown', 'spatial-viewpoint\nspatial-route', '<script>alert(1)</script>']) {
      const html = renderCourseVisualBlock(input)
      expect(html).toContain('图示暂时无法显示')
      expect(html).not.toContain(input)
      expect(html).not.toContain('data-course-visual')
    }
  })

  it('mounts each slot once, cleans up removed bodies and releases all animations', async () => {
    const mounts = createCourseVisualMounts()
    try {
      host.innerHTML = renderCourseVisualBlock('spatial-turning') + renderCourseVisualBlock('spatial-viewpoint')
      await mounts.mount(host)
      await mounts.mount(host)
      expect(host.querySelectorAll('.course-spatial-visual')).toHaveLength(2)
      const ids = [...host.querySelectorAll('marker')].map(marker => marker.id)
      expect(new Set(ids).size).toBe(ids.length)
      host.querySelector<HTMLButtonElement>('.play-button')!.click()
      expect(callbacks.size).toBe(1)
      host.innerHTML = renderCourseVisualBlock('spatial-screen')
      await mounts.mount(host)
      await nextTick()
      expect(callbacks.size).toBe(0)
      expect(host.querySelectorAll('.course-spatial-visual')).toHaveLength(1)
      mounts.clear()
      expect(host.querySelector('.course-spatial-visual')).toBeNull()
    } finally { mounts.clear() }
  })
})
