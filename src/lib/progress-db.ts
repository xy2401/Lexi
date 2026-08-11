import Dexie, { type Table } from 'dexie'

export const APP_TAB_IDS = [
  'reader',
  'explorer',
  'wordnet',
  'wordroot',
  'resemble',
  'lemma',
  'duolingo',
  'settings',
] as const

export type AppTabId = typeof APP_TAB_IDS[number]
export type DuolingoPanel = 'words' | 'guide' | 'practice'

export interface ProgressSetting<T = unknown> {
  key: string
  value: T
  updatedAt: number
}

export interface DictionaryHistoryEntry {
  word: string
  viewCount: number
  lastViewedAt: number
}

export interface CourseUnitProgress {
  unitId: number
  panel: DuolingoPanel
  activeQuizId?: string
  completedQuizIds: string[]
  lastStudiedAt: number
}

export interface QuizCompletionResult {
  accuracy?: number
  totalQuestions?: number
  totalAttempts?: number
  wrongWords?: string[]
}

export interface CourseQuizProgress extends QuizCompletionResult {
  id: string
  unitId: number
  quizId: string
  attempts: number
  startedAt: number
  updatedAt: number
  completedAt?: number
  bestAccuracy?: number
}

class ProgressDB extends Dexie {
  settings!: Table<ProgressSetting, string>
  dictionaryHistory!: Table<DictionaryHistoryEntry, string>
  courseUnits!: Table<CourseUnitProgress, number>
  courseQuizzes!: Table<CourseQuizProgress, string>

  constructor() {
    super('lexi-progress')
    this.version(1).stores({
      settings: 'key, updatedAt',
      dictionaryHistory: 'word, lastViewedAt',
      courseUnits: 'unitId, lastStudiedAt',
      courseQuizzes: 'id, unitId, quizId, updatedAt, completedAt',
    })
  }
}

export const progressDb = new ProgressDB()

export async function getProgressSetting<T>(key: string, fallback: T): Promise<T> {
  const record = await progressDb.settings.get(key)
  return record ? record.value as T : fallback
}

export async function setProgressSetting<T>(key: string, value: T): Promise<void> {
  await progressDb.settings.put({ key, value, updatedAt: Date.now() })
}

export async function rememberDictionaryLookup(rawWord: string): Promise<void> {
  const word = rawWord.trim().toLowerCase()
  if (!word) return
  await progressDb.transaction('rw', progressDb.dictionaryHistory, async () => {
    const previous = await progressDb.dictionaryHistory.get(word)
    await progressDb.dictionaryHistory.put({
      word,
      viewCount: (previous?.viewCount || 0) + 1,
      lastViewedAt: Date.now(),
    })
  })
}

export async function listDictionaryHistory(limit = 30): Promise<DictionaryHistoryEntry[]> {
  return progressDb.dictionaryHistory.orderBy('lastViewedAt').reverse().limit(limit).toArray()
}

export async function getCourseUnitProgress(unitId: number): Promise<CourseUnitProgress> {
  return await progressDb.courseUnits.get(unitId) || {
    unitId,
    panel: 'words',
    completedQuizIds: [],
    lastStudiedAt: 0,
  }
}

export async function listCourseUnitProgress(): Promise<CourseUnitProgress[]> {
  return progressDb.courseUnits.orderBy('lastStudiedAt').reverse().toArray()
}

export async function saveCourseUnitProgress(
  unitId: number,
  patch: Partial<Omit<CourseUnitProgress, 'unitId'>>,
): Promise<CourseUnitProgress> {
  const previous = await getCourseUnitProgress(unitId)
  const next: CourseUnitProgress = {
    ...previous,
    ...patch,
    unitId,
    completedQuizIds: [...new Set(patch.completedQuizIds || previous.completedQuizIds)],
    lastStudiedAt: Date.now(),
  }
  if (!next.activeQuizId) delete next.activeQuizId
  await progressDb.courseUnits.put(next)
  return next
}

function quizProgressId(unitId: number, quizId: string): string {
  return `${unitId}:${quizId}`
}

export async function startCourseQuiz(unitId: number, quizId: string): Promise<void> {
  const id = quizProgressId(unitId, quizId)
  const now = Date.now()
  const previous = await progressDb.courseQuizzes.get(id)
  await progressDb.courseQuizzes.put({
    ...previous,
    id,
    unitId,
    quizId,
    attempts: (previous?.attempts || 0) + 1,
    startedAt: now,
    updatedAt: now,
  })
}

export async function completeCourseQuiz(
  unitId: number,
  quizId: string,
  result: QuizCompletionResult = {},
): Promise<void> {
  const id = quizProgressId(unitId, quizId)
  const now = Date.now()
  const previous = await progressDb.courseQuizzes.get(id)
  const accuracy = result.accuracy
  await progressDb.transaction('rw', progressDb.courseQuizzes, progressDb.courseUnits, async () => {
    await progressDb.courseQuizzes.put({
      ...previous,
      ...result,
      id,
      unitId,
      quizId,
      attempts: Math.max(1, previous?.attempts || 0),
      startedAt: previous?.startedAt || now,
      updatedAt: now,
      completedAt: now,
      bestAccuracy: accuracy === undefined
        ? previous?.bestAccuracy
        : Math.max(previous?.bestAccuracy || 0, accuracy),
    })
    const unit = await getCourseUnitProgress(unitId)
    await progressDb.courseUnits.put({
      ...unit,
      completedQuizIds: [...new Set([...unit.completedQuizIds, quizId])],
      activeQuizId: undefined,
      lastStudiedAt: now,
    })
  })
}

export function isAppTabId(value: unknown): value is AppTabId {
  return typeof value === 'string' && (APP_TAB_IDS as readonly string[]).includes(value)
}
