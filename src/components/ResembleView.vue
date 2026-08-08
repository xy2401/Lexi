<script setup lang="ts">
/**
 * ResembleView - 近义/易混词辨析
 * 支持单词或中文搜索，包含全量分页与一键点读
 */
import { ref, computed, onMounted } from 'vue'
import PaginationBar from './PaginationBar.vue'

export interface ResembleGroup {
  words: string[]
  explanation: string
}

const emit = defineEmits<{
  'select-word': [word: string]
  'speak-word': [word: string]
}>()

const items = ref<ResembleGroup[]>([])
const loading = ref(true)
const error = ref('')

const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

onMounted(async () => {
  try {
    const res = await fetch('/data/resemble.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    items.value = await res.json()
  } catch (err) {
    error.value = '加载近义辨析数据失败，请重试'
    console.error(err)
  } finally {
    loading.value = false
  }
})

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return items.value

  return items.value.filter(item => {
    const matchWords = item.words.some(w => w.toLowerCase().includes(q))
    const matchExp = item.explanation.toLowerCase().includes(q)
    return matchWords || matchExp
  })
})

const totalPages = computed(() => Math.ceil(filteredItems.value.length / pageSize.value) || 1)

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredItems.value.slice(start, start + pageSize.value)
})

function resetPagination() {
  currentPage.value = 1
}

function selectWord(word: string) {
  emit('select-word', word)
}

function speak(word: string, e: Event) {
  e.stopPropagation()
  emit('speak-word', word)
}

function formatExplanationLines(text: string): string[] {
  return text.split('\n').filter(line => line.trim())
}
</script>

<template>
  <div class="resemble-container">
    <!-- 顶部控制栏 -->
    <div class="control-panel">
      <div class="search-box">
        <span class="search-icon">⚖️</span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索易混单词 (如 quite, force) 或中文辨析关键字 (如 迫使)..."
          @input="resetPagination"
        />
        <button v-if="searchQuery" class="clear-btn" @click="searchQuery = ''; resetPagination()">&times;</button>
      </div>
    </div>

    <!-- 顶部分页控制 -->
    <PaginationBar
      v-if="!loading && !error && filteredItems.length > 0"
      v-model:currentPage="currentPage"
      v-model:pageSize="pageSize"
      :totalPages="totalPages"
      :totalItems="filteredItems.length"
      :top="true"
    />

    <!-- 状态指示 -->
    <div v-if="loading" class="status-box">加载近义词辨析数据中...</div>
    <div v-else-if="error" class="status-box error">{{ error }}</div>
    <div v-else-if="filteredItems.length === 0" class="status-box">未找到匹配的近义词组</div>

    <!-- 辨析卡片列表 -->
    <div v-else class="cards-list">
      <div v-for="(item, idx) in paginatedItems" :key="idx" class="resemble-card">
        <!-- 头部近义词芯片组 -->
        <div class="card-header">
          <span class="group-label">辨析词组:</span>
          <div class="word-pills">
            <div
              v-for="w in item.words"
              :key="w"
              class="word-pill"
              @click="selectWord(w)"
            >
              <span class="pill-text">{{ w }}</span>
            </div>
          </div>
        </div>

        <!-- 详细对比说明 -->
        <div class="card-body">
          <div
            v-for="(line, lineIdx) in formatExplanationLines(item.explanation)"
            :key="lineIdx"
            :class="['exp-line', { 'summary-line': line.startsWith('这组词') }]"
          >
            {{ line }}
          </div>
        </div>
      </div>
    </div>

    <!-- 底部分页控制 -->
    <PaginationBar
      v-if="!loading && !error && filteredItems.length > 0"
      v-model:currentPage="currentPage"
      v-model:pageSize="pageSize"
      :totalPages="totalPages"
      :totalItems="filteredItems.length"
    />
  </div>
</template>

<style scoped>
.resemble-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.control-panel {
  background: #fff;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  font-size: 0.9rem;
}

.search-box input {
  width: 100%;
  padding: 0.55rem 2.2rem 0.55rem 2.2rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s;
}

.search-box input:focus {
  border-color: #3498db;
}

.clear-btn {
  position: absolute;
  right: 0.75rem;
  background: none;
  border: none;
  font-size: 1.2rem;
  color: #94a3b8;
  cursor: pointer;
}

.status-box {
  text-align: center;
  padding: 2rem;
  color: #64748b;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.status-box.error {
  color: #e74c3c;
}

.cards-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.resemble-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1.1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 0.75rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.group-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #64748b;
}

.word-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.word-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #f0f7ff;
  border: 1px solid #bae6fd;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.word-pill:hover {
  background: #e0f2fe;
  border-color: #0284c7;
}

.pill-text {
  font-weight: 700;
  font-size: 0.92rem;
  color: #0284c7;
}

.speaker-btn {
  font-size: 0.75rem;
  opacity: 0.7;
}

.speaker-btn:hover {
  opacity: 1;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.exp-line {
  font-size: 0.88rem;
  color: #334155;
  line-height: 1.5;
}

.summary-line {
  font-weight: 600;
  color: #2c3e50;
  background: #f8fafc;
  padding: 0.35rem 0.6rem;
  border-radius: 4px;
  border-left: 3px solid #3498db;
}
</style>
