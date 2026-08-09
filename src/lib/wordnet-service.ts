import { db, isShardImported } from './db'
import { fetchJsonLines } from './jsonl-loader'
import { getWordNetManifest, type WordNetManifestFile } from './wordnet-manifest'
import type {
  CachedWordNetLemma,
  CachedWordNetSynset,
  WordNetEntryBundle,
  WordNetFrame,
  WordNetLemmaIndexEntry,
  WordNetSynsetGraph,
} from './wordnet-types'

export type {
  WordNetEntryBundle,
  WordNetFrame,
  WordNetSense,
  WordNetSenseRelation,
  WordNetSynsetGraph,
  WordNetSynsetRelation,
} from './wordnet-types'

type WordNetLemmaRecord = Omit<CachedWordNetLemma, 'shard'>
type WordNetSynsetRecord = Omit<CachedWordNetSynset, 'shard'>

const WORDNET_DICTIONARIES = [
  'wordnet-index',
  'wordnet-entry',
  'wordnet-synset',
  'wordnet-frame',
] as const

const shardLoads = new Map<string, Promise<void>>()
let versionPromise: Promise<void> | null = null

function routeKey(value: string): string {
  return value.trim().normalize('NFC').toLowerCase()
}

async function ensureWordNetVersion(): Promise<void> {
  if (versionPromise) return versionPromise
  versionPromise = (async () => {
    const manifest = await getWordNetManifest()
    const cached = await db.meta.get('wordnetVersion')
    if (cached?.value === manifest.version) return
    await db.transaction(
      'rw',
      [
        db.meta,
        db.shards,
        db.wordnetIndex,
        db.wordnetLemmas,
        db.wordnetSynsets,
        db.wordnetFrames,
      ],
      async () => {
        await db.wordnetIndex.clear()
        await db.wordnetLemmas.clear()
        await db.wordnetSynsets.clear()
        await db.wordnetFrames.clear()
        await db.shards.where('dictionary').anyOf([...WORDNET_DICTIONARIES]).delete()
        await db.meta.put({ key: 'wordnetVersion', value: manifest.version })
      },
    )
  })().catch(error => {
    versionPromise = null
    throw error
  })
  return versionPromise
}

function requireFile(
  file: string,
  kind: WordNetManifestFile['kind'],
  files: Record<string, WordNetManifestFile>,
) {
  const meta = files[file]
  if (!meta || meta.kind !== kind) throw new Error(`WordNet ${kind} 分片不存在：${file}`)
  return meta
}

async function importShardOnce(
  file: string,
  dictionary: typeof WORDNET_DICTIONARIES[number],
  importer: () => Promise<void>,
): Promise<void> {
  await ensureWordNetVersion()
  const manifest = await getWordNetManifest()
  const id = `${dictionary}:${file}`
  if (await isShardImported(id, manifest.version)) return
  const existing = shardLoads.get(id)
  if (existing) return existing
  const load = importer().finally(() => shardLoads.delete(id))
  shardLoads.set(id, load)
  return load
}

async function ensureLemmaIndex(): Promise<void> {
  return importShardOnce('index.jsonl', 'wordnet-index', async () => {
    const manifest = await getWordNetManifest()
    const meta = requireFile('index.jsonl', 'index', manifest.files)
    const entries = await fetchJsonLines<WordNetLemmaIndexEntry>(
      meta.url,
      manifest.version,
      meta.bytes,
    )
    await db.transaction('rw', db.wordnetIndex, db.shards, async () => {
      await db.wordnetIndex.bulkPut(entries)
      await db.shards.put({
        id: 'wordnet-index:index.jsonl',
        dictionary: 'wordnet-index',
        version: manifest.version,
        importedAt: Date.now(),
      })
    })
  })
}

