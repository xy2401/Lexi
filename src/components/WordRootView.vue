<script setup lang="ts">
/**
 * WordRootView - 词根词缀沙盒
 * 支持按词根、词义、例词检索与前后缀/词源筛选，包含全量分页
 */
import { ref, computed, onMounted, watch } from 'vue'
import PaginationBar from './PaginationBar.vue'
import { getProgressSetting, setProgressSetting } from '../lib/progress-db'

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
  const saved = await getProgressSetting('wordroot.view', {
    searchQuery: '', selectedClass: 'all', selectedOrigin: 'all', currentPage: 1, pageSize: 20,
  })
  searchQuery.value = saved.searchQuery
  selectedClass.value = saved.selectedClass
  selectedOrigin.value = saved.selectedOrigin
  currentPage.value = Math.max(1, saved.currentPage)
  pageSize.value = saved.pageSize
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

watch([searchQuery, selectedClass, selectedOrigin, currentPage, pageSize], () => {
  void setProgressSetting('wordroot.view', {
    searchQuery: searchQuery.value,
    selectedClass: selectedClass.value,
    selectedOrigin: selectedOrigin.value,
    currentPage: currentPage.value,
    pageSize: pageSize.value,
  })
})

// 词源双语对照表 (用于顶部筛选栏：统一 中文 + 英文 风格)
const ORIGIN_FILTER_MAP: Record<string, string> = {
  'latin': '拉丁语 Latin',
  'greek': '希腊语 Greek',
  'old english': '古英语 Old English',
  'middle english': '中古英语 Middle English',
  'french': '法语 French',
  'latin and greek': '拉丁/希腊语 Latin & Greek',
  'german': '德语 German',
  'italian': '意大利语 Italian',
}

function getOriginFilterLabel(orig?: string): string {
  if (!orig) return ''
  const lower = orig.toLowerCase().trim()
  return ORIGIN_FILTER_MAP[lower] || `${orig}`
}

// 动态计算数据集中所有出现的词源
const availableOrigins = computed(() => {
  const set = new Set<string>()
  for (const item of items.value) {
    if (item.origin) set.add(item.origin)
  }
  return Array.from(set).sort()
})

// 类型双语对照表 (用于顶部筛选栏：统一 中文 + 英文 风格)
const CLASS_FILTER_MAP: Record<string, string> = {
  'all': '全部 All',
  'root': '词根 Root',
  'prefix': '前缀 Prefix',
  'suffix': '后缀 Suffix',
  'adjective-forming suffix': '形容词后缀 Adjective-Forming Suffix',
  'noun-forming suffix': '名词后缀 Noun-Forming Suffix',
  'verb-forming suffix': '动词后缀 Verb-Forming Suffix',
  'adverb-forming suffix': '副词后缀 Adverb-Forming Suffix',
  'adjective- and noun-forming suffix': '形/名双重后缀 Adj & Noun Suffix',
}

function getClassFilterLabel(cls: string): string {
  if (!cls) return ''
  const lower = cls.toLowerCase().trim()
  return CLASS_FILTER_MAP[lower] || cls
}

// 预定义细化类型选项 (覆盖数据集包含的全部精准类型)
const classOptions = [
  { key: 'all', label: '全部 All' },
  { key: 'root', label: '词根 Root' },
  { key: 'prefix', label: '前缀 Prefix' },
  { key: 'suffix', label: '后缀 Suffix' },
  { key: 'adjective-forming suffix', label: '形容词后缀 Adjective-Forming Suffix' },
  { key: 'noun-forming suffix', label: '名词后缀 Noun-Forming Suffix' },
  { key: 'verb-forming suffix', label: '动词后缀 Verb-Forming Suffix' },
  { key: 'adverb-forming suffix', label: '副词后缀 Adverb-Forming Suffix' },
  { key: 'adjective- and noun-forming suffix', label: '形/名双重后缀 Adj & Noun Suffix' },
]

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
      if (cls !== 'root' && cls !== 'prefix' && cls !== 'suffix') {
        if (c !== cls.toLowerCase()) return false
      }
    }

    // 词源筛选 (支持精准匹配或包含匹配)
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

interface MeaningToken {
  text: string
  isWord: boolean
}

