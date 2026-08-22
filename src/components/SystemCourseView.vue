<script setup lang="ts">
/**
 * SystemCourseView - 纯粹系统课程阅读组件
 * 布局：
 * 1. 左侧：多邻国风格极简课程单元列表（圆圈序号、标题、简介、词数）
 * 2. 中间：Markdown 深度讲义阅读区（支持点击英文单词即查词典、TTS 发音）
 * 3. 右侧：文章大纲目录（TOC），自动提取 #1, #2 各级标题，支持平滑滚动与联动高亮
 */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import mermaid from 'mermaid'
import { getProgressSetting, setProgressSetting } from '../lib/progress-db'
import { useIsMobile } from '../composables/useMediaQuery'

export interface SystemCourseItem {
  id: number
  slug: string
  title: string
  desc: string
  tag: string
  icon: string
  file: string
  words: string[]
}

export interface TocItem {
  id: string
  text: string
  level: number
}

interface CourseReadingPosition {
  tocId?: string
  tocText?: string
  scrollRatio: number
}

interface CourseViewSetting {
  courseId?: number
  searchQuery?: string
  tag?: string
  readingPositions?: Record<string, CourseReadingPosition>
}

const props = withDefaults(defineProps<{
  active?: boolean
}>(), {
  active: true,
})

const emit = defineEmits<{
  'select-word': [word: string]
  'immersive-change': [active: boolean]
}>()

const isMobile = useIsMobile()
const courses = ref<SystemCourseItem[]>([])
const loading = ref(true)
const manifestError = ref('')
const selectedCourse = ref<SystemCourseItem | null>(null)
const markdownContent = ref('')
const markdownLoading = ref(false)
const markdownError = ref('')
const searchQuery = ref('')
const selectedTag = ref('全部')
const activeTocId = ref('')
const markdownBodyRef = ref<HTMLElement | null>(null)
const tocTriggerRef = ref<HTMLButtonElement | null>(null)
const tocCloseRef = ref<HTMLButtonElement | null>(null)
const mobileScreen = ref<'library' | 'reader'>('library')
const tocSheetOpen = ref(false)
const lastCourseId = ref<number>()
const readingPositions = ref<Record<string, CourseReadingPosition>>({})
let persistTimer: ReturnType<typeof setTimeout> | undefined
let scrollBoundElement: HTMLElement | null = null

const COURSE_HISTORY_KEY = 'lexiCourseLayer'

// 统计
const totalWords = computed(() => courses.value.reduce((s, c) => s + c.words.length, 0))
const courseTags = computed(() => ['全部', ...new Set(courses.value.map(course => course.tag))])
const lastCourse = computed(() => courses.value.find(course => course.id === lastCourseId.value) || null)
const lastReadingPosition = computed(() =>
  lastCourse.value ? readingPositions.value[String(lastCourse.value.id)] : undefined,
)
const selectedCourseIndex = computed(() =>
  selectedCourse.value ? courses.value.findIndex(course => course.id === selectedCourse.value?.id) : -1,
)
const previousCourse = computed(() =>
  selectedCourseIndex.value > 0 ? courses.value[selectedCourseIndex.value - 1] : null,
)
const nextCourse = computed(() =>
  selectedCourseIndex.value >= 0 && selectedCourseIndex.value < courses.value.length - 1
    ? courses.value[selectedCourseIndex.value + 1]
    : null,
)

// 过滤课程
const filteredCourses = computed(() => {
  const tagged = selectedTag.value === '全部'
    ? courses.value
    : courses.value.filter(course => course.tag === selectedTag.value)
  if (!searchQuery.value.trim()) return tagged
  const q = searchQuery.value.toLowerCase()
  return tagged.filter(c =>
    c.title.toLowerCase().includes(q) ||
    c.desc.toLowerCase().includes(q) ||
    c.tag.toLowerCase().includes(q) ||
    c.words.some(w => w.toLowerCase().includes(q))
  )
})

// 按 tag 聚合的二级目录分组（依赖清单 JSON 中同 tag 课程已连续排列）
interface CourseGroup {
  tag: string
  courses: SystemCourseItem[]
}

const groupedCourses = computed<CourseGroup[]>(() => {
  const groups: CourseGroup[] = []
  for (const course of filteredCourses.value) {
    const last = groups[groups.length - 1]
    if (last && last.tag === course.tag) {
      last.courses.push(course)
    } else {
      groups.push({ tag: course.tag, courses: [course] })
    }
  }
  return groups
})

function preprocessMarkdown(text: string): string {
  if (!text) return ''
  return text
    .replace(/\$\\rightarrow\$/g, '→')
    .replace(/\\rightarrow/g, '→')
    .replace(/\$\\to\$/g, '→')
    .replace(/\\to/g, '→')
    .replace(/\$\\leftarrow\$/g, '←')
    .replace(/\\leftarrow/g, '←')
    .replace(/\$\\times\$/g, '×')
    .replace(/\\times/g, '×')
    .replace(/\$\\div\$/g, '÷')
    .replace(/\\div/g, '÷')
    .replace(/\$\\approx\$/g, '≈')
    .replace(/\\approx/g, '≈')
    .replace(/\$([^$\n]+)\$/g, '$1')
}

// 提取文章目录（TOC）
const tocItems = computed<TocItem[]>(() => {
  if (!markdownContent.value) return []
  const lines = markdownContent.value.split('\n')
  const items: TocItem[] = []
  let h2Count = 0
  let h3Count = 0

  lines.forEach((line) => {
    const trimmed = line.trim()
    const h2Match = trimmed.match(/^##\s+(.+)$/)
    const h3Match = trimmed.match(/^###\s+(.+)$/)

    if (h2Match) {
      h2Count++
      h3Count = 0
      const rawText = h2Match[1].replace(/[*_`]/g, '').trim()
      const id = `toc-h2-${h2Count}`
      items.push({
        id,
        text: rawText,
        level: 2,
      })
    } else if (h3Match) {
      h3Count++
      const rawText = h3Match[1].replace(/[*_`]/g, '').trim()
      const id = `toc-h3-${h2Count}-${h3Count}`
      items.push({
        id,
        text: rawText,
        level: 3,
      })
    }
  })

  return items
})

function decodeHtmlEntities(str: string): string {
  if (!str) return ''
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

// 1. 同步计算 HTML
const renderedHtml = computed(() => {
  if (!markdownContent.value) return ''
  const processed = preprocessMarkdown(markdownContent.value)

  let h2Index = 0
  let h3Index = 0

  const renderer = new marked.Renderer()
  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens)
    if (depth === 2) {
      h2Index++
      h3Index = 0
      const id = `toc-h2-${h2Index}`
      return `<h2 id="${id}">${text}</h2>\n`
    } else if (depth === 3) {
      h3Index++
      const id = `toc-h3-${h2Index}-${h3Index}`
      return `<h3 id="${id}">${text}</h3>\n`
    }
    return `<h${depth}>${text}</h${depth}>\n`
  }

  renderer.code = function ({ text, lang }) {
    if (lang === 'mermaid') {
      const raw = decodeHtmlEntities(text)
      return `<pre class="mermaid">${raw}</pre>\n`
    }
    return `<pre><code class="language-${lang}">${text}</code></pre>\n`
  }

  const rawHtml = marked.parse(processed, {
    gfm: true,
    breaks: true,
    renderer,
  }) as string

  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true, svg: true },
  })
})

