/** Validate generated ECDICT and Open English WordNet deployment assets. */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DICT_ROOT = join(ROOT, 'public', 'dicts')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readJson(name) {
  const path = join(DICT_ROOT, name)
  assert(existsSync(path), `${name} 不存在`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function verifyFile(directory, name, expectedBytes) {
  const path = join(DICT_ROOT, directory, name)
  assert(existsSync(path), `${directory}/${name} 不存在`)
  const bytes = statSync(path).size
  assert(bytes === expectedBytes, `${directory}/${name} 字节数不符：${bytes} != ${expectedBytes}`)
  return { path, bytes }
}

function validateEcdict() {
  const manifest = readJson('manifest.json')
  assert(manifest.schemaVersion === 2, `ECDICT schemaVersion 不受支持：${manifest.schemaVersion}`)

  let mainRows = 0
  let mainMaxBytes = 0
  for (const [name, meta] of Object.entries(manifest.main)) {
    const { bytes } = verifyFile('main', name, meta.bytes)
    assert(bytes <= manifest.mainTargetBytes, `${name} 超过 Main 分片上限`)
    mainRows += meta.rows
    mainMaxBytes = Math.max(mainMaxBytes, bytes)
  }
  assert(mainRows === manifest.sourceRows, `Main 总行数不符：${mainRows} != ${manifest.sourceRows}`)

  for (const [routeName, routes] of Object.entries(manifest.mainRoutes)) {
    let previous = ''
    for (const route of routes) {
      assert(manifest.main[route.file], `${routeName} 引用了不存在的 ${route.file}`)
      assert(!previous || !route.lastWord || previous <= route.lastWord, `${routeName} 的边界未排序`)
      const db = new Database(join(DICT_ROOT, 'main', route.file), { readonly: true })
      const lastRow = db.prepare('SELECT word FROM words ORDER BY word COLLATE NOCASE DESC, word DESC LIMIT 1').get()
      db.close()
      const actualLastWord = (lastRow?.word || '').trim().normalize('NFC').toLowerCase()
      assert(actualLastWord === route.lastWord, `${routeName}/${route.file} 的 lastWord 不符`)
      previous = route.lastWord
    }
  }

  let hotRows = 0
  for (const [name, meta] of Object.entries(manifest.hot)) {
    verifyFile('hot', name, meta.bytes)
    hotRows += meta.rows
  }
  assert(hotRows === manifest.hotRows, `Hot 总行数不符：${hotRows} != ${manifest.hotRows}`)

  return {
    version: manifest.version,
    mainFiles: Object.keys(manifest.main).length,
    mainRows,
    mainMaxKiB: mainMaxBytes / 1024,
    hotFiles: Object.keys(manifest.hot).length,
    hotRows,
  }
}

function validateWordNet() {
  const manifest = readJson('wordnet-manifest.json')
  assert(manifest.schemaVersion === 2, `WordNet schemaVersion 不受支持：${manifest.schemaVersion}`)
  const expected = { lexicalEntries: 135969, senses: 185129, synsets: 107519 }
  for (const [key, value] of Object.entries(expected)) {
    assert(manifest.stats[key] === value, `WordNet ${key} 不符：${manifest.stats[key]} != ${value}`)
  }

  const entryFiles = new Set()
  const synsetFiles = new Set()
  let entries = 0
  let senses = 0
  let synsets = 0
  let entryMaxBytes = 0
  let synsetMaxBytes = 0

  for (const [name, meta] of Object.entries(manifest.files)) {
    const { bytes } = verifyFile('wordnet', name, meta.bytes)
    if (meta.kind === 'entries') {
      assert(bytes <= manifest.entryTargetBytes, `${name} 超过 entry 分片上限`)
      entryFiles.add(name)
      entries += meta.entries
      senses += meta.senses
      entryMaxBytes = Math.max(entryMaxBytes, bytes)
    } else if (meta.kind === 'synsets') {
      assert(bytes <= manifest.synsetTargetBytes, `${name} 超过 synset 分片上限`)
      synsetFiles.add(name)
      synsets += meta.synsets
      synsetMaxBytes = Math.max(synsetMaxBytes, bytes)
    }
  }

  assert(entries === manifest.stats.lexicalEntries, `WordNet entry 总数不符：${entries}`)
  assert(senses === manifest.stats.senses, `WordNet sense 总数不符：${senses}`)
  assert(synsets === manifest.stats.synsets, `WordNet synset 总数不符：${synsets}`)

  const indexDb = new Database(join(DICT_ROOT, 'wordnet', 'index.db'), { readonly: true })
  for (const { entry_shard: shard } of indexDb.prepare('SELECT DISTINCT entry_shard FROM wordnet_lemma_index').iterate()) {
    assert(entryFiles.has(shard), `WordNet index 引用了不存在的 entry 分片：${shard}`)
  }
  const bankRoute = indexDb.prepare("SELECT entry_shard FROM wordnet_lemma_index WHERE lemma_key = 'bank'").get()
  indexDb.close()
  assert(bankRoute, 'WordNet index 缺少 bank')

  const bankDb = new Database(join(DICT_ROOT, 'wordnet', bankRoute.entry_shard), { readonly: true })
  const bankCounts = Object.fromEntries(bankDb.prepare(
    "SELECT pos, count(*) AS count FROM wordnet_senses WHERE lemma = 'bank' COLLATE NOCASE GROUP BY pos",
  ).all().map(row => [row.pos, row.count]))
  bankDb.close()
  assert(bankCounts.n === 10 && bankCounts.v === 8, `bank sense 数量不符：${JSON.stringify(bankCounts)}`)

  for (const name of entryFiles) {
    const db = new Database(join(DICT_ROOT, 'wordnet', name), { readonly: true })
    for (const { shard } of db.prepare('SELECT DISTINCT synset_shard AS shard FROM wordnet_senses').iterate()) {
      assert(synsetFiles.has(shard), `${name} 引用了不存在的 synset 分片：${shard}`)
    }
    for (const { shard } of db.prepare('SELECT DISTINCT target_shard AS shard FROM wordnet_sense_relations').iterate()) {
      assert(entryFiles.has(shard), `${name} 引用了不存在的 sense 目标分片：${shard}`)
    }
    db.close()
  }

  for (const name of synsetFiles) {
    const db = new Database(join(DICT_ROOT, 'wordnet', name), { readonly: true })
    for (const { shard } of db.prepare('SELECT DISTINCT target_shard AS shard FROM wordnet_synset_relations').iterate()) {
      assert(synsetFiles.has(shard), `${name} 引用了不存在的 synset 目标分片：${shard}`)
    }
    db.close()
  }

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
    bank: bankCounts,
  }
}

console.log(JSON.stringify({ ecdict: validateEcdict(), wordnet: validateWordNet() }, null, 2))
