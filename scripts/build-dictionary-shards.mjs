/**
 * Build Lexi's dictionary assets from the complete ECDICT archive only.
 *
 * Main dictionary: adaptive standalone SQLite shards routed by two-character
 * prefixes and lexical boundaries. Hot cache: 27 first-character shards
 * derived from the same source.
 */
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse'
import Database from 'better-sqlite3'
import { getShardName, Progress, log } from './utils.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_CSV = join(ROOT, 'data', 'stardict-raw', 'stardict.csv')
const DICT_ROOT = join(ROOT, 'public', 'dicts')
const MAIN_STAGING_DIR = join(ROOT, 'data', 'stardict-raw', '.main-staging')
const MAIN_DIR = join(DICT_ROOT, 'main')
const HOT_DIR = join(DICT_ROOT, 'hot')
const MANIFEST_PATH = join(DICT_ROOT, 'manifest.json')

const PAGE_SIZE = 4096
const BUFFER_SIZE = 3000
const MAIN_TARGET_SIZE = 256 * 1024
const MAIN_INITIAL_SIZE = 224 * 1024
const HOT_TAGS = ['cet4', 'cet6', 'ielts', 'toefl', 'gre', 'kyan', 'kaoyan']

const MAIN_SCHEMA = `
  CREATE TABLE IF NOT EXISTS words (
    word TEXT PRIMARY KEY COLLATE NOCASE,
    phonetic TEXT NOT NULL DEFAULT '',
    definition TEXT NOT NULL DEFAULT '',
    translation TEXT NOT NULL DEFAULT '',
    pos TEXT NOT NULL DEFAULT '',
    collins INTEGER NOT NULL DEFAULT 0,
    oxford INTEGER NOT NULL DEFAULT 0,
    tags TEXT NOT NULL DEFAULT '',
    bnc INTEGER NOT NULL DEFAULT 0,
    frequency INTEGER NOT NULL DEFAULT 0,
    exchange TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    audio TEXT NOT NULL DEFAULT ''
  ) WITHOUT ROWID
`

const HOT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS words (
    word TEXT PRIMARY KEY COLLATE NOCASE,
    phonetic TEXT NOT NULL DEFAULT '',
    translation TEXT NOT NULL DEFAULT '',
    frequency INTEGER NOT NULL DEFAULT 0,
    tags TEXT NOT NULL DEFAULT '',
    exchange TEXT NOT NULL DEFAULT ''
  ) WITHOUT ROWID
`

const MAIN_INSERT = `
  INSERT OR REPLACE INTO words (
    word, phonetic, definition, translation, pos, collins, oxford,
    tags, bnc, frequency, exchange, detail, audio
  ) VALUES (
    @word, @phonetic, @definition, @translation, @pos, @collins, @oxford,
    @tags, @bnc, @frequency, @exchange, @detail, @audio
  )
`

const HOT_INSERT = `
  INSERT OR REPLACE INTO words (
    word, phonetic, translation, frequency, tags, exchange
  ) VALUES (
    @word, @phonetic, @translation, @frequency, @tags, @exchange
  )
