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

const CURATED_SCENES = new Map([
  [1, [
    ['Chinese is my favorite subject.', 'Chinese', '中文是我最喜欢的科目。'],
    ['English is useful for students.', 'English', '英语对学生很有用。'],
    ['I like my book.', 'book', '我喜欢我的书。'],
    ['My cat likes my dog.', 'cat', '我的猫喜欢我的狗。'],
    ['My father is a teacher.', 'father', '我的父亲是一名老师。'],
    ['My mother is a teacher too.', 'mother', '我的母亲也是一名老师。'],
    ['You are my friend.', 'you', '你是我的朋友。'],
    ['I am a student.', 'student', '我是一名学生。'],
    ['My teacher likes Chinese books.', 'teacher', '我的老师喜欢中文书。'],
    ['You and I like English.', 'like', '你和我都喜欢英语。'],
  ]],
  [2, [
    ['Our room is small and white.', 'room', '我们的房间又小又白。'],
    ['Their house has a red phone.', 'house', '他们的房子里有一部红色电话。'],
    ['We use our blue computer every day.', 'computer', '我们每天使用蓝色电脑。'],
    ['They have a big green room.', 'green', '他们有一个绿色的大房间。'],
    ['The black phone is in our house.', 'black', '黑色电话在我们的房子里。'],
    ['Our phone is small and blue.', 'phone', '我们的电话又小又蓝。'],
    ['Their room is small but bright.', 'small', '他们的房间很小，但很明亮。'],
    ['We like the blue computer.', 'blue', '我们喜欢那台蓝色电脑。'],
    ['They use a red phone.', 'red', '他们使用一部红色电话。'],
    ['Our house has a big room.', 'big', '我们的房子有一个大房间。'],
  ]],
  [116, [
    ['I traveled solo for the first time.', 'solo', '我第一次独自旅行。'],
    ['I felt homesick after my arrival.', 'homesick', '到达后我感到想家。'],
    ['I went through passport control and reserved a shuttle.', 'passport control', '我通过护照检查并预订了接驳车。'],
    ['The hotel was nearby, just over there.', 'nearby', '酒店就在附近，就在那边。'],
    ['I unpacked my bag and did the laundry.', 'laundry', '我打开行李并洗了衣服。'],
    ['The fare was much higher than I expected.', 'fare', '费用比我预想的高得多。'],
    ['A solo traveler needs public transportation.', 'public transportation', '独自旅行者需要公共交通。'],
    ['Which continent did you like best?', 'continent', '你最喜欢哪个大洲？'],
    ['I reserved an extra seat on the shuttle.', 'extra', '我在接驳车上预订了一个额外座位。'],
    ['The airport was farther away than I thought.', 'farther', '机场比我想象的更远。'],
  ]],
  [290, [
    ["Way to go; you earned your master's degree!", 'way to go', '好样的，你获得了硕士学位！'],
    ['Your dedication and willpower are admirable.', 'dedication', '你的投入和意志力令人钦佩。'],
    ['You stay focused when you feel discouraged.', 'stay focused', '你感到气馁时仍保持专注。'],
    ['After graduation, it was all worth it.', 'all worth it', '毕业后，一切都是值得的。'],
    ['Wishing you success as a lifelong learner.', 'lifelong', '祝你成为终身学习者并不断成功。'],
    ['Your academic accomplishment is impressive.', 'academic', '你的学术成就令人印象深刻。'],
    ['You worked hard at your higher education.', 'higher education', '你在高等教育中努力学习。'],
    ["I can't wait to celebrate with you.", "can't wait", '我迫不及待想和你一起庆祝。'],
    ['Look how much you accomplish when you are driven.', 'accomplish', '看看当你充满动力时能完成多少事。'],
    ['Never have I seen such a dedicated learner.', 'dedicated', '我从未见过如此投入的学习者。'],
  ]],
])

