import initSqlJs, { type BindParams, type Database, type SqlJsStatic } from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let sqlPromise: Promise<SqlJsStatic> | null = null

function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: () => sqlWasmUrl })
  return sqlPromise!
}

export function queryAll<T>(database: Database, sql: string, params: unknown[] = []): T[] {
  const statement = database.prepare(sql)
  try {
    if (params.length) statement.bind(params as BindParams)
    const rows: T[] = []
    while (statement.step()) rows.push(statement.getAsObject() as T)
    return rows
  } finally {
    statement.free()
  }
}

export async function withRemoteDatabase<T>(
  url: string,
  version: string,
  expectedBytes: number,
  operation: (database: Database) => T | Promise<T>,
): Promise<T> {
  const response = await fetch(`${url}?v=${encodeURIComponent(version)}`)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('text/html')) throw new Error(`${url}: 收到 HTML fallback`)
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(`${url}: 文件大小不符，预期 ${expectedBytes}，实际 ${buffer.byteLength}`)
  }

  const SQL = await getSql()
  const database = new SQL.Database(new Uint8Array(buffer))
  try {
    return await operation(database)
  } finally {
    database.close()
  }
}
