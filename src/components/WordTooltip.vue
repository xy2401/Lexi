<script setup lang="ts">
/**
 * WordTooltip - 完整词条卡片
 * 同时展示音标、中文翻译、英文释义、词性和词形变化
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { parseExchange, EXCHANGE_LABELS } from '../lib/morphology'
import type { WordEntry } from '../lib/db'
import { MOBILE_QUERY } from '../composables/useMediaQuery'
import DictionaryTags from './DictionaryTags.vue'

const props = defineProps<{
  word: string
  data: WordEntry | null
  position: { x: number; y: number }
  loading?: boolean
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  speak: [word: string]
}>()

const mobileQuery = window.matchMedia(MOBILE_QUERY)
const isMobile = ref(mobileQuery.matches)
const onMqChange = (event: MediaQueryListEvent) => { isMobile.value = event.matches }
onMounted(() => mobileQuery.addEventListener('change', onMqChange))
onBeforeUnmount(() => mobileQuery.removeEventListener('change', onMqChange))

watch(() => props.visible && isMobile.value, locked => {
  document.body.style.overflow = locked ? 'hidden' : ''
})

// 解析变形数据
const forms = computed(() => {
  if (!props.data?.exchange) return []
  const parsed = parseExchange(props.data.exchange)
  return Object.entries(parsed)
    .filter(([key]) => key in EXCHANGE_LABELS && key !== '0' && key !== '1')
    .map(([key, value]) => ({
      label: EXCHANGE_LABELS[key] || key,
      value,
    }))
})

// 翻译行
const translations = computed(() => {
  if (!props.data?.translation) return []
  return props.data.translation.split('\\n').filter(t => t.trim()).slice(0, 4)
})

const definitions = computed(() => {
  if (!props.data?.definition) return []
  return props.data.definition.split(/\\n|\n/).filter(line => line.trim())
})

// 定位样式：移动端为底部 sheet（CSS 定位），桌面端浮动并双向钳制
const tooltipStyle = computed(() => {
  if (isMobile.value) return {}
  const x = Math.max(8, Math.min(props.position.x, window.innerWidth - 408))
  const cardHeight = Math.min(560, window.innerHeight - 24)
  const y = Math.max(8, Math.min(props.position.y + 12, window.innerHeight - cardHeight - 8))
  return { left: `${x}px`, top: `${y}px` }
})
</script>

<template>
  <Teleport to="body">
    <Transition :name="isMobile ? 'sheet-up' : 'card-pop'">
      <div v-if="visible" :class="['tooltip-overlay', { 'is-mobile': isMobile }]" @click.self="emit('close')">
        <div :class="['tooltip-card', { 'tooltip-sheet': isMobile }]" :style="tooltipStyle">
        <div class="tooltip-header">
          <div
            class="word-speech-row"
            role="button"
            tabindex="0"
            :aria-label="`朗读 ${word}`"
            @click="emit('speak', word)"
            @keydown.enter="emit('speak', word)"
            @keydown.space.prevent="emit('speak', word)"
          >
            <span class="word">{{ word }}</span>
            <span class="speaker-icon" aria-hidden="true">🔊</span>
            <span class="phonetic" v-if="data?.phonetic">/{{ data.phonetic }}/</span>
          </div>
          <button class="close-btn" aria-label="关闭词条" @click.stop="emit('close')">&times;</button>
        </div>

        <!-- 加载中 (无任何基础数据) -->
        <div class="tooltip-body" v-if="loading && !data">
          <p class="loading-text">查询中...</p>
        </div>

        <div class="tooltip-body" v-else-if="data">
          <!-- 简明翻译 -->
          <div class="section translations" v-if="translations.length">
            <p v-for="(t, i) in translations" :key="i">{{ t }}</p>
          </div>

          <!-- 同一词条中的英文释义 -->
          <div class="section definitions" v-if="definitions.length">
            <h4>Definition</h4>
            <ol>
              <li v-for="(definition, i) in definitions" :key="i">{{ definition }}</li>
            </ol>
          </div>

          <p class="section pos" v-if="data.pos">{{ data.pos }}</p>

          <!-- 静默补全中提示 -->
          <div class="enriching-hint" v-if="loading && data.cacheLevel === 'hot'">
            <span class="pulse-dot"></span> 完整释义加载中...
          </div>

          <!-- 时态变形 -->
          <div class="section forms" v-if="forms.length">
            <span class="form-tag" v-for="f in forms" :key="f.label">
              {{ f.label }}: {{ f.value }}
            </span>
          </div>

          <!-- 标签 -->
          <DictionaryTags class="section" v-if="data.tags" :tags="data.tags" />
        </div>

        <div class="tooltip-body" v-else>
          <p class="not-found">未找到该词条</p>
        </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tooltip-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
}

.tooltip-card {
  position: fixed;
  width: 380px;
  max-width: calc(100vw - 16px);
  max-height: min(560px, calc(100vh - 24px));
  max-height: min(560px, calc(100dvh - 24px));
  overflow-y: auto;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  padding: 1rem;
  z-index: 1001;
}

.tooltip-overlay.is-mobile {
  background: rgba(15, 23, 42, 0.45);
}

.tooltip-sheet {
  left: 0;
  right: 0;
  top: auto;
  bottom: 0;
  width: 100%;
  max-width: none;
  max-height: min(560px, calc(100vh - 96px));
  max-height: min(560px, calc(100dvh - 96px));
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.18);
  padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
}

.tooltip-sheet .tooltip-header {
  position: relative;
}

.tooltip-sheet .tooltip-header::before {
  content: '';
  position: absolute;
  top: -0.7rem;
  left: 50%;
  transform: translateX(-50%);
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: #d5dbe1;
}

.card-pop-enter-active,
.card-pop-leave-active {
  transition: opacity 0.16s ease;
}

.card-pop-enter-from,
.card-pop-leave-to {
  opacity: 0;
}

.sheet-up-enter-active,
.sheet-up-leave-active {
  transition: opacity 0.25s ease;
}

.sheet-up-enter-active .tooltip-card,
.sheet-up-leave-active .tooltip-card {
  transition: transform 0.28s cubic-bezier(0.32, 0.72, 0.24, 1);
}

.sheet-up-enter-from,
.sheet-up-leave-to {
  opacity: 0;
}

.sheet-up-enter-from .tooltip-card,
.sheet-up-leave-to .tooltip-card {
  transform: translateY(100%);
}

.tooltip-header {
  display: flex;
  align-items: baseline;
  margin-bottom: 0.5rem;
}

.word-speech-row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin: -0.25rem 0;
  padding: 0.25rem 0.35rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.word-speech-row:hover,
.word-speech-row:focus-visible {
  background: #eef6fc;
  outline: none;
}

.word {
  font-size: 1.2rem;
  font-weight: 700;
  color: #2c3e50;
}

.phonetic {
  font-size: 0.9rem;
  color: #7f8c8d;
}

.close-btn {
  margin-left: auto;
  background: none;
  border: none;
  font-size: 1.3rem;
  cursor: pointer;
  color: #aaa;
  line-height: 1;
}

.close-btn:hover {
  color: #333;
}

.section {
  margin-bottom: 0.5rem;
}

.translations p {
  margin: 0.15rem 0;
  font-size: 0.9rem;
  color: #444;
}

.speaker-icon {
  border: 0;
  background: transparent;
  padding: 0;
  color: #3498db;
  font-size: 0.95rem;
  line-height: 1;
  pointer-events: none;
  transition: transform 0.15s;
}

.word-speech-row:hover .speaker-icon,
.word-speech-row:focus-visible .speaker-icon {
  transform: scale(1.12);
}

.definitions {
  border-top: 1px solid #f0f0f0;
  padding-top: 0.55rem;
}

.definitions h4 {
  margin: 0 0 0.3rem;
  color: #2c3e50;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.definitions ol {
  margin: 0;
  padding-left: 1.2rem;
}

.definitions li {
  margin: 0.2rem 0;
  color: #34495e;
  font-size: 0.84rem;
  line-height: 1.45;
}

.pos {
  color: #7f8c8d;
  font-size: 0.78rem;
  font-style: italic;
}

.forms {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.form-tag {
  font-size: 0.75rem;
  background: #f0f7ff;
  color: #2980b9;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}

.not-found, .loading-text {
  font-size: 0.85rem;
  color: #999;
}

.enriching-hint {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: #3498db;
  margin: 0.4rem 0;
  padding: 0.25rem 0.5rem;
  background: #f0f7fc;
  border-radius: 4px;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #3498db;
  animation: pulse 1.2s infinite ease-in-out;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

</style>
