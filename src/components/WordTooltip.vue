<script setup lang="ts">
/**
 * WordTooltip - 轻量悬浮层
 * 展示音标、简明翻译、核心时态变形
 */
import { computed } from 'vue'
import { parseExchange, EXCHANGE_LABELS } from '../lib/morphology'
import type { WordEntry } from '../lib/db'

const props = defineProps<{
  word: string
  data: WordEntry | null
  position: { x: number; y: number }
  loading?: boolean
}>()

const emit = defineEmits<{
  close: []
  'open-drawer': [word: string]
}>()

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

// 定位样式
const tooltipStyle = computed(() => ({
  left: `${Math.min(props.position.x, window.innerWidth - 320)}px`,
  top: `${props.position.y + 12}px`,
}))
</script>

<template>
  <Teleport to="body">
    <div class="tooltip-overlay" @click.self="emit('close')">
      <div class="tooltip-card" :style="tooltipStyle">
        <div class="tooltip-header">
          <span class="word">{{ word }}</span>
          <span class="phonetic" v-if="data?.phonetic">/{{ data.phonetic }}/</span>
          <button class="close-btn" @click="emit('close')">&times;</button>
        </div>

        <!-- 加载中 -->
        <div class="tooltip-body" v-if="loading">
          <p class="loading-text">查询中...</p>
        </div>

        <div class="tooltip-body" v-else-if="data">
          <!-- 简明翻译 -->
          <div class="section translations" v-if="translations.length">
            <p v-for="(t, i) in translations" :key="i">{{ t }}</p>
          </div>

          <!-- 时态变形 -->
          <div class="section forms" v-if="forms.length">
            <span class="form-tag" v-for="f in forms" :key="f.label">
              {{ f.label }}: {{ f.value }}
            </span>
          </div>

          <!-- 标签 -->
          <div class="section tags" v-if="data.tags">
            <span class="tag">{{ data.tags }}</span>
          </div>
        </div>

        <div class="tooltip-body" v-else>
          <p class="not-found">未找到该词条</p>
        </div>

        <div class="tooltip-footer" v-if="data && !loading">
          <button class="detail-btn" @click="emit('open-drawer', word)">展开详情</button>
        </div>
      </div>
    </div>
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
  width: 300px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  padding: 1rem;
  z-index: 1001;
}

.tooltip-header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
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

.tags .tag {
  font-size: 0.75rem;
  background: #fef9e7;
  color: #f39c12;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}

.not-found, .loading-text {
  font-size: 0.85rem;
  color: #999;
}

.tooltip-footer {
  margin-top: 0.75rem;
  border-top: 1px solid #f0f0f0;
  padding-top: 0.5rem;
}

.detail-btn {
  font-size: 0.8rem;
  color: #3498db;
  background: none;
  border: 1px solid #3498db;
  border-radius: 4px;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  transition: all 0.15s;
}

.detail-btn:hover {
  background: #3498db;
  color: #fff;
}
</style>
