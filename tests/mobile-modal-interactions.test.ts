import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import MobileMoreSheet from '../src/components/MobileMoreSheet.vue'
import WordTooltip from '../src/components/WordTooltip.vue'
import type { WordEntry } from '../src/lib/db'
import type { AppTabId } from '../src/lib/progress-db'

const mountedApps: App[] = []

async function settle(): Promise<void> {
  await nextTick()
  await nextTick()
  await nextTick()
}

function mount(render: () => ReturnType<typeof h>): App {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(defineComponent({ setup: () => render }))
  app.mount(host)
  mountedApps.push(app)
  return app
}

function press(key: string, shiftKey = false): void {
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  }))
}

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mediaQueryList = {
    get matches() { return matches },
    media: '(max-width: 767.98px)',
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  } as unknown as MediaQueryList

  vi.stubGlobal('matchMedia', vi.fn(() => mediaQueryList))
  return {
    setMatches(value: boolean) {
      matches = value
      const event = { matches: value, media: mediaQueryList.media } as MediaQueryListEvent
      listeners.forEach(listener => listener(event))
    },
  }
}

const moreItems = [
  { id: 'wordnet', icon: '🕸️', label: '语义网络' },
  { id: 'settings', icon: '⚙️', label: '设置' },
] as const

const wordEntry: WordEntry = {
  word: 'bank',
  phonetic: 'bæŋk',
  translation: '银行',
  tags: '',
  frequency: 1,
  exchange: '',
  cacheLevel: 'full',
}

afterEach(() => {
  while (mountedApps.length) mountedApps.pop()?.unmount()
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  vi.unstubAllGlobals()
})

describe('mobile bottom modal interactions', () => {
  it('traps focus and restores focus and scroll after Escape closes the more sheet', async () => {
    document.body.style.overflow = 'clip'
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const open = ref(true)

    mount(() => h(MobileMoreSheet, {
      open: open.value,
      mobile: true,
      activeId: 'reader',
      items: moreItems,
      returnFocus: trigger,
      onClose: () => { open.value = false },
    }))
    await settle()

    const buttons = Array.from(document.querySelectorAll<HTMLElement>('.more-sheet-item'))
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement).toBe(buttons[0])

    buttons[1].focus()
    press('Tab')
    expect(document.activeElement).toBe(buttons[0])
    press('Tab', true)
    expect(document.activeElement).toBe(buttons[1])

    press('Escape')
    await settle()
    expect(open.value).toBe(false)
    expect(document.body.style.overflow).toBe('clip')
    expect(document.activeElement).toBe(trigger)
  })

  it('closes the more sheet on selection, backdrop click, and breakpoint changes', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    const open = ref(true)
    const mobile = ref(true)
    const selected = ref<AppTabId | null>(null)

    mount(() => h(MobileMoreSheet, {
      open: open.value,
      mobile: mobile.value,
      activeId: 'reader',
      items: moreItems,
      returnFocus: trigger,
      onClose: () => { open.value = false },
      onSelect: (id: AppTabId) => {
        selected.value = id
        open.value = false
      },
    }))
    await settle()

    document.querySelector<HTMLElement>('.more-sheet-item')!.click()
    await settle()
    expect(selected.value).toBe('wordnet')
    expect(document.body.style.overflow).toBe('')

    open.value = true
    await settle()
    document.querySelector<HTMLElement>('.more-sheet-mask')!.click()
    await settle()
    expect(open.value).toBe(false)

    open.value = true
    await settle()
    mobile.value = false
    await settle()
    expect(open.value).toBe(false)
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps scrolling locked until every open modal has released its lock', async () => {
    document.body.style.overflow = 'auto'
    const firstOpen = ref(true)
    const secondOpen = ref(true)

    const first = mount(() => h(MobileMoreSheet, {
      open: firstOpen.value,
      mobile: true,
      activeId: 'reader',
      items: moreItems,
      onClose: () => { firstOpen.value = false },
    }))
    const second = mount(() => h(MobileMoreSheet, {
      open: secondOpen.value,
      mobile: true,
      activeId: 'reader',
      items: moreItems,
      onClose: () => { secondOpen.value = false },
    }))
    await settle()

    first.unmount()
    mountedApps.splice(mountedApps.indexOf(first), 1)
    await settle()
    expect(document.body.style.overflow).toBe('hidden')

    second.unmount()
    mountedApps.splice(mountedApps.indexOf(second), 1)
    await settle()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('gives the mobile dictionary sheet dialog behavior and restores its trigger', async () => {
    mockMatchMedia(true)
    document.body.style.overflow = 'scroll'
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const visible = ref(true)

    mount(() => h(WordTooltip, {
      visible: visible.value,
      word: 'bank',
      data: wordEntry,
      position: { x: 10, y: 10 },
      returnFocus: trigger,
      onClose: () => { visible.value = false },
      onSpeak: () => undefined,
    }))
    await settle()

    const dialog = document.querySelector<HTMLElement>('.tooltip-card')!
    const speech = document.querySelector<HTMLElement>('.word-speech-row')!
    const close = document.querySelector<HTMLElement>('.close-btn')!
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement).toBe(speech)

    close.focus()
    press('Tab')
    expect(document.activeElement).toBe(speech)
    press('Escape')
    await settle()
    expect(visible.value).toBe(false)
    expect(document.body.style.overflow).toBe('scroll')
    expect(document.activeElement).toBe(trigger)

    visible.value = true
    await settle()
    document.querySelector<HTMLElement>('.close-btn')!.click()
    await settle()
    expect(visible.value).toBe(false)
    expect(document.body.style.overflow).toBe('scroll')
    expect(document.activeElement).toBe(trigger)

    visible.value = true
    await settle()
    document.querySelector<HTMLElement>('.tooltip-overlay')!.click()
    await settle()
    expect(visible.value).toBe(false)
    expect(document.body.style.overflow).toBe('scroll')
    expect(document.activeElement).toBe(trigger)
  })

  it('releases dictionary modal behavior on desktop breakpoint and component unmount', async () => {
    const media = mockMatchMedia(true)
    const trigger = document.createElement('button')
    document.body.append(trigger)
    const visible = ref(true)
    const app = mount(() => h(WordTooltip, {
      visible: visible.value,
      word: 'bank',
      data: wordEntry,
      position: { x: 10, y: 10 },
      returnFocus: trigger,
      onClose: () => { visible.value = false },
      onSpeak: () => undefined,
    }))
    await settle()
    expect(document.body.style.overflow).toBe('hidden')

    media.setMatches(false)
    await settle()
    expect(visible.value).toBe(true)
    expect(document.body.style.overflow).toBe('')
    expect(document.querySelector('.tooltip-card')?.getAttribute('role')).toBeNull()

    media.setMatches(true)
    await settle()
    expect(document.body.style.overflow).toBe('hidden')
    app.unmount()
    mountedApps.splice(mountedApps.indexOf(app), 1)
    await settle()
    expect(document.body.style.overflow).toBe('')
  })
})