function parseMeaning(text?: string): MeaningToken[] {
  if (!text) return []
  const tokens: MeaningToken[] = []
  const regex = /([a-zA-Z]+(?:[''-][a-zA-Z]+)*)|([^a-zA-Z]+)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      tokens.push({ text: match[1], isWord: true })
    } else if (match[2]) {
      tokens.push({ text: match[2], isWord: false })
    }
  }
  return tokens
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

      <!-- 筛选组 (统一：中文 + 英文 格式) -->
      <div class="filter-group">
        <!-- 类型细化筛选 -->
        <div class="filter-row">
          <span class="filter-label">类型:</span>
          <button
            v-for="opt in classOptions"
            :key="opt.key"
            :class="['filter-btn', { active: selectedClass === opt.key }]"
            @click="selectedClass = opt.key; resetPagination()"
          >{{ opt.label }}</button>
        </div>

        <!-- 词源全量动态筛选 -->
        <div class="filter-row" v-if="availableOrigins.length">
          <span class="filter-label">词源:</span>
          <button
            :class="['filter-btn', { active: selectedOrigin === 'all' }]"
            @click="selectedOrigin = 'all'; resetPagination()"
          >全部 All</button>
          <button
            v-for="orig in availableOrigins"
            :key="orig"
            :class="['filter-btn', { active: selectedOrigin === orig }]"
            @click="selectedOrigin = orig; resetPagination()"
          >{{ getOriginFilterLabel(orig) }}</button>
        </div>
      </div>
    </div>

    <!-- 顶部分页组件 -->
    <PaginationBar
      v-if="!loading && !error && filteredItems.length > 0"
      v-model:currentPage="currentPage"
      v-model:pageSize="pageSize"
      :totalPages="totalPages"
      :totalItems="filteredItems.length"
      :top="true"
    />

    <!-- 加载与错误状态 -->
    <div v-if="loading" class="status-box">加载词根词缀库中...</div>
    <div v-else-if="error" class="status-box error">{{ error }}</div>
    <div v-else-if="filteredItems.length === 0" class="status-box">未找到匹配的词根词缀</div>

    <!-- 数据列表 (自上而下自然流排版，左侧设纵向蓝条) -->
    <div v-else class="cards-list">
      <div v-for="item in paginatedItems" :key="item.key" class="root-card">
        <!-- 卡片标头：同一行展示（左侧：词根名 + 释义 + 同/反义词；右侧居右：原版英文类型 + 词源） -->
        <div class="card-header">
          <div class="header-left">
            <span class="root-text">{{ item.root }}</span>

            <!-- 释义 (其中包含的英文单词均可交互点击查词) -->
            <div class="meaning-box">
              <span class="meaning-label">释义:</span>
              <span class="meaning-tokens">
                <template v-for="(t, idx) in parseMeaning(item.meaning)" :key="idx">
                  <span
                    v-if="t.isWord"
                    class="meaning-word-link"
                    @click="selectWord(t.text)"
                    title="点击即时发音并弹窗查词"
                  >{{ t.text }}</span>
                  <span v-else class="plain-token">{{ t.text }}</span>
                </template>
              </span>
            </div>

            <!-- 同/反义词 (其中英文单词亦可点击查词) -->
            <div class="syn-ant-inline" v-if="item.synonyms || item.antonyms">
              <span v-if="item.synonyms" class="meta-tag syn">
                同:
                <template v-for="(t, idx) in parseMeaning(item.synonyms)" :key="idx">
                  <span v-if="t.isWord" class="meaning-word-link" @click="selectWord(t.text)">{{ t.text }}</span>
                  <span v-else>{{ t.text }}</span>
                </template>
              </span>
              <span v-if="item.antonyms" class="meta-tag ant">
                反:
                <template v-for="(t, idx) in parseMeaning(item.antonyms)" :key="idx">
                  <span v-if="t.isWord" class="meaning-word-link" @click="selectWord(t.text)">{{ t.text }}</span>
                  <span v-else>{{ t.text }}</span>
                </template>
              </span>
            </div>
          </div>

          <!-- 右侧：保留原版英文 Tag 展现 -->
          <div class="header-right">
            <span class="badge class-badge">{{ item.class }}</span>
            <span class="badge origin-badge" v-if="item.origin">{{ item.origin }}</span>
          </div>
        </div>

        <!-- 卡片主体：衍生例词气泡流 -->
        <div class="card-body" v-if="item.examples && item.examples.length">
          <div class="examples-section">
            <div class="example-chips">
              <div
                v-for="ex in item.examples"
                :key="ex"
                class="example-chip"
                @click="selectWord(ex)"
              >
                <span class="chip-word">{{ ex }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部分页组件 -->
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

.cards-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.root-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #3498db;
  border-radius: 8px;
  padding: 0.9rem 1.25rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  border-bottom: 1px dashed #f1f5f9;
  padding-bottom: 0.55rem;
}

.header-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  flex: 1;
  min-width: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
  flex-shrink: 0;
}

.root-text {
  font-size: 1.3rem;
  font-weight: 700;
  color: #2c3e50;
  font-family: monospace;
}

.meaning-box {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  font-size: 0.92rem;
}

.meaning-label {
  font-weight: 600;
  color: #64748b;
}

.meaning-text {
  color: #334155;
}

.meaning-word-link {
  color: #2563eb;
  cursor: pointer;
  border-bottom: 1px dashed #93c5fd;
  transition: all 0.15s;
  padding: 0 0.1rem;
}

.meaning-word-link:hover {
  color: #1d4ed8;
  background: #eff6ff;
  border-bottom-style: solid;
  border-radius: 2px;
}

.syn-ant-inline {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
}

.badge {
  font-size: 0.72rem;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  text-transform: lowercase;
}

.class-badge {
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.origin-badge {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.examples-label {
  font-size: 0.78rem;
  color: #64748b;
  font-weight: 600;
  min-width: 60px;
}

.example-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  flex: 1;
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
</style>
