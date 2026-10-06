import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import CoursePracticePanel from '../src/components/CoursePracticePanel.vue'
import { progressDb } from '../src/lib/progress-db'
import type { PracticeDocument } from '../src/lib/course-practice'

const tts = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }))
vi.mock('../src/composables/useTTS', async () => {
  const { ref } = await import('vue')
  return { useTTS: () => ({ speak: tts.speak, stop: tts.stop, voices: ref([{ name: 'Test English', lang: 'en-US' }]), ready: Promise.resolve() }) }
})
const unit = { id: 1, name: '喜好', desc: '', words: ['my', 'I', 'like', 'your', 'cat', 'English'], file: '001-喜好.md' }
const version = { id: 'gpt-6.1', label: 'GPT-6.1', directory: 'duolingo-zs-en.gpt-6.1', format: 'split' as const, guideUnitIds: [1], practiceUnitIds: [1] }
const document: PracticeDocument = {
  schemaVersion: 1, unitId: 1, title: '练习', goals: [{ id: 'likes', title: '表达喜好', description: '从看懂到自己表达' }],
  exercises: [
    { id: 'choice-01', goalId: 'likes', kind: 'choice', stage: 'recognize', targets: ['my'], prompt: '表示我的', options: [{ id: 'my', text: 'my', feedback: 'my 表示我的' }, { id: 'i', text: 'I', feedback: 'I 表示我，需要 my 表示我的' }], answer: 'my', hints: ['谁的'], explanation: 'my 表示我的' },
    { id: 'compose-01', goalId: 'likes', kind: 'compose', stage: 'build', targets: ['I', 'like', 'your', 'cat'], prompt: '我喜欢你的猫', tokens: ['I', 'like', 'your', 'cat', 'my'], answers: ['I like your cat.'], hints: ['I like 后面放对象'], explanation: 'your cat 表示你的猫' },
    { id: 'input-01', goalId: 'likes', kind: 'input', stage: 'recall', targets: ['I', 'like', 'English'], prompt: '我喜欢英语', answers: ['I like English.'], hints: ['I like…'], explanation: 'like 前不加 am' },
    { id: 'audio-01', goalId: 'likes', kind: 'input', stage: 'recall', targets: ['I', 'like', 'English'], prompt: '听写句子', audio: { text: 'I like English.' }, answers: ['I like English.'], hints: ['表达喜好'], explanation: '录音表示我喜欢英语' },
  ],
}
const source = '# 喜好练习\n\n```lexi-practice\n' + JSON.stringify({ ...document, exercises: undefined }) + '\n```\n' + document.exercises.map(item => '\n```lexi-exercise\n' + JSON.stringify(item) + '\n```').join('\n')
let app: App | undefined
let host: HTMLDivElement
let fetchMock: ReturnType<typeof vi.fn>
async function mount(model = version) {
  host = window.document.createElement('div')
  window.document.body.append(host)
  app = createApp(CoursePracticePanel, { version: model, unit })
  app.mount(host)
  await vi.waitFor(() => expect(host.querySelector('.practice-home')).not.toBeNull())
}
async function click(text: string) {
  const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === text)!
  expect(button, text).toBeDefined()
  expect(button.disabled, text).toBe(false)
  button.click()
  await nextTick()
}
async function next() {
  await vi.waitFor(() => expect(host.querySelector<HTMLButtonElement>('.continue-button')?.disabled).toBe(false))
  host.querySelector<HTMLButtonElement>('.continue-button')!.click()
  await nextTick()
}
beforeEach(async () => {
  await Promise.all([progressDb.practiceItems.clear(), progressDb.practiceSessions.clear()])
  fetchMock = vi.fn(async () => new Response(source))
  vi.stubGlobal('fetch', fetchMock)
  vi.clearAllMocks()
})
afterEach(async () => {
  app?.unmount()
  app = undefined
  await new Promise(resolve => setTimeout(resolve, 20))
  window.document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('new practice flow', () => {
  it('keeps a fixed round size and feedback until Continue, and separates hinted and independent answers', async () => {
    await mount()
    host.querySelector<HTMLButtonElement>('.start-button')!.click()
    await nextTick()
    expect(host.querySelector('.round-header')?.textContent).toContain('1 / 3')
    await click('I'); await click('检查答案')
    expect(host.querySelector('.answer-feedback')?.textContent).toContain('I 表示我，需要 my')
    expect(host.querySelector('.round-header')?.textContent).toContain('1 / 3')
    await next()
    for (const token of ['I', 'like', 'your', 'cat']) await click(token)
    await click('给我一点提示'); await click('检查答案')
    expect(host.querySelector('.answer-feedback')?.textContent).toContain('提示后答对')
    await next()
    const input = host.querySelector<HTMLInputElement>('input')!
    input.value = 'i  like English !!'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await click('检查答案')
    await next()
    expect([...host.querySelectorAll('.result-stats strong')].map(item => item.textContent)).toEqual(['1', '1', '1'])
    await vi.waitFor(async () => expect((await progressDb.practiceSessions.toArray())[0]?.completedAt).toBeGreaterThan(0))
    await vi.waitFor(() => expect(Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === '巩固一下 · 最多 4 题')?.disabled).toBe(false))
    await click('巩固一下 · 最多 4 题')
    expect(host.querySelector('.round-header')?.textContent).toContain('/ 2')
    expect(await progressDb.courseQuizzes.count()).toBe(0)
  })
  it('restores the current draft, used hints and submitted feedback after remount', async () => {
    await mount()
    host.querySelector<HTMLButtonElement>('.start-button')!.click()
    await nextTick()
    await click('my'); await click('给我一点提示')
    await vi.waitFor(async () => expect((await progressDb.practiceSessions.toArray())[0]?.draft.hintCount).toBe(1))
    app!.unmount(); host.remove()
    await mount()
    host.querySelector<HTMLButtonElement>('.resume-button')!.click()
    await vi.waitFor(() => expect(host.querySelector('.question-hints')).not.toBeNull())
    expect(host.querySelector('.choice-option.selected')?.textContent).toBe('my')
    await click('检查答案')
    await vi.waitFor(async () => expect((await progressDb.practiceSessions.toArray())[0]?.answers).toHaveLength(1))
    app!.unmount(); host.remove()
    await mount()
    host.querySelector<HTMLButtonElement>('.resume-button')!.click()
    await vi.waitFor(() => expect(host.querySelector('.answer-feedback')?.textContent).toContain('提示后答对'))
    expect(host.querySelector('.round-header')?.textContent).toContain('1 / 3')
  })
  it('treats listening transcript as assistance, supports slow replay, and skips audio without a voice', async () => {
    vi.stubGlobal('speechSynthesis', {})
    await mount()
    host.querySelector<HTMLButtonElement>('[data-activity="dictation"]')!.click()
    await nextTick()
    expect(host.textContent).not.toContain('I like English.')
    await click('慢速播放')
    expect(tts.speak).toHaveBeenCalledWith('I like English.', undefined, undefined, { rate: 0.75 })
    await click('听不清，查看原文')
    const input = host.querySelector<HTMLInputElement>('input')!
    input.value = 'I like English.'; input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick(); await click('检查答案')
    expect(host.querySelector('.answer-feedback')?.textContent).toContain('提示后答对')
  })
  it('makes the unit scope and all activity entries visible, including unavailable listening', async () => {
    await mount()
    expect(host.textContent).toContain('第 1 单元 · 喜好')
    expect(host.textContent).toContain('本单元练习')
    expect(host.textContent).toContain('都来自「喜好」')
    expect(host.querySelector('select')).toBeNull()
    expect(host.querySelectorAll('.activity-card')).toHaveLength(8)
    const listening = host.querySelector<HTMLButtonElement>('[data-activity="dictation"]')!
    expect(listening.disabled).toBe(true)
    expect(listening.textContent).toContain('本课 1 题')
    expect(listening.textContent).toContain('需英文朗读支持')
  })
  it('restores matching drafts, allows correction before submission and grades the entire group', async () => {
    const matching = { id: 'match-01', goalId: 'likes', kind: 'matching', stage: 'recognize', targets: ['my', 'cat'], prompt: '配对词义', pairs: [{ id: 'my', english: 'my', chinese: '我的' }, { id: 'cat', english: 'cat', chinese: '猫' }], hints: ['分清人物关系与动物'], explanation: 'my 表示我的；cat 表示猫' }
    fetchMock.mockImplementation(async () => new Response(source + '\n```lexi-exercise\n' + JSON.stringify(matching) + '\n```'))
    await mount()
    host.querySelector<HTMLButtonElement>('[data-activity="matching"]')!.click()
    await nextTick()
    expect(host.querySelector<HTMLButtonElement>('.check-button')!.disabled).toBe(true)
    const pair = async (english: string, chinese: string) => {
      host.querySelector<HTMLButtonElement>(`[aria-label="英文 ${english}"]`)!.click(); await nextTick()
      host.querySelector<HTMLButtonElement>(`[aria-label="中文 ${chinese}"]`)!.click(); await nextTick()
    }
    await pair('my', '猫')
    await vi.waitFor(async () => expect((await progressDb.practiceSessions.toArray())[0]?.draft.matches).toEqual({ my: 'cat' }))
    app!.unmount(); host.remove()
    await mount()
    host.querySelector<HTMLButtonElement>('.resume-button')!.click()
    await vi.waitFor(() => expect(host.querySelector('[aria-label="英文 my"]')?.textContent).toContain('猫'))
    await pair('my', '我的')
    await pair('cat', '猫')
    await click('检查答案')
    expect(host.querySelector('.answer-feedback')?.textContent).toContain('独立答对')
    expect(host.querySelector('.answer-feedback')?.textContent).toContain('my → 我的')
    await next()
    expect(host.querySelector('.answer-review')?.textContent).toContain('my → 我的；cat → 猫')
    expect(host.querySelector('.answer-review')?.textContent).not.toContain('{"my"')
  })
  it('shows exactly which matching pairs need correction after submission', async () => {
    const matching = { id: 'match-01', goalId: 'likes', kind: 'matching', stage: 'recognize', targets: ['my', 'cat'], prompt: '配对词义', pairs: [{ id: 'my', english: 'my', chinese: '我的' }, { id: 'cat', english: 'cat', chinese: '猫' }], hints: ['留意词义'], explanation: 'my 是我的；cat 是猫' }
    fetchMock.mockImplementation(async () => new Response(source + '\n```lexi-exercise\n' + JSON.stringify(matching) + '\n```'))
    await mount()
    host.querySelector<HTMLButtonElement>('[data-activity="matching"]')!.click(); await nextTick()
    for (const [english, chinese] of [['my', '猫'], ['cat', '我的']]) {
      host.querySelector<HTMLButtonElement>(`[aria-label="英文 ${english}"]`)!.click(); await nextTick()
      host.querySelector<HTMLButtonElement>(`[aria-label="中文 ${chinese}"]`)!.click(); await nextTick()
    }
    expect(host.querySelector('.match-incorrect')).toBeNull()
    await click('检查答案')
    expect(host.querySelectorAll('.match-incorrect')).toHaveLength(2)
    expect(host.querySelector('[aria-label="英文 my"]')?.textContent).toContain('应为：我的')
    expect(host.querySelector('.answer-feedback')?.textContent).toContain('需要巩固')
  })
  it('shows fetch errors and retries, without loading another version', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }))
    host = window.document.createElement('div'); window.document.body.append(host)
    app = createApp(CoursePracticePanel, { version, unit }); app.mount(host)
    await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain('HTTP 503'))
    await click('重试')
    await vi.waitFor(() => expect(host.querySelector('.practice-home')).not.toBeNull())
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes('duolingo-zs-en.gpt-6.1/001-'))).toBe(true)
  })
  it('does not restore another model’s unfinished round', async () => {
    await mount()
    host.querySelector<HTMLButtonElement>('.start-button')!.click()
    await vi.waitFor(async () => expect(await progressDb.practiceSessions.count()).toBe(1))
    app!.unmount(); host.remove()
    await mount({ ...version, id: 'next-model', label: 'Next', directory: 'duolingo-zs-en.next-model' })
    expect(host.querySelector('.resume-button')).toBeNull()
  })
  it('keeps feedback on save failure and retries without double-counting', async () => {
    await mount()
    host.querySelector<HTMLButtonElement>('.start-button')!.click()
    await vi.waitFor(async () => expect(await progressDb.practiceSessions.count()).toBe(1))
    await click('my')
    await vi.waitFor(async () => expect((await progressDb.practiceSessions.toArray())[0]?.draft.answer).toBe('my'))
    const fail = vi.spyOn(progressDb.practiceSessions, 'put').mockRejectedValueOnce(new Error('storage unavailable'))
    await click('检查答案')
    await vi.waitFor(() => expect(host.querySelector('.save-warning')?.textContent).toContain('storage unavailable'))
    expect(host.querySelector('.answer-feedback')?.textContent).toContain('独立答对')
    expect(host.querySelector<HTMLButtonElement>('.continue-button')?.disabled).toBe(true)
    fail.mockRestore()
    await click('重试保存')
    await vi.waitFor(() => expect(host.querySelector<HTMLButtonElement>('.continue-button')?.disabled).toBe(false))
    expect((await progressDb.practiceItems.toArray())[0].attempts).toBe(1)
  })
})
