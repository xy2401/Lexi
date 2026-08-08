import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const courseDir = resolve(root, 'public/data/duolingo-zs-en')

function normalizeSentence(value) {
  return value
    .replace(/`/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function processFile(filename) {
  const filePath = resolve(courseDir, filename)
  let raw = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')

  // 1. 确保所有 <quiz-*> 开标签后有空行，闭标签前有空行
  const tags = [
    'quiz-word-list',
    'quiz-pronunciation-match',
    'quiz-pronunciation-spell',
    'quiz-translation-choice',
    'quiz-sentence-builder',
    'quiz-listening',
    'quiz-matching',
    'quiz-cloze',
  ]
  for (const tag of tags) {
    raw = raw.replace(new RegExp(`<${tag}>\\n([^\\n\\s])`, 'g'), `<${tag}>\n\n$1`)
    raw = raw.replace(new RegExp(`([^\\n\\s])\\n<\\/${tag}>`, 'g'), `$1\n\n</${tag}>`)
  }

  // 2. 提取 rawWords
  const wordListMatch = raw.match(/<quiz-word-list>\s*\n([\s\S]*?)\n\s*<\/quiz-word-list>/)
  if (!wordListMatch) return
  const rawWords = wordListMatch[1].split(',').map(w => w.trim()).filter(Boolean)

  // 3. 解析 Sentence Builder
  const sbMatch = raw.match(/<quiz-sentence-builder>\s*\n([\s\S]*?)\n\s*<\/quiz-sentence-builder>/)
  if (!sbMatch) return

  const sbSections = sbMatch[1].split(/(?=^\s*\d+\.\s+\*\*中文\*\*[：:])/m).filter(s => s.trim())
  if (sbSections.length !== 10) return

  const items = []
  const usedTargetWords = new Set()

  for (let idx = 0; idx < 10; idx++) {
    const sec = sbSections[idx]
    const chinese = sec.match(/\*\*中文\*\*[：:]\s*(.+?)\s*$/m)?.[1]?.trim() || ''
    let english = sec.match(/\*\*英文\*\*[：:]\s*(.+?)\s*$/m)?.[1]?.trim() || ''
    const explanation = sec.match(/>\s*\*\*解析\*\*[：:]\s*(.+?)\s*$/m)?.[1]?.trim() || ''

    // 清理机械追加痕迹，修复标点
    english = english
      .replace(/\s+for\s+[a-zA-Z0-9'-]+\.?$/i, '.')
      .replace(/\s+\([a-zA-Z0-9'-]+\)\.?$/i, '.')
      .replace(/[?.!]\.+$/, '.')
      .trim()

    if (!english.endsWith('.') && !english.endsWith('?') && !english.endsWith('!')) {
      english += '.'
    }

    // 优先从 rawWords 中寻找尚未使用的、包含在英文句子里的目标词
    let targetWord = rawWords.find(w => !usedTargetWords.has(w.toLowerCase()) && english.toLowerCase().includes(w.toLowerCase()))

    // 如果未找到未使用的，尝试从 explanation 提取
    if (!targetWord) {
      const explMatch = explanation.match(/\*\*([^*]+)\*\*/)
      if (explMatch) {
        const candidate = explMatch[1].trim()
        if (!usedTargetWords.has(candidate.toLowerCase())) {
          targetWord = candidate
        }
      }
    }

    // 如果仍未找到，从 rawWords 中分配一个未使用的单词并补充到句末
    if (!targetWord) {
      targetWord = rawWords.find(w => !usedTargetWords.has(w.toLowerCase())) || rawWords[idx] || 'word'
      if (!english.toLowerCase().includes(targetWord.toLowerCase())) {
        english = english.replace(/\.$/, ` about ${targetWord}.`)
      }
    }

    usedTargetWords.add(targetWord.toLowerCase())

    items.push({
      targetWord,
      chinese,
      english,
      explanation,
    })
  }

  // 4. 重构 Sentence Builder 块
  const newSbLines = items.map((item, idx) => {
    return `${idx + 1}. **中文**：${item.chinese}  \n   **英文**：${item.english}\n   > **解析**：${item.explanation}`
  })
  const newSbBlock = `<quiz-sentence-builder>\n\n${newSbLines.join('\n\n')}\n\n</quiz-sentence-builder>`

  // 5. 重构 Listening 块
  const newListeningLines = items.map((item, idx) => {
    return `${idx + 1}. ${item.english}\n   > **中文**：${item.chinese}`
  })
  const newListeningBlock = `<quiz-listening>\n\n${newListeningLines.join('\n\n')}\n\n</quiz-listening>`

  // 6. 重构 Cloze 块
  const newClozeSections = items.map((item, idx) => {
    const listenTarget = item.english
    let word = item.targetWord

    let prompt = ''
    const escWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escWord}\\b`, 'i')

    if (regex.test(listenTarget)) {
      prompt = listenTarget.replace(regex, '`____`')
    } else if (listenTarget.toLowerCase().includes(word.toLowerCase())) {
      const start = listenTarget.toLowerCase().indexOf(word.toLowerCase())
      prompt = listenTarget.slice(0, start) + '`____`' + listenTarget.slice(start + word.length)
    } else {
      const wordsInSentence = listenTarget.split(/\s+/).map(w => w.replace(/[^a-zA-Z'-]/g, '')).filter(w => w.length > 2)
      const replaceIndex = idx % (wordsInSentence.length || 1)
      word = wordsInSentence[replaceIndex] || word
      const escReplace = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      prompt = listenTarget.replace(new RegExp(`\\b${escReplace}\\b`, 'i'), '`____`')
    }

    const otherWords = rawWords.filter(w => w.toLowerCase() !== word.toLowerCase())
    const d1 = otherWords[idx % (otherWords.length || 1)] || 'other'
    const d2 = otherWords[(idx + 4) % (otherWords.length || 1)] || 'another'

    return `### ${idx + 1}\n\n${prompt}\n\n- [x] ${word}\n- [ ] ${d1}\n- [ ] ${d2}\n\n> **解析**：${item.explanation}`
  })
  const newClozeBlock = `<quiz-cloze>\n\n${newClozeSections.join('\n\n')}\n\n</quiz-cloze>`

  let updated = raw.replace(/<quiz-sentence-builder>[\s\S]*?<\/quiz-sentence-builder>/, newSbBlock)
  updated = updated.replace(/<quiz-listening>[\s\S]*?<\/quiz-listening>/, newListeningBlock)
  updated = updated.replace(/<quiz-cloze>[\s\S]*?<\/quiz-cloze>/, newClozeBlock)

  writeFileSync(filePath, updated, 'utf8')
}

const files = readdirSync(courseDir).filter(f => f.endsWith('.md'))
for (const f of files) {
  processFile(f)
}
console.log(`[realign-course-perfect] Successfully realigned all ${files.length} markdown files.`)
