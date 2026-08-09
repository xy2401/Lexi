export interface ReaderAnnotationOptions {
  includeBasicFunctionWords?: boolean
}

const BASIC_FUNCTION_GLOSSES: Readonly<Record<string, string>> = Object.freeze({
  // Articles, pronouns and determiners.
  a: '一个', an: '一个', the: '特指的',
  i: '我', me: '我', my: '我的', mine: '我的', myself: '我自己',
  you: '你/你们', your: '你的/你们的', yours: '你的/你们的', yourself: '你自己', yourselves: '你们自己',
  he: '他', him: '他', his: '他的', himself: '他自己',
  she: '她', her: '她/她的', hers: '她的', herself: '她自己',
  it: '它', its: '它的', itself: '它自己',
  we: '我们', us: '我们', our: '我们的', ours: '我们的', ourselves: '我们自己',
  they: '他们/它们', them: '他们/它们', their: '他们的', theirs: '他们的', themselves: '他们自己',
  this: '这/这个', that: '那/那个', these: '这些', those: '那些',
  some: '一些', any: '任何/一些', each: '每个', every: '每个', either: '任一', neither: '两者都不',
  both: '两者都', all: '全部', another: '另一个', other: '其他的', much: '许多', many: '许多',
  few: '很少', little: '很少', enough: '足够',

  // be / do / have and modal auxiliaries.
  be: '是/处于', am: '是/处于', is: '是/处于', are: '是/处于', was: '是/曾经', were: '是/曾经',
  been: '是/处于', being: '正在/处于',
  do: '做/助动', does: '做/助动', did: '做/助动', done: '做完', doing: '正在做',
  have: '有/已经', has: '有/已经', had: '有/已经', having: '有/拥有',
  can: '能/可以', could: '能/可以', may: '可能/可以', might: '可能/也许', must: '必须',
  shall: '将/会', should: '应该', will: '将/会', would: '会/愿意', ought: '应该', need: '需要',

  // Common conjunctions, negation and prepositions.
  and: '和/并且', or: '或/或者', but: '但是', if: '如果', because: '因为', so: '所以',
  than: '比', as: '作为/像', although: '虽然', though: '虽然', while: '当…时', whether: '是否', nor: '也不', yet: '然而/还',
  not: '不/没有', no: '不/没有', yes: '是/好的',
  of: '的', to: '到/去', in: '在…中', on: '在…上', at: '在/向', for: '为/给', from: '从/来自',
  by: '由/通过', with: '和/用', about: '关于/大约', into: '进入', out: '出去/外面', over: '在…上方',
  under: '在…下面', before: '在…之前', after: '在…之后', between: '在…之间', among: '在…之中',
  through: '通过/穿过', during: '在…期间', without: '没有', within: '在…之内', against: '反对/靠着',
  around: '在…周围', toward: '朝向', towards: '朝向', up: '向上', down: '向下', off: '离开/关闭',

  // Frequent contractions. Curly apostrophes are normalized before lookup.
  "i'm": '我是', "you're": '你是/你们是', "he's": '他是/他有', "she's": '她是/她有', "it's": '它是/它有',
  "we're": '我们是', "they're": '他们是',
  "i've": '我已经', "you've": '你已经', "we've": '我们已经', "they've": '他们已经',
  "i'll": '我将会', "you'll": '你将会', "he'll": '他将会', "she'll": '她将会', "it'll": '它将会',
  "we'll": '我们将会', "they'll": '他们将会',
  "i'd": '我会/我曾', "you'd": '你会/你曾', "he'd": '他会/他曾', "she'd": '她会/她曾', "we'd": '我们会/我们曾', "they'd": '他们会/他们曾',
  "isn't": '不是', "aren't": '不是', "wasn't": '不是/没有', "weren't": '不是/没有',
  "don't": '不/不要', "doesn't": '不/没有', "didn't": '没有/没做',
  "haven't": '还没有', "hasn't": '还没有', "hadn't": '还没有',
  "can't": '不能', cannot: '不能', "couldn't": '不能/不会', "won't": '不会/将不', "wouldn't": '不会/不愿',
  "shouldn't": '不应该', "mustn't": '禁止/不能', "shan't": '将不会', "mightn't": '可能不', "needn't": '不必',
  "let's": '让我们', "that's": '那是', "there's": '有/那里是', "here's": '这是', "what's": '什么是', "who's": '谁是',
})

export function normalizeReaderWord(word: string): string {
  return word.trim().replace(/’/g, "'")
}

export function isAllCapsReaderToken(word: string): boolean {
  const normalized = normalizeReaderWord(word)
  return normalized.length > 1 && /[A-Z]/.test(normalized) && normalized === normalized.toUpperCase()
}

export function getBasicFunctionWordGloss(word: string): string | null {
  const normalized = normalizeReaderWord(word)
  if (!normalized || isAllCapsReaderToken(normalized)) return null
  return BASIC_FUNCTION_GLOSSES[normalized.toLowerCase()] || null
}

function compactDictionaryGloss(translation: string): string | null {
  const firstLine = translation.split(/\\n|\n/)[0]?.trim()
  if (!firstLine) return null
  const cleaned = firstLine.replace(/^[a-z]+\.\s*/i, '').trim()
  if (!cleaned) return null
  const firstMeaning = cleaned.split(/[,，、;；]/)[0]?.trim()
  if (!firstMeaning) return null
  return firstMeaning.length > 12 ? `${firstMeaning.slice(0, 12)}…` : firstMeaning
}

export function resolveReaderAnnotation(
  word: string,
  translation: string | null | undefined,
  options: ReaderAnnotationOptions = {},
): string | null {
  if (isAllCapsReaderToken(word)) return null
  const basicGloss = getBasicFunctionWordGloss(word)
  if (basicGloss) return options.includeBasicFunctionWords ? basicGloss : null
  return translation ? compactDictionaryGloss(translation) : null
}
