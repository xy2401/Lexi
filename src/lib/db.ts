/** IndexedDB dictionary cache: Hot bootstrap rows plus on-demand full rows. */
import Dexie, { type Table } from 'dexie'
import { getDictionaryManifest } from './dictionary-manifest'
import { fetchJsonLines } from './jsonl-loader'
import type {
  CachedWordNetLemma,
  CachedWordNetSynset,
  WordNetFrame,
  WordNetLemmaIndexEntry,
} from './wordnet-types'

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
  shard?: string
}

type HotWordRecord = Pick<
  WordEntry,
  'word' | 'phonetic' | 'translation' | 'frequency' | 'tags' | 'exchange'
>

interface DictionaryMeta {
  key: string
  value: string
}

export interface ImportedShard {
  id: string
  dictionary: 'main' | 'wordnet-index' | 'wordnet-entry' | 'wordnet-synset' | 'wordnet-frame'
  version: string
  importedAt: number
}

class LexiDB extends Dexie {
  words!: Table<WordEntry, string>
  meta!: Table<DictionaryMeta, string>
  shards!: Table<ImportedShard, string>
  wordnetIndex!: Table<WordNetLemmaIndexEntry, string>
  wordnetLemmas!: Table<CachedWordNetLemma, string>
  wordnetSynsets!: Table<CachedWordNetSynset, string>
  wordnetFrames!: Table<WordNetFrame, string>

  constructor() {
    super('lexi-dict')
    this.version(1).stores({
      words: 'word, frequency, tags',
    })
    this.version(2).stores({
      words: 'word, frequency, tags',
      meta: 'key',
    })
    this.version(3).stores({
      words: 'word, frequency, tags, shard',
      meta: 'key',
      shards: 'id, dictionary, version',
      wordnetIndex: 'key, lemma, entryShard',
      wordnetLemmas: 'key, shard',
      wordnetSynsets: 'id, shard, pos',
      wordnetFrames: 'id',
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

export async function isShardImported(id: string, version: string): Promise<boolean> {
  const record = await db.shards.get(id)
  return record?.version === version
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

  const shards = Object.entries(manifest.hot)
  let completed = 0

  const shardResults = await Promise.all(shards.map(async ([name, meta]) => {
    try {
      const records = await fetchJsonLines<HotWordRecord>(meta.url, manifest.version, meta.bytes)
      return records.map(record => ({ ...record, cacheLevel: 'hot' as const }))
    } finally {
      completed++
      onProgress?.(Math.round(completed / shards.length * 100))
    }
  }))

  const hotEntries = shardResults.flat()
  await db.transaction('rw', db.words, db.meta, db.shards, async () => {
    await db.words.clear()
    await db.shards.where('dictionary').equals('main').delete()
    await db.words.bulkPut(hotEntries)
    await db.meta.put({ key: 'dictionaryVersion', value: manifest.version })
  })

  onProgress?.(100)
  return hotEntries.length
}