// 2. Mermaid 全屏放大与缩放控制
const showMermaidModal = ref(false)
const activeMermaidSvg = ref('')
const zoomLevel = ref(1)
const svgBaseWidth = ref(640)
const modalStageRef = ref<HTMLElement | null>(null)

function clampZoom(value: number): number {
  return Math.min(4, Math.max(0.4, +value.toFixed(2)))
}

function fitZoomToViewport() {
  const available = Math.min(window.innerWidth * 0.86, 1400)
  zoomLevel.value = clampZoom(available / svgBaseWidth.value)
}

function openMermaidModal(svg: string) {
  activeMermaidSvg.value = svg
  showMermaidModal.value = true
  // 打开即按视口自适应放大，直接呈现可细看的大图
  void nextTick(() => {
    const svgEl = modalStageRef.value?.querySelector('svg')
    const viewBox = svgEl?.viewBox?.baseVal
    svgBaseWidth.value = viewBox && viewBox.width > 0 ? viewBox.width : 640
    fitZoomToViewport()
  })
}

function closeMermaidModal() {
  showMermaidModal.value = false
  activeMermaidSvg.value = ''
  zoomLevel.value = 1
}

function zoomIn() {
  zoomLevel.value = clampZoom(zoomLevel.value + 0.2)
}

function zoomOut() {
  zoomLevel.value = clampZoom(zoomLevel.value - 0.2)
}

function resetZoom() {
  zoomLevel.value = 1
}

function handleWheelZoom(event: WheelEvent) {
  event.preventDefault()
  if (event.deltaY < 0) {
    zoomIn()
  } else {
    zoomOut()
  }
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (showMermaidModal.value) closeMermaidModal()
  else if (tocSheetOpen.value) closeTocSheet()
}

function historyLayer(): 'reader' | 'toc' | undefined {
  const layer = window.history.state?.[COURSE_HISTORY_KEY]
  return layer === 'reader' || layer === 'toc' ? layer : undefined
}

function replaceHistoryLayer(layer?: 'reader' | 'toc') {
  const state: Record<string, unknown> = { ...(window.history.state || {}) }
  if (layer) state[COURSE_HISTORY_KEY] = layer
  else delete state[COURSE_HISTORY_KEY]
  window.history.replaceState(state, '')
}

function pushHistoryLayer(layer: 'reader' | 'toc') {
  window.history.pushState({ ...(window.history.state || {}), [COURSE_HISTORY_KEY]: layer }, '')
}

function leaveMobileReader(clearHistory = false) {
  tocSheetOpen.value = false
  mobileScreen.value = 'library'
  emit('immersive-change', false)
  document.body.classList.remove('course-sheet-open')
  if (clearHistory && historyLayer()) replaceHistoryLayer()
}

function handlePopState() {
  if (!isMobile.value || !props.active) return
  if (tocSheetOpen.value) {
    tocSheetOpen.value = false
    document.body.classList.remove('course-sheet-open')
    void nextTick(() => tocTriggerRef.value?.focus())
    return
  }
  if (mobileScreen.value === 'reader') leaveMobileReader(false)
}

function goBackToLibrary() {
  if (tocSheetOpen.value) {
    closeTocSheet()
    return
  }
  if (historyLayer() === 'reader') window.history.back()
  else leaveMobileReader(true)
}

function openTocSheet() {
  if (!tocItems.value.length || tocSheetOpen.value) return
  tocSheetOpen.value = true
  document.body.classList.add('course-sheet-open')
  pushHistoryLayer('toc')
  void nextTick(() => tocCloseRef.value?.focus())
}

function closeTocSheet() {
  if (!tocSheetOpen.value) return
  if (historyLayer() === 'toc') window.history.back()
  else {
    tocSheetOpen.value = false
    document.body.classList.remove('course-sheet-open')
    void nextTick(() => tocTriggerRef.value?.focus())
  }
}

// 3. Mermaid 矢量渲染触发器
async function triggerMermaidRun() {
  await nextTick()
  if (!markdownBodyRef.value) return
  const elements = markdownBodyRef.value.querySelectorAll<HTMLElement>('pre.mermaid')
  if (!elements.length) return

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    const rawText = decodeHtmlEntities(el.textContent || '').trim()
    if (!rawText) continue

    const renderId = `mermaid_chart_${Date.now()}_${i}`
    try {
      const { svg } = await mermaid.render(renderId, rawText)
      const container = document.createElement('div')
      container.className = 'mermaid-diagram'
      container.title = '🔍 点击全屏放大查看高清导图'
      container.innerHTML = svg
      container.addEventListener('click', (e) => {
        e.stopPropagation()
        openMermaidModal(svg)
      })
      el.replaceWith(container)
    } catch (e) {
      console.warn('[Mermaid] 图表渲染失败:', e)
    }
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('popstate', handlePopState)
  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'loose',
    fontFamily: 'inherit',
    timeline: {
      useMaxWidth: false,
    },
  })

  try {
    const res = await fetch('/data/system-courses.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    courses.value = await res.json()
    const savedView = await getProgressSetting<CourseViewSetting>(
      'course.view',
      {},
    )
    if (savedView.searchQuery) searchQuery.value = savedView.searchQuery
    if (savedView.tag && courseTags.value.includes(savedView.tag)) selectedTag.value = savedView.tag
    lastCourseId.value = savedView.courseId
    readingPositions.value = savedView.readingPositions || {}

    const initial = courses.value.find(c => c.id === savedView.courseId) || courses.value[0]
    if (initial && !isMobile.value) {
      await selectCourse(initial, true)
    }
  } catch (e) {
    console.error('加载系统课程失败:', e)
    manifestError.value = '课程清单加载失败，请刷新后重试。'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('popstate', handlePopState)
  scrollBoundElement?.removeEventListener('scroll', handleScroll)
  if (persistTimer) window.clearTimeout(persistTimer)
  document.body.classList.remove('course-sheet-open')
  if (historyLayer()) replaceHistoryLayer()
  emit('immersive-change', false)
})

watch([searchQuery, selectedTag], () => {
  void persistView()
})

watch(() => props.active, active => {
  if (!active) {
    leaveMobileReader(true)
    return
  }
  if (isMobile.value) leaveMobileReader(true)
})

