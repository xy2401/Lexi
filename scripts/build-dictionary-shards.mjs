/** Build directly importable JSONL shards from the sorted ECDICT CSV. */
import {
  closeSync,
  createReadStream,
  existsSync,
  mkdirSync,
  openSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse'
import { getShardRoute, Progress, log } from './utils.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_CSV = join(ROOT, 'data', 'stardict-raw', 'stardict.csv')
const DICT_ROOT = join(ROOT, 'public', 'dicts')
const MAIN_DIR = join(DICT_ROOT, 'main')
const HOT_DIR = join(DICT_ROOT, 'hot')
const MANIFEST_PATH = join(DICT_ROOT, 'manifest.json')

const MAIN_TARGET_SIZE = 256 * 1024
const OVERSIZED_WARNING_SIZE = 2 * 1024 * 1024
const MAX_FILE_SIZE = 25 * 1024 * 1024
const MAIN_MAX_PARTS_PER_ROUTE = 1000
const WRITE_BUFFER_SIZE = 64 * 1024
const EXPECTED_SOURCE_ROWS = 3_402_564
const HOT_TAGS = ['cet4', 'cet6', 'ielts', 'toefl', 'gre', 'kyan', 'kaoyan']

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanInteger(value) {
  const parsed = Number.parseInt(value || '0', 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeRow(row) {
  const word = cleanText(row.word).normalize('NFC').toLowerCase()
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

function toHotRecord(row) {
  return {
    word: row.word,
    phonetic: row.phonetic,
    translation: row.translation,
    frequency: row.frequency,
    tags: row.tags,
    exchange: row.exchange,
  }
}

function isHotWord(row) {
  if (row.frequency > 0 || row.bnc > 0) return true
  const tags = row.tags.toLowerCase()
  return HOT_TAGS.some(tag => tags.includes(tag))
}

function getHotRoute(word) {
  const first = word[0]
  return /^[a-z]$/.test(first) ? first : '_'
}

function allMainRoutes() {
  const routes = ['__']
  for (let first = 97; first <= 122; first++) {
    const a = String.fromCharCode(first)
    routes.push(`${a}_`)
    for (let second = 97; second <= 122; second++) {
      routes.push(`${a}${String.fromCharCode(second)}`)
    }
  }
  return routes
}

function allHotRoutes() {
  return ['_', ...Array.from({ length: 26 }, (_, index) => String.fromCharCode(97 + index))]
}

function jsonLine(record) {
  return `${JSON.stringify(record)}\n`
}

function writeJsonLines(path, lines) {
  const content = lines.join('')
  writeFileSync(path, content, 'utf8')
  return {
    bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
  }
}

function createMainWriter() {
  const files = {}
  const routes = Object.fromEntries(allMainRoutes().map(route => [route, []]))
  const states = new Map()
  let openRoute = ''

  function stateFor(route) {
    let state = states.get(route)
    if (!state) {
      state = {
        route,
        index: 0,
        fd: null,
        name: '',
        path: '',
        bytes: 0,
        rows: 0,
        lastWord: '',
        pending: '',
        pendingBytes: 0,
        hash: createHash('sha256'),
      }
      states.set(route, state)
    }
    return state
  }

  function ensureOpen(state) {
    if (state.fd != null) return
    if (!state.name) {
      if (state.index >= MAIN_MAX_PARTS_PER_ROUTE) {
        throw new Error(`${state.route} 分片超过 ${MAIN_MAX_PARTS_PER_ROUTE} 个`)
      }
      state.name = `${state.route}-${String(state.index).padStart(3, '0')}.jsonl`
      state.path = join(MAIN_DIR, state.name)
    }
    state.fd = openSync(state.path, state.bytes > 0 ? 'a' : 'w')
  }

  function flush(state) {
    if (!state.pending) return
    ensureOpen(state)
    writeSync(state.fd, state.pending, null, 'utf8')
    state.pending = ''
    state.pendingBytes = 0
  }

  function close(state) {
    flush(state)
    if (state.fd != null) {
      closeSync(state.fd)
      state.fd = null
    }
  }

  function finishShard(state) {
    if (state.rows === 0) return
    close(state)
    const actualBytes = statSync(state.path).size
    if (actualBytes !== state.bytes) {
      throw new Error(`${state.name} 字节数不符：${actualBytes} != ${state.bytes}`)
    }
    const sha256 = state.hash.digest('hex')
    const oversized = state.bytes > MAIN_TARGET_SIZE
    if (state.bytes >= MAX_FILE_SIZE) {
      throw new Error(`${state.name} 达到 Cloudflare Pages 25 MiB 限制`)
    }
    if (oversized && state.bytes > OVERSIZED_WARNING_SIZE) {
      console.warn(`[Lexi] ${state.name} 是 ${(state.bytes / 1024 / 1024).toFixed(2)} MiB 的独占超大词条分片`)
    }
    files[state.name] = {
      url: `/dicts/main/${state.name}`,
      bytes: state.bytes,
      rows: state.rows,
      sha256,
      ...(oversized ? { oversized: true } : {}),
    }
    routes[state.route].push({ lastWord: state.lastWord, file: state.name })
    state.index++
    state.name = ''
    state.path = ''
    state.bytes = 0
    state.rows = 0
    state.lastWord = ''
    state.pending = ''
    state.pendingBytes = 0
    state.hash = createHash('sha256')
  }

  function add(route, row) {
    if (openRoute && openRoute !== route) close(stateFor(openRoute))
    openRoute = route
    const state = stateFor(route)
    const line = jsonLine(row)
    const bytes = Buffer.byteLength(line)
    if (bytes >= MAX_FILE_SIZE) {
      throw new Error(`${row.word} 单条 JSONL 达到 Cloudflare Pages 25 MiB 限制`)
    }
    if (bytes > MAIN_TARGET_SIZE && state.rows > 0) finishShard(state)
    if (state.rows > 0 && state.bytes + bytes > MAIN_TARGET_SIZE) finishShard(state)
    state.pending += line
    state.pendingBytes += bytes
    state.bytes += bytes
    state.rows++
    state.lastWord = row.word
    state.hash.update(line)
    if (state.pendingBytes >= WRITE_BUFFER_SIZE) flush(state)
    if (bytes > MAIN_TARGET_SIZE) finishShard(state)
  }

  function finish() {
    for (const state of states.values()) finishShard(state)
    return { files, routes }
  }

  return { add, finish }
}

async function build() {
  if (!existsSync(SOURCE_CSV)) throw new Error(`完整词典源文件不存在: ${SOURCE_CSV}`)
  rmSync(MAIN_DIR, { recursive: true, force: true })
  rmSync(HOT_DIR, { recursive: true, force: true })
  rmSync(MANIFEST_PATH, { force: true })
  mkdirSync(MAIN_DIR, { recursive: true })
  mkdirSync(HOT_DIR, { recursive: true })

  const mainWriter = createMainWriter()
  const hotBuffers = new Map(allHotRoutes().map(route => [route, []]))
  const progress = new Progress(EXPECTED_SOURCE_ROWS, 'ECDICT JSONL')
  let sourceRows = 0
  let mainRows = 0
  let hotRows = 0
  let previousWord = ''

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
      if (!row) throw new Error(`第 ${sourceRows} 行缺少 word`)
      if (previousWord && row.word <= previousWord) {
        const reason = row.word === previousWord ? '重复' : '未排序'
        throw new Error(`ECDICT 源数据${reason}：${previousWord} -> ${row.word}`)
      }
      previousWord = row.word
      mainWriter.add(getShardRoute(row.word), row)
      mainRows++
      if (isHotWord(row)) {
        hotBuffers.get(getHotRoute(row.word)).push(jsonLine(toHotRecord(row)))
        hotRows++
      }
    })
    parser.on('end', resolve)
    parser.on('error', reject)
    createReadStream(SOURCE_CSV, {
      encoding: 'utf8',
      highWaterMark: 2 * 1024 * 1024,
    }).pipe(parser)
  })
  progress.done()

  if (sourceRows !== EXPECTED_SOURCE_ROWS || mainRows !== EXPECTED_SOURCE_ROWS) {
    throw new Error(`ECDICT 计数不符：source=${sourceRows}, main=${mainRows}`)
  }

  const main = mainWriter.finish()
  const hot = {}
  let writtenHotRows = 0
  for (const route of allHotRoutes()) {
    const name = `${route}.jsonl`
    const lines = hotBuffers.get(route)
    const path = join(HOT_DIR, name)
    const result = writeJsonLines(path, lines)
    hot[name] = {
      url: `/dicts/hot/${name}`,
      bytes: result.bytes,
      rows: lines.length,
      sha256: result.sha256,
    }
    writtenHotRows += lines.length
  }
  if (writtenHotRows !== hotRows) throw new Error(`Hot 计数不符：${writtenHotRows} != ${hotRows}`)

  const versionHash = createHash('sha256')
  for (const [name, meta] of Object.entries(main.files).sort()) versionHash.update(`${name}:${meta.sha256};`)
  for (const [name, meta] of Object.entries(hot).sort()) versionHash.update(`${name}:${meta.sha256};`)
  const manifest = {
    schemaVersion: 3,
    format: 'jsonl',
    version: versionHash.digest('hex').slice(0, 16),
    source: 'ECDICT/stardict.7z',
    sourceRows,
    hotRows,
    mainTargetBytes: MAIN_TARGET_SIZE,
    main: main.files,
    mainRoutes: main.routes,
    hot,
  }
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest))

  const largest = Object.entries(main.files).sort((a, b) => b[1].bytes - a[1].bytes)[0]
  log(`主词条: ${mainRows}，JSONL 分片: ${Object.keys(main.files).length}`)
  log(`最大 Main 分片: ${largest[0]} ${(largest[1].bytes / 1024).toFixed(0)} KiB`)
  log(`Hot 词条: ${hotRows}，Hot 分片: ${Object.keys(hot).length}`)
  log(`词典版本: ${manifest.version}`)
}

build().catch(error => {
  console.error(error)
  process.exitCode = 1
})
