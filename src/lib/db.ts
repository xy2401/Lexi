/**
 * Dexie.js 本地数据库模块
 * 管理 IndexedDB 中的词典数据（热数据 + 渐进缓存）
 */
import Dexie, { type Table } from 'dexie'

export interface WordEntry {
  word: string
  phonetic: string
  frequency: number
  tags: string
  exchange: string
  translation: string
}

class LexiDB extends Dexie {
  words!: Table<WordEntry, string>

  constructor() {
    super('lexi-dict')
    this.version(1).stores({
      words: 'word, frequency, tags',
    })
  }
}

export const db = new LexiDB()

/**
 * 本地查词
 */
export async function lookupLocal(word: string): Promise<WordEntry | undefined> {
  return db.words.get(word.toLowerCase())
}

/**
 * 批量写入词条（渐进缓存用）
 */
export async function cacheWords(entries: WordEntry[]): Promise<void> {
  await db.words.bulkPut(entries)
}

/**
 * 获取已缓存词条数
 */
export async function getWordCount(): Promise<number> {
  return db.words.count()
}

/**
 * 按首字母查询本地词条（本地浏览用，无需二级前缀）
 */
export async function getLocalWordsByLetter(letter: string): Promise<WordEntry[]> {
  return db.words
    .where('word')
    .between(letter, letter + '\uffff', true, true)
    .toArray()
}

/**
 * 按分片名前缀查询本地词条（远端分片浏览时本地优先用）
 * dbName 格式如 "aa.db"、"a_.db"、"__.db"
 */
export async function getLocalWordsByShard(dbName: string): Promise<WordEntry[]> {
  // 提取前缀："aa.db" → "aa"，"a_.db" → "a"，"__.db" → 特殊处理
  const base = dbName.replace('.db', '')

  if (base === '__') {
    // 非字母开头：取所有 word 首字符非 a-z 的
    return db.words.filter(w => !/^[a-z]/i.test(w.word)).toArray()
  }

  if (base.endsWith('_')) {
    // 如 "a_" → 以 'a' 开头且第二个字符非字母（或只有一个字符）
    const first = base[0]
    return db.words
      .where('word')
      .between(first, first + '\uffff', true, true)
      .filter(w => w.word.length < 2 || !/^[a-z]$/i.test(w.word[1]))
      .toArray()
  }

  // 普通两字母前缀，如 "aa"
  return db.words
    .where('word')
    .between(base, base + '\uffff', true, true)
    .toArray()
}

/**
 * 从 hot-words.json 加载热数据到 IndexedDB
 * @param onProgress 进度回调 (0-100)
 */
export async function loadHotData(onProgress?: (percent: number) => void): Promise<number> {
  const count = await db.words.count()
  if (count > 0) {
    onProgress?.(100)
    return count
  }

  const response = await fetch('/hot-words.json')
  const data: WordEntry[] = await response.json()

  // 分批写入，每批 5000 条，避免阻塞 UI
  const BATCH = 5000
  for (let i = 0; i < data.length; i += BATCH) {
    const batch = data.slice(i, i + BATCH)
    await db.words.bulkPut(batch)
    onProgress?.(Math.round(((i + BATCH) / data.length) * 100))
  }

  return data.length
}
