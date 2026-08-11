import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  clearAllLearningProgress,
  clearLearningProgress,
  getLearningProgressSummaries,
} from '../src/lib/learning-progress'
import { progressDb, setProgressSetting } from '../src/lib/progress-db'
import { readerDb, setReaderSetting } from '../src/lib/reader-db'

beforeEach(async () => {
  await Promise.all([
    progressDb.settings.clear(),
    progressDb.dictionaryHistory.clear(),
    progressDb.courseUnits.clear(),
    progressDb.courseQuizzes.clear(),
    readerDb.progress.clear(),
    readerDb.settings.clear(),
  ])
})

afterAll(async () => {
  progressDb.close()
  readerDb.close()
})

describe('learning progress management', () => {
  it('summarizes and clears dictionary progress without removing preferences', async () => {
    await progressDb.dictionaryHistory.put({ word: 'bank', viewCount: 3, lastViewedAt: 100 })
    await setProgressSetting('explorer.lastWord', 'bank')
    await setProgressSetting('dictionary.tagStates', { gre: 'annotate' })

    const before = (await getLearningProgressSummaries()).find(item => item.id === 'explorer')!
    expect(before.hasData).toBe(true)
    expect(before.value).toBe('1 个查词记录')
    expect(before.detail).toContain('3 次查询')

    await clearLearningProgress('explorer')
    expect(await progressDb.dictionaryHistory.count()).toBe(0)
    expect(await progressDb.settings.get('explorer.lastWord')).toBeUndefined()
    expect((await progressDb.settings.get('dictionary.tagStates'))?.value).toEqual({ gre: 'annotate' })
  })

  it('clears reader positions and time while preserving favorites', async () => {
    await readerDb.progress.bulkPut([
      {
        bookKey: 'remote:one', canonicalId: 'one', chapterHref: 'chapter-2.xhtml',
        scrollPercent: 0.5, overallPercent: 0.25, timeSpentSeconds: 600,
        favorite: true, lastReadAt: 200,
      },
      {
        bookKey: 'remote:two', canonicalId: 'two', chapterHref: 'chapter-1.xhtml',
        scrollPercent: 0.2, overallPercent: 0.1, timeSpentSeconds: 120,
        favorite: false, lastReadAt: 100,
      },
    ])

    await clearLearningProgress('reader')
    const records = await readerDb.progress.toArray()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      bookKey: 'remote:one', favorite: true, chapterHref: '', overallPercent: 0,
      scrollPercent: 0, timeSpentSeconds: 0, lastReadAt: 0,
    })
  })

  it('clears all learning records while preserving app and reader preferences', async () => {
    await Promise.all([
      setProgressSetting('app.activeTab', 'settings'),
      setProgressSetting('wordroot.view', { searchQuery: 'bio', currentPage: 2 }),
      setProgressSetting('duolingo.view', { unitId: 3, searchQuery: '' }),
      setReaderSetting('readerPreferences', { theme: 'dark' }),
      progressDb.courseUnits.put({ unitId: 3, panel: 'practice', completedQuizIds: [], lastStudiedAt: 100 }),
    ])

    await clearAllLearningProgress()
    expect((await progressDb.settings.get('app.activeTab'))?.value).toBe('settings')
    expect(await progressDb.settings.get('wordroot.view')).toBeUndefined()
    expect(await progressDb.settings.get('duolingo.view')).toBeUndefined()
    expect(await progressDb.courseUnits.count()).toBe(0)
    expect((await readerDb.settings.get('readerPreferences'))?.value).toEqual({ theme: 'dark' })
  })
})
