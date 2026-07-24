/**
 * 多邻国词汇抓取脚本
 * 从 duome.eu 抓取指定课程的所有单元词汇，导出为 JSON
 *
 * 用法：
 *   npx playwright install chromium  （首次）
 *   node scripts/fetch-duolingo.mjs [url] [output]
 *
 * 默认：
 *   url    = https://duome.eu/vocabulary/zs/en/skills
 *   output = public/data/duolingo-zs-en.json
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const url = process.argv[2] || 'https://duome.eu/vocabulary/zs/en/skills'
const output = process.argv[3] || resolve(root, 'public/data/duolingo-zs-en.json')

async function main() {
  console.log(`🚀 启动浏览器...`)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  console.log(`📡 加载: ${url}`)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })

  console.log(`🔍 提取数据...`)
  const units = await page.evaluate(() => {
    const items = document.querySelectorAll('#words > ul > li')
    const units = []
    let current = null

    for (const li of items) {
      const delimiter = li.querySelector('.path-section-delimiter')
      if (delimiter) {
        const span = delimiter.querySelector('span[title]')
        if (span) {
          const fullText = span.textContent.trim()
          const label = span.querySelector('.small-label')
          const name = label ? label.textContent.trim() : ''
          const numMatch = fullText.match(/^(\d+)/)
          const id = numMatch ? parseInt(numMatch[1]) : units.length + 1
          let desc = ''
          if (label) {
            desc = fullText.replace(/^\d+\s*/, '').replace(name, '').trim()
          }
          current = { id, name, desc, words: [] }
          units.push(current)
        }
      } else if (current) {
        const text = li.textContent.trim()
        const word = text.split(' - ')[0].trim()
        if (word) current.words.push(word)
      }
    }
    return units
  })

  await browser.close()

  const totalWords = units.reduce((s, u) => s + u.words.length, 0)
  console.log(`✅ 提取完成: ${units.length} 个单元, ${totalWords} 个词`)

  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, JSON.stringify(units, null, 2), 'utf8')
  console.log(`💾 已保存: ${output}`)
}

main().catch(err => {
  console.error('❌ 失败:', err.message)
  process.exit(1)
})
