<script setup lang="ts">
/**
 * ReaderView - <ruby> 双行渲染核心
 * 将输入文本解析为带注音标注的交互式阅读视图
 * 支持段落级 TTS 朗读 + 逐词高亮
 */
import { computed, ref, onBeforeUnmount } from 'vue'
import { useDictStore } from '../stores/dict'
import { detectInputType, markdownToHtml, annotateHtml } from '../lib/tokenizer'
import { htmlToPlainText, sanitizeReaderHtml } from '../lib/reader-sanitize'
import { highlightReaderWordAtBoundary } from '../lib/reader-tts-highlight'
import { useTTS } from '../composables/useTTS'
import FollowReadPanel from './FollowReadPanel.vue'

const props = withDefaults(defineProps<{
  text: string
  html?: string
  followText?: string
  active?: boolean
  annotationsEnabled?: boolean
  basicFunctionWordsEnabled?: boolean
  showFollow?: boolean
}>(), {
  active: true,
  html: '',
  followText: '',
  annotationsEnabled: true,
  basicFunctionWordsEnabled: false,
  showFollow: true,
})

const emit = defineEmits<{
  'word-click': [payload: { word: string; x: number; y: number }]
  'recording-change': [recording: boolean]
  'link-click': [href: string]
}>()

const dictStore = useDictStore()
const readerRef = ref<HTMLElement | null>(null)
const { speak, stop, pause, resume, speaking, paused } = useTTS()
const readingParagraph = ref<number>(-1)
const followRecording = ref(false)

// 计算标注后的 HTML
const annotatedHtml = computed(() => {
  if (!dictStore.ready || (!props.text.trim() && !props.html.trim())) return ''

  const inputType = detectInputType(props.text)
  let html: string

  if (props.html.trim()) {
    html = props.html
  } else if (inputType === 'markdown') {
    html = markdownToHtml(props.text)
  } else if (inputType === 'html') {
    html = props.text
  } else {
    // 纯文本：按段落分割
    html = props.text
      .split(/\n\n+/)
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('')
  }

  const safeHtml = sanitizeReaderHtml(html)
  const annotated = annotateHtml(safeHtml, (word) => (
    props.annotationsEnabled
      ? dictStore.getAnnotation(word, { includeBasicFunctionWords: props.basicFunctionWordsEnabled })
      : null
  ))
  const doc = new DOMParser().parseFromString(annotated, 'text/html')
  doc.body.querySelectorAll('p').forEach((paragraph, index) => {
    if (!paragraph.textContent?.trim()) return
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'read-paragraph-btn'
    button.dataset.pidx = String(index)
    button.setAttribute('aria-label', `朗读第 ${index + 1} 段`)
    button.textContent = '🔊'
    paragraph.prepend(button)
  })
  return doc.body.innerHTML
})

const effectiveFollowText = computed(() => (
  props.followText.trim() || (props.html ? htmlToPlainText(props.html) : props.text)
))

// 点击事件代理
function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement

  // 检查是否点击了朗读按钮
  const readBtn = target.closest('.read-paragraph-btn') as HTMLElement | null
  if (readBtn) {
    const pIdx = parseInt(readBtn.dataset.pidx || '-1')
    readParagraph(pIdx)
    return
  }

  const anchor = target.closest('a[href]') as HTMLAnchorElement | null
  if (anchor) {
    e.preventDefault()
    emit('link-click', anchor.getAttribute('href') || '')
    return
  }

  // 查找最近的带 data-word 的元素
  const wordEl = target.closest('[data-word]') as HTMLElement | null
  if (wordEl) {
    const word = wordEl.dataset.word!
    emit('word-click', {
      word,
      x: e.clientX,
      y: e.clientY,
    })
  }
}

// 提取英文文本（排除 <rt> 中文注音）
function getEnglishText(el: Element): string {
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll('rt').forEach(rt => rt.remove())
  clone.querySelectorAll('.read-paragraph-btn').forEach(button => button.remove())
  return clone.textContent || ''
}

// 段落朗读
function readParagraph(pIdx: number) {
  if (!readerRef.value || followRecording.value) return

  if (readingParagraph.value === pIdx && paused.value) {
    resume()
    syncParagraphButtons()
    return
  }

  if (readingParagraph.value === pIdx && speaking.value) {
    pause()
    syncParagraphButtons()
    return
  }

  const paragraphs = readerRef.value.querySelectorAll('p')
  if (pIdx < 0 || pIdx >= paragraphs.length) return

  const p = paragraphs[pIdx]
  const text = getEnglishText(p)
  if (!text.trim()) return

  readingParagraph.value = pIdx
  clearHighlights()

  speak(text, (charIndex, charLength) => {
    // 逐词高亮
    clearHighlights()
    highlightWordAt(p, charIndex, charLength)
  }, () => {
    readingParagraph.value = -1
    clearHighlights()
    syncParagraphButtons()
  })
  syncParagraphButtons()
}

