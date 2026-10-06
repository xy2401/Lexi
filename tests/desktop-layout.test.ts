import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DESKTOP_LAYOUT,
  normalizeDesktopLayout,
  coursePaneModes,
} from '../src/lib/desktop-layout'

describe('desktop layout settings', () => {
  it('uses drawers when the workspace cannot fit readable prose and both panes', () => {
    const saved = { libraryWidth: 300, tocWidth: 260, libraryCollapsed: false, tocCollapsed: false }
    expect(coursePaneModes(1000, saved)).toMatchObject({ libraryInline: true, tocInline: false })
    expect(coursePaneModes(800, saved)).toMatchObject({ libraryInline: false, tocInline: false })
    expect(coursePaneModes(1500, saved)).toMatchObject({ libraryInline: true, tocInline: true })
    expect(coursePaneModes(0, saved)).toMatchObject({ libraryInline: false, tocInline: false })
  })

  it('reclaims collapsed pane space and limits resizing to preserve reading width', () => {
    const saved = { libraryWidth: 300, tocWidth: 260, libraryCollapsed: true, tocCollapsed: false }
    expect(coursePaneModes(1000, saved)).toMatchObject({ tocInline: true, libraryMaxWidth: 328, tocMaxWidth: 328 })
    expect(coursePaneModes(1000, { ...saved, libraryCollapsed: false }).tocInline).toBe(false)
    expect(coursePaneModes(1200, { ...saved, libraryWidth: 420, tocWidth: 360, libraryCollapsed: false })).toMatchObject({ libraryInline: true, tocInline: false })
  })

  it('returns safe defaults for missing or malformed data', () => {
    expect(normalizeDesktopLayout(null)).toEqual(DEFAULT_DESKTOP_LAYOUT)
    expect(normalizeDesktopLayout({
      sidebarCollapsed: 'yes',
      dictionary: { leftWidth: Number.NaN, leftCollapsed: 1 },
      course: { libraryWidth: 'wide', tocWidth: null },
    })).toEqual(DEFAULT_DESKTOP_LAYOUT)
  })

  it('preserves valid state and clamps pane widths', () => {
    expect(normalizeDesktopLayout({
      sidebarCollapsed: true,
      dictionary: { leftWidth: 999, leftCollapsed: true },
      course: {
        libraryWidth: 100,
        tocWidth: 320,
        libraryCollapsed: true,
        tocCollapsed: true,
      },
    })).toEqual({
      sidebarCollapsed: true,
      dictionary: { leftWidth: 440, leftCollapsed: true },
      course: {
        libraryWidth: 240,
        tocWidth: 320,
        libraryCollapsed: true,
        tocCollapsed: true,
      },
    })
  })
})
