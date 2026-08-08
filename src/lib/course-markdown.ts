export type QuizType =
  | 'pronunciation-match'
  | 'pronunciation-spell'
  | 'translation-choice'
  | 'sentence-builder'
  | 'listening'
  | 'matching'
  | 'cloze'

export interface CourseUnitIndex {
  id: number
  name: string
  desc: string
  words: string[]
  file: string
}

export interface CourseDiagnostic {
  file: string
  line: number
  message: string
}

interface QuizBase {
  id: string
  type: QuizType
  title: string
  description: string
  itemCount: number
}

export interface WordPoolQuiz extends QuizBase {
  type: 'pronunciation-match' | 'pronunciation-spell' | 'translation-choice'
}

export interface SentenceBuilderItem {
  chinese: string
  english: string
  explanation: string
}

export interface SentenceBuilderQuiz extends QuizBase {
  type: 'sentence-builder'
  items: SentenceBuilderItem[]
}

export interface ListeningItem {
  english: string
  chinese: string
}

export interface ListeningQuiz extends QuizBase {
  type: 'listening'
  items: ListeningItem[]
}

export interface MatchingPair {
  english: string
  chinese: string
}

export interface MatchingQuiz extends QuizBase {
  type: 'matching'
  source: 'explicit' | 'word-list'
  pairs: MatchingPair[]
}

export interface ClozeOption {
  text: string
  correct: boolean
}

export interface ClozeItem {
  prompt: string
  options: ClozeOption[]
  explanation: string
}

export interface ClozeQuiz extends QuizBase {
  type: 'cloze'
  items: ClozeItem[]
}

export type QuizDefinition =
  | WordPoolQuiz
  | SentenceBuilderQuiz
  | ListeningQuiz
  | MatchingQuiz
  | ClozeQuiz

export interface CourseDocument {
  words: string[]
  guideMarkdown: string
  quizzes: QuizDefinition[]
  diagnostics: string[]
}

const REQUIRED_QUIZ_TYPES: QuizType[] = [
  'pronunciation-match',
  'pronunciation-spell',
  'translation-choice',
  'sentence-builder',
  'listening',
  'matching',
  'cloze',
]

