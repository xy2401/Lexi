<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import PracticePanel from './PracticePanel.vue'
import { useTTS } from '../composables/useTTS'
import type {
  QuizDefinition,
  SentenceBuilderQuiz,
  ListeningQuiz,
  MatchingQuiz,
  ClozeQuiz,
  MatchingPair,
} from '../lib/course-markdown'
import type { WordEntry } from '../lib/db'
import { createListeningSegments, type ListeningSegment, type ListeningWordSegment } from '../lib/listening-segments'
import { CORRECT_ADVANCE_MS, MATCH_RETRY_MS, WRONG_ADVANCE_MS } from '../lib/quiz-timing'
import type { QuizCompletionResult } from '../lib/progress-db'

const props = defineProps<{
  quiz: QuizDefinition
  words: string[]
  entries: WordEntry[]
}>()

const emit = defineEmits<{
  back: []
  complete: [id: string, result?: QuizCompletionResult]
}>()

const { speak, speakSequence } = useTTS()
const finished = ref(false)
const feedback = ref<'correct' | 'wrong' | null>(null)
let completionSent = false

function shuffle<T>(values: T[]): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

function completeQuiz(result?: QuizCompletionResult) {
  finished.value = true
  feedback.value = 'correct'
  if (!completionSent) {
    completionSent = true
    emit('complete', props.quiz.id, result)
  }
}

function legacyMode(type: QuizDefinition['type']) {
  if (type === 'pronunciation-spell') return 'spell' as const
  if (type === 'translation-choice') return 'translate' as const
  return 'match' as const
}

const isLegacy = computed(() => [
  'pronunciation-match',
  'pronunciation-spell',
  'translation-choice',
].includes(props.quiz.type))

// Sentence builder
interface SentenceTile {
  id: string
  text: string
  distractor: boolean
}

