/** Validate generated ECDICT and Open English WordNet JSONL assets. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getShardRoute } from './utils.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DICT_ROOT = join(ROOT, 'public', 'dicts')
const MAX_PAGES_FILES = 20_000
const MAX_ASSET_SIZE = 25 * 1024 * 1024

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readJson(name) {
  const path = join(DICT_ROOT, name)
  assert(existsSync(path), `${name} 不存在`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function parseJsonLines(directory, name, meta) {
  const path = join(DICT_ROOT, directory, name)
  assert(existsSync(path), `${directory}/${name} 不存在`)
  const buffer = readFileSync(path)
  assert(buffer.byteLength === meta.bytes, `${directory}/${name} 字节数不符`)
  assert(buffer.byteLength < MAX_ASSET_SIZE, `${directory}/${name} 达到 25 MiB`)
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  assert(sha256 === meta.sha256, `${directory}/${name} SHA-256 不符`)

  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch (cause) {
    throw new Error(`${directory}/${name} 不是有效 UTF-8`, { cause })
  }
  if (!text) {
    assert(meta.rows === 0, `${directory}/${name} 空文件 rows 不为 0`)
    return []
  }
  assert(text.endsWith('\n'), `${directory}/${name} 缺少末尾换行`)
  const lines = text.slice(0, -1).split('\n')
  const records = lines.map((line, index) => {
    assert(line.length > 0, `${directory}/${name}:${index + 1} 存在空行`)
    try {
      const value = JSON.parse(line)
      assert(value && typeof value === 'object' && !Array.isArray(value), `${name}:${index + 1} 不是对象`)
      return value
    } catch (cause) {
      throw new Error(`${directory}/${name}:${index + 1} JSON 无效`, { cause })
    }
  })
  assert(records.length === meta.rows, `${directory}/${name} 行数不符：${records.length} != ${meta.rows}`)
  return records
}

function validateShardTarget(name, meta, records, targetBytes, label) {
  if (meta.bytes <= targetBytes) {
    assert(meta.oversized !== true, `${name} 未超过 ${label} 目标大小却标记为 oversized`)
    return false
  }
  assert(meta.oversized === true, `${name} 超过 ${label} 目标大小但未标记 oversized`)
  assert(records.length === 1, `${name} 超过 ${label} 目标大小且不是单实体独占分片`)
  return true
}

function validateEcdict() {
  const manifest = readJson('manifest.json')
  assert(manifest.schemaVersion === 3 && manifest.format === 'jsonl', 'ECDICT manifest 格式不受支持')
  let mainRows = 0
  let mainMaxBytes = 0
  let mainOversizedFiles = 0
  const actualLastWords = new Map()

  for (const [name, meta] of Object.entries(manifest.main)) {
    assert(name.endsWith('.jsonl'), `${name} 不是 JSONL`)
    const records = parseJsonLines('main', name, meta)
    if (validateShardTarget(name, meta, records, manifest.mainTargetBytes, 'Main 分片')) {
      mainOversizedFiles++
    }
    let previous = ''
    for (const record of records) {
      assert(typeof record.word === 'string' && record.word, `${name} 存在无效 word`)
      assert(record.cacheLevel == null && record.shard == null, `${name} 包含浏览器缓存元数据`)
      assert(!previous || previous < record.word, `${name} 内部词序错误`)
      previous = record.word
    }
    actualLastWords.set(name, previous)
    mainRows += records.length
    mainMaxBytes = Math.max(mainMaxBytes, meta.bytes)
  }
  assert(mainRows === manifest.sourceRows, `Main 总行数不符：${mainRows}`)

  for (const [route, parts] of Object.entries(manifest.mainRoutes)) {
    let previousBoundary = ''
    for (const part of parts) {
      assert(manifest.main[part.file], `${route} 引用了不存在的 ${part.file}`)
      assert(actualLastWords.get(part.file) === part.lastWord, `${route}/${part.file} lastWord 不符`)
      assert(!previousBoundary || previousBoundary < part.lastWord, `${route} 边界未排序`)
      assert(getShardRoute(part.lastWord) === route, `${part.lastWord} 路由不属于 ${route}`)
      previousBoundary = part.lastWord
    }
  }

  let hotRows = 0
  for (const [name, meta] of Object.entries(manifest.hot)) {
    assert(name.endsWith('.jsonl'), `${name} 不是 JSONL`)
    const records = parseJsonLines('hot', name, meta)
    for (const record of records) {
      assert(record.cacheLevel == null && record.shard == null, `${name} 包含浏览器缓存元数据`)
    }
    hotRows += records.length
  }
  assert(hotRows === manifest.hotRows, `Hot 总行数不符：${hotRows}`)

  return {
    version: manifest.version,
    mainFiles: Object.keys(manifest.main).length,
    mainRows,
    mainMaxKiB: mainMaxBytes / 1024,
    mainOversizedFiles,
    hotFiles: Object.keys(manifest.hot).length,
    hotRows,
  }
}

function validateWordNet() {
  const manifest = readJson('wordnet-manifest.json')
  assert(manifest.schemaVersion === 3 && manifest.format === 'jsonl', 'WordNet manifest 格式不受支持')
  const expected = { lexicalEntries: 135969, senses: 185129, synsets: 107519, frames: 39 }
  for (const [key, value] of Object.entries(expected)) {
    assert(manifest.stats[key] === value, `WordNet ${key} 不符：${manifest.stats[key]} != ${value}`)
  }

  const entryFiles = new Set()
  const synsetFiles = new Set()
  for (const [name, meta] of Object.entries(manifest.files)) {
    assert(name.endsWith('.jsonl'), `${name} 不是 JSONL`)
    if (meta.kind === 'entries') entryFiles.add(name)
    if (meta.kind === 'synsets') synsetFiles.add(name)
  }

  const lemmaToShard = new Map()
  const senseToShard = new Map()
  const synsetToShard = new Map()
  const senseReferences = []
  const synsetReferences = []
  let entries = 0
  let senses = 0
  let senseRelations = 0
  let synsets = 0
  let synsetRelations = 0
  let frames = 0
  let inferred = 0
  let entryMaxBytes = 0
  let synsetMaxBytes = 0
  let entryOversizedFiles = 0
  let synsetOversizedFiles = 0
  let bankCounts = {}

  for (const [name, meta] of Object.entries(manifest.files)) {
    const records = parseJsonLines('wordnet', name, meta)
    if (meta.kind === 'entries') {
      entryMaxBytes = Math.max(entryMaxBytes, meta.bytes)
      let fileEntries = 0
      let fileSenses = 0
      let fileRelations = 0
      for (const record of records) {
        assert(record.shard == null, `${name}/${record.key} 包含自身 shard`)
        assert(!lemmaToShard.has(record.key), `重复 lemma key：${record.key}`)
        lemmaToShard.set(record.key, name)
        for (const entry of record.entries) {
          entries++
          fileEntries++
          const counts = bankCounts
          if (record.key === 'bank') counts[entry.pos] = entry.senses.length
          for (const sense of entry.senses) {
            senses++
            fileSenses++
            assert(!senseToShard.has(sense.id), `重复 sense：${sense.id}`)
            senseToShard.set(sense.id, name)
            senseReferences.push({ source: sense.id, target: sense.synsetId, shard: sense.synsetShard, kind: 'synset' })
            for (const relation of sense.relations) {
              senseRelations++
              fileRelations++
              senseReferences.push({
                source: sense.id,
                target: relation.targetSenseId,
                shard: relation.targetShard,
                kind: 'sense',
              })
            }
          }
        }
      }
      if (validateShardTarget(name, meta, records, manifest.entryTargetBytes, 'entry 分片')) {
        entryOversizedFiles++
      }
      assert(fileEntries === meta.entries && fileSenses === meta.senses && fileRelations === meta.relations,
        `${name} manifest 计数不符`)
    } else if (meta.kind === 'synsets') {
      synsetMaxBytes = Math.max(synsetMaxBytes, meta.bytes)
      let fileRelations = 0
      for (const record of records) {
        assert(record.shard == null, `${name}/${record.id} 包含自身 shard`)
        assert(!synsetToShard.has(record.id), `重复 synset：${record.id}`)
        synsetToShard.set(record.id, name)
        synsets++
        for (const relation of record.relations) {
          synsetRelations++
          fileRelations++
          if (relation.inferred) inferred++
          synsetReferences.push({ source: record.id, target: relation.targetSynsetId, shard: relation.targetShard })
        }
      }
      if (validateShardTarget(name, meta, records, manifest.synsetTargetBytes, 'synset 分片')) {
        synsetOversizedFiles++
      }
      assert(records.length === meta.synsets && fileRelations === meta.relations, `${name} manifest 计数不符`)
    } else if (meta.kind === 'index') {
      assert(name === 'index.jsonl', `未知 index 文件：${name}`)
      for (const record of records) {
        assert(entryFiles.has(record.entryShard), `${record.key} entryShard 不存在：${record.entryShard}`)
      }
    } else if (meta.kind === 'frames') {
      assert(name === 'frames.jsonl', `未知 frames 文件：${name}`)
      frames += records.length
    } else {
      throw new Error(`${name} kind 不受支持：${meta.kind}`)
    }
  }

  for (const reference of senseReferences) {
    const actual = reference.kind === 'sense'
      ? senseToShard.get(reference.target)
      : synsetToShard.get(reference.target)
    assert(actual === reference.shard, `${reference.source} 目标路由错误：${reference.target}`)
  }
  for (const reference of synsetReferences) {
    assert(synsetToShard.get(reference.target) === reference.shard,
      `${reference.source} synset 目标路由错误：${reference.target}`)
  }

  const indexRecords = parseJsonLines('wordnet', 'index.jsonl', manifest.files['index.jsonl'])
  assert(indexRecords.length === lemmaToShard.size, 'WordNet index lemma 数量不符')
  for (const record of indexRecords) {
    assert(lemmaToShard.get(record.key) === record.entryShard, `${record.key} index 路由错误`)
  }
  assert(entries === manifest.stats.lexicalEntries, `WordNet entry 总数不符：${entries}`)
  assert(senses === manifest.stats.senses, `WordNet sense 总数不符：${senses}`)
  assert(senseRelations === manifest.stats.senseRelations, `WordNet sense relation 总数不符：${senseRelations}`)
  assert(synsets === manifest.stats.synsets, `WordNet synset 总数不符：${synsets}`)
  assert(synsetRelations === manifest.stats.synsetRelations,
    `WordNet synset relation 总数不符：${synsetRelations}`)
  assert(frames === manifest.stats.frames, `WordNet frame 总数不符：${frames}`)
  assert(bankCounts.n === 10 && bankCounts.v === 8, `bank sense 数量不符：${JSON.stringify(bankCounts)}`)
  assert(inferred === manifest.stats.inferredSynsetRelations, `反向边数量不符：${inferred}`)

  return {
    version: manifest.version,
    files: Object.keys(manifest.files).length,
    entryFiles: entryFiles.size,
    synsetFiles: synsetFiles.size,
    entries,
    senses,
    synsets,
    entryMaxKiB: entryMaxBytes / 1024,
    synsetMaxKiB: synsetMaxBytes / 1024,
    entryOversizedFiles,
    synsetOversizedFiles,
    bank: bankCounts,
  }
}

const dictionaryAssetCount = readdirSync(join(DICT_ROOT, 'main')).length
  + readdirSync(join(DICT_ROOT, 'hot')).length
  + readdirSync(join(DICT_ROOT, 'wordnet')).length
  + 2
assert(dictionaryAssetCount < MAX_PAGES_FILES, `词典文件数达到 Pages 上限：${dictionaryAssetCount}`)

console.log(JSON.stringify({
  assets: dictionaryAssetCount,
  ecdict: validateEcdict(),
  wordnet: validateWordNet(),
}, null, 2))
