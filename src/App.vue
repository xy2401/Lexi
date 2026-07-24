<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useDictStore } from './stores/dict'
import { lookupWord } from './lib/lookup-service'
import { getWordCount, db } from './lib/db'
import ReaderView from './components/ReaderView.vue'
import TagSwitcher from './components/TagSwitcher.vue'
import WordTooltip from './components/WordTooltip.vue'
import WordDrawer from './components/WordDrawer.vue'
import ExplorerTree from './components/ExplorerTree.vue'
import TagFilter from './components/TagFilter.vue'
import MorphNebula from './components/MorphNebula.vue'
import SpectrogramCompare from './components/SpectrogramCompare.vue'
import DuolingoView from './components/DuolingoView.vue'
import { useTTS } from './composables/useTTS'
import { useRecorder } from './composables/useRecorder'
import type { WordEntry } from './lib/db'

const dictStore = useDictStore()

// ========== 本地词库统计 ==========
const localWordCount = ref(0)
const dbStats = ref<{
  storageUsed: string
  storageQuota: string
  tagDistribution: { tag: string; count: number }[]
} | null>(null)

async function refreshLocalCount() {
  localWordCount.value = await getWordCount()
}

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
  for (const w of allWords) {
    if (w.tags) {
      w.tags.split(/[\s,]+/).forEach(t => {
        if (t.trim()) tagMap[t.trim()] = (tagMap[t.trim()] || 0) + 1
      })
    }
  }
  const tagDistribution = Object.entries(tagMap)
    .map(([tag, count]) => ({ tag, count }))
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
type TabId = 'reader' | 'explorer' | 'duolingo' | 'audio' | 'settings'
const activeTab = ref<TabId>('reader')

// ========== Reader 模块 ==========
const inputText = ref('The quick brown fox jumps over the lazy dog. She was running happily through the beautiful garden.')
const showTooltip = ref(false)
const tooltipWord = ref('')
const tooltipData = ref<any>(null)
const tooltipPos = ref({ x: 0, y: 0 })
const tooltipLoading = ref(false)
const showDrawer = ref(false)
const drawerWord = ref('')

// ========== Explorer 模块 ==========
const explorerWord = ref('')
const explorerEntry = ref<WordEntry | null>(null)

// ========== Audio Lab 模块 ==========
const { speak, stop, speaking, voices, selectedVoice } = useTTS()
const { recording, audioBlob, audioUrl, error: recorderError, startRecording, stopRecording } = useRecorder()
const practiceText = ref('The quick brown fox jumps over the lazy dog.')
const referenceAudio = ref<Blob | null>(null)

onMounted(async () => {
  await dictStore.init()
  await refreshLocalCount()
})

// ========== Reader 事件 ==========
async function handleWordClick(payload: { word: string; x: number; y: number }) {
  tooltipWord.value = payload.word
  tooltipPos.value = { x: payload.x, y: payload.y }
  showTooltip.value = true
  tooltipLoading.value = true

  const localData = dictStore.lookup(payload.word)
  if (localData) {
    tooltipData.value = localData
    tooltipLoading.value = false
    return
  }

  tooltipData.value = null
  const result = await lookupWord(payload.word)
  tooltipData.value = result.entry
  tooltipLoading.value = false
}

function closeTooltip() {
  showTooltip.value = false
}

function openDrawer(word: string) {
  showTooltip.value = false
  drawerWord.value = word
  showDrawer.value = true
}

function closeDrawer() {
  showDrawer.value = false
}

// ========== Explorer 事件 ==========
async function handleExplorerSelectWord(word: string) {
  explorerWord.value = word
  const localData = dictStore.lookup(word)
  if (localData) {
    explorerEntry.value = localData
  } else {
    const result = await lookupWord(word)
    explorerEntry.value = result.entry as WordEntry | null
  }
  // 朗读
  speak(word)
}

// ========== Audio Lab 事件 ==========
function speakPractice() {
  speak(practiceText.value)
}

function stopPractice() {
  stop()
}

