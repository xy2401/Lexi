import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  currentPracticeStates, judgePracticeAnswer, parsePracticeSource, planPracticeSession, practiceFingerprint,
  type PracticeDocument, type PracticeItemState,
} from '../src/lib/course-practice'

const unit = JSON.parse(readFileSync(resolve('public/data/duolingo-zs-en.json'), 'utf8'))[0]
const source = readFileSync(resolve('public/data/duolingo-zs-en.gpt-6.1/001-喜好.test.md'), 'utf8')
const document = parsePracticeSource(source, unit)
const state = (id: string, dueAt = 0): PracticeItemState => {
  const exercise = document.exercises.find(item => item.id === id)!
  return { id, versionId: 'gpt-6.1', unitId: 1, exerciseId: id, fingerprint: practiceFingerprint(exercise), goalId: exercise.goalId, attempts: 1, independentCount: 0, lastOutcome: 'incorrect', updatedAt: 0, dueAt, reviewLevel: 0 }
}

describe('independent exercise format', () => {
  it('validates the first lesson and covers all original target words', () => {
    expect(document.schemaVersion).toBe(2)
    expect(source).not.toContain('```')
    expect(document.exercises).toHaveLength(32)
    expect(document.goals).toHaveLength(4)
    expect(new Set(document.exercises.flatMap(item => item.targets))).toEqual(new Set(unit.words))
    expect(document.exercises.filter(item => item.audio)).toHaveLength(7)
    expect(new Set(document.exercises.map(item => item.activity)).size).toBe(8)
  })
  it('rejects missing or duplicated metadata, unknown formats and malformed blocks', () => {
    expect(() => parsePracticeSource(source.replace('format="2"', 'format="3"'), unit)).toThrow('格式版本')
    expect(() => parsePracticeSource(source + '\n<practice unit="1" format="2"></practice>', unit)).toThrow('唯一')
    expect(() => parsePracticeSource(source.replace('type="choice"', 'type="mystery"'), unit)).toThrow('不匹配')
    expect(() => parsePracticeSource(source.replace('</practice>', ''), unit)).toThrow('闭合')
    expect(() => parsePracticeSource(source.replace('unit="1"', 'unit="2"'), unit)).toThrow('单元编号')
    expect(() => parsePracticeSource(source.replace('### 提示', '### 未知小节'), unit)).toThrow('未知')
    expect(() => parsePracticeSource(source.replace('activity="word-choice"', 'activity="audio-choice"'), unit)).toThrow('听力配置')
  })
  it('rejects ambiguous choices, invalid targets and unbuildable sentences', () => {
    expect(() => parsePracticeSource(source.replace('- [cat] 猫', '- [book] 猫'), unit)).toThrow('选项')
    expect(() => parsePracticeSource(source.replace('目标词：book, my', '目标词：unknown'), unit)).toThrow('原始词表')
    expect(() => parsePracticeSource(source.replace('You | like | Chinese | I | am', 'You | Chinese'), unit)).toThrow('不能组成')
    expect(() => parsePracticeSource(source.replace('id="u001-meaning-02"', 'id="u001-meaning-01"'), unit)).toThrow('重复')
    expect(() => parsePracticeSource(source.replace('cat | 猫', 'cat | 书'), unit)).toThrow('配对内容')
  })
  it('accepts intended answer variants and cosmetics, but preserves meaningful errors', () => {
    const input = document.exercises.find(item => item.id === 'u001-preference-05')!
    expect(judgePracticeAnswer(input, '  i   LIKE my book !!! ')).toBe(true)
    expect(judgePracticeAnswer(input, 'I like your book.')).toBe(false)
    expect(judgePracticeAnswer(input, 'I am like my book.')).toBe(false)
    const identity = document.exercises.find(item => item.id === 'u001-identity-05')!
    expect(judgePracticeAnswer(identity, 'I’m a student.')).toBe(true)
    const composed = document.exercises.find(item => item.id === 'u001-preference-04')!
    expect(judgePracticeAnswer(composed, 'I like Chinese and English')).toBe(true)
    expect(judgePracticeAnswer(composed, 'I like English Chinese')).toBe(false)
  })
  it('grades a complete one-to-one matching and preserves existing fingerprints after format migration', () => {
    const matching = document.exercises.find(item => item.kind === 'matching')!
    if (matching.kind !== 'matching') throw new Error('missing matching exercise')
    const answers = Object.fromEntries(matching.pairs.map(pair => [pair.id, pair.id]))
    expect(judgePracticeAnswer(matching, JSON.stringify(answers))).toBe(true)
    expect(judgePracticeAnswer(matching, JSON.stringify({ ...answers, cat: 'book' }))).toBe(false)
    expect(judgePracticeAnswer(matching, JSON.stringify({ book: 'book' }))).toBe(false)
    expect(judgePracticeAnswer(matching, 'null')).toBe(false)
    expect(judgePracticeAnswer(matching, 'not json')).toBe(false)
    const unchanged = document.exercises.find(item => item.id === 'u001-meaning-01')!
    expect(practiceFingerprint(unchanged)).toBe(practiceFingerprint({ ...unchanged, activity: undefined }))
  })
})

