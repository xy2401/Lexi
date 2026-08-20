<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { TAG_OPTIONS, useDictStore } from './stores/dict'
import { lookupWord } from './lib/lookup-service'
import { db } from './lib/db'
import { getDictionaryManifest } from './lib/dictionary-manifest'
import { getWordNetManifest } from './lib/wordnet-manifest'
import ReaderWorkspace from './components/ReaderWorkspace.vue'
import LibrarySettings from './components/LibrarySettings.vue'
import ProgressSettings from './components/ProgressSettings.vue'
import TagSwitcher from './components/TagSwitcher.vue'
import WordTooltip from './components/WordTooltip.vue'
import ExplorerTree from './components/ExplorerTree.vue'
import DictionaryTags from './components/DictionaryTags.vue'
import FollowReadPanel from './components/FollowReadPanel.vue'
import MorphNebula from './components/MorphNebula.vue'
import DuolingoView from './components/DuolingoView.vue'
import WordRootView from './components/WordRootView.vue'
import ResembleView from './components/ResembleView.vue'
import LemmaView from './components/LemmaView.vue'
import WordNetView from './components/WordNetView.vue'
import SystemCourseView from './components/SystemCourseView.vue'
import { useTTS } from './composables/useTTS'
import type { WordEntry } from './lib/db'
import {
  getProgressSetting,
  isAppTabId,
  listDictionaryHistory,
  rememberDictionaryLookup,
  setProgressSetting,
  type AppTabId,
  type DictionaryHistoryEntry,
} from './lib/progress-db'
import { LEARNING_PROGRESS_AREAS, type LearningProgressArea } from './lib/learning-progress'

interface LicensedProject {
  name: string
  version?: string
  url: string
  license: string
  licenseUrl?: string
  note?: string
}

interface LicenseGroup {
  title: string
  projects: LicensedProject[]
}