const THEMES = {
  preference: [
    ['When we talked about favorites, I heard "{word}".', '谈论喜好时，我听到了“{word}”。'],
    ['My friend said "{word}" was important.', '朋友说“{word}”很重要。'],
    ['I asked which one they liked: "{word}".', '我问他们喜欢哪一个：“{word}”。'],
    ['In our chat, we compared "{word}".', '聊天时，我们比较了“{word}”。'],
    ['My partner chose "{word}" first.', '同伴先选择了“{word}”。'],
    ['We used "{word}" to describe a favorite.', '我们用“{word}”描述喜好。'],
    ['The answer included "{word}".', '答案中包含“{word}”。'],
    ['I remembered "{word}" from the conversation.', '我从对话中记住了“{word}”。'],
    ['My friend repeated "{word}" with a smile.', '朋友微笑着重复了“{word}”。'],
    ['That chat about favorites ended with "{word}".', '那场关于喜好的聊天以“{word}”收尾。'],
  ],
  travel: [
    ['At the airport, I heard "{word}".', '在机场，我听到了“{word}”。'],
    ['My travel partner explained "{word}".', '我的旅伴解释了“{word}”。'],
    ['During the trip, we talked about "{word}".', '旅行途中，我们谈到了“{word}”。'],
    ['At the hotel, I wrote down "{word}".', '在酒店里，我记下了“{word}”。'],
    ['The traveler repeated "{word}" clearly.', '旅行者清楚地重复了“{word}”。'],
    ['Before leaving, I checked "{word}".', '离开前，我查看了“{word}”。'],
    ['On the way there, we used "{word}".', '在去那里的路上，我们用到了“{word}”。'],
    ['After arrival, I remembered "{word}".', '到达后，我想起了“{word}”。'],
    ['The guide pointed out "{word}".', '导游指出了“{word}”。'],
    ['That travel story ended with "{word}".', '那段旅行故事以“{word}”收尾。'],
  ],
  food: [
    ['At the restaurant, I asked about "{word}".', '在餐厅里，我询问了“{word}”。'],
    ['The menu included "{word}".', '菜单上有“{word}”。'],
    ['At the table, we talked about "{word}".', '在餐桌旁，我们谈到了“{word}”。'],
    ['The cook mentioned "{word}".', '厨师提到了“{word}”。'],
    ['I ordered "{word}" for dinner.', '晚餐我点了“{word}”。'],
    ['My friend chose "{word}".', '我的朋友选择了“{word}”。'],
    ['The waiter repeated "{word}".', '服务员重复了“{word}”。'],
    ['We shared a story about "{word}".', '我们分享了一个关于“{word}”的故事。'],
    ['After the meal, I remembered "{word}".', '饭后，我记住了“{word}”。'],
    ['That meal ended with "{word}".', '那顿饭以“{word}”收尾。'],
  ],
  school: [
    ['In class, the teacher introduced "{word}".', '课堂上，老师介绍了“{word}”。'],
    ['I wrote "{word}" in my notebook.', '我把“{word}”写进笔记本。'],
    ['My classmate explained "{word}".', '同学解释了“{word}”。'],
    ['We practiced "{word}" together.', '我们一起练习了“{word}”。'],
    ['The homework included "{word}".', '作业里包含“{word}”。'],
    ['I asked the teacher about "{word}".', '我向老师询问了“{word}”。'],
    ['During the lesson, I heard "{word}".', '上课时，我听到了“{word}”。'],
    ['My study partner remembered "{word}".', '学习伙伴记住了“{word}”。'],
    ['We used "{word}" in an example.', '我们在例句中用到了“{word}”。'],
    ['After class, I reviewed "{word}".', '下课后，我复习了“{word}”。'],
  ],
  work: [
    ['At work, we discussed "{word}".', '工作中，我们讨论了“{word}”。'],
    ['My coworker mentioned "{word}".', '同事提到了“{word}”。'],
    ['In the meeting, I heard "{word}".', '会议中，我听到了“{word}”。'],
    ['I added "{word}" to my notes.', '我把“{word}”写进了笔记。'],
    ['The manager explained "{word}".', '经理解释了“{word}”。'],
    ['Our team used "{word}" today.', '团队今天用到了“{word}”。'],
    ['Before lunch, we checked "{word}".', '午饭前，我们查看了“{word}”。'],
    ['My colleague asked about "{word}".', '同事询问了“{word}”。'],
    ['The report included "{word}".', '报告中包含“{word}”。'],
    ['At the end of the day, I remembered "{word}".', '一天结束时，我记住了“{word}”。'],
  ],
  home: [
    ['At home, we talked about "{word}".', '在家里，我们谈到了“{word}”。'],
    ['My family mentioned "{word}".', '家人提到了“{word}”。'],
    ['In the room, I noticed "{word}".', '在房间里，我注意到了“{word}”。'],
    ['We used "{word}" at home.', '我们在家里用到了“{word}”。'],
    ['My neighbor asked about "{word}".', '邻居询问了“{word}”。'],
    ['I wrote down "{word}" by the door.', '我在门边写下了“{word}”。'],
    ['After dinner, we repeated "{word}".', '晚饭后，我们重复了“{word}”。'],
    ['The family story included "{word}".', '家庭故事里包含“{word}”。'],
    ['Before bed, I remembered "{word}".', '睡前，我记住了“{word}”。'],
    ['That evening ended with "{word}".', '那个夜晚以“{word}”收尾。'],
  ],
  health: [
    ['At the clinic, I heard "{word}".', '在诊所里，我听到了“{word}”。'],
    ['The doctor explained "{word}".', '医生解释了“{word}”。'],
    ['We talked about "{word}" carefully.', '我们认真谈到了“{word}”。'],
    ['I wrote "{word}" in my health notes.', '我把“{word}”写进健康笔记。'],
    ['The nurse repeated "{word}".', '护士重复了“{word}”。'],
    ['My friend asked about "{word}".', '朋友询问了“{word}”。'],
    ['The advice included "{word}".', '建议中包含“{word}”。'],
    ['After the visit, I remembered "{word}".', '就诊后，我记住了“{word}”。'],
    ['We used "{word}" in the conversation.', '我们在对话中用到了“{word}”。'],
    ['That health talk ended with "{word}".', '那次健康交流以“{word}”收尾。'],
  ],
  social: [
    ['At the gathering, I heard "{word}".', '聚会上，我听到了“{word}”。'],
    ['My friend said "{word}".', '朋友说了“{word}”。'],
    ['We talked about "{word}" together.', '我们一起谈到了“{word}”。'],
    ['Someone explained "{word}" to me.', '有人向我解释了“{word}”。'],
    ['I replied with "{word}".', '我用“{word}”作了回应。'],
    ['The conversation included "{word}".', '对话中包含“{word}”。'],
    ['My partner repeated "{word}".', '同伴重复了“{word}”。'],
    ['We laughed about "{word}".', '我们聊到“{word}”时笑了。'],
    ['Before leaving, I remembered "{word}".', '离开前，我记住了“{word}”。'],
    ['That conversation ended with "{word}".', '那段对话以“{word}”收尾。'],
  ],
  general: [
    ['In this situation, I heard "{word}".', '在这个情境中，我听到了“{word}”。'],
    ['My partner explained "{word}".', '同伴解释了“{word}”。'],
    ['We talked about "{word}" together.', '我们一起谈到了“{word}”。'],
    ['I wrote down "{word}".', '我记下了“{word}”。'],
    ['The example included "{word}".', '例句中包含“{word}”。'],
    ['I asked about "{word}".', '我询问了“{word}”。'],
    ['We used "{word}" in a sentence.', '我们在句子中用到了“{word}”。'],
    ['My friend repeated "{word}".', '朋友重复了“{word}”。'],
    ['Later, I remembered "{word}".', '后来，我记住了“{word}”。'],
    ['The short story ended with "{word}".', '这个小故事以“{word}”收尾。'],
  ],
}

