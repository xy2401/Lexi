/** Load small, self-contained ECDICT Main shards and persist every row. */
import { db, isShardImported, type WordEntry } from './db'
import { getDictionaryManifest } from './dictionary-manifest'
import { queryAll, withRemoteDatabase } from './sqlite-loader'

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

const WORD_COLUMNS = `
  word, phonetic, definition, translation, pos, collins, oxford,
  tags, bnc, frequency, exchange, detail, audio
`

const shardLoads = new Map<string, Promise<WordEntry[]>>()

export function normalizeRouteKey(word: string): string {
  return word.trim().normalize('NFC').toLowerCase()
}

export function getShardName(word: string): string {
  const normalized = normalizeRouteKey(word)
  const first = normalized[0] || ''
  const second = normalized[1] || ''
  const isLetter = (character: string) => /^[a-z]$/.test(character)
  if (!isLetter(first)) return '__.db'
  if (!isLetter(second)) return `${first}_.db`
  return `${first}${second}.db`
}

function rowToEntry(row: Record<string, unknown>, shard: string): WordEntry {
  return {
    word: String(row.word || ''),
    phonetic: String(row.phonetic || ''),
    definition: String(row.definition || ''),
    translation: String(row.translation || ''),
    pos: String(row.pos || ''),
    collins: Number(row.collins || 0),
    oxford: Number(row.oxford || 0),
    tags: String(row.tags || ''),
    bnc: Number(row.bnc || 0),
    frequency: Number(row.frequency || 0),
    exchange: String(row.exchange || ''),
    detail: String(row.detail || ''),
    audio: String(row.audio || ''),
    cacheLevel: 'full',
    shard,
  }
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

async function resolveMainShard(word: string): Promise<string> {
  const manifest = await getDictionaryManifest()
  const routeName = getShardName(word)
  const routes = manifest.mainRoutes[routeName]
  if (!routes?.length) throw new Error(`词典路由不存在：${routeName}`)
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

  const load = withRemoteDatabase(meta.url, manifest.version, meta.bytes, database => {
    const rows = queryAll<Record<string, unknown>>(
      database,
      `SELECT ${WORD_COLUMNS} FROM words ORDER BY word COLLATE NOCASE, word`,
    )
    return rows.map(row => rowToEntry(row, file))
  }).then(async entries => {
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
  }).finally(() => {
    shardLoads.delete(file)
  })

  shardLoads.set(file, load)
  return load
}

export async function queryDictionaryWord(word: string): Promise<DictionaryResult | null> {
  const normalized = normalizeRouteKey(word)
  if (!normalized) return null
  const file = await resolveMainShard(normalized)
  const entries = await loadMainShard(file)
  const entry = entries.find(item => normalizeRouteKey(item.word) === normalized)
  return entry ? toResult(entry) : null
}

export async function queryDictionaryWords(words: string[]): Promise<DictionaryResult[]> {
  const normalizedWords = [...new Set(words.map(normalizeRouteKey).filter(Boolean))]
  const groups = new Map<string, string[]>()
  for (const word of normalizedWords) {
    const file = await resolveMainShard(word)
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
