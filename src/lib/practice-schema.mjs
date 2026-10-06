// Shared by the browser and course build: exercise files are data, never executable Markdown.
const idPattern = /^[a-z0-9][a-z0-9-]*$/
const nonEmpty = value => typeof value === 'string' && Boolean(value.trim())
const normalize = value => value.trim().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').replace(/[.!?。！？]+$/g, '').trim().toLowerCase()

function attributes(source, allowed, fail) {
  const result = {}
  const rest = source.replace(/\s+([a-z]+)="([^"]*)"/g, (_, key, value) => {
    if (!allowed.includes(key) || key in result) fail(`未知或重复属性 ${key}`)
    result[key] = value
    return ''
  })
  if (rest.trim()) fail('标签属性必须使用双引号')
  return result
}
function list(source, fail) {
  if (!source) return []
  return source.split('\n').filter(line => line.trim()).map(line => {
    if (!/^\s*-\s+\S/.test(line)) fail('列表项需要以 - 开始')
    return line.replace(/^\s*-\s+/, '').trim()
  })
}
function readableBlocks(source, fail) {
  if (/```|~~~|<\/?quiz-/i.test(source)) fail('Markdown 练习不能包含 JSON 代码块或旧标签')
  const wrapper = source.match(/<practice([^>]*)>\s*([\s\S]*?)\s*<\/practice>/)
  if (!wrapper || source.replace(wrapper[0], '').replace(/^# [^\n]+\n?/, '').trim()) fail('需要唯一且闭合的 practice 标签')
  const header = attributes(wrapper[1], ['unit', 'format'], fail)
  if (header.format !== '2') fail('格式版本必须为 2')
  const body = wrapper[2]
  const first = body.indexOf('<exercise')
  if (first < 0) fail('练习题库为空')
  const intro = body.slice(0, first)
  const title = intro.match(/^标题：(.+)$/m)?.[1]?.trim()
  const auxiliary = intro.match(/^辅助词：(.+)$/m)?.[1]
  const goals = list(intro.match(/^## 学习目标\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1], fail).map(line => {
    const fields = line.split('|').map(value => value.trim())
    if (fields.length !== 3) fail('学习目标需要 ID | 名称 | 说明')
    return { id: fields[0], title: fields[1], description: fields[2] }
  })
  const metadata = { schemaVersion: 2, unitId: Number(header.unit), title, goals, auxiliaryWords: auxiliary?.split(/[,，]/).map(word => word.trim()) }
  const blocks = [{ type: 'lexi-practice', value: metadata }]
  let rest = body.slice(first)
  for (const match of body.slice(first).matchAll(/<exercise([^>]*)>\s*([\s\S]*?)\s*<\/exercise>/g)) {
    rest = rest.replace(match[0], '')
    const attrs = attributes(match[1], ['id', 'type', 'activity', 'goal', 'stage'], fail)
    const sections = {}
    const content = match[2]
    if (/<\/?(?:exercise|practice)\b/.test(content)) fail('exercise 标签未闭合或嵌套')
    const targets = content.match(/^目标词：(.+)$/m)?.[1]?.split(/[,，]/).map(word => word.trim())
    const allowed = ['场景', '题目', '选项', '答案', '提示', '讲解', '选项反馈', '词块', '听力', '配对']
    for (const section of content.matchAll(/^### (.+)\n([\s\S]*?)(?=^### |(?![\s\S]))/gm)) {
      const name = section[1].trim()
      if (!allowed.includes(name) || name in sections) fail(`未知或重复题目小节 ${name}`)
      sections[name] = section[2].trim()
    }
    if (content.replace(/^目标词：.+$/m, '').replace(/^### .+\n[\s\S]*$/m, '').trim()) fail('题目内容需要使用规定的小节')
    const tagged = name => list(sections[name], fail).map(line => {
      const value = line.match(/^\[([a-z0-9-]+)\]\s+(.+)$/)
      if (!value) fail(`${name}需要 - [ID] 内容`)
      return { id: value[1], text: value[2] }
    })
    const exercise = { id: attrs.id, kind: attrs.type, activity: attrs.activity, goalId: attrs.goal, stage: attrs.stage, targets, prompt: sections['题目'], context: sections['场景'], hints: list(sections['提示'], fail), explanation: sections['讲解'] }
    if (sections['听力']) exercise.audio = { text: sections['听力'] }
    const specific = exercise.kind === 'choice' ? ['选项', '答案', '选项反馈'] : exercise.kind === 'compose' ? ['词块', '答案'] : exercise.kind === 'input' ? ['答案'] : ['配对']
    if (Object.keys(sections).some(name => !['场景', '题目', '提示', '讲解', '听力', ...specific].includes(name))) fail(`${exercise.id}: 小节与题型不匹配`)
    if (exercise.kind === 'choice') {
      const feedback = tagged('选项反馈')
      const options = tagged('选项')
      if (feedback.length !== options.length || new Set(feedback.map(item => item.id)).size !== feedback.length || feedback.some(item => !options.some(option => option.id === item.id))) fail('选项反馈必须与选项逐一对应')
      exercise.options = options.map(option => ({ ...option, feedback: feedback.find(item => item.id === option.id)?.text }))
      exercise.answer = sections['答案']
    } else if (exercise.kind === 'matching') {
      exercise.pairs = tagged('配对').map(pair => {
        const parts = pair.text.split('|').map(value => value.trim())
        if (parts.length !== 2) fail('配对需要 英文 | 中文')
        return { id: pair.id, english: parts[0], chinese: parts[1] }
      })
    } else {
      exercise.answers = list(sections['答案'], fail)
      if (exercise.kind === 'compose') exercise.tokens = sections['词块']?.split('|').map(token => token.trim())
    }
    blocks.push({ type: 'lexi-exercise', value: exercise })
  }
  if (rest.split('\n').some(line => line.trim() && !/^## /.test(line))) fail('exercise 标签未闭合或包含未知内容')
  return blocks
}

export function parsePracticeSource(source, unit) {
  const fail = message => { throw new Error(`${unit.file.replace(/\.md$/, '.test.md')}: ${message}`) }
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  if (lines[0]?.trim() !== `# ${unit.name}练习`) fail(`一级标题应为 # ${unit.name}练习`)
  const blocks = /<practice\b/.test(source) ? readableBlocks(lines.join('\n'), fail) : []
  for (let i = 0; !/<practice\b/.test(source) && i < lines.length; i++) {
    const open = lines[i].trim().match(/^```(lexi-[a-z-]+)$/)
    if (!open) {
      if (/^\s*(```|~~~)/.test(lines[i]) || /<\/?quiz-/i.test(lines[i])) fail(`第 ${i + 1} 行包含未知练习块`)
      continue
    }
    const start = i + 1
    while (++i < lines.length && lines[i].trim() !== '```') {}
    if (i >= lines.length) fail(`第 ${start} 行的代码块未闭合`)
    if (!['lexi-practice', 'lexi-exercise'].includes(open[1])) fail(`未知块 ${open[1]}`)
    let value
    try { value = JSON.parse(lines.slice(start, i).join('\n')) } catch { fail(`第 ${start} 行的 JSON 无效`) }
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`第 ${start} 行需要 JSON 对象`)
    blocks.push({ type: open[1], value })
  }
  const headers = blocks.filter(block => block.type === 'lexi-practice')
  if (headers.length !== 1 || blocks[0]?.type !== 'lexi-practice') fail('必须以唯一的 lexi-practice 元数据块开始')
  const metadata = headers[0].value
  if (!/<practice\b/.test(source) && metadata.schemaVersion !== 1) fail('JSON 格式版本必须为 1')
  if (![1, 2].includes(metadata.schemaVersion) || metadata.unitId !== unit.id || !nonEmpty(metadata.title)) fail('格式版本、单元编号或标题无效')
  if (!Array.isArray(metadata.goals) || !metadata.goals.length) fail('至少定义一个学习目标')
  const goalIds = new Set()
  for (const goal of metadata.goals) {
    if (!goal || !nonEmpty(goal.id) || !idPattern.test(goal.id) || ['recommended', 'review', 'listening', 'expression'].includes(goal.id) || goalIds.has(goal.id) || !nonEmpty(goal.title) || !nonEmpty(goal.description)) fail('学习目标 ID、名称或说明无效')
    goalIds.add(goal.id)
  }
  if (metadata.auxiliaryWords !== undefined && (!Array.isArray(metadata.auxiliaryWords) || metadata.auxiliaryWords.some(word => !nonEmpty(word)))) fail('辅助词应为非空字符串数组')
  const exercises = blocks.filter(block => block.type === 'lexi-exercise').map(block => block.value)
  if (!exercises.length) fail('练习题库为空')
  const ids = new Set()
  const sourceWords = new Set(unit.words.map(word => word.toLowerCase()))
  for (const exercise of exercises) {
    if (!nonEmpty(exercise.id) || !idPattern.test(exercise.id) || ids.has(exercise.id)) fail('题目 ID 无效或重复')
    ids.add(exercise.id)
    if (!goalIds.has(exercise.goalId)) fail(`${exercise.id}: 学习目标不存在`)
    if (!['recognize', 'build', 'recall'].includes(exercise.stage)) fail(`${exercise.id}: 阶段无效`)
    if (!Array.isArray(exercise.targets) || !exercise.targets.length || exercise.targets.some(word => !nonEmpty(word) || !sourceWords.has(word.toLowerCase()))) fail(`${exercise.id}: 目标词必须来自原始词表`)
    if (!nonEmpty(exercise.prompt) || !nonEmpty(exercise.explanation) || !Array.isArray(exercise.hints) || !exercise.hints.length || exercise.hints.some(hint => !nonEmpty(hint))) fail(`${exercise.id}: 缺少题干、解释或提示`)
    if (exercise.context !== undefined && !nonEmpty(exercise.context)) fail(`${exercise.id}: 场景为空`)
    if (exercise.audio !== undefined && (!exercise.audio || !nonEmpty(exercise.audio.text))) fail(`${exercise.id}: 听力文本无效`)
    const activities = { 'word-choice': 'choice', cloze: 'choice', compose: 'compose', write: 'input', 'audio-choice': 'choice', 'audio-spell': 'input', dictation: 'input', matching: 'matching' }
    if (metadata.schemaVersion === 2 || exercise.activity !== undefined) {
      if (activities[exercise.activity] !== exercise.kind || Boolean(exercise.audio) !== ['audio-choice', 'audio-spell', 'dictation'].includes(exercise.activity)) fail(`${exercise.id}: 题型与答题方式或听力配置不匹配`)
    }
    if (exercise.kind === 'choice') {
      if (!Array.isArray(exercise.options) || exercise.options.length < 2 || exercise.options.length > 5) fail(`${exercise.id}: 需要 2–5 个选项`)
      const options = new Set()
      const texts = new Set()
      for (const option of exercise.options) {
        if (!option || !nonEmpty(option.id) || !idPattern.test(option.id) || options.has(option.id) || !nonEmpty(option.text) || texts.has(normalize(option.text)) || !nonEmpty(option.feedback)) fail(`${exercise.id}: 选项 ID、内容或反馈无效`)
        options.add(option.id)
        texts.add(normalize(option.text))
      }
      if (!options.has(exercise.answer)) fail(`${exercise.id}: 正确选项不存在`)
    } else if (exercise.kind === 'matching') {
      if (!Array.isArray(exercise.pairs) || exercise.pairs.length < 2 || exercise.pairs.length > 6) fail(`${exercise.id}: 需要 2–6 组配对`)
      for (const field of ['id', 'english', 'chinese']) {
        if (exercise.pairs.some(pair => !pair || !nonEmpty(pair[field]) || (field === 'id' && !idPattern.test(pair.id))) || new Set(exercise.pairs.map(pair => normalize(pair[field]))).size !== exercise.pairs.length) fail(`${exercise.id}: 配对内容无效或重复`)
      }
    } else if (exercise.kind === 'input' || exercise.kind === 'compose') {
      if (!Array.isArray(exercise.answers) || !exercise.answers.length || exercise.answers.some(answer => !nonEmpty(answer)) || new Set(exercise.answers.map(normalize)).size !== exercise.answers.length) fail(`${exercise.id}: 可接受答案无效或重复`)
      if (exercise.kind === 'compose') {
        if (!Array.isArray(exercise.tokens) || !exercise.tokens.length || exercise.tokens.some(token => !nonEmpty(token) || /\s/.test(token))) fail(`${exercise.id}: 词块必须是单个词`)
        for (const answer of exercise.answers) {
          const pool = exercise.tokens.map(normalize)
          for (const token of normalize(answer).split(' ')) {
            const index = pool.indexOf(token)
            if (index < 0) fail(`${exercise.id}: 词块不能组成可接受答案`)
            pool.splice(index, 1)
          }
        }
      }
    } else fail(`${exercise.id}: 未知答题方式`)
  }
  for (const goal of metadata.goals) if (!exercises.some(exercise => exercise.goalId === goal.id)) fail(`${goal.id}: 目标没有对应题目`)
  return { ...metadata, exercises }
}
