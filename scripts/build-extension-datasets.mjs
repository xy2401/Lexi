import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ECDICT_DIR = join(ROOT, 'data', 'ECDICT')
const PUBLIC_DATA_DIR = join(ROOT, 'public', 'data')

if (!existsSync(PUBLIC_DATA_DIR)) {
  mkdirSync(PUBLIC_DATA_DIR, { recursive: true })
}

console.log('[build-extensions] Starting dataset processing...')

// 1. Process wordroot.txt
function buildWordRoot() {
  const filePath = join(ECDICT_DIR, 'wordroot.txt')
  if (!existsSync(filePath)) {
    console.warn(`[build-extensions] File missing: ${filePath}`)
    return
  }

  const raw = readFileSync(filePath, 'utf8')
  const json = JSON.parse(raw)
  const list = []

  for (const [key, item] of Object.entries(json)) {
    list.push({
      key,
      root: item.root || key,
      meaning: item.meaning || '',
      class: item.class || 'root',
      origin: item.origin || '',
      examples: Array.isArray(item.example) ? item.example : [],
      synonyms: item.synonyms || '',
      antonyms: item.antonyms || '',
    })
  }

  const outputPath = join(PUBLIC_DATA_DIR, 'wordroot.json')
  writeFileSync(outputPath, JSON.stringify(list))
  console.log(`[build-extensions] Exported wordroot.json: ${list.length} entries`)
}

// 2. Process resemble.txt
function buildResemble() {
  const filePath = join(ECDICT_DIR, 'resemble.txt')
  if (!existsSync(filePath)) {
    console.warn(`[build-extensions] File missing: ${filePath}`)
    return
  }

  const content = readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)
  const list = []

  let currentWords = []
  let currentLines = []

  for (let line of lines) {
    line = line.trim()
    if (line.startsWith('%')) {
      if (currentWords.length > 0) {
        list.push({
          words: currentWords,
          explanation: currentLines.join('\n').trim(),
        })
      }
      const rawWords = line.slice(1).trim()
      currentWords = rawWords.split(',').map(w => w.trim()).filter(Boolean)
      currentLines = []
    } else if (line) {
      currentLines.push(line)
    }
  }

  if (currentWords.length > 0) {
    list.push({
      words: currentWords,
      explanation: currentLines.join('\n').trim(),
    })
  }

  const outputPath = join(PUBLIC_DATA_DIR, 'resemble.json')
  writeFileSync(outputPath, JSON.stringify(list))
  console.log(`[build-extensions] Exported resemble.json: ${list.length} groups`)
}

// 3. Process lemma.en.txt into ultra-compact tuple array: [lemma, frequency, variants]
function buildLemma() {
  const filePath = join(ECDICT_DIR, 'lemma.en.txt')
  if (!existsSync(filePath)) {
    console.warn(`[build-extensions] File missing: ${filePath}`)
    return
  }

  const content = readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)
  const entries = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith(';')) continue

    // Format: be/4109826 -> is,was,are,were,'s,been,being,'re,'m,am,m
    const arrowIdx = trimmed.indexOf('->')
    if (arrowIdx === -1) continue

    const left = trimmed.slice(0, arrowIdx).trim()
    const right = trimmed.slice(arrowIdx + 2).trim()

    const [lemma, frqStr] = left.split('/')
    const frequency = parseInt(frqStr || '0', 10)
    const rawVariants = right.split(',').map(v => v.trim()).filter(Boolean)

    entries.push([lemma, frequency, rawVariants])
  }

  const outputPath = join(PUBLIC_DATA_DIR, 'lemma.json')
  writeFileSync(outputPath, JSON.stringify(entries))
  console.log(`[build-extensions] Exported compact lemma.json: ${entries.length} families`)
}

try {
  buildWordRoot()
  buildResemble()
  buildLemma()
  console.log('[build-extensions] Successfully built all extension datasets!')
} catch (err) {
  console.error('[build-extensions] Error building datasets:', err)
  process.exit(1)
}
