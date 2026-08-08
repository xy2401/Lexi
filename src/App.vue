<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { TAG_OPTIONS, useDictStore } from './stores/dict'
import { lookupWord } from './lib/lookup-service'
import { db } from './lib/db'
import ReaderView from './components/ReaderView.vue'
import TagSwitcher from './components/TagSwitcher.vue'
import WordTooltip from './components/WordTooltip.vue'
import ExplorerTree from './components/ExplorerTree.vue'
import DictionaryTags from './components/DictionaryTags.vue'
import FollowReadPanel from './components/FollowReadPanel.vue'
import MorphNebula from './components/MorphNebula.vue'
import DuolingoView from './components/DuolingoView.vue'
import { useTTS } from './composables/useTTS'
import type { WordEntry } from './lib/db'

const dictStore = useDictStore()

// ========== 本地词库统计 ==========
const localWordCount = computed(() => dictStore.wordCount)
const dbStats = ref<{
  storageUsed: string
  storageQuota: string
  tagDistribution: { tag: string; count: number }[]
} | null>(null)

async function refreshDbStats() {
  // 存储占用
  let storageUsed = '-'
  let storageQuota = '-'
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate()
    storageUsed = formatBytes(est.usage || 0)
    storageQuota = formatBytes(est.quota || 0)
  }

  // 标签分布
  const allWords = await db.words.toArray()
  const tagMap: Record<string, number> = {}
  const knownTags = new Set(TAG_OPTIONS.map(tag => tag.id))
  for (const w of allWords) {
    if (w.tags) {
      w.tags.split(/[\s,]+/).forEach(t => {
        const tag = t.trim().toLowerCase()
        if (knownTags.has(tag as typeof TAG_OPTIONS[number]['id'])) {
          tagMap[tag] = (tagMap[tag] || 0) + 1
        }
      })
    }
  }
  const tagDistribution = TAG_OPTIONS
    .map(({ id, label }) => ({ tag: label, count: tagMap[id] || 0 }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count)

  dbStats.value = {
    storageUsed,
    storageQuota,
    tagDistribution,
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ========== 模块切换 ==========
type TabId = 'reader' | 'explorer' | 'duolingo' | 'settings'
const activeTab = ref<TabId>('reader')

// ========== Reader 模块 ==========
const inputText = ref('The quick brown fox jumps over the lazy dog. She was running happily through the beautiful garden.')
const showTooltip = ref(false)
const tooltipWord = ref('')
const tooltipData = ref<WordEntry | null>(null)
const tooltipPos = ref({ x: 0, y: 0 })
const tooltipLoading = ref(false)
const readerRecording = ref(false)

// ========== Explorer 模块 ==========
const explorerWord = ref('')
const explorerEntry = ref<WordEntry | null>(null)
const dictionaryRecording = ref(false)

const { speak, stop, voices, selectedVoice } = useTTS()

onMounted(async () => {
  await dictStore.init()
})

// ========== Reader 事件 ==========
async function handleWordClick(payload: { word: string; x: number; y: number }) {
  tooltipWord.value = payload.word
  tooltipPos.value = { x: payload.x, y: payload.y }
  showTooltip.value = true
  tooltipLoading.value = true
  tooltipData.value = null

  const result = await lookupWord(payload.word, (hotEntry) => {
    tooltipData.value = hotEntry
  })
  tooltipData.value = result.entry
  tooltipLoading.value = false
}

function closeTooltip() {
  showTooltip.value = false
}

function handleReaderRecordingChange(recording: boolean) {
  readerRecording.value = recording
  if (recording) closeTooltip()
}

function handleTooltipSpeak(word: string) {
  if (!readerRecording.value) speak(word)
}

// ========== Explorer 事件 ==========
function fmtTranslation(text: string): string {
  return text.replace(/\\r\\n|\\n/g, '\n')
}

function splitDefinition(text?: string): string[] {
  return (text || '').split(/\\n|\n/).filter(line => line.trim())
}

async function handleExplorerSelectWord(word: string) {
  stop()
  dictionaryRecording.value = false
  explorerWord.value = word
  explorerEntry.value = null

  // 立即朗读发音（不等待词典网络请求）
  speak(word)

  const result = await lookupWord(word, (hotEntry) => {
    explorerEntry.value = hotEntry
  })
  explorerEntry.value = result.entry
}

function speakExplorerWord() {
  if (explorerEntry.value && !dictionaryRecording.value) speak(explorerEntry.value.word)
}

</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1>Lexi</h1>
      <p class="subtitle">渐进式英语阅读与听说训练沙盒</p>
    </header>

    <!-- 四模块 Tab 导航 -->
    <nav class="tab-nav">
      <button :class="['tab-btn', { active: activeTab === 'reader' }]" @click="activeTab = 'reader'">
        📖 阅读器
      </button>
      <button :class="['tab-btn', { active: activeTab === 'explorer' }]" @click="activeTab = 'explorer'">
        🔍 词典浏览
      </button>
      <button :class="['tab-btn', { active: activeTab === 'duolingo' }]" @click="activeTab = 'duolingo'">
        🦉 多邻国
      </button>
      <button :class="['tab-btn', { active: activeTab === 'settings' }]" @click="activeTab = 'settings'">
        ⚙️ 设置
      </button>
    </nav>

    <!-- ===== Reader 模块 ===== -->
    <div class="tab-content" v-show="activeTab === 'reader'">
      <div class="reader-layout">
        <aside class="sidebar">
          <TagSwitcher />
          <div class="input-section">
            <label>输入文本</label>
            <textarea v-model="inputText" rows="6" placeholder="粘贴英文文本..."></textarea>
          </div>
          <div class="stats" v-if="dictStore.ready">
            <span>本地词库: {{ localWordCount }} 词</span>
            <span class="cache-info">浏览/查词时自动扩充，永久保存</span>
          </div>
          <div class="loading" v-else>
            <span>加载词库中... {{ dictStore.loadProgress }}%</span>
          </div>
        </aside>

        <main class="reader-main">
          <ReaderView
            :text="inputText"
            :active="activeTab === 'reader'"
            @word-click="handleWordClick"
            @recording-change="handleReaderRecordingChange"
          />
        </main>
      </div>
    </div>

    <!-- ===== Explorer 模块 ===== -->
    <div class="tab-content" v-show="activeTab === 'explorer'">
      <div class="explorer-layout">
        <div class="explorer-left">
          <h3>A-Z 词典树</h3>
          <TagSwitcher />
          <ExplorerTree @select-word="handleExplorerSelectWord" />
        </div>
        <div class="explorer-right">
          <h3>词条详情</h3>
          <div class="word-detail" v-if="explorerEntry">
            <div
              :class="['word-title-row', { disabled: dictionaryRecording }]"
              role="button"
              tabindex="0"
              :aria-disabled="dictionaryRecording"
              :aria-label="`朗读 ${explorerEntry.word}`"
              @click="speakExplorerWord"
              @keydown.enter="speakExplorerWord"
              @keydown.space.prevent="speakExplorerWord"
            >
              <h4>{{ explorerEntry.word }}</h4>
              <span class="speaker-icon" aria-hidden="true">🔊</span>
              <span class="phonetic" v-if="explorerEntry.phonetic">/{{ explorerEntry.phonetic }}/</span>
            </div>
            <p class="translation">{{ fmtTranslation(explorerEntry.translation) }}</p>
            <DictionaryTags class="word-tags" v-if="explorerEntry.tags" :tags="explorerEntry.tags" />
            <div class="definition-list" v-if="splitDefinition(explorerEntry.definition).length">
              <h5>Definition</h5>
              <ol>
                <li v-for="(definition, i) in splitDefinition(explorerEntry.definition)" :key="i">
                  {{ definition }}
                </li>
              </ol>
            </div>
            <p class="word-pos" v-if="explorerEntry.pos">{{ explorerEntry.pos }}</p>
          </div>
          <FollowReadPanel
            v-if="explorerEntry"
            :key="explorerEntry.word"
            class="dictionary-follow"
            :target-text="explorerEntry.word"
            :active="activeTab === 'explorer'"
            compact
            @system-read="speakExplorerWord"
            @recording-start="stop"
            @recording-change="dictionaryRecording = $event"
          />
          <MorphNebula :entry="explorerEntry" @select-word="handleExplorerSelectWord" />
        </div>
      </div>
    </div>

    <!-- ===== Duolingo 模块 ===== -->
    <div class="tab-content" v-show="activeTab === 'duolingo'">
      <DuolingoView @select-word="handleExplorerSelectWord" />
    </div>

    <!-- ===== 设置模块 ===== -->
    <div class="tab-content" v-show="activeTab === 'settings'">
      <div class="settings-layout">
        <section class="settings-section">
          <h3>🗣️ 朗读者选择</h3>
          <p class="settings-desc">选择 TTS 语音引擎，影响阅读器和词典的朗读功能</p>
          <div class="voice-select-row" v-if="voices.length">
            <select v-model="selectedVoice" class="voice-select">
              <option v-for="v in voices" :key="v.name" :value="v.name">
                {{ v.name }} ({{ v.lang }})
              </option>
            </select>
            <button class="action-btn primary" @click="speak('Hello, this is a test.')">试听</button>
          </div>
          <p v-else class="settings-desc">未检测到可用语音，请确认系统已安装英文 TTS 语音包</p>
        </section>

        <section class="settings-section">
          <h3>📚 本地词库</h3>
          <p class="settings-desc">已加载 Hot 词库并缓存 {{ localWordCount }} 个词条，查词时按需补齐完整内容</p>
          <button class="action-btn" @click="refreshDbStats" style="margin-top: 0.5rem">刷新详细统计</button>

          <div v-if="dbStats" class="db-details">
            <div class="db-row">
              <span class="db-label">存储占用</span>
              <span class="db-value">{{ dbStats.storageUsed }} / {{ dbStats.storageQuota }}</span>
            </div>
            <div class="db-row">
              <span class="db-label">数据库</span>
              <span class="db-value">lexi-dict v2 (IndexedDB/Dexie)</span>
            </div>
            <div class="db-row">
              <span class="db-label">远端词典</span>
              <span class="db-value">两字符语义分片（HTTP Range 按 SQLite 页读取）</span>
            </div>

            <h4 class="db-sub-title">标签分布</h4>
            <div class="tag-dist">
              <div v-for="item in dbStats.tagDistribution" :key="item.tag" class="tag-row">
                <span class="tag-name">{{ item.tag }}</span>
                <div class="tag-bar-bg">
                  <div class="tag-bar" :style="{ width: (item.count / dbStats.tagDistribution[0].count * 100) + '%' }"></div>
                </div>
                <span class="tag-count">{{ item.count }}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- 全局完整词条卡片 -->
    <WordTooltip
      v-if="showTooltip"
      :word="tooltipWord"
      :data="tooltipData"
      :position="tooltipPos"
      :loading="tooltipLoading"
      @close="closeTooltip"
      @speak="handleTooltipSpeak"
    />
  </div>
</template>

<style scoped>
.app-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem;
}

.app-header {
  text-align: center;
  margin-bottom: 1rem;
}

.app-header h1 {
  font-size: 2rem;
  margin: 0;
  color: #2c3e50;
}

.subtitle {
  color: #7f8c8d;
  margin: 0.25rem 0 0;
}

/* Tab 导航 */
.tab-nav {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid #eee;
  padding-bottom: 0.5rem;
}

.tab-btn {
  padding: 0.5rem 1.2rem;
  border: none;
  background: none;
  font-size: 1rem;
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  color: #666;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: #f5f5f5;
  color: #333;
}

.tab-btn.active {
  background: #3498db;
  color: #fff;
  font-weight: 600;
}

/* Reader 布局 */
.reader-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 1.5rem;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.input-section label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.input-section textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  resize: vertical;
}

