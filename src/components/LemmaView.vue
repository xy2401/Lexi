<script setup lang="ts">
/**
 * LemmaView - 词族演变沙盒
 * 支持双向搜索（变形词反查原词 / 原词查衍生族）、规则多选过滤（默认隐藏常规变体）与全量分页
 */
import { ref, computed, watch, onMounted } from 'vue'
import { parseExchange, EXCHANGE_LABELS } from '../lib/morphology'
import { lookupLocal, type WordEntry } from '../lib/db'
import DictionaryTags from './DictionaryTags.vue'
import PaginationBar from './PaginationBar.vue'

export interface LemmaVariant {
  word: string
  type: 's' | 'ed' | 'ing' | 'ies' | 'irregular' | 'same'
}

export interface LemmaEntry {
  lemma: string
  frequency: number
  variants: LemmaVariant[]
}

function classifyVariantType(root: string, variant: string): 's' | 'ed' | 'ing' | 'ies' | 'irregular' | 'same' {
  const r = root.toLowerCase()
  const v = variant.toLowerCase()

  if (r === v) return 'same'

  if (r.endsWith('y') && !/^[aeiou]y$/.test(r)) {
    const stem = r.slice(0, -1)
    if (v === stem + 'ies' || v === stem + 'ied') return 'ies'
  }

  if (v === r + 's' || v === r + 'es') return 's'
  if (r.endsWith('e') && v === r.slice(0, -1) + 'es') return 's'

  if (v === r + 'ed') return 'ed'
  if (r.endsWith('e') && v === r + 'd') return 'ed'

  if (v === r + 'ing') return 'ing'
  if (r.endsWith('e') && v === r.slice(0, -1) + 'ing') return 'ing'
  if (v.length > r.length + 3 && v.endsWith('ing') && v.startsWith(r)) return 'ing'

  return 'irregular'
}

function formatShortTranslation(text?: string): string {
  if (!text) return ''
  return text.replace(/\\r\\n|\\n/g, ' ').slice(0, 50)
}

function getForms(exchange?: string) {
  if (!exchange) return []
  const parsed = parseExchange(exchange)
  return Object.entries(parsed)
    .filter(([key]) => key in EXCHANGE_LABELS && key !== '0' && key !== '1')
    .map(([key, value]) => ({
      label: EXCHANGE_LABELS[key] || key,
      value,
    }))
}

const emit = defineEmits<{
  'select-word': [word: string]
  'speak-word': [word: string]
}>()

const entries = ref<LemmaEntry[]>([])
const reverseMap = ref<Record<string, string>>({})
const metaMap = ref<Record<string, WordEntry>>({})
const loading = ref(true)
const error = ref('')

const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

// 规则多选开关 (非常规派生默认选中，常规派生默认未选中)
const showIrregular = ref(true) // 非常规派生 / 不规则
const showS = ref(false)         // -s / -es
const showEd = ref(false)        // -ed / -d
const showIng = ref(false)       // -ing
const showIes = ref(false)       // y -> ies / ied

onMounted(async () => {
  try {
    const res = await fetch('/data/lemma.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const rawList: Array<[string, number, string[]]> = await res.json()

    const list: LemmaEntry[] = []
    const rev: Record<string, string> = {}

    for (const [lemma, frequency, rawVariants] of rawList) {
      const variants: LemmaVariant[] = []
      for (const v of rawVariants) {
        const type = classifyVariantType(lemma, v)
        variants.push({ word: v, type })
        if (!rev[v.toLowerCase()]) {
          rev[v.toLowerCase()] = lemma
        }
      }
      list.push({ lemma, frequency, variants })
    }

    entries.value = list
    reverseMap.value = rev
  } catch (err) {
    error.value = '加载词族演变数据失败，请重试'
    console.error(err)
  } finally {
    loading.value = false
  }
})

// 检查某个词族是否满足当前勾选的类型规则
function shouldShowFamily(entry: LemmaEntry): boolean {
  if (entry.variants.length === 0) return showIrregular.value

  for (const v of entry.variants) {
    if ((v.type === 'irregular' || v.type === 'same') && showIrregular.value) return true
    if (v.type === 's' && showS.value) return true
    if (v.type === 'ed' && showEd.value) return true
    if (v.type === 'ing' && showIng.value) return true
    if (v.type === 'ies' && showIes.value) return true
  }
  return false
}

// 得到某词族下的完整变体列表（匹配的词族内部派生 100% 完整展示，不再二次过滤）
function getVisibleVariants(entry: LemmaEntry): LemmaVariant[] {
  return entry.variants
}

// 过滤后的词族列表
const filteredEntries = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const mappedLemma = searchQuery.value ? reverseMap.value[q] : null

  return entries.value.filter(item => {
    // 1. 先进行规则筛选：如果该词族完全不包含已勾选的规则，则隐藏该词族
    if (!shouldShowFamily(item)) return false

    // 2. 无搜索词时，直接通过规则筛选
    if (!q) return true

    // 3. 有搜索词时，检查原词、映射词或变体词匹配
    const lemmaLower = item.lemma.toLowerCase()
    if (lemmaLower.includes(q)) return true
    if (mappedLemma && lemmaLower === mappedLemma.toLowerCase()) return true
    return item.variants.some(v => v.word.toLowerCase().includes(q))
  })
})

