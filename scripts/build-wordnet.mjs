/** Build normalized, independently downloadable SQLite shards from OEWN 2025 JSON. */
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const WORDNET_VERSION = '2025'
const WORDNET_SOURCE_URL = 'https://en-word.net/static/english-wordnet-2025-json.zip'
const WORDNET_SOURCE_SHA256 = '7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = process.env.OEWN_SOURCE_DIR || join(ROOT, 'data', 'wordnet-raw', 'extracted')
const OUTPUT_ROOT = join(ROOT, 'public', 'dicts')
const OUTPUT_DIR = join(OUTPUT_ROOT, 'wordnet')
const STAGING_DIR = join(ROOT, 'data', 'wordnet-raw', '.sqlite-staging')
const MANIFEST_PATH = join(OUTPUT_ROOT, 'wordnet-manifest.json')
const PAGE_SIZE = 4096
const ENTRY_TARGET_SIZE = 256 * 1024
const ENTRY_SPLIT_SIZE = 208 * 1024
const SYNSET_TARGET_SIZE = 512 * 1024
const SYNSET_SPLIT_SIZE = 448 * 1024
const WARN_SIZE = 20 * 1024 * 1024
const MAX_SIZE = 25 * 1024 * 1024
const EXPECTED = { lexicalEntries: 135969, senses: 185129, synsets: 107519, sourceFiles: 73 }

const SENSE_RELATIONS = [
  'agent', 'also', 'antonym', 'body_part', 'by_means_of', 'derivation',
  'destination', 'event', 'exemplifies', 'instrument', 'location', 'material',
  'participle', 'pertainym', 'property', 'result', 'similar', 'state',
  'undergoer', 'uses', 'vehicle',
]
const SYNSET_RELATIONS = [
  'also', 'attribute', 'causes', 'domain_region', 'domain_topic', 'entails',
  'exemplifies', 'hypernym', 'hyponym', 'instance_hypernym', 'instance_hyponym',
  'mero_member', 'mero_part', 'mero_substance', 'holo_member', 'holo_part',
  'holo_substance', 'similar',
]
const INVERSE_RELATIONS = new Map([
  ['hypernym', 'hyponym'],
  ['instance_hypernym', 'instance_hyponym'],
  ['mero_member', 'holo_member'],
  ['mero_part', 'holo_part'],
  ['mero_substance', 'holo_substance'],
])

