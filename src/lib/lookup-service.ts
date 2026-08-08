/** Local Hot/full cache first, then the one complete semantic-sharded source. */
import { lookupLocal, cacheWords, type WordEntry } from './db'
import { restoreBase } from './morphology'
import { queryDictionaryWord, type DictionaryResult } from './remote-db'

export interface LookupResult {
  word: string
  source: 'local-hot' | 'local-full' | 'remote-main' | 'not-found'
  entry: WordEntry | null
}

function toFullEntry(row: DictionaryResult): WordEntry {
  return { ...row, cacheLevel: 'full' }
}

function candidatesFor(word: string): string[] {
  const lower = word.toLowerCase()
  return [...new Set([lower, restoreBase(lower)])]
}

export async function lookupWord(
  word: string,
  onHotFound?: (entry: WordEntry) => void,
): Promise<LookupResult> {
  const lower = word.toLowerCase()
  const candidates = candidatesFor(lower)
  let hotFallback: WordEntry | null = null

  for (const candidate of candidates) {
    const local = await lookupLocal(candidate)
    if (local?.cacheLevel === 'full') {
      return {
        word: lower,
        source: 'local-full',
        entry: local,
      }
    }
    if (local && !hotFallback) hotFallback = local
  }

  // 若存在本地 Hot 词条，第一时间回调 UI 渲染（实现 0ms 响应）
  if (hotFallback && onHotFound) {
    onHotFound(hotFallback)
  }

  // Hot 负责首屏及即时响应；后台异步从主词典补齐完整行。
  for (const candidate of candidates) {
    try {
      const remote = await queryDictionaryWord(candidate)
      if (!remote) continue
      const entry = toFullEntry(remote)
      await cacheWords([entry])
      return { word: lower, source: 'remote-main', entry }
    } catch (error) {
      console.warn(`[lookup-service] 主词典查询失败: "${candidate}"`, error)
    }
  }

  if (hotFallback) {
    return { word: lower, source: 'local-hot', entry: hotFallback }
  }
  return { word: lower, source: 'not-found', entry: null }
}
