/** Load small, self-contained ECDICT Main shards and persist every row. */
import { db, isShardImported, type WordEntry } from './db'
import { getDictionaryManifest } from './dictionary-manifest'
import { fetchJsonLines } from './jsonl-loader'

export interface DictionaryResult {
  word: string
  phonetic: string
  definition: string
  translation: string
  pos: string
  collins: number
  oxford: number
  tags: string
  bnc: number
  frequency: number
  exchange: string
  detail: string
  audio: string
  shard?: string
}

type MainWordRecord = Omit<WordEntry, 'cacheLevel' | 'shard'>

const shardLoads = new Map<string, Promise<WordEntry[]>>()

export function normalizeRouteKey(word: string): string {
  return word.trim().normalize('NFC').toLowerCase()
}

export function getRouteName(word: string): string {
  const normalized = normalizeRouteKey(word)
  const first = normalized[0] || ''
  const second = normalized[1] || ''
  const isLetter = (character: string) => /^[a-z]$/.test(character)
  if (!isLetter(first)) return '__'
  if (!isLetter(second)) return `${first}_`
  return `${first}${second}`
}

function toResult(entry: WordEntry): DictionaryResult {
  return {
    word: entry.word,
    phonetic: entry.phonetic,
    definition: entry.definition || '',
    translation: entry.translation,
    pos: entry.pos || '',
    collins: entry.collins || 0,
    oxford: entry.oxford || 0,
    tags: entry.tags,
    bnc: entry.bnc || 0,
    frequency: entry.frequency,
    exchange: entry.exchange,
    detail: entry.detail || '',
    audio: entry.audio || '',
    shard: entry.shard,
  }
}

async function resolveMainShard(word: string): Promise<string | null> {
  const manifest = await getDictionaryManifest()
  const routeName = getRouteName(word)
  const routes = manifest.mainRoutes[routeName]
  if (!routes?.length) return null
  const key = normalizeRouteKey(word)

  let low = 0
  let high = routes.length - 1
  while (low < high) {
    const middle = (low + high) >>> 1
    if (routes[middle].lastWord < key) low = middle + 1
    else high = middle
  }
  return routes[low].file
}

async function loadMainShard(file: string): Promise<WordEntry[]> {
  const manifest = await getDictionaryManifest()
  const meta = manifest.main[file]
  if (!meta) throw new Error(`主词典逻辑分片不存在：${file}`)
  const shardId = `main:${file}`

  if (await isShardImported(shardId, manifest.version)) {
    const cached = await db.words.where('shard').equals(file).toArray()
    return cached.sort((a, b) => {
      const left = normalizeRouteKey(a.word)
      const right = normalizeRouteKey(b.word)
      return left < right ? -1 : left > right ? 1 : 0
    })
  }

  const existing = shardLoads.get(file)
  if (existing) return existing

  const load = fetchJsonLines<MainWordRecord>(meta.url, manifest.version, meta.bytes)
    .then(async records => {
      const entries: WordEntry[] = records.map(record => ({
        ...record,
        cacheLevel: 'full',
        shard: file,
      }))
      await db.transaction('rw', db.words, db.shards, async () => {
        await db.words.bulkPut(entries)
        await db.shards.put({
          id: shardId,
          dictionary: 'main',
          version: manifest.version,
          importedAt: Date.now(),
        })
      })
      return entries
    })
    .finally(() => {
      shardLoads.delete(file)
    })

  shardLoads.set(file, load)
  return load
}

export async function queryDictionaryWord(word: string): Promise<DictionaryResult | null> {
  const normalized = normalizeRouteKey(word)
  if (!normalized) return null
  const file = await resolveMainShard(normalized)
  if (!file) return null
  const entries = await loadMainShard(file)
  const entry = entries.find(item => normalizeRouteKey(item.word) === normalized)
  return entry ? toResult(entry) : null
}

export async function queryDictionaryWords(words: string[]): Promise<DictionaryResult[]> {
  const normalizedWords = [...new Set(words.map(normalizeRouteKey).filter(Boolean))]
  const groups = new Map<string, string[]>()
  for (const word of normalizedWords) {
    const file = await resolveMainShard(word)
    if (!file) continue
    groups.set(file, [...(groups.get(file) || []), word])
  }

  const results: DictionaryResult[] = []
  for (const [file, fileWords] of groups) {
    const wanted = new Set(fileWords)
    const entries = await loadMainShard(file)
    results.push(...entries.filter(entry => wanted.has(normalizeRouteKey(entry.word))).map(toResult))
  }
  return results
}

/** Browse one original two-character route across its ordered logical shards. */
export async function listDictionaryShard(
  routeName: string,
  limit = 500,
  offset = 0,
): Promise<DictionaryResult[]> {
  const manifest = await getDictionaryManifest()
  const routes = manifest.mainRoutes[routeName]
  if (!routes) throw new Error(`词典路由不存在：${routeName}`)

  let remainingOffset = Math.max(0, offset)
  const results: DictionaryResult[] = []
  for (const route of routes) {
    const meta = manifest.main[route.file]
    if (remainingOffset >= meta.rows) {
      remainingOffset -= meta.rows
      continue
    }
    const entries = await loadMainShard(route.file)
    const take = entries.slice(remainingOffset, remainingOffset + limit - results.length)
    results.push(...take.map(toResult))
    remainingOffset = 0
    if (results.length >= limit) break
  }
  return results
}