function inferTheme(source) {
  const value = source.slice(0, 900).toLowerCase()
  if (/颜色|物品|color|object/.test(value)) return 'home'
  if (/喜好|兴趣|喜欢|likes|interests|preference/.test(value)) return 'preference'
  if (/旅|trip|travel|airport|hotel|tour|vacation|transit|flight/.test(value)) return 'travel'
  if (/餐|食|厨房|咖啡|restaurant|food|dinner|cook|recipe|fast food/.test(value)) return 'food'
  if (/学校|学习|大学|考试|课堂|school|study|education|homework/.test(value)) return 'school'
  if (/工作|职业|办公室|面试|office|work|career|business|interview/.test(value)) return 'work'
  if (/健康|医生|health|doctor|clinic|symptom/.test(value)) return 'health'
  if (/家|房|搬|home|room|moving|cleaning/.test(value)) return 'home'
  if (/朋友|聚会|邀请|相遇|婚|party|friend|wedding|reunion|marriage|dating|couple/.test(value)) return 'social'
  return 'general'
}

function getWords(source, filename) {
  const match = source.match(/<quiz-word-list>\s*\n\s*([\s\S]*?)\s*\n\s*<\/quiz-word-list>/)
  if (!match) throw new Error(`${filename}: 未找到共享词表`)
  return match[1].split(',').map(word => word.trim()).filter(Boolean)
}

