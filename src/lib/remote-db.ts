/**
 * 远端分片数据库查询模块
 * 
 * 按需 fetch 远端 .db 分片文件，使用 sql.js 查询
 * 查询结果由调用方写入 IndexedDB 永久保存，本模块不做任何缓存
 */
// sql.js 使用动态导入解决 ESM 兼容性问题
type SqlJsDatabase = any

// ========== 两字前缀归仓算法（前端版） ==========
export function getDbName(word: string): string {
  const cleanWord = word.toLowerCase().trim()
  if (cleanWord.length < 2) return `${cleanWord}_.db`

  const first = cleanWord[0]
  const second = cleanWord[1]
  const isLetter = (ch: string) => /^[a-z]$/.test(ch)

  if (!isLetter(first)) return '__.db'
  if (isLetter(second)) return `${first}${second}.db`
  return `${first}_.db`
}

// ========== 单字归仓算法（热词分片） ==========
export function getHotDbName(word: string): string {
  const first = word[0]?.toLowerCase()
  if (first && /^[a-z]$/.test(first)) return `${first}.db`
  return '_.db'
}

// ========== sql.js 初始化 ==========
let sqlPromise: Promise<any> | null = null

async function getSqlJs() {
  if (!sqlPromise) {
    // 动态导入解决 sql.js ESM 兼容性问题
    const sqlModule: any = await import('sql.js')
    // Vite CJS 互操作可能多层包裹 default
    const initFn = sqlModule.default?.default || sqlModule.default || sqlModule.initSqlJs || sqlModule
    if (typeof initFn !== 'function') {
      throw new Error(`[remote-db] sql.js 加载失败，导出类型: ${typeof initFn}, keys: ${Object.keys(sqlModule).join(',')}`)
    }
    sqlPromise = initFn({
      locateFile: (file: string) => `/wasm/${file}`,
    })
  }
  return sqlPromise
}

// ========== 核心查询 ==========

export interface EcdictResult {
  word: string
  frequency: number
  tags: string
  exchange: string
  phonetic: string
  translation: string
}

export interface StardictResult {
  word: string
  html_content: string
}

/**
 * 加载分片数据库（用完即关，不缓存）
 */
async function getShardDb(track: 'ecdict' | 'stardict' | 'hot', dbName: string): Promise<SqlJsDatabase> {
  const url = `/dicts/${track}/${dbName}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch shard: ${url} (${response.status})`)
  }

  // 检测 SPA fallback 返回 HTML 的情况（分片文件缺失时 Vite 会返回 index.html）
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    throw new Error(`Shard not found (got HTML fallback): ${url}`)
  }

  const buffer = await response.arrayBuffer()
  const SQL = await getSqlJs()
  return new SQL.Database(new Uint8Array(buffer))
}

/**
 * 查询远端热词分片（单字分片，体积小、加载快）
 */
export async function queryHot(word: string): Promise<EcdictResult | null> {
  const dbName = getHotDbName(word)
  try {
    const db = await getShardDb('hot', dbName)
    const stmt = db.prepare('SELECT * FROM words WHERE word = ?')
    stmt.bind([word.toLowerCase()])

    if (stmt.step()) {
      const row = stmt.getAsObject() as any
      stmt.free()
      db.close()
      return {
        word: row.word,
        frequency: row.frequency || 0,
        tags: row.tags || '',
        exchange: row.exchange || '',
        phonetic: row.phonetic || '',
        translation: row.translation || '',
      }
    }
    stmt.free()
    db.close()
    return null
  } catch (e) {
    console.warn(`[remote-db] queryHot failed for "${word}":`, e)
    return null
  }
}

/**
 * 查询远端 ECDICT 分片
 */
export async function queryEcdict(word: string): Promise<EcdictResult | null> {
  const dbName = getDbName(word)
  try {
    const db = await getShardDb('ecdict', dbName)
    const stmt = db.prepare('SELECT * FROM words WHERE word = ?')
    stmt.bind([word.toLowerCase()])

    if (stmt.step()) {
      const row = stmt.getAsObject() as any
      stmt.free()
      db.close()
      return {
        word: row.word,
        frequency: row.frequency || 0,
        tags: row.tags || '',
        exchange: row.exchange || '',
        phonetic: row.phonetic || '',
        translation: row.translation || '',
      }
    }
    stmt.free()
    db.close()
    return null
  } catch (e) {
    console.warn(`[remote-db] queryEcdict failed for "${word}":`, e)
    return null
  }
}

/**
 * 查询远端 Stardict 分片
 */
export async function queryStardict(word: string): Promise<StardictResult | null> {
  const dbName = getDbName(word)
  try {
    const db = await getShardDb('stardict', dbName)
    const stmt = db.prepare('SELECT * FROM words WHERE word = ?')
    stmt.bind([word.toLowerCase()])

    if (stmt.step()) {
      const row = stmt.getAsObject() as any
      stmt.free()
      db.close()
      return {
        word: row.word,
        html_content: row.html_content || '',
      }
    }
    stmt.free()
    db.close()
    return null
  } catch (e) {
    console.warn(`[remote-db] queryStardict failed for "${word}":`, e)
    return null
  }
}

/**
 * 获取分片内所有词条（Explorer 浏览用）
 */
export async function listShardWords(
  track: 'ecdict' | 'stardict' | 'hot',
  dbName: string,
  limit = -1,
  offset = 0
): Promise<any[]> {
  try {
    const db = await getShardDb(track, dbName)
    // LIMIT -1 在 SQLite 中表示不限制，返回全部
    const stmt = db.prepare('SELECT * FROM words ORDER BY word LIMIT ? OFFSET ?')
    stmt.bind([limit, offset])

    const results: any[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    stmt.free()
    db.close()
    return results
  } catch (e) {
    console.warn(`[remote-db] listShardWords failed:`, e)
    return []
  }
}
