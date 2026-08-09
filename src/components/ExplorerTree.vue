<script setup lang="ts">
/**
 * ExplorerTree - 词典浏览
 * 本地模式：A-Z 直接过滤 IndexedDB（无需二级前缀）
 * 完整模式：A-Z → 有序逻辑分片 → 整片入库后分页查询
 */
import { ref, computed } from 'vue'
import { listDictionaryShard, type DictionaryResult } from '../lib/remote-db'
import { getLocalWordsByLetter, db, type WordEntry } from '../lib/db'
import { useDictStore } from '../stores/dict'

const dictStore = useDictStore()

const emit = defineEmits<{
  'select-word': [word: string]
}>()

// ========== 浏览模式切换 ==========
const browseMode = ref<'local' | 'remote'>('local')

// ========== 本地词库浏览 ==========
const LOCAL_LETTERS = 'abcdefghijklmnopqrstuvwxyz_'.split('')
const localLetter = ref<string | null>(null)
const localWordList = ref<WordEntry[]>([])
const localLoading = ref(false)
const filteredLocalWordList = computed(() => (
  localWordList.value.filter(word => dictStore.matchesTagFilter(word.tags))
))

async function selectLocalLetter(letter: string) {
  localLetter.value = letter
  localLoading.value = true
  if (letter === '_') {
    // 非字母开头的词
    localWordList.value = await db.words.filter(w => !/^[a-z]/i.test(w.word)).toArray()
  } else {
    localWordList.value = await getLocalWordsByLetter(letter)
  }
  localLoading.value = false
}

// ========== 统一远端词典浏览 ==========
const REMOTE_LETTERS = 'abcdefghijklmnopqrstuvwxyz_'.split('')
const SECOND_CHARS = '_abcdefghijklmnopqrstuvwxyz'.split('')

const selectedLetter = ref<string | null>(null)
const selectedPrefix = ref<string | null>(null)
const wordList = ref<DictionaryResult[]>([])
const filteredWordList = computed(() => (
  wordList.value.filter(word => dictStore.matchesTagFilter(word.tags))
))
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(false)
const REMOTE_PAGE_SIZE = 500
let requestSequence = 0

const prefixes = computed(() => {
  if (!selectedLetter.value) return []
  if (selectedLetter.value === '_') return ['__']
  return SECOND_CHARS.map(c => `${selectedLetter.value}${c}`)
})

function selectLetter(letter: string) {
  requestSequence++
  selectedLetter.value = letter
  selectedPrefix.value = null
  wordList.value = []
  hasMore.value = false
}