const licenseGroups: LicenseGroup[] = [
  {
    title: '数据与内容来源',
    projects: [
      {
        name: 'ECDICT',
        url: 'https://github.com/skywind3000/ECDICT',
        license: 'MIT',
        licenseUrl: 'https://github.com/skywind3000/ECDICT/blob/master/LICENSE',
        note: '英汉词条、词频与考试标签',
      },
      {
        name: 'Open English WordNet',
        version: '2025 Core',
        url: 'https://en-word.net/',
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        note: '英文释义、sense 与语义关系',
      },
      {
        name: 'Standard Ebooks',
        url: 'https://standardebooks.org/',
        license: 'CC0 / Public Domain',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        note: '远程电子书正文、封面与语义 XHTML；公版判断以美国为基础',
      },
      {
        name: 'Duome',
        url: 'https://duome.eu/',
        license: '未声明开源许可',
        note: '课程单元与词汇元数据来源',
      },
      {
        name: 'Duolingo',
        url: 'https://www.duolingo.com/',
        license: '专有 / Terms of Service',
        licenseUrl: 'https://www.duolingo.com/terms',
        note: '名称及课程相关内容不受 Lexi MIT 许可覆盖',
      },
    ],
  },
  {
    title: '浏览器运行时',
    projects: [
      { name: 'Dexie.js', version: '4.4.4', url: 'https://github.com/dexie/Dexie.js', license: 'Apache-2.0', licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0' },
      { name: 'DOMPurify', version: '3.4.13', url: 'https://github.com/cure53/DOMPurify', license: 'MPL-2.0 OR Apache-2.0', licenseUrl: 'https://github.com/cure53/DOMPurify/blob/main/LICENSE' },
      { name: 'fflate', version: '0.8.3', url: 'https://github.com/101arrowz/fflate', license: 'MIT', licenseUrl: 'https://opensource.org/license/mit' },
      { name: 'Marked', version: '18.0.9', url: 'https://github.com/markedjs/marked', license: 'MIT', licenseUrl: 'https://opensource.org/license/mit' },
      { name: 'Pinia', version: '4.0.2', url: 'https://github.com/vuejs/pinia', license: 'MIT', licenseUrl: 'https://opensource.org/license/mit' },
      { name: 'Vue.js', version: '3.5.41', url: 'https://github.com/vuejs/core', license: 'MIT', licenseUrl: 'https://opensource.org/license/mit' },
      { name: 'WaveSurfer.js', version: '7.12.11', url: 'https://github.com/katspaugh/wavesurfer.js', license: 'BSD-3-Clause', licenseUrl: 'https://opensource.org/license/bsd-3-clause' },
    ],
  },
  {
    title: '构建与开发工具',
    projects: [
      { name: 'Commander.js', version: '12.1.0', url: 'https://github.com/tj/commander.js', license: 'MIT', licenseUrl: 'https://opensource.org/license/mit' },
      { name: 'CSV for Node.js', version: '5.6.0', url: 'https://github.com/adaltas/node-csv', license: 'MIT', licenseUrl: 'https://opensource.org/license/mit' },
      { name: 'fake-indexeddb', version: '6.2.5', url: 'https://github.com/dumbmatter/fakeIndexedDB', license: 'Apache-2.0', licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0' },
      { name: 'jsdom', version: '29.1.1', url: 'https://github.com/jsdom/jsdom', license: 'MIT', licenseUrl: 'https://opensource.org/license/mit' },
      { name: 'Node.js type definitions', version: '26.2.0', url: 'https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node', license: 'MIT', licenseUrl: 'https://opensource.org/license/mit' },
      { name: 'Vite Plugin Vue', version: '6.0.8', url: 'https://github.com/vitejs/vite-plugin-vue/tree/main/packages/plugin-vue', license: 'MIT', licenseUrl: 'https://opensource.org/license/mit' },
      { name: '7zip-min', version: '3.0.1', url: 'https://github.com/onikienko/7zip-min', license: 'MIT', licenseUrl: 'https://opensource.org/license/mit' },
      { name: 'TypeScript', version: '7.0.2', url: 'https://github.com/microsoft/TypeScript', license: 'Apache-2.0', licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0' },
      { name: 'Vite', version: '8.2.1', url: 'https://github.com/vitejs/vite', license: 'MIT', licenseUrl: 'https://opensource.org/license/mit' },
      { name: 'Vitest', version: '4.1.10', url: 'https://github.com/vitest-dev/vitest', license: 'MIT', licenseUrl: 'https://opensource.org/license/mit' },
      { name: 'Vue Language Tools', version: '3.3.9', url: 'https://github.com/vuejs/language-tools', license: 'MIT', licenseUrl: 'https://opensource.org/license/mit' },
    ],
  },
]

const dictStore = useDictStore()

// ========== 本地词库统计 ==========
const dbStats = ref<{
  storageUsed: string
  storageQuota: string
  tagDistribution: { tag: string; count: number }[]
  hot: {
    entries: number
    loaded: boolean
    shards: number
    version: string
  }
  main: {
    cachedEntries: number
    totalEntries: number
    cachedShards: number
    totalShards: number
  }
  wordnet: {
    indexEntries: number
    totalIndexEntries: number
    cachedLemmas: number
    totalEntries: number
    cachedSynsets: number
    totalSynsets: number
    cachedFrames: number
    totalFrames: number
    cachedEntryShards: number
    totalEntryShards: number
    cachedSynsetShards: number
    totalSynsetShards: number
    version: string
    current: boolean
    hasCache: boolean
  }
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

  const [dictionaryManifest, wordNetManifest, allWords, dictionaryVersion, wordNetVersion,
    cachedMainEntries, cachedMainShards, wordNetIndexEntries, cachedWordNetLemmas,
    cachedWordNetSynsets, cachedWordNetFrames, cachedWordNetEntryShards,
    cachedWordNetSynsetShards] = await Promise.all([
    getDictionaryManifest(),
    getWordNetManifest(),
    db.words.toArray(),
    db.meta.get('dictionaryVersion'),
    db.meta.get('wordnetVersion'),
    db.words.where('shard').above('').count(),
    db.shards.where('dictionary').equals('main').count(),
    db.wordnetIndex.count(),
    db.wordnetLemmas.count(),
    db.wordnetSynsets.count(),
    db.wordnetFrames.count(),
    db.shards.where('dictionary').equals('wordnet-entry').count(),
    db.shards.where('dictionary').equals('wordnet-synset').count(),
  ])

  // 本地 ECDICT 标签分布
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
    hot: {
      entries: dictionaryManifest.hotRows,
      loaded: dictionaryVersion?.value === dictionaryManifest.version,
      shards: Object.keys(dictionaryManifest.hot).length,
      version: dictionaryManifest.version,
    },
    main: {
      cachedEntries: cachedMainEntries,
      totalEntries: dictionaryManifest.sourceRows,
      cachedShards: cachedMainShards,
      totalShards: Object.keys(dictionaryManifest.main).length,
    },
    wordnet: {
      indexEntries: wordNetIndexEntries,
      totalIndexEntries: wordNetManifest.files['index.jsonl'].rows,
      cachedLemmas: cachedWordNetLemmas,
      totalEntries: wordNetManifest.stats.lexicalEntries,
      cachedSynsets: cachedWordNetSynsets,
      totalSynsets: wordNetManifest.stats.synsets,
      cachedFrames: cachedWordNetFrames,
      totalFrames: wordNetManifest.stats.frames,
      cachedEntryShards: cachedWordNetEntryShards,
      totalEntryShards: Object.values(wordNetManifest.files).filter(file => file.kind === 'entries').length,
      cachedSynsetShards: cachedWordNetSynsetShards,
      totalSynsetShards: Object.values(wordNetManifest.files).filter(file => file.kind === 'synsets').length,
      version: wordNetManifest.version,
      current: wordNetVersion?.value === wordNetManifest.version,
      hasCache: wordNetIndexEntries + cachedWordNetLemmas + cachedWordNetSynsets + cachedWordNetFrames > 0,
    },
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ========== 模块切换 ==========
const activeTab = ref<AppTabId>('reader')
const wordNetInitialWord = ref('bank')
const progressSettingsRefresh = ref(0)
const progressRevisions = ref<Record<LearningProgressArea, number>>(
  Object.fromEntries(LEARNING_PROGRESS_AREAS.map(area => [area, 0])) as Record<LearningProgressArea, number>,
)
let progressHydrated = false

watch(activeTab, tab => {
  if (progressHydrated) void setProgressSetting('app.activeTab', tab)
})

function openSettings() {
  activeTab.value = 'settings'
  progressSettingsRefresh.value++
  void refreshDbStats()
}

async function handleProgressCleared(area: LearningProgressArea | 'all'): Promise<void> {
  const areas = area === 'all' ? LEARNING_PROGRESS_AREAS : [area]
  for (const item of areas) progressRevisions.value[item]++
  if (area === 'all' || area === 'explorer') {
    dictionaryHistory.value = await listDictionaryHistory(12)
    explorerWord.value = ''
    explorerEntry.value = null
  }
  if (area === 'all' || area === 'wordnet') wordNetInitialWord.value = 'bank'
}

// ========== Reader 模块 ==========
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
const dictionaryHistory = ref<DictionaryHistoryEntry[]>([])

const { speak, stop, voices, selectedVoice } = useTTS()

onMounted(async () => {
  const dictionaryReady = dictStore.init()
  const [savedTab, savedWordNetWord, savedExplorerWord] = await Promise.all([
    getProgressSetting<unknown>('app.activeTab', 'reader'),
    getProgressSetting('wordnet.lastWord', 'bank'),
    getProgressSetting('explorer.lastWord', ''),
  ])
  wordNetInitialWord.value = savedWordNetWord || 'bank'
  activeTab.value = isAppTabId(savedTab) ? savedTab : 'reader'
  dictionaryHistory.value = await listDictionaryHistory(12)
  progressHydrated = true

  await dictionaryReady
  if (activeTab.value === 'explorer' && savedExplorerWord) {
    explorerWord.value = savedExplorerWord
    const result = await lookupWord(savedExplorerWord, hotEntry => {
      explorerEntry.value = hotEntry
    })
    explorerEntry.value = result.entry
  }
  if (activeTab.value === 'settings') void refreshDbStats()
})

async function recordDictionaryLookup(word: string): Promise<void> {
  await rememberDictionaryLookup(word)
  dictionaryHistory.value = await listDictionaryHistory(12)
}

// ========== Reader / Extension 事件 ==========
async function handleWordClick(payload: { word: string; x: number; y: number }) {
  void recordDictionaryLookup(payload.word)
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

async function handleExtensionSelectWord(word: string) {
  // 多词短语与句子仅朗读，不查词典；单个单词才弹出词典 Card
  if (/\s/.test(word.trim())) {
    speak(word)
    return
  }

  void recordDictionaryLookup(word)
  tooltipWord.value = word
  tooltipPos.value = { x: window.innerWidth / 2 - 190, y: 120 }
  showTooltip.value = true
  tooltipLoading.value = true
  tooltipData.value = null

  speak(word)

  const result = await lookupWord(word, (hotEntry) => {
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
  void recordDictionaryLookup(word)
  void setProgressSetting('explorer.lastWord', word)

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

function formatCount(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function openWordNet(word: string) {
  wordNetInitialWord.value = word
  activeTab.value = 'wordnet'
}

</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1>Lexi</h1>
      <p class="subtitle">渐进式英语阅读与听说训练沙盒</p>
    </header>

    <!-- 8 模块 Tab 导航 -->
    <nav class="tab-nav">
      <button :class="['tab-btn', { active: activeTab === 'reader' }]" @click="activeTab = 'reader'">
        📖 阅读器
      </button>
      <button :class="['tab-btn', { active: activeTab === 'explorer' }]" @click="activeTab = 'explorer'">
        🔍 词典浏览
      </button>
      <button :class="['tab-btn', { active: activeTab === 'wordnet' }]" @click="activeTab = 'wordnet'">
        🕸️ 语义网络
      </button>
      <button :class="['tab-btn', { active: activeTab === 'wordroot' }]" @click="activeTab = 'wordroot'">
        🌳 词根词缀
      </button>
      <button :class="['tab-btn', { active: activeTab === 'resemble' }]" @click="activeTab = 'resemble'">
        ⚖️ 近义辨析
      </button>
      <button :class="['tab-btn', { active: activeTab === 'lemma' }]" @click="activeTab = 'lemma'">
        🌿 词族演变
      </button>
      <button :class="['tab-btn', { active: activeTab === 'duolingo' }]" @click="activeTab = 'duolingo'">
        🦉 多邻国
      </button>
      <button :class="['tab-btn', { active: activeTab === 'course' }]" @click="activeTab = 'course'">
        📖 系统课程
      </button>
      <button :class="['tab-btn', { active: activeTab === 'settings' }]" @click="openSettings">
        ⚙️ 设置
      </button>
    </nav>

    <!-- ===== Reader 模块 ===== -->
    <div class="tab-content" v-show="activeTab === 'reader'">
      <ReaderWorkspace
        :key="`reader-${progressRevisions.reader}`"
        :active="activeTab === 'reader'"
        @word-click="handleWordClick"
        @recording-change="handleReaderRecordingChange"
      />
    </div>

    <!-- ===== Explorer 模块 (词典浏览) ===== -->
    <div class="tab-content" v-show="activeTab === 'explorer'">
      <!-- 最上面完整一行标签筛选 -->
      <TagSwitcher />

      <div class="explorer-layout">
        <div class="explorer-left">
          <h3>A-Z 词典树</h3>
          <div v-if="dictionaryHistory.length" class="dictionary-history" aria-label="最近查询">
            <span>最近查询</span>
            <button
              v-for="item in dictionaryHistory"
              :key="item.word"
              type="button"
              :title="`查询 ${item.viewCount} 次`"
              @click="handleExplorerSelectWord(item.word)"
            >{{ item.word }}</button>
          </div>
          <ExplorerTree :key="`explorer-${progressRevisions.explorer}`" @select-word="handleExplorerSelectWord" />
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
          <MorphNebula
            :entry="explorerEntry"
            @select-word="handleExplorerSelectWord"
            @open-wordnet="openWordNet"
          />
        </div>
      </div>
    </div>

    <!-- ===== Open English WordNet 语义网络 ===== -->
    <div class="tab-content" v-show="activeTab === 'wordnet'">
      <WordNetView :key="`wordnet-${progressRevisions.wordnet}`" :initial-word="wordNetInitialWord" :active="activeTab === 'wordnet'" />
    </div>

    <!-- ===== 词根词缀 模块 ===== -->
    <div class="tab-content" v-show="activeTab === 'wordroot'">
      <WordRootView :key="`wordroot-${progressRevisions.wordroot}`" @select-word="handleExtensionSelectWord" @speak-word="speak" />
    </div>

    <!-- ===== 近义辨析 模块 ===== -->
    <div class="tab-content" v-show="activeTab === 'resemble'">
      <ResembleView :key="`resemble-${progressRevisions.resemble}`" @select-word="handleExtensionSelectWord" @speak-word="speak" />
    </div>

    <!-- ===== 词族演变 模块 ===== -->
    <div class="tab-content" v-show="activeTab === 'lemma'">
      <LemmaView :key="`lemma-${progressRevisions.lemma}`" @select-word="handleExtensionSelectWord" @speak-word="speak" />
    </div>

    <!-- ===== Duolingo 模块 ===== -->
    <div class="tab-content" v-show="activeTab === 'duolingo'">
      <DuolingoView :key="`duolingo-${progressRevisions.duolingo}`" @select-word="handleExplorerSelectWord" />
    </div>

    <!-- ===== 系统课程 模块 ===== -->
    <div class="tab-content" v-show="activeTab === 'course'">
      <SystemCourseView :key="`course-${progressRevisions.course}`" @select-word="handleExtensionSelectWord" />
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
          <p class="settings-desc">ECDICT Hot 全量加载；ECDICT Main 与 WordNet 按需下载 JSONL 分片并持久缓存</p>
          <button class="action-btn" @click="refreshDbStats" style="margin-top: 0.5rem">刷新详细统计</button>

          <div v-if="dbStats" class="db-details">
            <div class="db-row">
              <span class="db-label">存储占用</span>
              <span class="db-value">{{ dbStats.storageUsed }} / {{ dbStats.storageQuota }}</span>
            </div>
            <div class="db-row">
              <span class="db-label">数据库</span>
              <span class="db-value">lexi-dict v3 (IndexedDB/Dexie)</span>
            </div>
            <div class="db-row">
              <span class="db-label">远端词典</span>
              <span class="db-value">JSONL 逻辑分片（整片解析并持久缓存）</span>
            </div>

            <div class="dictionary-status-grid">
              <article class="dictionary-status-card">
                <div class="dictionary-status-head">
                  <strong>ECDICT Hot</strong>
                  <span :class="['dictionary-status', { 'is-ready': dbStats.hot.loaded }]">
                    {{ dbStats.hot.loaded ? '全量已加载' : '等待加载' }}
                  </span>
                </div>
                <div class="dictionary-status-value">{{ formatCount(dbStats.hot.entries) }} 词条</div>
                <div class="dictionary-status-meta">
                  {{ dbStats.hot.loaded ? dbStats.hot.shards : 0 }}/{{ dbStats.hot.shards }} 分片 · {{ dbStats.hot.version }}
                </div>
              </article>

              <article class="dictionary-status-card">
                <div class="dictionary-status-head">
                  <strong>ECDICT Main</strong>
                  <span class="dictionary-status is-demand">按需缓存</span>
                </div>
                <div class="dictionary-status-value">
                  {{ formatCount(dbStats.main.cachedEntries) }} / {{ formatCount(dbStats.main.totalEntries) }} 词条
                </div>
                <div class="dictionary-status-meta">
                  {{ formatCount(dbStats.main.cachedShards) }}/{{ formatCount(dbStats.main.totalShards) }} 分片
                </div>
              </article>

              <article class="dictionary-status-card">
                <div class="dictionary-status-head">
                  <strong>Open English WordNet</strong>
                  <span :class="['dictionary-status', {
                    'is-demand': dbStats.wordnet.current,
                    'is-stale': !dbStats.wordnet.current && dbStats.wordnet.hasCache,
                  }]">
                    {{ dbStats.wordnet.current
                      ? '按需缓存'
                      : dbStats.wordnet.hasCache ? '版本待更新' : '尚未初始化' }}
                  </span>
                </div>
                <div class="dictionary-status-value">
                  {{ formatCount(dbStats.wordnet.cachedLemmas) }} lemma ·
                  {{ formatCount(dbStats.wordnet.cachedSynsets) }} synset
                </div>
                <div class="dictionary-status-meta">
                  索引 {{ formatCount(dbStats.wordnet.indexEntries) }}/{{ formatCount(dbStats.wordnet.totalIndexEntries) }} ·
                  entry 分片 {{ dbStats.wordnet.cachedEntryShards }}/{{ dbStats.wordnet.totalEntryShards }} ·
                  synset 分片 {{ dbStats.wordnet.cachedSynsetShards }}/{{ dbStats.wordnet.totalSynsetShards }} ·
                  frame {{ dbStats.wordnet.cachedFrames }}/{{ dbStats.wordnet.totalFrames }}
                </div>
              </article>
            </div>

            <h4 class="db-sub-title">标签分布</h4>
            <div class="tag-dist">
              <div v-for="item in dbStats.tagDistribution" :key="item.tag" class="tag-row">
                <span class="tag-name">{{ item.tag }}</span>
                <div class="tag-race-track">
                  <div
                    class="tag-race-fill"
                    :style="{ width: (item.count / (dbStats.tagDistribution[0]?.count || 1) * 100) + '%' }"
                  ></div>
                </div>
                <span class="tag-count">{{ formatCount(item.count) }}</span>
              </div>
            </div>
          </div>
        </section>

        <LibrarySettings />

        <ProgressSettings :refresh-token="progressSettingsRefresh" @cleared="handleProgressCleared" />

        <section class="settings-section licenses-section">
          <h3>📜 LICENSES</h3>
          <p class="settings-desc">
            Lexi 原创代码采用 MIT 许可；数据、内容和第三方依赖分别遵循各自许可。
          </p>

          <div v-for="group in licenseGroups" :key="group.title" class="license-group">
            <h4 class="license-group-title">{{ group.title }}</h4>
            <div class="license-list">
              <div v-for="project in group.projects" :key="project.name" class="license-row">
                <div class="license-project">
                  <div class="license-project-line">
                    <a :href="project.url" target="_blank" rel="noopener noreferrer">{{ project.name }}</a>
                    <span v-if="project.version" class="license-version">{{ project.version }}</span>
                  </div>
                  <span v-if="project.note" class="license-note">{{ project.note }}</span>
                </div>
                <a
                  v-if="project.licenseUrl"
                  class="license-badge"
                  :href="project.licenseUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >{{ project.license }}</a>
                <span v-else class="license-badge is-plain">{{ project.license }}</span>
              </div>
            </div>
          </div>

          <p class="license-disclaimer">
            列出来源不构成额外授权、隶属或背书。完整说明见仓库根目录
            <a href="https://github.com/xy2401/Lexi/blob/main/LICENSES" target="_blank" rel="noopener noreferrer">LICENSES</a>。
          </p>
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
  flex-wrap: wrap;
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

/* Explorer 布局 */
.explorer-layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.5rem;
  align-items: start;
}

.explorer-left {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: min(860px, calc(100vh - 260px));
  min-width: 0;
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
  min-width: 0;
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
  display: grid;
  grid-template-columns: minmax(0, 600px) minmax(360px, 1fr);
  align-items: start;
  gap: 1.5rem;
}

.dictionary-history {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
}

.dictionary-history > span {
  color: #95a5a6;
  font-size: 0.68rem;
}

.dictionary-history button {
  padding: 0.18rem 0.42rem;
  border: 1px solid #e0e6e9;
  border-radius: 999px;
  background: #fff;
  color: #607080;
  font-size: 0.68rem;
  cursor: pointer;
}

.dictionary-history button:hover {
  border-color: #8ec7ea;
  color: #2476b7;
}

.licenses-section {
  grid-column: 2;
  grid-row: 1 / span 4;
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

.license-group + .license-group {
  margin-top: 0.85rem;
}

.license-group-title {
  margin: 0 0 0.35rem;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 600;
}

.license-list {
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
}

.license-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.6rem;
  background: #fafafa;
}

.license-row + .license-row {
  border-top: 1px solid #edf0f3;
}

.license-project {
  min-width: 0;
}

.license-project-line {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.license-project-line a {
  overflow: hidden;
  color: #2563eb;
  font-size: 0.78rem;
  font-weight: 600;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.license-project-line a:hover,
.license-disclaimer a:hover {
  text-decoration: underline;
}

.license-version,
.license-note {
  color: #94a3b8;
  font-size: 0.65rem;
}

.license-version {
  flex: 0 0 auto;
}

.license-note {
  display: block;
  margin-top: 0.12rem;
  line-height: 1.35;
}

.license-badge {
  flex: 0 0 auto;
  min-width: 5.7rem;
  padding: 0.15rem 0.38rem;
  border: 1px solid #dbe5ef;
  border-radius: 4px;
  background: #f8fafc;
  color: #475569;
  font-size: 0.63rem;
  line-height: 1.25;
  text-align: center;
  text-decoration: none;
  white-space: nowrap;
  box-sizing: border-box;
}

.license-badge:hover {
  border-color: #93c5fd;
  color: #2563eb;
}

.license-badge.is-plain {
  color: #9a6700;
  border-color: #f5df9b;
  background: #fef9e7;
}

.license-disclaimer {
  margin: 0.8rem 0 0;
  color: #7f8c8d;
  font-size: 0.68rem;
  line-height: 1.5;
}

.license-disclaimer a {
  color: #2563eb;
}

.dictionary-status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
  margin-top: 0.75rem;
}

.dictionary-status-card {
  min-width: 0;
  padding: 0.7rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fafafa;
}

.dictionary-status-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  color: #334155;
  font-size: 0.76rem;
}

.dictionary-status {
  flex: 0 0 auto;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 0.65rem;
  white-space: nowrap;
}

.dictionary-status.is-ready {
  background: #ecfdf5;
  color: #047857;
}

.dictionary-status.is-demand {
  background: #eff6ff;
  color: #2563eb;
}

.dictionary-status.is-stale {
  background: #fff7ed;
  color: #c2410c;
}

.dictionary-status-value {
  margin-top: 0.55rem;
  color: #1f2937;
  font-size: 0.78rem;
  font-weight: 600;
}

.dictionary-status-meta {
  margin-top: 0.25rem;
  color: #7c8798;
  font-size: 0.66rem;
  line-height: 1.45;
}

.tag-dist {
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
}

.tag-row {
  display: grid;
  grid-template-columns: 5.75rem minmax(5rem, 1fr) 3.4rem;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
}

.tag-name {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 5.75rem;
  width: 5.75rem;
  padding: 0.12rem 0.4rem;
  border: 1px solid #f5df9b;
  border-radius: 4px;
  background: #fef9e7;
  color: #b9770e;
  font-weight: 500;
  line-height: 1.35;
  white-space: nowrap;
  box-sizing: border-box;
}

.tag-count {
  color: #888;
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.tag-race-track {
  height: 0.55rem;
  overflow: hidden;
  border-radius: 999px;
  background: #f1f5f9;
}

.tag-race-fill {
  height: 100%;
  min-width: 0.2rem;
  border-radius: inherit;
  background: linear-gradient(90deg, #4a90d9, #67b8f7);
  transition: width 0.3s ease;
}

@media (max-width: 900px) {
  .settings-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .licenses-section {
    grid-column: 1;
    grid-row: auto;
  }

  .dictionary-status-grid {
    grid-template-columns: 1fr;
  }
}

</style>
