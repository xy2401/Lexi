<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CourseUnitIndex } from '../lib/course-markdown'
import type { CourseVersion } from '../lib/course-versions'
import {
  currentPracticeStates, isPracticeSessionCurrent, judgePracticeAnswer, loadCoursePractice,
  planPracticeSession, practiceActivity, practiceActivities, practiceFingerprint, shufflePractice,
  type PracticeDocument, type PracticeExercise, type PracticeItemState, type PracticeSession,
} from '../lib/course-practice'
import { getPracticeRecords, savePracticeSession } from '../lib/practice-progress'
import { useTTS } from '../composables/useTTS'

const props = defineProps<{ version: CourseVersion; unit: CourseUnitIndex }>()
const emit = defineEmits<{ guide: [] }>()
const status = ref<'loading' | 'ready' | 'missing' | 'error'>('loading')
const error = ref('')
const document = ref<PracticeDocument | null>(null)
const items = ref<PracticeItemState[]>([])
const session = ref<PracticeSession | null>(null)
const resumable = ref<PracticeSession | null>(null)
const previousSession = ref<PracticeSession | null>(null)
const screen = ref<'home' | 'question' | 'result'>('home')
const choiceOrder = ref<string[]>([])
const tokenOrder = ref<number[]>([])
const leftOrder = ref<string[]>([])
const rightOrder = ref<string[]>([])
const selectedLeft = ref('')
const inputElement = ref<HTMLInputElement>()
const saveError = ref('')
const saving = ref(0)
const notice = ref('')
const now = ref(Date.now())
const { speak, stop, voices, ready: ttsReady } = useTTS()
const audioAvailable = computed(() => voices.value.length > 0 && 'speechSynthesis' in window)
const currentStates = computed(() => document.value ? currentPracticeStates(document.value, items.value) : [])
const dueStates = computed(() => currentStates.value.filter(item => item.dueAt <= now.value))
const eligibleDueCount = computed(() => dueStates.value.filter(item => document.value?.exercises.some(exercise => exercise.id === item.exerciseId && (!exercise.audio || audioAvailable.value))).length)
const recommendedCount = computed(() => Math.min(8, document.value?.exercises.filter(exercise => !exercise.audio || audioAvailable.value).length || 0))
const activityCards = computed(() => practiceActivities.map(activity => {
  const pool = document.value?.exercises.filter(item => practiceActivity(item) === activity.id) || []
  const needsAudio = pool.some(item => item.audio)
  return { ...activity, count: pool.length, roundCount: Math.min(8, pool.length), disabled: !pool.length || needsAudio && !audioAvailable.value, needsAudio }
}))
const currentTask = computed(() => session.value?.tasks[session.value.cursor])
const exercise = computed(() => document.value?.exercises.find(item => item.id === currentTask.value?.exerciseId))
const goal = computed(() => document.value?.goals.find(item => item.id === exercise.value?.goalId))
const currentResult = computed(() => session.value?.answers[session.value.cursor])
const locked = computed(() => Boolean(currentResult.value))
const activityTitle = computed(() => exercise.value ? practiceActivities.find(item => item.id === practiceActivity(exercise.value!))?.title : '')
const matches = computed(() => session.value?.draft.matches || {})
const orderedLeft = computed(() => exercise.value?.kind === 'matching' ? leftOrder.value.map(id => exercise.value!.kind === 'matching' ? exercise.value!.pairs.find(pair => pair.id === id)! : undefined).filter(Boolean) : [])
const orderedRight = computed(() => exercise.value?.kind === 'matching' ? rightOrder.value.map(id => exercise.value!.kind === 'matching' ? exercise.value!.pairs.find(pair => pair.id === id)! : undefined).filter(Boolean) : [])
const orderedOptions = computed(() => {
  const item = exercise.value
  return item?.kind === 'choice' ? choiceOrder.value.map(id => item.options.find(option => option.id === id)!) : []
})
const modelAnswer = computed(() => {
  const item = exercise.value
  if (!item) return ''
  return referenceAnswer(item.id)
})
const answerText = computed(() => {
  if (!session.value || !exercise.value) return ''
  if (exercise.value.kind === 'matching') return Object.keys(matches.value).length ? JSON.stringify(matches.value) : ''
  return exercise.value.kind === 'compose' ? session.value.draft.tokens.map(index => exercise.value!.kind === 'compose' ? exercise.value!.tokens[index] : '').join(' ') : session.value.draft.answer
})
const canCheck = computed(() => exercise.value?.kind === 'matching' ? exercise.value.pairs.every(pair => Boolean(matches.value[pair.id])) : Boolean(answerText.value.trim()))
const feedback = computed(() => {
  const item = exercise.value
  if (!item || !currentResult.value) return ''
  if (item.kind === 'choice' && currentResult.value.outcome === 'incorrect') return item.options.find(option => option.id === currentResult.value!.answer)?.feedback || item.explanation
  return item.explanation
})
const results = computed(() => session.value?.answers || [])
const countOutcome = (outcome: string) => results.value.filter(result => result.outcome === outcome).length
const resultGoals = computed(() => document.value?.goals.map(item => {
  const answers = results.value.filter(answer => document.value!.exercises.find(exercise => exercise.id === answer.exerciseId)?.goalId === item.id)
  return { ...item, count: answers.length, independent: answers.filter(answer => answer.outcome === 'independent').length, review: answers.some(answer => answer.outcome !== 'independent') }
}).filter(item => item.count) || [])
function answerLabel(exerciseId: string, answer: string) {
  const item = document.value?.exercises.find(item => item.id === exerciseId)
  if (item?.kind === 'matching') {
    try {
      const chosen = JSON.parse(answer)
      return item.pairs.map(pair => `${pair.english} → ${item.pairs.find(value => value.id === chosen[pair.id])?.chinese || '未配对'}`).join('；')
    } catch { return '未配对' }
  }
  return item?.kind === 'choice' ? item.options.find(option => option.id === answer)?.text || '未选择' : answer || '未填写'
}
function referenceAnswer(exerciseId: string) {
  const item = document.value?.exercises.find(item => item.id === exerciseId)
  if (item?.kind === 'matching') return item.pairs.map(pair => `${pair.english} → ${pair.chinese}`).join('；')
  return item?.kind === 'choice' ? item.options.find(option => option.id === item.answer)?.text || '' : item?.answers[0] || ''
}
function matchedMeaning(id: string) {
  const item = exercise.value
  return item?.kind === 'matching' ? item.pairs.find(pair => pair.id === matches.value[id])?.chinese : ''
}
const outcomeLabels = { independent: '独立答对', assisted: '提示后答对', incorrect: '需要巩固', revealed: '已查看答案' }
let controller: AbortController | undefined
let generation = 0
let disposed = false
let draftTimer: ReturnType<typeof setTimeout> | undefined
let writes = Promise.resolve()
let reviewTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  void load()
  reviewTimer = setInterval(() => { now.value = Date.now() }, 60_000)
  window.addEventListener('focus', refreshReviewTime)
})
onBeforeUnmount(() => {
  disposed = true
  generation++
  controller?.abort()
  if (reviewTimer) clearInterval(reviewTimer)
  window.removeEventListener('focus', refreshReviewTime)
  if (draftTimer) { clearTimeout(draftTimer); persist() }
  stop()
})
function refreshReviewTime() { now.value = Date.now() }
async function load() {
  const request = ++generation
  controller?.abort()
  controller = new AbortController()
  status.value = 'loading'
  error.value = ''
  try {
    const source = await loadCoursePractice(props.version, props.unit, controller.signal)
    if (disposed || request !== generation) return
    document.value = source
    if (!source) { status.value = 'missing'; return }
    const records = await getPracticeRecords(props.version.id, props.unit.id)
    if (disposed || request !== generation) return
    items.value = records.items
    resumable.value = records.sessions.find(record => !record.completedAt && isPracticeSessionCurrent(record, source)) || null
    previousSession.value = records.sessions.find(record => Boolean(record.completedAt) && isPracticeSessionCurrent(record, source)) || null
    status.value = 'ready'
  } catch (cause) {
    if (disposed || request !== generation) return
    error.value = cause instanceof Error ? cause.message : String(cause)
    status.value = 'error'
  }
}
function persist() {
  if (!session.value || !document.value) return
  if (draftTimer) { clearTimeout(draftTimer); draftTimer = undefined }
  session.value.updatedAt = Math.max(Date.now(), session.value.updatedAt + 1)
  const snapshot: PracticeSession = JSON.parse(JSON.stringify(session.value))
  const source = document.value
  saving.value++
  writes = writes.then(async () => {
    await savePracticeSession(snapshot, source)
    if (!disposed) {
      saveError.value = ''
      const records = await getPracticeRecords(snapshot.versionId, snapshot.unitId)
      items.value = records.items
      now.value = Date.now()
    }
  }).catch(cause => { if (!disposed) saveError.value = cause instanceof Error ? cause.message : String(cause) }).finally(() => { saving.value-- })
}
function draftChanged() {
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(persist, 250)
}
function prepareQuestion() {
  stop()
  const item = exercise.value
  choiceOrder.value = item?.kind === 'choice' ? shufflePractice(item.options.map(option => option.id)) : []
  tokenOrder.value = item?.kind === 'compose' ? shufflePractice(item.tokens.map((_, index) => index)) : []
  leftOrder.value = item?.kind === 'matching' ? shufflePractice(item.pairs.map(pair => pair.id)) : []
  rightOrder.value = item?.kind === 'matching' ? shufflePractice(item.pairs.map(pair => pair.id)) : []
  selectedLeft.value = ''
  nextTick(() => { if (item?.kind === 'input' && !item.audio) inputElement.value?.focus() })
}
function start(mode: string) {
  if (!document.value) return
  const tasks = planPracticeSession(document.value, mode, items.value, audioAvailable.value)
  if (!tasks.length) { notice.value = '当前没有可开始的题目。'; return }
  notice.value = ''
  const now = Date.now()
  session.value = {
    id: crypto.randomUUID(), versionId: props.version.id, unitId: props.unit.id,
    fingerprints: Object.fromEntries(document.value.exercises.map(item => [item.id, practiceFingerprint(item)])),
    mode, tasks, answers: [], cursor: 0, draft: { answer: '', tokens: [], hintCount: 0, revealed: false }, startedAt: now, updatedAt: now,
  }
  resumable.value = session.value
  screen.value = 'question'
  prepareQuestion()
  persist()
}
async function resume() {
  if (!resumable.value) return
  await ttsReady
  const hasAudio = resumable.value.tasks.some(task => document.value?.exercises.find(item => item.id === task.exerciseId)?.audio)
  if (hasAudio && !audioAvailable.value) { notice.value = '这轮包含听力题，设备暂时没有英文朗读声音。你可以先开始一轮文字练习。'; return }
  session.value = JSON.parse(JSON.stringify(resumable.value))
  screen.value = 'question'
  notice.value = ''
  prepareQuestion()
}
function selectOption(id: string) { if (!locked.value && session.value) { session.value.draft.answer = id; persist() } }
function addToken(index: number) { if (!locked.value && session.value && !session.value.draft.tokens.includes(index)) { session.value.draft.tokens.push(index); persist() } }
function removeToken(position: number) { if (!locked.value && session.value) { session.value.draft.tokens.splice(position, 1); persist() } }
function selectLeft(id: string) {
  if (locked.value || !session.value) return
  if (session.value.draft.matches?.[id]) { delete session.value.draft.matches[id]; persist() }
  selectedLeft.value = id
}
function selectRight(id: string) {
  if (locked.value || !session.value || !selectedLeft.value || Object.values(matches.value).includes(id)) return
  session.value.draft.matches ||= {}
  session.value.draft.matches[selectedLeft.value] = id
  selectedLeft.value = ''
  persist()
}
function hint() {
  if (!locked.value && session.value && exercise.value && session.value.draft.hintCount < exercise.value.hints.length) { session.value.draft.hintCount++; persist() }
}
function check(reveal = false) {
  if (locked.value || !session.value || !exercise.value || (!reveal && !canCheck.value)) return
  stop()
  const correct = judgePracticeAnswer(exercise.value, answerText.value)
  const draft = session.value.draft
  session.value.answers.push({
    exerciseId: exercise.value.id, fingerprint: practiceFingerprint(exercise.value), answer: answerText.value,
    outcome: reveal ? 'revealed' : correct ? draft.hintCount || draft.revealed ? 'assisted' : 'independent' : 'incorrect',
    hintCount: draft.hintCount, answeredAt: Date.now(), reviewFor: currentTask.value?.reviewFor,
  })
  persist()
}
function next() {
  if (!session.value || !locked.value || saving.value || saveError.value) return
  stop()
  session.value.cursor++
  session.value.draft = { answer: '', tokens: [], hintCount: 0, revealed: false }
  if (session.value.cursor >= session.value.tasks.length) {
    session.value.completedAt = Date.now()
    previousSession.value = session.value
    resumable.value = null
    screen.value = 'result'
  } else prepareQuestion()
  persist()
}
function home() {
  stop()
  if (session.value && !session.value.completedAt) resumable.value = session.value
  screen.value = 'home'
  persist()
}
function revealTranscript() {
  if (!session.value || locked.value) return
  session.value.draft.revealed = true
  persist()
}
function play(slow = false) { if (exercise.value?.audio && audioAvailable.value) speak(exercise.value.audio.text, undefined, undefined, { rate: slow ? 0.75 : 1 }) }
function submitKeyboard(event: KeyboardEvent) { if (!event.isComposing) { event.preventDefault(); check() } }
function showPrevious() { if (previousSession.value) { session.value = previousSession.value; screen.value = 'result' } }
</script>

