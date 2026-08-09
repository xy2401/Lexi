import { createDbWorker, type WorkerHttpvfs } from 'sql.js-httpvfs'
import sqliteWorkerUrl from 'sql.js-httpvfs/dist/sqlite.worker.js?url'
import sqliteWasmUrl from 'sql.js-httpvfs/dist/sql-wasm.wasm?url'
import { getWordNetManifest } from './wordnet-manifest'

const MAIN_SHARD = 'entries-0.db'
const MAX_BYTES_PER_SESSION = 96 * 1024 * 1024

let workerPromise: Promise<WorkerHttpvfs> | null = null
let operationQueue: Promise<void> = Promise.resolve()

interface WordNetRemoteDb {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  exec(sql: string): Promise<unknown>
}

async function createWordNetWorker(): Promise<WorkerHttpvfs> {
  const manifest = await getWordNetManifest()
  const names = Object.keys(manifest.files).sort((a, b) => {
    if (a === MAIN_SHARD) return -1
    if (b === MAIN_SHARD) return 1
    return a.localeCompare(b)
  })
  if (names[0] !== MAIN_SHARD) throw new Error(`WordNet 主分片不存在：${MAIN_SHARD}`)

  const configs = names.map(name => ({
    from: 'inline' as const,
    virtualFilename: `/${name}`,
    config: {
      serverMode: 'full' as const,
      requestChunkSize: manifest.pageSize,
      url: manifest.files[name].url,
      cacheBust: manifest.version,
    },
  }))

  return createDbWorker(configs, sqliteWorkerUrl, sqliteWasmUrl, MAX_BYTES_PER_SESSION)
}

function getWorker(): Promise<WorkerHttpvfs> {
  if (!workerPromise) {
    workerPromise = createWordNetWorker().catch(error => {
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
  if (!/^(?:entries-[0a-z]|(?:noun|verb|adj|adv)\.[A-Za-z_]+|frames)\.db$/.test(name)) {
    throw new Error(`非法 WordNet 分片名：${name}`)
  }
}

export async function queryWordNetShard<T>(
  shardName: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  assertShardName(shardName)
  return enqueue(async () => {
    const manifest = await getWordNetManifest()
    if (!manifest.files[shardName]) throw new Error(`WordNet 分片不存在：${shardName}`)
    const worker = await getWorker()
    const remoteDb = worker.db as unknown as WordNetRemoteDb
    if (shardName === MAIN_SHARD) {
      return remoteDb.query<T>(sql.split('{db}').join('main'), params)
    }

    await remoteDb.exec(`ATTACH DATABASE '/${shardName}' AS target`)
    try {
      return await remoteDb.query<T>(sql.split('{db}').join('target'), params)
    } finally {
      await remoteDb.exec('DETACH DATABASE target')
    }
  })
}
