import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { collectCourseVersions, validateCourseIndex } from '../scripts/course-version-tools.mjs'

const roots: string[] = []
const units = [
  { id: 1, name: '喜好', desc: '', words: ['I', 'like'], file: '001-喜好.md' },
  { id: 2, name: '喜好 2', desc: '', words: ['blue'], file: '002-喜好 2.md' },
]
const manifest = {
  defaultVersionId: 'gpt-6.1',
  versions: [
    { id: 'original', label: '原版', directory: 'duolingo-zs-en', format: 'combined', guideUnitIds: [] },
    { id: 'gpt-6.1', label: 'GPT-6.1', directory: 'duolingo-zs-en.gpt-6.1', format: 'split', guideUnitIds: [] },
  ],
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'lexi-course-versions-'))
  roots.push(root)
  manifest.versions.forEach(version => mkdirSync(join(root, version.directory)))
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(join(resolve(tmpdir()), 'lexi-course-versions-'))) throw new Error('Unsafe fixture path')
    rmSync(root, { recursive: true, force: true })
  }
})

describe('course version discovery', () => {
  it('publishes partial versions and ignores reserved practice files', () => {
    const root = fixture()
    const directory = join(root, 'duolingo-zs-en.gpt-6.1')
    writeFileSync(join(directory, units[0].file), '# 喜好\n\n全新讲解。')
    writeFileSync(join(directory, '002-喜好 2.test.md'), '# 喜好 2练习\n\n```lexi-practice\n' + JSON.stringify({ schemaVersion: 1, unitId: 2, title: '练习', goals: [{ id: 'color', title: '颜色', description: '辨认颜色' }] }) + '\n```\n\n```lexi-exercise\n' + JSON.stringify({ id: 'blue-01', goalId: 'color', kind: 'input', stage: 'recall', targets: ['blue'], prompt: '蓝色', answers: ['blue'], hints: ['首字母 b'], explanation: 'blue 是蓝色' }) + '\n```')
    const result = collectCourseVersions(root, units, manifest)
    expect(result.versions[1].guideUnitIds).toEqual([1])
    expect(result.versions[1].practiceUnitIds).toEqual([2])
    expect(manifest.versions[1].guideUnitIds).toEqual([])
  })

  it('requires the exact raw-index filename and title', () => {
    const root = fixture()
    const directory = join(root, 'duolingo-zs-en.gpt-6.1')
    writeFileSync(join(directory, units[0].file), '# 别的标题\n\n讲解。')
    expect(() => collectCourseVersions(root, units, manifest)).toThrow('一级标题')
    writeFileSync(join(directory, units[0].file), '# 喜好\n\n讲解。')
    writeFileSync(join(directory, '002-不同名称.md'), '# 喜好 2\n\n讲解。')
    expect(() => collectCourseVersions(root, units, manifest)).toThrow('讲义文件名未匹配')
  })

  it('rejects exercises embedded in a lecture without requiring exercises', () => {
    const root = fixture()
    const file = join(root, 'duolingo-zs-en.gpt-6.1', units[0].file)
    writeFileSync(file, '# 喜好\n\n<quiz-word-list>I</quiz-word-list>')
    expect(() => collectCourseVersions(root, units, manifest)).toThrow('不能包含练习标签')
    writeFileSync(file, '# 喜好\n\n```lexi-exercise\n{}\n```')
    expect(() => collectCourseVersions(root, units, manifest)).toThrow('不能包含练习标签')
  })

  it('rejects duplicate source IDs, duplicate words and unsafe version directories', () => {
    expect(() => validateCourseIndex([units[0], units[0]])).toThrow('原始课程 JSON 单元无效')
    expect(() => validateCourseIndex([{ ...units[0], words: ['I', 'i'] }])).toThrow()
    expect(() => collectCourseVersions(fixture(), units, {
      ...manifest, versions: [{ ...manifest.versions[1], directory: '../outside' }],
    })).toThrow('目录或格式无效')
  })
})