watch(isMobile, mobile => {
  if (mobile) {
    leaveMobileReader(true)
    return
  }
  leaveMobileReader(true)
  const initial = courses.value.find(course => course.id === lastCourseId.value) || courses.value[0]
  if (initial && selectedCourse.value?.id !== initial.id) void selectCourse(initial, true)
})

function persistView(): Promise<void> {
  const plainReadingPositions = Object.fromEntries(
    Object.entries(readingPositions.value).map(([courseId, position]) => [
      courseId,
      {
        tocId: position.tocId,
        tocText: position.tocText,
        scrollRatio: position.scrollRatio,
      },
    ]),
  )
  return setProgressSetting('course.view', {
    courseId: lastCourseId.value,
    searchQuery: searchQuery.value,
    tag: selectedTag.value,
    readingPositions: plainReadingPositions,
  })
}

function schedulePersistView() {
  if (persistTimer) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    persistTimer = undefined
    void persistView()
  }, 450)
}

watch(renderedHtml, async () => {
  if (!renderedHtml.value) return
  await nextTick()
  await triggerMermaidRun()
}, { flush: 'post' })

async function selectCourse(course: SystemCourseItem, restorePosition = false) {
  const savedPosition = restorePosition
    ? readingPositions.value[String(course.id)]
    : undefined
  selectedCourse.value = course
  lastCourseId.value = course.id
  markdownLoading.value = true
  markdownError.value = ''
  markdownContent.value = ''
  activeTocId.value = ''
  void persistView()

  try {
    const res = await fetch(course.file)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    markdownContent.value = await res.text()
  } catch (e) {
    console.error('读取课程 Markdown 失败:', e)
    markdownError.value = `未能加载课程讲义（${course.file}）`
  } finally {
    markdownLoading.value = false
  }

  await nextTick()
  bindScrollObserver()
  await triggerMermaidRun()
  if (savedPosition && !markdownError.value) await restoreReadingPosition(savedPosition)
  handleScroll()
}

async function openMobileCourse(course: SystemCourseItem, restorePosition = false, pushHistory = true) {
  mobileScreen.value = 'reader'
  emit('immersive-change', true)
  if (pushHistory) pushHistoryLayer('reader')
  await selectCourse(course, restorePosition)
}

function openLastCourse() {
  if (lastCourse.value) void openMobileCourse(lastCourse.value, true)
}

function openAdjacentCourse(course: SystemCourseItem | null) {
  if (!course) return
  void selectCourse(course, true)
}

async function restoreReadingPosition(position: CourseReadingPosition) {
  await nextTick()
  const container = markdownBodyRef.value
  if (!container || !position) return
  if (position.tocId) {
    const heading = container.querySelector<HTMLElement>(`#${position.tocId}`)
    if (heading) {
      heading.scrollIntoView({ block: 'start' })
      return
    }
  }
  const scrollable = Math.max(0, container.scrollHeight - container.clientHeight)
  container.scrollTop = scrollable * Math.min(1, Math.max(0, position.scrollRatio || 0))
}

function bindScrollObserver() {
  scrollBoundElement?.removeEventListener('scroll', handleScroll)
  scrollBoundElement = markdownBodyRef.value
  scrollBoundElement?.addEventListener('scroll', handleScroll, { passive: true })
}

function handleScroll() {
  if (!markdownBodyRef.value || !selectedCourse.value) return
  const containerTop = markdownBodyRef.value.getBoundingClientRect().top
  const headings = markdownBodyRef.value.querySelectorAll('h2, h3')

  let currentId = ''
  for (const h of Array.from(headings)) {
    const rect = h.getBoundingClientRect()
    if (rect.top - containerTop <= 80) {
      currentId = h.id
    } else {
      break
    }
  }
  if (!currentId && tocItems.value.length) {
    currentId = tocItems.value[0].id
  }
  if (currentId) {
    activeTocId.value = currentId
  }

  const scrollable = Math.max(0, markdownBodyRef.value.scrollHeight - markdownBodyRef.value.clientHeight)
  const currentToc = tocItems.value.find(item => item.id === currentId)
  readingPositions.value = {
    ...readingPositions.value,
    [String(selectedCourse.value.id)]: {
      tocId: currentId || undefined,
      tocText: currentToc?.text,
      scrollRatio: scrollable ? markdownBodyRef.value.scrollTop / scrollable : 0,
    },
  }
  schedulePersistView()
}

