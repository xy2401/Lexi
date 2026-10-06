import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePracticeSource } from '../src/lib/practice-schema.mjs'
import { judgePracticeAnswer } from '../src/lib/course-practice'
import type { CourseUnitIndex } from '../src/lib/course-markdown'

const units = JSON.parse(readFileSync(resolve('public/data/duolingo-zs-en.json'), 'utf8')) as CourseUnitIndex[]
const manifest = JSON.parse(readFileSync(resolve('public/data/duolingo-zs-en.versions.json'), 'utf8'))
const version = manifest.versions.find((item: { id: string }) => item.id === 'gpt-6.1')
const directory = resolve('public/data', version.directory)

describe('published GPT-6.1 course content', () => {
  it('matches the published guide and practice indexes to actual source filenames', () => {
    const files = new Set(readdirSync(directory))
    expect(units.filter(unit => files.has(unit.file)).map(unit => unit.id)).toEqual(version.guideUnitIds)
    expect(units.filter(unit => files.has(unit.file.replace(/\.md$/, '.test.md'))).map(unit => unit.id)).toEqual(version.practiceUnitIds)
    const expected = new Set(units.flatMap(unit => [unit.file, unit.file.replace(/\.md$/, '.test.md')]))
    expect([...files].filter(file => file.endsWith('.md') && !expected.has(file))).toEqual([])
    for (const id of version.guideUnitIds) {
      const unit = units.find(unit => unit.id === id)!
      const guide = readFileSync(resolve(directory, unit.file), 'utf8')
      expect(guide.split(/\r?\n/)[0]).toBe(`# ${unit.name}`)
      expect(guide).not.toMatch(/<\/?(?:practice|exercise|quiz-[a-z-]+)\b/)
    }
  })

  it('parses every published Markdown practice, covers target words, and grades canonical answers', () => {
    const ids = new Set<string>()
    for (const id of version.practiceUnitIds) {
      const unit = units.find(unit => unit.id === id)!
      const source = readFileSync(resolve(directory, unit.file.replace(/\.md$/, '.test.md')), 'utf8')
      const practice = parsePracticeSource(source, unit)
      expect(practice.schemaVersion).toBe(2)
      expect(source).not.toMatch(/```|~~~/)
      const covered = new Set(practice.exercises.flatMap(exercise => exercise.targets.map(word => word.toLowerCase())))
      expect(unit.words.filter(word => !covered.has(word.toLowerCase()))).toEqual([])
      for (const exercise of practice.exercises) {
        expect(ids.has(exercise.id)).toBe(false)
        ids.add(exercise.id)
        const answer = exercise.kind === 'choice' ? exercise.answer
          : exercise.kind === 'matching' ? JSON.stringify(Object.fromEntries(exercise.pairs.map(pair => [pair.id, pair.id])))
            : exercise.answers[0]
        expect(judgePracticeAnswer(exercise, answer)).toBe(true)
        expect(judgePracticeAnswer(exercise, '__unrelated_answer__')).toBe(false)
        if (exercise.kind === 'compose' || exercise.kind === 'input') {
          for (const alternative of exercise.answers) expect(judgePracticeAnswer(exercise, alternative)).toBe(true)
        }
      }
    }
  })
})
