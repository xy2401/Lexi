import Dexie from 'dexie'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { progressDb, setProgressSetting } from '../src/lib/progress-db'
import { clearAllLearningProgress, clearLearningProgress, getLearningProgressSummaries } from '../src/lib/learning-progress'
import { COURSE_VERSION_SETTING } from '../src/lib/course-versions'
import { practiceFingerprint, type PracticeDocument, type PracticeSession } from '../src/lib/course-practice'
import { getPracticeRecords, nextPracticeState, savePracticeSession } from '../src/lib/practice-progress'

const document: PracticeDocument = { schemaVersion: 1, unitId: 1, title: '喜好', goals: [{ id: 'likes', title: '表达喜好', description: '独立表达' }], exercises: [{ id: 'likes-01', kind: 'input', stage: 'recall', goalId: 'likes', targets: ['I', 'like'], prompt: '我喜欢英语', answers: ['I like English.'], hints: ['I like…'], explanation: 'like 已经是动词' }] }
const fingerprint = practiceFingerprint(document.exercises[0])
const session = (versionId = 'gpt-6.1'): PracticeSession => ({ id: crypto.randomUUID(), versionId, unitId: 1, mode: 'recommended', fingerprints: { 'likes-01': fingerprint }, tasks: [{ exerciseId: 'likes-01' }], answers: [{ exerciseId: 'likes-01', fingerprint, outcome: 'independent', answer: 'I like English.', hintCount: 0, answeredAt: 100 }], cursor: 0, draft: { answer: 'I like English.', tokens: [], hintCount: 0, revealed: false }, startedAt: 10, updatedAt: 100 })
beforeEach(async () => {
  await Promise.all([progressDb.settings.clear(), progressDb.practiceItems.clear(), progressDb.practiceSessions.clear(), progressDb.courseUnits.clear(), progressDb.courseQuizzes.clear()])
})
afterAll(() => progressDb.close())

describe('version-scoped practice persistence', () => {
  it('saves answers exactly once and isolates versions from legacy records', async () => {
    const first = session()
    await progressDb.courseQuizzes.put({ id: '1:old', unitId: 1, quizId: 'old', attempts: 3, startedAt: 1, updatedAt: 1 })
    await savePracticeSession(first, document)
    await savePracticeSession(first, document)
    await savePracticeSession(session('another-model'), document)
    expect((await getPracticeRecords('gpt-6.1', 1)).items[0].attempts).toBe(1)
    expect((await getPracticeRecords('another-model', 1)).sessions).toHaveLength(1)
    expect((await progressDb.courseQuizzes.get('1:old'))?.attempts).toBe(3)
    expect(await progressDb.courseUnits.count()).toBe(0)
  })
  it('saves drafts, hints and feedback and ignores stale snapshots', async () => {
    const first = session()
    first.draft.hintCount = 2
    first.draft.revealed = true
    await savePracticeSession(first, document)
    await savePracticeSession({ ...first, updatedAt: 50, answers: [], draft: { ...first.draft, hintCount: 0 } }, document)
    const saved = (await getPracticeRecords(first.versionId, 1)).sessions[0]
    expect(saved.answers).toHaveLength(1)
    expect(saved.draft).toMatchObject({ hintCount: 2, revealed: true })
  })
  it('rolls back item updates if the session cannot be saved, then retries exactly once', async () => {
    const first = session()
    const fail = vi.spyOn(progressDb.practiceSessions, 'put').mockRejectedValueOnce(new Error('write failed'))
    await expect(savePracticeSession(first, document)).rejects.toThrow('write failed')
    expect(await progressDb.practiceItems.count()).toBe(0)
    expect(await progressDb.practiceSessions.count()).toBe(0)
    fail.mockRestore()
    await savePracticeSession(first, document)
    await savePracticeSession(first, document)
    expect((await getPracticeRecords(first.versionId, 1)).items[0].attempts).toBe(1)
  })
  it('does not increase review spacing for same-day corrections', () => {
    const first = session().answers[0]
    const old = nextPracticeState(undefined, 'gpt-6.1', 1, document, 'likes-01', first)
    expect(old.dueAt).toBe(100 + 86_400_000)
    const sameDay = nextPracticeState(old, 'gpt-6.1', 1, document, 'likes-01', { ...first, answeredAt: 200 })
    expect(sameDay.reviewLevel).toBe(0)
    const tomorrow = nextPracticeState(sameDay, 'gpt-6.1', 1, document, 'likes-01', { ...first, answeredAt: 200 + 86_400_000 })
    expect(tomorrow.reviewLevel).toBe(1)
    const assisted = nextPracticeState(tomorrow, 'gpt-6.1', 1, document, 'likes-01', { ...first, outcome: 'assisted', answeredAt: tomorrow.updatedAt + 100 })
    expect(assisted.dueAt).toBe(assisted.updatedAt)
    expect(assisted.reviewLevel).toBe(0)
  })
  it.each([clearLearningProgress.bind(null, 'duolingo'), clearAllLearningProgress])('clears new and legacy progress while keeping the version preference', async clear => {
    await setProgressSetting(COURSE_VERSION_SETTING, 'gpt-6.1')
    await savePracticeSession({ ...session(), completedAt: 110 }, document)
    const summary = (await getLearningProgressSummaries()).find(item => item.id === 'duolingo')!
    expect(summary.detail).toContain('新版 1 轮完成')
    await clear()
    expect(await progressDb.practiceItems.count()).toBe(0)
    expect(await progressDb.practiceSessions.count()).toBe(0)
    expect((await progressDb.settings.get(COURSE_VERSION_SETTING))?.value).toBe('gpt-6.1')
  })
  it('upgrades a version-1 database without losing old progress', async () => {
    progressDb.close()
    await Dexie.delete('lexi-progress')
    const legacy = new Dexie('lexi-progress')
    legacy.version(1).stores({ settings: 'key, updatedAt', dictionaryHistory: 'word, lastViewedAt', courseUnits: 'unitId, lastStudiedAt', courseQuizzes: 'id, unitId, quizId, updatedAt, completedAt' })
    await legacy.open()
    await legacy.table('courseUnits').put({ unitId: 1, completedQuizIds: ['old'], lastStudiedAt: 10, panel: 'practice' })
    legacy.close()
    await progressDb.open()
    expect((await progressDb.courseUnits.get(1))?.completedQuizIds).toEqual(['old'])
    expect(await progressDb.practiceItems.count()).toBe(0)
  })
})