async function selectPrefix(prefix: string) {
  const requestId = ++requestSequence
  selectedPrefix.value = prefix
  loading.value = true
  wordList.value = []
  hasMore.value = false

  try {
    const results = await listDictionaryShard(prefix, REMOTE_PAGE_SIZE)
    if (requestId !== requestSequence) return
    wordList.value = results
    hasMore.value = results.length === REMOTE_PAGE_SIZE
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

async function loadMore() {
  const prefix = selectedPrefix.value
  if (!prefix || loadingMore.value || !hasMore.value) return

  const requestId = requestSequence
  loadingMore.value = true
  try {
    const results = await listDictionaryShard(prefix, REMOTE_PAGE_SIZE, wordList.value.length)
    if (requestId !== requestSequence) return
    wordList.value.push(...results)
    hasMore.value = results.length === REMOTE_PAGE_SIZE
  } finally {
    if (requestId === requestSequence) loadingMore.value = false
  }
}

function selectWord(word: string) {
  emit('select-word', word)
}
</script>

<template>
  <div class="explorer-tree">
    <!-- 模式切换 -->
    <div class="mode-bar">
      <button :class="['mode-btn', { active: browseMode === 'local' }]" @click="browseMode = 'local'">
        📱 本地词库
      </button>
      <button :class="['mode-btn', { active: browseMode === 'remote' }]" @click="browseMode = 'remote'">
        ☁️ 统一词典
      </button>
    </div>

    <!-- ===== 本地模式 ===== -->
    <template v-if="browseMode === 'local'">
      <div class="letter-bar">
        <button
          v-for="letter in LOCAL_LETTERS"
          :key="letter"
          :class="['letter-btn', { active: localLetter === letter }]"
          @click="selectLocalLetter(letter)"
        >
          {{ letter.toUpperCase() }}
        </button>
      </div>

      <div class="word-list" v-if="localLetter">
        <div v-if="localLoading" class="list-loading">加载中...</div>
        <template v-else>
          <div class="list-count">
            {{ filteredLocalWordList.length }} 条
            <span v-if="!dictStore.allTagsNeutral">/ 共 {{ localWordList.length }} 条</span>
          </div>
          <div
            v-for="item in filteredLocalWordList"
            :key="item.word"
            class="word-item"
            @click="selectWord(item.word)"
          >
            <span class="word-text">{{ item.word }}</span>
            <span class="word-phonetic" v-if="item.phonetic">{{ item.phonetic }}</span>
            <span class="word-trans">{{ (item.translation || '').split('\\n')[0]?.slice(0, 25) }}</span>
          </div>
        </template>
      </div>
    </template>

    <!-- ===== 统一远端词典 ===== -->
    <template v-else>
      <div class="letter-bar">
        <button
          v-for="letter in REMOTE_LETTERS"
          :key="letter"
          :class="['letter-btn', { active: selectedLetter === letter }]"
          @click="selectLetter(letter)"
        >
          {{ letter.toUpperCase() }}
        </button>
      </div>

      <div class="prefix-bar" v-if="selectedLetter">
        <button
          v-for="prefix in prefixes"
          :key="prefix"
          :class="['prefix-btn', { active: selectedPrefix === prefix }]"
          @click="selectPrefix(prefix)"
        >
          {{ prefix }}
        </button>
      </div>

      <div class="word-list" v-if="selectedPrefix">
        <div v-if="loading" class="list-loading">加载中...</div>
        <template v-else>
          <div class="list-count">
            显示 {{ filteredWordList.length }} 条
            <span v-if="!dictStore.allTagsNeutral">/ 已加载 {{ wordList.length }} 条</span>
          </div>
          <div
            v-for="item in filteredWordList"
            :key="item.word"
            class="word-item"
            @click="selectWord(item.word)"
          >
            <span class="word-text">{{ item.word }}</span>
            <span class="word-phonetic" v-if="item.phonetic">{{ item.phonetic }}</span>
            <span class="word-trans">{{ (item.translation || '').split('\\n')[0]?.slice(0, 25) }}</span>
          </div>
          <button v-if="hasMore" class="load-more-btn" :disabled="loadingMore" @click="loadMore">
            {{ loadingMore ? '加载中...' : '加载更多' }}
          </button>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.explorer-tree {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1;
  min-height: 0;
}

.mode-bar {
  display: flex;
  gap: 0.5rem;
}

.mode-btn {
  padding: 0.35rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.mode-btn.active {
  background: #2c3e50;
  border-color: #2c3e50;
  color: #fff;
}

.letter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.letter-btn {
  width: 28px;
  height: 28px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.1s;
}

.letter-btn:hover {
  border-color: #3498db;
  color: #3498db;
}

.letter-btn.active {
  background: #3498db;
  border-color: #3498db;
  color: #fff;
}

.prefix-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  max-height: 80px;
  overflow-y: auto;
}

.prefix-btn {
  padding: 2px 6px;
  border: 1px solid #eee;
  border-radius: 3px;
  background: #fafafa;
  font-size: 0.7rem;
  cursor: pointer;
  font-family: monospace;
}

.prefix-btn:hover {
  border-color: #27ae60;
  color: #27ae60;
}

.prefix-btn.active {
  background: #27ae60;
  border-color: #27ae60;
  color: #fff;
}

.word-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  border: 1px solid #eee;
  border-radius: 6px;
}

.list-loading, .list-count {
  padding: 0.5rem;
  font-size: 0.8rem;
  color: #999;
  text-align: center;
}

.load-more-btn {
  display: block;
  width: calc(100% - 1rem);
  margin: 0.5rem;
  padding: 0.5rem;
  border: 1px solid #dbe7f3;
  border-radius: 5px;
  background: #f6faff;
  color: #2878b5;
  cursor: pointer;
}

.load-more-btn:disabled {
  cursor: wait;
  opacity: 0.65;
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
  background: #f0f7ff;
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
