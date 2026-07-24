/**
 * 异步双轨查词调度服务
 * 
 * 查词流程:
 * 1. 先查本地 IndexedDB (Dexie) -> 命中则直接返回
 * 2. 未命中 -> 请求 ecdict/{prefix}.db 获取词法数据
 * 3. 用户点击"查看详情" -> 按需请求 stardict/{prefix}.db
 * 4. 远端拉取成功的词条写回 IndexedDB（渐进式缓存）
 */
import { lookupLocal, cacheWords, type WordEntry } from './db'
import { restoreBase } from './morphology'
import { queryEcdict, queryStardict, type EcdictResult, type StardictResult } from './remote-db'

export interface LookupResult {
  word: string
  source: 'local' | 'remote-ecdict' | 'not-found'
  entry: WordEntry | null
}

export interface DetailResult {
  word: string
  htmlContent: string | null
  source: 'remote-stardict' | 'not-found'
}

/**
 * 主查词入口（轻量级，用于 Tooltip）
 */
export async function lookupWord(word: string): Promise<LookupResult> {
  const lower = word.toLowerCase()

  // 1. 本地直查
  const localDirect = await lookupLocal(lower)
  if (localDirect) {
    return { word: lower, source: 'local', entry: localDirect }
  }

  // 2. 形态还原后再查本地
  const base = restoreBase(lower)
  if (base !== lower) {
    const localBase = await lookupLocal(base)
    if (localBase) {
      return { word: lower, source: 'local', entry: localBase }
    }
  }

  // 3. 远端 ECDICT 查询
  const remoteResult = await queryEcdict(lower)
  if (remoteResult) {
    const entry: WordEntry = {
      word: remoteResult.word,
      phonetic: remoteResult.phonetic,
      frequency: remoteResult.frequency,
      tags: remoteResult.tags,
      exchange: remoteResult.exchange,
      translation: remoteResult.translation,
    }

    // 渐进式缓存：写回 IndexedDB
    cacheWords([entry]).catch(() => {})

    return { word: lower, source: 'remote-ecdict', entry }
  }

  // 如果原词未命中，尝试用原型查远端
  if (base !== lower) {
    const remoteBase = await queryEcdict(base)
    if (remoteBase) {
      const entry: WordEntry = {
        word: remoteBase.word,
        phonetic: remoteBase.phonetic,
        frequency: remoteBase.frequency,
        tags: remoteBase.tags,
        exchange: remoteBase.exchange,
        translation: remoteBase.translation,
      }
      cacheWords([entry]).catch(() => {})
      return { word: lower, source: 'remote-ecdict', entry }
    }
  }

  return { word: lower, source: 'not-found', entry: null }
}

/**
 * 详情查询（重型，用于 Drawer）
 * 按需加载 Stardict 富文本
 */
export async function lookupDetail(word: string): Promise<DetailResult> {
  const lower = word.toLowerCase()

  const result = await queryStardict(lower)
  if (result) {
    return { word: lower, htmlContent: result.html_content, source: 'remote-stardict' }
  }

  // 尝试原型
  const base = restoreBase(lower)
  if (base !== lower) {
    const baseResult = await queryStardict(base)
    if (baseResult) {
      return { word: lower, htmlContent: baseResult.html_content, source: 'remote-stardict' }
    }
  }

  return { word: lower, htmlContent: null, source: 'not-found' }
}