<template>
  <div class="course-practice">
    <div v-if="status === 'loading'" class="practice-message" role="status">正在准备练习…</div>
    <div v-else-if="status === 'missing'" class="practice-message">该版本尚未编写本课练习</div>
    <div v-else-if="status === 'error'" class="practice-message" role="alert"><p>练习加载失败：{{ error }}</p><button type="button" @click="load">重试</button></div>
    <template v-else-if="document">
      <div v-if="saveError" class="save-warning" role="alert">记录暂未保存：{{ saveError }}<button type="button" @click="persist">重试保存</button></div>
      <div v-if="screen === 'home'" class="practice-home">
        <span class="eyebrow">第 {{ unit.id }} 单元 · {{ unit.name }} · {{ props.version.label }}</span>
        <h3>本单元练习</h3>
        <p class="home-intro">本课题库 {{ document.exercises.length }} 题。下面的练习都来自「{{ unit.name }}」，每轮最多 8 题。</p>
        <button v-if="resumable" type="button" class="practice-button primary resume-button" @click="resume">继续未完成的练习 · {{ resumable.answers.length }} / {{ resumable.tasks.length }}</button>
        <button type="button" class="practice-button primary start-button" :disabled="!recommendedCount" @click="start('recommended')">综合练习 <span>多种题型 · {{ recommendedCount }} 题</span></button>
        <button type="button" class="practice-button review-button" :disabled="!eligibleDueCount" @click="start('review')">复习待巩固内容 <span>{{ eligibleDueCount ? `待复习 ${eligibleDueCount} 题 · 本轮最多 4 题` : '今天没有待复习的题' }}</span></button>
        <section class="activity-section" aria-labelledby="practice-types"><h4 id="practice-types">按题型练习</h4><div class="activity-grid"><button v-for="item in activityCards" :key="item.id" type="button" class="practice-button activity-card" :data-activity="item.id" :disabled="item.disabled" @click="start(`activity:${item.id}`)"><strong>{{ item.title }}</strong><span>{{ item.description }}</span><small>{{ !item.count ? '本课暂无此题型' : `本课 ${item.count} 题 · 一轮 ${item.roundCount} 题` }}</small><em v-if="item.count && item.needsAudio && !audioAvailable">需英文朗读支持</em></button></div></section>
        <p v-if="!audioAvailable" class="audio-note">当前设备没有可用的英文朗读声音，听力练习暂不可用；综合练习会选用本课文字题。</p>
        <details class="goal-details"><summary>本课训练目标</summary><div class="practice-goals"><div v-for="item in document.goals" :key="item.id"><strong>{{ item.title }}</strong><span>{{ item.description }}</span></div></div></details>
        <p v-if="notice" class="audio-note" role="status">{{ notice }}</p>
        <div class="home-links"><button v-if="previousSession" type="button" @click="showPrevious">查看上轮结果</button><button type="button" @click="emit('guide')">回看本课讲解</button></div>
      </div>
      <div v-else-if="screen === 'question' && session && exercise" class="question-area">
        <div class="round-header"><button type="button" class="text-button" @click="home">← 暂停练习</button><span>{{ session.cursor + 1 }} / {{ session.tasks.length }}</span></div>
        <div class="round-progress" role="progressbar" aria-label="本轮进度" :aria-valuenow="session.answers.length" :aria-valuemax="session.tasks.length" aria-valuemin="0"><div :style="{ width: `${session.answers.length / session.tasks.length * 100}%` }"></div></div>
        <span class="eyebrow">{{ unit.name }} · {{ activityTitle }} · {{ goal?.title }}</span>
        <h3>{{ exercise.prompt }}</h3>
        <p v-if="exercise.context" class="question-context">{{ exercise.context }}</p>
        <div v-if="exercise.audio" class="audio-actions"><button type="button" class="practice-button" :disabled="!audioAvailable" @click="play(false)">▶ 播放英文</button><button type="button" class="practice-button" :disabled="!audioAvailable" @click="play(true)">慢速播放</button><button v-if="!session.draft.revealed && !locked" type="button" class="text-button" @click="revealTranscript">听不清，查看原文</button><p v-if="session.draft.revealed || locked" class="transcript">{{ exercise.audio.text }}</p></div>
        <div v-if="exercise.kind === 'choice'" class="choice-options"><button v-for="option in orderedOptions" :key="option!.id" type="button" class="practice-button choice-option" :class="{ selected: session.draft.answer === option!.id, 'correct-option': locked && option!.id === exercise.answer }" :aria-pressed="session.draft.answer === option!.id" :disabled="locked" @click="selectOption(option!.id)">{{ option!.text }}</button></div>
        <template v-else-if="exercise.kind === 'compose'">
          <div class="compose-answer" aria-label="你组成的句子"><span v-if="!session.draft.tokens.length" class="compose-placeholder">点选词块组成句子</span><button v-for="(index, position) in session.draft.tokens" :key="index" type="button" class="practice-button token" :disabled="locked" :aria-label="`移回 ${exercise.tokens[index]}`" @click="removeToken(position)">{{ exercise.tokens[index] }}</button></div>
          <div class="compose-pool"><button v-for="index in tokenOrder" :key="index" type="button" class="practice-button token" :disabled="locked || session.draft.tokens.includes(index)" @click="addToken(index)">{{ exercise.tokens[index] }}</button></div>
        </template>
        <div v-else-if="exercise.kind === 'matching'" class="matching-area">
          <p class="matching-instructions" aria-live="polite">{{ locked ? '本组配对已提交' : selectedLeft ? '再点右边的中文意思' : '先点左边英文，再点右边中文；点已配对的英文可修改。' }}</p>
          <div class="matching-columns"><div aria-label="英文词语"><button v-for="pair in orderedLeft" :key="pair!.id" type="button" class="practice-button matching-word" :class="{ selected: selectedLeft === pair!.id, paired: Boolean(matches[pair!.id]), 'match-correct': locked && matches[pair!.id] === pair!.id, 'match-incorrect': locked && matches[pair!.id] && matches[pair!.id] !== pair!.id }" :aria-pressed="selectedLeft === pair!.id" :aria-label="`英文 ${pair!.english}`" :disabled="locked" @click="selectLeft(pair!.id)"><strong>{{ pair!.english }}</strong><small v-if="matches[pair!.id]">→ {{ matchedMeaning(pair!.id) }}</small><small v-if="locked && matches[pair!.id] && matches[pair!.id] !== pair!.id">应为：{{ pair!.chinese }}</small></button></div><div aria-label="中文意思"><button v-for="pair in orderedRight" :key="pair!.id" type="button" class="practice-button matching-meaning" :class="{ paired: Object.values(matches).includes(pair!.id) }" :aria-label="`中文 ${pair!.chinese}`" :disabled="locked || !selectedLeft || Object.values(matches).includes(pair!.id)" @click="selectRight(pair!.id)">{{ pair!.chinese }}<small v-if="Object.values(matches).includes(pair!.id)">已配对</small></button></div></div>
        </div>
        <div v-else class="input-answer"><label for="practice-answer">你的英文回答</label><input id="practice-answer" ref="inputElement" v-model="session.draft.answer" type="text" placeholder="输入单词或完整句子…" autocomplete="off" autocapitalize="none" spellcheck="false" :disabled="locked" @input="draftChanged" @keydown.enter="submitKeyboard" /></div>
        <div v-if="session.draft.hintCount && !locked" class="question-hints" aria-live="polite"><p v-for="(text, index) in exercise.hints.slice(0, session.draft.hintCount)" :key="index">{{ text }}</p></div>
        <div v-if="currentResult" class="answer-feedback" :class="{ correct: ['independent', 'assisted'].includes(currentResult.outcome) }" aria-live="polite"><strong>{{ outcomeLabels[currentResult.outcome] }}</strong><p class="model-answer">{{ modelAnswer }}</p><p>{{ feedback }}</p><small v-if="currentResult.outcome === 'assisted'">这次用过提示，稍后再独立试一次。</small><small v-else-if="currentResult.outcome === 'incorrect' || currentResult.outcome === 'revealed'">这道题已加入待巩固内容，本轮题量不会增加。</small></div>
        <div class="question-actions" v-if="!locked"><button type="button" class="practice-button" :disabled="session.draft.hintCount >= exercise.hints.length" @click="hint">{{ session.draft.hintCount ? '再提示一点' : '给我一点提示' }}</button><button type="button" class="practice-button primary check-button" :disabled="!canCheck" @click="check(false)">检查答案</button><button type="button" class="text-button reveal-answer" @click="check(true)">暂时不会，看看答案</button></div>
        <button v-else type="button" class="practice-button primary continue-button" :disabled="Boolean(saving) || Boolean(saveError)" @click="next">{{ saving ? '正在保存…' : session.cursor + 1 === session.tasks.length ? '查看本轮结果' : '继续' }}</button>
      </div>
      <div v-else-if="screen === 'result' && session" class="practice-result">
        <span class="eyebrow">本轮完成</span><h3>你完成了 {{ session.answers.length }} 道题</h3>
        <div class="result-stats"><div><strong>{{ countOutcome('independent') }}</strong><span>独立答对</span></div><div><strong>{{ countOutcome('assisted') }}</strong><span>提示后答对</span></div><div><strong>{{ countOutcome('incorrect') + countOutcome('revealed') }}</strong><span>需要巩固</span></div></div>
        <div class="result-goals"><div v-for="item in resultGoals" :key="item.id"><span>{{ item.title }}</span><small>{{ item.review ? '建议再巩固' : `本轮独立完成 ${item.independent} 题` }}</small></div></div>
        <details class="answer-review"><summary>回看本轮答案与讲解</summary><div v-for="(answer, index) in session.answers" :key="`${answer.exerciseId}:${index}`"><strong>{{ document.exercises.find(item => item.id === answer.exerciseId)?.prompt }}</strong><span>{{ outcomeLabels[answer.outcome] }}</span><p>你的回答：{{ answerLabel(answer.exerciseId, answer.answer) }}<br />参考答案：{{ referenceAnswer(answer.exerciseId) }}</p><p>{{ document.exercises.find(item => item.id === answer.exerciseId)?.explanation }}</p></div></details>
        <p class="result-note">本轮记录的是作答表现。稍后独立回忆，才更能看出是否记住了。</p>
        <div class="result-actions"><button v-if="eligibleDueCount" type="button" class="practice-button primary" :disabled="Boolean(saving) || Boolean(saveError)" @click="start('review')">巩固一下 · 最多 4 题</button><button type="button" class="practice-button" @click="home">返回练习首页</button><button type="button" class="text-button" @click="emit('guide')">回看本课讲解</button></div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.course-practice { color: #263a2f; width: 100%; min-width: 0; padding: .25rem 0 1rem; box-sizing: border-box; }
.course-practice *, .course-practice *::before, .course-practice *::after { box-sizing: border-box; }
h3 { font-size: 1.35rem; line-height: 1.5; margin: .6rem 0 1rem; overflow-wrap: anywhere; }
p { line-height: 1.7; }
.eyebrow { font-size: .78rem; color: #357a22; }
.home-intro, .question-context { color: #5c6c60; font-size: .9rem; margin: 0 0 1.3rem; }
.practice-goals { display: grid; gap: .85rem; margin: 1.3rem 0 1.5rem; }
.practice-goals > div { padding-left: .85rem; border-left: 3px solid #dcecce; }
.practice-goals strong { font-weight: 600; font-size: .9rem; }
.practice-goals span { display: block; margin-top: .2rem; color: #5c6c60; font-size: .8rem; }
.practice-button { min-height: 44px; padding: .6rem .9rem; border: 1px solid #d5dfd0; border-radius: 10px; background: #fff; color: #263a2f; font: inherit; font-size: .9rem; cursor: pointer; overflow-wrap: anywhere; }
.practice-button:disabled { cursor: default; opacity: .58; }
.practice-button:not(:disabled):hover { background: #f2f8ed; border-color: #85b972; }
.practice-button.primary { background: #3c9125; border-color: #3c9125; color: #fff; font-weight: 600; }
.practice-button.primary:not(:disabled):hover { background: #337e1e; }
.practice-button:focus-visible, .text-button:focus-visible, summary:focus-visible { outline: 2px solid #3c9125; outline-offset: 3px; }
.start-button, .resume-button, .review-button { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: .65rem; text-align: left; margin-bottom: .65rem; }
.start-button span, .review-button span { font-size: .75rem; font-weight: 400; }
summary { cursor: pointer; font-size: .85rem; padding: .35rem 0; }
.activity-section { margin-top: 1.3rem; }
.activity-section h4 { margin: 0 0 .75rem; font-size: .95rem; }
.activity-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .65rem; }
.activity-card { display: flex; flex-direction: column; align-items: flex-start; gap: .3rem; text-align: left; padding: .8rem; }
.activity-card strong { font-size: .9rem; font-weight: 600; }
.activity-card span { font-size: .77rem; color: #5c6c60; line-height: 1.5; }
.activity-card small { font-size: .72rem; color: #357a22; margin-top: auto; }
.activity-card em { font-size: .7rem; font-style: normal; color: #795737; }
.goal-details { border-top: 1px solid #e1e8dd; padding-top: .8rem; margin-top: 1rem; }
.audio-note, .result-note { color: #647268; font-size: .8rem; margin-top: 1rem; }
.home-links { display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 1rem; }
.home-links button, .text-button { color: #357a22; border: 0; background: transparent; padding: .4rem 0; font: inherit; font-size: .8rem; min-height: 40px; cursor: pointer; text-align: left; }
.round-header { display: flex; align-items: center; justify-content: space-between; gap: .75rem; color: #647268; font-size: .8rem; }
.round-progress { height: 5px; background: #edf3e9; margin: .55rem 0 1.5rem; border-radius: 6px; overflow: hidden; }
.round-progress > div { height: 100%; background: #4b9c30; }
.choice-options { display: grid; gap: .65rem; }
.choice-option { text-align: left; }
.choice-option.selected { background: #eff8e8; border: 2px solid #4b9c30; padding: calc(.6rem - 1px) calc(.9rem - 1px); }
.choice-option.correct-option { background: #e4f4da; opacity: 1; }
.compose-answer { padding: .75rem; min-height: 68px; background: #f1f6ee; border-radius: 10px; display: flex; gap: .45rem; flex-wrap: wrap; align-items: center; margin-bottom: .75rem; }
.compose-placeholder { color: #71806f; font-size: .85rem; }
.compose-pool { display: flex; gap: .45rem; flex-wrap: wrap; }
.token { min-width: 44px; }
.matching-instructions { font-size: .82rem; color: #5c6c60; margin: 0 0 .8rem; }
.matching-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; }
.matching-columns > div { display: flex; flex-direction: column; gap: .65rem; }
.matching-columns button { min-height: 60px; width: 100%; text-align: left; }
.matching-word strong { font-weight: 500; }
.matching-columns small { display: block; font-size: .75rem; color: #647268; margin-top: .25rem; }
.matching-word.selected { outline: 2px solid #4b9c30; background: #eff8e8; }
.matching-columns .paired { background: #f1f6ee; }
.matching-columns .match-correct { background: #e4f4da; border-color: #85b972; opacity: 1; }
.matching-columns .match-incorrect { background: #fff3e9; border-color: #d7a582; opacity: 1; }
.matching-meaning:disabled { opacity: .78; }
.input-answer label { display: block; font-size: .8rem; color: #647268; margin-bottom: .5rem; }
.input-answer input { width: 100%; min-height: 52px; padding: .75rem; border: 1px solid #cbd9c5; border-radius: 10px; color: #263a2f; background: #fff; font: inherit; font-size: 16px; }
.input-answer input:focus-visible { outline: 2px solid #4b9c30; outline-offset: 2px; }
.question-actions { display: flex; gap: .6rem; flex-wrap: wrap; margin-top: 1.5rem; }
.check-button { flex: 1; }
.reveal-answer { width: 100%; }
.question-hints { color: #596b53; background: #f5f8f1; border-radius: 10px; padding: .6rem .9rem; margin-top: 1rem; font-size: .85rem; }
.question-hints p { margin: .25rem 0; }
.answer-feedback { background: #fff3e9; border-radius: 12px; padding: 1rem; margin-top: 1.25rem; }
.answer-feedback.correct { background: #ecf7e5; }
.answer-feedback > strong { color: #92522c; font-size: .95rem; }
.answer-feedback.correct > strong { color: #347624; }
.answer-feedback p { font-size: .9rem; margin: .5rem 0; }
.answer-feedback .model-answer { font-size: 1rem; font-weight: 600; overflow-wrap: anywhere; }
.answer-feedback small { font-size: .78rem; color: #5c6c60; }
.continue-button { width: 100%; margin-top: 1rem; }
.audio-actions { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; margin-bottom: 1rem; }
.transcript { width: 100%; padding: .6rem .8rem; background: #f1f6ee; border-radius: 8px; margin: .3rem 0; }
.result-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .55rem; margin: 1.4rem 0; }
.result-stats > div { padding: .9rem .5rem; background: #f1f6ee; border-radius: 10px; text-align: center; }
.result-stats strong { display: block; font-size: 1.6rem; font-variant-numeric: tabular-nums; }
.result-stats span { color: #647268; font-size: .75rem; }
.result-goals > div { display: flex; justify-content: space-between; flex-wrap: wrap; gap: .4rem; padding: .8rem 0; border-bottom: 1px solid #e1e8dd; font-size: .85rem; }
.result-goals small { color: #647268; font-size: .78rem; }
.result-actions { display: flex; gap: .6rem; flex-wrap: wrap; margin-top: 1rem; }
.result-actions .primary { width: 100%; }
.answer-review { margin-top: 1rem; }
.answer-review > div { padding: .9rem 0; border-bottom: 1px solid #e1e8dd; font-size: .85rem; }
.answer-review span { display: block; color: #647268; font-size: .75rem; margin-top: .25rem; }
.answer-review p { margin: .4rem 0; }
.practice-message { padding: 2rem .75rem; color: #647268; text-align: center; font-size: .9rem; }
.practice-message button, .save-warning button { min-height: 40px; color: #357a22; border: 1px solid #d5dfd0; border-radius: 8px; background: #fff; padding: .4rem .8rem; cursor: pointer; }
.save-warning { padding: .8rem; background: #fff3e9; border-radius: 8px; font-size: .8rem; overflow-wrap: anywhere; margin-bottom: 1rem; }
.save-warning button { display: block; margin-top: .5rem; }
@media (max-width: 480px) { h3 { font-size: 1.2rem; } .review-button { align-items: flex-start; flex-direction: column; gap: .2rem; } .round-header .text-button, .home-links button, .text-button { min-height: 44px; } .activity-card { padding: .7rem; } }
</style>