function log(message) {
  console.log(`[WordNet] ${message}`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function json(value, fallback = []) {
  return JSON.stringify(value ?? fallback)
}

function values(value) {
  if (Array.isArray(value)) return value
  return value == null ? [] : [value]
}

function scalar(value) {
  if (value == null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function digestFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function dbName(sourceName) {
  return sourceName.replace(/\.json$/i, '.db')
}

function configure(db) {
  db.pragma(`page_size = ${PAGE_SIZE}`)
  db.pragma('journal_mode = OFF')
  db.pragma('synchronous = OFF')
  db.pragma('temp_store = MEMORY')
}

function finishDatabase(db, path) {
  db.exec('VACUUM')
  const check = db.pragma('quick_check', { simple: true })
  if (check !== 'ok') throw new Error(`${path}: PRAGMA quick_check 失败：${check}`)
  db.close()
  const size = statSync(path).size
  if (size >= MAX_SIZE) throw new Error(`${path}: ${size} bytes，达到 Cloudflare Pages 25 MiB 限制`)
  if (size >= WARN_SIZE) log(`警告：${path} 为 ${(size / 1024 / 1024).toFixed(2)} MiB`)
  return size
}

if (!existsSync(SOURCE_DIR)) throw new Error(`WordNet 源目录不存在：${SOURCE_DIR}`)
const sourceNames = readdirSync(SOURCE_DIR).filter(name => name.endsWith('.json')).sort()
if (sourceNames.length !== EXPECTED.sourceFiles) {
  throw new Error(`预期 ${EXPECTED.sourceFiles} 个 JSON 文件，实际 ${sourceNames.length}`)
}

const entryFiles = sourceNames.filter(name => /^entries-[0a-z]\.json$/.test(name))
const synsetFiles = sourceNames.filter(name => /^(?:noun|verb|adj|adv)\..+\.json$/.test(name))
if (entryFiles.length !== 27 || synsetFiles.length !== 45 || !sourceNames.includes('frames.json')) {
  throw new Error(`源文件布局异常：entries=${entryFiles.length}, synsets=${synsetFiles.length}`)
}

log('第一遍扫描：建立 sense/synset 路由与目标摘要')
const senseInfo = new Map()
const synsetInfo = new Map()
const reverseByTarget = new Map()
let lexicalEntries = 0
let senses = 0
let synsets = 0

for (const sourceName of entryFiles) {
  const shard = dbName(sourceName)
  const entries = readJson(join(SOURCE_DIR, sourceName))
  for (const [lemma, poses] of Object.entries(entries)) {
    for (const [pos, entry] of Object.entries(poses)) {
      lexicalEntries++
      for (const sense of values(entry.sense)) {
        senses++
        if (!sense.id) throw new Error(`${sourceName}: ${lemma}/${pos} 缺少 sense id`)
        senseInfo.set(sense.id, { shard, lemma, pos })
      }
    }
  }
}

for (const sourceName of synsetFiles) {
  const shard = dbName(sourceName)
  const records = readJson(join(SOURCE_DIR, sourceName))
  for (const [synsetId, record] of Object.entries(records)) {
    synsets++
    const definitions = values(record.definition)
    const members = values(record.members)
    synsetInfo.set(synsetId, {
      shard,
      pos: scalar(record.partOfSpeech),
      label: scalar(members[0] || synsetId),
      gloss: scalar(definitions[0]),
    })
    for (const [forward, inverse] of INVERSE_RELATIONS) {
      for (const targetId of values(record[forward])) {
        const list = reverseByTarget.get(targetId) || []
        list.push({ sourceSynsetId: synsetId, relationType: inverse })
        reverseByTarget.set(targetId, list)
      }
    }
  }
}

for (const [key, expected] of Object.entries(EXPECTED)) {
  if (key === 'sourceFiles') continue
  const actual = { lexicalEntries, senses, synsets }[key]
  if (actual !== expected) throw new Error(`${key} 数量不符：预期 ${expected}，实际 ${actual}`)
}

rmSync(STAGING_DIR, { recursive: true, force: true })
rmSync(OUTPUT_DIR, { recursive: true, force: true })
mkdirSync(STAGING_DIR, { recursive: true })
mkdirSync(OUTPUT_DIR, { recursive: true })

const manifestFiles = {}
const stats = {
  lexicalEntries,
  senses,
  senseRelations: 0,
  synsets,
  synsetRelations: 0,
  inferredSynsetRelations: 0,
  frames: 0,
}

const ENTRY_SCHEMA = `
  CREATE TABLE wordnet_entries (
    lemma TEXT NOT NULL COLLATE BINARY,
    pos TEXT NOT NULL,
    pronunciations_json TEXT NOT NULL DEFAULT '[]',
    forms_json TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (lemma, pos)
  ) WITHOUT ROWID;
  CREATE INDEX wordnet_entries_lemma_nocase_idx
    ON wordnet_entries (lemma COLLATE NOCASE);
  CREATE TABLE wordnet_senses (
    sense_id TEXT PRIMARY KEY,
    lemma TEXT NOT NULL COLLATE BINARY,
    pos TEXT NOT NULL,
    sense_order INTEGER NOT NULL,
    synset_id TEXT NOT NULL,
    synset_shard TEXT NOT NULL,
    synset_label TEXT NOT NULL DEFAULT '',
    synset_gloss TEXT NOT NULL DEFAULT '',
    adj_position TEXT NOT NULL DEFAULT '',
    subcat_json TEXT NOT NULL DEFAULT '[]',
    sent_json TEXT NOT NULL DEFAULT '[]'
  ) WITHOUT ROWID;
  CREATE INDEX wordnet_senses_entry_idx
    ON wordnet_senses (lemma COLLATE NOCASE, pos, sense_order);
  CREATE INDEX wordnet_senses_synset_idx ON wordnet_senses (synset_id);
  CREATE TABLE wordnet_sense_relations (
    source_sense_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    target_sense_id TEXT NOT NULL,
    target_shard TEXT NOT NULL,
    target_lemma TEXT NOT NULL,
    target_pos TEXT NOT NULL,
    inferred INTEGER NOT NULL DEFAULT 0 CHECK (inferred IN (0, 1)),
    PRIMARY KEY (source_sense_id, relation_type, target_sense_id)
  ) WITHOUT ROWID;
  CREATE INDEX wordnet_sense_relations_target_idx
    ON wordnet_sense_relations (target_sense_id);
`

for (const sourceName of entryFiles) {
  const outputName = dbName(sourceName)
  const outputPath = join(STAGING_DIR, outputName)
  const db = new Database(outputPath)
  configure(db)
  db.exec(ENTRY_SCHEMA)
  const insertEntry = db.prepare(`INSERT INTO wordnet_entries
    (lemma, pos, pronunciations_json, forms_json) VALUES (?, ?, ?, ?)`)
  const insertSense = db.prepare(`INSERT INTO wordnet_senses
    (sense_id, lemma, pos, sense_order, synset_id, synset_shard, synset_label,
     synset_gloss, adj_position, subcat_json, sent_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const insertRelation = db.prepare(`INSERT INTO wordnet_sense_relations
    (source_sense_id, relation_type, target_sense_id, target_shard,
     target_lemma, target_pos, inferred) VALUES (?, ?, ?, ?, ?, ?, 0)`)
  let entryCount = 0
  let senseCount = 0
  let relationCount = 0
  const transaction = db.transaction(() => {
    const entries = readJson(join(SOURCE_DIR, sourceName))
    for (const [lemma, poses] of Object.entries(entries)) {
      for (const [pos, entry] of Object.entries(poses)) {
        insertEntry.run(lemma, pos, json(entry.pronunciation), json(entry.form))
        entryCount++
        values(entry.sense).forEach((sense, index) => {
          const synset = synsetInfo.get(sense.synset)
          if (!synset) throw new Error(`${sense.id}: synset 不存在：${sense.synset}`)
          insertSense.run(
            sense.id, lemma, pos, index, sense.synset, synset.shard,
            synset.label, synset.gloss, scalar(sense.adjposition),
            json(sense.subcat), json(sense.sent),
          )
          senseCount++
          for (const relationType of SENSE_RELATIONS) {
            for (const targetId of values(sense[relationType])) {
              const target = senseInfo.get(targetId)
              if (!target) throw new Error(`${sense.id}: target sense 不存在：${targetId}`)
              insertRelation.run(
                sense.id, relationType, targetId, target.shard, target.lemma, target.pos,
              )
              relationCount++
            }
          }
        })
      }
    }
  })
  transaction()
  stats.senseRelations += relationCount
  const bytes = finishDatabase(db, outputPath)
  manifestFiles[outputName] = {
    kind: 'entries', url: `/dicts/wordnet/${outputName}`, bytes,
    sha256: digestFile(outputPath), entries: entryCount, senses: senseCount, relations: relationCount,
  }
  log(`${outputName}: ${entryCount} entries, ${senseCount} senses`)
}

const SYNSET_SCHEMA = `
  CREATE TABLE wordnet_synsets (
    synset_id TEXT PRIMARY KEY,
    pos TEXT NOT NULL,
    semantic_category TEXT NOT NULL,
    definitions_json TEXT NOT NULL DEFAULT '[]',
    examples_json TEXT NOT NULL DEFAULT '[]',
    members_json TEXT NOT NULL DEFAULT '[]',
    ili TEXT NOT NULL DEFAULT '',
    wikidata TEXT NOT NULL DEFAULT '',
    source_json TEXT NOT NULL DEFAULT '[]'
  ) WITHOUT ROWID;
  CREATE TABLE wordnet_synset_relations (
    source_synset_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    target_synset_id TEXT NOT NULL,
    target_shard TEXT NOT NULL,
    target_pos TEXT NOT NULL,
    target_label TEXT NOT NULL,
    target_gloss TEXT NOT NULL DEFAULT '',
    inferred INTEGER NOT NULL DEFAULT 0 CHECK (inferred IN (0, 1)),
    PRIMARY KEY (source_synset_id, relation_type, target_synset_id)
  ) WITHOUT ROWID;
  CREATE INDEX wordnet_synset_relations_target_idx
    ON wordnet_synset_relations (target_synset_id);
`

for (const sourceName of synsetFiles) {
  const outputName = dbName(sourceName)
  const outputPath = join(STAGING_DIR, outputName)
  const db = new Database(outputPath)
  configure(db)
  db.exec(SYNSET_SCHEMA)
  const category = sourceName.replace(/\.json$/, '').split('.').slice(1).join('.')
  const insertSynset = db.prepare(`INSERT INTO wordnet_synsets
    (synset_id, pos, semantic_category, definitions_json, examples_json,
     members_json, ili, wikidata, source_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const insertRelation = db.prepare(`INSERT OR IGNORE INTO wordnet_synset_relations
    (source_synset_id, relation_type, target_synset_id, target_shard, target_pos,
     target_label, target_gloss, inferred) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  let synsetCount = 0
  let relationCount = 0
  const transaction = db.transaction(() => {
    const records = readJson(join(SOURCE_DIR, sourceName))
    for (const [synsetId, record] of Object.entries(records)) {
      const self = synsetInfo.get(synsetId)
      insertSynset.run(
        synsetId, self.pos, category, json(record.definition), json(record.example),
        json(record.members), scalar(record.ili), scalar(record.wikidata), json(record.source),
      )
      synsetCount++
      for (const relationType of SYNSET_RELATIONS) {
        for (const targetId of values(record[relationType])) {
          const target = synsetInfo.get(targetId)
          if (!target) throw new Error(`${synsetId}: target synset 不存在：${targetId}`)
          const result = insertRelation.run(
            synsetId, relationType, targetId, target.shard, target.pos,
            target.label, target.gloss, 0,
          )
          relationCount += result.changes
        }
      }
      for (const reverse of reverseByTarget.get(synsetId) || []) {
        const target = synsetInfo.get(reverse.sourceSynsetId)
        const result = insertRelation.run(
          synsetId, reverse.relationType, reverse.sourceSynsetId, target.shard,
          target.pos, target.label, target.gloss, 1,
        )
        relationCount += result.changes
        stats.inferredSynsetRelations += result.changes
      }
    }
  })
  transaction()
  stats.synsetRelations += relationCount
  const bytes = finishDatabase(db, outputPath)
  manifestFiles[outputName] = {
    kind: 'synsets', url: `/dicts/wordnet/${outputName}`, bytes,
    sha256: digestFile(outputPath), synsets: synsetCount, relations: relationCount,
  }
  log(`${outputName}: ${synsetCount} synsets, ${relationCount} relations`)
}

{
  const sourceName = 'frames.json'
  const outputName = 'frames.db'
  const outputPath = join(STAGING_DIR, outputName)
  const db = new Database(outputPath)
  configure(db)
  db.exec(`CREATE TABLE wordnet_frames (
    frame_id TEXT PRIMARY KEY,
    template TEXT NOT NULL
  ) WITHOUT ROWID`)
  const insert = db.prepare('INSERT INTO wordnet_frames (frame_id, template) VALUES (?, ?)')
  const frames = readJson(join(SOURCE_DIR, sourceName))
  const transaction = db.transaction(() => {
    for (const [frameId, template] of Object.entries(frames)) insert.run(frameId, scalar(template))
  })
  transaction()
  stats.frames = Object.keys(frames).length
  const bytes = finishDatabase(db, outputPath)
  manifestFiles[outputName] = {
    kind: 'frames', url: `/dicts/wordnet/${outputName}`, bytes,
    sha256: digestFile(outputPath), frames: stats.frames,
  }
}

function validateKnownSamples() {
  const bankDb = new Database(join(STAGING_DIR, 'entries-b.db'), { readonly: true })
  const bankCounts = bankDb.prepare(`
    SELECT pos, count(*) AS count
    FROM wordnet_senses
    WHERE lemma = 'bank' COLLATE NOCASE
    GROUP BY pos
  `).all()
  bankDb.close()
  const byPos = Object.fromEntries(bankCounts.map(row => [row.pos, row.count]))
  if (byPos.n !== 10 || byPos.v !== 8) {
    throw new Error(`bank 样例校验失败：noun=${byPos.n || 0}, verb=${byPos.v || 0}`)
  }
  if (stats.frames !== 39) throw new Error(`frames 数量不符：预期 39，实际 ${stats.frames}`)
  if (stats.inferredSynsetRelations === 0) throw new Error('未生成任何反向 synset relation')
  log(`样例校验通过：bank=10 noun + 8 verb，反向边=${stats.inferredSynsetRelations}`)
}

validateKnownSamples()

function routeKey(value) {
  return scalar(value).trim().normalize('NFC').toLowerCase()
}

let temporaryId = 0

function entryEntities(sourceName) {
  const db = new Database(join(STAGING_DIR, sourceName), { readonly: true })
  const entries = db.prepare('SELECT * FROM wordnet_entries ORDER BY lemma COLLATE NOCASE, lemma, pos').all()
  const senses = db.prepare('SELECT * FROM wordnet_senses ORDER BY lemma COLLATE NOCASE, lemma, pos, sense_order').all()
  const relations = db.prepare('SELECT * FROM wordnet_sense_relations ORDER BY source_sense_id, relation_type, target_sense_id').all()
  db.close()

  const entities = new Map()
  const senseKeys = new Map()
  for (const entry of entries) {
    const key = routeKey(entry.lemma)
    if (!entities.has(key)) entities.set(key, { key, entries: [], senses: [], relations: [] })
    entities.get(key).entries.push(entry)
  }
  for (const sense of senses) {
    const key = routeKey(sense.lemma)
    const entity = entities.get(key)
    if (!entity) throw new Error(`${sourceName}: sense 的 lemma 不存在：${sense.lemma}`)
    entity.senses.push(sense)
    senseKeys.set(sense.sense_id, key)
  }
  for (const relation of relations) {
    const key = senseKeys.get(relation.source_sense_id)
    if (!key) throw new Error(`${sourceName}: sense relation 来源不存在：${relation.source_sense_id}`)
    entities.get(key).relations.push(relation)
  }
  return [...entities.values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
}

function writeEntryCandidate(entities) {
  const path = join(OUTPUT_DIR, `.tmp-entry-${temporaryId++}.db`)
  const db = new Database(path)
  configure(db)
  db.exec(ENTRY_SCHEMA)
  const insertEntry = db.prepare(`INSERT INTO wordnet_entries
    (lemma, pos, pronunciations_json, forms_json) VALUES (?, ?, ?, ?)`)
  const insertSense = db.prepare(`INSERT INTO wordnet_senses
    (sense_id, lemma, pos, sense_order, synset_id, synset_shard, synset_label,
     synset_gloss, adj_position, subcat_json, sent_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const insertRelation = db.prepare(`INSERT INTO wordnet_sense_relations
    (source_sense_id, relation_type, target_sense_id, target_shard,
     target_lemma, target_pos, inferred) VALUES (?, ?, ?, ?, ?, ?, ?)`)
  db.transaction(() => {
    for (const entity of entities) {
      for (const row of entity.entries) insertEntry.run(row.lemma, row.pos, row.pronunciations_json, row.forms_json)
      for (const row of entity.senses) insertSense.run(
        row.sense_id, row.lemma, row.pos, row.sense_order, row.synset_id,
        row.synset_shard, row.synset_label, row.synset_gloss, row.adj_position,
        row.subcat_json, row.sent_json,
      )
      for (const row of entity.relations) insertRelation.run(
        row.source_sense_id, row.relation_type, row.target_sense_id,
        row.target_shard, row.target_lemma, row.target_pos, row.inferred,
      )
    }
  })()
  const bytes = finishDatabase(db, path)
  return { path, bytes, entities }
}

function splitEntryCandidates(entities, accepted) {
  const candidate = writeEntryCandidate(entities)
  if (candidate.bytes <= ENTRY_SPLIT_SIZE || entities.length <= 1) {
    accepted.push(candidate)
    return
  }
  rmSync(candidate.path, { force: true })
  const middle = Math.ceil(entities.length / 2)
  splitEntryCandidates(entities.slice(0, middle), accepted)
  splitEntryCandidates(entities.slice(middle), accepted)
}

function synsetEntities(sourceName) {
  const db = new Database(join(STAGING_DIR, sourceName), { readonly: true })
  const synsetRows = db.prepare('SELECT * FROM wordnet_synsets ORDER BY synset_id').all()
  const relationRows = db.prepare('SELECT * FROM wordnet_synset_relations ORDER BY source_synset_id, relation_type, target_synset_id').all()
  db.close()
  const entities = new Map(synsetRows.map(row => [row.synset_id, { row, relations: [] }]))
  for (const relation of relationRows) {
    const entity = entities.get(relation.source_synset_id)
    if (!entity) throw new Error(`${sourceName}: synset relation 来源不存在：${relation.source_synset_id}`)
    entity.relations.push(relation)
  }
  return [...entities.values()]
}

function writeSynsetCandidate(entities) {
  const path = join(OUTPUT_DIR, `.tmp-synset-${temporaryId++}.db`)
  const db = new Database(path)
  configure(db)
  db.exec(SYNSET_SCHEMA)
  const insertSynset = db.prepare(`INSERT INTO wordnet_synsets
    (synset_id, pos, semantic_category, definitions_json, examples_json,
     members_json, ili, wikidata, source_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const insertRelation = db.prepare(`INSERT INTO wordnet_synset_relations
    (source_synset_id, relation_type, target_synset_id, target_shard, target_pos,
     target_label, target_gloss, inferred) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  db.transaction(() => {
    for (const entity of entities) {
      const row = entity.row
      insertSynset.run(
        row.synset_id, row.pos, row.semantic_category, row.definitions_json,
        row.examples_json, row.members_json, row.ili, row.wikidata, row.source_json,
      )
      for (const relation of entity.relations) insertRelation.run(
        relation.source_synset_id, relation.relation_type, relation.target_synset_id,
        relation.target_shard, relation.target_pos, relation.target_label,
        relation.target_gloss, relation.inferred,
      )
    }
  })()
  const bytes = finishDatabase(db, path)
  return { path, bytes, entities }
}

function splitSynsetCandidates(entities, accepted) {
  const candidate = writeSynsetCandidate(entities)
  if (candidate.bytes <= SYNSET_SPLIT_SIZE || entities.length <= 1) {
    accepted.push(candidate)
    return
  }
  rmSync(candidate.path, { force: true })
  const middle = Math.ceil(entities.length / 2)
  splitSynsetCandidates(entities.slice(0, middle), accepted)
  splitSynsetCandidates(entities.slice(middle), accepted)
}

const finalFiles = {}
const finalEntryFiles = []
const finalSynsetFiles = []
const finalSenseShards = new Map()
const finalSynsetShards = new Map()
const lemmaIndex = new Map()

log('按完整 lemma 构建自适应 entry 逻辑分片')
for (const sourceName of entryFiles) {
  const entities = entryEntities(dbName(sourceName))
  const sourceBytes = manifestFiles[dbName(sourceName)].bytes
  const estimatedPieces = Math.max(1, Math.ceil(sourceBytes / ENTRY_SPLIT_SIZE))
  const batchSize = Math.max(1, Math.ceil(entities.length / estimatedPieces))
  const accepted = []
  for (let start = 0; start < entities.length; start += batchSize) {
    splitEntryCandidates(entities.slice(start, start + batchSize), accepted)
  }
  const stem = dbName(sourceName).replace(/\.db$/, '')
  accepted.forEach((candidate, index) => {
    const name = `${stem}-${String(index).padStart(3, '0')}.db`
    renameSync(candidate.path, join(OUTPUT_DIR, name))
    finalEntryFiles.push(name)
    for (const entity of candidate.entities) {
      const displayLemma = entity.entries.find(row => row.lemma === entity.key)?.lemma
        || entity.entries[0]?.lemma || entity.key
      lemmaIndex.set(entity.key, { lemma: displayLemma, entryShard: name })
      for (const sense of entity.senses) finalSenseShards.set(sense.sense_id, name)
    }
  })
}

log('按完整 synset 构建自适应语义逻辑分片')
for (const sourceName of synsetFiles) {
  const sourceDbName = dbName(sourceName)
  const entities = synsetEntities(sourceDbName)
  const sourceBytes = manifestFiles[sourceDbName].bytes
  const estimatedPieces = Math.max(1, Math.ceil(sourceBytes / SYNSET_SPLIT_SIZE))
  const batchSize = Math.max(1, Math.ceil(entities.length / estimatedPieces))
  const accepted = []
  for (let start = 0; start < entities.length; start += batchSize) {
    splitSynsetCandidates(entities.slice(start, start + batchSize), accepted)
  }
  const stem = sourceDbName.replace(/\.db$/, '')
  accepted.forEach((candidate, index) => {
    const name = `${stem}-${String(index).padStart(3, '0')}.db`
    renameSync(candidate.path, join(OUTPUT_DIR, name))
    finalSynsetFiles.push(name)
    for (const entity of candidate.entities) finalSynsetShards.set(entity.row.synset_id, name)
  })
}

function finalizeLogicalFile(name, kind, maxBytes) {
  const path = join(OUTPUT_DIR, name)
  const db = new Database(path)
  configure(db)
  let meta
  if (kind === 'entries') {
    const updateSense = db.prepare('UPDATE wordnet_senses SET synset_shard = ? WHERE sense_id = ?')
    const updateRelation = db.prepare(`UPDATE wordnet_sense_relations
      SET target_shard = ? WHERE source_sense_id = ? AND relation_type = ? AND target_sense_id = ?`)
    db.transaction(() => {
      for (const row of db.prepare('SELECT sense_id, synset_id FROM wordnet_senses').all()) {
        const shard = finalSynsetShards.get(row.synset_id)
        if (!shard) throw new Error(`${row.sense_id}: 最终 synset 分片不存在：${row.synset_id}`)
        updateSense.run(shard, row.sense_id)
      }
      for (const row of db.prepare(`SELECT source_sense_id, relation_type, target_sense_id
        FROM wordnet_sense_relations`).all()) {
        const shard = finalSenseShards.get(row.target_sense_id)
        if (!shard) throw new Error(`${row.source_sense_id}: 最终 sense 分片不存在：${row.target_sense_id}`)
        updateRelation.run(shard, row.source_sense_id, row.relation_type, row.target_sense_id)
      }
    })()
    meta = {
      kind,
      entries: db.prepare('SELECT count(*) AS count FROM wordnet_entries').get().count,
      senses: db.prepare('SELECT count(*) AS count FROM wordnet_senses').get().count,
      relations: db.prepare('SELECT count(*) AS count FROM wordnet_sense_relations').get().count,
    }
  } else {
    const updateRelation = db.prepare(`UPDATE wordnet_synset_relations
      SET target_shard = ? WHERE source_synset_id = ? AND relation_type = ? AND target_synset_id = ?`)
    db.transaction(() => {
      for (const row of db.prepare(`SELECT source_synset_id, relation_type, target_synset_id
        FROM wordnet_synset_relations`).all()) {
        const shard = finalSynsetShards.get(row.target_synset_id)
        if (!shard) throw new Error(`${row.source_synset_id}: 最终 synset 目标不存在：${row.target_synset_id}`)
        updateRelation.run(shard, row.source_synset_id, row.relation_type, row.target_synset_id)
      }
    })()
    meta = {
      kind,
      synsets: db.prepare('SELECT count(*) AS count FROM wordnet_synsets').get().count,
      relations: db.prepare('SELECT count(*) AS count FROM wordnet_synset_relations').get().count,
    }
  }
  db.exec('VACUUM')
  const quickCheck = db.pragma('quick_check', { simple: true })
  db.close()
  if (quickCheck !== 'ok') throw new Error(`${name}: quick_check 失败：${quickCheck}`)
  const bytes = statSync(path).size
  if (bytes > maxBytes) throw new Error(`${name}: ${bytes} bytes，超过逻辑分片上限 ${maxBytes}`)
  finalFiles[name] = {
    ...meta,
    url: `/dicts/wordnet/${name}`,
    bytes,
    sha256: digestFile(path),
  }
}

for (const name of finalEntryFiles) finalizeLogicalFile(name, 'entries', ENTRY_TARGET_SIZE)
for (const name of finalSynsetFiles) finalizeLogicalFile(name, 'synsets', SYNSET_TARGET_SIZE)

{
  const name = 'index.db'
  const path = join(OUTPUT_DIR, name)
  const db = new Database(path)
  configure(db)
  db.exec(`CREATE TABLE wordnet_lemma_index (
    lemma_key TEXT PRIMARY KEY,
    lemma TEXT NOT NULL,
    entry_shard TEXT NOT NULL
  ) WITHOUT ROWID`)
  const insert = db.prepare('INSERT INTO wordnet_lemma_index (lemma_key, lemma, entry_shard) VALUES (?, ?, ?)')
  db.transaction(() => {
    for (const [key, value] of [...lemmaIndex].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
      insert.run(key, value.lemma, value.entryShard)
    }
  })()
  const bytes = finishDatabase(db, path)
  finalFiles[name] = {
    kind: 'index', url: `/dicts/wordnet/${name}`, bytes,
    sha256: digestFile(path), lemmas: lemmaIndex.size,
  }
}

{
  const name = 'frames.db'
  const sourceDb = new Database(join(STAGING_DIR, name), { readonly: true })
  const rows = sourceDb.prepare('SELECT frame_id, template FROM wordnet_frames ORDER BY frame_id').all()
  sourceDb.close()
  const path = join(OUTPUT_DIR, name)
  const db = new Database(path)
  configure(db)
  db.exec(`CREATE TABLE wordnet_frames (
    frame_id TEXT PRIMARY KEY,
    template TEXT NOT NULL
  ) WITHOUT ROWID`)
  const insert = db.prepare('INSERT INTO wordnet_frames (frame_id, template) VALUES (?, ?)')
  db.transaction(() => { for (const row of rows) insert.run(row.frame_id, row.template) })()
  const bytes = finishDatabase(db, path)
  finalFiles[name] = {
    kind: 'frames', url: `/dicts/wordnet/${name}`, bytes,
    sha256: digestFile(path), frames: rows.length,
  }
}

function validateFinalSamples() {
  const indexDb = new Database(join(OUTPUT_DIR, 'index.db'), { readonly: true })
  const bank = indexDb.prepare(`SELECT entry_shard FROM wordnet_lemma_index WHERE lemma_key = 'bank'`).get()
  indexDb.close()
  if (!bank) throw new Error('最终索引缺少 bank')
  const bankDb = new Database(join(OUTPUT_DIR, bank.entry_shard), { readonly: true })
  const counts = bankDb.prepare(`SELECT pos, count(*) AS count FROM wordnet_senses
    WHERE lemma = 'bank' COLLATE NOCASE GROUP BY pos`).all()
  bankDb.close()
  const byPos = Object.fromEntries(counts.map(row => [row.pos, row.count]))
  if (byPos.n !== 10 || byPos.v !== 8) throw new Error(`最终 bank 校验失败：${JSON.stringify(byPos)}`)
}

validateFinalSamples()

const versionHash = createHash('sha256')
for (const name of Object.keys(finalFiles).sort()) versionHash.update(finalFiles[name].sha256)
const manifest = {
  schemaVersion: 2,
  version: `${WORDNET_VERSION}-${versionHash.digest('hex').slice(0, 12)}`,
  source: {
    name: 'Open English WordNet', version: WORDNET_VERSION,
    url: WORDNET_SOURCE_URL, sha256: WORDNET_SOURCE_SHA256,
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  pageSize: PAGE_SIZE,
  entryTargetBytes: ENTRY_TARGET_SIZE,
  synsetTargetBytes: SYNSET_TARGET_SIZE,
  generatedAt: new Date().toISOString(),
  stats,
  files: finalFiles,
}
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest))
rmSync(STAGING_DIR, { recursive: true, force: true })
log(`完成：${Object.keys(finalFiles).length} 个逻辑 SQLite，manifest ${manifest.version}`)
