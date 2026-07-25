<script setup lang="ts">
/**
 * DuolingoView - 多邻国单元词汇浏览
 * 加载 /data/duolingo-zs-en.json，按单元展示词汇列表
 */
import { ref, computed, onMounted } from 'vue'
import { marked } from 'marked'
import { db, type WordEntry } from '../lib/db'

interface DuoUnit {
  id: number
  name: string
  desc: string
  words: string[]
}

const emit = defineEmits<{
  'select-word': [word: string]
}>()

const units = ref<DuoUnit[]>([])
const loading = ref(true)
const selectedUnit = ref<DuoUnit | null>(null)
const unitEntries = ref<WordEntry[]>([])
const searchQuery = ref('')

// 面板 tab 切换
const panelTab = ref<'words' | 'guide'>('words')
const guideHtml = ref('')
const guideLoading = ref(false)

// 搜索过滤
const filteredUnits = computed(() => {
  if (!searchQuery.value.trim()) return units.value
  const q = searchQuery.value.toLowerCase()
  return units.value.filter(u =>
    u.name.toLowerCase().includes(q) ||
    u.desc.toLowerCase().includes(q) ||
    u.words.some(w => w.toLowerCase().includes(q))
  )
})

// 统计
const totalWords = computed(() => units.value.reduce((s, u) => s + u.words.length, 0))

onMounted(async () => {
  try {
    const res = await fetch('/data/duolingo-zs-en.json')
    units.value = await res.json()
  } catch (e) {
    console.error('加载多邻国数据失败', e)
  } finally {
    loading.value = false
  }
})

async function selectUnit(unit: DuoUnit) {
  if (selectedUnit.value?.id === unit.id) {
    selectedUnit.value = null
    unitEntries.value = []
    guideHtml.value = ''
    return
  }
  selectedUnit.value = unit
  panelTab.value = 'words'
  guideHtml.value = ''
  // 从本地词库查出音标和释义
  const entries = await db.words
    .where('word').anyOf(unit.words)
    .toArray()
  // 按原 JSON 顺序排列，本地没有的词也保留
  const map = new Map(entries.map(e => [e.word, e]))
  unitEntries.value = unit.words.map(w => map.get(w) || { word: w, phonetic: '', frequency: 0, tags: '', exchange: '', translation: '' })
}

async function switchTab(tab: 'words' | 'guide') {
  panelTab.value = tab
  if (tab === 'guide' && selectedUnit.value && !guideHtml.value) {
    await loadGuide(selectedUnit.value)
  }
}

