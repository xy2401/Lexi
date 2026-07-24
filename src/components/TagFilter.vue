<script setup lang="ts">
/**
 * TagFilter - 标签过滤器阵列
 * 多选条件过滤，基于本地 IndexedDB 检索
 */
import { ref, computed } from 'vue'
import { db, type WordEntry } from '../lib/db'
import { useTTS } from '../composables/useTTS'

const { speak, stop, speaking } = useTTS()

// 过滤条件
const selectedTags = ref<string[]>([])
const searchText = ref('')
const results = ref<WordEntry[]>([])
const searching = ref(false)
const autoReading = ref(false)

const TAG_OPTIONS = [
  { id: 'cet4', label: 'CET-4' },
  { id: 'cet6', label: 'CET-6' },
  { id: 'ielts', label: 'IELTS' },
  { id: 'toefl', label: 'TOEFL' },
  { id: 'gre', label: 'GRE' },
  { id: 'kyan', label: '考研' },
]

const emit = defineEmits<{
  'select-word': [word: string]
}>()

function toggleTag(tagId: string) {
  const idx = selectedTags.value.indexOf(tagId)
  if (idx >= 0) {
    selectedTags.value.splice(idx, 1)
  } else {
    selectedTags.value.push(tagId)
  }
}

async function doSearch() {
  searching.value = true
  try {
    let collection = db.words.orderBy('word')

    if (selectedTags.value.length > 0) {
      // 过滤包含选中标签的词
      const allWords = await collection.toArray()
      results.value = allWords.filter(w => {
        const tags = (w.tags || '').toLowerCase()
        return selectedTags.value.some(t => tags.includes(t))
      }).slice(0, 200)
    } else {
      results.value = await collection.limit(200).toArray()
    }

    // 文本搜索过滤
    if (searchText.value.trim()) {
      const q = searchText.value.toLowerCase()
      results.value = results.value.filter(w => w.word.includes(q))
    }
  } finally {
    searching.value = false
  }
}

// 一键流式自动点读
let readIndex = 0
async function autoRead() {
  if (autoReading.value) {
    autoReading.value = false
    stop()
    return
  }

  autoReading.value = true
  readIndex = 0

  for (let i = 0; i < results.value.length && autoReading.value; i++) {
    readIndex = i
    const word = results.value[i].word
    speak(word)
    // 等待朗读完成
    await new Promise(resolve => setTimeout(resolve, 1200))
  }
  autoReading.value = false
}
</script>

<template>
  <div class="tag-filter">
    <div class="filter-tags">
      <button
        v-for="tag in TAG_OPTIONS"
        :key="tag.id"
        :class="['filter-btn', { active: selectedTags.includes(tag.id) }]"
        @click="toggleTag(tag.id)"
      >
        {{ tag.label }}
      </button>
    </div>

    <div class="search-row">
      <input v-model="searchText" placeholder="搜索单词..." @keyup.enter="doSearch" />
      <button class="search-btn" @click="doSearch">检索</button>
    </div>

    <div class="results-header" v-if="results.length">
      <span>{{ results.length }} 条结果</span>
      <button class="auto-read-btn" @click="autoRead">
        {{ autoReading ? '停止' : '自动点读' }}
      </button>
    </div>

    <div class="card-wall" v-if="results.length">
      <div
        v-for="(item, idx) in results"
        :key="item.word"
        :class="['word-card', { reading: autoReading && idx === readIndex }]"
        @click="emit('select-word', item.word)"
      >
        <span class="card-word">{{ item.word }}</span>
        <span class="card-trans">{{ (item.translation || '').split('\\n')[0]?.slice(0, 20) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tag-filter {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.filter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.filter-btn {
  padding: 0.2rem 0.5rem;
  border: 1px solid #ddd;
  border-radius: 12px;
  background: #fff;
  font-size: 0.75rem;
  cursor: pointer;
}

.filter-btn.active {
  background: #9b59b6;
  border-color: #9b59b6;
  color: #fff;
}

.search-row {
  display: flex;
  gap: 0.5rem;
}

.search-row input {
  flex: 1;
  padding: 0.4rem 0.6rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.85rem;
}

.search-btn {
  padding: 0.4rem 0.8rem;
  background: #3498db;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  color: #888;
}

.auto-read-btn {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border: 1px solid #27ae60;
  color: #27ae60;
  background: none;
  border-radius: 4px;
  cursor: pointer;
}

.card-wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
  max-height: 300px;
  overflow-y: auto;
}

.word-card {
  padding: 0.5rem;
  border: 1px solid #eee;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.word-card:hover {
  border-color: #3498db;
  background: #f0f7ff;
}

.word-card.reading {
  border-color: #27ae60;
  background: #eafaf1;
}

.card-word {
  display: block;
  font-weight: 600;
  font-size: 0.85rem;
}

.card-trans {
  display: block;
  font-size: 0.7rem;
  color: #888;
  margin-top: 0.2rem;
}
</style>
