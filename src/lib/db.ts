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
 * 从 hot 分片加载热数据到 IndexedDB
 * 并行 fetch 27 个单字分片 (a.db ~ z.db + _.db)
 * @param onProgress 进度回调 (0-100)
 */
export async function loadHotData(onProgress?: (percent: number) => void): Promise<number> {
  const count = await db.words.count()
  if (count > 0) {
    onProgress?.(100)
    return count
  }

  // 动态导入 sql.js
  const sqlModule: any = await import('sql.js')
  const initFn = sqlModule.default?.default || sqlModule.default || sqlModule.initSqlJs || sqlModule
  const SQL = await initFn({ locateFile: (file: string) => `/wasm/${file}` })

  // 生成所有分片名: a.db ~ z.db + _.db
  const shardNames: string[] = []
  for (let i = 97; i <= 122; i++) shardNames.push(`${String.fromCharCode(i)}.db`)
  shardNames.push('_.db')

  let loaded = 0
  const total = shardNames.length

  // 并行加载所有分片
  const results = await Promise.allSettled(
    shardNames.map(async (name) => {
      const resp = await fetch(`/dicts/hot/${name}`)
      if (!resp.ok) return []
      const buf = await resp.arrayBuffer()
      const shardDb = new SQL.Database(new Uint8Array(buf))
      const stmt = shardDb.prepare('SELECT * FROM words')
      const words: WordEntry[] = []
      while (stmt.step()) {
        const row = stmt.getAsObject() as any
        words.push({
          word: row.word,
          phonetic: row.phonetic || '',
          frequency: row.frequency || 0,
          tags: row.tags || '',
          exchange: row.exchange || '',
          translation: row.translation || '',
        })
      }
      stmt.free()
      shardDb.close()
      return words
    })
  )

  // 写入 IndexedDB
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      await db.words.bulkPut(result.value)
      loaded += result.value.length
    }
    onProgress?.(Math.round((++loaded / total) * 100))
  }

  onProgress?.(100)
  return db.words.count()
}
