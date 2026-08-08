<script setup lang="ts">
/**
 * LemmaView - 词族演变沙盒
 * 支持双向搜索（变形词反查原词 / 原词查衍生族）、规则多选过滤（默认隐藏常规变体）与全量分页
 */
import { ref, computed, onMounted } from 'vue'

export interface LemmaVariant {
  word: string
  type: 's' | 'ed' | 'ing' | 'ies' | 'irregular' | 'same'
}

export interface LemmaEntry {
  lemma: string
  frequency: number
  variants: LemmaVariant[]
}

const emit = defineEmits<{
  'select-word': [word: string]
  'speak-word': [word: string]
}>()

const entries = ref<LemmaEntry[]>([])
const reverseMap = ref<Record<string, string>>({})
const loading = ref(true)
const error = ref('')

const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

// 规则多选开关 (默认全部未勾选：不展示常规变化)
const showS = ref(false)     // -s / -es
const showEd = ref(false)    // -ed / -d
const showIng = ref(false)   // -ing
const showIes = ref(false)   // y -> ies / ied

onMounted(async () => {
  try {
    const res = await fetch('/data/lemma.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    entries.value = data.entries || []
    reverseMap.value = data.reverseMap || {}
  } catch (err) {
    error.value = '加载词族演变数据失败，请重试'
    console.error(err)
  } finally {
    loading.value = false
  }
})

// 判定某个变体在当前多选设置下是否可见
function isVariantVisible(type: string): boolean {
  if (type === 'irregular' || type === 'same') return true
  if (type === 's' && showS.value) return true
  if (type === 'ed' && showEd.value) return true
  if (type === 'ing' && showIng.value) return true
  if (type === 'ies' && showIes.value) return true
  return false
}

// 得到某词族在当前过滤规则下的有效变体列表
function getVisibleVariants(entry: LemmaEntry): LemmaVariant[] {
  return entry.variants.filter(v => isVariantVisible(v.type))
}

// 过滤后的词族列表
const filteredEntries = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return entries.value

  // 支持双向反查：查看 search 词是否在 reverseMap 中映射到某个原词
  const mappedLemma = reverseMap.value[q]

  return entries.value.filter(item => {
    const lemmaLower = item.lemma.toLowerCase()
    // 直接匹配原词
    if (lemmaLower.includes(q)) return true
    // 匹配映射的原词
    if (mappedLemma && lemmaLower === mappedLemma.toLowerCase()) return true
    // 匹配变体词
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
    case 'irregular': return '不规则/派生'
    case 's': return '复数/单三 (-s)'
    case 'ed': return '过去式 (-ed)'
    case 'ing': return '进行时 (-ing)'
    case 'ies': return 'y变ies/ied'
    default: return '变体'
  }
}
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

      <!-- 规则多选过滤栏 (默认全未勾选) -->
      <div class="rules-filter-bar">
        <span class="rules-title">常规变形显示开关 (默认已隐藏常规变化):</span>
        <div class="checkboxes-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="showS" @change="resetPagination" />
            <span>常规复数/单三 (-s / -es)</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="showEd" @change="resetPagination" />
            <span>常规过去式 (-ed / -d)</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="showIng" @change="resetPagination" />
            <span>常规进行时 (-ing)</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="showIes" @change="resetPagination" />
            <span>y 变 ies / ied (-ies / -ied)</span>
          </label>
        </div>
      </div>
    </div>

    <!-- 状态指示 -->
    <div v-if="loading" class="status-box">加载词族演变库中...</div>
    <div v-else-if="error" class="status-box error">{{ error }}</div>
    <div v-else-if="filteredEntries.length === 0" class="status-box">未找到匹配的词族</div>

    <!-- 词族卡片列表 -->
    <div v-else class="cards-list">
      <div v-for="item in paginatedEntries" :key="item.lemma" class="lemma-card">
        <!-- 原型词标头 -->
        <div class="card-header">
          <div class="lemma-main" @click="selectWord(item.lemma)">
            <span class="lemma-word">{{ item.lemma }}</span>
          </div>
          <span class="frq-badge" v-if="item.frequency > 0" title="BNC 语料库词频权重">
            BNC: {{ item.frequency.toLocaleString() }}
          </span>
        </div>

        <!-- 变体拓扑网格 -->
        <div class="card-body">
          <div v-if="getVisibleVariants(item).length === 0" class="no-variants-hint">
            该词族在此过滤规则下暂无特殊/不规则变体（勾选上方多选框可展开常规变体）
          </div>

          <div v-else class="variant-grid">
            <div
              v-for="v in getVisibleVariants(item)"
              :key="v.word"
              :class="['variant-chip', v.type]"
              @click="selectWord(v.word)"
            >
              <span class="v-word">{{ v.word }}</span>
              <span class="v-type">{{ getTypeLabel(v.type) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部分页控制 -->
    <div class="pagination-bar" v-if="filteredEntries.length > 0">
      <span class="page-info">共 {{ filteredEntries.length }} 词族 | 第 {{ currentPage }} / {{ totalPages }} 页</span>
      <div class="pagination-btns">
        <button :disabled="currentPage === 1" @click="currentPage--" class="page-btn">上一页</button>
        <button :disabled="currentPage >= totalPages" @click="currentPage++" class="page-btn">下一页</button>
      </div>
    </div>
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
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 0.6rem;
  margin-bottom: 0.65rem;
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
