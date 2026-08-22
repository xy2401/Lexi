<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ReaderView from './ReaderView.vue'
import ReaderAnnotationControls from './ReaderAnnotationControls.vue'
import { useIsMobile } from '../composables/useMediaQuery'
import { readerDb, getReaderSetting, setReaderSetting } from '../lib/reader-db'
import {
  ensureDefaultLibrarySource,
  failoverLibrarySource,
  getActiveLibrarySource,
  getProgressForBook,
  listLibrarySources,
  listReadingProgress,
  loadBookChapter,
  loadBookPackage,
  loadLibraryCatalog,
  refreshLibraryCatalog,
  remoteCoverUrl,
  resolveRemoteCover,
  resolveLocalCover,
  saveReadingProgress,
  setActiveLibrarySource,
} from '../lib/library-service'
import { importLocalBook, removeLocalBook } from '../lib/epub-import'
import {
  DEFAULT_READER_PREFERENCES,
  mergeReaderPreferences,
  type BookPackage,
  type LibraryBook,
  type LibrarySource,
  type ReaderPreferences,
  type ReadingProgress,
} from '../lib/reader-types'

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true })
const emit = defineEmits<{
  'word-click': [payload: { word: string; x: number; y: number }]
  'recording-change': [recording: boolean]
  'immersive-change': [active: boolean]
}>()

const isMobile = useIsMobile()
const READER_HISTORY_KEY = 'lexiReaderLayer'

type WorkspaceMode = 'remote' | 'local' | 'temporary'
type ShelfView = 'all' | 'favorites' | 'recent'
type ShelfSort = 'rank' | 'title' | 'author' | 'progress'

const mode = ref<WorkspaceMode>('remote')
const shelfView = ref<ShelfView>('all')
const shelfSort = ref<ShelfSort>('rank')
const sources = ref<LibrarySource[]>([])
const activeSourceId = ref('')
const remoteBooks = ref<LibraryBook[]>([])
const localBooks = ref<LibraryBook[]>([])
const progressRecords = ref<ReadingProgress[]>([])
const search = ref('')
const selectedSubjects = ref<string[]>([])
const visibleCount = ref(24)
const loading = ref(false)
const refreshing = ref(false)
const error = ref('')
const notice = ref('')
const temporaryText = ref('The quick brown fox jumps over the lazy dog. She was running happily through the beautiful garden.')
const importInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)

const detailBook = ref<LibraryBook | null>(null)
const detailPackage = ref<BookPackage | null>(null)
const detailLoading = ref(false)

const currentBook = ref<LibraryBook | null>(null)
const currentPackage = ref<BookPackage | null>(null)
const currentChapterIndex = ref(0)
const currentChapterHtml = ref('')
const currentChapterText = ref('')
const currentProgress = ref<ReadingProgress | null>(null)
const chapterLoading = ref(false)
const readerError = ref('')
const readerScrollRef = ref<HTMLElement | null>(null)
const tocOpen = ref(false)
const readerSettingsOpen = ref(false)
const preferences = ref<ReaderPreferences>({
  ...DEFAULT_READER_PREFERENCES,
  annotationTagStates: { ...DEFAULT_READER_PREFERENCES.annotationTagStates },
})
const preferencesReady = ref(false)
const localCoverUrls = ref<Record<string, string>>({})
const localCoverRevokers = new Map<string, () => void>()
let chapterObjectUrls: string[] = []
let saveTimer: ReturnType<typeof setTimeout> | null = null
let readingTimer: ReturnType<typeof setInterval> | null = null

const activeSource = computed(() => sources.value.find(source => source.id === activeSourceId.value) || null)
const readerMeaningsEnabled = computed(() => (
  Object.values(preferences.value.annotationTagStates).includes('include')
))
const sourceProgress = computed(() => {
  const exact = new Map(progressRecords.value.map(item => [item.bookKey, item]))
  const canonical = new Map<string, ReadingProgress>()
  for (const item of progressRecords.value) {
    const previous = canonical.get(item.canonicalId)
    if (!previous || item.lastReadAt > previous.lastReadAt) canonical.set(item.canonicalId, item)
  }
  return { exact, canonical }
})

function progressFor(book: LibraryBook): ReadingProgress | undefined {
  return sourceProgress.value.exact.get(book.key) || sourceProgress.value.canonical.get(book.canonicalId)
}

const subjectOptions = computed(() => {
  const counts = new Map<string, number>()
  for (const book of remoteBooks.value) {
    for (const subject of book.subjects) counts.set(subject, (counts.get(subject) || 0) + 1)
  }
  return Array.from(counts, ([id, count]) => ({ id, count })).sort((a, b) => a.id.localeCompare(b.id))
})

const currentShelfBooks = computed(() => mode.value === 'local' ? localBooks.value : remoteBooks.value)