`

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanInteger(value) {
  const parsed = Number.parseInt(value || '0', 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeRow(row) {
  const word = cleanText(row.word).toLowerCase()
  if (!word) return null

  return {
    word,
    phonetic: cleanText(row.phonetic),
    definition: cleanText(row.definition),
    translation: cleanText(row.translation),
    pos: cleanText(row.pos),
    collins: cleanInteger(row.collins),
    oxford: cleanInteger(row.oxford),
    tags: cleanText(row.tag),
    bnc: cleanInteger(row.bnc),
    frequency: cleanInteger(row.frq || row.bnc),
    exchange: cleanText(row.exchange),
    detail: cleanText(row.detail),
    audio: cleanText(row.audio),
  }
}

function isHotWord(row) {
  if (row.frequency > 0 || row.bnc > 0) return true
  const tags = row.tags.toLowerCase()
  return HOT_TAGS.some(tag => tags.includes(tag))
}

function getHotShardName(word) {
  const first = word[0]
  return /^[a-z]$/.test(first) ? `${first}.db` : '_.db'
}

function allMainShardNames() {
  const names = ['__.db']
  for (let first = 97; first <= 122; first++) {
    const a = String.fromCharCode(first)
    names.push(`${a}_.db`)
    for (let second = 97; second <= 122; second++) {
      names.push(`${a}${String.fromCharCode(second)}.db`)
    }
  }
  return names
}

function allHotShardNames() {
  const names = ['_.db']
  for (let code = 97; code <= 122; code++) names.push(`${String.fromCharCode(code)}.db`)
  return names
}

function initializeDatabase(path, schema) {
  const db = new Database(path)
  db.pragma(`page_size = ${PAGE_SIZE}`)
  db.pragma('journal_mode = OFF')
  db.pragma('synchronous = OFF')
  db.pragma('temp_store = MEMORY')
  db.exec(schema)
  db.close()
}

function flushRecords(path, schema, insertSql, records) {
  if (records.length === 0) return
  if (!existsSync(path)) initializeDatabase(path, schema)

  const db = new Database(path)
  db.pragma('journal_mode = OFF')
  db.pragma('synchronous = OFF')
  const insert = db.prepare(insertSql)
  const insertBatch = db.transaction(batch => {
    for (const record of batch) insert.run(record)
  })
  insertBatch(records)
  db.close()
  records.length = 0
}

function flushBufferMap(directory, schema, insertSql, buffers) {
  for (const [name, records] of buffers) {
    flushRecords(join(directory, name), schema, insertSql, records)
  }
}

async function importSource() {
  if (!existsSync(SOURCE_CSV)) throw new Error(`完整词典源文件不存在: ${SOURCE_CSV}`)

  const mainBuffers = new Map()
  const hotBuffers = new Map()
  const progress = new Progress(3402564, 'ECDICT 完整库')
  let sourceRows = 0
  let hotRows = 0

  await new Promise((resolve, reject) => {
    const parser = parse({
      columns: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    })

    parser.on('data', rawRow => {
      sourceRows++
      progress.tick()
      const row = normalizeRow(rawRow)
      if (!row) return

      const mainName = getShardName(row.word)
      if (!mainBuffers.has(mainName)) mainBuffers.set(mainName, [])
      const mainRecords = mainBuffers.get(mainName)
      mainRecords.push(row)
      if (mainRecords.length >= BUFFER_SIZE) {
        flushRecords(join(MAIN_STAGING_DIR, mainName), MAIN_SCHEMA, MAIN_INSERT, mainRecords)
      }

      if (isHotWord(row)) {
        hotRows++
        const hotName = getHotShardName(row.word)
        if (!hotBuffers.has(hotName)) hotBuffers.set(hotName, [])
        const hotRecords = hotBuffers.get(hotName)
        hotRecords.push(row)
        if (hotRecords.length >= BUFFER_SIZE) {
          flushRecords(join(HOT_DIR, hotName), HOT_SCHEMA, HOT_INSERT, hotRecords)
        }
      }
    })
    parser.on('end', resolve)
    parser.on('error', reject)

    createReadStream(SOURCE_CSV, {
      encoding: 'utf8',
      highWaterMark: 2 * 1024 * 1024,
    }).pipe(parser)
  })

  flushBufferMap(MAIN_STAGING_DIR, MAIN_SCHEMA, MAIN_INSERT, mainBuffers)
  flushBufferMap(HOT_DIR, HOT_SCHEMA, HOT_INSERT, hotBuffers)
  progress.done()
  return { sourceRows, hotRows }
}

function ensureAllShards() {
  for (const name of allMainShardNames()) {
    const path = join(MAIN_STAGING_DIR, name)
    if (!existsSync(path)) initializeDatabase(path, MAIN_SCHEMA)
  }
  for (const name of allHotShardNames()) {
    const path = join(HOT_DIR, name)
    if (!existsSync(path)) initializeDatabase(path, HOT_SCHEMA)
  }
}

function finalizeShards(directory, names, label) {
  const entries = {}
  let totalRows = 0

  for (const name of names) {
    const path = join(directory, name)
    const db = new Database(path)
    db.exec('VACUUM')
    const quickCheck = db.pragma('quick_check', { simple: true })
    if (quickCheck !== 'ok') throw new Error(`${label}/${name} quick_check 失败: ${quickCheck}`)
    const rows = db.prepare('SELECT count(*) AS count FROM words').get().count
    const pageSize = db.pragma('page_size', { simple: true })
    db.close()

    if (pageSize !== PAGE_SIZE) throw new Error(`${label}/${name} page_size=${pageSize}`)
    const bytes = statSync(path).size
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16)
    entries[name] = {
      url: `/dicts/${label}/${name}`,
      bytes,
      rows,
      hash,
    }
    totalRows += rows
  }

  return { entries, totalRows }
}

let temporaryShardId = 0

function writeMainCandidate(rows) {
  const path = join(MAIN_DIR, `.tmp-${temporaryShardId++}.db`)
  initializeDatabase(path, MAIN_SCHEMA)
  const db = new Database(path)
  db.pragma('journal_mode = OFF')
  db.pragma('synchronous = OFF')
  const insert = db.prepare(MAIN_INSERT)
  db.transaction(batch => {
    for (const row of batch) insert.run(row)
  })(rows)
  db.exec('VACUUM')
  const quickCheck = db.pragma('quick_check', { simple: true })
  if (quickCheck !== 'ok') throw new Error(`${path} quick_check 失败: ${quickCheck}`)
  db.close()
  return { path, bytes: statSync(path).size, rows }
}

function splitMainCandidate(rows, accepted) {
  const candidate = writeMainCandidate(rows)
  if (candidate.bytes <= MAIN_TARGET_SIZE || rows.length <= 1) {
    accepted.push(candidate)
    return
  }

  rmSync(candidate.path, { force: true })
  const middle = Math.ceil(rows.length / 2)
  splitMainCandidate(rows.slice(0, middle), accepted)
  splitMainCandidate(rows.slice(middle), accepted)
}

function buildLogicalMain(sourceEntries) {
  const entries = {}
  const routes = {}
  let totalRows = 0

  for (const sourceName of allMainShardNames()) {
    const sourcePath = join(MAIN_STAGING_DIR, sourceName)
    const sourceDb = new Database(sourcePath, { readonly: true })
    const rows = sourceDb.prepare('SELECT * FROM words ORDER BY word COLLATE NOCASE, word').all()
    sourceDb.close()

    const sourceBytes = sourceEntries[sourceName].bytes
    const estimatedPieces = Math.max(1, Math.ceil(sourceBytes / MAIN_INITIAL_SIZE))
    const batchSize = Math.max(1, Math.ceil(Math.max(1, rows.length) / estimatedPieces))
    const accepted = []

    if (rows.length === 0) {
      accepted.push(writeMainCandidate([]))
    } else {
      for (let start = 0; start < rows.length; start += batchSize) {
        splitMainCandidate(rows.slice(start, start + batchSize), accepted)
      }
    }

    const stem = sourceName.replace(/\.db$/, '')
    routes[sourceName] = []
    accepted.forEach((candidate, index) => {
      const name = `${stem}-${String(index).padStart(3, '0')}.db`
      const path = join(MAIN_DIR, name)
      renameSync(candidate.path, path)
      const hash = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16)
      const lastWord = (candidate.rows.at(-1)?.word || '').trim().normalize('NFC').toLowerCase()
      entries[name] = {
        url: `/dicts/main/${name}`,
        bytes: candidate.bytes,
        rows: candidate.rows.length,
        hash,
      }
      routes[sourceName].push({ lastWord, file: name })
      totalRows += candidate.rows.length
    })
  }

  return { entries, routes, totalRows }
}

function reportMainSizes(entries) {
  const sorted = Object.entries(entries).sort((a, b) => b[1].bytes - a[1].bytes)
  log('主词典最大逻辑分片（VACUUM 后）:')
  for (const [name, entry] of sorted.slice(0, 20)) {
    const kib = entry.bytes / 1024
    const status = entry.bytes > MAIN_TARGET_SIZE ? 'FAIL' : 'OK'
    log(`  ${name.padEnd(14)} ${kib.toFixed(0).padStart(4)} KiB  ${status}`)
  }
}

function writeManifest(main, mainRoutes, hot, sourceRows, hotRows) {
  const versionHash = createHash('sha256')
  for (const [name, entry] of Object.entries(main).sort()) versionHash.update(`${name}:${entry.hash};`)
  for (const [name, entry] of Object.entries(hot).sort()) versionHash.update(`${name}:${entry.hash};`)

  const manifest = {
    schemaVersion: 2,
    version: versionHash.digest('hex').slice(0, 16),
    source: 'ECDICT/stardict.7z',
    pageSize: PAGE_SIZE,
    sourceRows,
    hotRows,
    mainTargetBytes: MAIN_TARGET_SIZE,
    main,
    mainRoutes,
    hot,
  }
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest))
  return manifest
}

async function main() {
  log('重建自适应逻辑主词典与 Hot 缓存 ...')
  rmSync(MAIN_STAGING_DIR, { recursive: true, force: true })
  rmSync(MAIN_DIR, { recursive: true, force: true })
  rmSync(HOT_DIR, { recursive: true, force: true })
  if (existsSync(MANIFEST_PATH)) rmSync(MANIFEST_PATH, { force: true })
  mkdirSync(MAIN_STAGING_DIR, { recursive: true })
  mkdirSync(MAIN_DIR, { recursive: true })
  mkdirSync(HOT_DIR, { recursive: true })

  const imported = await importSource()
  ensureAllShards()

  const sourceMainResult = finalizeShards(MAIN_STAGING_DIR, allMainShardNames(), 'main')
  const mainResult = buildLogicalMain(sourceMainResult.entries)
  const hotResult = finalizeShards(HOT_DIR, allHotShardNames(), 'hot')
  reportMainSizes(mainResult.entries)

  if (mainResult.totalRows !== imported.sourceRows) {
    throw new Error(`主词典计数不一致: source=${imported.sourceRows}, shards=${mainResult.totalRows}`)
  }
  if (hotResult.totalRows !== imported.hotRows) {
    throw new Error(`Hot 计数不一致: source=${imported.hotRows}, shards=${hotResult.totalRows}`)
  }

  const manifest = writeManifest(
    mainResult.entries,
    mainResult.routes,
    hotResult.entries,
    imported.sourceRows,
    imported.hotRows,
  )
  rmSync(MAIN_STAGING_DIR, { recursive: true, force: true })
  log(`主词条: ${mainResult.totalRows}，逻辑分片: ${Object.keys(mainResult.entries).length}`)
  log(`Hot 词条: ${hotResult.totalRows}，Hot 分片: ${Object.keys(hotResult.entries).length}`)
  log(`词典版本: ${manifest.version}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
