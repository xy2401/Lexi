<script setup lang="ts">
/**
 * DuolingoView - 多邻国单元词汇浏览
 * 加载 /data/duolingo-zs-en.json，按单元展示词汇列表
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { db, cacheWords, type WordEntry } from '../lib/db'
import { queryDictionaryWords } from '../lib/remote-db'
import type { CourseUnitIndex, QuizDefinition } from '../lib/course-markdown'
import {
  COURSE_VERSION_SETTING,
  COURSE_VERSION_VIEW_SETTING,
  parseCourseVersions,
  type CourseVersion,
  type CourseVersionView,
} from '../lib/course-versions'
import { useCourseGuide } from '../composables/useCourseGuide'
import PracticePanel from './PracticePanel.vue'
import QuizLevelList from './QuizLevelList.vue'
import QuizRunner from './QuizRunner.vue'
import CoursePracticePanel from './CoursePracticePanel.vue'
import { useIsMobile } from '../composables/useMediaQuery'
import {
  completeCourseQuiz,
  getCourseUnitProgress,
  getProgressSetting,
  listCourseUnitProgress,
  saveCourseUnitProgress,
  setProgressSetting,
  startCourseQuiz,
  type CourseUnitProgress,
  type QuizCompletionResult,
} from '../lib/progress-db'

type DuoUnit = CourseUnitIndex

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const emit = defineEmits<{
  'select-word': [word: string]
  'immersive-change': [active: boolean]
}>()
const isMobile = useIsMobile()
const mobileScreen = ref<'library' | 'unit'>('library')
const lastUnitId = ref<number>()
const DUOLINGO_HISTORY_KEY = 'lexiDuolingoLayer'
const units = ref<DuoUnit[]>([])
const loading = ref(true)
const selectedUnit = ref<DuoUnit | null>(null)
const unitEntries = ref<WordEntry[]>([])
const searchQuery = ref('')
const versions = ref<CourseVersion[]>([])
const selectedVersionId = ref('')
const selectedVersion = computed(() => versions.value.find(version => version.id === selectedVersionId.value))
const isLegacyVersion = computed(() => selectedVersion.value?.format === 'combined')
const catalogError = ref('')
let contextRequest = 0
let savedPanel: CourseVersionView['panel'] | undefined

// 面板 tab 切换
const panelTab = ref<'words' | 'guide' | 'practice'>('words')
const courseGuide = useCourseGuide()
const { html: guideHtml, status: guideStatus, error: guideError, document: courseDocument } = courseGuide
const activeQuiz = ref<QuizDefinition | null>(null)
const completedQuizIds = ref<string[]>([])
const quizLoadingId = ref('')
const unitProgress = ref(new Map<number, CourseUnitProgress>())

const activeWords = computed(() => selectedUnit.value?.words || [])

// 搜索过滤
const filteredUnits = computed(() => {
  if (!searchQuery.value.trim()) return units.value
  const q = searchQuery.value.toLowerCase()
  return units.value.filter(u =>
    u.name.toLowerCase().includes(q) ||
    u.desc.toLowerCase().includes(q) ||
    u.words.some(w => w.toLowerCase().includes(q))
  )
})

// 统计
const totalWords = computed(() => units.value.reduce((s, u) => s + u.words.length, 0))
const lastUnit = computed(() => units.value.find(unit => unit.id === lastUnitId.value) || null)

onMounted(async () => {
  window.addEventListener('popstate', handleDuolingoPopState)
  await loadCatalog()
})

async function loadCatalog() {
  loading.value = true
  catalogError.value = ''
  try {
    const [indexResponse, versionsResponse] = await Promise.all([
      fetch('/data/duolingo-zs-en.json'),
      fetch('/data/duolingo-zs-en.versions.json'),
    ])
    if (!indexResponse.ok || !versionsResponse.ok) throw new Error('课程目录或版本清单加载失败')
    units.value = await indexResponse.json()
    const manifest = parseCourseVersions(await versionsResponse.json())
    versions.value = manifest.versions
    const [savedVersionId, savedView, legacyView] = await Promise.all([
      getProgressSetting<string>(COURSE_VERSION_SETTING, manifest.defaultVersionId),
      getProgressSetting<CourseVersionView | null>(COURSE_VERSION_VIEW_SETTING, null),
      getProgressSetting<{ unitId?: number; searchQuery: string }>('duolingo.view', { searchQuery: '' }),
    ])
    selectedVersionId.value = versions.value.some(version => version.id === savedVersionId)
      ? savedVersionId : manifest.defaultVersionId
    const view = savedView || legacyView
    savedPanel = savedView?.panel
    searchQuery.value = view.searchQuery || ''
    lastUnitId.value = view.unitId
    await refreshLegacyProgress()
    const savedUnit = units.value.find(unit => unit.id === view.unitId)
    if (savedUnit && !isMobile.value) await openUnit(savedUnit, savedView?.panel)
  } catch (e) {
    catalogError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function refreshLegacyProgress() {
  const versionId = selectedVersionId.value
  if (!isLegacyVersion.value) return
  const savedUnits = await listCourseUnitProgress()
  if (selectedVersionId.value === versionId) {
    unitProgress.value = new Map(savedUnits.map(item => [item.unitId, item]))
  }
}

onBeforeUnmount(() => {
  contextRequest++
  courseGuide.reset()
  window.removeEventListener('popstate', handleDuolingoPopState)
  emit('immersive-change', false)
})

watch(searchQuery, value => {
  if (!loading.value) void persistCourseView(selectedUnit.value?.id ?? lastUnitId.value, value)
})

function persistCourseView(unitId = selectedUnit.value?.id, query = searchQuery.value): Promise<void> {
  const view: CourseVersionView = { unitId, searchQuery: query, panel: panelTab.value }
  savedPanel = view.panel
  return Promise.all([
    setProgressSetting(COURSE_VERSION_VIEW_SETTING, view),
    ...(isLegacyVersion.value ? [setProgressSetting('duolingo.view', { unitId, searchQuery: query })] : []),
  ]).then(() => undefined)
}

async function changeVersion(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  if (id === selectedVersionId.value || !versions.value.some(version => version.id === id)) return
  const unit = selectedUnit.value
  const panel = panelTab.value
  selectedVersionId.value = id
  contextRequest++
  courseGuide.reset()
  activeQuiz.value = null
  completedQuizIds.value = []
  quizLoadingId.value = ''
  unitProgress.value = new Map()
  const reload = unit ? openUnit(unit, panel, false) : Promise.resolve()
  await Promise.all([
    setProgressSetting(COURSE_VERSION_SETTING, id),
    refreshLegacyProgress(),
    reload,
  ])
}

async function selectUnit(unit: DuoUnit) {
  if (isMobile.value) {
    await openMobileUnit(unit)
    return
  }
  if (selectedUnit.value?.id === unit.id) {
    contextRequest++
    selectedUnit.value = null
    unitEntries.value = []
    courseGuide.reset()
    activeQuiz.value = null
    completedQuizIds.value = []
    await persistCourseView(undefined)
    return
  }
  await openUnit(unit)
}

async function openUnit(unit: DuoUnit, panel?: CourseVersionView['panel'], restoreQuiz = true) {
  const request = ++contextRequest
  const version = selectedVersion.value
  if (!version) return
  selectedUnit.value = unit
  lastUnitId.value = unit.id
  unitEntries.value = []
  panelTab.value = panel || 'words'
  courseGuide.reset()
  activeQuiz.value = null
  completedQuizIds.value = []
  quizLoadingId.value = ''
  const [saved] = await Promise.all([
    version.format === 'combined' ? getCourseUnitProgress(unit.id) : Promise.resolve(null),
    loadEntries(unit.words, request),
    courseGuide.load(version, unit),
  ])
  if (request !== contextRequest) return
  if (saved) {
    unitProgress.value.set(unit.id, saved)
    completedQuizIds.value = [...saved.completedQuizIds]
    if (!panel && panelTab.value === 'words') panelTab.value = saved.panel
    if (restoreQuiz && panelTab.value === 'practice' && saved.activeQuizId && courseDocument.value?.quizzes.length) {
      activeQuiz.value = courseDocument.value.quizzes.find(quiz => quiz.id === saved.activeQuizId) || null
    }
  }
  await persistCourseView(unit.id)
}

async function openMobileUnit(unit: DuoUnit, restore = false) {
  mobileScreen.value = 'unit'
  emit('immersive-change', true)
  if (window.history.state?.[DUOLINGO_HISTORY_KEY] !== 'unit') {
    window.history.pushState({ ...(window.history.state || {}), [DUOLINGO_HISTORY_KEY]: 'unit' }, '')
  }
  await openUnit(unit, restore ? savedPanel : 'words')
}

function openLastUnit() {
  if (lastUnit.value) void openMobileUnit(lastUnit.value, true)
}

function leaveMobileUnit(clearHistory = false) {
  mobileScreen.value = 'library'
  activeQuiz.value = null
  emit('immersive-change', false)
  if (clearHistory && window.history.state?.[DUOLINGO_HISTORY_KEY] === 'unit') {
    const state: Record<string, unknown> = { ...(window.history.state || {}) }
    delete state[DUOLINGO_HISTORY_KEY]
    window.history.replaceState(state, '')
  }
}

function closeMobileUnit() {
  if (window.history.state?.[DUOLINGO_HISTORY_KEY] === 'unit') window.history.back()
  else leaveMobileUnit(true)
}

function handleDuolingoPopState() {
  if (isMobile.value && mobileScreen.value === 'unit') leaveMobileUnit(false)
}

watch(() => props.active, active => {
  if (!active) {
    emit('immersive-change', false)
    return
  }
  if (isMobile.value) leaveMobileUnit(true)
})

async function loadEntries(words: string[], request = contextRequest) {
  // 使用启动时载入的 Hot 数据与此前按需缓存的完整词条。
  const normalizedWords = words.map(word => word.toLowerCase())
  const entries = await db.words
    .where('word').anyOf(normalizedWords)
    .toArray()
  if (request !== contextRequest) return
  // 按原 JSON 顺序排列，本地没有的词也保留
  const map = new Map(entries.map(e => [e.word.toLowerCase(), e]))
  unitEntries.value = words.map(word => {
    const entry = map.get(word.toLowerCase())
    return entry
      ? { ...entry, word }
      : { word, phonetic: '', frequency: 0, tags: '', exchange: '', translation: '', cacheLevel: 'hot' }
  })
}

async function switchTab(tab: 'words' | 'guide' | 'practice') {
  const request = contextRequest
  panelTab.value = tab
  if (tab === 'guide' && selectedUnit.value && guideStatus.value === 'idle') {
    await loadGuide(selectedUnit.value)
  }
  if (request !== contextRequest) return
  if (tab !== 'practice') activeQuiz.value = null
  await persistCourseView()
  if (request !== contextRequest) return
  if (selectedUnit.value && isLegacyVersion.value) {
    const saved = await saveCourseUnitProgress(selectedUnit.value.id, {
      panel: tab,
      activeQuizId: tab === 'practice' ? activeQuiz.value?.id : undefined,
    })
    if (request === contextRequest) unitProgress.value.set(saved.unitId, saved)
  }
}

async function loadGuide(unit: DuoUnit) {
  if (selectedVersion.value) await courseGuide.load(selectedVersion.value, unit)
}

async function ensureTranslations() {
  const request = contextRequest
  const missing = unitEntries.value
    .filter(entry => !entry.translation.trim())
    .map(entry => entry.word)
  if (!missing.length) return

  try {
    const rows = await queryDictionaryWords(missing)
    if (request !== contextRequest) return
    const fullEntries: WordEntry[] = rows.map(row => ({ ...row, cacheLevel: 'full' }))
    if (fullEntries.length) await cacheWords(fullEntries)
    const map = new Map(fullEntries.map(entry => [entry.word.toLowerCase(), entry]))
    if (request !== contextRequest) return
    unitEntries.value = unitEntries.value.map(entry => {
      const full = map.get(entry.word.toLowerCase())
      return full ? { ...full, word: entry.word } : entry
    })
  } catch (error) {
    console.warn('[duolingo] 批量补充释义失败', error)
  }
}

async function selectQuiz(quiz: QuizDefinition) {
  if (!isLegacyVersion.value || !selectedUnit.value) return
  const request = contextRequest
  const unitId = selectedUnit.value.id
  quizLoadingId.value = quiz.id
  if (quiz.type === 'translation-choice' || (quiz.type === 'matching' && quiz.source === 'word-list')) {
    await ensureTranslations()
  }
  if (request !== contextRequest) return
  activeQuiz.value = quiz
  if (selectedUnit.value) {
    await startCourseQuiz(unitId, quiz.id)
    if (request !== contextRequest) return
    const saved = await saveCourseUnitProgress(unitId, {
      panel: 'practice',
      activeQuizId: quiz.id,
    })
    if (request === contextRequest) unitProgress.value.set(saved.unitId, saved)
  }
  if (request === contextRequest) quizLoadingId.value = ''
}

async function markQuizComplete(id: string, result: QuizCompletionResult = {}) {
  if (!isLegacyVersion.value || !selectedUnit.value) return
  const request = contextRequest
  const unitId = selectedUnit.value.id
  if (!completedQuizIds.value.includes(id)) completedQuizIds.value.push(id)
  await completeCourseQuiz(unitId, id, result)
  const saved = await getCourseUnitProgress(unitId)
  if (request === contextRequest) unitProgress.value.set(saved.unitId, saved)
}

async function backToQuizList() {
  activeQuiz.value = null
  if (!selectedUnit.value || !isLegacyVersion.value) return
  const request = contextRequest
  const saved = await saveCourseUnitProgress(selectedUnit.value.id, {
    panel: 'practice',
    activeQuizId: undefined,
  })
  if (request === contextRequest) unitProgress.value.set(saved.unitId, saved)
}

function selectWord(word: string) {
  emit('select-word', word)
}
</script>

<template>
  <div :class="['duolingo-view', { 'is-mobile-unit': isMobile && mobileScreen === 'unit' }]">
    <div v-show="!isMobile || mobileScreen === 'library'" class="duo-header">
      <div class="duo-stats" v-if="!loading">
        <span class="stat">{{ units.length }} 单元</span>
        <span class="stat">{{ totalWords }} 词</span>
      </div>
      <label v-if="!loading && versions.length" class="version-select">
        <span>讲义版本</span>
        <select :value="selectedVersionId" aria-label="讲义版本" @change="changeVersion">
          <option v-for="version in versions" :key="version.id" :value="version.id">{{ version.label }}</option>
        </select>
      </label>
      <input
        v-model="searchQuery"
        class="duo-search"
        placeholder="搜索单元或单词..."
      />
    </div>

    <div v-if="loading" class="duo-loading">加载中...</div>

    <div v-else-if="catalogError" class="course-message" role="alert">
      <p>{{ catalogError }}</p>
      <button type="button" @click="loadCatalog">重试</button>
    </div>

    <div v-else :class="['duo-body', { 'has-practice': panelTab === 'practice' && selectedUnit && !isLegacyVersion }]">
      <button
        v-if="isMobile && mobileScreen === 'library' && lastUnit"
        class="duo-continue"
        type="button"
        @click="openLastUnit"
      >
        <span class="continue-icon">▶</span>
        <span>
          <small>继续学习</small>
          <strong>{{ lastUnit.id }}. {{ lastUnit.name }}</strong>
          <em>{{ lastUnit.desc }}</em>
        </span>
        <b aria-hidden="true">›</b>
      </button>

      <!-- 单元列表 -->
      <div v-show="!isMobile || mobileScreen === 'library'" class="unit-list">
        <div
          v-for="unit in filteredUnits"
          :key="unit.id"
          :class="['unit-card', { active: selectedUnit?.id === unit.id }]"
          @click="selectUnit(unit)"
        >
          <div class="unit-num">{{ unit.id }}</div>
          <div class="unit-info">
            <div class="unit-name">{{ unit.name }}</div>
            <div class="unit-desc">{{ unit.desc }}</div>
          </div>
          <div class="unit-count">
            {{ unit.words.length }} 词
            <small v-if="isLegacyVersion && unitProgress.get(unit.id)?.completedQuizIds.length">
              ✓ {{ unitProgress.get(unit.id)?.completedQuizIds.length }} 关
            </small>
          </div>
        </div>
      </div>

      <!-- 选中单元的词汇 / 单元讲解 -->
      <div v-if="selectedUnit" v-show="!isMobile || mobileScreen === 'unit'" class="word-panel">
        <header class="mobile-unit-bar">
          <button type="button" aria-label="返回单元列表" @click="closeMobileUnit">‹</button>
          <div>
            <small>UNIT {{ selectedUnit.id }}</small>
            <strong>{{ selectedUnit.name }}</strong>
          </div>
          <span aria-hidden="true">🟢</span>
        </header>
        <h4>{{ selectedUnit.id }}. {{ selectedUnit.name }}</h4>
        <p class="panel-desc">{{ selectedUnit.desc }} · {{ activeWords.length }} 词</p>

        <label v-if="isMobile" class="version-select mobile-version-select">
          <span>讲义版本</span>
          <select :value="selectedVersionId" aria-label="讲义版本" @change="changeVersion">
            <option v-for="version in versions" :key="version.id" :value="version.id">{{ version.label }}</option>
          </select>
        </label>

        <div class="panel-tabs">
          <button :class="['tab-btn', { active: panelTab === 'words' }]" @click="switchTab('words')">词汇</button>
          <button :class="['tab-btn', { active: panelTab === 'guide' }]" @click="switchTab('guide')">单元讲解</button>
          <button :class="['tab-btn', { active: panelTab === 'practice' }]" @click="switchTab('practice')">练习</button>
        </div>

        <!-- 词汇列表 -->
        <div class="word-list" v-show="panelTab === 'words'">
          <div
            v-for="item in unitEntries"
            :key="item.word"
            class="word-item"
            @click="selectWord(item.word)"
          >
            <span class="word-text">{{ item.word }}</span>
            <span class="word-phonetic" v-if="item.phonetic">{{ item.phonetic }}</span>
            <span class="word-trans">{{ (item.translation || '').split(/\\n|\n/)[0]?.slice(0, 30) }}</span>
          </div>
        </div>

        <!-- 单元讲解 -->
        <div class="guide-content" v-show="panelTab === 'guide'">
          <div v-if="guideStatus === 'loading'" class="guide-loading">加载讲解中...</div>
          <div v-else-if="guideStatus === 'missing'" class="course-message">该版本尚未编写本课</div>
          <div v-else-if="guideStatus === 'error'" class="course-message" role="alert">
            <p>讲解加载失败：{{ guideError }}</p>
            <button type="button" @click="loadGuide(selectedUnit)">重试</button>
          </div>
          <div v-else-if="guideStatus === 'ready'" class="guide-body" v-html="guideHtml"></div>
        </div>

        <!-- 练习 -->
        <div v-if="panelTab === 'practice'" class="practice-content">
          <CoursePracticePanel v-if="!isLegacyVersion && selectedVersion" :key="`${selectedVersionId}:${selectedUnit.id}`" :version="selectedVersion" :unit="selectedUnit" @guide="switchTab('guide')" />
          <div v-else-if="guideStatus === 'loading'" class="guide-loading">加载练习中...</div>
          <template v-else-if="courseDocument?.quizzes.length">
            <QuizLevelList
              v-if="!activeQuiz"
              :quizzes="courseDocument.quizzes"
              :completed-ids="completedQuizIds"
              :loading-id="quizLoadingId"
              :unit-id="selectedUnit.id"
              :unit-name="selectedUnit.name"
              @select="selectQuiz"
            />
            <QuizRunner
              v-else
              :key="`${selectedVersionId}:${selectedUnit.id}:${activeQuiz.id}`"
              :quiz="activeQuiz"
              :words="activeWords"
              :entries="unitEntries"
              @back="backToQuizList"
              @complete="markQuizComplete"
            />
          </template>
          <template v-else>
            <p v-if="guideStatus === 'error'" class="course-warning">原版课程暂时无法加载，使用基础练习模式。</p>
            <PracticePanel :words="selectedUnit.words" :entries="unitEntries" />
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.duolingo-view {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.duo-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.duo-stats {
  display: flex;
  gap: 0.75rem;
}

.stat {
  font-size: 0.8rem;
  color: #666;
  background: #f0f0f0;
  padding: 0.2rem 0.6rem;
  border-radius: 10px;
}

.duo-search {
  flex: 1;
  min-width: 180px;
  padding: 0.4rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.85rem;
  outline: none;
}

.duo-search:focus {
  border-color: #58cc02;
  box-shadow: 0 0 0 2px rgba(88, 204, 2, 0.15);
}

.duo-loading {
  text-align: center;
  color: #999;
  padding: 2rem;
}

.duo-body {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  align-items: start;
}

.version-select {
  display: flex;
  align-items: center;
  gap: .5rem;
  color: #64748b;
  font-size: .8rem;
}

.version-select select {
  min-height: 36px;
  max-width: 100%;
  padding: .35rem .6rem;
  border: 1px solid #d5dfd0;
  border-radius: 8px;
  background: #fff;
  color: #285b10;
  font: inherit;
}

.version-select select:focus-visible {
  outline: 2px solid #58cc02;
  outline-offset: 2px;
}

.course-message {
  padding: 1.5rem;
  color: #64748b;
  text-align: center;
}

.course-message button {
  min-height: 40px;
  padding: .35rem 1rem;
  border: 1px solid #d5dfd0;
  border-radius: 8px;
  background: #f0f8e9;
  color: #285b10;
  cursor: pointer;
}

.unit-list {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: min(860px, calc(100vh - 220px));
  max-height: 860px;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.unit-card {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid #eee;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s;
}

.unit-card:hover {
  border-color: #58cc02;
  background: #f6fef0;
}

.unit-card.active {
  border-color: #58cc02;
  background: #eefbd8;
  box-shadow: 0 0 0 1px #58cc02;
}

.unit-num {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #58cc02;
  color: #fff;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
}

.unit-info {
  flex: 1;
  min-width: 0;
}

.unit-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unit-desc {
  font-size: 0.72rem;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unit-count {
  display: grid;
  justify-items: end;
  gap: 0.15rem;
  font-size: 0.7rem;
  color: #aaa;
  flex-shrink: 0;
}

.unit-count small {
  color: #58a92f;
  font-size: 0.65rem;
  font-weight: 700;
  white-space: nowrap;
}

.word-panel {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  overflow: hidden;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 1rem;
  position: sticky;
  top: 1rem;
  display: flex;
  flex-direction: column;
  height: min(860px, calc(100vh - 220px));
}

.word-panel h4 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  color: #333;
}

.panel-desc {
  margin: 0 0 0.75rem;
  font-size: 0.8rem;
  color: #888;
}

.panel-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 0.75rem;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
}

.tab-btn {
  padding: 0.3rem 0.8rem;
  border: 1px solid #ddd;
  border-radius: 14px;
  background: #fafafa;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.tab-btn:hover {
  border-color: #58cc02;
  color: #58cc02;
}

.tab-btn.active {
  background: #58cc02;
  border-color: #58cc02;
  color: #fff;
  font-weight: 600;
}

.word-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  border: 1px solid #eee;
  border-radius: 6px;
}

.guide-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 0.75rem 1rem;
}

.guide-loading {
  text-align: center;
  color: #999;
  padding: 2rem;
  font-size: 0.85rem;
}

.guide-body {
  overflow-wrap: anywhere;
  font-size: 0.85rem;
  line-height: 1.7;
  color: #333;
}

.guide-body :deep(h1) {
  font-size: 1.1rem;
  margin: 0 0 0.5rem;
}

.guide-body :deep(h2) {
  font-size: 0.95rem;
  margin: 1rem 0 0.4rem;
  color: #58cc02;
}

.guide-body :deep(blockquote) {
  margin: 0.5rem 0;
  padding: 0.3rem 0.75rem;
  border-left: 3px solid #58cc02;
  background: #f6fef0;
  color: #555;
  font-size: 0.8rem;
}

.guide-body :deep(ul) {
  padding-left: 1.2rem;
  margin: 0.5rem 0;
}

.guide-body :deep(li) {
  margin-bottom: 0.6rem;
}

.guide-body :deep(strong) {
  color: #2c3e50;
}

.word-item {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  border-bottom: 1px solid #f8f8f8;
  transition: background 0.1s;
}

.word-item:hover {
  background: #f0fff0;
}

.word-text {
  font-weight: 600;
  font-size: 0.9rem;
  color: #2c3e50;
  min-width: 80px;
}

.word-phonetic {
  font-size: 0.75rem;
  color: #8e44ad;
}

.word-trans {
  font-size: 0.75rem;
  color: #7f8c8d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.course-warning {
  margin: 0 0 0.75rem;
  padding: 0.65rem 0.8rem;
  border: 1px solid #f0c36d;
  border-radius: 8px;
  color: #7a5100;
  background: #fff8e8;
  font-size: 0.84rem;
}

.practice-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

@media (max-width: 767.98px) {
  .duolingo-view {
    min-height: calc(100dvh - var(--mobile-appbar-h) - var(--tabbar-h) - 1.5rem);
  }

  .duo-header {
    position: sticky;
    top: var(--mobile-appbar-h);
    z-index: 15;
    gap: .65rem;
    margin: -.75rem -.75rem 0;
    padding: .75rem;
    background: rgba(246, 248, 251, .96);
    backdrop-filter: blur(12px);
  }

  .duo-stats {
    width: 100%;
  }

  .stat {
    padding: .3rem .65rem;
  }

  .duo-search {
    width: 100%;
    min-height: 46px;
    border-radius: 14px;
    background: #fff;
  }

  .duo-body {
    grid-template-columns: 1fr;
    gap: .75rem;
  }

  .duo-continue {
    width: 100%;
    min-height: 92px;
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr) 22px;
    align-items: center;
    gap: .75rem;
    padding: .85rem;
    border: 0;
    border-radius: 18px;
    background: linear-gradient(135deg, #58cc02, #3da800);
    color: #fff;
    box-shadow: 0 8px 24px rgb(88 204 2 / 22%);
    text-align: left;
  }

  .continue-icon {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    border-radius: 15px;
    background: rgb(255 255 255 / 20%);
  }

  .duo-continue > span:nth-child(2) {
    min-width: 0;
    display: grid;
    gap: .12rem;
  }

  .duo-continue small,
  .duo-continue em {
    overflow: hidden;
    opacity: .82;
    font-size: .7rem;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .duo-continue strong {
    overflow: hidden;
    font-size: .94rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .duo-continue b {
    font-size: 1.6rem;
  }

  .unit-list {
    height: auto;
    max-height: none;
    overflow: visible;
    gap: .55rem;
  }

  .unit-card {
    min-height: 68px;
    padding: .7rem;
    border: 0;
    border-radius: 16px;
    background: #fff;
    box-shadow: 0 4px 16px rgb(15 23 42 / 5%);
  }

  .unit-num {
    width: 40px;
    height: 40px;
  }

  .unit-name {
    font-size: .92rem;
  }

  .unit-desc {
    margin-top: .2rem;
    font-size: .74rem;
  }

  .duolingo-view.is-mobile-unit {
    position: fixed;
    inset: 0;
    z-index: 850;
    min-height: 100dvh;
    overflow: hidden;
    background: #f6f8fb;
  }

  .is-mobile-unit .duo-body {
    display: block;
    height: 100dvh;
  }

  .word-panel {
    position: static;
    height: 100dvh;
    padding: 0 .75rem calc(.75rem + env(safe-area-inset-bottom, 0px));
    border: 0;
    border-radius: 0;
    background: #f6f8fb;
  }

  .mobile-unit-bar {
    min-height: calc(58px + env(safe-area-inset-top, 0px));
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    gap: .5rem;
    margin: 0 -.75rem;
    padding: env(safe-area-inset-top, 0px) .65rem 0;
    border-bottom: 1px solid #e5eaf0;
    background: rgba(255, 255, 255, .97);
    backdrop-filter: blur(14px);
  }

  .mobile-unit-bar button {
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 12px;
    background: #eef4e9;
    color: #3d8f05;
    font-size: 1.75rem;
  }

  .mobile-unit-bar div {
    min-width: 0;
    display: grid;
    text-align: center;
  }

  .mobile-unit-bar small {
    color: #58a92f;
    font-size: .6rem;
    font-weight: 800;
    letter-spacing: .08em;
  }

  .mobile-unit-bar strong {
    overflow: hidden;
    font-size: .9rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-unit-bar > span {
    display: grid;
    place-items: center;
  }

  .word-panel > h4,
  .word-panel > .panel-desc {
    display: none;
  }

  .panel-tabs {
    position: sticky;
    top: calc(102px + env(safe-area-inset-top, 0px));
    z-index: 10;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: .35rem;
    margin: 0 -.75rem .7rem;
    padding: .55rem .75rem;
    border-bottom: 1px solid #e8edf2;
    background: rgba(246, 248, 251, .97);
  }

  .panel-tabs .tab-btn {
    min-height: 42px;
    padding: .35rem;
    border-radius: 12px;
  }

  .mobile-version-select {
    flex-shrink: 0;
    justify-content: space-between;
    min-height: 44px;
    padding: .25rem 0;
  }

  .word-list,
  .guide-content,
  .practice-content {
    flex: 1;
    min-height: 0;
    max-height: none;
    overflow-y: auto;
    border: 0;
    border-radius: 14px;
    background: #fff;
  }

  .word-item {
    min-height: 54px;
    padding: .65rem .75rem;
  }

  .word-text {
    min-width: 92px;
    font-size: .96rem;
  }

  .guide-content {
    padding: 1rem;
  }
}

@media (min-width: 768px) {
  .duo-body.has-practice { grid-template-columns: minmax(220px, .65fr) minmax(0, 1.35fr); }
  .mobile-unit-bar,
  .duo-continue {
    display: none;
  }
}
</style>