async function loadGuide(unit: DuoUnit) {
  guideLoading.value = true
  try {
    const filename = `${String(unit.id).padStart(3, '0')}-${unit.name}.md`
    const res = await fetch(`/data/duolingo-zs-en/${encodeURIComponent(filename)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const md = await res.text()
    guideHtml.value = await marked.parse(md) as string
  } catch (e) {
    guideHtml.value = '<p style="color:#999">暂无该单元的讲解内容</p>'
  } finally {
    guideLoading.value = false
  }
}

function selectWord(word: string) {
  emit('select-word', word)
}
</script>

<template>
  <div class="duolingo-view">
    <div class="duo-header">
      <div class="duo-stats" v-if="!loading">
        <span class="stat">{{ units.length }} 单元</span>
        <span class="stat">{{ totalWords }} 词</span>
      </div>
      <input
        v-model="searchQuery"
        class="duo-search"
        placeholder="搜索单元或单词..."
      />
    </div>

    <div v-if="loading" class="duo-loading">加载中...</div>

    <div v-else class="duo-body">
      <!-- 单元列表 -->
      <div class="unit-list">
        <div
          v-for="unit in filteredUnits"
          :key="unit.id"
          :class="['unit-card', { active: selectedUnit?.id === unit.id }]"
          @click="selectUnit(unit)"
        >
          <div class="unit-num">{{ unit.id }}</div>
          <div class="unit-info">
            <div class="unit-name">{{ unit.name }}</div>
            <div class="unit-desc">{{ unit.desc }}</div>
          </div>
          <div class="unit-count">{{ unit.words.length }} 词</div>
        </div>
      </div>

      <!-- 选中单元的词汇 / 单元讲解 -->
      <div class="word-panel" v-if="selectedUnit">
        <h4>{{ selectedUnit.id }}. {{ selectedUnit.name }}</h4>
        <p class="panel-desc">{{ selectedUnit.desc }} · {{ unitEntries.length }} 词</p>

        <div class="panel-tabs">
          <button :class="['tab-btn', { active: panelTab === 'words' }]" @click="switchTab('words')">词汇</button>
          <button :class="['tab-btn', { active: panelTab === 'guide' }]" @click="switchTab('guide')">单元讲解</button>
        </div>

        <!-- 词汇列表 -->
        <div class="word-list" v-show="panelTab === 'words'">
          <div
            v-for="item in unitEntries"
            :key="item.word"
            class="word-item"
            @click="selectWord(item.word)"
          >
            <span class="word-text">{{ item.word }}</span>
            <span class="word-phonetic" v-if="item.phonetic">{{ item.phonetic }}</span>
            <span class="word-trans">{{ (item.translation || '').split(/\\n|\n/)[0]?.slice(0, 30) }}</span>
          </div>
        </div>

        <!-- 单元讲解 -->
        <div class="guide-content" v-show="panelTab === 'guide'">
          <div v-if="guideLoading" class="guide-loading">加载讲解中...</div>
          <div v-else class="guide-body" v-html="guideHtml"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.duolingo-view {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.duo-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.duo-stats {
  display: flex;
  gap: 0.75rem;
}

.stat {
  font-size: 0.8rem;
  color: #666;
  background: #f0f0f0;
  padding: 0.2rem 0.6rem;
  border-radius: 10px;
}

.duo-search {
  flex: 1;
  min-width: 180px;
  padding: 0.4rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.85rem;
  outline: none;
}

.duo-search:focus {
  border-color: #58cc02;
  box-shadow: 0 0 0 2px rgba(88, 204, 2, 0.15);
}

.duo-loading {
  text-align: center;
  color: #999;
  padding: 2rem;
}

.duo-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  align-items: start;
}

.unit-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 520px;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.unit-card {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid #eee;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s;
}

.unit-card:hover {
  border-color: #58cc02;
  background: #f6fef0;
}

.unit-card.active {
  border-color: #58cc02;
  background: #eefbd8;
  box-shadow: 0 0 0 1px #58cc02;
}

.unit-num {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #58cc02;
  color: #fff;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
}

.unit-info {
  flex: 1;
  min-width: 0;
}

.unit-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unit-desc {
  font-size: 0.72rem;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unit-count {
  font-size: 0.7rem;
  color: #aaa;
  flex-shrink: 0;
}

.word-panel {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 1rem;
  position: sticky;
  top: 1rem;
}

.word-panel h4 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  color: #333;
}

.panel-desc {
  margin: 0 0 0.75rem;
  font-size: 0.8rem;
  color: #888;
}

.panel-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 0.75rem;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
}

.tab-btn {
  padding: 0.3rem 0.8rem;
  border: 1px solid #ddd;
  border-radius: 14px;
  background: #fafafa;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.tab-btn:hover {
  border-color: #58cc02;
  color: #58cc02;
}

.tab-btn.active {
  background: #58cc02;
  border-color: #58cc02;
  color: #fff;
  font-weight: 600;
}

.word-list {
  max-height: 420px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  border: 1px solid #eee;
  border-radius: 6px;
}

.guide-content {
  max-height: 420px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 0.75rem 1rem;
}

.guide-loading {
  text-align: center;
  color: #999;
  padding: 2rem;
  font-size: 0.85rem;
}

.guide-body {
  font-size: 0.85rem;
  line-height: 1.7;
  color: #333;
}

.guide-body :deep(h1) {
  font-size: 1.1rem;
  margin: 0 0 0.5rem;
}

.guide-body :deep(h2) {
  font-size: 0.95rem;
  margin: 1rem 0 0.4rem;
  color: #58cc02;
}

.guide-body :deep(blockquote) {
  margin: 0.5rem 0;
  padding: 0.3rem 0.75rem;
  border-left: 3px solid #58cc02;
  background: #f6fef0;
  color: #555;
  font-size: 0.8rem;
}

.guide-body :deep(ul) {
  padding-left: 1.2rem;
  margin: 0.5rem 0;
}

.guide-body :deep(li) {
  margin-bottom: 0.6rem;
}

.guide-body :deep(strong) {
  color: #2c3e50;
}

.word-item {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  border-bottom: 1px solid #f8f8f8;
  transition: background 0.1s;
}

.word-item:hover {
  background: #f0fff0;
}

.word-text {
  font-weight: 600;
  font-size: 0.9rem;
  color: #2c3e50;
  min-width: 80px;
}

.word-phonetic {
  font-size: 0.75rem;
  color: #8e44ad;
}

.word-trans {
  font-size: 0.75rem;
  color: #7f8c8d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