const totalPages = computed(() => Math.ceil(filteredEntries.value.length / pageSize.value) || 1)

const paginatedEntries = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredEntries.value.slice(start, start + pageSize.value)
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

function getTypeLabel(type: string): string {
  switch (type) {
    case 's': return '-s'
    case 'ed': return '-ed'
    case 'ing': return '-ing'
    case 'ies': return '-ies'
    default: return ''
  }
}

function getItemMeta(lemma: string): Partial<WordEntry> {
  return metaMap.value[lemma.toLowerCase()] || {}
}

watch(paginatedEntries, async (items) => {
  if (!items || items.length === 0) return
  for (const item of items) {
    const key = item.lemma.toLowerCase()
    if (!metaMap.value[key]) {
      const res = await lookupLocal(key)
      if (res) {
        metaMap.value[key] = res
      }
    }
  }
}, { immediate: true })
</script>

<template>
  <div class="lemma-container">
    <!-- 顶部控制栏 -->
    <div class="control-panel">
      <!-- 搜索框 -->
      <div class="search-box">
        <span class="search-icon">🌿</span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索原词 (如 go) 或变形词 (如 went, wrought, better) 进行双向检索..."
          @input="resetPagination"
        />
        <button v-if="searchQuery" class="clear-btn" @click="searchQuery = ''; resetPagination()">&times;</button>
      </div>

      <!-- 规则多选过滤栏 -->
      <div class="rules-filter-bar">
        <span class="rules-title">词族筛选条件 (包含已勾选规则的词族才会在列表中展示):</span>
        <div class="checkboxes-group">
          <label class="checkbox-label highlight">
            <input type="checkbox" v-model="showIrregular" @change="resetPagination" />
            <span>包含非常规派生 / 不规则 (默认选中)</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="showS" @change="resetPagination" />
            <span>包含常规复数/单三 (-s / -es)</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="showEd" @change="resetPagination" />
            <span>包含常规过去式 (-ed / -d)</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="showIng" @change="resetPagination" />
            <span>包含常规进行时 (-ing)</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="showIes" @change="resetPagination" />
            <span>包含 y 变 ies / ied (-ies / -ied)</span>
          </label>
        </div>
      </div>
    </div>

    <!-- 顶部分页控制 -->
    <PaginationBar
      v-if="!loading && !error && filteredEntries.length > 0"
      v-model:currentPage="currentPage"
      v-model:pageSize="pageSize"
      :totalPages="totalPages"
      :totalItems="filteredEntries.length"
      :top="true"
    />

    <!-- 状态指示 -->
    <div v-if="loading" class="status-box">加载词族演变库中...</div>
    <div v-else-if="error" class="status-box error">{{ error }}</div>
    <div v-else-if="filteredEntries.length === 0" class="status-box">未找到匹配的词族（您可以勾选更多规则多选框以展开更多词族）</div>

    <!-- 词族卡片列表 -->
    <div v-else class="cards-list">
      <div v-for="item in paginatedEntries" :key="item.lemma" class="lemma-card">
        <!-- 原型词标头 (左侧：原词/音标/释义/时态变形；右侧：考试标签与 BNC 词频) -->
        <div class="card-header">
          <div class="header-left">
            <div class="lemma-main" @click="selectWord(item.lemma)">
              <span class="lemma-word">{{ item.lemma }}</span>
              <span class="lemma-phonetic" v-if="getItemMeta(item.lemma).phonetic">/{{ getItemMeta(item.lemma).phonetic }}/</span>
              <span class="lemma-translation" v-if="getItemMeta(item.lemma).translation">{{ formatShortTranslation(getItemMeta(item.lemma).translation) }}</span>
            </div>

            <!-- 时态变形内联列表 -->
            <div class="inline-forms-row" v-if="getForms(getItemMeta(item.lemma).exchange).length">
              <span class="form-tag" v-for="f in getForms(getItemMeta(item.lemma).exchange)" :key="f.label" @click="selectWord(f.value)">
                {{ f.label }}: {{ f.value }}
              </span>
            </div>
          </div>

          <!-- 右侧标签与词频库 -->
          <div class="header-right">
            <DictionaryTags class="lemma-tags" v-if="getItemMeta(item.lemma).tags" :tags="getItemMeta(item.lemma).tags || ''" />
            <span class="frq-badge" v-if="item.frequency > 0" title="BNC 语料库词频权重">
              BNC: {{ item.frequency.toLocaleString() }}
            </span>
          </div>
        </div>

        <!-- 变体拓扑网格 -->
        <div class="card-body">
          <div class="variant-grid">
            <div
              v-for="v in item.variants"
              :key="v.word"
              :class="['variant-chip', v.type]"
              @click="selectWord(v.word)"
            >
              <span class="v-word">{{ v.word }}</span>
              <span class="v-type" v-if="getTypeLabel(v.type)">{{ getTypeLabel(v.type) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部分页控制 -->
    <PaginationBar
      v-if="!loading && !error && filteredEntries.length > 0"
      v-model:currentPage="currentPage"
      v-model:pageSize="pageSize"
      :totalPages="totalPages"
      :totalItems="filteredEntries.length"
    />
  </div>
</template>

<style scoped>
.lemma-container {
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

.rules-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  background: #f8fafc;
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  border: 1px dashed #cbd5e1;
}

.rules-title {
  font-size: 0.78rem;
  font-weight: 600;
  color: #475569;
}

.checkboxes-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: #334155;
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type="checkbox"] {
  accent-color: #3498db;
  width: 14px;
  height: 14px;
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

.lemma-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 0.6rem;
  margin-bottom: 0.65rem;
}

.header-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem 0.75rem;
  flex: 1;
  min-width: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
  flex-shrink: 0;
}