function normalizeSentence(value: string): string {
  return value.replace(/`/g, '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()
}

export function validateCourseDocument(document: CourseDocument, file = 'course.md'): CourseDiagnostic[] {
  const errors: CourseDiagnostic[] = []
  const add = (message: string) => errors.push({ file, line: 1, message })
  if (!document.words.length) add('共享词表不能为空')
  for (const type of REQUIRED_QUIZ_TYPES) {
    const count = document.quizzes.filter(quiz => quiz.type === type).length
    if (count !== 1) add(`${type} 必须有且只有一个，当前 ${count}`)
  }
  if (document.quizzes.length !== 7) add(`每个单元必须正好有 7 个关卡，当前 ${document.quizzes.length}`)

  const listening = document.quizzes.find((quiz): quiz is ListeningQuiz => quiz.type === 'listening')
  if (listening && (listening.items.length !== 10 || listening.items.some(item => !item.chinese))) {
    add('Listening 必须正好包含 10 道带中文的题目')
  }
  const sentences = new Set((listening?.items || []).map(item => normalizeSentence(item.english)))
  const builder = document.quizzes.find((quiz): quiz is SentenceBuilderQuiz => quiz.type === 'sentence-builder')
  if (builder && (builder.items.length !== 10 || builder.items.some(item => !sentences.has(normalizeSentence(item.english))))) {
    add('Sentence Builder 必须包含 10 题，且每题复用 Listening 句子')
  }

  const cloze = document.quizzes.find((quiz): quiz is ClozeQuiz => quiz.type === 'cloze')
  if (cloze) {
    if (cloze.items.length !== 10) add('Cloze 必须正好包含 10 题')
    for (const item of cloze.items) {
      const correct = item.options.find(option => option.correct)?.text || ''
      if ((item.prompt.match(/____/g) || []).length !== 1 || item.options.length !== 3 || item.options.filter(option => option.correct).length !== 1) {
        add('Cloze 每题必须有一个空位、三个选项和一个正确项')
      } else if (!sentences.has(normalizeSentence(item.prompt.replace('____', correct)))) {
        add('Cloze 补全后必须匹配 Listening 句子')
      }
    }
  }
  const matching = document.quizzes.find((quiz): quiz is MatchingQuiz => quiz.type === 'matching')
  if (matching && matching.itemCount < 10) add('Matching 至少需要 10 组配对')
  return errors
}

interface RawQuizBlock {
  name: string
  body: string
  line: number
}

const QUIZ_TITLES: Record<QuizType, [string, string]> = {
  'pronunciation-match': ['发音配对', '听发音，从词池中选出正确单词'],
  'pronunciation-spell': ['发音填写', '听发音，拼写出正确单词'],
  'translation-choice': ['中文选词', '根据中文释义选择英文单词'],
  'sentence-builder': ['连词成句', '排列词块，还原完整英文句子'],
  listening: ['听音辨句', '听完整句子并键盘输入'],
  matching: ['词义消消乐', '匹配发音、英文与中文释义'],
  cloze: ['选词填空', '选择正确选项补全句子'],
}

function cleanInlineMarkdown(value: string): string {
  return value
    .trim()
    .replace(/^`|`$/g, '')
    .replace(/\*\*/g, '')
}

function extractExplanation(body: string): string {
  const match = body.match(/^\s*>\s*\*\*解析\*\*[：:]\s*(.+)$/m)
  return match?.[1]?.trim() || ''
}

function makeBase(type: QuizType, index: number, itemCount: number): QuizBase {
  const [title, description] = QUIZ_TITLES[type]
  return { id: `${type}-${index}`, type, title, description, itemCount }
}

function parseBlocks(source: string, filename: string) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: RawQuizBlock[] = []
  const output = [...lines]
  const diagnostics: string[] = []
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
    while (closeIndex < lines.length && lines[closeIndex].trim() !== `</${name}>`) {
      closeIndex++
    }
    if (closeIndex >= lines.length) {
      diagnostics.push(`${filename}:${index + 1} 缺少 </${name}>`)
      break
    }
    if (lines[index + 1]?.trim() !== '') {
      diagnostics.push(`${filename}:${index + 1} 开标签后必须保留空行`)
    }
    if (lines[closeIndex - 1]?.trim() !== '') {
      diagnostics.push(`${filename}:${closeIndex + 1} 闭标签前必须保留空行`)
    }

    blocks.push({
      name,
      body: lines.slice(index + 1, closeIndex).join('\n').trim(),
      line: index + 1,
    })
    for (let cursor = index; cursor <= closeIndex; cursor++) output[cursor] = ''
    index = closeIndex
  }

  return { blocks, stripped: output.join('\n'), diagnostics }
}

function parseListening(body: string): ListeningItem[] {
  const lines = body.split('\n')
  const items: ListeningItem[] = []
  for (let index = 0; index < lines.length; index++) {
    const question = lines[index].match(/^\s*\d+\.\s+(.+?)\s*$/)
    if (!question) continue
    let chinese = ''
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      if (/^\s*\d+\.\s+/.test(lines[cursor])) break
      const translation = lines[cursor].match(/^\s*>\s*\*\*中文\*\*[：:]\s*(.+?)\s*$/)
      if (translation) {
        chinese = translation[1]
        break
      }
    }
    items.push({ english: question[1].trim(), chinese })
  }
  return items
}

function parseSentenceBuilder(body: string): SentenceBuilderItem[] {
  const sections = body.split(/(?=^\s*\d+\.\s+\*\*中文\*\*[：:])/m).filter(section => section.trim())
  const parseOne = (section: string): SentenceBuilderItem => ({
    chinese: section.match(/\*\*中文\*\*[：:]\s*(.+?)\s*$/m)?.[1]?.trim() || '',
    english: section.match(/\*\*英文\*\*[：:]\s*(.+?)\s*$/m)?.[1]?.trim() || '',
    explanation: extractExplanation(section),
  })
  const numbered = sections.map(parseOne).filter(item => item.chinese || item.english)
  if (numbered.length) return numbered
  return [parseOne(body)].filter(item => item.chinese || item.english)
}

function parseClozeItem(body: string): ClozeItem {
  const lines = body.split('\n')
  const promptLine = lines.find(line => {
    const value = line.trim()
    return value && !value.startsWith('- [') && !value.startsWith('>') && !value.startsWith('###')
  }) || ''
  const options = lines.flatMap(line => {
    const match = line.match(/^\s*- \[([xX ])\]\s+(.+?)\s*$/)
    return match ? [{ text: match[2], correct: match[1].toLowerCase() === 'x' }] : []
  })
  return {
    prompt: promptLine.trim().replace(/`____`/g, '____'),
    options,
    explanation: extractExplanation(body),
  }
}

function parseCloze(body: string): ClozeItem[] {
  const sections = body.split(/(?=^###\s+\d+\s*$)/m).filter(section => section.trim())
  return sections.map(parseClozeItem).filter(item => item.prompt || item.options.length)
}

function parseMatching(body: string): MatchingPair[] {
  if (!body.trim()) return []
  return body.split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('|') && line.endsWith('|'))
    .map(line => line.slice(1, -1).split('|').map(cell => cleanInlineMarkdown(cell)))
    .filter((cells, index) => index > 1 && cells.length >= 2)
    .map(cells => ({ english: cells[0], chinese: cells[1] }))
    .filter(pair => pair.english && pair.chinese)
}

function guideOnly(stripped: string): string {
  const start = stripped.search(/^## 单元讲解\s*$/m)
  if (start < 0) return stripped.trim()
  const guide = stripped.slice(start)
  const practice = guide.search(/^## 练习\s*$/m)
  return (practice >= 0 ? guide.slice(0, practice) : guide).trim()
}

export function parseCourseMarkdown(source: string, filename = 'course.md'): CourseDocument {
  const { blocks, stripped, diagnostics } = parseBlocks(source, filename)
  const wordBlocks = blocks.filter(block => block.name === 'quiz-word-list')
  if (wordBlocks.length !== 1) {
    diagnostics.push(`${filename}: 必须包含且只能包含一个 <quiz-word-list>`)
  }

  const words = (wordBlocks[0]?.body || '')
    .split(',')
    .map(word => word.trim())
    .filter(Boolean)
  const seenWords = new Set<string>()
  for (const word of words) {
    const normalized = word.toLowerCase()
    if (seenWords.has(normalized)) diagnostics.push(`${filename}: 词表重复项 ${word}`)
    seenWords.add(normalized)
  }

  const quizzes: QuizDefinition[] = []
  const counters = new Map<QuizType, number>()
  const nextIndex = (type: QuizType) => {
    const index = (counters.get(type) || 0) + 1
    counters.set(type, index)
    return index
  }

  for (const block of blocks) {
    if (block.name === 'quiz-word-list') continue
    const type = block.name.slice('quiz-'.length) as QuizType
    if (!(type in QUIZ_TITLES)) {
      diagnostics.push(`${filename}:${block.line} 未知练习标签 <${block.name}>`)
      continue
    }
    const index = nextIndex(type)

    if (type === 'pronunciation-match' || type === 'pronunciation-spell' || type === 'translation-choice') {
      if (block.body) diagnostics.push(`${filename}:${block.line} <${block.name}> 必须为空`)
      quizzes.push({ ...makeBase(type, index, words.length), type })
      continue
    }

    if (type === 'sentence-builder') {
      const items = parseSentenceBuilder(block.body)
      if (!items.length || items.some(item => !item.chinese || !item.english)) diagnostics.push(`${filename}:${block.line} 连词成句每题需要中文和英文`)
      quizzes.push({
        ...makeBase(type, index, items.length),
        type,
        items,
      })
      continue
    }

    if (type === 'listening') {
      const items = parseListening(block.body)
      if (items.length !== 10 || items.some(item => !item.chinese)) {
        diagnostics.push(`${filename}:${block.line} 听音辨句需要正好 10 道含中文释义的题目`)
      }
      quizzes.push({ ...makeBase(type, index, items.length), type, items })
      continue
    }

    if (type === 'matching') {
      const pairs = parseMatching(block.body)
      if (block.body && pairs.length < 10) diagnostics.push(`${filename}:${block.line} Matching 至少需要 10 组配对`)
      quizzes.push({
        ...makeBase(type, index, pairs.length || Math.min(10, words.length)),
        type,
        source: pairs.length ? 'explicit' : 'word-list',
        pairs,
      })
      continue
    }

    const items = parseCloze(block.body)
    if (!items.length || items.some(item => (item.prompt.match(/____/g) || []).length !== 1 || item.options.length !== 3 || item.options.filter(option => option.correct).length !== 1)) {
      diagnostics.push(`${filename}:${block.line} Cloze 每题需要一个空位、三个选项和一个正确项`)
    }
    quizzes.push({
      ...makeBase(type, index, items.length),
      type,
      items,
    })
  }

  const document: CourseDocument = {
    words,
    guideMarkdown: guideOnly(stripped),
    quizzes,
    diagnostics,
  }
  diagnostics.push(...validateCourseDocument(document, filename).map(error => `${error.file}:${error.line} ${error.message}`))
  return document
}