describe('bounded practice planning', () => {
  it('covers all goals, includes construction and recall, and avoids audio when unavailable', () => {
    for (let round = 0; round < 25; round++) {
      const tasks = planPracticeSession(document, 'recommended', [], false)
      expect(tasks).toHaveLength(8)
      expect(new Set(tasks.map(task => task.exerciseId)).size).toBe(8)
      const questions = tasks.map(task => document.exercises.find(item => item.id === task.exerciseId)!)
      expect(new Set(questions.map(item => item.goalId)).size).toBe(4)
      expect(questions.some(item => item.stage === 'build')).toBe(true)
      expect(questions.some(item => item.stage === 'recall')).toBe(true)
      expect(questions.some(item => item.audio)).toBe(false)
      expect(questions.some(item => item.kind === 'matching')).toBe(true)
    }
    const audio = planPracticeSession(document, 'recommended', [], true)
    expect(audio.some(task => document.exercises.find(item => item.id === task.exerciseId)?.audio)).toBe(true)
  })
  it('uses actual sizes for specialties and never manufactures missing questions', () => {
    expect(planPracticeSession(document, 'listening', [], false)).toEqual([])
    expect(planPracticeSession(document, 'listening', [], true)).toHaveLength(7)
    expect(planPracticeSession(document, 'possession', [], true)).toHaveLength(7)
    expect(planPracticeSession(document, 'activity:matching', [], false)).toHaveLength(2)
    expect(planPracticeSession(document, 'activity:audio-spell', [], true)).toHaveLength(2)
    expect(planPracticeSession(document, 'activity:audio-spell', [], false)).toEqual([])
    const writing = planPracticeSession(document, 'activity:write', [], true)
    expect(writing.every(task => document.exercises.find(item => item.id === task.exerciseId)?.activity === 'write')).toBe(true)
    const partial: PracticeDocument = { ...document, exercises: document.exercises.slice(0, 2) }
    expect(planPracticeSession(partial, 'recommended', [], false)).toHaveLength(2)
  })
  it('reviews at most four due items, prefers related variants, and does not duplicate tasks', () => {
    const items = document.exercises.slice(0, 5).map(item => state(item.id))
    const tasks = planPracticeSession(document, 'review', items, true, 10)
    expect(tasks).toHaveLength(4)
    expect(new Set(tasks.map(task => task.exerciseId)).size).toBe(4)
    expect(tasks[0].reviewFor).toBe(document.exercises[0].id)
    expect(tasks[0].exerciseId).not.toBe(tasks[0].reviewFor)
    expect(planPracticeSession(document, 'review', [state(document.exercises[0].id, 100)], true, 10)).toEqual([])
  })
  it('invalidates changed grading data while preserving progress after explanation edits', () => {
    const exercise = document.exercises[0]
    const old = state(exercise.id)
    expect(currentPracticeStates({ ...document, exercises: [{ ...exercise, explanation: '新版解释' }] }, [old])).toHaveLength(1)
    expect(currentPracticeStates({ ...document, exercises: [{ ...exercise, prompt: '新题干' }] }, [old])).toEqual([])
  })
})
