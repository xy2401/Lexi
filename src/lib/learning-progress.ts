import { progressDb, type ProgressSetting } from './progress-db'
import { readerDb } from './reader-db'

export const LEARNING_PROGRESS_AREAS = [
  'reader',
  'explorer',
  'wordnet',
  'wordroot',
  'resemble',
  'lemma',
  'duolingo',
  'course',
] as const

export type LearningProgressArea = typeof LEARNING_PROGRESS_AREAS[number]

export interface LearningProgressSummary {
  id: LearningProgressArea
  title: string
  value: string
  detail: string
  updatedAt: number
  hasData: boolean
}

const AREA_META: Record<LearningProgressArea, { title: string; keys: string[] }> = {
  reader: { title: '阅读器', keys: [] },
  explorer: { title: '词典浏览', keys: ['explorer.lastWord', 'explorer.tree'] },
  wordnet: { title: '语义网络', keys: ['wordnet.lastWord', 'wordnet.lastState'] },
  wordroot: { title: '词根词缀', keys: ['wordroot.view'] },
  resemble: { title: '近义辨析', keys: ['resemble.view'] },
  lemma: { title: '词族演变', keys: ['lemma.view'] },
  duolingo: { title: '多邻国', keys: ['duolingo.view'] },
  course: { title: '系统课程', keys: ['course.view'] },
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} 秒`
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`
  return `${(seconds / 3600).toFixed(seconds < 36000 ? 1 : 0)} 小时`
}

function settingMap(settings: ProgressSetting[]): Map<string, ProgressSetting> {
  return new Map(settings.map(setting => [setting.key, setting]))
}

function settingUpdatedAt(settings: Map<string, ProgressSetting>, keys: string[]): number {
  return Math.max(0, ...keys.map(key => settings.get(key)?.updatedAt || 0))
}

function viewSummary(
  id: 'wordroot' | 'resemble' | 'lemma',
  settings: Map<string, ProgressSetting>,
): LearningProgressSummary {
  const key = AREA_META[id].keys[0]
  const view = asRecord(settings.get(key)?.value)
  const query = nonEmptyString(view.searchQuery)
  const page = numberValue(view.currentPage, 1)
  const pageSize = numberValue(view.pageSize, 20)
  let hasData = Boolean(query) || page > 1 || pageSize !== 20
  const details: string[] = []
  if (query) details.push(`搜索“${query}”`)
  if (page > 1) details.push(`第 ${page} 页`)

  if (id === 'wordroot') {
    const selectedClass = nonEmptyString(view.selectedClass) || 'all'
    const selectedOrigin = nonEmptyString(view.selectedOrigin) || 'all'
    hasData ||= selectedClass !== 'all' || selectedOrigin !== 'all'
    if (selectedClass !== 'all') details.push(`类型 ${selectedClass}`)
    if (selectedOrigin !== 'all') details.push(`词源 ${selectedOrigin}`)
  }

  if (id === 'lemma') {
    const filtersChanged = view.showIrregular === false
      || view.showS === true
      || view.showEd === true
      || view.showIng === true
      || view.showIes === true
    hasData ||= filtersChanged
    if (filtersChanged) details.push('派生筛选已调整')
  }

  return {
    id,
    title: AREA_META[id].title,
    value: hasData ? '已保存浏览位置' : '暂无进度',
    detail: details.join(' · ') || '搜索、筛选和页码均为默认',
    updatedAt: hasData ? settingUpdatedAt(settings, AREA_META[id].keys) : 0,
    hasData,
  }
}

