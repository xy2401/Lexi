/** IndexedDB dictionary cache: Hot bootstrap rows plus on-demand full rows. */
import Dexie, { type Table } from 'dexie'
import initSqlJs from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { getDictionaryManifest } from './dictionary-manifest'

export interface WordEntry {
  word: string
  phonetic: string
  definition?: string
  translation: string
  pos?: string
  collins?: number
  oxford?: number
  tags: string
  bnc?: number
  frequency: number
  exchange: string
  detail?: string
  audio?: string
  cacheLevel: 'hot' | 'full'
}

interface DictionaryMeta {
  key: string
  value: string
}

class LexiDB extends Dexie {
  words!: Table<WordEntry, string>
  meta!: Table<DictionaryMeta, string>

  constructor() {
    super('lexi-dict')
    this.version(1).stores({
      words: 'word, frequency, tags',
    })
    this.version(2).stores({
      words: 'word, frequency, tags',
      meta: 'key',
    })
  }
}

export const db = new LexiDB()

export async function lookupLocal(word: string): Promise<WordEntry | undefined> {
  return db.words.get(word.toLowerCase())
}

export async function cacheWords(entries: WordEntry[]): Promise<void> {
  await db.words.bulkPut(entries)
}

export async function getWordCount(): Promise<number> {
  return db.words.count()
}

export async function getLocalWordsByLetter(letter: string): Promise<WordEntry[]> {
  return db.words
    .where('word')
    .between(letter, letter + '\uffff', true, true)
    .toArray()
}

/**
 * Load all 27 Hot shards from the complete dictionary source. The manifest
 * version makes the reconstructible IndexedDB cache deterministic across
 * dictionary releases.
 */
export async function loadHotData(onProgress?: (percent: number) => void): Promise<number> {
  const manifest = await getDictionaryManifest()
  const cachedVersion = await db.meta.get('dictionaryVersion')
  const cachedCount = await db.words.count()
  if (cachedVersion?.value === manifest.version && cachedCount > 0) {
    onProgress?.(100)
    return cachedCount
  }

  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl })
  const shards = Object.entries(manifest.hot)
  let completed = 0

  const shardResults = await Promise.all(shards.map(async ([name, meta]) => {
    try {
      const response = await fetch(`${meta.url}?v=${encodeURIComponent(manifest.version)}`)
      if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('text/html')) throw new Error(`${name}: 收到 HTML fallback`)

      const shardDb = new SQL.Database(new Uint8Array(await response.arrayBuffer()))
      const statement = shardDb.prepare('SELECT * FROM words')
      const entries: WordEntry[] = []
      while (statement.step()) {
        const row = statement.getAsObject() as Record<string, unknown>
        entries.push({
          word: String(row.word || ''),
          phonetic: String(row.phonetic || ''),
          translation: String(row.translation || ''),
          frequency: Number(row.frequency || 0),
          tags: String(row.tags || ''),
          exchange: String(row.exchange || ''),
          cacheLevel: 'hot',
        })
      }
      statement.free()
      shardDb.close()
      return entries
    } finally {
      completed++
      onProgress?.(Math.round(completed / shards.length * 100))
    }
  }))

  const hotEntries = shardResults.flat()
  await db.transaction('rw', db.words, db.meta, async () => {
    await db.words.clear()
    await db.words.bulkPut(hotEntries)
    await db.meta.put({ key: 'dictionaryVersion', value: manifest.version })
  })

  onProgress?.(100)
  return hotEntries.length
}
