<script setup lang="ts">
/**
 * WordRootView - 词根词缀沙盒
 * 支持按词根、词义、例词检索与前后缀/词源筛选，包含全量分页
 */
import { ref, computed, onMounted } from 'vue'

export interface WordRootItem {
  key: string
  root: string
  meaning: string
  class: string
  origin: string
  examples: string[]
  synonyms: string
  antonyms: string
}

const emit = defineEmits<{
  'select-word': [word: string]
  'speak-word': [word: string]
}>()

const items = ref<WordRootItem[]>([])
const loading = ref(true)
const error = ref('')

const searchQuery = ref('')
const selectedClass = ref<string>('all')
const selectedOrigin = ref<string>('all')

// 分页控制
const currentPage = ref(1)
const pageSize = ref(20)

onMounted(async () => {
  try {
    const res = await fetch('/data/wordroot.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    items.value = await res.json()
  } catch (err) {
    error.value = '加载词根词缀数据失败，请重试'
    console.error(err)
  } finally {
    loading.value = false
  }
})

// 过滤后的数据列表
const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const cls = selectedClass.value
  const orig = selectedOrigin.value

  return items.value.filter(item => {
    // 类别筛选
    if (cls !== 'all') {
      const c = item.class.toLowerCase()
      if (cls === 'root' && !c.includes('root')) return false
      if (cls === 'prefix' && !c.includes('prefix')) return false
      if (cls === 'suffix' && !c.includes('suffix')) return false
    }

    // 词源筛选
    if (orig !== 'all') {
      if (!item.origin.toLowerCase().includes(orig.toLowerCase())) return false
    }

    // 搜索词匹配（匹配词根名、含义、例词）
    if (q) {
      const matchRoot = item.root.toLowerCase().includes(q)
      const matchMeaning = item.meaning.toLowerCase().includes(q)
      const matchExamples = item.examples.some(ex => ex.toLowerCase().includes(q))
      if (!matchRoot && !matchMeaning && !matchExamples) return false
    }

    return true
  })
})

// 总页数与当页显示数据
const totalPages = computed(() => Math.ceil(filteredItems.value.length / pageSize.value) || 1)

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredItems.value.slice(start, start + pageSize.value)
})

// 筛选/搜索改变时自动重置回第 1 页
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
</script>

