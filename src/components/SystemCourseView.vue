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

const emit = defineEmits<{
  'select-word': [word: string]
}>()

const courses = ref<SystemCourseItem[]>([])
const loading = ref(true)
const selectedCourse = ref<SystemCourseItem | null>(null)
const markdownContent = ref('')
const markdownLoading = ref(false)
const searchQuery = ref('')
const activeTocId = ref('')
const markdownBodyRef = ref<HTMLElement | null>(null)

// 统计
const totalWords = computed(() => courses.value.reduce((s, c) => s + c.words.length, 0))

// 过滤课程
const filteredCourses = computed(() => {
  if (!searchQuery.value.trim()) return courses.value
  const q = searchQuery.value.toLowerCase()
  return courses.value.filter(c =>
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
  if (event.key === 'Escape' && showMermaidModal.value) {
    closeMermaidModal()
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
    courses.value = await res.json()
    const savedView = await getProgressSetting<{ courseId?: number; searchQuery?: string }>(
      'course.view',
      {},
    )
    if (savedView.searchQuery) searchQuery.value = savedView.searchQuery

    const initial = courses.value.find(c => c.id === savedView.courseId) || courses.value[0]
    if (initial) {
      await selectCourse(initial)
    }
  } catch (e) {
    console.error('加载系统课程失败:', e)
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
  if (markdownBodyRef.value) {
    markdownBodyRef.value.removeEventListener('scroll', handleScroll)
  }
})

watch(searchQuery, () => {
  void persistView()
})

function persistView(): Promise<void> {
  return setProgressSetting('course.view', {
    courseId: selectedCourse.value?.id,
    searchQuery: searchQuery.value,
  })
}

watch(renderedHtml, async () => {
  if (!renderedHtml.value) return
  await nextTick()
  await triggerMermaidRun()
}, { flush: 'post' })

async function selectCourse(course: SystemCourseItem) {
  selectedCourse.value = course
  markdownLoading.value = true
  markdownContent.value = ''
  activeTocId.value = ''
  void persistView()

  try {
    const res = await fetch(course.file)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    markdownContent.value = await res.text()
  } catch (e) {
    console.error('读取课程 Markdown 失败:', e)
    markdownContent.value = `> ⚠️ **加载失败**：未能成功加载课程讲义文件 (${course.file})。`
  } finally {
    markdownLoading.value = false
  }

  await nextTick()
  bindScrollObserver()
  await triggerMermaidRun()
}

function bindScrollObserver() {
  if (markdownBodyRef.value) {
    markdownBodyRef.value.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
  }
}

function handleScroll() {
  if (!markdownBodyRef.value || !tocItems.value.length) return
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
}

function scrollToHeading(id: string) {
  activeTocId.value = id
  if (!markdownBodyRef.value) return
  const el = markdownBodyRef.value.querySelector(`#${id}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
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
  <div class="system-course-layout">
    <!-- 1. 左侧：多邻国同款简洁课程列表 -->
    <aside class="duo-menu-sidebar">
      <div class="duo-menu-header">
        <div class="duo-stats" v-if="!loading">
          <span class="stat">{{ courses.length }} 课程</span>
          <span class="stat">{{ totalWords }} 词</span>
        </div>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索课程或单词..."
          class="duo-search"
        />
      </div>

      <div v-if="loading" class="sidebar-loading">加载中...</div>

      <div v-else class="unit-list">
        <div v-for="group in groupedCourses" :key="group.tag" class="course-group">
          <div class="group-header">
            <span class="group-name">{{ group.tag }}</span>
            <span class="group-count">{{ group.courses.length }} 门</span>
          </div>
          <div
            v-for="course in group.courses"
            :key="course.id"
            :class="['unit-card', { active: selectedCourse?.id === course.id }]"
            @click="selectCourse(course)"
          >
            <div class="unit-num">{{ course.id }}</div>
            <div class="unit-info">
              <div class="unit-name">{{ course.title }}</div>
              <div class="unit-desc">{{ course.desc }}</div>
            </div>
            <div class="unit-count">
              {{ course.words.length }} 词
            </div>
          </div>
        </div>
      </div>
    </aside>

    <!-- 2. 中间：Markdown 正文阅读区 -->
    <main class="course-main-content">
      <template v-if="selectedCourse">
        <!-- 课程顶栏 -->
        <header class="main-header">
          <div class="header-badge-row">
            <span class="lesson-badge">Lesson {{ selectedCourse.id }}</span>
            <span class="tag-badge">{{ selectedCourse.tag }}</span>
          </div>
          <h2>{{ selectedCourse.title }}</h2>
        </header>

        <!-- 讲义 Markdown 正文 -->
        <div v-if="markdownLoading" class="content-loading">
          <div class="spinner"></div>
          <span>正在加载讲义正文...</span>
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
        <div class="empty-hint">
          <span class="hint-icon">📖</span>
          <h3>请在左侧选择一门课程开始研读</h3>
          <p>纯粹 Markdown 系统讲义，配合右侧目录直达各章要点。</p>
        </div>
      </div>
    </main>

    <!-- 3. 右侧：文章目录大纲（标题目录） -->
    <aside class="toc-sidebar" v-if="selectedCourse && tocItems.length">
      <div class="toc-header">
        <h4>📑 目录大纲</h4>
        <span class="toc-count">{{ tocItems.length }} 节</span>
      </div>
      <nav class="toc-nav">
        <button
          v-for="item in tocItems"
          :key="item.id"
          :class="[
            'toc-item',
            `level-${item.level}`,
            { active: activeTocId === item.id }
          ]"
          @click="scrollToHeading(item.id)"
        >
          <span class="toc-text">{{ item.text }}</span>
        </button>
      </nav>
    </aside>

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
  min-height: 560px;
  align-items: stretch;
}

@media (max-width: 1100px) {
  .system-course-layout {
    grid-template-columns: 280px minmax(0, 1fr);
  }
  .toc-sidebar {
    display: none;
  }
}

@media (max-width: 768px) {
  .system-course-layout {
    display: flex;
    flex-direction: column;
    height: auto;
    min-height: 0;
  }

  .duo-menu-sidebar {
    height: auto;
    max-height: 42vh;
  }

  .course-main-content {
    height: auto;
    min-height: 60vh;
  }

  .main-header {
    padding: 0.8rem 1rem;
  }

  .main-header h2 {
    font-size: 1.1rem;
  }

  .markdown-body {
    padding: 1rem;
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
  flex: 1;
  min-width: 0;
}

.unit-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: #2c3e50;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unit-desc {
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
.content-loading,
.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #94a3b8;
  font-size: 0.88rem;
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

/* ==================== 4. Mermaid 全屏高清灯箱 Modal ==================== */
.mermaid-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
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

@media (max-width: 768px) {
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
