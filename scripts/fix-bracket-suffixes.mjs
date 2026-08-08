import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const courseDir = resolve(root, 'public/data/duolingo-zs-en')

// 清理句尾的括号追加尾缀：如 "tired (at night)." -> "tired."
// 匹配：任何以 (word(s)) 结尾紧跟句号的情况，包括问号后追加 "(word)."
function cleanBracketSuffix(line) {
  return line
    // 匹配末尾 (xxx). 或 ?(xxx). 或 ?(xxx).  等
    .replace(/\s*\([a-zA-Z0-9''_ -]+\)\.?$/g, '')
    // 修复 "?." -> "?"
    .replace(/\?\.$/, '?')
    // 修复 "!." -> "!"
    .replace(/!\.$/, '!')
    // 如果清理后没有结尾标点，补上句号
    .replace(/([a-zA-Z0-9'"])$/, '$1.')
    .trim()
}

let totalFixed = 0
let filesFixed = 0

const files = readdirSync(courseDir).filter(f => f.endsWith('.md'))

for (const filename of files) {
  const filePath = resolve(courseDir, filename)
  const raw = readFileSync(filePath, 'utf8')
  const lines = raw.split(/\r?\n/)
  let changed = false

  const updatedLines = lines.map(line => {
    // 只处理英文句子所在行（排除解析行、中文行、选项行、标题行、quiz标签行）
    if (
      line.trim().startsWith('>') ||
      line.trim().startsWith('-') ||
      line.trim().startsWith('#') ||
      line.trim().startsWith('<') ||
      line.trim().startsWith('|') ||
      !line.trim()
    ) return line

    // 检查是否有括号追加的尾缀
    if (/\([a-zA-Z0-9''_ -]+\)\.?$/.test(line.trim())) {
      const fixed = line.replace(/(\S.*?)\s*\([a-zA-Z0-9''_ -]+\)\.?(\s*)$/, (_, before, trail) => {
        let cleaned = before.trim()
        // 修复末尾标点
        cleaned = cleaned.replace(/\?\.$/, '?').replace(/!\.$/, '!')
        if (!/[.?!]$/.test(cleaned)) cleaned += '.'
        return cleaned + trail
      })
      if (fixed !== line) {
        totalFixed++
        changed = true
        return fixed
      }
    }
    return line
  })

  if (changed) {
    filesFixed++
    writeFileSync(filePath, updatedLines.join('\n'), 'utf8')
  }
}

console.log(`[fix-bracket-suffixes] Fixed ${totalFixed} lines across ${filesFixed} files.`)