async function handleRecord() {
  if (recording.value) {
    stopRecording()
  } else {
    await startRecording()
  }
}

// 播放标准发音并录制声谱
const capturingReference = ref(false)

async function speakReference() {
  if (capturingReference.value) return
  capturingReference.value = true
  referenceAudio.value = null

  try {
    // 同时开启麦克风录制 TTS 输出
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = () => {
      referenceAudio.value = new Blob(chunks, { type: 'audio/webm' })
      stream.getTracks().forEach(t => t.stop())
      capturingReference.value = false
    }

    recorder.start()

    // 提前 1s 录制，等 MediaRecorder 管道就绪后再朗读，避免丢开头
    await new Promise(r => setTimeout(r, 1000))
    speak(practiceText.value, () => {})

    // 监听 TTS 结束
    const checkEnd = setInterval(() => {
      if (!speaking.value) {
        clearInterval(checkEnd)
        // 延迟 200ms 确保尾部音频被捕获
        setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop()
        }, 200)
      }
    }, 100)

    // 安全超时：最多 30 秒
    setTimeout(() => {
      clearInterval(checkEnd)
      if (recorder.state !== 'inactive') recorder.stop()
    }, 30000)
  } catch (e: any) {
    capturingReference.value = false
    // 麦克风不可用时仅朗读
    speak(practiceText.value)
  }
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
      <button :class="['tab-btn', { active: activeTab === 'audio' }]" @click="activeTab = 'audio'">
        🎙️ 音频沙盒
      </button>
      <button :class="['tab-btn', { active: activeTab === 'settings' }]" @click="activeTab = 'settings'">
        ⚙️ 设置
      </button>
    </nav>

    <!-- ===== Reader 模块 ===== -->
    <div class="tab-content" v-show="activeTab === 'reader'">
      <div class="reader-layout">
        <aside class="sidebar">
          <TagSwitcher v-model="dictStore.difficultyLevel" />
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
            :difficulty="dictStore.difficultyLevel"
            @word-click="handleWordClick"
          />
        </main>
      </div>
    </div>

    <!-- ===== Explorer 模块 ===== -->
    <div class="tab-content" v-show="activeTab === 'explorer'">
      <div class="explorer-layout">
        <div class="explorer-left">
          <h3>A-Z 词典树</h3>
          <ExplorerTree @select-word="handleExplorerSelectWord" />
        </div>
        <div class="explorer-center">
          <h3>标签过滤</h3>
          <TagFilter @select-word="handleExplorerSelectWord" />
        </div>
        <div class="explorer-right">
          <MorphNebula :entry="explorerEntry" @select-word="handleExplorerSelectWord" />
          <div class="word-detail" v-if="explorerEntry">
            <h4>{{ explorerEntry.word }}</h4>
            <p class="phonetic" v-if="explorerEntry.phonetic">/{{ explorerEntry.phonetic }}/</p>
            <p class="translation">{{ explorerEntry.translation }}</p>
            <button class="speak-btn" @click="speak(explorerEntry!.word)">🔊 朗读</button>
            <button class="detail-btn" @click="openDrawer(explorerEntry!.word)">📋 详细释义</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== Duolingo 模块 ===== -->
    <div class="tab-content" v-show="activeTab === 'duolingo'">
      <DuolingoView @select-word="handleExplorerSelectWord" />
    </div>

    <!-- ===== Audio Lab 模块 ===== -->
    <div class="tab-content" v-show="activeTab === 'audio'">
      <div class="audio-layout">
        <div class="audio-controls">
          <h3>跟读练习</h3>
          <div class="practice-input">
            <textarea v-model="practiceText" rows="3" placeholder="输入要练习的句子..."></textarea>
          </div>

          <div class="btn-group">
            <button class="action-btn primary" @click="speakReference" :disabled="speaking || capturingReference">
              {{ capturingReference ? '🎙️ 正在录制声谱...' : '🔊 播放标准发音' }}
            </button>
            <button class="action-btn danger" @click="stopPractice" v-if="speaking">
              ⏹ 停止
            </button>
            <button
              :class="['action-btn', recording ? 'danger' : 'success']"
              @click="handleRecord"
            >
              {{ recording ? '⏹ 停止录音' : '🎤 开始录音' }}
            </button>
          </div>

          <p class="error-msg" v-if="recorderError">{{ recorderError }}</p>

          <div class="recording-playback" v-if="audioUrl">
            <h4>录音回放</h4>
            <audio :src="audioUrl" controls></audio>
          </div>
        </div>

        <div class="audio-spectrogram">
          <SpectrogramCompare
            :reference-audio="referenceAudio"
            :user-audio="audioBlob"
          />
        </div>
      </div>
    </div>

    <!-- ===== 设置模块 ===== -->
    <div class="tab-content" v-show="activeTab === 'settings'">
      <div class="settings-layout">
        <section class="settings-section">
          <h3>🗣️ 朗读者选择</h3>
          <p class="settings-desc">选择 TTS 语音引擎，影响所有朗读功能（阅读器、词典、跟读）</p>
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
          <p class="settings-desc">已缓存 {{ localWordCount }} 词条（初始热词 57,818 + 浏览/查词自动扩充）</p>
          <button class="action-btn" @click="refreshDbStats" style="margin-top: 0.5rem">刷新详细统计</button>

          <div v-if="dbStats" class="db-details">
            <div class="db-row">
              <span class="db-label">存储占用</span>
              <span class="db-value">{{ dbStats.storageUsed }} / {{ dbStats.storageQuota }}</span>
            </div>
            <div class="db-row">
              <span class="db-label">数据库</span>
              <span class="db-value">lexi-dict v1 (IndexedDB/Dexie)</span>
            </div>
            <div class="db-row">
              <span class="db-label">远端分片总数</span>
              <span class="db-value">711 (ecdict) + 710 (stardict) = 1421 个 .db</span>
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

    <!-- 全局 Tooltip & Drawer -->
    <WordTooltip
      v-if="showTooltip"
      :word="tooltipWord"
      :data="tooltipData"
      :position="tooltipPos"
      :loading="tooltipLoading"
      @close="closeTooltip"
      @open-drawer="openDrawer"
    />

    <WordDrawer
      :word="drawerWord"
      :visible="showDrawer"
      @close="closeDrawer"
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
  grid-template-columns: 1fr 1fr 300px;
  gap: 1.5rem;
}

