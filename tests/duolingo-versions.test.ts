import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import DuolingoView from '../src/components/DuolingoView.vue'
import { db } from '../src/lib/db'
import { progressDb, setProgressSetting } from '../src/lib/progress-db'
import { COURSE_VERSION_SETTING, COURSE_VERSION_VIEW_SETTING } from '../src/lib/course-versions'

vi.mock('../src/lib/course-markdown', () => ({
  parseCourseMarkdown: vi.fn(() => ({
    words: ['legacy-only'],
    guideMarkdown: '# 原版测试讲解\n\n兼容性测试内容。',
    quizzes: [{ id: 'pronunciation-match-1', type: 'pronunciation-match', title: '测试关卡', description: '', itemCount: 2 }],
    diagnostics: [],
  })),
}))
vi.mock('../src/components/PracticePanel.vue', async () => {
  const { h } = await import('vue')
  return { default: { render: () => h('div', { class: 'legacy-practice' }, '基础练习') } }
})
vi.mock('../src/components/QuizRunner.vue', async () => {
  const { h } = await import('vue')
  return { default: { render: () => h('div', { class: 'legacy-quiz' }, '原版关卡') } }
})

const units = [
  { id: 1, name: '喜好', desc: '第一课', words: ['I', 'like'], file: '001-喜好.md' },
  { id: 2, name: '喜好 2', desc: '第二课', words: ['blue'], file: '002-喜好 2.md' },
]
const manifest = {
  defaultVersionId: 'gpt-6.1',
  versions: [
    { id: 'original', label: '原版', directory: 'duolingo-zs-en', format: 'combined', guideUnitIds: [1, 2] },
    { id: 'gpt-6.1', label: 'GPT-6.1', directory: 'duolingo-zs-en.gpt-6.1', format: 'split', guideUnitIds: [1] },
  ],
}
const newLecture = '# 喜好\n\n## 自然场景\n\n独立编写的完整讲解。'
let app: App | undefined
let host: HTMLDivElement
let mobile = false
let lectureResponse: () => Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

async function mount() {
  host = document.createElement('div')
  document.body.append(host)
  app = createApp(DuolingoView)
  app.mount(host)
  await vi.waitFor(() => expect(host.querySelectorAll('.unit-card')).toHaveLength(2))
}

async function openFirst() {
  host.querySelector<HTMLElement>('.unit-card')!.click()
  await vi.waitFor(() => expect(host.querySelector('.word-panel')).not.toBeNull())
}

async function tab(name: string) {
  await nextTick()
  Array.from(host.querySelectorAll<HTMLButtonElement>('.tab-btn')).find(button => button.textContent === name)!.click()
  await nextTick()
}

async function version(id: string) {
  const select = host.querySelector<HTMLSelectElement>(mobile ? '.mobile-version-select select' : '.duo-header select')!
  select.value = id
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
}

