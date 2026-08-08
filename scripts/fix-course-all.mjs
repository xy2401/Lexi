import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const courseDir = resolve(root, 'public/data/duolingo-zs-en')

function normalizeSentence(value) {
  return value.replace(/`/g, '').replace(/['']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()
}

function cleanSentence(english) {
  return english
    .replace(/\s*\([a-zA-Z0-9''_ -]+\)\.?$/g, '')
    .replace(/\?\.$/, '?')
    .replace(/!\.$/, '!')
    .trim()
    .replace(/([a-zA-Z0-9'"])$/, '$1.')
}

function processFile(filename) {
  const filePath = resolve(courseDir, filename)
  let raw = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')

  const wordListMatch = raw.match(/<quiz-word-list>\s*\n([\s\S]*?)\n\s*<\/quiz-word-list>/)
  if (!wordListMatch) return
  const rawWords = wordListMatch[1].split(',').map(w => w.trim()).filter(Boolean)

  const sbMatch = raw.match(/<quiz-sentence-builder>\s*\n([\s\S]*?)\n\s*<\/quiz-sentence-builder>/)
  if (!sbMatch) return

  const sbSections = sbMatch[1].split(/(?=^\s*\d+\.\s+\*\*中文\*\*[：:])/m).filter(s => s.trim())
  if (sbSections.length !== 10) return

  const usedTargetWords = new Set()
  const items = []

  for (let idx = 0; idx < 10; idx++) {
    const sec = sbSections[idx]
    const chinese = sec.match(/\*\*中文\*\*[：:]\s*(.+?)\s*$/m)?.[1]?.trim() || ''
    let english = sec.match(/\*\*英文\*\*[：:]\s*(.+?)\s*$/m)?.[1]?.trim() || ''
    const explanation = sec.match(/>\s*\*\*解析\*\*[：:]\s*(.+?)\s*$/m)?.[1]?.trim() || ''

    // 清理所有形式的追加尾缀
    english = cleanSentence(english)

    // 查找目标词：从 rawWords 中找未使用的、在英文句中出现的词
    let targetWord = rawWords.find(w =>
      !usedTargetWords.has(w.toLowerCase()) &&
      english.toLowerCase().includes(w.toLowerCase())
    )

    if (!targetWord) {
      // 从 explanation 粗提
      const em = explanation.match(/\*\*([^*]+)\*\*/)
      if (em && !usedTargetWords.has(em[1].trim().toLowerCase())) {
        targetWord = em[1].trim()
      }
    }

    if (!targetWord) {
      targetWord = rawWords.find(w => !usedTargetWords.has(w.toLowerCase())) || rawWords[idx] || 'word'
      if (!english.toLowerCase().includes(targetWord.toLowerCase())) {
        english = english.replace(/\.$/, ` ${targetWord}.`)
      }
    }

    usedTargetWords.add(targetWord.toLowerCase())
    items.push({ targetWord, chinese, english, explanation })
  }

  // Sentence Builder
  const newSbLines = items.map((item, idx) =>
    `${idx + 1}. **中文**：${item.chinese}  \n   **英文**：${item.english}\n   > **解析**：${item.explanation}`
  )
  const newSbBlock = `<quiz-sentence-builder>\n\n${newSbLines.join('\n\n')}\n\n</quiz-sentence-builder>`

  // Listening
  const newListeningLines = items.map((item, idx) =>
    `${idx + 1}. ${item.english}\n   > **中文**：${item.chinese}`
  )
  const newListeningBlock = `<quiz-listening>\n\n${newListeningLines.join('\n\n')}\n\n</quiz-listening>`

  // Cloze
  const newClozeSections = items.map((item, idx) => {
    const listenTarget = item.english
    const word = item.targetWord
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
      const pick = wordsInSentence[idx % (wordsInSentence.length || 1)] || word
      prompt = listenTarget.replace(new RegExp(`\\b${pick.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '`____`')
    }

    const others = rawWords.filter(w => w.toLowerCase() !== word.toLowerCase())
    const d1 = others[idx % (others.length || 1)] || 'other'
    const d2 = others[(idx + 4) % (others.length || 1)] || 'another'

    return `### ${idx + 1}\n\n${prompt}\n\n- [x] ${word}\n- [ ] ${d1}\n- [ ] ${d2}\n\n> **解析**：${item.explanation}`
  })
  const newClozeBlock = `<quiz-cloze>\n\n${newClozeSections.join('\n\n')}\n\n</quiz-cloze>`

  let updated = raw
    .replace(/<quiz-sentence-builder>[\s\S]*?<\/quiz-sentence-builder>/, newSbBlock)
    .replace(/<quiz-listening>[\s\S]*?<\/quiz-listening>/, newListeningBlock)
    .replace(/<quiz-cloze>[\s\S]*?<\/quiz-cloze>/, newClozeBlock)

  writeFileSync(filePath, updated, 'utf8')
}

const files = readdirSync(courseDir).filter(f => f.endsWith('.md'))
for (const f of files) processFile(f)
console.log(`[fix-all] Processed ${files.length} files.`)