.explorer-left h3,
.explorer-center h3 {
  margin: 0 0 0.75rem;
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
  margin: 0 0 0.3rem;
  font-size: 1.2rem;
  color: #2c3e50;
}

.word-detail .phonetic {
  color: #8e44ad;
  font-size: 0.9rem;
  margin: 0 0 0.5rem;
}

.word-detail .translation {
  font-size: 0.85rem;
  color: #555;
  white-space: pre-line;
  margin: 0 0 0.75rem;
}

.speak-btn, .detail-btn {
  padding: 0.3rem 0.6rem;
  border: 1px solid #3498db;
  background: none;
  color: #3498db;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  margin-right: 0.5rem;
}

.speak-btn:hover, .detail-btn:hover {
  background: #ebf5fb;
}

/* Audio Lab 布局 */
.audio-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.audio-controls h3 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  color: #555;
}

.practice-input textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  resize: vertical;
}

.voice-selector {
  margin: 0.75rem 0;
  font-size: 0.85rem;
}

.voice-selector select {
  margin-left: 0.5rem;
  padding: 0.3rem;
  border-radius: 4px;
  border: 1px solid #ddd;
}

.btn-group {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.75rem;
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

.action-btn.success {
  background: #27ae60;
  color: #fff;
}

.action-btn.danger {
  background: #e74c3c;
  color: #fff;
}

.error-msg {
  color: #e74c3c;
  font-size: 0.8rem;
  margin-top: 0.5rem;
}

.recording-playback {
  margin-top: 1rem;
}

.recording-playback h4 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
  color: #555;
}

.recording-playback audio {
  width: 100%;
}

.audio-spectrogram {
  padding: 1rem;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fafafa;
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
