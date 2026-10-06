import type { CourseUnitIndex } from './course-markdown'
import { courseGuideUrl, type CourseVersion } from './course-versions'
import { parsePracticeSource } from './practice-schema.mjs'

export { parsePracticeSource }
export interface PracticeGoal { id: string; title: string; description: string }
export const practiceActivities = [
  { id: 'word-choice', title: '词义选择', description: '看词选义，或看中文选英文' },
  { id: 'cloze', title: '补全句子', description: '选出空缺处合适的词' },
  { id: 'compose', title: '连词成句', description: '点选词块，组成一句话' },
  { id: 'write', title: '英文填写', description: '自己写出单词或句子' },
  { id: 'matching', title: '词义配对', description: '把英文和中文逐一配对' },
  { id: 'audio-choice', title: '听音选义', description: '听英文，选择对应的意思' },
  { id: 'audio-spell', title: '听音拼写', description: '听单词，写出英文拼写' },
  { id: 'dictation', title: '句子听写', description: '听一句话，独立写下来' },
] as const
export type PracticeActivity = typeof practiceActivities[number]['id']
interface ExerciseBase {
  id: string
  goalId: string
  stage: 'recognize' | 'build' | 'recall'
  targets: string[]
  prompt: string
  context?: string
  hints: string[]
  explanation: string
  audio?: { text: string }
  activity?: PracticeActivity
}
export interface ChoiceExercise extends ExerciseBase {
  kind: 'choice'
  options: { id: string; text: string; feedback: string }[]
  answer: string
}
export interface ComposeExercise extends ExerciseBase { kind: 'compose'; tokens: string[]; answers: string[] }
export interface InputExercise extends ExerciseBase { kind: 'input'; answers: string[] }
export interface MatchingExercise extends ExerciseBase { kind: 'matching'; pairs: { id: string; english: string; chinese: string }[] }
export type PracticeExercise = ChoiceExercise | ComposeExercise | InputExercise | MatchingExercise
export interface PracticeDocument {
  schemaVersion: 1 | 2
  unitId: number
  title: string
  goals: PracticeGoal[]
  auxiliaryWords?: string[]
  exercises: PracticeExercise[]
}
export type PracticeOutcome = 'independent' | 'assisted' | 'incorrect' | 'revealed'
export interface PracticeItemState {
  id: string
  versionId: string
  unitId: number
  exerciseId: string
  fingerprint: string
  goalId: string
  attempts: number
  independentCount: number
  lastOutcome: PracticeOutcome
  updatedAt: number
  dueAt: number
  reviewLevel: number
}
export interface PracticeTask { exerciseId: string; reviewFor?: string }
export interface PracticeAnswer {
  exerciseId: string
  fingerprint: string
  outcome: PracticeOutcome
  answer: string
  hintCount: number
  answeredAt: number
  reviewFor?: string
}
export interface PracticeSession {
  id: string
  versionId: string
  unitId: number
  fingerprints: Record<string, string>
  mode: string
  tasks: PracticeTask[]
  answers: PracticeAnswer[]
  cursor: number
  draft: { answer: string; tokens: number[]; matches?: Record<string, string>; hintCount: number; revealed: boolean }
  startedAt: number
  updatedAt: number
  completedAt?: number
}
export function normalizePracticeAnswer(value: string): string {
  return value.trim().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').replace(/[.!?。！？]+$/g, '').trim().toLowerCase()
}
export function judgePracticeAnswer(exercise: PracticeExercise, answer: string): boolean {
  if (exercise.kind === 'choice') return answer === exercise.answer
  if (exercise.kind === 'matching') {
    try {
      const matches = JSON.parse(answer)
      return Boolean(matches && typeof matches === 'object' && !Array.isArray(matches) && Object.keys(matches).length === exercise.pairs.length && exercise.pairs.every(pair => matches[pair.id] === pair.id))
    } catch { return false }
  }
  return exercise.answers.some(value => normalizePracticeAnswer(value) === normalizePracticeAnswer(answer))
}
export function practiceActivity(exercise: PracticeExercise): PracticeActivity {
  if (exercise.activity) return exercise.activity
  if (exercise.kind === 'matching' || exercise.kind === 'compose') return exercise.kind
  if (exercise.audio) return exercise.kind === 'choice' ? 'audio-choice' : /\s/.test(exercise.audio.text.trim()) ? 'dictation' : 'audio-spell'
  return exercise.kind === 'choice' ? /_{2,}/.test(exercise.prompt) ? 'cloze' : 'word-choice' : 'write'
}
// Store the canonical grading data itself: no collisions or dependency on a hashing implementation.
export function practiceFingerprint(exercise: PracticeExercise): string {
  const base = [1, exercise.kind, exercise.goalId, exercise.stage, exercise.targets, exercise.prompt, exercise.context || '', exercise.audio?.text || '']
  return JSON.stringify([...base, exercise.kind === 'choice'
    ? [exercise.options.map(option => [option.id, option.text]), exercise.answer]
    : exercise.kind === 'matching' ? exercise.pairs.map(pair => [pair.id, pair.english, pair.chinese])
    : [exercise.kind === 'compose' ? exercise.tokens : [], exercise.answers]])
}
export function practiceItemId(versionId: string, unitId: number, exerciseId: string): string {
  return JSON.stringify([versionId, unitId, exerciseId])
}
export function currentPracticeStates(document: PracticeDocument, states: PracticeItemState[]): PracticeItemState[] {
  const fingerprints = new Map(document.exercises.map(exercise => [exercise.id, practiceFingerprint(exercise)]))
  return states.filter(state => fingerprints.get(state.exerciseId) === state.fingerprint)
}
export function shufflePractice<T>(values: T[], random = Math.random): T[] {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
export function planPracticeSession(document: PracticeDocument, mode: string, states: PracticeItemState[], audioAvailable: boolean, now = Date.now(), random = Math.random): PracticeTask[] {
  const eligible = document.exercises.filter(exercise => !exercise.audio || audioAvailable)
  const current = currentPracticeStates(document, states)
  if (mode === 'review') {
    const due = current.filter(state => state.dueAt <= now && eligible.some(exercise => exercise.id === state.exerciseId)).sort((a, b) => a.dueAt - b.dueAt)
    const used = new Set<string>()
    const dueIds = new Set(due.slice(0, 4).map(state => state.exerciseId))
    return due.slice(0, 4).map(state => {
      const original = eligible.find(exercise => exercise.id === state.exerciseId)!
      const alternatives = eligible.filter(exercise => exercise.goalId === original.goalId && exercise.id !== original.id && !used.has(exercise.id) && !dueIds.has(exercise.id)
        && Boolean(exercise.audio) === Boolean(original.audio) && exercise.targets.some(target => original.targets.includes(target)))
      const exercise = shufflePractice(alternatives, random)[0] || original
      used.add(exercise.id)
      return { exerciseId: exercise.id, reviewFor: original.id }
    })
  }
  const pool = eligible.filter(exercise => mode === 'recommended' || (mode.startsWith('activity:') ? practiceActivity(exercise) === mode.slice(9) : mode === 'listening' ? Boolean(exercise.audio) : mode === 'expression' ? exercise.stage === 'recall' : exercise.goalId === mode))
  const seen = new Map(current.map(state => [state.exerciseId, state.attempts]))
  const stages = { recognize: 0, build: 1, recall: 2 }
  const candidates = shufflePractice(pool, random).sort((a, b) => (seen.get(a.id) || 0) - (seen.get(b.id) || 0))
  const selected: PracticeExercise[] = []
  if (mode === 'recommended') {
    for (const goal of document.goals) {
      const item = candidates.find(exercise => exercise.goalId === goal.id && exercise.stage === 'recognize') || candidates.find(exercise => exercise.goalId === goal.id)
      if (item && selected.length < 8) selected.push(item)
    }
    // Include productive recall, then a listening task when the device can play it.
    for (const predicate of [(exercise: PracticeExercise) => exercise.stage === 'build', (exercise: PracticeExercise) => exercise.stage === 'recall', (exercise: PracticeExercise) => exercise.kind === 'matching', (exercise: PracticeExercise) => Boolean(exercise.audio)]) {
      const item = candidates.find(exercise => predicate(exercise) && !selected.includes(exercise))
      if (item && selected.length < 8) selected.push(item)
    }
  }
  for (const item of candidates) if (!selected.includes(item) && selected.length < 8) selected.push(item)
  return selected.sort((a, b) => stages[a.stage] - stages[b.stage]).map(exercise => ({ exerciseId: exercise.id }))
}
export function isPracticeSessionCurrent(session: PracticeSession, document: PracticeDocument): boolean {
  const byId = new Map(document.exercises.map(exercise => [exercise.id, practiceFingerprint(exercise)]))
  return session.unitId === document.unitId && Number.isInteger(session.cursor) && session.cursor >= 0 && session.cursor <= session.tasks.length
    && session.answers.length >= session.cursor && session.answers.length <= Math.min(session.cursor + 1, session.tasks.length)
    && session.answers.every((answer, index) => answer.exerciseId === session.tasks[index]?.exerciseId && answer.fingerprint === byId.get(answer.exerciseId))
    && session.tasks.length > 0 && session.tasks.every(task => byId.get(task.exerciseId) === session.fingerprints[task.exerciseId]
    && (!task.reviewFor || byId.get(task.reviewFor) === session.fingerprints[task.reviewFor]))
}
export async function loadCoursePractice(version: CourseVersion, unit: CourseUnitIndex, signal?: AbortSignal): Promise<PracticeDocument | null> {
  if (version.format !== 'split' || !version.practiceUnitIds?.includes(unit.id)) return null
  const response = await fetch(courseGuideUrl(version, unit).replace(/\.md$/, '.test.md'), { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const source = await response.text()
  if (response.headers.get('content-type')?.includes('text/html') || /^\s*<(?:!doctype|html)\b/i.test(source)) throw new Error('未找到练习文件')
  return parsePracticeSource(source, unit)
}