beforeEach(async () => {
  mobile = false
  lectureResponse = async () => new Response(newLecture)
  await Promise.all([
    progressDb.settings.clear(), progressDb.courseUnits.clear(), progressDb.courseQuizzes.clear(), db.words.clear(),
  ])
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  fetchMock = vi.fn(async (input: string) => {
    if (input === '/data/duolingo-zs-en.json') return Response.json(units)
    if (input === '/data/duolingo-zs-en.versions.json') return Response.json(manifest)
    if (input.startsWith('/data/duolingo-zs-en.gpt-6.1/')) return lectureResponse()
    if (input.startsWith('/data/duolingo-zs-en/')) return new Response('# Synthetic legacy\n<quiz-word-list>')
    throw new Error(`Unexpected request: ${input}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.innerHTML = ''
  window.history.replaceState({}, '')
  vi.unstubAllGlobals()
})

afterAll(() => { db.close(); progressDb.close() })

describe('Duolingo version selection', () => {
  it('defaults to GPT-6.1, uses raw words, and never starts legacy practice for split versions', async () => {
    await mount()
    expect(host.querySelector<HTMLSelectElement>('select')!.value).toBe('gpt-6.1')
    await openFirst()
    await tab('单元讲解')
    await vi.waitFor(() => expect(host.querySelector('.guide-body')?.textContent).toContain('独立编写'))
    expect(host.querySelector('.panel-desc')?.textContent).toContain('2 词')
    await tab('练习')
    await vi.waitFor(() => expect(host.querySelector('.practice-content')?.textContent).toContain('该版本尚未编写本课练习'))
    expect(host.querySelector('.legacy-practice')).toBeNull()
    expect(await progressDb.courseUnits.count()).toBe(0)
    expect(await progressDb.courseQuizzes.count()).toBe(0)
    await vi.waitFor(async () => expect((await progressDb.settings.get(COURSE_VERSION_VIEW_SETTING))?.value).toMatchObject({ unitId: 1, panel: 'practice' }))
  })

  it('lists unpublished units and shows a missing message without fetching another version', async () => {
    await mount()
    host.querySelectorAll<HTMLElement>('.unit-card')[1].click()
    await tab('单元讲解')
    await vi.waitFor(() => expect(host.querySelector('.guide-content')?.textContent).toContain('该版本尚未编写本课'))
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('002-'))).toBe(false)
  })

  it('preserves the current unit, search and tab and restores the selected version after remount', async () => {
    await mount()
    await openFirst()
    await tab('单元讲解')
    const search = host.querySelector<HTMLInputElement>('.duo-search')!
    search.value = '喜好'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await version('original')
    await vi.waitFor(() => expect(host.querySelector('.guide-body')?.textContent).toContain('原版测试讲解'))
    expect(host.querySelector('.word-panel > h4')?.textContent).toBe('1. 喜好')
    expect(host.querySelector<HTMLInputElement>('.duo-search')!.value).toBe('喜好')
    expect(host.querySelector('.tab-btn.active')?.textContent).toBe('单元讲解')
    await vi.waitFor(async () => expect((await progressDb.settings.get(COURSE_VERSION_SETTING))?.value).toBe('original'))
    app!.unmount()
    host.remove()
    await mount()
    expect(host.querySelector<HTMLSelectElement>('select')!.value).toBe('original')
    await vi.waitFor(() => expect(host.querySelector('.tab-btn.active')?.textContent).toBe('单元讲解'))
  })

  it('shows legacy completion only for the original and removes active quizzes on switching', async () => {
    await progressDb.courseUnits.put({ unitId: 1, panel: 'practice', completedQuizIds: ['pronunciation-match-1'], lastStudiedAt: 100 })
    await mount()
    expect(host.querySelector('.unit-count small')).toBeNull()
    await openFirst()
    await tab('练习')
    await version('original')
    await vi.waitFor(() => expect(host.querySelector('.level-card')).not.toBeNull())
    expect(host.querySelector('.unit-count small')?.textContent).toContain('1 关')
    host.querySelector<HTMLButtonElement>('.level-card')!.click()
    await vi.waitFor(() => expect(host.querySelector('.legacy-quiz')).not.toBeNull())
    await version('gpt-6.1')
    await vi.waitFor(() => expect(host.querySelector('.practice-content')?.textContent).toContain('该版本尚未编写本课练习'))
    expect(host.querySelector('.legacy-quiz')).toBeNull()
    expect(host.querySelector('.unit-count small')).toBeNull()
    expect((await progressDb.courseUnits.get(1))?.completedQuizIds).toEqual(['pronunciation-match-1'])
  })

  it('discards an earlier version response during rapid switching', async () => {
    let finish!: (response: Response) => void
    lectureResponse = () => new Promise(resolve => { finish = resolve })
    await mount()
    await openFirst()
    await tab('单元讲解')
    await version('original')
    await vi.waitFor(() => expect(host.querySelector('.guide-body')?.textContent).toContain('原版测试讲解'))
    finish(new Response(newLecture))
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(host.querySelector('.guide-body')?.textContent).toContain('原版测试讲解')
    expect(host.querySelector('.guide-body')?.textContent).not.toContain('独立编写')
  })

  it('shows a retry action on a failed split lecture without falling back to practice', async () => {
    lectureResponse = async () => new Response('', { status: 500 })
    await mount()
    await openFirst()
    await tab('单元讲解')
    await vi.waitFor(() => expect(host.querySelector('.guide-content [role="alert"]')?.textContent).toContain('HTTP 500'))
    lectureResponse = async () => new Response(newLecture)
    host.querySelector<HTMLButtonElement>('.guide-content [role="alert"] button')!.click()
    await vi.waitFor(() => expect(host.querySelector('.guide-body')?.textContent).toContain('独立编写'))
    expect(host.querySelector('.legacy-practice')).toBeNull()
  })

  it('offers version switching inside the mobile unit screen', async () => {
    mobile = true
    await mount()
    await openFirst()
    expect(host.querySelector('.duolingo-view.is-mobile-unit')).not.toBeNull()
    expect(host.querySelector('.mobile-version-select select')).not.toBeNull()
    await tab('单元讲解')
    await version('original')
    await vi.waitFor(() => expect(host.querySelector('.guide-body')?.textContent).toContain('原版测试讲解'))
    expect(host.querySelector('.tab-btn.active')?.textContent).toBe('单元讲解')
  })

  it('restores the saved mobile panel and keeps tab changes while a lecture is loading', async () => {
    mobile = true
    await setProgressSetting(COURSE_VERSION_VIEW_SETTING, { unitId: 1, searchQuery: '', panel: 'guide' })
    let finish!: (response: Response) => void
    lectureResponse = () => new Promise(resolve => { finish = resolve })
    await mount()
    host.querySelector<HTMLButtonElement>('.duo-continue')!.click()
    await vi.waitFor(() => expect(host.querySelector('.tab-btn.active')?.textContent).toBe('单元讲解'))
    await tab('练习')
    finish(new Response(newLecture))
    await vi.waitFor(async () => expect((await progressDb.settings.get(COURSE_VERSION_VIEW_SETTING))?.value).toMatchObject({ panel: 'practice' }))
    expect(host.querySelector('.tab-btn.active')?.textContent).toBe('练习')
    await vi.waitFor(() => expect(host.querySelector('.practice-content')?.textContent).toContain('该版本尚未编写本课练习'))
  })
})