async function ensureEntryShard(file: string): Promise<void> {
  return importShardOnce(file, 'wordnet-entry', async () => {
    const manifest = await getWordNetManifest()
    const meta = requireFile(file, 'entries', manifest.files)
    const records = await fetchJsonLines<WordNetLemmaRecord>(meta.url, manifest.version, meta.bytes)
    const entries: CachedWordNetLemma[] = records.map(record => ({ ...record, shard: file }))
    await db.transaction('rw', db.wordnetLemmas, db.shards, async () => {
      await db.wordnetLemmas.bulkPut(entries)
      await db.shards.put({
        id: `wordnet-entry:${file}`,
        dictionary: 'wordnet-entry',
        version: manifest.version,
        importedAt: Date.now(),
      })
    })
  })
}

async function ensureSynsetShard(file: string): Promise<void> {
  return importShardOnce(file, 'wordnet-synset', async () => {
    const manifest = await getWordNetManifest()
    const meta = requireFile(file, 'synsets', manifest.files)
    const records = await fetchJsonLines<WordNetSynsetRecord>(meta.url, manifest.version, meta.bytes)
    const synsets: CachedWordNetSynset[] = records.map(record => ({ ...record, shard: file }))
    await db.transaction('rw', db.wordnetSynsets, db.shards, async () => {
      await db.wordnetSynsets.bulkPut(synsets)
      await db.shards.put({
        id: `wordnet-synset:${file}`,
        dictionary: 'wordnet-synset',
        version: manifest.version,
        importedAt: Date.now(),
      })
    })
  })
}

async function ensureFrames(): Promise<void> {
  return importShardOnce('frames.jsonl', 'wordnet-frame', async () => {
    const manifest = await getWordNetManifest()
    const meta = requireFile('frames.jsonl', 'frames', manifest.files)
    const frames = await fetchJsonLines<WordNetFrame>(meta.url, manifest.version, meta.bytes)
    await db.transaction('rw', db.wordnetFrames, db.shards, async () => {
      await db.wordnetFrames.bulkPut(frames)
      await db.shards.put({
        id: 'wordnet-frame:frames.jsonl',
        dictionary: 'wordnet-frame',
        version: manifest.version,
        importedAt: Date.now(),
      })
    })
  })
}

export async function hasWordNetLemma(rawLemma: string): Promise<boolean> {
  const key = routeKey(rawLemma)
  if (!key) return false
  await ensureLemmaIndex()
  return Boolean(await db.wordnetIndex.get(key))
}

export async function suggestWordNetLemmas(rawPrefix: string, limit = 8): Promise<string[]> {
  const prefix = routeKey(rawPrefix)
  if (!prefix) return []
  await ensureLemmaIndex()
  const safeLimit = Math.max(1, Math.min(12, Math.floor(limit)))
  const rows = await db.wordnetIndex
    .where('key')
    .between(prefix, `${prefix}\uffff`, true, true)
    .limit(safeLimit)
    .toArray()
  return rows.map(row => row.lemma)
}

export async function lookupWordNetLemma(rawLemma: string): Promise<WordNetEntryBundle[]> {
  const key = routeKey(rawLemma)
  if (!key) return []
  await ensureLemmaIndex()
  const index = await db.wordnetIndex.get(key)
  if (!index) return []
  const cached = await db.wordnetLemmas.get(key)
  if (cached) return cached.entries
  await ensureEntryShard(index.entryShard)
  return (await db.wordnetLemmas.get(key))?.entries || []
}

export async function loadWordNetSynset(
  shard: string,
  synsetId: string,
): Promise<WordNetSynsetGraph | null> {
  await ensureWordNetVersion()
  const cached = await db.wordnetSynsets.get(synsetId)
  if (cached) return cached
  await ensureSynsetShard(shard)
  return await db.wordnetSynsets.get(synsetId) || null
}

export async function loadWordNetFrames(frameIds: string[]): Promise<WordNetFrame[]> {
  const ids = [...new Set(frameIds.filter(Boolean))]
  if (!ids.length) return []
  await ensureFrames()
  const rows = await db.wordnetFrames.bulkGet(ids)
  return rows.filter((row): row is WordNetFrame => Boolean(row))
}
