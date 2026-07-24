<script setup lang="ts">
/**
 * ReaderView - <ruby> 双行渲染核心
 * 将输入文本解析为带注音标注的交互式阅读视图
 * 支持段落级 TTS 朗读 + 逐词高亮
 */
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useDictStore } from '../stores/dict'
import { detectInputType, markdownToHtml, annotateHtml } from '../lib/tokenizer'
import { useTTS } from '../composables/useTTS'

const props = defineProps<{
  text: string
  difficulty: string
}>()

const emit = defineEmits<{
  'word-click': [payload: { word: string; x: number; y: number }]
}>()

const dictStore = useDictStore()
const readerRef = ref<HTMLElement | null>(null)
const { speak, stop, speaking } = useTTS()
const readingParagraph = ref<number>(-1)

// 计算标注后的 HTML
const annotatedHtml = computed(() => {
  if (!dictStore.ready || !props.text.trim()) return ''

  const inputType = detectInputType(props.text)
  let html: string

  if (inputType === 'markdown') {
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

  // 使用 dictStore 的 getAnnotation 进行标注
  return annotateHtml(html, (word) => dictStore.getAnnotation(word))
})

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
  return clone.textContent || ''
}

// 段落朗读
function readParagraph(pIdx: number) {
  if (!readerRef.value) return

  if (speaking.value && readingParagraph.value === pIdx) {
    stop()
    readingParagraph.value = -1
    clearHighlights()
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
  })
}

function highlightWordAt(container: Element, charIndex: number, charLength: number) {
  // 遍历文本节点（跳过 <rt> 内的中文）找到对应位置的单词
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // 跳过 <rt> 内的文本节点
      if (node.parentElement?.tagName === 'RT') return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })
  let offset = 0

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const nodeLen = node.textContent?.length || 0

    if (offset + nodeLen > charIndex) {
      const parent = node.parentElement
      if (parent && (parent.tagName === 'RUBY' || parent.classList.contains('word-plain'))) {
        parent.classList.add('tts-highlight')
      }
      break
    }
    offset += nodeLen
  }
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
  if (!readerRef.value) return

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

function highlightWordInAll(charIndex: number) {
  if (!readerRef.value) return
  const walker = document.createTreeWalker(readerRef.value, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.tagName === 'RT') return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })
  let offset = 0

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const nodeLen = node.textContent?.length || 0

    if (offset + nodeLen > charIndex) {
      const parent = node.parentElement
      if (parent && (parent.tagName === 'RUBY' || parent.classList.contains('word-plain'))) {
        parent.classList.add('tts-highlight')
      }
      break
    }
    offset += nodeLen
  }
}

onBeforeUnmount(() => {
  stop()
})
</script>

<template>
  <div class="reader-wrapper">
    <div class="reader-toolbar">
      <button class="read-all-btn" @click="readAll" :disabled="!annotatedHtml">
        {{ speaking ? '⏹ 停止朗读' : '🔊 朗读全文' }}
      </button>
    </div>
    <div
      ref="readerRef"
      class="reader-view"
      @click="handleClick"
      v-html="annotatedHtml"
    />
  </div>
</template>

<style scoped>
.reader-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.reader-toolbar {
  display: flex;
  gap: 0.5rem;
}

.read-all-btn {
  padding: 0.3rem 0.8rem;
  border: 1px solid #27ae60;
  background: none;
  color: #27ae60;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.15s;
}

.read-all-btn:hover:not(:disabled) {
  background: #27ae60;
  color: #fff;
}

.read-all-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

/* TTS 高亮 */
.reader-view :deep(.tts-highlight) {
  background: #ffeaa7 !important;
  border-radius: 3px;
  box-shadow: 0 0 0 2px #ffeaa7;
}
</style>