function pickWords(words) {
  const eligible = words.filter(word => !LOW_VALUE_WORDS.has(word.toLowerCase()) && !word.includes('"'))
  const pool = eligible.length >= 10 ? eligible : words.filter(word => !word.includes('"'))
  if (pool.length < 10) throw new Error('词表少于 10 个可用词条')
  const used = new Set()
  const result = []
  for (let index = 0; result.length < 10 && index < pool.length * 2; index++) {
    const position = Math.round((pool.length - 1) * (result.length / 9))
    const word = pool[(position + index) % pool.length]
    if (!used.has(word.toLowerCase())) {
      used.add(word.toLowerCase())
      result.push(word)
    }
  }
  if (result.length < 10) throw new Error('无法选出 10 个不重复词条')
  return result
}

function buildScene(source, words) {
  const id = Number(source.match(/^# Unit (\d{3}):/m)?.[1])
  const curated = CURATED_SCENES.get(id)
  if (curated) {
    return curated.map(([english, word, chinese]) => ({
      english,
      word,
      chinese,
      explanation: `本题在单元主题情境中复习表达 ${word}。`,
    }))
  }
  const terms = pickWords(words)
  const frames = THEMES[inferTheme(source)]
  return terms.map((word, index) => ({
    word,
    english: frames[index][0].replace('{word}', word),
    chinese: frames[index][1].replace('{word}', word),
    explanation: `本题在单元主题情境中复习表达 ${word}。`,
  }))
}

function renderBuilder(items) {
  return ['<quiz-sentence-builder>', '', ...items.flatMap((item, index) => [
    `${index + 1}. **中文**：${item.chinese}  `,
    `   **英文**：${item.english}`,
    `   > **解析**：${item.explanation}`,
    '',
  ]), '</quiz-sentence-builder>'].join('\n')
}

function renderListening(items) {
  return ['<quiz-listening>', '', ...items.flatMap((item, index) => [
    `${index + 1}. ${item.english}`,
    `   > **中文**：${item.chinese}`,
  ]), '', '</quiz-listening>'].join('\n')
}

function renderCloze(items) {
  return ['<quiz-cloze>', '', ...items.flatMap((item, index) => {
    const distractors = [items[(index + 3) % items.length].word, items[(index + 6) % items.length].word]
    const quotedWord = `"${item.word}"`
    const prompt = item.english.includes(quotedWord)
      ? item.english.replace(quotedWord, '"`____`"')
      : item.english.replace(new RegExp(item.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '`____`')
    return [
      `### ${index + 1}`,
      '',
      prompt,
      '',
      `- [x] ${item.word}`,
      `- [ ] ${distractors[0]}`,
      `- [ ] ${distractors[1]}`,
      '',
      `> **解析**：${item.explanation}`,
      '',
    ]
  }), '</quiz-cloze>'].join('\n')
}

function replaceBlock(source, name, replacement) {
  const expression = new RegExp(`<${name}>[\\s\\S]*?<\\/${name}>`)
  if (!expression.test(source)) throw new Error(`缺少 <${name}>`)
  return source.replace(expression, replacement)
}

const files = readdirSync(courseDir).filter(filename => filename.endsWith('.md')).sort()
let updated = 0
for (const filename of files) {
  const path = resolve(courseDir, filename)
  const source = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
  const scene = buildScene(source, getWords(source, filename))
  let next = replaceBlock(source, 'quiz-sentence-builder', renderBuilder(scene))
  next = replaceBlock(next, 'quiz-listening', renderListening(scene))
  next = replaceBlock(next, 'quiz-cloze', renderCloze(scene))
  if (shouldWrite) writeFileSync(path, `${next.trimEnd()}\n`, 'utf8')
  updated++
}

console.log(`${shouldWrite ? '已升级' : '待升级'} ${updated} 个单元的显式练习；传入 --write 执行写入`)