.stats, .loading {
  font-size: 0.85rem;
  color: #7f8c8d;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.cache-info {
  font-size: 0.75rem;
  color: #95a5a6;
}

.reader-main {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 1.5rem;
  min-height: 400px;
}

/* Explorer 布局 */
.explorer-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  align-items: start;
}

.explorer-left {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.explorer-left h3,
.explorer-right h3 {
  margin: 0;
  font-size: 1rem;
  color: #555;
}

.explorer-right {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.word-detail {
  padding: 1rem;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fafafa;
}

.word-detail h4 {
  margin: 0;
  font-size: 1.2rem;
  color: #2c3e50;
}

.word-detail .phonetic {
  color: #8e44ad;
  font-size: 0.9rem;
  margin: 0;
}

.word-detail .translation {
  font-size: 0.85rem;
  color: #555;
  white-space: pre-line;
  margin: 0 0 0.75rem;
}

.word-tags {
  margin-bottom: 0.75rem;
}

.word-title-row {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  margin: -0.25rem -0.35rem 0.5rem;
  padding: 0.25rem 0.35rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.word-title-row:hover,
.word-title-row:focus-visible {
  background: #eef6fc;
  outline: none;
}

.word-title-row.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.word-title-row.disabled:hover,
.word-title-row.disabled:focus-visible {
  background: transparent;
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

.word-title-row:hover .speaker-icon,
.word-title-row:focus-visible .speaker-icon {
  transform: scale(1.12);
}

.definition-list {
  border-top: 1px solid #e8e8e8;
  padding-top: 0.65rem;
  margin-bottom: 0.65rem;
}

.definition-list h5 {
  margin: 0 0 0.35rem;
  color: #2c3e50;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.definition-list ol {
  margin: 0;
  padding-left: 1.2rem;
}

.definition-list li {
  margin: 0.2rem 0;
  color: #34495e;
  font-size: 0.84rem;
  line-height: 1.45;
}

.word-pos {
  color: #7f8c8d;
  font-size: 0.78rem;
  font-style: italic;
}

.action-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: opacity 0.2s;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  background: #3498db;
  color: #fff;
}

/* 设置页 */
.settings-layout {
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.settings-section {
  padding: 1.25rem;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fff;
}

.settings-section h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  color: #2c3e50;
}

.settings-desc {
  font-size: 0.85rem;
  color: #7f8c8d;
  margin: 0 0 0.75rem;
}

.voice-select-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.voice-select {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.85rem;
}

/* 数据库详情 */
.db-details {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f0f0f0;
}

.db-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.3rem 0;
  font-size: 0.8rem;
}

.db-label {
  color: #888;
}

.db-value {
  color: #333;
  font-weight: 500;
}

.db-sub-title {
  margin: 0.75rem 0 0.5rem;
  font-size: 0.8rem;
  color: #666;
}

.tag-dist {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
}

.tag-name {
  width: 40px;
  color: #555;
  text-align: right;
}

.tag-bar-bg {
  flex: 1;
  height: 12px;
  background: #f0f0f0;
  border-radius: 6px;
  overflow: hidden;
}

.tag-bar {
  height: 100%;
  background: linear-gradient(90deg, #4a90d9, #67b8f7);
  border-radius: 6px;
  transition: width 0.3s;
}

.tag-count {
  width: 50px;
  color: #888;
  font-size: 0.7rem;
}

</style>
