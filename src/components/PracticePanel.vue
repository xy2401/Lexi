<script setup lang="ts">
/**
 * PracticePanel - 单元练习面板
 * 三种模式：发音配对 / 发音填写 / 看中文选英文
 * 错题复现：答错的题重新插入队列末尾，直到答对
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useTTS } from '../composables/useTTS'
import type { WordEntry } from '../lib/db'
import { CORRECT_ADVANCE_MS, WRONG_ADVANCE_MS } from '../lib/quiz-timing'
import type { QuizCompletionResult } from '../lib/progress-db'

type Mode = 'match' | 'spell' | 'translate'

const props = withDefaults(defineProps<{
  words: string[]
  entries: WordEntry[]
  initialMode?: Mode
  singleMode?: boolean
}>(), {
  initialMode: 'match',
  singleMode: false,
})

const emit = defineEmits<{
  complete: [result: QuizCompletionResult]
}>()

const { speak } = useTTS()

// ========== 模式 & 阶段 ==========
const mode = ref<Mode>(props.initialMode)
const phase = ref<'playing' | 'result'>('playing')

// ========== 题目队列 ==========
interface Question {
  word: string
  options: string[]    // match / translate 模式的 4 个选项
  hint: string         // spell 模式的首字母提示
  translation: string  // translate 模式的中文释义
}

const queue = ref<Question[]>([])
const currentIndex = ref(0)
const totalQuestions = ref(0)
const answeredCount = ref(0)

// ========== 答题状态 ==========
const selectedOption = ref<string | null>(null)
const isCorrect = ref<boolean | null>(null)
const spellInput = ref('')
const showAnswer = ref(false)
const transitioning = ref(false)

// ========== 得分 ==========
const totalAttempts = ref(0)
const firstTryCorrect = ref(0)
const wrongWords = ref<Set<string>>(new Set())

const currentQuestion = computed(() => queue.value[currentIndex.value] || null)

const progressText = computed(() => {
  return `${Math.min(answeredCount.value + 1, totalQuestions.value)} / ${totalQuestions.value}`
})

// ========== 工具函数 ==========
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickRandom<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n)
}

function getTranslation(word: string): string {
  const entry = props.entries.find(e => e.word === word)
  if (!entry?.translation) return ''
  // 取第一行，去掉词性前缀
  const firstLine = entry.translation.split(/\\n|\n/)[0] || ''
  return firstLine.replace(/^[a-z]+\.\s*/i, '').slice(0, 25)
}

function generateOptions(target: string): string[] {
  const others = props.words.filter(w => w !== target)
  const distractors = pickRandom(others, Math.min(3, others.length))
  return shuffle([target, ...distractors])
}

function makeHint(word: string): string {
  if (word.length <= 1) return word[0] || '_'
  return word[0] + '_'.repeat(word.length - 1)
}

// ========== 轮次初始化 ==========
function startRound() {
  // 每一关至少抽 10 题；中文选词先过滤可用释义，避免随机抽样后题量缩水。
  const candidates = mode.value === 'translate'
    ? shuffle(props.words).filter(word => getTranslation(word))
    : shuffle(props.words)
  const pool = candidates.slice(0, Math.min(10, candidates.length))

  if (pool.length === 0) return

  queue.value = pool.map(word => ({
    word,
    options: generateOptions(word),
    hint: makeHint(word),
    translation: getTranslation(word),
  }))

  totalQuestions.value = queue.value.length
  currentIndex.value = 0
  answeredCount.value = 0
  totalAttempts.value = 0
  firstTryCorrect.value = 0
  wrongWords.value = new Set()
  phase.value = 'playing'
  resetAnswerState()

  // 自动发音（match / spell）
  if (mode.value !== 'translate') {
    nextTick(() => speak(queue.value[0].word))
  }
}

function resetAnswerState() {
  selectedOption.value = null
  isCorrect.value = null
  spellInput.value = ''
  showAnswer.value = false
  transitioning.value = false
}

