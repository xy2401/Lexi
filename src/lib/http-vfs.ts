/**
 * One HTTP VFS worker for all two-character semantic dictionary shards.
 * Files remain semantically routed (aa.db, a_.db, __.db); HTTP Range reads
 * only the SQLite pages needed by each query.
 */
import { createDbWorker, type WorkerHttpvfs } from 'sql.js-httpvfs'
import sqliteWorkerUrl from 'sql.js-httpvfs/dist/sqlite.worker.js?url'
import sqliteWasmUrl from 'sql.js-httpvfs/dist/sql-wasm.wasm?url'
import { getDictionaryManifest } from './dictionary-manifest'

const MAIN_SHARD = '__.db'
const MAX_BYTES_PER_SESSION = 128 * 1024 * 1024

let workerPromise: Promise<WorkerHttpvfs> | null = null
let operationQueue: Promise<void> = Promise.resolve()

async function createDictionaryWorker(): Promise<WorkerHttpvfs> {
  const manifest = await getDictionaryManifest()
  const shardNames = Object.keys(manifest.main).sort((a, b) => {
    if (a === MAIN_SHARD) return -1
    if (b === MAIN_SHARD) return 1
    return a.localeCompare(b)
  })

  const configs = shardNames.map(name => ({
    from: 'inline' as const,
    virtualFilename: `/${name}`,
    config: {
      serverMode: 'full' as const,
      requestChunkSize: manifest.pageSize,
      url: manifest.main[name].url,
      cacheBust: manifest.version,
    },
  }))

  return createDbWorker(configs, sqliteWorkerUrl, sqliteWasmUrl, MAX_BYTES_PER_SESSION)
}

function getWorker(): Promise<WorkerHttpvfs> {
  if (!workerPromise) {
    workerPromise = createDictionaryWorker().catch(error => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation)
  operationQueue = result.then(() => undefined, () => undefined)
  return result
}

function assertShardName(name: string): void {
  if (!/^(?:[a-z](?:[a-z]|_)|__)\.db$/.test(name)) {
    throw new Error(`非法词典分片名: ${name}`)
  }
}

/**
 * Run a query against one semantic shard. SQL must use `{words}` as its table
 * placeholder; this module replaces it with the main or attached schema.
 */
export async function queryDictionaryShard<T>(
  shardName: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  assertShardName(shardName)

  return enqueue(async () => {
    const manifest = await getDictionaryManifest()
    if (!manifest.main[shardName]) throw new Error(`词典分片不存在: ${shardName}`)

    const worker = await getWorker()
    if (shardName === MAIN_SHARD) {
      return worker.db.query<T>(sql.replaceAll('{words}', 'words'), params)
    }

    const filename = `/${shardName}`
    await worker.db.exec(`ATTACH DATABASE '${filename}' AS target`)
    try {
      return await worker.db.query<T>(sql.replaceAll('{words}', 'target.words'), params)
    } finally {
      await worker.db.exec('DETACH DATABASE target')
    }
  })
}

export async function getDictionaryShardStats(shardName: string) {
  assertShardName(shardName)
  const worker = await getWorker()
  return worker.worker.getStats(`/${shardName}`)
}