function scrollToHeading(id: string) {
  activeTocId.value = id
  if (!markdownBodyRef.value) return
  const el = markdownBodyRef.value.querySelector(`#${id}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function selectTocItem(id: string) {
  scrollToHeading(id)
  if (tocSheetOpen.value) closeTocSheet()
}

function handleContentClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return

  // 1. 点击 <code> 标签触发完整单词或短语发音与查词（如 "a third", "three hundred", "two-thirds"）
  if (target.tagName.toLowerCase() === 'code') {
    const text = target.textContent?.trim() || ''
    // 排除纯音标标记如 /iː/
    if (text.startsWith('/') && text.endsWith('/')) {
      return
    }
    const cleanPhrase = text.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim()
    if (/[a-zA-Z]/.test(cleanPhrase)) {
      event.preventDefault()
      emit('select-word', cleanPhrase.toLowerCase())
      return
    }
  }

  // 2. 划词或选词查词
  const selection = window.getSelection()
  if (selection && selection.toString().trim()) {
    const selectedText = selection.toString().trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
    if (/[a-zA-Z]/.test(selectedText)) {
      emit('select-word', selectedText.toLowerCase())
      return
    }
  }

  // 3. 增强：点击普通文本时通过光标位置智能提取当前英文单词
  if (document.caretRangeFromPoint && target.closest('.markdown-body')) {
    const range = document.caretRangeFromPoint(event.clientX, event.clientY)
    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
      const text = range.startContainer.textContent || ''
      const offset = range.startOffset
      const before = text.slice(0, offset).match(/[a-zA-Z-]+$/)?.[0] || ''
      const after = text.slice(offset).match(/^[a-zA-Z-]+/)?.[0] || ''
      const fullWord = (before + after).replace(/^-+|-+$/g, '')
      if (/^[a-zA-Z]+(-[a-zA-Z]+)*$/.test(fullWord) && fullWord.length >= 1) {
        emit('select-word', fullWord.toLowerCase())
        return
      }
    }
  }
}
</script>

<template>
  <div :class="['system-course-layout', { 'is-mobile-reader': isMobile && mobileScreen === 'reader' }]">
    <template v-if="!isMobile">
      <aside class="duo-menu-sidebar">
        <div class="duo-menu-header">
          <div class="duo-stats" v-if="!loading">
            <span class="stat">{{ courses.length }} 课程</span>
            <span class="stat">{{ totalWords }} 词</span>
          </div>
          <input v-model="searchQuery" type="search" placeholder="搜索课程或单词..." class="duo-search" />
        </div>

        <div v-if="loading" class="sidebar-loading">加载中...</div>
        <div v-else-if="manifestError" class="sidebar-error">{{ manifestError }}</div>
        <div v-else class="unit-list">
          <div v-for="group in groupedCourses" :key="group.tag" class="course-group">
            <div class="group-header">
              <span class="group-name">{{ group.tag }}</span>
              <span class="group-count">{{ group.courses.length }} 门</span>
            </div>
            <button
              v-for="course in group.courses"
              :key="course.id"
              type="button"
              :class="['unit-card', { active: selectedCourse?.id === course.id }]"
              @click="selectCourse(course)"
            >
              <span class="unit-num">{{ course.id }}</span>
              <span class="unit-info">
                <span class="unit-name">{{ course.title }}</span>
                <span class="unit-desc">{{ course.desc }}</span>
              </span>
              <span class="unit-count">{{ course.words.length }} 词</span>
            </button>
          </div>
        </div>
      </aside>

      <main class="course-main-content">
        <template v-if="selectedCourse">
          <header class="main-header">
            <div class="header-badge-row">
              <span class="lesson-badge">Lesson {{ selectedCourse.id }}</span>
              <span class="tag-badge">{{ selectedCourse.tag }}</span>
            </div>
            <h2>{{ selectedCourse.title }}</h2>
          </header>
          <div v-if="markdownLoading" class="content-loading">
            <div class="spinner"></div><span>正在加载讲义正文...</span>
          </div>
          <div v-else-if="markdownError" class="content-error">
            <span>⚠️</span><strong>讲义加载失败</strong><p>{{ markdownError }}</p>
            <button type="button" @click="selectCourse(selectedCourse, true)">重新加载</button>
          </div>
          <article
            v-else
            ref="markdownBodyRef"
            class="markdown-body"
            v-html="renderedHtml"
            @click="handleContentClick"
          ></article>
        </template>
        <div v-else class="no-selection">
          <div class="empty-hint"><span class="hint-icon">📖</span><h3>请选择一门课程开始研读</h3></div>
        </div>
      </main>

      <aside class="toc-sidebar" v-if="selectedCourse && tocItems.length">
        <div class="toc-header"><h4>📑 目录大纲</h4><span class="toc-count">{{ tocItems.length }} 节</span></div>
        <nav class="toc-nav">
          <button
            v-for="item in tocItems"
            :key="item.id"
            :class="['toc-item', `level-${item.level}`, { active: activeTocId === item.id }]"
            @click="scrollToHeading(item.id)"
          ><span class="toc-text">{{ item.text }}</span></button>
        </nav>
      </aside>
    </template>

    <section v-else-if="mobileScreen === 'library'" class="mobile-course-library" aria-label="系统课程库">
      <div v-if="loading" class="mobile-state-card"><div class="spinner"></div><span>正在加载课程...</span></div>
      <div v-else-if="manifestError" class="mobile-state-card is-error"><span>⚠️</span><strong>{{ manifestError }}</strong></div>
      <template v-else>
        <div class="mobile-library-intro">
          <div><span class="eyebrow">SYSTEM COURSES</span><h2>系统课程</h2><p>循序渐进地掌握发音、语法与技术英语</p></div>
          <div class="mobile-library-stats"><strong>{{ courses.length }}</strong><span>课程</span><strong>{{ totalWords }}</strong><span>核心词</span></div>
        </div>

        <button v-if="lastCourse" type="button" class="continue-card" @click="openLastCourse">
          <span class="continue-icon" aria-hidden="true">▶</span>
          <span class="continue-copy"><small>继续学习 · Lesson {{ lastCourse.id }}</small><strong>{{ lastCourse.title }}</strong><span>{{ lastReadingPosition?.tocText || '从上次阅读位置继续' }}</span></span>
          <span class="continue-arrow" aria-hidden="true">›</span>
        </button>

        <div class="mobile-library-controls">
          <label class="mobile-course-search">
            <span aria-hidden="true">⌕</span>
            <input v-model="searchQuery" type="search" placeholder="搜索课程、分类或单词" />
          </label>
          <div class="course-tag-strip" role="group" aria-label="课程分类">
            <button
              v-for="tag in courseTags"
              :key="tag"
              type="button"
              :class="['course-tag-chip', { active: selectedTag === tag }]"
              @click="selectedTag = tag"
            >{{ tag }}</button>
          </div>
        </div>

        <div v-if="groupedCourses.length" class="mobile-course-groups">
          <section v-for="group in groupedCourses" :key="group.tag" class="mobile-course-group">
            <div class="mobile-group-heading"><h3>{{ group.tag }}</h3><span>{{ group.courses.length }} 门</span></div>
            <button
              v-for="course in group.courses"
              :key="course.id"
              type="button"
              class="mobile-course-card"
              @click="openMobileCourse(course, course.id === lastCourseId)"
            >
              <span class="mobile-course-num">{{ String(course.id).padStart(2, '0') }}</span>
              <span class="mobile-course-copy"><strong>{{ course.title }}</strong><span>{{ course.desc }}</span><small>{{ course.words.length }} 个核心词</small></span>
              <span class="mobile-course-arrow" aria-hidden="true">›</span>
            </button>
          </section>
        </div>
        <div v-else class="mobile-empty-result"><span>🔎</span><strong>没有匹配的课程</strong><p>试试其他关键词或切换课程分类。</p></div>
      </template>
    </section>

    <section v-else class="mobile-course-reader" aria-label="课程讲义">
      <header class="mobile-reader-toolbar">
        <button type="button" class="mobile-toolbar-button" aria-label="返回课程库" @click="goBackToLibrary">‹</button>
        <div class="mobile-reader-title"><small>Lesson {{ selectedCourse?.id }}</small><strong>{{ selectedCourse?.title }}</strong></div>
        <button ref="tocTriggerRef" type="button" class="mobile-toolbar-button toc-trigger" aria-label="打开课程目录" :disabled="!tocItems.length" @click="openTocSheet">☷</button>
      </header>

      <main class="course-main-content mobile-reader-content">
        <header v-if="selectedCourse" class="main-header">
          <div class="header-badge-row"><span class="lesson-badge">Lesson {{ selectedCourse.id }}</span><span class="tag-badge">{{ selectedCourse.tag }}</span></div>
          <h2>{{ selectedCourse.title }}</h2>
          <p>{{ selectedCourse.desc }}</p>
        </header>
        <div v-if="markdownLoading" class="content-loading"><div class="spinner"></div><span>正在加载讲义正文...</span></div>
        <div v-else-if="markdownError" class="content-error">
          <span>⚠️</span><strong>讲义加载失败</strong><p>{{ markdownError }}</p>
          <button v-if="selectedCourse" type="button" @click="selectCourse(selectedCourse, true)">重新加载</button>
        </div>
        <article
          v-else
          ref="markdownBodyRef"
          class="markdown-body"
          v-html="renderedHtml"
          @click="handleContentClick"
        ></article>
      </main>

      <nav class="mobile-lesson-nav" aria-label="课程切换">
        <button type="button" :disabled="!previousCourse" @click="openAdjacentCourse(previousCourse)"><span>‹</span><small>上一课</small></button>
        <span class="mobile-lesson-progress">{{ selectedCourse?.id || 0 }} / {{ courses.length }}</span>
        <button type="button" :disabled="!nextCourse" @click="openAdjacentCourse(nextCourse)"><small>下一课</small><span>›</span></button>
      </nav>
    </section>

    <Teleport to="body">
      <Transition name="course-sheet">
        <div v-if="tocSheetOpen" class="course-toc-mask" @click.self="closeTocSheet">
          <section class="course-toc-sheet" role="dialog" aria-modal="true" aria-label="课程目录">
            <div class="course-sheet-handle" aria-hidden="true"></div>
            <header><div><small>Lesson {{ selectedCourse?.id }}</small><h3>目录大纲</h3></div><button ref="tocCloseRef" type="button" aria-label="关闭目录" @click="closeTocSheet">×</button></header>
            <nav class="mobile-toc-nav">
              <button
                v-for="item in tocItems"
                :key="item.id"
                type="button"
                :class="[`level-${item.level}`, { active: activeTocId === item.id }]"
                @click="selectTocItem(item.id)"
              ><span>{{ item.text }}</span><small v-if="activeTocId === item.id">正在阅读</small></button>
            </nav>
          </section>
        </div>
      </Transition>
    </Teleport>

    <!-- 4. 全屏高清 Mermaid 导图预览弹窗 (Lightbox) -->
    <Teleport to="body">
      <div
        v-if="showMermaidModal"
        class="mermaid-modal-overlay"
        @click.self="closeMermaidModal"
        @wheel.prevent="handleWheelZoom"
      >
        <div class="mermaid-modal-toolbar">
          <span class="toolbar-title">🔍 思维导图全屏查看 (滚轮缩放 · 超出可滚动)</span>
          <div class="toolbar-actions">
            <button class="tool-btn" @click="zoomOut" title="缩小 (-)">−</button>
            <span class="zoom-text">{{ Math.round(zoomLevel * 100) }}%</span>
            <button class="tool-btn" @click="zoomIn" title="放大 (+)">+</button>
            <button class="tool-btn" @click="fitZoomToViewport" title="适应窗口">⤢</button>
            <button class="tool-btn" @click="resetZoom" title="原始尺寸 1:1">1:1</button>
            <button class="tool-btn close-btn" @click="closeMermaidModal" title="关闭 (Esc)">✕</button>
          </div>
        </div>
        <div class="mermaid-modal-body" @click.self="closeMermaidModal">
          <div ref="modalStageRef" class="mermaid-zoom-stage">
            <div
              class="mermaid-svg-holder"
              :style="{ width: `${Math.round(svgBaseWidth * zoomLevel)}px` }"
              v-html="activeMermaidSvg"
            ></div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.system-course-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr) 240px;
  gap: 1rem;
  height: calc(100vh - 165px);
  height: calc(100dvh - 165px);
  min-height: 560px;
  align-items: stretch;
}

@media (max-width: 1024px) {
  .system-course-layout {
    grid-template-columns: 280px minmax(0, 1fr);
  }
  .toc-sidebar {
    display: none;
  }
}

@media (max-width: 767.98px) {
  .system-course-layout {
    display: block;
    height: auto;
    min-height: 0;
    width: 100%;
  }

  .system-course-layout.is-mobile-reader {
    position: fixed;
    inset: 0;
    z-index: 850;
    height: 100vh;
    height: 100dvh;
    background: #fff;
  }
}

/* ==================== 1. 左侧多邻国极简菜单 ==================== */
.duo-menu-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  background: #ffffff;
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 0.75rem;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.duo-menu-header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.duo-stats {
  display: flex;
  gap: 0.5rem;
}

.stat {
  font-size: 0.78rem;
  color: #666;
  background: #f0f0f0;
  padding: 0.2rem 0.55rem;
  border-radius: 10px;
}

.duo-search {
  width: 100%;
  padding: 0.45rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.85rem;
  outline: none;
  box-sizing: border-box;
  transition: all 0.15s;
}

.duo-search:focus {
  border-color: #3498db;
  box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.18);
}

.unit-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 2px;
}

.course-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.course-group + .course-group {
  margin-top: 10px;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 2px 0;
}

.group-name {
  font-size: 0.76rem;
  font-weight: 700;
  color: #57606a;
  letter-spacing: 0.02em;
}

.group-count {
  font-size: 0.7rem;
  color: #94a3b8;
  background: #f8fafc;
  padding: 0.05rem 0.4rem;
  border-radius: 8px;
}

.unit-card {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid #eee;
  border-radius: 8px;
  cursor: pointer;
  background: #fff;
  transition: all 0.12s ease-in-out;
  width: 100%;
  color: inherit;
  font: inherit;
  text-align: left;
}

.unit-card:hover {
  border-color: #3498db;
  background: #f4f9fd;
}

.unit-card.active {
  border-color: #3498db;
  background: #ebf5fc;
  box-shadow: 0 0 0 1px #3498db;
}

.unit-num {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3498db;
  color: #fff;
  border-radius: 50%;
  font-size: 0.78rem;
  font-weight: 700;
  flex-shrink: 0;
}

.unit-info {
  display: block;
  flex: 1;
  min-width: 0;
}

.unit-name {
  display: block;
  font-size: 0.88rem;
  font-weight: 600;
  color: #2c3e50;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unit-desc {
  display: block;
  font-size: 0.75rem;
  color: #7f8c8d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

.unit-count {
  font-size: 0.75rem;
  color: #95a5a6;
  white-space: nowrap;
}

/* ==================== 2. 中间讲义主体阅读区 ==================== */
.course-main-content {
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1px solid #eee;
  border-radius: 10px;
  overflow: hidden;
  height: 100%;
  min-width: 0;
}

.main-header {
  padding: 1.1rem 1.5rem;
  border-bottom: 1px solid #eee;
  background: #fafbfc;
}

.header-badge-row {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.35rem;
}

.lesson-badge {
  font-size: 0.72rem;
  font-weight: 700;
  color: #2980b9;
  background: #ebf5fb;
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
}

.tag-badge {
  font-size: 0.72rem;
  color: #57606a;
  background: #f1f2f4;
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
}

.main-header h2 {
  margin: 0;
  font-size: 1.35rem;
  color: #24292f;
}

/* Markdown 排版 */
.markdown-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 2rem;
  line-height: 1.75;
  color: #24292f;
  font-size: 0.96rem;
  scroll-behavior: smooth;
}

.markdown-body :deep(h1) {
  display: none;
}

.markdown-body :deep(h2) {
  font-size: 1.25rem;
  color: #1e293b;
  border-bottom: 2px solid #edf2f7;
  padding-bottom: 0.35rem;
  margin-top: 1.75rem;
  margin-bottom: 0.85rem;
  scroll-margin-top: 10px;
}

.markdown-body :deep(h3) {
  font-size: 1.05rem;
  color: #334155;
  margin-top: 1.25rem;
  margin-bottom: 0.6rem;
  scroll-margin-top: 10px;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1.25rem 0;
  font-size: 0.9rem;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid #e2e8f0;
  padding: 0.65rem 0.9rem;
  text-align: left;
  vertical-align: top;
}

.markdown-body :deep(th) {
  background: #f8fafc;
  font-weight: 600;
  color: #334155;
  white-space: nowrap;
}

/* 仅第一列（类别、音标、法则标签）紧凑不换行 */
.markdown-body :deep(td:nth-child(1)) {
  white-space: nowrap;
  color: #1e293b;
  width: 1%;
}

/* 其余内容列（规律说明、拆解例词、口型动作等）自适应自然换行 */
.markdown-body :deep(td:not(:first-child)) {
  white-space: normal;
  word-break: break-word;
}

.markdown-body :deep(tr:nth-child(even)) {
  background: #fcfdfe;
}

/* 序数词特殊形式与变异高亮样式 */
.markdown-body :deep(code.ord-special) {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
  font-weight: 600;
}

.markdown-body :deep(code.ord-special:hover) {
  background: #fee2e2;
}

.markdown-body :deep(code.ord-variant) {
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fde68a;
  font-weight: 600;
}

.markdown-body :deep(code.ord-variant:hover) {
  background: #fef3c7;
}

.markdown-body :deep(blockquote) {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  color: #334155;
  background: #f0f9ff;
  border-left: 4px solid #0284c7;
  border-radius: 0 6px 6px 0;
}

.markdown-body :deep(code) {
  background: #f1f5f9;
  color: #0969da;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
  cursor: pointer;
  white-space: nowrap; /* 所有的 code 均强制不换行 */
  display: inline-block;
  vertical-align: baseline;
}

.markdown-body :deep(code:hover) {
  background: #dbeafe;
  text-decoration: underline;
}

.markdown-body :deep(pre) {
  background: #1e293b;
  color: #f8fafc;
  padding: 0.85rem 1rem;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.88rem;
}

.markdown-body :deep(pre code) {
  background: none;
  color: inherit;
  padding: 0;
  cursor: default;
  text-decoration: none;
}

/* Mermaid 思维导图卡片 */
.markdown-body :deep(pre.mermaid),
.markdown-body :deep(.mermaid-diagram) {
  position: relative;
  display: flex;
  justify-content: center;
  margin: 1.5rem 0;
  padding: 1.5rem 1.25rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  overflow-x: auto;
  font-family: inherit;
  color: #1e293b;
  cursor: zoom-in;
  transition: all 0.2s ease;
}

.markdown-body :deep(.mermaid-diagram:hover) {
  border-color: #3b82f6;
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.1);
}

.markdown-body :deep(.mermaid-diagram::after) {
  content: '🔍 点击全屏放大';
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 0.72rem;
  color: #64748b;
  background: rgba(248, 250, 252, 0.9);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
  pointer-events: none;
  font-weight: 500;
}

.markdown-body :deep(pre.mermaid svg),
.markdown-body :deep(.mermaid-diagram svg) {
  min-width: 320px;
  max-width: 100%;
  height: auto;
}

/* ==================== 3. 右侧文章大纲目录 (TOC) ==================== */
.toc-sidebar {
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 0.75rem 0.5rem 0.75rem 0.75rem;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.toc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.5rem;
  margin-bottom: 0.4rem;
  border-bottom: 1px solid #edf2f7;
  padding-right: 0.25rem;
}

.toc-header h4 {
  margin: 0;
  font-size: 0.88rem;
  color: #334155;
  font-weight: 700;
}

.toc-count {
  font-size: 0.75rem;
  color: #94a3b8;
  background: #f8fafc;
  padding: 0.1rem 0.4rem;
  border-radius: 8px;
}

.toc-nav {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 4px;
}

.toc-item {
  display: block;
  padding: 0.45rem 0.6rem;
  border: none;
  background: none;
  text-align: left;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.4;
  transition: all 0.15s ease;
  width: 100%;
  border-left: 2px solid transparent;
}

.toc-item:hover {
  background: #f1f5f9;
  color: #1e293b;
}

.toc-item.active {
  background: #ebf5fc;
  color: #2980b9;
  font-weight: 600;
  border-left-color: #3498db;
}

.toc-item.level-2 {
  font-weight: 600;
  color: #334155;
  margin-top: 4px;
}

.toc-item.level-3 {
  padding-left: 1.25rem;
  font-size: 0.78rem;
  color: #64748b;
}

.toc-text {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 加载与空白占位 */
.sidebar-loading,
.sidebar-error,
.content-loading,
.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #94a3b8;
  font-size: 0.88rem;
}

.sidebar-error {
  padding: 1rem;
  color: #b42318;
  text-align: center;
}

.content-error {
  min-height: 240px;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  color: #64748b;
  text-align: center;
}

.content-error > span {
  font-size: 2rem;
}

.content-error strong {
  margin-top: 0.45rem;
  color: #b42318;
}

.content-error p {
  margin: 0.35rem 0 1rem;
  font-size: 0.82rem;
}

.content-error button {
  min-height: 42px;
  padding: 0 1rem;
  border: 0;
  border-radius: 10px;
  background: #3498db;
  color: #fff;
  cursor: pointer;
}

.empty-hint {
  text-align: center;
  max-width: 320px;
}

.hint-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: 0.5rem;
}

.spinner {
  width: 22px;
  height: 22px;
  border: 2px solid #e2e8f0;
  border-top-color: #3498db;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 0.6rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ==================== Mobile app course experience ==================== */
.mobile-course-library,
.mobile-course-reader,
.course-toc-mask {
  display: none;
}

@media (max-width: 767.98px) {
  :global(body.course-sheet-open) {
    overflow: hidden;
  }

  .mobile-course-library,
  .mobile-course-reader,
  .course-toc-mask {
    display: block;
  }

  .mobile-course-library {
    min-height: calc(100dvh - 52px - var(--tabbar-h) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    padding: 1rem 0.9rem 1.5rem;
    background: #f6f8fb;
  }

  .mobile-library-intro {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.45rem 0.15rem 1rem;
  }

  .mobile-library-intro .eyebrow {
    color: #3498db;
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.12em;
  }

  .mobile-library-intro h2 {
    margin: 0.1rem 0 0;
    color: #172033;
    font-size: 1.55rem;
    line-height: 1.2;
  }

  .mobile-library-intro p {
    margin: 0.3rem 0 0;
    color: #7b8797;
    font-size: 0.78rem;
  }

  .mobile-library-stats {
    display: grid;
    grid-template-columns: auto auto;
    align-items: baseline;
    gap: 0 0.3rem;
    flex: none;
    padding: 0.55rem 0.65rem;
    border: 1px solid #e7edf3;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 5px 18px rgba(15, 23, 42, 0.04);
  }

  .mobile-library-stats strong {
    color: #2476b7;
    font-size: 0.9rem;
    text-align: right;
  }

  .mobile-library-stats span {
    color: #94a3b8;
    font-size: 0.62rem;
  }

  .continue-card {
    width: 100%;
    min-height: 92px;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.85rem;
    padding: 0.9rem;
    border: 0;
    border-radius: 18px;
    background: linear-gradient(135deg, #2476b7, #3498db 62%, #59afe4);
    color: #fff;
    text-align: left;
    box-shadow: 0 10px 26px rgba(36, 118, 183, 0.22);
    cursor: pointer;
  }

  .continue-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    flex: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    font-size: 0.8rem;
  }

  .continue-copy {
    min-width: 0;
    display: flex;
    flex: 1;
    flex-direction: column;
  }

  .continue-copy small {
    color: rgba(255, 255, 255, 0.75);
    font-size: 0.65rem;
  }

  .continue-copy strong,
  .continue-copy span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .continue-copy strong {
    margin: 0.1rem 0;
    font-size: 0.95rem;
  }

  .continue-copy span {
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.7rem;
  }

  .continue-arrow,
  .mobile-course-arrow {
    flex: none;
    font-size: 1.6rem;
    line-height: 1;
  }

  .mobile-library-controls {
    position: sticky;
    top: calc(52px + env(safe-area-inset-top, 0px));
    z-index: 20;
    margin: 0 -0.9rem 0.75rem;
    padding: 0.7rem 0.9rem 0.6rem;
    background: rgba(246, 248, 251, 0.95);
    backdrop-filter: blur(12px);
  }

  .mobile-course-search {
    min-height: 46px;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0 0.85rem;
    border: 1px solid #e1e8ef;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 3px 12px rgba(15, 23, 42, 0.04);
  }

  .mobile-course-search > span {
    color: #7b8797;
    font-size: 1.2rem;
  }

  .mobile-course-search input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #172033;
    font: inherit;
    font-size: 0.88rem;
  }

  .course-tag-strip {
    display: flex;
    gap: 0.45rem;
    margin-top: 0.6rem;
    padding-bottom: 2px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .course-tag-strip::-webkit-scrollbar {
    display: none;
  }

  .course-tag-chip {
    min-height: 36px;
    flex: none;
    padding: 0 0.8rem;
    border: 1px solid #dfe6ed;
    border-radius: 999px;
    background: #fff;
    color: #697789;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .course-tag-chip.active {
    border-color: #3498db;
    background: #3498db;
    color: #fff;
    font-weight: 700;
  }

  .mobile-course-groups {
    display: grid;
    gap: 1rem;
  }

  .mobile-course-group {
    display: grid;
    gap: 0.55rem;
  }

  .mobile-group-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.15rem;
  }

  .mobile-group-heading h3 {
    margin: 0;
    color: #344256;
    font-size: 0.85rem;
  }

  .mobile-group-heading span {
    color: #94a3b8;
    font-size: 0.68rem;
  }

  .mobile-course-card {
    width: 100%;
    min-height: 94px;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem;
    border: 1px solid #e5ebf1;
    border-radius: 16px;
    background: #fff;
    color: inherit;
    font: inherit;
    text-align: left;
    box-shadow: 0 5px 18px rgba(15, 23, 42, 0.04);
    cursor: pointer;
  }

  .mobile-course-card:active,
  .continue-card:active {
    transform: scale(0.985);
  }

  .mobile-course-num {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    flex: none;
    border-radius: 14px;
    background: #ebf5fc;
    color: #2476b7;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .mobile-course-copy {
    min-width: 0;
    display: flex;
    flex: 1;
    flex-direction: column;
  }

  .mobile-course-copy strong {
    color: #263447;
    font-size: 0.9rem;
  }

  .mobile-course-copy > span {
    display: -webkit-box;
    margin: 0.18rem 0 0.3rem;
    overflow: hidden;
    color: #7b8797;
    font-size: 0.72rem;
    line-height: 1.4;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .mobile-course-copy small {
    color: #3498db;
    font-size: 0.65rem;
  }

  .mobile-course-arrow {
    color: #a8b2bf;
  }

  .mobile-state-card,
  .mobile-empty-result {
    min-height: 50vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    padding: 2rem;
    color: #7b8797;
    text-align: center;
  }

  .mobile-state-card.is-error strong {
    color: #b42318;
  }

  .mobile-empty-result > span {
    font-size: 2rem;
  }

  .mobile-empty-result strong {
    color: #344256;
  }

  .mobile-empty-result p {
    margin: 0;
    font-size: 0.78rem;
  }

  .mobile-course-reader {
    height: 100vh;
    height: 100dvh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
    background: #fff;
  }

  .mobile-reader-toolbar {
    z-index: 30;
    min-height: calc(56px + env(safe-area-inset-top, 0px));
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    gap: 0.45rem;
    padding: env(safe-area-inset-top, 0px) 0.6rem 0;
    border-bottom: 1px solid #e7ebef;
    background: rgba(255, 255, 255, 0.97);
    box-shadow: 0 1px 10px rgba(15, 23, 42, 0.05);
    backdrop-filter: blur(14px);
  }

  .mobile-toolbar-button {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 12px;
    background: #f1f5f9;
    color: #334155;
    font-size: 1.75rem;
    line-height: 1;
    cursor: pointer;
  }

  .mobile-toolbar-button.toc-trigger {
    font-size: 1.3rem;
  }

  .mobile-toolbar-button:disabled {
    opacity: 0.35;
  }

  .mobile-reader-title {
    min-width: 0;
    display: flex;
    flex-direction: column;
    text-align: center;
    line-height: 1.2;
  }

  .mobile-reader-title small {
    color: #3498db;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .mobile-reader-title strong {
    overflow: hidden;
    color: #263447;
    font-size: 0.88rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-reader-content {
    height: auto;
    min-height: 0;
    border: 0;
    border-radius: 0;
  }

  .mobile-reader-content .main-header {
    flex: none;
    padding: 1.15rem 1rem 0.9rem;
    background: #f8fafc;
  }

  .mobile-reader-content .main-header h2 {
    font-size: 1.25rem;
    line-height: 1.35;
  }

  .mobile-reader-content .main-header p {
    margin: 0.45rem 0 0;
    color: #7b8797;
    font-size: 0.78rem;
    line-height: 1.55;
  }

  .mobile-reader-content .markdown-body {
    min-width: 0;
    padding: 1.1rem 1rem 2rem;
    overflow-x: hidden;
    overflow-y: auto;
    font-size: 1rem;
    line-height: 1.78;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  .mobile-reader-content .markdown-body :deep(h2) {
    margin-top: 1.5rem;
    scroll-margin-top: 12px;
    font-size: 1.22rem;
    line-height: 1.45;
  }

  .mobile-reader-content .markdown-body :deep(h3) {
    font-size: 1.06rem;
    line-height: 1.45;
  }

  .mobile-reader-content .markdown-body :deep(table) {
    width: max-content;
    min-width: 100%;
    max-width: none;
  }

  .mobile-reader-content .markdown-body :deep(table) {
    display: block;
    overflow-x: auto;
    overscroll-behavior-x: contain;
  }

  .mobile-reader-content .markdown-body :deep(pre),
  .mobile-reader-content .markdown-body :deep(.mermaid-diagram) {
    max-width: 100%;
    overflow-x: auto;
  }

  .mobile-reader-content .markdown-body :deep(blockquote) {
    margin-inline: 0;
    padding: 0.8rem 0.85rem;
  }

  .mobile-lesson-nav {
    z-index: 30;
    min-height: calc(58px + env(safe-area-inset-bottom, 0px));
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0.35rem 0.65rem env(safe-area-inset-bottom, 0px);
    border-top: 1px solid #e7ebef;
    background: rgba(255, 255, 255, 0.97);
    box-shadow: 0 -2px 12px rgba(15, 23, 42, 0.06);
    backdrop-filter: blur(14px);
  }

  .mobile-lesson-nav button {
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: #2476b7;
    cursor: pointer;
  }

  .mobile-lesson-nav button:last-child {
    justify-content: flex-end;
  }

  .mobile-lesson-nav button span {
    font-size: 1.45rem;
  }

  .mobile-lesson-nav button small {
    font-size: 0.75rem;
    font-weight: 700;
  }

  .mobile-lesson-nav button:disabled {
    color: #c5ccd5;
    cursor: default;
  }

  .mobile-lesson-progress {
    padding: 0.25rem 0.65rem;
    border-radius: 999px;
    background: #f1f5f9;
    color: #7b8797;
    font-size: 0.68rem;
    font-variant-numeric: tabular-nums;
  }

  .course-toc-mask {
    position: fixed;
    inset: 0;
    z-index: 980;
    background: rgba(15, 23, 42, 0.48);
  }

  .course-toc-sheet {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    max-height: 80vh;
    max-height: 80dvh;
    display: flex;
    flex-direction: column;
    padding: 0.5rem 0.8rem calc(0.8rem + env(safe-area-inset-bottom, 0px));
    border-radius: 22px 22px 0 0;
    background: #fff;
    box-shadow: 0 -16px 42px rgba(15, 23, 42, 0.2);
  }

  .course-sheet-handle {
    width: 38px;
    height: 4px;
    flex: none;
    margin: 0 auto 0.55rem;
    border-radius: 999px;
    background: #d4dbe3;
  }

  .course-toc-sheet > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.25rem 0.25rem 0.65rem;
    border-bottom: 1px solid #edf1f5;
  }

  .course-toc-sheet header small {
    color: #3498db;
    font-size: 0.64rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .course-toc-sheet header h3 {
    margin: 0.05rem 0 0;
    color: #263447;
    font-size: 1.05rem;
  }

  .course-toc-sheet header button {
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 12px;
    background: #f1f5f9;
    color: #64748b;
    font-size: 1.4rem;
    cursor: pointer;
  }

  .mobile-toc-nav {
    min-height: 0;
    overflow-y: auto;
    padding: 0.55rem 0;
  }

  .mobile-toc-nav button {
    width: 100%;
    min-height: 46px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
    padding: 0.65rem 0.75rem;
    border: 0;
    border-left: 3px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: #526171;
    font: inherit;
    font-size: 0.82rem;
    line-height: 1.4;
    text-align: left;
    cursor: pointer;
  }

  .mobile-toc-nav button.level-2 {
    color: #344256;
    font-weight: 700;
  }

  .mobile-toc-nav button.level-3 {
    padding-left: 1.35rem;
  }

  .mobile-toc-nav button.active {
    border-left-color: #3498db;
    background: #ebf5fc;
    color: #2476b7;
  }

  .mobile-toc-nav button small {
    flex: none;
    color: #3498db;
    font-size: 0.6rem;
  }

  .course-sheet-enter-active,
  .course-sheet-leave-active {
    transition: opacity 0.2s ease;
  }

  .course-sheet-enter-active .course-toc-sheet,
  .course-sheet-leave-active .course-toc-sheet {
    transition: transform 0.28s cubic-bezier(0.32, 0.72, 0.24, 1);
  }

  .course-sheet-enter-from,
  .course-sheet-leave-to {
    opacity: 0;
  }

  .course-sheet-enter-from .course-toc-sheet,
  .course-sheet-leave-to .course-toc-sheet {
    transform: translateY(100%);
  }
}

/* ==================== 4. Mermaid 全屏高清灯箱 Modal ==================== */
.mermaid-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  background: rgba(15, 23, 42, 0.78);
  backdrop-filter: blur(6px);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem;
  box-sizing: border-box;
}

.mermaid-modal-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 960px;
  background: #ffffff;
  padding: 0.6rem 1.2rem;
  border-radius: 30px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  z-index: 10000;
}

.toolbar-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: #334155;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tool-btn {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  min-width: 32px;
  height: 32px;
  font-size: 0.95rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  padding: 0 0.5rem;
}

.tool-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.tool-btn.close-btn {
  background: #fee2e2;
  color: #dc2626;
  border-color: #fecaca;
  margin-left: 0.5rem;
}

.tool-btn.close-btn:hover {
  background: #fecaca;
}

.zoom-text {
  font-size: 0.82rem;
  font-weight: 600;
  color: #64748b;
  min-width: 48px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.mermaid-modal-body {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 1rem;
  box-sizing: border-box;
}

.mermaid-zoom-stage {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  background: #ffffff;
  padding: 2rem;
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
  max-width: 90vw;
  max-height: 80vh;
  overflow: auto;
}

.mermaid-svg-holder {
  margin: 0 auto;
  transition: width 0.15s cubic-bezier(0.2, 0, 0, 1);
}

.mermaid-svg-holder :deep(svg) {
  width: 100%;
  height: auto;
  display: block;
}

@media (max-width: 767.98px) {
  .mermaid-modal-overlay {
    padding: 0.5rem;
  }

  .mermaid-modal-toolbar {
    max-width: 100%;
    border-radius: 12px;
    padding: 0.4rem 0.6rem;
    justify-content: center;
  }

  .toolbar-title {
    display: none;
  }

  .tool-btn {
    min-width: 36px;
    height: 36px;
  }

  .mermaid-modal-body {
    padding: 0.5rem;
  }

  .mermaid-zoom-stage {
    max-width: 100%;
    max-height: calc(100vh - 80px);
    padding: 0.75rem;
    border-radius: 12px;
  }
}
</style>
