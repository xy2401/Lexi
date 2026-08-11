import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  completeCourseQuiz,
  getCourseUnitProgress,
  getProgressSetting,
  listDictionaryHistory,
  progressDb,
  rememberDictionaryLookup,
  saveCourseUnitProgress,
  setProgressSetting,
  startCourseQuiz,
} from '../src/lib/progress-db'

afterEach(async () => {
  await Promise.all(progressDb.tables.map(table => table.clear()))
})

describe('persistent application progress', () => {
  it('round-trips module view settings', async () => {
    await setProgressSetting('wordroot.view', { searchQuery: 'bio', currentPage: 3 })
    await expect(getProgressSetting('wordroot.view', null)).resolves.toEqual({
      searchQuery: 'bio',
      currentPage: 3,
    })
  })

  it('keeps normalized dictionary history ordered by recent use', async () => {
    await rememberDictionaryLookup(' Bank ')
    await rememberDictionaryLookup('bank')
    await rememberDictionaryLookup('River')

    const history = await listDictionaryHistory()
    expect(history.map(item => item.word)).toEqual(['river', 'bank'])
    expect(history.find(item => item.word === 'bank')?.viewCount).toBe(2)
  })

  it('persists Duolingo location and completed quizzes without duplicates', async () => {
    await saveCourseUnitProgress(12, { panel: 'practice', activeQuizId: 'listen-1' })
    await startCourseQuiz(12, 'listen-1')
    await completeCourseQuiz(12, 'listen-1', { accuracy: 80, totalQuestions: 10 })
    await startCourseQuiz(12, 'listen-1')
    await completeCourseQuiz(12, 'listen-1', { accuracy: 90, totalQuestions: 10 })

    const unit = await getCourseUnitProgress(12)
    expect(unit.panel).toBe('practice')
    expect(unit.activeQuizId).toBeUndefined()
    expect(unit.completedQuizIds).toEqual(['listen-1'])

    const quiz = await progressDb.courseQuizzes.get('12:listen-1')
    expect(quiz).toMatchObject({ attempts: 2, accuracy: 90, bestAccuracy: 90 })
  })
})