<template>
  <div class="wordroot-container">
    <!-- 顶部控制栏 -->
    <div class="control-panel">
      <!-- 搜索框 -->
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索词根 (如 tele)、含义 (如 far) 或例词..."
          @input="resetPagination"
        />
        <button v-if="searchQuery" class="clear-btn" @click="searchQuery = ''; resetPagination()">&times;</button>
      </div>

      <!-- 筛选组 -->
      <div class="filter-group">
        <div class="filter-row">
          <span class="filter-label">类型:</span>
          <button
            :class="['filter-btn', { active: selectedClass === 'all' }]"
            @click="selectedClass = 'all'; resetPagination()"
          >全部</button>
          <button
            :class="['filter-btn', { active: selectedClass === 'root' }]"
            @click="selectedClass = 'root'; resetPagination()"
          >词根 Root</button>
          <button
            :class="['filter-btn', { active: selectedClass === 'prefix' }]"
            @click="selectedClass = 'prefix'; resetPagination()"
          >前缀 Prefix</button>
          <button
            :class="['filter-btn', { active: selectedClass === 'suffix' }]"
            @click="selectedClass = 'suffix'; resetPagination()"
          >后缀 Suffix</button>
        </div>

        <div class="filter-row">
          <span class="filter-label">词源:</span>
          <button
            :class="['filter-btn', { active: selectedOrigin === 'all' }]"
            @click="selectedOrigin = 'all'; resetPagination()"
          >全部</button>
          <button
            :class="['filter-btn', { active: selectedOrigin === 'latin' }]"
            @click="selectedOrigin = 'latin'; resetPagination()"
          >Latin (拉丁语)</button>
          <button
            :class="['filter-btn', { active: selectedOrigin === 'greek' }]"
            @click="selectedOrigin = 'greek'; resetPagination()"
          >Greek (希腊语)</button>
          <button
            :class="['filter-btn', { active: selectedOrigin === 'french' }]"
            @click="selectedOrigin = 'french'; resetPagination()"
          >French (法语)</button>
        </div>
      </div>
    </div>

    <!-- 加载与错误状态 -->
    <div v-if="loading" class="status-box">加载词根词缀库中...</div>
    <div v-else-if="error" class="status-box error">{{ error }}</div>
    <div v-else-if="filteredItems.length === 0" class="status-box">未找到匹配的词根词缀</div>

    <!-- 数据列表 -->
    <div v-else class="cards-grid">
      <div v-for="item in paginatedItems" :key="item.key" class="root-card">
        <div class="card-header">
          <div class="root-title">
            <span class="root-text">{{ item.root }}</span>
            <span class="badge class-badge">{{ item.class }}</span>
            <span class="badge origin-badge" v-if="item.origin">{{ item.origin }}</span>
          </div>
        </div>

        <div class="card-body">
          <p class="meaning-text">
            <strong>释义:</strong> {{ item.meaning }}
          </p>

          <div class="syn-ant-row" v-if="item.synonyms || item.antonyms">
            <span v-if="item.synonyms" class="meta-tag syn">同义: {{ item.synonyms }}</span>
            <span v-if="item.antonyms" class="meta-tag ant">反义: {{ item.antonyms }}</span>
          </div>

          <div class="examples-section" v-if="item.examples && item.examples.length">
            <span class="section-title">衍生例词 (点击朗读 / 查词):</span>
            <div class="example-chips">
              <div
                v-for="ex in item.examples"
                :key="ex"
                class="example-chip"
                @click="selectWord(ex)"
              >
                <span class="chip-word">{{ ex }}</span>
                <span class="speaker-btn" @click="speak(ex, $event)" title="朗读">🔊</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部分页控制 -->
    <div class="pagination-bar" v-if="filteredItems.length > 0">
      <span class="page-info">共 {{ filteredItems.length }} 条记录 | 第 {{ currentPage }} / {{ totalPages }} 页</span>
      <div class="pagination-btns">
        <button :disabled="currentPage === 1" @click="currentPage--" class="page-btn">上一页</button>
        <button :disabled="currentPage >= totalPages" @click="currentPage++" class="page-btn">下一页</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wordroot-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.control-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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
  color: #7f8c8d;
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

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.filter-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  min-width: 42px;
}

.filter-btn {
  padding: 0.25rem 0.6rem;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #f8fafc;
  font-size: 0.78rem;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-btn:hover {
  border-color: #3498db;
  color: #3498db;
}

.filter-btn.active {
  background: #2c3e50;
  border-color: #2c3e50;
  color: #fff;
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

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
}

.root-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.card-header {
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 0.5rem;
}

.root-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.root-text {
  font-size: 1.25rem;
  font-weight: 700;
  color: #2c3e50;
  font-family: monospace;
}

.badge {
  font-size: 0.7rem;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  text-transform: lowercase;
}

.class-badge {
  background: #e0f2fe;
  color: #0369a1;
}

.origin-badge {
  background: #f1f5f9;
  color: #475569;
}

.meaning-text {
  margin: 0;
  font-size: 0.9rem;
  color: #334155;
}

.syn-ant-row {
  display: flex;
  gap: 0.5rem;
  font-size: 0.75rem;
}

.meta-tag {
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
}

.meta-tag.syn {
  background: #f0fdf4;
  color: #166534;
}

.meta-tag.ant {
  background: #fef2f2;
  color: #991b1b;
}

.examples-section {
  margin-top: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.section-title {
  font-size: 0.75rem;
  color: #64748b;
}

.example-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.example-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: #f0f7ff;
  border: 1px solid #bae6fd;
  color: #0284c7;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.example-chip:hover {
  background: #e0f2fe;
  border-color: #0284c7;
}

.speaker-btn {
  font-size: 0.75rem;
  cursor: pointer;
  opacity: 0.7;
}

.speaker-btn:hover {
  opacity: 1;
}

.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.page-info {
  font-size: 0.82rem;
  color: #64748b;
}

.pagination-btns {
  display: flex;
  gap: 0.5rem;
}

.page-btn {
  padding: 0.3rem 0.75rem;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 5px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-btn:not(:disabled):hover {
  background: #2c3e50;
  border-color: #2c3e50;
  color: #fff;
}
</style>
