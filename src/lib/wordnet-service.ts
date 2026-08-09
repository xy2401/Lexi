import { db, isShardImported } from './db'
import { getWordNetManifest, type WordNetManifestFile } from './wordnet-manifest'
import { queryAll, withRemoteDatabase } from './sqlite-loader'
import type {
  CachedWordNetLemma,
  CachedWordNetSynset,
  WordNetEntryBundle,
  WordNetFrame,
  WordNetLemmaIndexEntry,
  WordNetSenseRelation,
  WordNetSynsetGraph,
  WordNetSynsetRelation,
} from './wordnet-types'

export type {
  WordNetEntryBundle,
  WordNetFrame,
  WordNetSense,
  WordNetSenseRelation,
  WordNetSynsetGraph,
  WordNetSynsetRelation,
} from './wordnet-types'

interface EntryRow {
  lemma: string
  pos: string
  pronunciations_json: string
  forms_json: string
}

interface SenseRow {
  sense_id: string
  lemma: string
  pos: string
  sense_order: number
  synset_id: string
  synset_shard: string
  synset_label: string
  synset_gloss: string
  adj_position: string
  subcat_json: string
  sent_json: string
}

interface SenseRelationRow {
  source_sense_id: string
  relation_type: string
  target_sense_id: string
  target_shard: string
  target_lemma: string
  target_pos: string
  inferred: number
}

interface SynsetRow {
  synset_id: string
  pos: string
  semantic_category: string
  definitions_json: string
  examples_json: string
  members_json: string
  ili: string
  wikidata: string
  source_json: string
}

interface SynsetRelationRow {
  source_synset_id: string
  relation_type: string
  target_synset_id: string
  target_shard: string
  target_pos: string
  target_label: string
  target_gloss: string
  inferred: number
}

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

function parseArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as T[] : parsed == null ? [] : [parsed as T]
  } catch {
    return []
  }
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

function requireFile(file: string, kind: WordNetManifestFile['kind'], files: Record<string, WordNetManifestFile>) {
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
  return importShardOnce('index.db', 'wordnet-index', async () => {
    const manifest = await getWordNetManifest()
    const meta = requireFile('index.db', 'index', manifest.files)
    const rows = await withRemoteDatabase(meta.url, manifest.version, meta.bytes, database => (
      queryAll<{ lemma_key: string; lemma: string; entry_shard: string }>(database, `
        SELECT lemma_key, lemma, entry_shard
        FROM wordnet_lemma_index
        ORDER BY lemma_key
      `)
    ))
    const entries: WordNetLemmaIndexEntry[] = rows.map(row => ({
      key: row.lemma_key,
      lemma: row.lemma,
      entryShard: row.entry_shard,
    }))
    await db.transaction('rw', db.wordnetIndex, db.shards, async () => {
      await db.wordnetIndex.bulkPut(entries)
      await db.shards.put({
        id: 'wordnet-index:index.db',
        dictionary: 'wordnet-index',
        version: manifest.version,
        importedAt: Date.now(),
      })
    })
  })
}

function materializeEntryShard(
  shard: string,
  entryRows: EntryRow[],
  senseRows: SenseRow[],
  relationRows: SenseRelationRow[],
): CachedWordNetLemma[] {
  const relationsBySense = new Map<string, WordNetSenseRelation[]>()
  for (const row of relationRows) {
    const relations = relationsBySense.get(row.source_sense_id) || []
    relations.push({
      type: row.relation_type,
      targetSenseId: row.target_sense_id,
      targetShard: row.target_shard,
      targetLemma: row.target_lemma,
      targetPos: row.target_pos,
      inferred: Boolean(row.inferred),
    })
    relationsBySense.set(row.source_sense_id, relations)
  }

  const sensesByEntry = new Map<string, SenseRow[]>()
  for (const sense of senseRows) {
    const key = `${routeKey(sense.lemma)}\u0000${sense.pos}`
    sensesByEntry.set(key, [...(sensesByEntry.get(key) || []), sense])
  }

  const bundles = new Map<string, WordNetEntryBundle[]>()
  for (const entry of entryRows) {
    const key = routeKey(entry.lemma)
    const entrySenses = sensesByEntry.get(`${key}\u0000${entry.pos}`) || []
    const bundle: WordNetEntryBundle = {
      lemma: entry.lemma,
      pos: entry.pos,
      pronunciations: parseArray(entry.pronunciations_json),
      forms: parseArray(entry.forms_json),
      senses: entrySenses.map(sense => ({
        id: sense.sense_id,
        lemma: sense.lemma,
        pos: sense.pos,
        order: sense.sense_order,
        synsetId: sense.synset_id,
        synsetShard: sense.synset_shard,
        synsetLabel: sense.synset_label,
        synsetGloss: sense.synset_gloss,
        adjectivePosition: sense.adj_position,
        subcategories: parseArray<string>(sense.subcat_json),
        sentences: parseArray<string>(sense.sent_json),
        relations: relationsBySense.get(sense.sense_id) || [],
      })),
    }
    bundles.set(key, [...(bundles.get(key) || []), bundle])
  }
  return [...bundles].map(([key, entries]) => ({ key, shard, entries }))
}

