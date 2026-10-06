import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePracticeSource } from '../src/lib/practice-schema.mjs'
import { validateCourseIndex } from './course-version-tools.mjs'

// Audit the selected model only. Never inspect prose from another version.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dataDirectory = resolve(root, 'public/data')
const units = JSON.parse(readFileSync(resolve(dataDirectory, 'duolingo-zs-en.json'), 'utf8'))
validateCourseIndex(units)
const manifest = JSON.parse(readFileSync(resolve(dataDirectory, 'duolingo-zs-en.versions.json'), 'utf8'))
const versionId = process.argv[2] || manifest.defaultVersionId
const complete = process.argv.includes('--complete')
const version = manifest.versions.find(version => version.id === versionId)
if (!version || version.format !== 'split' || !/^[a-z0-9][a-z0-9.-]*$/.test(versionId)
  || versionId.includes('..') || version.directory !== `duolingo-zs-en.${versionId}`) {
  throw new Error('请选择已注册、使用独立 Markdown 的模型版本')
}
const directory = resolve(dataDirectory, version.directory)
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const errors = []
const pending = []
const ids = new Set()
const activities = new Map()
let guides = 0
let practices = 0
let questions = 0
let coveredWords = 0

for (const unit of units) {
  const guidePath = resolve(directory, unit.file)
  const practicePath = resolve(directory, unit.file.replace(/\.md$/, '.test.md'))
  const hasGuide = existsSync(guidePath)
  const hasPractice = existsSync(practicePath)
  if (!hasGuide || !hasPractice) pending.push(unit.id)
  if (hasGuide) {
    guides++
    const guide = readFileSync(guidePath, 'utf8')
    if (guide.trim().split(/\r?\n/)[0] !== `# ${unit.name}`) errors.push(`${unit.id}: 讲义标题不匹配`)
    if (/<\/?(?:practice|exercise|quiz-[a-z-]+)\b/.test(guide)) errors.push(`${unit.id}: 讲义混入练习标签`)
    for (const word of unit.words) {
      if (!new RegExp(`(^|[^a-z])${escape(word)}(?=$|[^a-z])`, 'i').test(guide)) {
        errors.push(`${unit.id}: 讲义未介绍目标词 ${word}`)
      }
    }
  }
  if (hasPractice) {
    practices++
    const source = readFileSync(practicePath, 'utf8')
    const practice = parsePracticeSource(source, unit)
    if (practice.schemaVersion !== 2) errors.push(`${unit.id}: 练习应使用可读 Markdown 格式 2`)
    const covered = new Set()
    for (const exercise of practice.exercises) {
      if (ids.has(exercise.id)) errors.push(`${unit.id}: 跨单元题目 ID 重复 ${exercise.id}`)
      ids.add(exercise.id)
      exercise.targets.forEach(word => covered.add(word.toLowerCase()))
      activities.set(exercise.activity, (activities.get(exercise.activity) || 0) + 1)
      questions++
    }
    coveredWords += covered.size
    for (const word of unit.words) if (!covered.has(word.toLowerCase())) errors.push(`${unit.id}: 练习未覆盖目标词 ${word}`)
  }
}

if (complete && pending.length) errors.push(`尚有 ${pending.length} 单元未同时完成讲义和练习：${pending.join(', ')}`)
const summary = { version: versionId, units: units.length, guides, practices, questions, coveredWords, activities: Object.fromEntries(activities), pendingCount: pending.length, nextPending: pending.slice(0, 10) }
console.log(JSON.stringify(summary, null, 2))
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
