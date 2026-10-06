import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import LexiApp from '../src/App.vue'
import { useDictStore } from '../src/stores/dict'
import { getProgressSetting, progressDb, setProgressSetting } from '../src/lib/progress-db'

const lifecycle = vi.hoisted(() => ({ mounted: [] as string[], unmounted: [] as string[] }))

async function stubView(name: string) {
  const { defineComponent, h, onMounted, onUnmounted, ref } = await import('vue')
  return { default: defineComponent({
    props: ['active'], emits: ['cleared'],
    setup(_props, { emit }) {
      const draft = ref('')
      onMounted(() => lifecycle.mounted.push(name))
      onUnmounted(() => lifecycle.unmounted.push(name))
      return () => h('div', { 'data-module': name }, [
        h('input', { 'aria-label': `${name} draft`, value: draft.value, onInput: (event: Event) => { draft.value = (event.target as HTMLInputElement).value } }),
        ...(name === 'settings' ? [h('button', { onClick: () => emit('cleared', 'all') }, 'Clear all')] : []),
      ])
    },
  }) }
}
vi.mock('../src/components/ReaderWorkspace.vue', () => stubView('reader'))
vi.mock('../src/components/DuolingoView.vue', () => stubView('duolingo'))
vi.mock('../src/components/LemmaView.vue', () => stubView('lemma'))
vi.mock('../src/components/WordRootView.vue', () => stubView('wordroot'))
vi.mock('../src/components/ResembleView.vue', () => stubView('resemble'))
vi.mock('../src/components/WordNetView.vue', () => stubView('wordnet'))
vi.mock('../src/components/SystemCourseView.vue', () => stubView('course'))
vi.mock('../src/components/ExplorerTree.vue', () => stubView('explorer'))
vi.mock('../src/components/LibrarySettings.vue', () => stubView('library-settings'))
vi.mock('../src/components/ProgressSettings.vue', () => stubView('settings'))
vi.mock('../src/lib/dictionary-manifest', () => ({ getDictionaryManifest: async () => ({ version: 'test', hotRows: 0, sourceRows: 0, hot: {}, main: {} }) }))
vi.mock('../src/lib/wordnet-manifest', () => ({ getWordNetManifest: async () => ({ version: 'test', files: { 'index.jsonl': { rows: 0, kind: 'index' } }, stats: { lexicalEntries: 0, synsets: 0, frames: 0 } }) }))

let app: App | undefined
let host: HTMLDivElement
beforeEach(async () => {
  await progressDb.settings.clear()
  lifecycle.mounted.length = lifecycle.unmounted.length = 0
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  host = document.createElement('div')
  document.body.append(host)
})
afterEach(async () => {
  app?.unmount()
  app = undefined
  await nextTick()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function mount(saved?: unknown) {
  if (saved !== undefined) await setProgressSetting('app.activeTab', saved)
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useDictStore(pinia), 'init').mockResolvedValue()
  app = createApp(LexiApp).use(pinia)
  app.mount(host)
  await vi.waitFor(() => expect(host.querySelector('[data-module]')).not.toBeNull())
}
async function navigate(label: string, module: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('.desktop-sidebar button')]
    .find(item => item.querySelector('strong')?.textContent === label)!
  expect(button).toBeDefined()
  button.click()
  await vi.waitFor(() => expect(host.querySelector(`[data-module="${module}"]`)).not.toBeNull())
  await nextTick()
}

describe('module loading and navigation', () => {
  it('restores the selected module before loading the default reader or any other module', async () => {
    await mount('duolingo')
    expect(lifecycle.mounted).toEqual(['duolingo'])
    expect(host.querySelector('.reader-tab-content')).toBeNull()
    expect(host.querySelector('[data-module="lemma"]')).toBeNull()
  })

  it('opens the reader for a new or invalid saved tab', async () => {
    await mount('removed-module')
    expect(lifecycle.mounted).toEqual(['reader'])
  })

  it('loads on first visit and keeps drafts across switching and revisiting', async () => {
    await mount('duolingo')
    const input = host.querySelector<HTMLInputElement>('[data-module="duolingo"] input')!
    input.value = 'unfinished answer'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await navigate('词族演变', 'lemma')
    expect(host.querySelector<HTMLElement>('[data-module="duolingo"]')!.parentElement!.style.display).toBe('none')
    await navigate('多邻国', 'duolingo')
    expect(host.querySelector('[data-module="duolingo"] input')).toBe(input)
    expect(input.value).toBe('unfinished answer')
    expect(lifecycle.mounted).toEqual(['duolingo', 'lemma'])
    expect(lifecycle.unmounted).toEqual([])
    await vi.waitFor(async () => expect(await getProgressSetting('app.activeTab', '')).toBe('duolingo'))
  })

  it('resets visited learning modules on progress clearing without starting unvisited modules', async () => {
    await mount('duolingo')
    await navigate('词族演变', 'lemma')
    await navigate('设置', 'settings')
    host.querySelector<HTMLButtonElement>('[data-module="settings"] button')!.click()
    await vi.waitFor(() => expect(lifecycle.mounted.filter(name => name === 'duolingo')).toHaveLength(2))
    expect(lifecycle.mounted.filter(name => name === 'lemma')).toHaveLength(2)
    expect(lifecycle.mounted).not.toContain('reader')
    expect(lifecycle.mounted).not.toContain('course')
    expect(lifecycle.unmounted).toEqual(expect.arrayContaining(['duolingo', 'lemma']))
  })
})
