/** Build directly importable JSONL shards from Open English WordNet 2025. */
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

const WORDNET_VERSION = '2025'
const WORDNET_SOURCE_URL = 'https://en-word.net/static/english-wordnet-2025-json.zip'
const WORDNET_SOURCE_SHA256 = '7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DIR = process.env.OEWN_SOURCE_DIR || join(ROOT, 'data', 'wordnet-raw', 'extracted')
const OUTPUT_ROOT = join(ROOT, 'public', 'dicts')
const OUTPUT_DIR = join(OUTPUT_ROOT, 'wordnet')
const MANIFEST_PATH = join(OUTPUT_ROOT, 'wordnet-manifest.json')
const SHARD_TARGET_SIZE = 256 * 1024
const ENTRY_TARGET_SIZE = SHARD_TARGET_SIZE
const SYNSET_TARGET_SIZE = SHARD_TARGET_SIZE
const OVERSIZED_WARNING_SIZE = 2 * 1024 * 1024
const MAX_FILE_SIZE = 25 * 1024 * 1024
const MAX_PARTS_PER_SOURCE = 1000
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

function values(value) {
  if (Array.isArray(value)) return value
  return value == null ? [] : [value]
}

function scalar(value) {
  if (value == null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function routeKey(value) {
  return scalar(value).trim().normalize('NFC').toLowerCase()
}

function sourceBase(sourceName) {
  return sourceName.replace(/\.json$/i, '')
}

function placeholderShard(base) {
  return `${base}-000.jsonl`
}

function shardName(base, index) {
  if (index >= MAX_PARTS_PER_SOURCE) throw new Error(`${base} 分片超过 ${MAX_PARTS_PER_SOURCE} 个`)
  return `${base}-${String(index).padStart(3, '0')}.jsonl`
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function jsonLine(record) {
  return `${JSON.stringify(record)}\n`
}

function writeJsonLines(name, records) {
  const path = join(OUTPUT_DIR, name)
  const content = records.map(jsonLine).join('')
  writeFileSync(path, content, 'utf8')
  const bytes = statSync(path).size
  if (bytes >= MAX_FILE_SIZE) throw new Error(`${name} 达到 Cloudflare Pages 25 MiB 限制`)
  return {
    bytes,
    sha256: createHash('sha256').update(content).digest('hex'),
  }
}

function partitionRecords(base, records, targetBytes) {
  const partitions = []
  let current = []
  let bytes = 0
  for (const record of records) {
    const lineBytes = Buffer.byteLength(jsonLine(record))
    if (lineBytes >= MAX_FILE_SIZE) {
      throw new Error(`${base}/${record.key || record.id || '?'} 达到 Cloudflare Pages 25 MiB 限制`)
    }
    if (lineBytes > targetBytes) {
      if (current.length > 0) {
        partitions.push({ records: current, estimatedBytes: bytes })
        current = []
        bytes = 0
      }
      partitions.push({ records: [record], estimatedBytes: lineBytes, oversized: true })
      continue
    }
    if (current.length > 0 && bytes + lineBytes > targetBytes) {
      partitions.push({ records: current, estimatedBytes: bytes })
      current = []
      bytes = 0
    }
    current.push(record)
    bytes += lineBytes
  }
  if (current.length > 0) partitions.push({ records: current, estimatedBytes: bytes })
  return partitions.map((partition, index) => ({
    ...partition,
    name: shardName(base, index),
  }))
}

function requiredShard(map, id, label) {
  const shard = map.get(id)
  if (!shard) throw new Error(`${label} 的最终分片不存在：${id}`)
  return shard
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

log('第一遍扫描：建立 sense/synset 来源、摘要与反向边')
const senseInfo = new Map()
const synsetInfo = new Map()
const reverseByTarget = new Map()
let lexicalEntries = 0
let senses = 0
let synsets = 0

for (const sourceName of entryFiles) {
  const base = sourceBase(sourceName)
  const sourceEntries = readJson(join(SOURCE_DIR, sourceName))
  for (const [lemma, poses] of Object.entries(sourceEntries)) {
    for (const [pos, entry] of Object.entries(poses)) {
      lexicalEntries++
      for (const sense of values(entry.sense)) {
        senses++
        if (!sense.id) throw new Error(`${sourceName}: ${lemma}/${pos} 缺少 sense id`)
        if (senseInfo.has(sense.id)) throw new Error(`重复 sense id：${sense.id}`)
        senseInfo.set(sense.id, { base, lemma, pos })
      }
    }
  }
}

for (const sourceName of synsetFiles) {
  const base = sourceBase(sourceName)
  const records = readJson(join(SOURCE_DIR, sourceName))
  for (const [synsetId, record] of Object.entries(records)) {
    synsets++
    if (synsetInfo.has(synsetId)) throw new Error(`重复 synset id：${synsetId}`)
    const definitions = values(record.definition)
    const members = values(record.members)
    synsetInfo.set(synsetId, {
      base,
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

const stats = {
  lexicalEntries,
  senses,
  senseRelations: 0,
  synsets,
  synsetRelations: 0,
  inferredSynsetRelations: 0,
  frames: 0,
}

log('构建完整 lemma 对象并规划 entry 分片')
const entryPartitions = []
const lemmaShard = new Map()
const lemmaDisplay = new Map()
const senseShard = new Map()
for (const sourceName of entryFiles) {
  const base = sourceBase(sourceName)
  const sourceEntries = readJson(join(SOURCE_DIR, sourceName))
  const recordsByKey = new Map()
  for (const [lemma, poses] of Object.entries(sourceEntries)) {
    const key = routeKey(lemma)
    if (!lemmaDisplay.has(key)) lemmaDisplay.set(key, lemma)
    const bundles = []
    for (const [pos, entry] of Object.entries(poses).sort((a, b) => compareText(a[0], b[0]))) {
      const bundleSenses = values(entry.sense).map((sense, order) => {
        const synset = synsetInfo.get(sense.synset)
        if (!synset) throw new Error(`${sense.id}: synset 不存在：${sense.synset}`)
        const relations = []
        const relationKeys = new Set()
        for (const relationType of SENSE_RELATIONS) {
          for (const targetSenseId of values(sense[relationType])) {
            const target = senseInfo.get(targetSenseId)
            if (!target) throw new Error(`${sense.id}: target sense 不存在：${targetSenseId}`)
            const relationKey = `${relationType}\u0000${targetSenseId}`
            if (relationKeys.has(relationKey)) continue
            relationKeys.add(relationKey)
            relations.push({
              type: relationType,
              targetSenseId,
              targetShard: placeholderShard(target.base),
              targetLemma: target.lemma,
              targetPos: target.pos,
              inferred: false,
            })
          }
        }
        relations.sort((a, b) => (
          compareText(a.type, b.type)
          || compareText(a.targetLemma, b.targetLemma)
          || compareText(a.targetSenseId, b.targetSenseId)
        ))
        stats.senseRelations += relations.length
        return {
          id: sense.id,
          lemma,
          pos,
          order,
          synsetId: sense.synset,
          synsetShard: placeholderShard(synset.base),
          synsetLabel: synset.label,
          synsetGloss: synset.gloss,
          adjectivePosition: scalar(sense.adjposition),
          subcategories: values(sense.subcat),
          sentences: values(sense.sent),
          relations,
        }
      })
      bundles.push({
        lemma,
        pos,
        pronunciations: values(entry.pronunciation),
        forms: values(entry.form),
        senses: bundleSenses,
      })
    }
    const record = recordsByKey.get(key) || { key, entries: [] }
    record.entries.push(...bundles)
    recordsByKey.set(key, record)
  }
  const records = [...recordsByKey.values()]
  records.sort((a, b) => compareText(a.key, b.key))
  const partitions = partitionRecords(base, records, ENTRY_TARGET_SIZE)
  for (const partition of partitions) {
    for (const record of partition.records) {
      if (lemmaShard.has(record.key)) throw new Error(`重复 lemma key：${record.key}`)
      lemmaShard.set(record.key, partition.name)
      for (const entry of record.entries) {
        for (const sense of entry.senses) senseShard.set(sense.id, partition.name)
      }
    }
    entryPartitions.push(partition)
  }
}

log('构建 canonical synset 对象并规划语义分片')
const synsetPartitions = []
const synsetShard = new Map()
for (const sourceName of synsetFiles) {
  const base = sourceBase(sourceName)
  const category = base.split('.').slice(1).join('.')
  const sourceSynsets = readJson(join(SOURCE_DIR, sourceName))
  const records = []
  for (const [synsetId, record] of Object.entries(sourceSynsets)) {
    const self = synsetInfo.get(synsetId)
    const relationsByKey = new Map()
    for (const relationType of SYNSET_RELATIONS) {
      for (const targetSynsetId of values(record[relationType])) {
        const target = synsetInfo.get(targetSynsetId)
        if (!target) throw new Error(`${synsetId}: target synset 不存在：${targetSynsetId}`)
        const key = `${relationType}\u0000${targetSynsetId}`
        if (!relationsByKey.has(key)) {
          relationsByKey.set(key, {
            type: relationType,
            targetSynsetId,
            targetShard: placeholderShard(target.base),
            targetPos: target.pos,
            targetLabel: target.label,
            targetGloss: target.gloss,
            inferred: false,
          })
        }
      }
    }
    for (const reverse of reverseByTarget.get(synsetId) || []) {
      const target = synsetInfo.get(reverse.sourceSynsetId)
      if (!target) throw new Error(`${synsetId}: reverse target 不存在：${reverse.sourceSynsetId}`)
      const key = `${reverse.relationType}\u0000${reverse.sourceSynsetId}`
      if (!relationsByKey.has(key)) {
        relationsByKey.set(key, {
          type: reverse.relationType,
          targetSynsetId: reverse.sourceSynsetId,
          targetShard: placeholderShard(target.base),
          targetPos: target.pos,
          targetLabel: target.label,
          targetGloss: target.gloss,
          inferred: true,
        })
        stats.inferredSynsetRelations++
      }
    }
    const relations = [...relationsByKey.values()].sort((a, b) => (
      compareText(a.type, b.type)
      || compareText(a.targetLabel, b.targetLabel)
      || compareText(a.targetSynsetId, b.targetSynsetId)
    ))
    stats.synsetRelations += relations.length
    records.push({
      id: synsetId,
      pos: self.pos,
      semanticCategory: category,
      definitions: values(record.definition),
      examples: values(record.example),
      members: values(record.members),
      ili: scalar(record.ili),
      wikidata: scalar(record.wikidata),
      sources: values(record.source),
      relations,
    })
  }
  records.sort((a, b) => compareText(a.id, b.id))
  const partitions = partitionRecords(base, records, SYNSET_TARGET_SIZE)
  for (const partition of partitions) {
    for (const record of partition.records) {
      if (synsetShard.has(record.id)) throw new Error(`重复 synset：${record.id}`)
      synsetShard.set(record.id, partition.name)
    }
    synsetPartitions.push(partition)
  }
}

function finalizeEntryRecord(record) {
  return {
    key: record.key,
    entries: record.entries.map(entry => ({
      ...entry,
      senses: entry.senses.map(sense => ({
        ...sense,
        synsetShard: requiredShard(synsetShard, sense.synsetId, sense.id),
        relations: sense.relations.map(relation => ({
          ...relation,
          targetShard: requiredShard(senseShard, relation.targetSenseId, sense.id),
        })),
      })),
    })),
  }
}

function finalizeSynsetRecord(record) {
  return {
    ...record,
    relations: record.relations.map(relation => ({
      ...relation,
      targetShard: requiredShard(synsetShard, relation.targetSynsetId, record.id),
    })),
  }
}

rmSync(OUTPUT_DIR, { recursive: true, force: true })
mkdirSync(OUTPUT_DIR, { recursive: true })
const files = {}

for (const partition of entryPartitions) {
  const records = partition.records.map(finalizeEntryRecord)
  const result = writeJsonLines(partition.name, records)
  const oversized = result.bytes > ENTRY_TARGET_SIZE
  if (oversized && (records.length !== 1 || !partition.oversized)) {
    throw new Error(`${partition.name} ${result.bytes} bytes，非独占 entry 分片超过目标大小`)
  }
  if (oversized && result.bytes > OVERSIZED_WARNING_SIZE) {
    console.warn(`[WordNet] ${partition.name} 是 ${(result.bytes / 1024 / 1024).toFixed(2)} MiB 的独占超大 entry 分片`)
  }
  const entries = records.reduce((sum, record) => sum + record.entries.length, 0)
  const partitionSenses = records.reduce((sum, record) => (
    sum + record.entries.reduce((entrySum, entry) => entrySum + entry.senses.length, 0)
  ), 0)
  const relations = records.reduce((sum, record) => (
    sum + record.entries.reduce((entrySum, entry) => (
      entrySum + entry.senses.reduce((senseSum, sense) => senseSum + sense.relations.length, 0)
    ), 0)
  ), 0)
  files[partition.name] = {
    kind: 'entries',
    url: `/dicts/wordnet/${partition.name}`,
    bytes: result.bytes,
    sha256: result.sha256,
    rows: records.length,
    entries,
    senses: partitionSenses,
    relations,
    ...(oversized ? { oversized: true } : {}),
  }
}

for (const partition of synsetPartitions) {
  const records = partition.records.map(finalizeSynsetRecord)
  const result = writeJsonLines(partition.name, records)
  const oversized = result.bytes > SYNSET_TARGET_SIZE
  if (oversized && (records.length !== 1 || !partition.oversized)) {
    throw new Error(`${partition.name} ${result.bytes} bytes，非独占 synset 分片超过目标大小`)
  }
  if (oversized && result.bytes > OVERSIZED_WARNING_SIZE) {
    console.warn(`[WordNet] ${partition.name} 是 ${(result.bytes / 1024 / 1024).toFixed(2)} MiB 的独占超大 synset 分片`)
  }
  files[partition.name] = {
    kind: 'synsets',
    url: `/dicts/wordnet/${partition.name}`,
    bytes: result.bytes,
    sha256: result.sha256,
    rows: records.length,
    synsets: records.length,
    relations: records.reduce((sum, record) => sum + record.relations.length, 0),
    ...(oversized ? { oversized: true } : {}),
  }
}

const indexRecords = [...lemmaShard.entries()]
  .sort((a, b) => compareText(a[0], b[0]))
  .map(([key, entryShard]) => ({ key, lemma: lemmaDisplay.get(key) || key, entryShard }))
const indexResult = writeJsonLines('index.jsonl', indexRecords)
files['index.jsonl'] = {
  kind: 'index',
  url: '/dicts/wordnet/index.jsonl',
  bytes: indexResult.bytes,
  sha256: indexResult.sha256,
  rows: indexRecords.length,
  lemmas: indexRecords.length,
}

const frameSource = readJson(join(SOURCE_DIR, 'frames.json'))
const frameRecords = Object.entries(frameSource)
  .sort((a, b) => compareText(a[0], b[0]))
  .map(([id, template]) => ({ id, template: scalar(template) }))
stats.frames = frameRecords.length
const frameResult = writeJsonLines('frames.jsonl', frameRecords)
files['frames.jsonl'] = {
  kind: 'frames',
  url: '/dicts/wordnet/frames.jsonl',
  bytes: frameResult.bytes,
  sha256: frameResult.sha256,
  rows: frameRecords.length,
  frames: frameRecords.length,
}

const bankPartition = lemmaShard.get('bank')
const bankRecord = entryPartitions
  .find(partition => partition.name === bankPartition)
  ?.records.find(record => record.key === 'bank')
const bankCounts = Object.fromEntries((bankRecord?.entries || []).map(entry => [entry.pos, entry.senses.length]))
if (bankCounts.n !== 10 || bankCounts.v !== 8) {
  throw new Error(`bank 样例校验失败：${JSON.stringify(bankCounts)}`)
}
if (stats.frames !== 39) throw new Error(`frames 数量不符：${stats.frames}`)
if (stats.inferredSynsetRelations === 0) throw new Error('未生成反向 synset relation')

const versionHash = createHash('sha256')
for (const [name, meta] of Object.entries(files).sort()) versionHash.update(`${name}:${meta.sha256};`)
const manifest = {
  schemaVersion: 3,
  format: 'jsonl',
  version: `${WORDNET_VERSION}-${versionHash.digest('hex').slice(0, 12)}`,
  source: {
    name: 'Open English WordNet',
    version: WORDNET_VERSION,
    url: WORDNET_SOURCE_URL,
    sha256: WORDNET_SOURCE_SHA256,
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  entryTargetBytes: ENTRY_TARGET_SIZE,
  synsetTargetBytes: SYNSET_TARGET_SIZE,
  generatedAt: new Date().toISOString(),
  stats,
  files,
}
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest))

const entryNames = Object.entries(files).filter(([, meta]) => meta.kind === 'entries')
const synsetNames = Object.entries(files).filter(([, meta]) => meta.kind === 'synsets')
const entryMax = entryNames.sort((a, b) => b[1].bytes - a[1].bytes)[0]
const synsetMax = synsetNames.sort((a, b) => b[1].bytes - a[1].bytes)[0]
log(`完成：${Object.keys(files).length} 个 JSONL，manifest ${manifest.version}`)
log(`entry 分片 ${entryNames.length}，最大 ${entryMax[0]} ${(entryMax[1].bytes / 1024).toFixed(0)} KiB`)
log(`synset 分片 ${synsetNames.length}，最大 ${synsetMax[0]} ${(synsetMax[1].bytes / 1024).toFixed(0)} KiB`)
log(`bank=10 noun + 8 verb，反向边=${stats.inferredSynsetRelations}`)