const filteredBooks = computed(() => {
  const query = search.value.trim().toLowerCase()
  const subjects = new Set(selectedSubjects.value)
  let result = currentShelfBooks.value.filter(book => {
    if (query && !`${book.title} ${book.author}`.toLowerCase().includes(query)) return false
    if (mode.value === 'remote' && subjects.size && !book.subjects.some(subject => subjects.has(subject))) return false
    const progress = progressFor(book)
    if (shelfView.value === 'favorites' && !progress?.favorite) return false
    if (shelfView.value === 'recent' && !progress?.lastReadAt) return false
    return true
  })
  result = [...result].sort((a, b) => {
    if (shelfView.value === 'recent') return (progressFor(b)?.lastReadAt || 0) - (progressFor(a)?.lastReadAt || 0)
    if (shelfSort.value === 'title') return a.title.localeCompare(b.title)
    if (shelfSort.value === 'author') return a.author.localeCompare(b.author)
    if (shelfSort.value === 'progress') return (progressFor(b)?.overallPercent || 0) - (progressFor(a)?.overallPercent || 0)
    return (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
  })
  return result
})

const visibleBooks = computed(() => filteredBooks.value.slice(0, visibleCount.value))
const continueBook = computed(() => {
  const records = currentShelfBooks.value
    .map(book => ({ book, progress: progressFor(book) }))
    .filter(item => item.progress?.lastReadAt)
    .sort((a, b) => (b.progress?.lastReadAt || 0) - (a.progress?.lastReadAt || 0))
  return records[0] || null
})
const favoriteCount = computed(() => currentShelfBooks.value.filter(book => progressFor(book)?.favorite).length)
const recentCount = computed(() => currentShelfBooks.value.filter(book => progressFor(book)?.lastReadAt).length)
const currentToc = computed(() => currentPackage.value?.toc || [])
const currentTocItem = computed(() => currentToc.value[currentChapterIndex.value])

function formatPercent(value = 0): string {
  return `${Math.round(value * 100)}%`
}

function formatReadingTime(seconds = 0): string {
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
}

function coverUrl(book: LibraryBook): string {
  if (book.origin === 'local') return localCoverUrls.value[book.key] || ''
  const source = sources.value.find(item => item.id === book.sourceId)
  if (!source) return ''
  try {
    return remoteCoverUrl(source, book)
  } catch {
    return ''
  }
}

async function hydrateBookCover(book: LibraryBook): Promise<void> {
  if (localCoverUrls.value[book.key]) return
  const result = book.origin === 'local' ? await resolveLocalCover(book) : await resolveRemoteCover(book)
  if (!result) return
  localCoverUrls.value = { ...localCoverUrls.value, [book.key]: result.url }
  localCoverRevokers.set(book.key, result.revoke)
}

async function reloadProgress(): Promise<void> {
  progressRecords.value = await listReadingProgress()
}

async function reloadLocalBooks(): Promise<void> {
  localBooks.value = await readerDb.books.where('origin').equals('local').toArray()
  await Promise.all(localBooks.value.slice(0, 48).map(hydrateBookCover))
}

async function loadRemoteSource(sourceId: string): Promise<void> {
  error.value = ''
  notice.value = ''
  loading.value = true
  const hadCachedCatalog = await readerDb.books.where('sourceId').equals(sourceId).count() > 0
  try {
    remoteBooks.value = await loadLibraryCatalog(sourceId)
  } catch (cause) {
    await switchToFallbackSource(sourceId, cause)
  } finally {
    loading.value = false
  }
  if (hadCachedCatalog && remoteBooks.value.length && activeSourceId.value === sourceId) {
    refreshing.value = true
    void refreshLibraryCatalog(sourceId)
      .then(books => { if (activeSourceId.value === sourceId) remoteBooks.value = books })
      .catch(cause => {
        if (activeSourceId.value === sourceId) void switchToFallbackSource(sourceId, cause)
      })
      .finally(() => { refreshing.value = false })
  }
}

async function switchToFallbackSource(failedSourceId: string, primaryCause: unknown): Promise<boolean> {
  const failedSource = sources.value.find(source => source.id === failedSourceId)
  try {
    const fallback = await failoverLibrarySource(sources.value, [failedSourceId])
    activeSourceId.value = fallback.source.id
    remoteBooks.value = fallback.books
    selectedSubjects.value = []
    visibleCount.value = 24
    error.value = ''
    notice.value = `${failedSource?.name || '当前书库'}不可用，已自动切换到 ${fallback.source.name}`
    return true
  } catch (fallbackCause) {
    remoteBooks.value = []
    const primaryMessage = primaryCause instanceof Error ? primaryCause.message : String(primaryCause)
    const fallbackMessage = fallbackCause instanceof Error ? fallbackCause.message : String(fallbackCause)
    error.value = `${primaryMessage}；${fallbackMessage}`
    notice.value = ''
    return false
  }
}

async function initialize(): Promise<void> {
  const savedPreferences = await getReaderSetting<Partial<ReaderPreferences>>('readerPreferences', {})
  preferences.value = mergeReaderPreferences(savedPreferences)
  preferencesReady.value = true
  await ensureDefaultLibrarySource()
  sources.value = await listLibrarySources()
  const active = await getActiveLibrarySource()
  activeSourceId.value = active?.id || ''
  await Promise.all([reloadProgress(), reloadLocalBooks()])
  if (activeSourceId.value) await loadRemoteSource(activeSourceId.value)
}

async function changeSource(): Promise<void> {
  if (!activeSourceId.value) return
  notice.value = ''
  await setActiveLibrarySource(activeSourceId.value)
  selectedSubjects.value = []
  visibleCount.value = 24
  await loadRemoteSource(activeSourceId.value)
}

async function manualRefresh(): Promise<void> {
  if (!activeSourceId.value) return
  refreshing.value = true
  error.value = ''
  notice.value = ''
  try {
    remoteBooks.value = await refreshLibraryCatalog(activeSourceId.value)
  } catch (cause) {
    await switchToFallbackSource(activeSourceId.value, cause)
  } finally {
    refreshing.value = false
  }
}

function switchMode(nextMode: WorkspaceMode): void {
  closeReader()
  mode.value = nextMode
  shelfView.value = 'all'
  search.value = ''
  selectedSubjects.value = []
  visibleCount.value = 24
}

function toggleSubject(subject: string): void {
  selectedSubjects.value = selectedSubjects.value.includes(subject)
    ? selectedSubjects.value.filter(item => item !== subject)
    : [...selectedSubjects.value, subject]
  visibleCount.value = 24
}

async function openDetail(book: LibraryBook): Promise<void> {
  detailBook.value = book
  detailPackage.value = null
  detailLoading.value = true
  error.value = ''
  try {
    detailPackage.value = await loadBookPackage(book.key)
    await hydrateBookCover(book)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    detailLoading.value = false
  }
}

function closeDetail(): void {
  detailBook.value = null
  detailPackage.value = null
}

async function toggleFavorite(book: LibraryBook): Promise<void> {
  const progress = await getProgressForBook(book)
  progress.favorite = !progress.favorite
  if (progress.favorite) await hydrateBookCover(book)
  progress.lastReadAt ||= 0
  await saveReadingProgress(progress)
  await reloadProgress()
}

function revokeChapterUrls(): void {
  chapterObjectUrls.forEach(URL.revokeObjectURL)
  chapterObjectUrls = []
}

async function persistCurrentProgress(immediate = false): Promise<void> {
  if (!currentBook.value || !currentProgress.value || !currentPackage.value) return
  const scroll = readerScrollRef.value
  const maxScroll = scroll ? Math.max(0, scroll.scrollHeight - scroll.clientHeight) : 0
  const scrollPercent = maxScroll && scroll ? Math.min(1, Math.max(0, scroll.scrollTop / maxScroll)) : 0
  const progress = currentProgress.value
  progress.chapterHref = currentTocItem.value?.href || progress.chapterHref
  progress.scrollPercent = scrollPercent
  progress.overallPercent = Math.min(1, (currentChapterIndex.value + scrollPercent) / Math.max(1, currentToc.value.length))
  progress.lastReadAt = Date.now()
  const save = async () => {
    await saveReadingProgress({ ...progress })
    await reloadProgress()
  }
  if (saveTimer) clearTimeout(saveTimer)
  if (immediate) await save()
  else saveTimer = setTimeout(() => void save(), 800)
}

async function loadChapterAt(index: number, restoreProgress = false): Promise<void> {
  if (!currentBook.value || !currentPackage.value || !currentToc.value.length) return
  await persistCurrentProgress(true)
  const safeIndex = Math.max(0, Math.min(index, currentToc.value.length - 1))
  const item = currentToc.value[safeIndex]
  chapterLoading.value = true
  readerError.value = ''
  revokeChapterUrls()
  try {
    const chapter = await loadBookChapter(currentBook.value.key, item.href, item.title)
    chapterObjectUrls = chapter.objectUrls
    currentChapterIndex.value = safeIndex
    currentChapterHtml.value = chapter.html
    currentChapterText.value = chapter.plainText
    await nextTick()
    const scroll = readerScrollRef.value
    if (scroll) {
      const shouldRestore = restoreProgress && currentProgress.value?.chapterHref === item.href
      const percent = shouldRestore ? currentProgress.value?.scrollPercent || 0 : 0
      scroll.scrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight) * percent
      scroll.focus({ preventScroll: true })
    }
  } catch (cause) {
    readerError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    chapterLoading.value = false
  }
}

