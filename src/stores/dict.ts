/**
 * 词典状态管理 (Pinia Store)
 */
import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { db, loadHotData, type WordEntry } from '../lib/db'
import { buildReverseIndex, restoreBase } from '../lib/morphology'
import { resolveReaderEntryAnnotation, type ReaderAnnotationOptions } from '../lib/reader-annotations'
import type { ReaderAnnotationValue } from '../lib/tokenizer'
import { getProgressSetting, setProgressSetting } from '../lib/progress-db'
import {
  TAG_OPTIONS,
  createNeutralTagStates,
  lowestDictionaryTag,
  nextTagFilterMode,
  normalizeTagStates,
  parseDictionaryTagIds,
  type DictionaryTagId,
  type TagFilterMode,
  type TagStates,
} from '../lib/dictionary-tags'

export {
  TAG_OPTIONS,
  nextTagFilterMode,
  type DictionaryTagId,
  type TagFilterMode,
  type TagStates,
} from '../lib/dictionary-tags'

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

export function matchesDictionaryTagFilter(rawTags: string, states: TagStates): boolean {
  const wordTags = parseDictionaryTagIds(rawTags)
  const included: DictionaryTagId[] = []
  for (const tag of TAG_OPTIONS) {
    const state = states[tag.id]
    if (state === 'exclude' && wordTags.has(tag.id)) return false
    if (state === 'include') included.push(tag.id)
  }
  return included.length === 0 || included.some(tag => wordTags.has(tag))
}

export function getDictionaryTagAnnotation(rawTags: string, states: TagStates): string | null {
  const wordTags = parseDictionaryTagIds(rawTags)
  const annotationRequested = TAG_OPTIONS.some(tag => (
    states[tag.id] === 'annotate' && wordTags.has(tag.id)
  ))
  if (!annotationRequested) return null
  return lowestDictionaryTag(rawTags)
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

    const [count, savedTagStates] = await Promise.all([
      loadHotData(percent => { loadProgress.value = percent }),
      getProgressSetting<Partial<TagStates>>('dictionary.tagStates', {}),
    ])
    Object.assign(tagStates, normalizeTagStates(savedTagStates))
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
   * 根据阅读器独立的显示模式与标签范围生成 <rt> 内容。
   */
  function getAnnotation(word: string, options: ReaderAnnotationOptions = {}): ReaderAnnotationValue {
    const entry = lookup(word)
    return resolveReaderEntryAnnotation(word, entry, options)
  }

  /**
   * 默认 -> 仅看 -> 排除 -> 标注 -> 默认。
   */
  function cycleTagState(tag: DictionaryTagId): void {
    tagStates[tag] = nextTagFilterMode(tagStates[tag])
    void setProgressSetting('dictionary.tagStates', { ...tagStates })
  }

  function resetTagFilters(): void {
    for (const tag of TAG_OPTIONS) tagStates[tag.id] = 'neutral'
    void setProgressSetting('dictionary.tagStates', { ...tagStates })
  }

  /**
   * 选择标签取并集，排除标签拥有最高优先级。
   * 标签按独立 token 精确匹配，避免字符串子串误判。
   */
  function matchesTagFilter(rawTags: string): boolean {
    return matchesDictionaryTagFilter(rawTags, tagStates)
  }

  function shouldAnnotate(entry: WordEntry): boolean {
    return matchesTagFilter(entry.tags)
  }

  function getTagAnnotation(rawTags: string): string | null {
    return getDictionaryTagAnnotation(rawTags, tagStates)
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
    getTagAnnotation,
  }
})