// ========== 答题逻辑 ==========
function handleOptionClick(option: string) {
  if (transitioning.value) return
  if (mode.value === 'translate') speak(option)
  selectedOption.value = option
  totalAttempts.value++

  const correct = option === currentQuestion.value!.word
  isCorrect.value = correct

  if (correct) {
    if (!wrongWords.value.has(currentQuestion.value!.word)) {
      firstTryCorrect.value++
    }
    answeredCount.value++
    transitioning.value = true
    setTimeout(() => advance(), CORRECT_ADVANCE_MS)
  } else {
    wrongWords.value.add(currentQuestion.value!.word)
    showAnswer.value = true
    transitioning.value = true
    // 错题插入队列末尾
    queue.value.push({ ...currentQuestion.value! })
    totalQuestions.value++
    setTimeout(() => advance(), WRONG_ADVANCE_MS)
  }
}

function handleSpellSubmit() {
  if (transitioning.value || !spellInput.value.trim()) return
  const answer = spellInput.value.trim().toLowerCase()
  const target = currentQuestion.value!.word.toLowerCase()
  totalAttempts.value++

  if (answer === target) {
    isCorrect.value = true
    if (!wrongWords.value.has(currentQuestion.value!.word)) {
      firstTryCorrect.value++
    }
    answeredCount.value++
    transitioning.value = true
    setTimeout(() => advance(), CORRECT_ADVANCE_MS)
  } else {
    isCorrect.value = false
    wrongWords.value.add(currentQuestion.value!.word)
    showAnswer.value = true
    transitioning.value = true
    queue.value.push({ ...currentQuestion.value! })
    totalQuestions.value++
    setTimeout(() => advance(), WRONG_ADVANCE_MS)
  }
}

function advance() {
  currentIndex.value++
  if (currentIndex.value >= queue.value.length) {
    phase.value = 'result'
    emit('complete', {
      accuracy: accuracy.value,
      totalQuestions: totalQuestions.value,
      totalAttempts: totalAttempts.value,
      wrongWords: [...wrongWords.value],
    })
    return
  }
  resetAnswerState()
  // 自动发音
  if (mode.value !== 'translate' && currentQuestion.value) {
    nextTick(() => speak(currentQuestion.value!.word))
  }
}

function replaySound() {
  if (currentQuestion.value) {
    speak(currentQuestion.value.word)
  }
}

// ========== 模式切换 ==========
function switchMode(m: Mode) {
  mode.value = m
  startRound()
}

// ========== 监听词表变化 ==========
watch(() => props.words, () => {
  startRound()
}, { immediate: true })

// 结果统计
const accuracy = computed(() => {
  if (totalAttempts.value === 0) return 0
  return Math.round((firstTryCorrect.value / totalQuestions.value) * 100)
})
</script>

<template>
  <div class="practice-panel">
    <!-- 模式切换 -->
    <div v-if="!singleMode" class="mode-switcher">
      <button :class="['mode-btn', { active: mode === 'match' }]" @click="switchMode('match')">发音配对</button>
      <button :class="['mode-btn', { active: mode === 'spell' }]" @click="switchMode('spell')">发音填写</button>
      <button :class="['mode-btn', { active: mode === 'translate' }]" @click="switchMode('translate')">中文选词</button>
    </div>

    <!-- 游戏中 -->
    <div v-if="phase === 'playing' && currentQuestion" class="game-area">
      <!-- 进度 -->
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: (answeredCount / totalQuestions * 100) + '%' }"></div>
      </div>
      <div class="progress-text">{{ progressText }}</div>

      <!-- 发音配对 & 看中文选英文 -->
      <template v-if="mode === 'match' || mode === 'translate'">
        <div class="prompt-area">
          <!-- match: 播放按钮 -->
          <button v-if="mode === 'match'" class="play-btn" @click="replaySound">
            🔊 听发音
          </button>
          <!-- translate: 显示中文 -->
          <div v-else class="chinese-prompt">{{ currentQuestion.translation }}</div>
        </div>

        <div class="options-grid">
          <button
            v-for="opt in currentQuestion.options"
            :key="opt"
            :class="[
              'option-btn',
              {
                correct: showAnswer && opt === currentQuestion.word,
                wrong: selectedOption === opt && opt !== currentQuestion.word,
                disabled: transitioning
              }
            ]"
            @click="handleOptionClick(opt)"
            :disabled="transitioning"
          >
            {{ opt }}
          </button>
        </div>
      </template>

      <!-- 发音填写 -->
      <template v-if="mode === 'spell'">
        <div class="prompt-area">
          <button class="play-btn" @click="replaySound">🔊 再听一次</button>
          <div class="spell-hint">{{ currentQuestion.hint }}</div>
        </div>

        <div class="spell-input-area">
          <input
            v-model="spellInput"
            class="spell-input"
            :class="{ correct: isCorrect === true, wrong: isCorrect === false }"
            placeholder="输入你听到的单词..."
            @keydown.enter="handleSpellSubmit"
            :disabled="transitioning"
            autofocus
          />
          <button class="submit-btn" @click="handleSpellSubmit" :disabled="transitioning">确认</button>
        </div>

        <div v-if="showAnswer" class="answer-reveal">
          正确答案：<strong>{{ currentQuestion.word }}</strong>
        </div>
      </template>
    </div>

    <!-- 结果面板 -->
    <div v-else-if="phase === 'result'" class="result-panel">
      <div class="result-emoji">🎉</div>
      <div class="result-title">本轮完成</div>
      <div class="result-stats">
        <div class="stat-row">
          <span>题目数</span>
          <strong>{{ totalQuestions }}</strong>
        </div>
        <div class="stat-row">
          <span>首次正确率</span>
          <strong>{{ accuracy }}%</strong>
        </div>
        <div class="stat-row">
          <span>总尝试次数</span>
          <strong>{{ totalAttempts }}</strong>
        </div>
      </div>
      <button class="restart-btn" @click="startRound">再来一轮</button>
    </div>

    <!-- 无数据 -->
    <div v-else class="empty-state">选择单元后开始练习</div>
  </div>
