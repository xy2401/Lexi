/** Download, verify, and extract Open English WordNet 2025 Core. */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'data', 'wordnet-raw')
const ARCHIVE_PATH = join(DATA_DIR, 'english-wordnet-2025-json.zip')
const SOURCE_DIR = join(DATA_DIR, 'extracted')

export const WORDNET_VERSION = '2025'
export const WORDNET_SOURCE_URL = 'https://en-word.net/static/english-wordnet-2025-json.zip'
export const WORDNET_SOURCE_SHA256 = '7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51'

function log(message) {
  console.log(`[WordNet] ${message}`)
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function hasCompleteSource() {
  if (!existsSync(SOURCE_DIR)) return false
  const files = readdirSync(SOURCE_DIR).filter(name => name.endsWith('.json'))
  return files.length === 73 && files.includes('frames.json') && files.includes('entries-a.json')
}

async function downloadArchive() {
  if (existsSync(ARCHIVE_PATH)) {
    const digest = sha256(ARCHIVE_PATH)
    if (digest !== WORDNET_SOURCE_SHA256) {
      throw new Error(`已有压缩包 SHA-256 不匹配：${digest}`)
    }
    log('压缩包已存在并通过 SHA-256 校验')
    return
  }

  log(`下载 ${WORDNET_SOURCE_URL}`)
  const response = await fetch(WORDNET_SOURCE_URL)
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== WORDNET_SOURCE_SHA256) {
    throw new Error(`下载内容 SHA-256 不匹配：${digest}`)
  }
  writeFileSync(ARCHIVE_PATH, bytes)
  log(`下载完成：${bytes.length.toLocaleString()} bytes`)
}

async function extractArchive() {
  if (hasCompleteSource()) {
    log('73 个 JSON 源文件已存在，跳过解压')
    return
  }

  rmSync(SOURCE_DIR, { recursive: true, force: true })
  mkdirSync(SOURCE_DIR, { recursive: true })
  const require = createRequire(import.meta.url)
  const seven = require('7zip-min')
  await new Promise((resolve, reject) => {
    seven.unpack(ARCHIVE_PATH, SOURCE_DIR, error => error ? reject(error) : resolve())
  })

  if (!hasCompleteSource()) {
    throw new Error('解压结果不完整：预期在 extracted/ 下找到 73 个 JSON 文件')
  }
  log('解压完成：73 个 JSON 文件')
}

mkdirSync(DATA_DIR, { recursive: true })
await downloadArchive()
await extractArchive()