function syncParagraphButtons(): void {
  if (!readerRef.value) return
  readerRef.value.querySelectorAll<HTMLButtonElement>('.read-paragraph-btn').forEach((button, index) => {
    const isCurrent = index === readingParagraph.value
    button.classList.toggle('is-playing', isCurrent)
    button.classList.toggle('is-paused', isCurrent && paused.value)
    button.setAttribute('aria-pressed', String(isCurrent && paused.value))
    if (!isCurrent) {
      button.textContent = '🔊'
      button.setAttribute('aria-label', `朗读第 ${index + 1} 段`)
    } else if (paused.value) {
      button.textContent = '▶'
      button.setAttribute('aria-label', `继续朗读第 ${index + 1} 段`)
    } else {
      button.textContent = '⏸'
      button.setAttribute('aria-label', `暂停朗读第 ${index + 1} 段`)
    }
  })
}

function highlightWordAt(container: Element, charIndex: number, charLength: number) {
  highlightReaderWordAtBoundary(container, charIndex, charLength)
}

function clearHighlights() {
  if (!readerRef.value) return
  readerRef.value.querySelectorAll('.tts-highlight').forEach(el => {
    el.classList.remove('tts-highlight')
  })
}

// 段落数量（用于渲染朗读按钮）
const paragraphCount = computed(() => {
  if (!readerRef.value) return 0
  return readerRef.value.querySelectorAll('p').length
})

// 朗读全文
function readAll() {
  if (!readerRef.value || followRecording.value) return

  if (speaking.value) {
    stop()
    readingParagraph.value = -1
    clearHighlights()
    return
  }

  const text = getEnglishText(readerRef.value)
  if (!text.trim()) return

  readingParagraph.value = -1
  clearHighlights()

  speak(text, (charIndex, charLength) => {
    clearHighlights()
    highlightWordInAll(charIndex)
  })
}

function handleFollowStart(): void {
  stop()
  readingParagraph.value = -1
  clearHighlights()
}

function handleFollowRecordingChange(recording: boolean): void {
  followRecording.value = recording
  emit('recording-change', recording)
}

function highlightWordInAll(charIndex: number) {
  if (!readerRef.value) return
  highlightReaderWordAtBoundary(readerRef.value, charIndex)
}

onBeforeUnmount(() => {
  stop()
})
</script>

<template>
  <div class="reader-wrapper">
    <div
      ref="readerRef"
      class="reader-view"
      @click="handleClick"
      v-html="annotatedHtml"
    />
    <FollowReadPanel
      v-if="showFollow"
      class="reader-follow"
      :target-text="effectiveFollowText"
      :active="active"
      :disabled="!annotatedHtml"
      :system-disabled="!annotatedHtml"
      :system-label="speaking ? '⏹ 停止朗读' : '🔊 朗读全文'"
      @system-read="readAll"
      @recording-start="handleFollowStart"
      @recording-change="handleFollowRecordingChange"
    />
  </div>
</template>

<style scoped>
.reader-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.reader-follow {
  width: 100%;
}

.reader-view {
  font-size: 1.1rem;
  line-height: 2.2;
  letter-spacing: 0.02em;
}

.reader-view :deep(ruby) {
  cursor: pointer;
  padding: 0 1px;
  border-radius: 3px;
  transition: background 0.15s;
}

.reader-view :deep(ruby:hover) {
  background: #ebf5fb;
}

.reader-view :deep(ruby[data-annotation-kind='tag'] rt) {
  display: inline-block;
  padding: 0.05rem 0.25rem;
  border: 1px solid #eab308;
  border-radius: 4px;
  background: #fef3c7;
  color: #854d0e;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.64em;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: 0.02em;
}

.reader-view :deep(.word-plain) {
  cursor: pointer;
  border-radius: 3px;
  transition: background 0.15s;
}

.reader-view :deep(.word-plain:hover) {
  background: #f0f0f0;
}

.reader-view :deep(p) {
  margin: 0.8em 0;
  position: relative;
}

.reader-view :deep(.read-paragraph-btn) {
  float: left;
  margin: 0.38rem 0.45rem 0 0;
  padding: 0.1rem 0.25rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.72rem;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}

.reader-view :deep(p:hover .read-paragraph-btn),
.reader-view :deep(.read-paragraph-btn:focus-visible),
.reader-view :deep(.read-paragraph-btn.is-playing) {
  opacity: 1;
}

.reader-view :deep(.read-paragraph-btn:hover) {
  background: #eef6fc;
}

.reader-view :deep(.read-paragraph-btn.is-playing) {
  background: #eef6fc;
  color: #2476b7;
}

/* TTS 高亮 */
.reader-view :deep(.tts-highlight) {
  background: #ffeaa7 !important;
  border-radius: 3px;
  box-shadow: 0 0 0 2px #ffeaa7;
}
</style>
