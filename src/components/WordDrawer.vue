<script setup lang="ts">
/**
 * WordDrawer - 重型大侧栏
 * 使用 Shadow DOM 隔离渲染 Stardict 富文本
 */
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { lookupDetail } from '../lib/lookup-service'

const props = defineProps<{
  word: string
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const loading = ref(false)
const htmlContent = ref('')
const shadowHost = ref<HTMLElement | null>(null)
let shadowRoot: ShadowRoot | null = null

// Shadow DOM 内的样式
const SHADOW_STYLES = `
  <style>
    :host {
      all: initial;
      display: block;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, serif;
      font-size: 15px;
      line-height: 1.7;
      color: #333;
      padding: 1rem;
    }
    .phonetic {
      color: #8e44ad;
      font-size: 1.1em;
      margin-bottom: 0.75rem;
    }
    .definition h4, .translation h4 {
      color: #2c3e50;
      font-size: 0.9em;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 1rem 0 0.4rem;
      padding-bottom: 0.2rem;
      border-bottom: 1px solid #eee;
    }
    .definition ol {
      padding-left: 1.2em;
      margin: 0.3rem 0;
    }
    .definition li {
      color: #2c3e50;
      margin: 0.3rem 0;
    }
    .translation ul {
      padding-left: 1.2em;
      margin: 0.3rem 0;
    }
    .translation li {
      color: #c0392b;
      margin: 0.2rem 0;
    }
    .pos {
      color: #7f8c8d;
      font-style: italic;
      margin-top: 0.5rem;
    }
    .sentence {
      cursor: pointer;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      transition: background 0.15s;
    }
    .sentence:hover {
      background: #ebf5fb;
    }
  </style>
`

watch(() => [props.visible, props.word], async () => {
  if (!props.visible || !props.word) return

  loading.value = true
  htmlContent.value = ''

  const result = await lookupDetail(props.word)
  if (result.htmlContent) {
    htmlContent.value = result.htmlContent
  } else {
    htmlContent.value = '<p style="color:#999">未找到详细释义</p>'
  }
  loading.value = false

  // 渲染到 Shadow DOM
  await nextTick()
  renderShadow()
})

function renderShadow() {
  if (!shadowHost.value) return

  if (!shadowRoot) {
    shadowRoot = shadowHost.value.attachShadow({ mode: 'open' })
  }

  shadowRoot.innerHTML = SHADOW_STYLES + htmlContent.value

  // 为例句绑定点击朗读事件
  const sentences = shadowRoot.querySelectorAll('li, .sentence')
  sentences.forEach(el => {
    el.classList.add('sentence')
    el.addEventListener('click', () => {
      const text = el.textContent || ''
      if (text && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'en-US'
        speechSynthesis.speak(utterance)
      }
    })
  })
}
</script>

<template>
  <Transition name="drawer">
    <div v-if="visible" class="drawer-inline">
      <header class="drawer-header">
        <h3>📋 {{ word }}</h3>
        <button class="close-btn" @click="emit('close')">&times;</button>
      </header>

      <div class="drawer-body">
        <div v-if="loading" class="loading">加载详细释义...</div>
        <div ref="shadowHost" class="shadow-host"></div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-inline {
  margin-top: 1rem;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid #eee;
  background: #fafafa;
}

.drawer-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #2c3e50;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #aaa;
  line-height: 1;
}

.close-btn:hover {
  color: #333;
}

.drawer-body {
  max-height: 500px;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.shadow-host {
  min-height: 100px;
}

.loading {
  padding: 2rem;
  text-align: center;
  color: #999;
}

/* 过渡动画 */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
