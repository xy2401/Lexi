import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, type App } from 'vue'
import { createPinia } from 'pinia'
import LemmaView from '../src/components/LemmaView.vue'
import { db, type WordEntry } from '../src/lib/db'
import { progressDb } from '../src/lib/progress-db'

let app: App | undefined
afterEach(async () => {
  app?.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  await db.words.clear()
})

describe('lemma cards', () => {
  it('removes misleading plural chips without removing genuine pronoun relatives or verb forms', async () => {
    await progressDb.settings.delete('lemma.view')
    const base = { phonetic: '', frequency: 1, tags: '', cacheLevel: 'hot' as const }
    await db.words.bulkPut([
      { ...base, word: 'i', translation: 'pron. 我', exchange: 's:is' },
      { ...base, word: 'be', translation: 'v. 是', exchange: '3:is/p:was/i:being/s:bes' },
      { ...base, word: 'book', translation: 'n. 书\\nv. 预订', exchange: 's:books/3:books/p:booked' },
    ] as WordEntry[])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      ['i', 100, ['my', 'me', 'we', 'is']],
      ['be', 90, ['is', 'was', 'being', 'bes']],
      ['book', 80, ['book', 'books', 'booked']],
    ]))))
    const host = document.createElement('div')
    document.body.append(host)
    app = createApp(LemmaView).use(createPinia())
    app.mount(host)
    const card = (word: string) => [...host.querySelectorAll('.lemma-card')].find(el => el.querySelector('.lemma-word')?.textContent === word)!
    await vi.waitFor(() => expect(card('book')?.querySelector('.form-tag')).toBeTruthy())
    const variants = (word: string) => [...card(word).querySelectorAll('.v-word')].map(el => el.textContent)
    expect(variants('i')).toEqual(['my', 'me', 'we'])
    expect(variants('be')).toEqual(['is', 'was', 'being'])
    expect(variants('book')).toContain('books')
    expect(card('i').querySelector('.form-tag')).toBeNull()
    expect(card('book').textContent).toContain('名词复数: books')
    expect(card('be').textContent).toContain('第三人称单数: is')
  })
})
