/** Access the one complete dictionary through two-character semantic shards. */
import { queryDictionaryShard } from './http-vfs'

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
}

const WORD_COLUMNS = `
  word, phonetic, definition, translation, pos, collins, oxford,
  tags, bnc, frequency, exchange, detail, audio
`

export function getShardName(word: string): string {
  const normalized = word.toLowerCase().trim()
  const first = normalized[0] || ''
  const second = normalized[1] || ''
  const isLetter = (character: string) => /^[a-z]$/.test(character)

  if (!isLetter(first)) return '__.db'
  if (!isLetter(second)) return `${first}_.db`
  return `${first}${second}.db`
}

export async function queryDictionaryWord(word: string): Promise<DictionaryResult | null> {
  const normalized = word.toLowerCase().trim()
  if (!normalized) return null

  const rows = await queryDictionaryShard<DictionaryResult>(
    getShardName(normalized),
    `SELECT ${WORD_COLUMNS} FROM {words} WHERE word = ?`,
    [normalized],
  )
  return rows[0] || null
}

/** Query a unit word pool with one SELECT per semantic shard. */
export async function queryDictionaryWords(words: string[]): Promise<DictionaryResult[]> {
  const normalizedWords = [...new Set(words.map(word => word.toLowerCase().trim()).filter(Boolean))]
  const groups = new Map<string, string[]>()
  for (const word of normalizedWords) {
    const shard = getShardName(word)
    groups.set(shard, [...(groups.get(shard) || []), word])
  }

  const results: DictionaryResult[] = []
  for (const [shard, shardWords] of groups) {
    const placeholders = shardWords.map(() => '?').join(', ')
    results.push(...await queryDictionaryShard<DictionaryResult>(
      shard,
      `SELECT ${WORD_COLUMNS} FROM {words} WHERE word IN (${placeholders})`,
      shardWords,
    ))
  }
  return results
}

export async function listDictionaryShard(
  shardName: string,
  limit = 500,
  offset = 0,
): Promise<DictionaryResult[]> {
  return queryDictionaryShard<DictionaryResult>(
    shardName,
    `SELECT ${WORD_COLUMNS} FROM {words} ORDER BY word LIMIT ? OFFSET ?`,
    [limit, offset],
  )
}
