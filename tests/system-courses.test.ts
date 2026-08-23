import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

interface CourseItem {
  id: number
  slug: string
  title: string
  desc: string
  tag: string
  icon: string
  file: string
  words: string[]
}

describe('System Courses validation', () => {
  const root = resolve(__dirname, '..')
  const manifestPath = resolve(root, 'public/data/system-courses.json')

  it('has a valid system-courses.json manifest', () => {
    expect(existsSync(manifestPath)).toBe(true)
    const content = readFileSync(manifestPath, 'utf-8')
    const courses: CourseItem[] = JSON.parse(content)

    expect(Array.isArray(courses)).toBe(true)
    expect(courses.length).toBe(29)
    expect(courses.map(course => course.id)).toEqual(Array.from({ length: 29 }, (_, index) => index + 1))

    for (const course of courses) {
      expect(typeof course.id).toBe('number')
      expect(typeof course.slug).toBe('string')
      expect(typeof course.title).toBe('string')
      expect(typeof course.desc).toBe('string')
      expect(typeof course.tag).toBe('string')
      expect(typeof course.file).toBe('string')
      expect(Array.isArray(course.words)).toBe(true)
      expect(course.words.length).toBeGreaterThan(0)

      // 验证 Markdown 文件实际存在
      const relativeFile = course.file.replace(/^\//, '')
      const mdPath = resolve(root, 'public', relativeFile)
      expect(existsSync(mdPath)).toBe(true)

      const mdContent = readFileSync(mdPath, 'utf-8')
      expect(mdContent.length).toBeGreaterThan(100)
      expect(mdContent.split(/\r?\n/, 1)[0]).toBe(`# ${course.title}`)
      expect(mdContent).not.toMatch(/<lexi-(irregular|variant)>/)
      expect(mdContent).not.toMatch(/<lexi-(?:sentence|word|morpheme|phoneme|notation)\b[^>]*>(?!`)/)
      expect(mdContent).not.toMatch(/^## .*练习/m)
      expect(mdContent).not.toContain('查看答案与分析')
      expect(mdContent).not.toContain('<details>')
      expect((mdContent.match(/^\|/gm) ?? []).length).toBeLessThan(30)
      expect(mdContent.match(/^## /gm)?.length ?? 0).toBeGreaterThanOrEqual(6)
    }
  })

  it('verifies Lesson 01 phoneme and articulation content features', () => {
    const mdPath = resolve(root, 'public/data/system-courses/01-phonemes-and-articulation.md')
    const mdContent = readFileSync(mdPath, 'utf-8')

    expect(mdContent).toContain('音素与发音动作')
    expect(mdContent).toContain('声音怎样产生')
    expect(mdContent).toContain('音标、语音和音位')
    expect(mdContent).toContain('同一音位为什么会有不同读法')
    expect(mdContent).toContain('声音怎样进入波形和频谱')
    expect(mdContent).toContain('<lexi-phoneme>')
  })

  it('verifies Lesson 02 numbers content features', () => {
    const mdPath = resolve(root, 'public/data/system-courses/03-numbers-and-math.md')
    const mdContent = readFileSync(mdPath, 'utf-8')

    expect(mdContent).toContain('数量、顺序、标签，还是测量值')
    expect(mdContent).toContain('twelve')
    expect(mdContent).toContain('twenty')
    expect(mdContent).toContain('三位分节')
    expect(mdContent).toContain('百分比、百分点和变化率')
    expect(mdContent).toContain('<lexi-notation>')
  })

  it('publishes every topic in the curriculum directory', () => {
    const courses: CourseItem[] = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    const expectedTitles = [
      '音素与发音动作', '连读、弱读与语调', '数字、单位与数据表达',
      '名词短语与限定', '代词与指代', '修饰、程度与比较', '疑问、否定与祈使', '时态与体（aspect）',
      '情态、语气与立场', '主动、被动与使役', '条件、假设与反事实', '介词与关系', '非谓语动词',
      '从句与复句', '语序、强调与信息结构', '词根、词缀与形态变体', '核心动词与短语动词',
      '大语言模型、检索与智能体术语', 'Git、提交与代码评审', '容器、云服务与可观测性术语',
      '拼写、重音与节奏', '词义、搭配与语块', '阅读、篇章与技术写作',
      '论文写作与研究交流', '元素、周期表与化学构词', '化学研究：基础、反应与溶液',
      '化学研究：材料、分析与实验安全', '时间、历法与日程', '空间、方位与路径',
    ]

    expect(new Set(courses.map(course => course.title))).toEqual(new Set(expectedTitles))
  })

  it('uses custom tags only for special semantic states', () => {
    const courseDir = resolve(root, 'public/data/system-courses')
    const files = readdirSync(courseDir).filter(file => /^\d{2}-.*\.md$/.test(file))

    for (const file of files) {
      const content = readFileSync(resolve(courseDir, file), 'utf-8')
      expect(content).not.toContain('<lexi-word>`')
      expect(content).not.toContain('<lexi-sentence>')
    }
  })

  it('keeps composite examples split into their smallest semantic units', () => {
    const numbers = readFileSync(resolve(root, 'public/data/system-courses/03-numbers-and-math.md'), 'utf-8')
    const adjectives = readFileSync(resolve(root, 'public/data/system-courses/06-adjectives-adverbs-and-comparison.md'), 'utf-8')
    const questions = readFileSync(resolve(root, 'public/data/system-courses/07-interrogative-and-negation.md'), 'utf-8')
    const morphology = readFileSync(resolve(root, 'public/data/system-courses/16-golden-roots-and-affixes.md'), 'utf-8')
    const network = readFileSync(resolve(root, 'public/data/system-courses/20-network-and-cloud-native.md'), 'utf-8')

    expect(numbers).toContain('<lexi-notation>`1`</lexi-notation> | <lexi-notation>`234`</lexi-notation>')
    expect(numbers).toContain('`billion` | `million` | `thousand` | `units`')
    expect(adjectives).toContain('`evaluation` → `size` → `age`')
    expect(questions).toContain('<lexi-notation>`主语`</lexi-notation> + <lexi-notation>`助动词`</lexi-notation>')
    expect(morphology).toContain('<lexi-morpheme kind="prefix">`in-`</lexi-morpheme> + `possible` → `impossible`')
    expect(network).toContain('`client` → `network` → `server` → `database` → `response`')

    for (const content of [numbers, adjectives, questions, morphology, network]) {
      expect(content).not.toContain('<lexi-notation>`1 | 234 | 567 | 890`</lexi-notation>')
      expect(content).not.toContain('<lexi-notation>`billion | million | thousand | units`</lexi-notation>')
      expect(content).not.toContain('<lexi-notation>`evaluation → size → age → shape → color → origin → material → purpose → noun`</lexi-notation>')
      expect(content).not.toContain('<lexi-notation>`主语 + 助动词 + 谓语其余部分`</lexi-notation>')
      expect(content).not.toContain('<lexi-notation>`client → network → server → database → response`</lexi-notation>')
    }
  })

  it('verifies Lesson 02 connected speech features', () => {
    const mdPath = resolve(root, 'public/data/system-courses/02-connected-speech-and-rhythm.md')
    const mdContent = readFileSync(mdPath, 'utf-8')
    expect(mdContent).toContain('意群、重音与节奏骨架')
    expect(mdContent).toContain('弱读与中央元音')
    expect(mdContent).toContain('同化、省音与常见音位变体')
    expect(mdContent).toContain('信息焦点、意群与语调')
    expect(mdContent).toContain('`When the meeting ended`')
    expect(mdContent).toContain('<lexi-phoneme>')
  })

  it('verifies Lesson 08 tense model features', () => {
    const mdPath = resolve(root, 'public/data/system-courses/08-tense-mental-model.md')
    const mdContent = readFileSync(mdPath, 'utf-8')
    expect(mdContent).toContain('事件时间 event time')
    expect(mdContent).toContain('体（`aspect`）描述观察事件的方式')
    expect(mdContent).toContain('现在完成时：过去情形连接现在')
    expect(mdContent).toContain('体与事件类型')
    expect(mdContent).toContain('`By noon, Maya had finished the report.`')
  })

  it('verifies Lessons 12-17 spatial, clause, and morphology depth', () => {
    const l12 = readFileSync(resolve(root, 'public/data/system-courses/12-spatial-prepositions.md'), 'utf-8')
    const l13 = readFileSync(resolve(root, 'public/data/system-courses/13-non-finite-verbs.md'), 'utf-8')
    const l14 = readFileSync(resolve(root, 'public/data/system-courses/14-sentence-structures-and-clauses.md'), 'utf-8')
    const l16 = readFileSync(resolve(root, 'public/data/system-courses/16-golden-roots-and-affixes.md'), 'utf-8')
    const l17 = readFileSync(resolve(root, 'public/data/system-courses/17-core-verbs-and-spatial-phrases.md'), 'utf-8')

    expect(l12).toContain('点、表面与容器')
    expect(l12).toContain('从空间扩展到时间')
    expect(l13).toContain('控制：谁是内层事件的隐含主语')
    expect(l13).toContain('提升：上层主语不一定是上层动词的参与者')
    expect(l13).toContain('`decide` / `hope` / `plan` / `refuse` / `manage`')
    expect(l14).toContain('从句可以嵌套')
    expect(l14).toContain('长句解析算法')
    expect(l16).toContain('<lexi-morpheme')
    expect(l16).toContain('构词的生产力与限制')
    expect(l17).toContain('透明度是一条连续谱')
    expect(l17).toContain('小品词的事件轮廓')
  })

  it('verifies Lessons 18-20 technical courses as end-to-end systems', () => {
    const l18 = readFileSync(resolve(root, 'public/data/system-courses/18-ai-and-llm-terms.md'), 'utf-8')
    const l19 = readFileSync(resolve(root, 'public/data/system-courses/19-developer-engineering-english.md'), 'utf-8')
    const l20 = readFileSync(resolve(root, 'public/data/system-courses/20-network-and-cloud-native.md'), 'utf-8')

    expect(l18).toContain('文本怎样进入模型')
    expect(l18).toContain('风险和限制的常见表达')
    expect(l18).toContain('NIST AI 600-1')
    expect(l19).toContain('`requirement` → `issue` → `change`')
    expect(l19).toContain('Incident 与状态通告')
    expect(l19).toContain('Git 官方参考文档')
    expect(l20).toContain('地址与连接')
    expect(l20).toContain('事务、备份和数据变化')
    expect(l20).toContain('Cloud 与 Kubernetes 高频词')
    expect(l20).toContain('RFC 9110')
    expect(l20).toContain('`client` → `network` → `server` → `database` → `response`')
  })

  it('verifies Lesson 13-16 beginner grammar courses features', () => {
    const l13 = readFileSync(resolve(root, 'public/data/system-courses/04-nouns-and-articles.md'), 'utf-8')
    const l14 = readFileSync(resolve(root, 'public/data/system-courses/05-pronouns-and-determiners.md'), 'utf-8')
    const l15 = readFileSync(resolve(root, 'public/data/system-courses/06-adjectives-adverbs-and-comparison.md'), 'utf-8')
    const l16 = readFileSync(resolve(root, 'public/data/system-courses/07-interrogative-and-negation.md'), 'utf-8')

    expect(l13).toContain('可数性：把概念切成个体还是连续量')
    expect(l13).toContain('<lexi-word form="irregular">')
    expect(l14).toContain('人称、格与所有关系')
    expect(l14).toContain('数量限定：个体、总量与分配')
    expect(l15).toContain('比较级')
    expect(l15).toContain('最高级')
    expect(l16).toContain('反意疑问句')
    expect(l16).toContain('`do` 支持')
  })

  it('verifies Lesson 17-20 advanced grammar courses features', () => {
    const l17 = readFileSync(resolve(root, 'public/data/system-courses/09-modal-verbs.md'), 'utf-8')
    const l18 = readFileSync(resolve(root, 'public/data/system-courses/10-passive-and-causative.md'), 'utf-8')
    const l19 = readFileSync(resolve(root, 'public/data/system-courses/11-conditionals-and-subjunctive.md'), 'utf-8')
    const l20 = readFileSync(resolve(root, 'public/data/system-courses/15-advanced-syntax.md'), 'utf-8')

    expect(l17).toContain('情态完成式')
    expect(l18).toContain('使役')
    expect(l18).toContain('`be` + <lexi-notation>`past participle`</lexi-notation>')
    expect(l19).toContain('混合条件')
    expect(l19).toContain('wish')
    expect(l20).toContain('地点前置与完整倒装')
    expect(l20).toContain('一致关系')
  })

  it('verifies system course curriculum and authoring documents', () => {
    const curriculumPath = resolve(root, 'public/data/system-courses/_curriculum.md')
    const specPath = resolve(root, 'public/data/system-courses/_spec.md')
    expect(existsSync(curriculumPath)).toBe(true)
    expect(existsSync(specPath)).toBe(true)

    const curriculumContent = readFileSync(curriculumPath, 'utf-8')
    expect(curriculumContent).toContain('横向主题与纵向深度')
    expect(curriculumContent).toContain('发布课程目录')
    expect(curriculumContent).toContain('当前界面使用单个 Markdown 文件承载一门课程')
    expect(curriculumContent).toContain('声音与拼写')
    expect(curriculumContent).toContain('开发与技术')
    expect(curriculumContent).toContain('科研与学术')
    expect(curriculumContent).toContain('29 门中长篇课程')
    expect(curriculumContent).toContain('词义、搭配与语块')
    expect(curriculumContent).toContain('时间、历法与日程')
    expect(curriculumContent).toContain('空间、方位与路径')
    expect(curriculumContent).toContain('元素、周期表与化学构词')
    expect(curriculumContent).toContain('化学研究：基础、反应与溶液')
    expect(curriculumContent).toContain('不构成从基础化学到专业化学的培养路线')

    const specContent = readFileSync(specPath, 'utf-8')
    expect(specContent).toContain('课程与章节编写结构')
    expect(specContent).toContain('语义标签与视觉规范')
    expect(specContent).toContain('gitGraph')
    expect(specContent).toContain('sequenceDiagram')
    expect(specContent).toContain('<lexi-word form="irregular">')
    expect(specContent).toContain('<lexi-morpheme')
    expect(specContent).toContain('最小交互单位')
    expect(specContent).toContain('Markdown 与版式规范')
    expect(specContent).toContain('中长篇与反模板要求')
  })

  it('keeps the new long courses focused and distinct', () => {
    const paper = readFileSync(resolve(root, 'public/data/system-courses/24-academic-paper-writing-and-research-communication.md'), 'utf-8')
    const periodic = readFileSync(resolve(root, 'public/data/system-courses/25-elements-periodic-table-and-chemical-word-formation.md'), 'utf-8')
    const time = readFileSync(resolve(root, 'public/data/system-courses/28-time-calendar-and-scheduling-english.md'), 'utf-8')
    const space = readFileSync(resolve(root, 'public/data/system-courses/29-space-direction-and-route-english.md'), 'utf-8')

    for (const topic of ['论文各部分', '研究问题', '文献检索', '变量、比较与测量', '结果、统计与因果', '引用、改写与研究伦理', '同行评审', '开放材料']) {
      expect(paper).toContain(topic)
    }
    expect(periodic).toContain('原子、元素、分子、化合物与混合物')
    expect(periodic).toContain('拉丁语')
    expect(periodic).toContain('118 个元素：按周期查阅')
    const elementReference = periodic.split('## 9. 118 个元素：按周期查阅')[1]?.split('## 10. 分子、离子与化合物')[0] ?? ''
    expect((elementReference.match(/<lexi-notation>/g) ?? []).length).toBe(118)
    expect(periodic).toContain('formula unit')
    expect(periodic).toContain('常见分子与化合物的命名阅读')
    expect(periodic).toContain('H two O')
    expect(periodic).toContain('formula reading')
    expect(periodic).toContain('中文与英文的名称顺序恰好相反')
    expect(periodic).toContain('sodium chloride')
    expect(periodic).toContain('N A C L')
    expect(periodic).toContain('H C L aqueous')
    expect(periodic).toContain('从甲、乙、丙、丁到')
    expect(periodic).toContain('formaldehyde')
    expect(periodic).toContain('methanal')
    expect(periodic).toContain('acetaldehyde')
    expect(periodic).toContain('ethanal')
    expect(periodic).toContain('词根告诉你碳数，词尾告诉你结构类别')
    expect(periodic).toContain('pentagon')
    expect(periodic).toContain('methyl')
    expect(periodic).toContain('isopropyl')
    expect(time).toContain('时态、体（aspect）和未来结构由《时态与体（aspect）》负责')
    expect(time).toContain('fourteen thirty')
    expect(time).toContain('Gregorian calendar')
    expect(time).toContain('`day`、`week`、`month`、`year`')
    expect(time).not.toContain('<lexi-word>')
    expect(space).toContain('介词的空间原型、搭配和语法由《介词与关系》负责')
    expect(space).toContain('东西南北与地图方向')
  })
})