.lemma-main {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.lemma-word {
  font-size: 1.2rem;
  font-weight: 700;
  color: #2c3e50;
}

.lemma-phonetic {
  font-size: 0.85rem;
  color: #8e44ad;
  font-family: sans-serif;
}

.lemma-translation {
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 400;
  max-width: 350px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inline-forms-row {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.form-tag {
  font-size: 0.75rem;
  background: #f0f7ff;
  color: #2980b9;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid #d0e7ff;
  transition: all 0.15s;
}

.form-tag:hover {
  background: #e0f2fe;
  border-color: #0284c7;
}

.frq-badge {
  font-size: 0.72rem;
  background: #f1f5f9;
  color: #64748b;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  font-family: monospace;
}

.no-variants-hint {
  font-size: 0.8rem;
  color: #94a3b8;
  font-style: italic;
  padding: 0.25rem 0;
}

.variant-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.variant-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #f0f7ff;
  border: 1px solid #bae6fd;
  color: #0284c7;
  padding: 0.25rem 0.55rem;
  border-radius: 6px;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.15s;
}

.variant-chip:hover {
  background: #e0f2fe;
  border-color: #0284c7;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.variant-chip.irregular {
  font-weight: 700;
}

.variant-chip.s, .variant-chip.ed, .variant-chip.ing, .variant-chip.ies {
  font-weight: 500;
  background: #f8fafc;
  border-color: #e2e8f0;
  color: #475569;
}

.variant-chip.s:hover, .variant-chip.ed:hover, .variant-chip.ing:hover, .variant-chip.ies:hover {
  background: #f0f7ff;
  border-color: #bae6fd;
  color: #0284c7;
}

.v-word {
  font-weight: 600;
}

.v-type {
  font-size: 0.68rem;
  opacity: 0.75;
}

.speaker-btn {
  font-size: 0.75rem;
  opacity: 0.7;
}

.speaker-btn:hover {
  opacity: 1;
}
</style>
