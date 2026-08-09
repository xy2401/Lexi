/** Build normalized, HTTP-Range-friendly SQLite shards from OEWN 2025 JSON. */
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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
const MANIFEST_PATH = join(OUTPUT_ROOT, 'wordnet-manifest.json')
const PAGE_SIZE = 4096
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

rmSync(OUTPUT_DIR, { recursive: true, force: true })
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
  const outputPath = join(OUTPUT_DIR, outputName)
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
  const outputPath = join(OUTPUT_DIR, outputName)
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
  const outputPath = join(OUTPUT_DIR, outputName)
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
  const bankDb = new Database(join(OUTPUT_DIR, 'entries-b.db'), { readonly: true })
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

const versionHash = createHash('sha256')
for (const name of Object.keys(manifestFiles).sort()) versionHash.update(manifestFiles[name].sha256)
const manifest = {
  schemaVersion: 1,
  version: `${WORDNET_VERSION}-${versionHash.digest('hex').slice(0, 12)}`,
  source: {
    name: 'Open English WordNet', version: WORDNET_VERSION,
    url: WORDNET_SOURCE_URL, sha256: WORDNET_SOURCE_SHA256,
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  pageSize: PAGE_SIZE,
  generatedAt: new Date().toISOString(),
  stats,
  files: manifestFiles,
}
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest))
log(`完成：${Object.keys(manifestFiles).length} 个 SQLite，manifest ${manifest.version}`)