async function ensureEntryShard(file: string): Promise<void> {
  return importShardOnce(file, 'wordnet-entry', async () => {
    const manifest = await getWordNetManifest()
    const meta = requireFile(file, 'entries', manifest.files)
    const cached = await withRemoteDatabase(meta.url, manifest.version, meta.bytes, database => {
      const entries = queryAll<EntryRow>(database, `
        SELECT lemma, pos, pronunciations_json, forms_json
        FROM wordnet_entries ORDER BY lemma COLLATE NOCASE, lemma, pos
      `)
      const senses = queryAll<SenseRow>(database, `
        SELECT sense_id, lemma, pos, sense_order, synset_id, synset_shard,
               synset_label, synset_gloss, adj_position, subcat_json, sent_json
        FROM wordnet_senses ORDER BY lemma COLLATE NOCASE, lemma, pos, sense_order
      `)
      const relations = queryAll<SenseRelationRow>(database, `
        SELECT source_sense_id, relation_type, target_sense_id, target_shard,
               target_lemma, target_pos, inferred
        FROM wordnet_sense_relations
        ORDER BY source_sense_id, relation_type, target_lemma
      `)
      return materializeEntryShard(file, entries, senses, relations)
    })
    await db.transaction('rw', db.wordnetLemmas, db.shards, async () => {
      await db.wordnetLemmas.bulkPut(cached)
      await db.shards.put({
        id: `wordnet-entry:${file}`,
        dictionary: 'wordnet-entry',
        version: manifest.version,
        importedAt: Date.now(),
      })
    })
  })
}

function materializeSynsetShard(
  shard: string,
  synsets: SynsetRow[],
  relationRows: SynsetRelationRow[],
): CachedWordNetSynset[] {
  const relationsBySynset = new Map<string, WordNetSynsetRelation[]>()
  for (const row of relationRows) {
    const relations = relationsBySynset.get(row.source_synset_id) || []
    relations.push({
      type: row.relation_type,
      targetSynsetId: row.target_synset_id,
      targetShard: row.target_shard,
      targetPos: row.target_pos,
      targetLabel: row.target_label,
      targetGloss: row.target_gloss,
      inferred: Boolean(row.inferred),
    })
    relationsBySynset.set(row.source_synset_id, relations)
  }
  return synsets.map(row => ({
    id: row.synset_id,
    shard,
    pos: row.pos,
    semanticCategory: row.semantic_category,
    definitions: parseArray<string>(row.definitions_json),
    examples: parseArray<string>(row.examples_json),
    members: parseArray<string>(row.members_json),
    ili: row.ili,
    wikidata: row.wikidata,
    sources: parseArray(row.source_json),
    relations: relationsBySynset.get(row.synset_id) || [],
  }))
}

async function ensureSynsetShard(file: string): Promise<void> {
  return importShardOnce(file, 'wordnet-synset', async () => {
    const manifest = await getWordNetManifest()
    const meta = requireFile(file, 'synsets', manifest.files)
    const cached = await withRemoteDatabase(meta.url, manifest.version, meta.bytes, database => {
      const synsets = queryAll<SynsetRow>(database, `
        SELECT synset_id, pos, semantic_category, definitions_json, examples_json,
               members_json, ili, wikidata, source_json
        FROM wordnet_synsets ORDER BY synset_id
      `)
      const relations = queryAll<SynsetRelationRow>(database, `
        SELECT source_synset_id, relation_type, target_synset_id, target_shard,
               target_pos, target_label, target_gloss, inferred
        FROM wordnet_synset_relations
        ORDER BY source_synset_id, relation_type, target_label
      `)
      return materializeSynsetShard(file, synsets, relations)
    })
    await db.transaction('rw', db.wordnetSynsets, db.shards, async () => {
      await db.wordnetSynsets.bulkPut(cached)
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
  return importShardOnce('frames.db', 'wordnet-frame', async () => {
    const manifest = await getWordNetManifest()
    const meta = requireFile('frames.db', 'frames', manifest.files)
    const rows = await withRemoteDatabase(meta.url, manifest.version, meta.bytes, database => (
      queryAll<{ frame_id: string; template: string }>(database, `
        SELECT frame_id, template FROM wordnet_frames ORDER BY frame_id
      `)
    ))
    const frames = rows.map(row => ({ id: row.frame_id, template: row.template }))
    await db.transaction('rw', db.wordnetFrames, db.shards, async () => {
      await db.wordnetFrames.bulkPut(frames)
      await db.shards.put({
        id: 'wordnet-frame:frames.db',
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