</template>

<style scoped>
.practice-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.mode-switcher {
  display: flex;
  gap: 4px;
}

.mode-btn {
  flex: 1;
  padding: 0.35rem 0.5rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fafafa;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.mode-btn:hover {
  border-color: #58cc02;
  color: #58cc02;
}

.mode-btn.active {
  background: #58cc02;
  border-color: #58cc02;
  color: #fff;
  font-weight: 600;
}

.game-area {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.progress-bar {
  height: 6px;
  background: #eee;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #58cc02;
  border-radius: 3px;
  transition: width 0.3s;
}

.progress-text {
  font-size: 0.7rem;
  color: #999;
  text-align: right;
}

.prompt-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0;
}

.play-btn {
  padding: 0.5rem 1.2rem;
  border: 2px solid #58cc02;
  border-radius: 20px;
  background: #f6fef0;
  color: #58cc02;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.play-btn:hover {
  background: #58cc02;
  color: #fff;
}

.chinese-prompt {
  font-size: 1.1rem;
  font-weight: 600;
  color: #2c3e50;
  text-align: center;
  padding: 0.5rem;
}

.spell-hint {
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.3em;
  color: #8e44ad;
  font-family: monospace;
}

.options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.option-btn {
  padding: 0.6rem 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  background: #fff;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}

.option-btn:hover:not(.disabled) {
  border-color: #58cc02;
  background: #f6fef0;
}

.option-btn.correct {
  border-color: #58cc02;
  background: #eefbd8;
  color: #3d8c00;
  font-weight: 700;
}

.option-btn.wrong {
  border-color: #ff4b4b;
  background: #fff0f0;
  color: #ff4b4b;
}

.option-btn.disabled {
  cursor: default;
  opacity: 0.85;
}

.spell-input-area {
  display: flex;
  gap: 8px;
}

.spell-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.15s;
}

.spell-input:focus {
  border-color: #58cc02;
}

.spell-input.correct {
  border-color: #58cc02;
  background: #f6fef0;
}

.spell-input.wrong {
  border-color: #ff4b4b;
  background: #fff8f8;
}

.submit-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 8px;
  background: #58cc02;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.85rem;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.answer-reveal {
  text-align: center;
  font-size: 0.85rem;
  color: #ff4b4b;
}

.answer-reveal strong {
  color: #2c3e50;
}

.result-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 0;
}

.result-emoji {
  font-size: 2.5rem;
}

.result-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #2c3e50;
}

.result-stats {
  width: 100%;
  max-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: #666;
}

.stat-row strong {
  color: #2c3e50;
}

.restart-btn {
  margin-top: 0.5rem;
  padding: 0.5rem 1.5rem;
  border: none;
  border-radius: 20px;
  background: #58cc02;
  color: #fff;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: transform 0.1s;
}

.restart-btn:hover {
  transform: scale(1.05);
}

.empty-state {
  text-align: center;
  color: #999;
  padding: 2rem;
  font-size: 0.85rem;
}
</style>