function startReadingTimer(): void {
  stopReadingTimer()
  readingTimer = setInterval(() => {
    if (!currentProgress.value || !props.active || document.hidden) return
    currentProgress.value.timeSpentSeconds++
    if (currentProgress.value.timeSpentSeconds % 30 === 0) void persistCurrentProgress()
  }, 1000)
}

function stopReadingTimer(): void {
  if (readingTimer) clearInterval(readingTimer)
  readingTimer = null
}

async function openBook(book: LibraryBook): Promise<void> {
  closeDetail()
  readerError.value = ''
  try {
    const bookPackage = await loadBookPackage(book.key)
    const progress = await getProgressForBook(book)
    currentBook.value = book
    currentPackage.value = bookPackage
    if (isMobile.value) {
      emit('immersive-change', true)
      if (window.history.state?.[READER_HISTORY_KEY] !== 'reader') {
        window.history.pushState({ ...(window.history.state || {}), [READER_HISTORY_KEY]: 'reader' }, '')
      }
    }
    currentProgress.value = progress
    const savedIndex = Math.max(0, bookPackage.toc.findIndex(item => item.href === progress.chapterHref))
    await loadChapterAt(savedIndex, true)
    startReadingTimer()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

function closeReader(clearHistory = true): void {
  if (currentBook.value) void persistCurrentProgress(true)
  stopReadingTimer()
  revokeChapterUrls()
  currentBook.value = null
  currentPackage.value = null
  currentProgress.value = null
  currentChapterHtml.value = ''
  currentChapterText.value = ''
  tocOpen.value = false
  readerSettingsOpen.value = false
  emit('immersive-change', false)
  if (clearHistory && window.history.state?.[READER_HISTORY_KEY] === 'reader') {
    const state: Record<string, unknown> = { ...(window.history.state || {}) }
    delete state[READER_HISTORY_KEY]
    window.history.replaceState(state, '')
  }
}

function requestCloseReader(): void {
  if (isMobile.value && window.history.state?.[READER_HISTORY_KEY] === 'reader') window.history.back()
  else closeReader(true)
}

function handleReaderPopState(): void {
  if (isMobile.value && currentBook.value) closeReader(false)
}

function handleReaderScroll(): void {
  void persistCurrentProgress()
}

async function handleChapterLink(href: string): Promise<void> {
  if (!href) return
  if (/^https?:/i.test(href)) {
    window.open(href, '_blank', 'noopener,noreferrer')
    return
  }
  if (href.startsWith('#')) {
    const target = readerScrollRef.value?.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)
    target?.scrollIntoView({ block: 'center' })
    return
  }
  const currentHref = currentTocItem.value?.href || ''
  const normalized = new URL(href, `https://book.invalid/${currentHref}`).pathname.replace(/^\//, '')
  const index = currentToc.value.findIndex(item => item.href.split('#')[0] === normalized.split('#')[0])
  if (index >= 0) {
    await loadChapterAt(index)
    const fragment = href.split('#')[1]
    if (fragment) {
      await nextTick()
      let targetId = fragment
      try { targetId = decodeURIComponent(fragment) } catch { /* Keep the literal fragment. */ }
      readerScrollRef.value?.querySelector(`[id="${CSS.escape(targetId)}"]`)?.scrollIntoView({ block: 'center' })
    }
  }
}

async function savePreferences(): Promise<void> {
  if (!preferencesReady.value) return
  await setReaderSetting('readerPreferences', {
    ...preferences.value,
    annotationTagStates: { ...preferences.value.annotationTagStates },
  })
}

function triggerImport(): void {
  importInput.value?.click()
}

async function handleImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importing.value = true
  error.value = ''
  try {
    const book = await importLocalBook(file)
    await reloadLocalBooks()
    mode.value = 'local'
    await openDetail(book)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    importing.value = false
  }
}

async function deleteLocalBook(book: LibraryBook): Promise<void> {
  if (!window.confirm(`删除《${book.title}》及其阅读记录？`)) return
  localCoverRevokers.get(book.key)?.()
  localCoverRevokers.delete(book.key)
  await removeLocalBook(book.key)
  await Promise.all([reloadLocalBooks(), reloadProgress()])
}

watch(() => props.active, active => {
  if (!active) {
    stopReadingTimer()
    emit('immersive-change', false)
  } else if (currentBook.value) {
    startReadingTimer()
    if (isMobile.value) emit('immersive-change', true)
  }
})

watch(preferences, () => void savePreferences(), { deep: true })
watch([search, shelfSort, shelfView], () => { visibleCount.value = 24 })

onMounted(() => {
  window.addEventListener('popstate', handleReaderPopState)
  void initialize().catch(cause => {
    error.value = cause instanceof Error ? cause.message : String(cause)
  })
})
onBeforeUnmount(() => {
  window.removeEventListener('popstate', handleReaderPopState)
  closeReader()
  if (saveTimer) clearTimeout(saveTimer)
  localCoverRevokers.forEach(revoke => revoke())
})
</script>

<template>
  <section :class="['reader-workspace', { 'is-reading': currentBook && currentPackage }]">
    <template v-if="currentBook && currentPackage">
      <header class="book-reader-header">
        <button class="reader-tool back" type="button" @click="requestCloseReader">← 返回书架</button>
        <div class="reader-book-title">
          <strong>{{ currentPackage.title }}</strong>
          <span>{{ currentPackage.author }}</span>
        </div>
        <div class="reader-progress-summary">
          <span>{{ formatPercent(currentProgress?.overallPercent) }}</span>
          <div><i :style="{ width: formatPercent(currentProgress?.overallPercent) }"></i></div>
        </div>
        <div class="reader-toolbar">
          <button class="reader-tool" type="button" :aria-pressed="tocOpen" @click="tocOpen = !tocOpen">☰ 目录</button>
          <button class="reader-tool" type="button" :aria-pressed="readerSettingsOpen" @click="readerSettingsOpen = !readerSettingsOpen">Aa 设置</button>
        </div>
      </header>

      <ReaderAnnotationControls
        v-if="preferencesReady"
        v-model:states="preferences.annotationTagStates"
        class="reader-annotation-bar"
      />

      <div class="book-reader-shell" :data-theme="preferences.theme">
        <aside v-if="tocOpen" class="reader-toc">
          <div class="drawer-head"><strong>目录</strong><button type="button" @click="tocOpen = false">×</button></div>
          <button
            v-for="(item, index) in currentToc"
            :key="`${item.href}-${index}`"
            :class="['toc-item', { active: index === currentChapterIndex }]"
            :style="{ paddingLeft: `${0.65 + Math.min(item.level, 3) * 0.65}rem` }"
            type="button"
            @click="loadChapterAt(index); tocOpen = false"
          >{{ item.title }}</button>
        </aside>

        <aside v-if="readerSettingsOpen" class="reader-settings-drawer">
          <div class="drawer-head"><strong>阅读设置</strong><button type="button" @click="readerSettingsOpen = false">×</button></div>
          <label>主题<select v-model="preferences.theme"><option value="paper">纸张</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
          <label>字体<select v-model="preferences.font"><option value="serif">衬线体</option><option value="sans">无衬线体</option></select></label>
          <label>字号 <output>{{ preferences.fontSize }}px</output><input v-model.number="preferences.fontSize" type="range" min="14" max="30" step="1"></label>
          <label>行高 <output>{{ preferences.lineHeight.toFixed(1) }}</output><input v-model.number="preferences.lineHeight" type="range" min="1.4" max="2.4" step="0.1"></label>
          <label>宽度 <output>{{ preferences.contentWidth }}px</output><input v-model.number="preferences.contentWidth" type="range" min="520" max="920" step="40"></label>
          <label v-if="readerMeaningsEnabled" class="reader-toggle-setting"><span><input v-model="preferences.annotateBasicFunctionWords" type="checkbox"> 标注基础功能词</span><small>仅对设为“释义”的词汇范围生效，使用人工维护的紧凑释义。</small></label>
        </aside>

        <main ref="readerScrollRef" class="book-reader-scroll" tabindex="0" @scroll="handleReaderScroll">
          <div
            class="book-reader-page"
            :data-font="preferences.font"
            :style="{ maxWidth: `${preferences.contentWidth}px`, fontSize: `${preferences.fontSize}px`, lineHeight: preferences.lineHeight }"
          >
            <div v-if="chapterLoading" class="reader-state">正在读取章节…</div>
            <div v-else-if="readerError" class="reader-state error">{{ readerError }}</div>
            <ReaderView
              v-else
              :key="currentTocItem?.href"
              text=""
              :html="currentChapterHtml"
              :follow-text="currentChapterText"
              :active="active"
              :annotation-tag-states="preferences.annotationTagStates"
              :basic-function-words-enabled="preferences.annotateBasicFunctionWords"
              :show-follow="false"
              @word-click="emit('word-click', $event)"
              @recording-change="emit('recording-change', $event)"
              @link-click="handleChapterLink"
            />
            <nav class="chapter-nav">
              <button type="button" :disabled="currentChapterIndex === 0" @click="loadChapterAt(currentChapterIndex - 1)">← 上一章</button>
              <span>{{ currentChapterIndex + 1 }} / {{ currentToc.length }}</span>
              <button type="button" :disabled="currentChapterIndex >= currentToc.length - 1" @click="loadChapterAt(currentChapterIndex + 1)">下一章 →</button>
            </nav>
          </div>
        </main>
      </div>
    </template>

    <template v-else>
      <div class="reader-mode-bar">
        <div class="mode-tabs">
          <button :class="{ active: mode === 'remote' }" type="button" @click="switchMode('remote')">🌐 远程书库</button>
          <button :class="{ active: mode === 'local' }" type="button" @click="switchMode('local')">📚 本地书架</button>
          <button :class="{ active: mode === 'temporary' }" type="button" @click="switchMode('temporary')">✍️ 临时文本</button>
        </div>
        <div v-if="mode === 'remote'" class="source-picker">
          <select v-model="activeSourceId" @change="changeSource">
            <option v-for="source in sources.filter(item => item.enabled)" :key="source.id" :value="source.id">{{ source.name }}</option>
          </select>
          <button type="button" :disabled="refreshing" @click="manualRefresh">{{ refreshing ? '刷新中…' : '刷新书目' }}</button>
        </div>
        <button v-if="mode === 'local'" class="import-button" type="button" :disabled="importing" @click="triggerImport">{{ importing ? '导入中…' : '＋ 导入 EPUB / HTML' }}</button>
        <input ref="importInput" class="hidden-input" type="file" accept=".epub,.html,.htm,application/epub+zip,text/html" @change="handleImport">
      </div>

      <template v-if="mode === 'temporary'">
        <ReaderAnnotationControls
          v-if="preferencesReady"
          v-model:states="preferences.annotationTagStates"
          class="reader-annotation-bar"
        />
        <div class="temporary-reader-layout">
          <aside>
            <label for="temporary-reader-input">输入文本</label>
            <textarea id="temporary-reader-input" v-model="temporaryText" rows="12" placeholder="粘贴纯文本、Markdown 或 HTML…"></textarea>
            <p>内容仅保留在当前页面，不会进入书架。</p>
          </aside>
          <main><ReaderView :text="temporaryText" :active="active" :annotation-tag-states="preferences.annotationTagStates" :basic-function-words-enabled="preferences.annotateBasicFunctionWords" @word-click="emit('word-click', $event)" @recording-change="emit('recording-change', $event)" /></main>
        </div>
      </template>

      <template v-else>
        <p v-if="notice" class="library-notice">{{ notice }}</p>
        <p v-if="error" class="library-error">{{ error }}</p>
        <div v-if="continueBook" class="continue-card">
          <div><span>继续阅读</span><strong>{{ continueBook.book.title }}</strong><small>{{ continueBook.book.author }} · {{ formatPercent(continueBook.progress?.overallPercent) }}</small></div>
          <button type="button" @click="openBook(continueBook.book)">继续 →</button>
        </div>

        <div class="shelf-controls">
          <input v-model="search" type="search" placeholder="搜索书名或作者">
          <div class="shelf-view-tabs">
            <button :class="{ active: shelfView === 'all' }" type="button" @click="shelfView = 'all'">全部 {{ currentShelfBooks.length }}</button>
            <button :class="{ active: shelfView === 'favorites' }" type="button" @click="shelfView = 'favorites'">收藏 {{ favoriteCount }}</button>
            <button :class="{ active: shelfView === 'recent' }" type="button" @click="shelfView = 'recent'">最近 {{ recentCount }}</button>
          </div>
          <select v-model="shelfSort"><option value="rank">典藏排序</option><option value="title">按书名</option><option value="author">按作者</option><option value="progress">按进度</option></select>
        </div>

        <div v-if="mode === 'remote'" class="subject-filters">
          <button :class="{ active: selectedSubjects.length === 0 }" type="button" @click="selectedSubjects = []">全部分类</button>
          <button v-for="subject in subjectOptions" :key="subject.id" :class="{ active: selectedSubjects.includes(subject.id) }" type="button" @click="toggleSubject(subject.id)">{{ subject.id }} <small>{{ subject.count }}</small></button>
        </div>

        <div v-if="loading" class="reader-state">正在整理书架…</div>
        <div v-else-if="!filteredBooks.length" class="empty-shelf"><strong>{{ mode === 'local' ? '本地书架还是空的' : '没有匹配的图书' }}</strong><p>{{ mode === 'local' ? '导入 EPUB 或单文件 HTML 开始阅读。' : '换个关键词或清除筛选条件。' }}</p></div>
        <div v-else class="book-grid">
          <article v-for="book in visibleBooks" :key="book.key" class="book-card">
            <button class="favorite-button" type="button" :aria-label="`收藏 ${book.title}`" :class="{ active: progressFor(book)?.favorite }" @click.stop="toggleFavorite(book)">♥</button>
            <button class="book-card-main" type="button" @click="openDetail(book)">
              <div class="book-cover"><img v-if="coverUrl(book)" :src="coverUrl(book)" :alt="`${book.title} 封面`" loading="lazy"><span v-else>{{ book.title }}</span><i v-if="progressFor(book)?.overallPercent" :style="{ width: formatPercent(progressFor(book)?.overallPercent) }"></i></div>
              <strong>{{ book.title }}</strong><small>{{ book.author }}</small>
            </button>
            <button v-if="book.origin === 'local'" class="delete-book" type="button" @click="deleteLocalBook(book)">删除</button>
          </article>
        </div>
        <button v-if="visibleCount < filteredBooks.length" class="load-more" type="button" @click="visibleCount += 24">加载更多（{{ visibleCount }} / {{ filteredBooks.length }}）</button>
      </template>
    </template>

    <div v-if="detailBook" class="book-detail-backdrop" @click.self="closeDetail">
      <article class="book-detail-card">
        <button class="detail-close" type="button" aria-label="关闭详情" @click="closeDetail">×</button>
        <div class="detail-cover"><img v-if="coverUrl(detailBook)" :src="coverUrl(detailBook)" :alt="`${detailBook.title} 封面`"><span v-else>{{ detailBook.title }}</span></div>
        <div class="detail-copy">
          <div class="detail-subjects"><span v-for="subject in (detailPackage?.subjects || detailBook.subjects).slice(0, 8)" :key="subject">{{ subject }}</span></div>
          <h2>{{ detailBook.title }}</h2><p class="detail-author">{{ detailBook.author }}</p>
          <p v-if="detailLoading" class="muted">正在读取图书信息…</p>
          <p v-else class="detail-description">{{ detailPackage?.description || '暂无内容简介。' }}</p>
          <dl v-if="detailPackage"><div><dt>语言</dt><dd>{{ detailPackage.language }}</dd></div><div><dt>发布日期</dt><dd>{{ detailPackage.publishedAt || '—' }}</dd></div><div><dt>目录</dt><dd>{{ detailPackage.tocSourceCount || detailPackage.toc.length }} 项<span v-if="detailPackage.tocSourceCount && detailPackage.tocSourceCount !== detailPackage.toc.length"> · {{ detailPackage.toc.length }} 个独立位置</span></dd></div><div><dt>阅读时间</dt><dd>{{ formatReadingTime(progressFor(detailBook)?.timeSpentSeconds) }}</dd></div></dl>
          <div class="detail-actions"><button class="primary" type="button" :disabled="detailLoading || !detailPackage" @click="openBook(detailBook)">{{ progressFor(detailBook)?.lastReadAt ? '继续阅读' : '开始阅读' }}</button><button type="button" @click="toggleFavorite(detailBook)">{{ progressFor(detailBook)?.favorite ? '♥ 已收藏' : '♡ 收藏' }}</button><a v-if="detailBook.webUrl" :href="detailBook.webUrl" target="_blank" rel="noopener noreferrer">Standard Ebooks ↗</a></div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.reader-workspace { min-height: 540px; color: #263544; }
.reader-mode-bar, .shelf-controls, .book-reader-header { display: flex; align-items: center; gap: .65rem; flex-wrap: wrap; }
.reader-mode-bar { justify-content: space-between; margin-bottom: .9rem; }
.mode-tabs { display: flex; padding: .2rem; border-radius: 8px; background: #eef2f6; }
.mode-tabs button, .shelf-view-tabs button, .subject-filters button, .source-picker button, .source-picker select, .shelf-controls select, .import-button, .reader-tool { border: 1px solid transparent; border-radius: 6px; background: transparent; color: #526171; cursor: pointer; font-size: .78rem; }
.mode-tabs button { padding: .42rem .72rem; }
.mode-tabs button.active, .shelf-view-tabs button.active { background: #fff; color: #2476b7; box-shadow: 0 1px 4px #00000013; font-weight: 600; }
.source-picker { display: flex; gap: .4rem; }
.source-picker select, .source-picker button, .shelf-controls select, .import-button { padding: .42rem .6rem; border-color: #d9e1e8; background: #fff; }
.hidden-input { display: none; }
.continue-card { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: .9rem; padding: .85rem 1rem; border: 1px solid #dce9f2; border-radius: 10px; background: linear-gradient(135deg, #f4faff, #fff); }
.continue-card div { display: grid; gap: .14rem; }.continue-card span { color: #2881bd; font-size: .68rem; font-weight: 700; text-transform: uppercase; }.continue-card strong { font-size: .95rem; }.continue-card small { color: #738394; }.continue-card button { padding: .45rem .8rem; border: 0; border-radius: 6px; background: #3498db; color: #fff; cursor: pointer; }
.shelf-controls { margin-bottom: .65rem; }.shelf-controls > input { min-width: 230px; flex: 1; padding: .48rem .65rem; border: 1px solid #d9e1e8; border-radius: 7px; }.shelf-view-tabs { display: flex; padding: .16rem; border-radius: 7px; background: #eef2f6; }.shelf-view-tabs button { padding: .3rem .55rem; }
.subject-filters { display: flex; gap: .32rem; overflow-x: auto; padding: .15rem 0 .8rem; scrollbar-width: thin; }.subject-filters button { flex: 0 0 auto; padding: .26rem .48rem; border-color: #e0e6eb; background: #fff; }.subject-filters button.active { border-color: #80b8df; background: #edf7fd; color: #2476b7; }.subject-filters small { color: #9aa7b4; }
.book-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: .9rem; }.book-card { position: relative; min-width: 0; }.book-card-main { width: 100%; padding: 0; border: 0; background: transparent; text-align: left; cursor: pointer; }.book-cover { position: relative; aspect-ratio: 2 / 3; overflow: hidden; display: flex; align-items: center; justify-content: center; padding: .8rem; border-radius: 7px; background: #e9eef2; color: #526171; text-align: center; box-shadow: 0 3px 10px #1e293b1a; }.book-cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }.book-cover i { position: absolute; bottom: 0; left: 0; height: 4px; background: #3498db; }.book-card-main > strong, .book-card-main > small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.book-card-main > strong { margin-top: .42rem; font-size: .8rem; }.book-card-main > small { margin-top: .12rem; color: #85919d; font-size: .68rem; }.favorite-button { position: absolute; z-index: 2; top: .35rem; right: .35rem; width: 1.8rem; height: 1.8rem; border: 0; border-radius: 50%; background: #ffffffdd; color: #9ca8b4; cursor: pointer; }.favorite-button.active { color: #e05265; }.delete-book { margin-top: .25rem; padding: 0; border: 0; background: transparent; color: #a75c5c; cursor: pointer; font-size: .65rem; }
.load-more { display: block; margin: 1rem auto 0; padding: .48rem 1rem; border: 1px solid #d9e1e8; border-radius: 6px; background: #fff; cursor: pointer; }.reader-state, .empty-shelf { padding: 3rem 1rem; color: #7b8997; text-align: center; }.reader-state.error, .library-error { color: #b84b4b; }.library-error { padding: .55rem .7rem; border: 1px solid #f1caca; border-radius: 6px; background: #fff7f7; font-size: .78rem; }
.library-notice { margin: 0; padding: .55rem .7rem; border: 1px solid #bde7cf; border-radius: 6px; background: #f1fbf5; color: #23754a; font-size: .78rem; }
.temporary-reader-layout { display: grid; grid-template-columns: 280px minmax(0,1fr); gap: 1rem; margin-top: .8rem; }.temporary-reader-layout aside label { display: block; margin-bottom: .4rem; font-weight: 600; }.temporary-reader-layout textarea { width: 100%; padding: .6rem; border: 1px solid #d9e1e8; border-radius: 7px; resize: vertical; }.temporary-reader-layout aside p { color: #84919e; font-size: .7rem; }.temporary-reader-layout main { min-height: 420px; padding: 1.2rem; border: 1px solid #e4e8ec; border-radius: 8px; background: #fff; }
.book-detail-backdrop { position: fixed; z-index: 950; inset: 0; display: grid; place-items: center; padding: 1rem; background: #17212bcc; }.book-detail-card { position: relative; display: grid; grid-template-columns: 220px minmax(0,1fr); gap: 1.4rem; width: min(820px, 96vw); max-height: 88vh; overflow: auto; padding: 1.4rem; border-radius: 12px; background: #fff; }.detail-close { position: absolute; top: .6rem; right: .65rem; border: 0; background: transparent; font-size: 1.4rem; cursor: pointer; }.detail-cover { aspect-ratio: 2/3; overflow: hidden; display: flex; align-items: center; justify-content: center; padding: 1rem; border-radius: 8px; background: #e8edf1; text-align: center; }.detail-cover img { width: 100%; height: 100%; object-fit: cover; }.detail-copy h2 { margin: .45rem 0 .2rem; }.detail-author, .muted { color: #7b8997; }.detail-description { line-height: 1.65; }.detail-subjects { display: flex; flex-wrap: wrap; gap: .3rem; }.detail-subjects span { padding: .14rem .36rem; border-radius: 4px; background: #fef9e7; color: #a56d0b; font-size: .65rem; }.detail-copy dl { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .5rem; }.detail-copy dl div { padding: .45rem; border-radius: 6px; background: #f6f8fa; }.detail-copy dt { color: #8793a0; font-size: .65rem; }.detail-copy dd { margin: .12rem 0 0; font-size: .75rem; }.detail-actions { display: flex; align-items: center; gap: .5rem; margin-top: 1rem; }.detail-actions button, .detail-actions a { padding: .44rem .7rem; border: 1px solid #d8e0e7; border-radius: 6px; background: #fff; color: #526171; text-decoration: none; cursor: pointer; font-size: .75rem; }.detail-actions .primary { border-color: #3498db; background: #3498db; color: #fff; }
.book-reader-header { position: relative; padding: .55rem .65rem; border: 1px solid #dde4e9; border-radius: 9px 9px 0 0; background: #fff; }.reader-tool { padding: .36rem .55rem; border-color: #dce3e8; background: #fff; }.reader-tool[aria-pressed="true"] { border-color: #7eb6dc; background: #eef7fd; color: #2476b7; }.reader-tool.back { color: #2476b7; }.reader-book-title { min-width: 180px; flex: 1; display: grid; }.reader-book-title strong { font-size: .84rem; }.reader-book-title span { color: #84919e; font-size: .66rem; }.reader-progress-summary { display: grid; gap: .12rem; width: 100px; color: #607182; font-size: .64rem; }.reader-progress-summary div { height: 4px; overflow: hidden; border-radius: 2px; background: #e8edf1; }.reader-progress-summary i { display: block; height: 100%; background: #3498db; }.reader-toolbar { display: flex; gap: .35rem; }.reader-annotation-bar { margin: .5rem 0; }
.book-reader-shell { position: relative; height: calc(100vh - 230px); min-height: 520px; border: 1px solid #dde4e9; border-top: 0; background: #f5f0e7; }.book-reader-shell[data-theme="light"] { background: #f5f7f9; }.book-reader-shell[data-theme="dark"] { background: #17212b; }.reader-toc, .reader-settings-drawer { position: absolute; z-index: 5; top: 0; bottom: 0; width: min(320px, 85vw); overflow: auto; padding: .55rem; background: #fff; box-shadow: 5px 0 18px #1f29372b; }.reader-toc { left: 0; }.reader-settings-drawer { right: 0; box-shadow: -5px 0 18px #1f29372b; }.drawer-head { display: flex; align-items: center; justify-content: space-between; padding: .3rem .35rem .55rem; }.drawer-head button { border: 0; background: transparent; font-size: 1.2rem; cursor: pointer; }.toc-item { width: 100%; padding: .38rem .5rem; border: 0; border-radius: 4px; background: transparent; color: #526171; cursor: pointer; font-size: .72rem; text-align: left; }.toc-item:hover, .toc-item.active { background: #edf6fc; color: #2476b7; }.reader-settings-drawer label { display: grid; gap: .28rem; margin: .75rem .35rem; color: #596a79; font-size: .72rem; }.reader-settings-drawer select { padding: .36rem; border: 1px solid #dce3e8; border-radius: 5px; }.reader-toggle-setting { padding-top: .7rem; border-top: 1px solid #e7ebee; }.reader-toggle-setting span { display: flex; align-items: center; gap: .35rem; font-weight: 600; }.reader-toggle-setting small { color: #8a97a4; font-size: .62rem; line-height: 1.45; }.book-reader-scroll { height: 100%; overflow: auto; outline: none; }.book-reader-page { min-height: calc(100% - 3rem); margin: 1.5rem auto; padding: clamp(1.25rem,4vw,3.5rem); background: #fffdf8; color: #292f34; box-shadow: 0 4px 20px #442f1812; box-sizing: border-box; }.book-reader-page[data-font="serif"] { font-family: Georgia, 'Times New Roman', serif; }.book-reader-page[data-font="sans"] { font-family: Arial, sans-serif; }.book-reader-shell[data-theme="dark"] .book-reader-page { background: #202b35; color: #e5e9ed; }.chapter-nav { display: flex; align-items: center; justify-content: space-between; gap: .7rem; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #dfe3e5; }.chapter-nav button { padding: .4rem .65rem; border: 1px solid #d4dce2; border-radius: 5px; background: transparent; color: inherit; cursor: pointer; }.chapter-nav button:disabled { opacity: .4; cursor: default; }.chapter-nav span { color: #85919d; font-size: .7rem; }
@media (max-width: 767.98px) {
  .reader-workspace {
    min-height: calc(100dvh - var(--mobile-appbar-h) - var(--tabbar-h) - 1.5rem);
  }

  .reader-mode-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .mode-tabs {
    width: 100%;
    overflow-x: auto;
    border-radius: 14px;
  }

  .mode-tabs button {
    min-height: 42px;
    flex: 1 0 auto;
  }

  .source-picker,
  .shelf-controls {
    width: 100%;
  }

  .source-picker select,
  .shelf-controls > input {
    min-height: 44px;
    min-width: 0;
  }

  .continue-card {
    border-radius: 16px;
    box-shadow: 0 6px 20px #1f29370d;
  }

  .subject-filters button {
    min-height: 38px;
    border-radius: 999px;
    padding-inline: .7rem;
  }

  .temporary-reader-layout,
  .book-detail-card {
    grid-template-columns: 1fr;
  }

  .book-detail-backdrop {
    align-items: end;
    padding: 0;
  }

  .book-detail-card {
    width: 100%;
    max-height: calc(100dvh - max(12px, env(safe-area-inset-top, 0px)));
    padding: 1rem 1rem 0;
    border-radius: 22px 22px 0 0;
    overscroll-behavior: contain;
  }

  .detail-close {
    z-index: 2;
    top: .5rem;
    right: .5rem;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    background: #f1f5f9;
  }

  .detail-cover {
    width: 120px;
    margin: 0 auto;
  }

  .detail-actions {
    position: sticky;
    bottom: 0;
    z-index: 3;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: .5rem;
    margin: 1rem -1rem 0;
    padding: .7rem 1rem calc(.7rem + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid #e7ebef;
    background: #fff;
    box-shadow: 0 -6px 18px rgb(15 23 42 / 7%);
  }

  .detail-actions button,
  .detail-actions a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .detail-actions > a {
    grid-column: 1 / -1;
  }

  .reader-workspace.is-reading {
    position: fixed;
    inset: 0;
    z-index: 850;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    min-height: 100dvh;
    overflow: hidden;
    background: #fff;
  }

  .book-reader-header {
    min-height: calc(58px + env(safe-area-inset-top, 0px));
    align-items: center;
    flex-wrap: nowrap;
    gap: .4rem;
    padding: env(safe-area-inset-top, 0px) .55rem 0;
    border: 0;
    border-bottom: 1px solid #dde4e9;
    border-radius: 0;
  }

  .reader-tool {
    min-height: 44px;
    border-radius: 11px;
  }

  .reader-tool.back {
    width: 44px;
    overflow: hidden;
    padding: 0;
    color: transparent;
    font-size: 0;
  }

  .reader-tool.back::before {
    content: '‹';
    color: #2476b7;
    font-size: 1.8rem;
  }

  .reader-book-title {
    min-width: 0;
    text-align: center;
  }

  .reader-book-title strong,
  .reader-book-title span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .reader-progress-summary {
    display: none;
  }

  .reader-toolbar {
    gap: .2rem;
  }

  .reader-toolbar .reader-tool {
    width: 44px;
    overflow: hidden;
    padding: 0;
    font-size: 0;
  }

  .reader-toolbar .reader-tool:first-child::before {
    content: '☰';
    font-size: 1.05rem;
  }

  .reader-toolbar .reader-tool:last-child::before {
    content: 'Aa';
    font-size: .8rem;
    font-weight: 700;
  }

  .reader-annotation-bar {
    margin: 0;
    border-radius: 0;
    overflow-x: auto;
  }

  .book-reader-shell {
    height: auto;
    min-height: 0;
    border: 0;
  }

  .book-reader-page {
    min-height: 100%;
    margin: 0;
    padding: 1.25rem 1rem 2rem;
    box-shadow: none;
  }

  .reader-toc,
  .reader-settings-drawer {
    position: absolute;
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    max-height: 80%;
    padding: .75rem .75rem calc(.75rem + env(safe-area-inset-bottom, 0px));
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -12px 36px #1f293738;
  }

  .drawer-head button,
  .toc-item {
    min-height: 44px;
  }

  .book-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem .75rem;
  }
}
</style>
