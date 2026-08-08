import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const courseDir = resolve(root, 'public/data/duolingo-zs-en')
const shouldWrite = process.argv.includes('--write')

const LOW_VALUE_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'do', 'for', 'from', 'he', 'her',
  'him', 'his', 'i', 'in', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 'she',
  'so', 'that', 'the', 'their', 'them', 'they', 'this', 'to', 'us', 'we', 'with', 'you', 'your',
])

const CURATED = new Map([
  [2, {
    listening: [
      ['Our room is small and white.', '我们的房间又小又白。'],
      ['Their house has a red phone.', '他们的房子里有一部红色电话。'],
      ['We use our blue computer every day.', '我们每天使用蓝色电脑。'],
      ['They have a big green room.', '他们有一个绿色的大房间。'],
      ['The black phone is in our house.', '黑色电话在我们的房子里。'],
    ],
    builder: 0,
    builderNote: '形容词 small 和 white 放在名词 room 之后作表语。',
    cloze: { sentence: 3, answer: 'green', distractors: ['white', 'black'], note: '颜色形容词 green 放在名词 room 前。' },
  }],
  [116, {
    listening: [
      ['I traveled solo for the first time.', '我第一次独自旅行。'],
      ['I felt homesick after my arrival.', '到达后我感到想家。'],
      ['I went through passport control and reserved a shuttle.', '我通过护照检查并预订了接驳车。'],
      ['The hotel was nearby, just over there.', '酒店就在附近，就在那边。'],
      ['I unpacked my bag and did the laundry.', '我打开行李并洗了衣服。'],
    ],
    builder: 0,
    builderNote: 'for the first time 放在句末，说明这是第一次发生的经历。',
    cloze: { sentence: 2, answer: 'shuttle', distractors: ['fare', 'patio'], note: 'reserve a shuttle 表示“预订接驳车”。' },
  }],
  [290, {
    listening: [
      ["Way to go; you earned your master's degree!", '好样的，你获得了硕士学位！'],
      ['Your dedication and willpower are admirable.', '你的投入和意志力令人钦佩。'],
      ['You stayed focused when you felt discouraged.', '你感到气馁时仍保持专注。'],
      ['All your hard work was worth it.', '你所有的努力都是值得的。'],
      ['Wishing you success as a lifelong learner.', '祝你成为终身学习者并不断成功。'],
    ],
    builder: 0,
    builderNote: 'Way to go 用于热情地祝贺对方取得成就。',
    cloze: { sentence: 1, answer: 'admirable', distractors: ['academic', 'discouraged'], note: 'admirable 表示“令人钦佩的”。' },
  }],
])

function parseWords(source, filename) {
  const match = source.match(/(^## 单词\s*\n+)([\s\S]*?)(?=\n## |\n# Unit |$)/m)
  if (!match) throw new Error(`${filename}: 找不到“## 单词”段落`)
  const body = match[2].trim()
  if (!body || body.includes('<quiz-word-list>')) return { match, words: [] }
  return { match, words: body.split(',').map(word => word.trim()).filter(Boolean) }
}

function pickSceneWords(words) {
  const safe = words.filter(word => !word.includes('"'))
  const preferred = safe.filter(word => !LOW_VALUE_WORDS.has(word.toLowerCase()))
  const pool = preferred.length >= 5 ? preferred : safe
  if (pool.length < 5) throw new Error('词表不足 5 个可用词条')
  const indexes = [0, 0.25, 0.5, 0.75, 1].map(ratio => Math.round((pool.length - 1) * ratio))
  return indexes.map(index => pool[index])
}

function genericScene(words) {
  const [first, second, third, fourth, fifth] = pickSceneWords(words)
  return {
    listening: [
      [`Today we will practice "${first}".`, `今天我们要练习“${first}”。`],
      [`I heard "${second}" in our lesson.`, `我在课程中听到了“${second}”。`],
      [`Can you say "${third}" again?`, `你能再说一遍“${third}”吗？`],
      [`We can use "${fourth}" in this situation.`, `在这个情境中可以使用“${fourth}”。`],
      [`Now I understand "${fifth}".`, `现在我理解了“${fifth}”。`],
    ],
    builder: 0,
    builderNote: `practice 后接本单元表达 ${first}，构成课堂练习情境。`,
    cloze: { sentence: 3, answer: fourth, distractors: [second, third], note: `这里需要使用本单元表达 ${fourth}。` },
  }
}

function clozePrompt(sentence, answer) {
  const index = sentence.toLowerCase().indexOf(answer.toLowerCase())
  if (index < 0) throw new Error(`Cloze 答案“${answer}”不在句子“${sentence}”中`)
  return `${sentence.slice(0, index)}\`____\`${sentence.slice(index + answer.length)}`
}

function renderExercises(scene) {
  const builder = scene.listening[scene.builder]
  const clozeSentence = scene.listening[scene.cloze.sentence][0]
  return [
    '## 练习',
    '',
    '<quiz-pronunciation-match>',
    '',
    '</quiz-pronunciation-match>',
    '',
    '<quiz-pronunciation-spell>',
    '',
    '</quiz-pronunciation-spell>',
    '',
    '<quiz-translation-choice>',
    '',
    '</quiz-translation-choice>',
    '',
    '<quiz-sentence-builder>',
    '',
    `**中文**：${builder[1]}  `,
    `**英文**：${builder[0]}`,
    '',
    `> **解析**：${scene.builderNote}`,
    '',
    '</quiz-sentence-builder>',
    '',
    '<quiz-listening>',
    '',
    ...scene.listening.flatMap(([english, chinese], index) => [
      `${index + 1}. ${english}`,
      `   > **中文**：${chinese}`,
    ]),
    '',
    '</quiz-listening>',
    '',
    '<quiz-matching>',
    '',
    '</quiz-matching>',
    '',
    '<quiz-cloze>',
    '',
    clozePrompt(clozeSentence, scene.cloze.answer),
    '',
    `- [x] ${scene.cloze.answer}`,
    `- [ ] ${scene.cloze.distractors[0]}`,
    `- [ ] ${scene.cloze.distractors[1]}`,
    '',
    `> **解析**：${scene.cloze.note}`,
    '',
    '</quiz-cloze>',
    '',
  ].join('\n')
}

const files = readdirSync(courseDir).filter(filename => filename.endsWith('.md')).sort()
let migrated = 0
for (const filename of files) {
  const id = Number(filename.slice(0, 3))
  if (id === 1) continue
  const path = resolve(courseDir, filename)
  const source = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
  if (source.includes('<quiz-word-list>')) continue
  const { match, words } = parseWords(source, filename)
  if (!words.length) throw new Error(`${filename}: 词表为空或已经迁移`)

  const wrappedWords = `${match[1]}<quiz-word-list>\n\n${match[2].trim()}\n\n</quiz-word-list>\n`
  const withWordList = source.replace(match[0], wrappedWords)
  const scene = CURATED.get(id) || genericScene(words)
  const migratedSource = `${withWordList.trimEnd()}\n\n${renderExercises(scene)}`
  if (shouldWrite) writeFileSync(path, migratedSource, 'utf8')
  migrated++
}

console.log(`${shouldWrite ? '已迁移' : '待迁移'} ${migrated} 个单元${shouldWrite ? '' : '；传入 --write 执行写入'}`)