export async function getLearningProgressSummaries(): Promise<LearningProgressSummary[]> {
  const [rawSettings, history, units, quizzes, reading] = await Promise.all([
    progressDb.settings.toArray(),
    progressDb.dictionaryHistory.toArray(),
    progressDb.courseUnits.toArray(),
    progressDb.courseQuizzes.toArray(),
    readerDb.progress.toArray(),
  ])
  const settings = settingMap(rawSettings)

  const readingRecords = reading.filter(record => (
    record.lastReadAt > 0
    || record.timeSpentSeconds > 0
    || record.overallPercent > 0
    || Boolean(record.chapterHref)
  ))
  const favorites = reading.filter(record => record.favorite).length
  const readingSeconds = readingRecords.reduce((sum, record) => sum + record.timeSpentSeconds, 0)
  const reader: LearningProgressSummary = {
    id: 'reader',
    title: AREA_META.reader.title,
    value: `${readingRecords.length} 本有阅读进度`,
    detail: `${formatDuration(readingSeconds)} · ${favorites} 本收藏（清空时保留）`,
    updatedAt: Math.max(0, ...readingRecords.map(record => record.lastReadAt)),
    hasData: readingRecords.length > 0,
  }

  const latestHistory = history.sort((a, b) => b.lastViewedAt - a.lastViewedAt)[0]
  const lookupCount = history.reduce((sum, item) => sum + item.viewCount, 0)
  const tree = asRecord(settings.get('explorer.tree')?.value)
  const treeChanged = tree.browseMode === 'remote'
    || Boolean(tree.localLetter)
    || Boolean(tree.selectedLetter)
    || Boolean(tree.selectedPrefix)
  const lastExplorerWord = nonEmptyString(settings.get('explorer.lastWord')?.value)
  const explorerHasData = history.length > 0 || treeChanged || Boolean(lastExplorerWord)
  const explorer: LearningProgressSummary = {
    id: 'explorer',
    title: AREA_META.explorer.title,
    value: `${history.length} 个查词记录`,
    detail: `${lookupCount} 次查询${latestHistory ? ` · 最近 ${latestHistory.word}` : ''}`,
    updatedAt: Math.max(latestHistory?.lastViewedAt || 0, settingUpdatedAt(settings, AREA_META.explorer.keys)),
    hasData: explorerHasData,
  }

  const lastWordNetWord = nonEmptyString(settings.get('wordnet.lastWord')?.value)
  const wordNetState = settings.get('wordnet.lastState')
  const wordnetHasData = Boolean(wordNetState) || Boolean(lastWordNetWord && lastWordNetWord !== 'bank')
  const wordnet: LearningProgressSummary = {
    id: 'wordnet',
    title: AREA_META.wordnet.title,
    value: wordnetHasData ? '已保存语义位置' : '暂无进度',
    detail: wordnetHasData ? `最近查询 ${lastWordNetWord || '—'}` : '将从默认词 bank 开始',
    updatedAt: wordnetHasData ? settingUpdatedAt(settings, AREA_META.wordnet.keys) : 0,
    hasData: wordnetHasData,
  }

  const duoView = asRecord(settings.get('duolingo.view')?.value)
  const duoViewChanged = typeof duoView.unitId === 'number' || Boolean(nonEmptyString(duoView.searchQuery))
  const completedQuizzes = quizzes.filter(quiz => quiz.completedAt).length
  const attempts = quizzes.reduce((sum, quiz) => sum + quiz.attempts, 0)
  const duolingoHasData = units.length > 0 || quizzes.length > 0 || duoViewChanged
  const duoDetails = [`${completedQuizzes} 关完成`, `${attempts} 次练习`]
  if (typeof duoView.unitId === 'number') duoDetails.push(`上次第 ${duoView.unitId} 单元`)
  const duoQuery = nonEmptyString(duoView.searchQuery)
  if (duoQuery) duoDetails.push(`搜索“${duoQuery}”`)
  const duolingo: LearningProgressSummary = {
    id: 'duolingo',
    title: AREA_META.duolingo.title,
    value: units.length ? `${units.length} 个单元有记录` : duoViewChanged ? '已保存浏览位置' : '暂无进度',
    detail: duoDetails.join(' · '),
    updatedAt: Math.max(
      settingUpdatedAt(settings, AREA_META.duolingo.keys),
      ...units.map(unit => unit.lastStudiedAt),
      ...quizzes.map(quiz => quiz.updatedAt),
    ),
    hasData: duolingoHasData,
  }

  const courseView = asRecord(settings.get('course.view')?.value)
  const courseViewChanged = typeof courseView.courseId === 'number' || Boolean(nonEmptyString(courseView.searchQuery)) || Boolean(nonEmptyString(courseView.tag))
  const courseDetails: string[] = []
  if (typeof courseView.courseId === 'number') courseDetails.push(`上次学习第 ${courseView.courseId} 课`)
  if (nonEmptyString(courseView.tag) && courseView.tag !== '全部') courseDetails.push(`标签“${courseView.tag}”`)
  if (nonEmptyString(courseView.searchQuery)) courseDetails.push(`搜索“${courseView.searchQuery}”`)
  const course: LearningProgressSummary = {
    id: 'course',
    title: AREA_META.course.title,
    value: courseViewChanged ? '已保存学习位置' : '暂无进度',
    detail: courseDetails.join(' · ') || '尚未开始系统课程研读',
    updatedAt: courseViewChanged ? settingUpdatedAt(settings, AREA_META.course.keys) : 0,
    hasData: courseViewChanged,
  }

  return [
    reader,
    explorer,
    wordnet,
    viewSummary('wordroot', settings),
    viewSummary('resemble', settings),
    viewSummary('lemma', settings),
    duolingo,
    course,
  ]
}

async function clearReaderProgress(): Promise<void> {
  const records = await readerDb.progress.toArray()
  await readerDb.transaction('rw', readerDb.progress, async () => {
    await readerDb.progress.clear()
    const favorites = records
      .filter(record => record.favorite)
      .map(record => ({
        ...record,
        chapterHref: '',
        scrollPercent: 0,
        overallPercent: 0,
        timeSpentSeconds: 0,
        lastReadAt: 0,
      }))
    if (favorites.length) await readerDb.progress.bulkPut(favorites)
  })
}

export async function clearLearningProgress(area: LearningProgressArea): Promise<void> {
  if (area === 'reader') {
    await clearReaderProgress()
    return
  }

  const keys = AREA_META[area].keys
  const tables = area === 'explorer'
    ? [progressDb.settings, progressDb.dictionaryHistory]
    : area === 'duolingo'
      ? [progressDb.settings, progressDb.courseUnits, progressDb.courseQuizzes]
      : [progressDb.settings]

  await progressDb.transaction('rw', tables, async () => {
    await progressDb.settings.bulkDelete(keys)
    if (area === 'explorer') await progressDb.dictionaryHistory.clear()
    if (area === 'duolingo') {
      await progressDb.courseUnits.clear()
      await progressDb.courseQuizzes.clear()
    }
  })
}

export async function clearAllLearningProgress(): Promise<void> {
  await clearReaderProgress()
  await progressDb.transaction(
    'rw',
    progressDb.settings,
    progressDb.dictionaryHistory,
    progressDb.courseUnits,
    progressDb.courseQuizzes,
    async () => {
      await progressDb.settings.bulkDelete(
        LEARNING_PROGRESS_AREAS.flatMap(area => AREA_META[area].keys),
      )
      await Promise.all([
        progressDb.dictionaryHistory.clear(),
        progressDb.courseUnits.clear(),
        progressDb.courseQuizzes.clear(),
      ])
    },
  )
}
