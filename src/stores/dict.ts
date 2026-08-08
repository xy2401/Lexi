/**
 * 词典状态管理 (Pinia Store)
 */
import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { db, loadHotData, type WordEntry } from '../lib/db'
import { buildReverseIndex, restoreBase } from '../lib/morphology'

export const TAG_OPTIONS = [
  { id: 'zk', label: '中考 zk' },
  { id: 'gk', label: '高考 gk' },
  { id: 'cet4', label: '四级 CET-4' },
  { id: 'cet6', label: '六级 CET-6' },
  { id: 'ky', label: '考研 ky' },
  { id: 'ielts', label: '雅思 IELTS' },
  { id: 'toefl', label: '托福 TOEFL' },
  { id: 'gre', label: 'GRE' },
] as const

export type DictionaryTagId = typeof TAG_OPTIONS[number]['id']
export type TagFilterMode = 'neutral' | 'include' | 'exclude'
export type TagStates = Record<DictionaryTagId, TagFilterMode>

const TAG_LABELS = new Map<string, string>(
  TAG_OPTIONS.map(tag => [tag.id, tag.label]),
)

export function getDictionaryTagLabels(rawTags: string): string[] {
  const seen = new Set<string>()
  return (rawTags || '')
    .toLowerCase()
    .split(/[\s,]+/)
    .map(tag => tag.trim())
    .filter(tag => tag && !seen.has(tag) && Boolean(seen.add(tag)))
    .map(tag => TAG_LABELS.get(tag) || tag)
}

function createNeutralTagStates(): TagStates {
  return Object.fromEntries(
    TAG_OPTIONS.map(tag => [tag.id, 'neutral']),
  ) as TagStates
}

export const useDictStore = defineStore('dict', () => {
  const ready = ref(false)
  const wordCount = ref(0)
  const loadProgress = ref(0)
  const tagStates = reactive<TagStates>(createNeutralTagStates())
  const allTagsNeutral = computed(() => (
    TAG_OPTIONS.every(tag => tagStates[tag.id] === 'neutral')
  ))

  // 内存中的词频 Map（用于快速同步查询）
  const wordMap = ref(new Map<string, WordEntry>())
  async function init() {
    if (ready.value) return

    const count = await loadHotData(percent => { loadProgress.value = percent })
    const allWords = await db.words.toArray()
    const map = new Map<string, WordEntry>()
    for (const w of allWords) {
      map.set(w.word.toLowerCase(), w)
    }
    wordMap.value = map
    wordCount.value = count

    // 构建形态还原反向索引
    buildReverseIndex(allWords)

    ready.value = true
    loadProgress.value = 100
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
   * 根据当前标签状态决定是否标注
   */
  function getAnnotation(word: string): string | null {
    const entry = lookup(word)
    if (!entry) return null

    // 使用阅读器与词典共用的标签筛选规则
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
   * 默认 -> 选择 -> 排除 -> 默认。
   */
  function cycleTagState(tag: DictionaryTagId): void {
    const current = tagStates[tag]
    tagStates[tag] = current === 'neutral'
      ? 'include'
      : current === 'include'
        ? 'exclude'
        : 'neutral'
  }

  function resetTagFilters(): void {
    for (const tag of TAG_OPTIONS) tagStates[tag.id] = 'neutral'
  }

  /**
   * 选择标签取并集，排除标签拥有最高优先级。
   * 标签按独立 token 精确匹配，避免字符串子串误判。
   */
  function matchesTagFilter(rawTags: string): boolean {
    const wordTags = new Set(
      (rawTags || '')
        .toLowerCase()
        .split(/[\s,]+/)
        .map(tag => tag.trim())
        .filter(Boolean),
    )

    const included: DictionaryTagId[] = []
    for (const tag of TAG_OPTIONS) {
      const state = tagStates[tag.id]
      if (state === 'exclude' && wordTags.has(tag.id)) return false
      if (state === 'include') included.push(tag.id)
    }

    return included.length === 0 || included.some(tag => wordTags.has(tag))
  }

  function shouldAnnotate(entry: WordEntry): boolean {
    return matchesTagFilter(entry.tags)
  }

  return {
    ready,
    wordCount,
    loadProgress,
    tagStates,
    allTagsNeutral,
    init,
    lookup,
    getAnnotation,
    cycleTagState,
    resetTagFilters,
    matchesTagFilter,
    shouldAnnotate,
  }
})
