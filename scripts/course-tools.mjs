import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const courseDir = resolve(root, 'public/data/duolingo-zs-en')
const indexPath = resolve(root, 'public/data/duolingo-zs-en.json')

const REQUIRED_EXERCISES = [
  'quiz-pronunciation-match',
  'quiz-pronunciation-spell',
  'quiz-translation-choice',
  'quiz-sentence-builder',
  'quiz-listening',
  'quiz-matching',
  'quiz-cloze',
]
const KNOWN_TAGS = new Set(['quiz-word-list', ...REQUIRED_EXERCISES])

function normalizeSentence(value) {
  return value
    .replace(/`/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function parseBlocks(source, filename) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  const errors = []
  let inFence = false

  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trim()
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const open = trimmed.match(/^<(quiz-[a-z0-9-]+)>$/)
    if (!open) continue

    const name = open[1]
    let closeIndex = index + 1
    while (closeIndex < lines.length && lines[closeIndex].trim() !== `</${name}>`) closeIndex++
    if (closeIndex >= lines.length) {
      errors.push(`${filename}:${index + 1} 缺少 </${name}>`)
      break
    }
    if (lines[index + 1]?.trim() !== '') errors.push(`${filename}:${index + 1} 开标签后必须有空行`)
    if (lines[closeIndex - 1]?.trim() !== '') errors.push(`${filename}:${closeIndex + 1} 闭标签前必须有空行`)
    blocks.push({ name, body: lines.slice(index + 1, closeIndex).join('\n').trim(), line: index + 1 })
    index = closeIndex
  }
  return { blocks, errors }
}

function parseListening(body) {
  const lines = body.split('\n')
  const items = []
  for (let index = 0; index < lines.length; index++) {
    const english = lines[index].match(/^\s*\d+\.\s+(.+?)\s*$/)?.[1]
    if (!english) continue
    let chinese = ''
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      if (/^\s*\d+\.\s+/.test(lines[cursor])) break
      const match = lines[cursor].match(/^\s*>\s*\*\*中文\*\*[：:]\s*(.+?)\s*$/)
      if (match) {
        chinese = match[1]
        break
      }
    }
    items.push({ english: english.trim(), chinese: chinese.trim() })
  }
  return items
}

function parseSentenceBuilder(body) {
  const sections = body.split(/(?=^\s*\d+\.\s+\*\*中文\*\*[：:])/m).filter(section => section.trim())
  const parseOne = section => ({
    chinese: section.match(/\*\*中文\*\*[：:]\s*(.+?)\s*$/m)?.[1]?.trim() || '',
    english: section.match(/\*\*英文\*\*[：:]\s*(.+?)\s*$/m)?.[1]?.trim() || '',
  })
  const numbered = sections.map(parseOne).filter(item => item.chinese || item.english)
  return numbered.length ? numbered : [parseOne(body)].filter(item => item.chinese || item.english)
}

function parseClozeItem(body) {
  const lines = body.split('\n')
  const prompt = lines.find(line => {
    const value = line.trim()
    return value && !value.startsWith('- [') && !value.startsWith('>') && !value.startsWith('###')
  })?.trim() || ''
  const options = lines.flatMap(line => {
    const match = line.match(/^\s*- \[([xX ])\]\s+(.+?)\s*$/)
    return match ? [{ text: match[2].trim(), correct: match[1].toLowerCase() === 'x' }] : []
  })
  return { prompt, options }
}

function parseCloze(body) {
  return body.split(/(?=^###\s+\d+\s*$)/m)
    .filter(section => section.trim())
    .map(parseClozeItem)
    .filter(item => item.prompt || item.options.length)
}

function parseMatching(body) {
  return body.split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('|') && line.endsWith('|'))
    .slice(2)
    .map(line => line.slice(1, -1).split('|').map(cell => cell.trim()))
    .filter(cells => cells.length >= 2 && cells[0] && cells[1])
}

function exactCount(blocks, name) {
  return blocks.filter(block => block.name === name).length
}

function validateUnit(filename, source) {
  const errors = []
  const title = source.match(/^# Unit (\d{3}): (.+)$/m)
  const desc = source.match(/^> (.+)$/m)
  if (!title) errors.push(`${filename}:1 缺少标准 Unit 标题`)
  if (!desc) errors.push(`${filename}: 缺少单元简介引用`)

  const fileMatch = filename.match(/^(\d{3})-(.+)\.md$/)
  const filenameSafeTitle = title?.[2].replace(/[<>:"/\\|?*]/g, '').trim()
  if (title && fileMatch && (title[1] !== fileMatch[1] || filenameSafeTitle !== fileMatch[2])) {
    errors.push(`${filename}: 文件名与 Unit 标题不一致`)
  }

  const { blocks, errors: blockErrors } = parseBlocks(source, filename)
  errors.push(...blockErrors)
  for (const block of blocks) {
    if (!KNOWN_TAGS.has(block.name)) errors.push(`${filename}:${block.line} 未知标签 <${block.name}>`)
  }
  if (exactCount(blocks, 'quiz-word-list') !== 1) errors.push(`${filename}: 必须有且只有一个 quiz-word-list`)
  for (const name of REQUIRED_EXERCISES) {
    if (exactCount(blocks, name) !== 1) errors.push(`${filename}: 必须有且只有一个 ${name}`)
  }

  const wordBody = blocks.find(block => block.name === 'quiz-word-list')?.body || ''
  const words = wordBody.split(',').map(word => word.trim()).filter(Boolean)
  const normalizedWords = words.map(word => word.toLowerCase())
  if (!words.length) errors.push(`${filename}: 词表不能为空`)
  if (new Set(normalizedWords).size !== words.length) errors.push(`${filename}: 词表含重复项`)

  for (const name of ['quiz-pronunciation-match', 'quiz-pronunciation-spell', 'quiz-translation-choice']) {
    const block = blocks.find(item => item.name === name)
    if (block?.body) errors.push(`${filename}:${block.line} ${name} 必须为空`)
  }

  const matchingBlock = blocks.find(block => block.name === 'quiz-matching')
  const matchingPairs = parseMatching(matchingBlock?.body || '')
  if (matchingBlock?.body && matchingPairs.length < 20) {
    errors.push(`${filename}:${matchingBlock.line} 显式 Matching 至少需要 20 组配对`)
  }

  const listeningBlock = blocks.find(block => block.name === 'quiz-listening')
  const listening = parseListening(listeningBlock?.body || '')
  if (listening.length !== 20) errors.push(`${filename}:${listeningBlock?.line || 1} Listening 必须正好 20 题`)
  if (listening.some(item => !item.chinese)) errors.push(`${filename}:${listeningBlock?.line || 1} Listening 每题必须有中文`)
  if (new Set(listening.map(item => normalizeSentence(item.english))).size !== listening.length) {
    errors.push(`${filename}:${listeningBlock?.line || 1} Listening 英文句子不能重复`)
  }

  const builder = blocks.find(block => block.name === 'quiz-sentence-builder')
  const builderItems = parseSentenceBuilder(builder?.body || '')
  if (builderItems.length !== 20 || builderItems.some(item => !item.english || !item.chinese)) {
    errors.push(`${filename}:${builder?.line || 1} Sentence Builder 必须正好 20 题且每题有中英文`)
  }
  if (new Set(builderItems.map(item => normalizeSentence(item.english))).size !== builderItems.length) {
    errors.push(`${filename}:${builder?.line || 1} Sentence Builder 英文句子不能重复`)
  }

  const cloze = blocks.find(block => block.name === 'quiz-cloze')
  const clozeItems = parseCloze(cloze?.body || '')
  if (clozeItems.length !== 20) errors.push(`${filename}:${cloze?.line || 1} Cloze 必须正好 20 题`)
  const clozeCompleted = []
  for (const item of clozeItems) {
    if ((item.prompt.match(/____/g) || []).length !== 1) errors.push(`${filename}:${cloze?.line || 1} Cloze 每题必须正好一个空位`)
    if (item.options.length !== 3 || item.options.filter(option => option.correct).length !== 1) {
      errors.push(`${filename}:${cloze?.line || 1} Cloze 每题必须三个选项且只有一个正确项`)
    }
    const correct = item.options.find(option => option.correct)?.text || ''
    if (correct) clozeCompleted.push(normalizeSentence(item.prompt.replace(/`?____`?/, correct)))
  }
  if (new Set(clozeCompleted).size !== clozeCompleted.length) {
    errors.push(`${filename}:${cloze?.line || 1} Cloze 补全后的句子不能重复`)
  }

  const coveredWords = new Set()
  for (const item of listening) {
    const sentence = normalizeSentence(item.english)
    for (const word of normalizedWords) {
      if (sentence.includes(normalizeSentence(word))) coveredWords.add(word)
    }
  }
  if (coveredWords.size < Math.min(10, words.length)) errors.push(`${filename}: Listening 至少覆盖 10 个不同词条`)

  return {
    errors,
    unit: title && desc && fileMatch ? {
      id: Number(title[1]),
      name: title[2],
      desc: desc[1].trim(),
      words,
      file: filename,
    } : null,
    quizCount: REQUIRED_EXERCISES.length,
    listeningCount: listening.length,
  }
}

function collectCourse() {
  const files = readdirSync(courseDir)
    .filter(filename => filename.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b, 'en'))
  const errors = []
  const units = []
  let quizCount = 0
  let listeningCount = 0

  for (const filename of files) {
    const source = readFileSync(resolve(courseDir, filename), 'utf8')
    const result = validateUnit(filename, source)
    errors.push(...result.errors)
    if (result.unit) units.push(result.unit)
    quizCount += result.quizCount
    listeningCount += result.listeningCount
  }

  const totalWords = units.reduce((sum, unit) => sum + unit.words.length, 0)
  if (units.length !== 290) errors.push(`课程必须正好 290 个单元，当前 ${units.length}`)
  if (quizCount !== 2030) errors.push(`课程必须正好 2030 个关卡，当前 ${quizCount}`)
  if (listeningCount !== 5800) errors.push(`课程必须正好 5800 道听写，当前 ${listeningCount}`)
  if (totalWords !== 7611) errors.push(`课程词条总数应为 7611，当前 ${totalWords}`)
  units.forEach((unit, index) => {
    if (unit.id !== index + 1) errors.push(`${unit.file}: 单元编号应为 ${index + 1}`)
  })
  return { errors, units, quizCount, listeningCount, totalWords }
}

function main() {
  const command = process.argv[2] || 'validate'
  if (!['validate', 'build'].includes(command)) {
    throw new Error('用法: node scripts/course-tools.mjs <validate|build>')
  }

  const result = collectCourse()
  if (result.errors.length) {
    console.error(result.errors.slice(0, 100).join('\n'))
    if (result.errors.length > 100) console.error(`...另有 ${result.errors.length - 100} 个错误`)
    process.exit(1)
  }

  const generated = `${JSON.stringify(result.units, null, 2)}\n`
  if (command === 'build') {
    writeFileSync(indexPath, generated, 'utf8')
    console.log(`已生成 ${basename(indexPath)}`)
  } else {
    const current = readFileSync(indexPath, 'utf8')
    if (current !== generated) {
      console.error('课程索引已过期，请运行 npm run build:course')
      process.exit(1)
    }
  }
  console.log(`课程校验通过: ${result.units.length} 单元 / ${result.quizCount} 关 / ${result.listeningCount} 道听写 / ${result.totalWords} 词`)
}

main()
