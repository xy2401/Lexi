import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DESKTOP_LAYOUT,
  normalizeDesktopLayout,
} from '../src/lib/desktop-layout'

describe('desktop layout settings', () => {
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
