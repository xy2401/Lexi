/**
 * 词典状态管理 (Pinia Store)
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, loadHotData, lookupLocal, getWordCount, type WordEntry } from '../lib/db'
import { buildReverseIndex, restoreBase } from '../lib/morphology'

// 标签过滤等级定义（从低到高）
export const DIFFICULTY_LEVELS = [
  { id: 'all', label: '全部标注', minFreq: 0 },
  { id: 'zk', label: '中考', minFreq: 0, tag: 'zk' },
  { id: 'gk', label: '高考', minFreq: 0, tag: 'gk' },
  { id: 'cet4', label: 'CET-4 四级', minFreq: 0, tag: 'cet4' },
  { id: 'cet6', label: 'CET-6 六级', minFreq: 0, tag: 'cet6' },
  { id: 'ky', label: '考研', minFreq: 0, tag: 'ky' },
  { id: 'ielts', label: 'IELTS 雅思', minFreq: 0, tag: 'ielts' },
  { id: 'toefl', label: 'TOEFL 托福', minFreq: 0, tag: 'toefl' },
  { id: 'gre', label: 'GRE', minFreq: 0, tag: 'gre' },
] as const

export type DifficultyId = typeof DIFFICULTY_LEVELS[number]['id']

// 标签等级对应的集合（包含该等级及以上）
const TAG_HIERARCHY: Record<string, string[]> = {
  zk: ['zk', 'gk', 'cet4', 'cet6', 'ky', 'ielts', 'toefl', 'gre'],
  gk: ['gk', 'cet4', 'cet6', 'ky', 'ielts', 'toefl', 'gre'],
  cet4: ['cet4', 'cet6', 'ky', 'ielts', 'toefl', 'gre'],
  cet6: ['cet6', 'ky', 'ielts', 'toefl', 'gre'],
  ky: ['ky', 'ielts', 'toefl', 'gre'],
  ielts: ['ielts', 'toefl', 'gre'],
  toefl: ['toefl', 'gre'],
  gre: ['gre'],
}

export const useDictStore = defineStore('dict', () => {
  const ready = ref(false)
  const wordCount = ref(0)
  const difficultyLevel = ref<DifficultyId>('all')
  const loadProgress = ref(0)

  // 内存中的词频 Map（用于快速同步查询）
  const wordMap = ref(new Map<string, WordEntry>())

  async function init() {
    if (ready.value) return

    const count = await loadHotData((p) => { loadProgress.value = p })
    wordCount.value = count

    // 加载所有热数据到内存 Map 以支持同步查询
    const allWords = await db.words.toArray()
    const map = new Map<string, WordEntry>()
    for (const w of allWords) {
      map.set(w.word.toLowerCase(), w)
    }
    wordMap.value = map

    // 构建形态还原反向索引
    buildReverseIndex(allWords)

    ready.value = true
  }

  /**
   * 同步查词（从内存 Map）
   * 支持形态还原：先查原词，未命中则还原后再查
   */
  function lookup(word: string): WordEntry | null {
    const lower = word.toLowerCase()
    // 直接命中
    const direct = wordMap.value.get(lower)
    if (direct) return direct

    // 形态还原后再查
    const base = restoreBase(lower)
    if (base !== lower) {
      return wordMap.value.get(base) || null
    }
    return null
  }

  /**
   * 获取单词的简明释义（用于 <rt> 标注）
   * 根据当前难度过滤决定是否标注
   */
  function getAnnotation(word: string): string | null {
    const entry = lookup(word)
    if (!entry) return null

    // 难度过滤
    if (!shouldAnnotate(entry)) return null

    // 提取第一行翻译
    const firstLine = entry.translation.split('\\n')[0]?.trim()
    if (!firstLine) return null

    // 去掉词性前缀 (n. v. adj. adv. art. prep. conj. pron. int. num. det. vt. vi. aux. modal. abbr.)
    const cleaned = firstLine.replace(/^[a-z]+\.\s*/i, '').trim()
    if (!cleaned) return null

    // 取第一个义项（用 , 、 ; 分割）
    const firstMeaning = cleaned.split(/[,，、;；]/)[0]?.trim()
    if (!firstMeaning) return null

    // 截断过长
    return firstMeaning.length > 12 ? firstMeaning.slice(0, 12) + '…' : firstMeaning
  }

  /**
   * 根据当前难度等级判断是否应标注该词
   */
  function shouldAnnotate(entry: WordEntry): boolean {
    const level = difficultyLevel.value
    if (level === 'all') return true

    const tags = (entry.tags || '').toLowerCase()
    const requiredTags = TAG_HIERARCHY[level]
    if (!requiredTags) return true

    // 检查词条标签是否包含所需等级
    return requiredTags.some(t => tags.includes(t))
  }

  return {
    ready,
    wordCount,
    difficultyLevel,
    loadProgress,
    init,
    lookup,
    getAnnotation,
    shouldAnnotate,
  }
})