const sentenceQuiz = computed(() => props.quiz as SentenceBuilderQuiz)
const activeSentenceItems = ref<SentenceBuilderItem[]>([])
const sentenceIndex = ref(0)
const sentenceAnswered = ref(0)
const sentenceLocked = ref(false)
const currentSentence = computed(() => activeSentenceItems.value[sentenceIndex.value])
const answerTokens = computed(() => currentSentence.value?.english.match(/[A-Za-z][A-Za-z'-]*(?:[.,!?;:])?/g) || [])
const sentenceTiles = ref<SentenceTile[]>([])
const selectedTiles = ref<SentenceTile[]>([])
const draggedSentenceTileId = ref<string | null>(null)
const sentenceDragGhost = ref({ x: 0, y: 0, text: '', visible: false })
let sentenceDragPointerId: number | null = null
let sentenceDragTile: SentenceTile | null = null
let sentenceDragStart = { x: 0, y: 0 }
let sentenceDragMoved = false
let suppressSentenceTileClick = false

function initSentenceBuilder() {
  if (props.quiz.type !== 'sentence-builder') return
  const raw = sentenceQuiz.value?.items || []
  activeSentenceItems.value = raw.length > 10 ? shuffle([...raw]).slice(0, 10) : raw
  sentenceIndex.value = 0
  sentenceAnswered.value = 0
  sentenceLocked.value = false
  prepareSentenceItem()
}

function prepareSentenceItem() {
  selectedTiles.value = []
  sentenceLocked.value = false
  feedback.value = null
  const answers = answerTokens.value.map((text, index) => ({ id: `answer-${index}`, text, distractor: false }))
  const answerSet = new Set(answerTokens.value.map(token => token.replace(/[.,!?;:]$/, '').toLowerCase()))
  const distractorPool = [...new Set(props.words.flatMap(word => word.match(/[A-Za-z][A-Za-z'-]*/g) || []))]
    .filter(word => !answerSet.has(word.toLowerCase()))
  const distractors = shuffle(distractorPool).slice(0, Math.min(2, distractorPool.length))
    .map((text, index) => ({ id: `distractor-${index}`, text, distractor: true }))
  sentenceTiles.value = shuffle([...answers, ...distractors])
}

function chooseSentenceTile(tile: SentenceTile) {
  if (finished.value || sentenceLocked.value) return
  if (selectedTiles.value.some(item => item.id === tile.id)) return
  selectedTiles.value.push(tile)
  feedback.value = null
}

function returnSentenceTile(tile: SentenceTile) {
  if (finished.value || sentenceLocked.value) return
  selectedTiles.value = selectedTiles.value.filter(item => item.id !== tile.id)
  feedback.value = null
}

function handleSelectedTileClick(tile: SentenceTile) {
  if (suppressSentenceTileClick) return
  returnSentenceTile(tile)
}

function handlePoolTileClick(tile: SentenceTile) {
  if (suppressSentenceTileClick) return
  chooseSentenceTile(tile)
}

function startSentenceDrag(event: PointerEvent, tile: SentenceTile) {
  if (finished.value || sentenceLocked.value || event.button !== 0) return
  sentenceDragPointerId = event.pointerId
  sentenceDragTile = tile
  sentenceDragStart = { x: event.clientX, y: event.clientY }
  sentenceDragMoved = false
  window.addEventListener('pointermove', handleSentenceDragMove)
  window.addEventListener('pointerup', handleSentenceDragEnd)
  window.addEventListener('pointercancel', handleSentenceDragEnd)
  try {
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  } catch {
    // 窗口级监听兜底，捕获失败不影响拖动。
  }
}

function computeSentenceInsertIndex(slot: HTMLElement, x: number, y: number, excludeId: string): number {
  const tiles = [...slot.querySelectorAll<HTMLElement>('[data-sentence-tile-id]')]
    .filter(element => element.dataset.sentenceTileId !== excludeId)
  for (let index = 0; index < tiles.length; index++) {
    const rect = tiles[index].getBoundingClientRect()
    if (y < rect.top) return index
    if (y <= rect.bottom && x < rect.left + rect.width / 2) return index
  }
  return tiles.length
}

function handleSentenceDragMove(event: PointerEvent) {
  if (event.pointerId !== sentenceDragPointerId || !sentenceDragTile) return
  if (!sentenceDragMoved) {
    if (Math.hypot(event.clientX - sentenceDragStart.x, event.clientY - sentenceDragStart.y) < 5) return
    sentenceDragMoved = true
    draggedSentenceTileId.value = sentenceDragTile.id
  }
  const tile = sentenceDragTile
  sentenceDragGhost.value = { x: event.clientX, y: event.clientY, text: tile.text, visible: true }

  const element = document.elementFromPoint(event.clientX, event.clientY)
  const slot = element?.closest<HTMLElement>('.sentence-slot')
  const pool = element?.closest<HTMLElement>('.tile-pool')

  if (slot) {
    const index = computeSentenceInsertIndex(slot, event.clientX, event.clientY, tile.id)
    const without = selectedTiles.value.filter(item => item.id !== tile.id)
    const next = [...without]
    next.splice(Math.min(index, next.length), 0, tile)
    if (next.map(item => item.id).join('|') !== selectedTiles.value.map(item => item.id).join('|')) {
      selectedTiles.value = next
      feedback.value = null
    }
  } else if (pool && selectedTiles.value.some(item => item.id === tile.id)) {
    selectedTiles.value = selectedTiles.value.filter(item => item.id !== tile.id)
    feedback.value = null
  }
}

function handleSentenceDragEnd(event: PointerEvent) {
  if (event.pointerId !== sentenceDragPointerId) return
  window.removeEventListener('pointermove', handleSentenceDragMove)
  window.removeEventListener('pointerup', handleSentenceDragEnd)
  window.removeEventListener('pointercancel', handleSentenceDragEnd)
  try {
    const target = event.target as HTMLElement
    if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId)
  } catch {
    // 捕获释放失败不影响后续交互。
  }
  if (sentenceDragMoved) {
    suppressSentenceTileClick = true
    window.setTimeout(() => { suppressSentenceTileClick = false }, 0)
  }
  sentenceDragGhost.value = { ...sentenceDragGhost.value, visible: false }
  sentenceDragPointerId = null
  sentenceDragMoved = false
  sentenceDragTile = null
  draggedSentenceTileId.value = null
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', handleSentenceDragMove)
  window.removeEventListener('pointerup', handleSentenceDragEnd)
  window.removeEventListener('pointercancel', handleSentenceDragEnd)
})

function checkSentence() {
  if (!currentSentence.value || sentenceLocked.value) return
  const selected = selectedTiles.value.map(tile => tile.text.toLowerCase())
  const answer = answerTokens.value.map(token => token.toLowerCase())
  if (selected.length === answer.length && selected.every((token, index) => token === answer[index])) {
    sentenceLocked.value = true
    sentenceAnswered.value++
    feedback.value = 'correct'

    let advanced = false
    const advanceNext = () => {
      if (advanced) return
      advanced = true
      sentenceIndex.value++
      if (sentenceIndex.value >= activeSentenceItems.value.length) {
        completeQuiz()
        return
      }
      prepareSentenceItem()
    }

    // 朗读完完整的句子后再跳转下一题
    speak(currentSentence.value.english, undefined, () => {
      window.setTimeout(advanceNext, 350)
    })
    window.setTimeout(advanceNext, 5000)
  } else {
    speak(currentSentence.value.english)
    feedback.value = 'wrong'
  }
}

// Listening
const listeningQuiz = computed(() => props.quiz as ListeningQuiz)
const activeListeningItems = ref<ListeningItem[]>([])
const listeningQueue = ref<number[]>([])
const listeningIndex = ref(0)
const listeningAnswered = ref(0)
const listeningLocked = ref(false)
const listeningAnswer = ref('')
const listeningSegments = ref<ListeningSegment[]>([])
const listeningInputRefs = ref<HTMLInputElement[]>([])

const currentListeningItem = computed(() => {
  const itemIndex = listeningQueue.value[listeningIndex.value]
  return activeListeningItems.value[itemIndex]
})

function normalizeListeningWord(value: string) {
  return value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .trim()
}

function listeningWords(): ListeningWordSegment[] {
  return listeningSegments.value.filter((segment): segment is ListeningWordSegment => segment.kind === 'word')
}

function setListeningInputRef(element: Element | null, index: number) {
  if (element instanceof HTMLInputElement) {
    listeningInputRefs.value[index] = element
  }
}

function focusListeningInput(index: number) {
  nextTick(() => {
    listeningInputRefs.value[index]?.focus()
  })
}

function prepareListeningItem() {
  listeningAnswered.value = listeningIndex.value
  listeningLocked.value = false
  feedback.value = null

  const target = currentListeningItem.value
  if (!target) return
  listeningAnswer.value = target.english
  listeningInputRefs.value = []

  const tokens = target.english.match(/[A-Za-z][A-Za-z'-]*|[^A-Za-z\s]+/g) || []
  let wordIndex = 0

  listeningSegments.value = tokens.map(token => {
    if (/[A-Za-z][A-Za-z'-]*/.test(token)) {
      const segment: ListeningWordSegment = {
        kind: 'word',
        wordIndex,
        answer: token,
        value: '',
        status: 'idle',
      }
      wordIndex++
      return segment
    }
    return {
      kind: 'separator',
      text: token,
    }
  })

  focusListeningInput(0)
}

function replayListening() {
  if (currentListeningItem.value) {
    speak(currentListeningItem.value.english)
  }
}

function handleListeningInput(segment: ListeningWordSegment) {
  if (listeningLocked.value) return
  segment.value = segment.value.slice(0, segment.answer.length)
  if (segment.status === 'wrong') {
    segment.status = 'idle'
  }

  if (segment.value.length >= segment.answer.length) {
    const words = listeningWords()
    if (segment.wordIndex < words.length - 1) {
      focusListeningInput(segment.wordIndex + 1)
    }
  }
}

function handleListeningKeydown(event: KeyboardEvent, segment: ListeningWordSegment) {
  if (listeningLocked.value) return
  if (event.key === 'Backspace' && !segment.value && segment.wordIndex > 0) {
    event.preventDefault()
    focusListeningInput(segment.wordIndex - 1)
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    submitListening()
  }
}

function handleListeningPaste(event: ClipboardEvent) {
  if (listeningLocked.value) return
  const text = event.clipboardData?.getData('text') || ''
  if (!text) return
  const words = listeningWords()
  const pastedTokens = text.match(/[A-Za-z][A-Za-z'-]*/g) || []
  if (!pastedTokens.length) return

  event.preventDefault()
  words.forEach((segment, index) => {
    segment.value = (pastedTokens[index] || '').slice(0, segment.answer.length)
  })
  const nextIndex = Math.min(pastedTokens.length, words.length - 1)
  focusListeningInput(nextIndex)
}

function submitListening() {
  if (finished.value || listeningLocked.value || !currentListeningItem.value) return
  const words = listeningWords()
  let allCorrect = true

  words.forEach(segment => {
    const isMatch = normalizeListeningWord(segment.value) === normalizeListeningWord(segment.answer)
    segment.status = isMatch ? 'correct' : 'wrong'
    if (!isMatch) allCorrect = false
  })

  if (allCorrect) {
    listeningLocked.value = true
    listeningAnswered.value++
    feedback.value = 'correct'

    let advanced = false
    const advanceNext = () => {
      if (advanced) return
      advanced = true
      listeningIndex.value++
      if (listeningIndex.value >= listeningQueue.value.length) {
        completeQuiz()
        return
      }
      prepareListeningItem()
      replayListening()
    }

    speak(currentListeningItem.value.english, undefined, () => {
      window.setTimeout(advanceNext, 350)
    })
    window.setTimeout(advanceNext, 5000)
  } else {
    speak(currentListeningItem.value.english)
    feedback.value = 'wrong'
  }
}

// Matching
const matchingQuiz = computed(() => props.quiz as MatchingQuiz)
const matchingMode = ref<MatchingMode>('text-chinese')
const selectedLeft = ref<number | null>(null)
const selectedRight = ref<number | null>(null)
const matchedIds = ref<number[]>([])
const wrongPair = ref<boolean>(false)
const matchingRight = ref<{ id: number; text: string }[]>([])
const activeMatchingPairs = ref<Array<MatchingPair & { id: number }>>([])

const matchingPairs = computed<Array<MatchingPair & { id: number }>>(() => {
  if (matchingQuiz.value.source === 'explicit' && matchingQuiz.value.pairs?.length) {
    return matchingQuiz.value.pairs.map((pair, index) => ({ ...pair, id: index + 1 }))
  }

  const result: Array<MatchingPair & { id: number }> = []
  let idCounter = 1
  for (const word of props.words) {
    const entry = props.entries[word.toLowerCase()]
    const chinese = entry?.definition || ''
    if (chinese) {
      result.push({ id: idCounter++, english: word, chinese })
    }
  }
  return result
})

const matchingModeLabel = computed(() => {
  if (matchingMode.value === 'text-chinese') return '英文 ➔ 中文'
  if (matchingMode.value === 'audio-chinese') return '发音 ➔ 中文'
  return '发音 ➔ 英文'
})

function initMatching() {
  if (props.quiz.type !== 'matching') return
  matchedIds.value = []
  selectedLeft.value = null
  selectedRight.value = null
  wrongPair.value = false
  matchingMode.value = shuffle<MatchingMode>(['text-chinese', 'audio-chinese', 'audio-english'])[0]
  const all = matchingPairs.value
  activeMatchingPairs.value = all.length > 10 ? shuffle([...all]).slice(0, 10) : shuffle([...all])
  matchingRight.value = shuffle(activeMatchingPairs.value.map(pair => ({
    id: pair.id,
    text: matchingMode.value === 'audio-english' ? pair.english : pair.chinese,
  })))
}

function selectMatchingLeft(pair: MatchingPair & { id: number }) {
  if (matchedIds.value.includes(pair.id)) return
  selectedLeft.value = pair.id
  speak(pair.english)
  checkMatchingPair()
}

function selectMatchingRight(id: number) {
  if (matchedIds.value.includes(id)) return
  selectedRight.value = id
  if (matchingMode.value === 'audio-english') {
    const pair = matchingPairs.value.find(item => item.id === id)
    if (pair) speak(pair.english)
  }
  checkMatchingPair()
}

function checkMatchingPair() {
  if (selectedLeft.value === null || selectedRight.value === null) return
  const left = selectedLeft.value
  const right = selectedRight.value
  if (left === right) {
    matchedIds.value.push(left)
    selectedLeft.value = null
    selectedRight.value = null
    if (matchedIds.value.length === activeMatchingPairs.value.length) completeQuiz()
  } else {
    wrongPair.value = true
    window.setTimeout(() => {
      selectedLeft.value = null
      selectedRight.value = null
      wrongPair.value = false
    }, MATCH_RETRY_MS)
  }
}

// Cloze
const clozeQuiz = computed(() => props.quiz as ClozeQuiz)
const activeClozeItems = ref<ClozeItem[]>([])
const clozeIndex = ref(0)
const clozeAnswered = ref(0)
const clozeLocked = ref(false)
const currentCloze = computed(() => activeClozeItems.value[clozeIndex.value])
const selectedCloze = ref<string | null>(null)

function initCloze() {
  if (props.quiz.type !== 'cloze') return
  const raw = clozeQuiz.value?.items || []
  activeClozeItems.value = raw.length > 10 ? shuffle([...raw]).slice(0, 10) : raw
  clozeIndex.value = 0
  clozeAnswered.value = 0
  prepareClozeItem()
}

function prepareClozeItem() {
  selectedCloze.value = null
  clozeLocked.value = false
  feedback.value = null
}

function chooseCloze(text: string, correct: boolean) {
  if (finished.value || clozeLocked.value || !currentCloze.value) return
  selectedCloze.value = text
  if (correct) {
    const completedSentence = currentCloze.value.prompt.replace('____', text)
    clozeLocked.value = true
    clozeAnswered.value++
    feedback.value = 'correct'

    let advanced = false
    const advanceNext = () => {
      if (advanced) return
      advanced = true
      clozeIndex.value++
      if (clozeIndex.value >= activeClozeItems.value.length) {
        completeQuiz()
        return
      }
      prepareClozeItem()
    }

    // 朗读完“单词 + 完整填充后句子”后，留出 350ms 舒适停顿，再平滑切下一题
    speakSequence([text, completedSentence], () => {
      window.setTimeout(advanceNext, 350)
    })

    // 5秒最长安全兜底，防止极少情况下 SpeechSynthesis 未触发 onend 事件
    window.setTimeout(advanceNext, 5000)
  } else {
    speak(text)
    feedback.value = 'wrong'
  }
}

const clozeAnswer = computed(() => currentCloze.value?.options.find(option => option.correct)?.text || '____')

if (props.quiz.type === 'sentence-builder') initSentenceBuilder()
if (props.quiz.type === 'listening') {
  const raw = listeningQuiz.value?.items || []
  activeListeningItems.value = raw.length > 10 ? shuffle([...raw]).slice(0, 10) : raw
  listeningQueue.value = activeListeningItems.value.map((_, index) => index)
  prepareListeningItem()
  nextTick(replayListening)
}
if (props.quiz.type === 'matching') initMatching()
if (props.quiz.type === 'cloze') initCloze()
</script>

<template>
  <div class="quiz-runner">
    <div class="runner-header">
      <button class="back-btn" @click="emit('back')">← 关卡列表</button>
      <div>
        <strong>{{ quiz.title }}</strong>
        <small>{{ quiz.description }}</small>
      </div>
    </div>

    <PracticePanel
      v-if="isLegacy"
      :key="quiz.id"
      :words="words"
      :entries="entries"
      :initial-mode="legacyMode(quiz.type)"
      single-mode
      @complete="completeQuiz"
    />

    <div v-else-if="quiz.type === 'sentence-builder'" class="game-stack">
      <div class="mini-progress">
        <div :style="{ width: `${sentenceAnswered / activeSentenceItems.length * 100}%` }"></div>
      </div>
      <div class="progress-copy">{{ Math.min(sentenceAnswered + 1, activeSentenceItems.length) }} / {{ activeSentenceItems.length }}</div>
      <div class="question-translation">{{ currentSentence?.chinese }}</div>
      <div class="sentence-slot" :class="feedback">
        <button
          v-for="tile in selectedTiles"
          :key="tile.id"
          class="word-tile selected draggable"
          :class="{ dragging: draggedSentenceTileId === tile.id }"
          :data-sentence-tile-id="tile.id"
          :aria-label="`${tile.text}，拖动调整位置或拖回词池，点击移回词池`"
          @click="handleSelectedTileClick(tile)"
          @pointerdown="startSentenceDrag($event, tile)"
        >
          {{ tile.text }}
        </button>
        <span v-if="selectedTiles.length === 0" class="slot-hint">点击或拖动下方词块组成句子</span>
      </div>
      <div class="drag-hint">拖动词块可在答案区与词池间自由移动，拖动中可随时松手；点击可快速添加/移除</div>
      <div class="tile-pool">
        <button
          v-for="tile in sentenceTiles"
          :key="tile.id"
          :class="['word-tile', 'draggable', { reserved: selectedTiles.some(item => item.id === tile.id), dragging: draggedSentenceTileId === tile.id }]"
          :aria-hidden="selectedTiles.some(item => item.id === tile.id)"
          :tabindex="selectedTiles.some(item => item.id === tile.id) ? -1 : 0"
          @click="handlePoolTileClick(tile)"
          @pointerdown="startSentenceDrag($event, tile)"
        >
          {{ tile.text }}
        </button>
      </div>
      <button class="primary-btn" :disabled="selectedTiles.length === 0 || finished || sentenceLocked" @click="checkSentence">检查</button>
      <div v-if="feedback === 'wrong'" class="feedback wrong">顺序还不对，再试一次</div>
      <div v-if="feedback === 'correct'" class="feedback correct">正确！{{ currentSentence?.explanation }}</div>
      <div
        v-if="sentenceDragGhost.visible"
        class="drag-ghost"
        :style="{ left: `${sentenceDragGhost.x}px`, top: `${sentenceDragGhost.y}px` }"
        aria-hidden="true"
      >{{ sentenceDragGhost.text }}</div>
    </div>

    <div v-else-if="quiz.type === 'listening'" class="game-stack">
      <div class="mini-progress">
        <div :style="{ width: `${listeningAnswered / activeListeningItems.length * 100}%` }"></div>
      </div>
      <div class="progress-copy">{{ Math.min(listeningAnswered + 1, activeListeningItems.length) }} / {{ activeListeningItems.length }}</div>
      <button class="sound-prompt" @click="replayListening">🔊 播放句子</button>
      <div class="listening-blanks" @paste="handleListeningPaste">
        <template v-for="(segment, index) in listeningSegments" :key="index">
          <span v-if="segment.kind === 'separator'" class="listening-separator">{{ segment.text }}</span>
          <span v-else class="listening-word-wrap">
            <input
              :ref="element => setListeningInputRef(element as Element | null, segment.wordIndex)"
              v-model="segment.value"
              class="listening-word-input"
              :class="segment.status"
              :style="{ width: `${Math.max(3, segment.answer.length + 1)}ch` }"
              :maxlength="segment.answer.length"
              :aria-label="`第 ${segment.wordIndex + 1} 个单词`"
              :disabled="listeningLocked || finished"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              @input="handleListeningInput(segment)"
              @keydown="handleListeningKeydown($event, segment)"
            />
            <small v-if="segment.status === 'wrong'" class="word-correction">{{ segment.answer }}</small>
          </span>
        </template>
      </div>
      <button class="primary-btn" :disabled="listeningLocked || finished" @click="submitListening">确认</button>
      <div v-if="feedback === 'wrong'" class="feedback wrong">正确答案：{{ listeningAnswer }}</div>
      <div v-if="finished" class="feedback correct">听音辨句完成</div>
    </div>

    <div v-else-if="quiz.type === 'matching'" class="game-stack">
      <div class="matching-mode">本轮模式：{{ matchingModeLabel }}</div>
      <div v-if="activeMatchingPairs.length >= 2" class="matching-grid" :class="{ shake: wrongPair }">
        <div class="matching-column">
          <button
            v-for="pair in activeMatchingPairs"
            :key="`left-${pair.id}`"
            :class="['match-card', { selected: selectedLeft === pair.id, matched: matchedIds.includes(pair.id) }]"
            :disabled="matchedIds.includes(pair.id)"
            @click="selectMatchingLeft(pair)"
          >
            {{ matchingMode === 'text-chinese' ? pair.english : '🔊' }}
          </button>
        </div>
        <div class="matching-column">
          <button
            v-for="item in matchingRight"
            :key="`right-${item.id}`"
            :class="['match-card', { selected: selectedRight === item.id, matched: matchedIds.includes(item.id) }]"
            :disabled="matchedIds.includes(item.id)"
            @click="selectMatchingRight(item.id)"
          >
            {{ item.text }}
          </button>
        </div>
      </div>
      <div v-else class="feedback wrong">可用释义不足，至少需要 2 个词条</div>
      <div v-if="finished" class="feedback correct">全部配对完成</div>
    </div>

    <div v-else-if="quiz.type === 'cloze'" class="game-stack">
      <div class="mini-progress">
        <div :style="{ width: `${clozeAnswered / activeClozeItems.length * 100}%` }"></div>
      </div>
      <div class="progress-copy">{{ Math.min(clozeAnswered + 1, activeClozeItems.length) }} / {{ activeClozeItems.length }}</div>
      <div class="cloze-prompt">
        {{ currentCloze?.prompt.replace('____', feedback === 'correct' ? clozeAnswer : '______') }}
      </div>
      <div class="cloze-options">
        <button
          v-for="option in currentCloze?.options || []"
          :key="option.text"
          :class="['word-tile', { wrong: selectedCloze === option.text && !option.correct, correct: feedback === 'correct' && option.correct }]"
          :disabled="finished || clozeLocked"
          @click="chooseCloze(option.text, option.correct)"
        >
          {{ option.text }}
        </button>
      </div>
      <div v-if="feedback === 'wrong' && !finished" class="feedback wrong">这个选项不合适，再试一次</div>
      <div v-if="feedback === 'correct'" class="feedback correct">正确！{{ currentCloze?.explanation }}</div>
    </div>

    <button v-if="finished && !isLegacy" class="finish-btn" @click="emit('back')">完成并返回</button>
  </div>
</template>

<style scoped>
.quiz-runner,
.game-stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.runner-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-bottom: 0.65rem;
  border-bottom: 1px solid #eee;
}

.runner-header > div {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.runner-header strong {
  color: #2c3e50;
  font-size: 0.95rem;
}

.runner-header small {
  color: #888;
  font-size: 0.7rem;
}

.back-btn {
  border: 1px solid #ddd;
  border-radius: 14px;
  background: #fff;
  padding: 0.3rem 0.65rem;
  color: #666;
  cursor: pointer;
  white-space: nowrap;
}

.question-translation,
.cloze-prompt {
  padding: 0.9rem;
  border-radius: 10px;
  background: #f6fef0;
  color: #2c3e50;
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
}

.sentence-slot,
.tile-pool,
.cloze-options {
  min-height: 52px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.6rem;
  border: 2px dashed #ddd;
  border-radius: 10px;
}

.sentence-slot {
  height: 92px;
  min-height: 92px;
  box-sizing: border-box;
  align-content: flex-start;
  overflow-y: auto;
}

.tile-pool,
.cloze-options {
  border-style: solid;
  background: #fafafa;
}

.slot-hint {
  color: #aaa;
  font-size: 0.8rem;
}

.word-tile,
.match-card {
  border: 2px solid #dedede;
  border-radius: 9px;
  background: #fff;
  color: #2c3e50;
  padding: 0.55rem 0.75rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 0 #dedede;
}

.word-tile:hover,
.match-card:hover:not(:disabled) {
  border-color: #58cc02;
}

.word-tile.selected,
.match-card.selected {
  border-color: #1cb0f6;
  background: #edf9ff;
}

.word-tile.draggable {
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.word-tile.draggable:active,
.word-tile.dragging {
  cursor: grabbing;
  border-color: #1cb0f6;
  background: #edf9ff;
  opacity: 0.8;
}

.drag-hint {
  color: #aaa;
  text-align: center;
  font-size: 0.68rem;
  pointer-events: none;
}

.drag-ghost {
  position: fixed;
  z-index: 999;
  transform: translate(-50%, -140%);
  padding: 0.55rem 0.75rem;
  border: 2px solid #1cb0f6;
  border-radius: 9px;
  background: #edf9ff;
  color: #2c3e50;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
  pointer-events: none;
}

.word-tile.reserved {
  visibility: hidden;
  pointer-events: none;
}

.word-tile.wrong {
  border-color: #ff4b4b;
  color: #ff4b4b;
}

.word-tile.correct {
  border-color: #58cc02;
  color: #3d8c00;
}

.primary-btn,
.finish-btn,
.sound-prompt {
  align-self: center;
  border: none;
  border-radius: 18px;
  padding: 0.55rem 1.25rem;
  background: #58cc02;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.sound-prompt {
  border: 2px solid #58cc02;
  background: #f6fef0;
  color: #3d8c00;
}

.feedback {
  text-align: center;
  font-size: 0.82rem;
  padding: 0.45rem;
  border-radius: 8px;
}

.feedback.correct {
  background: #eefbd8;
  color: #3d8c00;
}

.feedback.wrong {
  background: #fff0f0;
  color: #d63031;
}

.mini-progress {
  height: 7px;
  overflow: hidden;
  border-radius: 4px;
  background: #eee;
}

.mini-progress div {
  height: 100%;
  background: #58cc02;
  transition: width 0.25s;
}

.progress-copy {
  color: #999;
  text-align: right;
  font-size: 0.7rem;
}

.sentence-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.65rem 0.75rem;
  border: 2px solid #ddd;
  border-radius: 9px;
  font-size: 0.95rem;
  outline: none;
}

.sentence-input:focus {
  border-color: #58cc02;
}

.sentence-input.wrong {
  border-color: #ff4b4b;
}

.listening-blanks {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: center;
  row-gap: 0.9rem;
  padding: 1rem 0.75rem;
  border: 2px solid #e5e5e5;
  border-radius: 10px;
  background: #fafafa;
  line-height: 2.4rem;
}

.listening-separator {
  white-space: pre;
  color: #2c3e50;
  font-size: 1rem;
  line-height: 2.1rem;
}

.listening-word-wrap {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  line-height: normal;
}

.listening-word-input {
  box-sizing: content-box;
  min-width: 2.5rem;
  max-width: 12rem;
  height: 2rem;
  padding: 0 0.25rem;
  border: 0;
  border-bottom: 2px solid #8e44ad;
  border-radius: 4px 4px 0 0;
  background: #fff;
  color: #2c3e50;
  font-size: 0.95rem;
  text-align: center;
  outline: none;
}

.listening-word-input:focus {
  border-bottom-color: #58cc02;
  box-shadow: 0 2px 0 rgba(88, 204, 2, 0.18);
}

.listening-word-input.correct {
  border-bottom-color: #58cc02;
  background: #f6fef0;
}

.listening-word-input.wrong {
  border-bottom-color: #ff4b4b;
  background: #fff0f0;
}

.word-correction {
  position: absolute;
  top: 2.15rem;
  color: #d63031;
  font-size: 0.62rem;
  line-height: 1;
  white-space: nowrap;
}

.matching-mode {
  color: #8e44ad;
  font-size: 0.78rem;
  font-weight: 600;
  text-align: center;
}

.matching-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}

.matching-column {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.match-card {
  flex: 1 1 0;
  min-height: 2.4rem;
}

.match-card.matched {
  visibility: hidden;
}

.matching-grid.shake {
  animation: shake 0.25s linear;
}

@keyframes shake {
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

@media (max-width: 560px) {
  .runner-header {
    align-items: flex-start;
  }

  .word-tile,
  .match-card {
    padding: 0.5rem 0.55rem;
    font-size: 0.82rem;
  }
}
</style>
