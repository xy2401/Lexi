import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const SHOT_DIR = '/tmp/lexi-shots'
mkdirSync(SHOT_DIR, { recursive: true })

const browser = await chromium.launch()
const consoleErrors = []

// ---------- Desktop: lightbox verification ----------
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
page.on('pageerror', err => consoleErrors.push(String(err)))

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await page.click('button.tab-btn:has-text("系统课程")')
await page.waitForSelector('.unit-card:visible', { timeout: 15000 })
await page.waitForTimeout(300)
await page.screenshot({ path: `${SHOT_DIR}/01-desktop-course-list.png` })

const groups = await page.$$eval('.group-header', els => els.map(e => e.textContent?.trim()))
console.log('分组:', groups.join(' | '))

await page.click('.unit-card:has-text("高级句法")')
await page.waitForSelector('.markdown-body .mermaid-diagram svg', { timeout: 20000 })
await page.waitForTimeout(500)
await page.screenshot({ path: `${SHOT_DIR}/02-desktop-lecture.png` })

await page.click('.markdown-body .mermaid-diagram')
await page.waitForSelector('.mermaid-modal-overlay', { timeout: 5000 })
await page.waitForTimeout(400)

const metrics = await page.evaluate(() => {
  const svg = document.querySelector('.mermaid-zoom-stage svg')
  const holder = document.querySelector('.mermaid-svg-holder')
  const stage = document.querySelector('.mermaid-zoom-stage')
  const vb = svg?.viewBox?.baseVal
  return {
    viewBoxW: vb?.width,
    svgRenderedW: svg?.getBoundingClientRect().width,
    holderW: holder?.getBoundingClientRect().width,
    stageW: stage?.clientWidth,
    stageScrollWidth: stage?.scrollWidth,
    viewportW: window.innerWidth,
  }
})
const zoomText = (await page.textContent('.zoom-text'))?.trim()
console.log('打开灯箱: zoom =', zoomText, JSON.stringify(metrics))
await page.screenshot({ path: `${SHOT_DIR}/03-desktop-lightbox-fit.png` })

// zoom in via button
for (let i = 0; i < 3; i++) await page.click('button.tool-btn[title="放大 (+)"]')
await page.waitForTimeout(250)
console.log('点 + 三次后 zoom =', (await page.textContent('.zoom-text'))?.trim())
await page.screenshot({ path: `${SHOT_DIR}/04-desktop-lightbox-zoomed.png` })

// scroll the stage when zoomed
const scrolled = await page.evaluate(() => {
  const stage = document.querySelector('.mermaid-zoom-stage')
  if (!stage) return null
  stage.scrollTop = 200
  return { scrollTop: stage.scrollTop, scrollHeight: stage.scrollHeight, clientHeight: stage.clientHeight }
})
console.log('滚动测试:', JSON.stringify(scrolled))

// wheel zoom
await page.mouse.move(720, 500)
await page.mouse.wheel(0, -400)
await page.waitForTimeout(250)
console.log('滚轮放大后 zoom =', (await page.textContent('.zoom-text'))?.trim())

// fit button
await page.click('button.tool-btn[title="适应窗口"]')
await page.waitForTimeout(250)
console.log('⤢ 适应窗口后 zoom =', (await page.textContent('.zoom-text'))?.trim())

// 1:1
await page.click('button.tool-btn[title="原始尺寸 1:1"]')
await page.waitForTimeout(250)
console.log('1:1 后 zoom =', (await page.textContent('.zoom-text'))?.trim())

// Esc close
await page.keyboard.press('Escape')
await page.waitForSelector('.mermaid-modal-overlay', { state: 'detached', timeout: 3000 })
console.log('Esc 关闭灯箱: OK')

// word click → dictionary card (single word)
await page.click('.markdown-body code >> nth=0')
await page.waitForTimeout(800)
const tooltipVisible = await page.locator('.word-tooltip, .word-tooltip-card, [class*="tooltip"]').first().isVisible().catch(() => false)
console.log('点击单词后词典 Card 可见:', tooltipVisible)
await page.screenshot({ path: `${SHOT_DIR}/05-desktop-word-card.png` })

// ---------- Mobile: viewport check ----------
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
})
await mobile.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await mobile.waitForTimeout(600)
await mobile.screenshot({ path: `${SHOT_DIR}/06-mobile-home.png`, fullPage: false })

await mobile.click('button.tab-btn:has-text("系统课程")').catch(() => {})
await mobile.waitForTimeout(800)
await mobile.screenshot({ path: `${SHOT_DIR}/07-mobile-course-tab.png` })

const hasCourseCards = await mobile.locator('.unit-card:visible').count().catch(() => 0)
console.log('移动端课程卡片数量:', hasCourseCards)

if (hasCourseCards > 0) {
  await mobile.click('.unit-card:visible >> nth=0')
  await mobile.waitForTimeout(1500)
  await mobile.screenshot({ path: `${SHOT_DIR}/08-mobile-lecture.png` })

  const mermaidCount = await mobile.locator('.markdown-body .mermaid-diagram svg').count()
  if (mermaidCount > 0) {
    await mobile.click('.markdown-body .mermaid-diagram').catch(() => {})
    await mobile.waitForSelector('.mermaid-modal-overlay', { timeout: 5000 }).catch(() => {})
    await mobile.waitForTimeout(400)
    const mZoom = await mobile.textContent('.zoom-text').catch(() => '无')
    console.log('移动端灯箱 zoom =', mZoom?.trim())
    await mobile.screenshot({ path: `${SHOT_DIR}/09-mobile-lightbox.png` })
  } else {
    console.log('第一门课无 Mermaid 图，跳过移动端灯箱')
  }
}

const horizontalOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
console.log('移动端水平溢出:', horizontalOverflow)

await browser.close()
console.log('---')
console.log('console 错误:', consoleErrors.length ? consoleErrors.slice(0, 5) : '无')
console.log('截图已保存到', SHOT_DIR)
