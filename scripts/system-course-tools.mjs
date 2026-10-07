import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'
import { COURSE_SVG_SIZES, COURSE_VISUAL_ASSETS, COURSE_VISUAL_PRESETS } from '../src/lib/course-visual-presets.mjs'

export const categories = ['发音', '构词', '语法', '生活', '中学', '大学', '工作']
const folderNames = ['pronunciation', 'word-formation', 'grammar', 'daily-life', 'secondary', 'university', 'work']

export function validateSystemCourseSemanticTags(markdown) {
  const errors = []
  let fence
  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined
      continue
    }
    if (marker) {
      fence = { char: marker[1][0], length: marker[1].length }
      continue
    }
    const remaining = line.replace(/<lexi-(word|morpheme|phoneme|notation)\b[^>]*>\s*`[^`\r\n]+`\s*<\/lexi-\1>/g,
      match => (match.match(/<\/?lexi-/g) || []).length === 2 ? '' : match)
    if (/<\/?lexi-[a-z-]+\b/.test(remaining)) {
      errors.push(`第 ${index + 1} 行：语义标签必须配对，并包裹一个反引号完整闭合的行内代码片段`)
    }
  }
  return errors
}

export function validateSystemCourses(projectRoot = path.resolve('.')) {
  const errors = validateSystemCourseVisualAssets(projectRoot)
  const courseRoot = path.resolve(projectRoot, 'public/data/system-courses')
  const catalog = JSON.parse(fs.readFileSync(path.resolve(projectRoot, 'public/data/system-courses.json'), 'utf8'))
  const curriculum = fs.readFileSync(path.join(courseRoot, '_curriculum.md'), 'utf8')
  for (const [, relative] of curriculum.matchAll(/\]\(\.\/([^)]+\.md)\)/g)) {
    const absolute = path.resolve(courseRoot, relative)
    if (!absolute.startsWith(courseRoot + path.sep) || !fs.existsSync(absolute)) errors.push(`规划正文链接无效：${relative}`)
  }
  const plans = new Map()
  let tag = ''
  let series = ''
  for (const line of curriculum.split(/\r?\n/)) {
    const category = line.match(/^## \d\. (.+)$/)
    const group = line.match(/^### (.+)系列$/)
    const chapter = line.match(/^#### ([A-Z][A-Z0-9-]*\d{2}) (.+)$/)
    if (category) tag = category[1]
    if (group) series = group[1]
    if (chapter) plans.set(chapter[1], { tag, series })
  }
  if (!Array.isArray(catalog) || !catalog.length) return { errors: ['发布清单必须为非空数组'], catalog: [] }
  const slugs = new Set()
  const ids = new Set()
  const files = new Set()
  const defaults = new Set()
  const legacy = new Set()
  for (const course of catalog) {
    const label = course.slug || String(course.id)
    const fail = message => errors.push(`${label}: ${message}`)
    if (!Number.isInteger(course.id) || course.id < 1 || ids.has(course.id)) fail('id 无效或重复')
    ids.add(course.id)
    if (typeof course.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(course.slug) || slugs.has(course.slug)) fail('slug 无效或重复')
    slugs.add(course.slug)
    if (['title', 'desc', 'series', 'icon'].some(field => typeof course[field] !== 'string' || !course[field].trim())) fail('标题、描述、系列或图标缺失')
    if (!categories.includes(course.tag) || !['chapter', 'overview'].includes(course.kind)) fail('分类或篇章类型无效')
    if (!Array.isArray(course.words) || course.words.some(word => typeof word !== 'string' || !/^[a-z]+(?:-[a-z]+)*$/.test(word))) fail('核心词必须为完整英文单词')
    if (!Array.isArray(course.legacyIds) || course.legacyIds.some(id => !Number.isInteger(id) || id < 1 || id > 39)) fail('旧课对应无效')
    else course.legacyIds.forEach(id => legacy.add(id))
    if (!Array.isArray(course.legacyDefaultIds) || course.legacyDefaultIds.some(id => !course.legacyIds?.includes(id) || defaults.has(id))) fail('旧课默认迁移目标缺失或重复')
    else course.legacyDefaultIds.forEach(id => defaults.add(id))
    if (!Array.isArray(course.legacyHeadings) || course.legacyHeadings.some(heading => typeof heading !== 'string')) fail('旧标题映射无效')
    if (course.planId) {
      const plan = plans.get(course.planId)
      if (!plan || plan.tag !== course.tag || plan.series !== course.series) fail('篇章规划号与大类、系列不一致')
    } else if (!curriculum.includes(`\`${course.slug}\``)) fail('导读或细分篇未在唯一规划文档登记')
    if (typeof course.file !== 'string' || !/^\/data\/system-courses\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(course.file)) {
      fail('正文路径无效，必须为大类/篇章.md，不设置系列子目录')
      continue
    }
    const relative = course.file.slice('/data/system-courses/'.length)
    if (relative.split('/')[0] !== folderNames[categories.indexOf(course.tag)]) fail('正文目录与分类不一致')
    const absolute = path.resolve(courseRoot, relative)
    if (!absolute.startsWith(courseRoot + path.sep) || !fs.existsSync(absolute)) {
      fail('正文不存在或路径越界')
      continue
    }
    if (files.has(absolute)) fail('正文被重复注册')
    files.add(absolute)
    const markdown = fs.readFileSync(absolute, 'utf8')
    validateSystemCourseSemanticTags(markdown).forEach(fail)
    validateSystemCourseVisuals(markdown).forEach(fail)
    if (markdown.match(/^# (.+)$/m)?.[1] !== course.title) fail('一级标题与清单不一致')
    for (const field of ['中心问题', '适用背景', '阅读材料', '篇章边界']) {
      if (!markdown.includes(`**${field}**`)) fail(`缺少${field}`)
    }
    const chapters = [...markdown.matchAll(/^## (.+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)]
    if (chapters.filter(match => !/^(?:\d+\.\s*)?(?:参考|读音查证与继续阅读|查证词形与用法|阅读路径与规则查证|体裁查证与相邻篇章)/.test(match[1]) && match[2].trim().length >= 100).length < 6) fail('不足六个实质章节')
    if (course.tag === '大学' && ['本科', '研究生', '博士'].some(level => !markdown.includes(level))) fail('缺少大学三个材料阅读层次')
    if (/^## .*?(?:习题|练习|答案)/m.test(markdown)) fail('系统讲义不附练习和答案')
    if (/<lexi-(?:irregular|variant|sentence)\b/.test(markdown)) fail('使用已迁移的旧标签')
    for (const link of markdown.matchAll(/\]\(#course=([^)]+)\)/g)) {
      if (!catalog.some(target => target.slug === link[1])) fail(`跨篇链接目标不存在：${link[1]}`)
    }
  }
  for (let id = 1; id <= 39; id++) {
    if (!legacy.has(id)) errors.push(`旧课 ${id} 没有归属`)
    if (!defaults.has(id)) errors.push(`旧课 ${id} 没有唯一默认迁移目标`)
  }
  function checkFiles(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) checkFiles(absolute)
      else if (entry.name.endsWith('.md') && !entry.name.startsWith('_') && !files.has(absolute)) errors.push(`未注册正文：${path.relative(courseRoot, absolute)}`)
    }
  }
  checkFiles(courseRoot)
  return { errors, catalog }
}

export function validateSystemCourseVisualAssets(projectRoot = path.resolve('.')) {
  const errors = []
  for (const asset of new Set(Object.values(COURSE_VISUAL_ASSETS).flat())) {
    const file = path.resolve(projectRoot, 'public/data/course-visuals', `${asset}.svg`)
    if (!fs.existsSync(file)) { errors.push(`图示 SVG 不存在：${asset}.svg`); continue }
    const svg = fs.readFileSync(file, 'utf8')
    const size = COURSE_SVG_SIZES[asset]
    if (!size || !svg.includes(`viewBox="0 0 ${size.join(' ')}"`) || !svg.includes('xmlns="http://www.w3.org/2000/svg"')
      || /\{\{|\bv-(?:if|for|bind)\b|\s:[\w-]+=/.test(svg)) errors.push(`图示必须为独立 SVG 且尺寸与登记一致：${asset}.svg`)
  }
  return errors
}

export function validateSystemCourseVisuals(markdown) {
  const errors = []
  marked.walkTokens(marked.lexer(markdown), token => {
    if (token.type !== 'code' || token.lang !== 'course-visual') return
    if (!COURSE_VISUAL_PRESETS.includes(token.text.trim())) errors.push('course-visual 图示预设未知或包含多余内容')
    const opening = token.raw.match(/^\s*(`{3,}|~{3,})course-visual\s*\n/)
    const ending = token.raw.trimEnd().split(/\r?\n/).at(-1)?.trim()
    if (!opening || !ending || !new RegExp(`^${opening[1][0]}{${opening[1].length},}$`).test(ending)) errors.push('course-visual 图示代码块未闭合')
  })
  return errors
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = validateSystemCourses()
    if (result.errors.length) {
      console.error(result.errors.join('\n'))
      process.exitCode = 1
    } else console.log(`系统课程校验通过：${result.catalog.length} 篇，${categories.length} 大类，旧课迁移目标完整`)
  } catch (error) {
    console.error(`系统课程校验失败：${error.message}`)
    process.exitCode = 1
  }
}
