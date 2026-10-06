import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parsePracticeSource } from '../src/lib/practice-schema.mjs'

export function validateCourseIndex(units) {
  if (!Array.isArray(units) || !units.length) throw new Error('原始课程 JSON 必须是非空数组')
  const ids = new Set()
  const files = new Set()
  for (const unit of units) {
    if (!unit || !Number.isSafeInteger(unit.id) || unit.id <= 0 || ids.has(unit.id)
      || typeof unit.name !== 'string' || !unit.name.trim() || typeof unit.desc !== 'string'
      || typeof unit.file !== 'string' || !/^\d{3}-[^<>:"/\\|?*]+\.md$/.test(unit.file)
      || unit.file.endsWith('.test.md') || !unit.file.startsWith(`${String(unit.id).padStart(3, '0')}-`)
      || files.has(unit.file) || !Array.isArray(unit.words) || !unit.words.length
      || unit.words.some(word => typeof word !== 'string' || !word.trim())
      || new Set(unit.words.map(word => word.toLowerCase())).size !== unit.words.length) {
      throw new Error(`原始课程 JSON 单元无效：${unit?.id ?? '未知'}`)
    }
    ids.add(unit.id)
    files.add(unit.file)
  }
}

export function collectCourseVersions(dataDirectory, units, manifest) {
  validateCourseIndex(units)
  if (!manifest || !Array.isArray(manifest.versions) || !manifest.versions.length) {
    throw new Error('讲义版本清单为空或格式错误')
  }
  const unitFiles = new Map(units.map(unit => [unit.file, unit]))
  const practiceFiles = new Map(units.map(unit => [unit.file.replace(/\.md$/, '.test.md'), unit]))
  const ids = new Set()
  const versions = manifest.versions.map(version => {
    if (!version || typeof version.id !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(version.id)
      || version.id.includes('..') || ids.has(version.id) || typeof version.label !== 'string' || !version.label.trim()) {
      throw new Error('讲义版本 ID 或名称无效')
    }
    ids.add(version.id)
    const original = version.id === 'original'
    if (version.format !== (original ? 'combined' : 'split')
      || version.directory !== (original ? 'duolingo-zs-en' : `duolingo-zs-en.${version.id}`)) {
      throw new Error(`讲义版本 ${version.id} 的目录或格式无效`)
    }
    const directory = resolve(dataDirectory, version.directory)
    const guideUnitIds = []
    const practiceUnitIds = []
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      if (entry.name.endsWith('.test.md')) {
        if (!practiceFiles.has(entry.name)) throw new Error(`${version.directory}/${entry.name}: 练习文件名未匹配原始单元`)
        if (!original) {
          parsePracticeSource(readFileSync(resolve(directory, entry.name), 'utf8'), practiceFiles.get(entry.name))
          practiceUnitIds.push(practiceFiles.get(entry.name).id)
        }
        continue
      }
      const unit = unitFiles.get(entry.name)
      if (!unit) throw new Error(`${version.directory}/${entry.name}: 讲义文件名未匹配原始单元`)
      if (!original) {
        const source = readFileSync(resolve(directory, entry.name), 'utf8')
        if (source.trim().split(/\r?\n/, 1)[0] !== `# ${unit.name}`) {
          throw new Error(`${version.directory}/${entry.name}: 一级标题应为 # ${unit.name}`)
        }
        if (/<\/?(?:quiz-[a-z0-9-]+|practice|exercise)\b/i.test(source) || /^\s*```lexi-(?:practice|exercise)\b/m.test(source)) {
          throw new Error(`${version.directory}/${entry.name}: 新版讲义不能包含练习标签`)
        }
        if (!source.trim().includes('\n')) throw new Error(`${version.directory}/${entry.name}: 讲义正文为空`)
      }
      guideUnitIds.push(unit.id)
    }
    return { ...version, guideUnitIds: guideUnitIds.sort((a, b) => a - b), practiceUnitIds: practiceUnitIds.sort((a, b) => a - b) }
  })
  if (!ids.has(manifest.defaultVersionId)) throw new Error('默认讲义版本不存在')
  return { ...manifest, versions }
}
