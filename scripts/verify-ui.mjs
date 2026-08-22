import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const SHOT_DIR = join(tmpdir(), 'lexi-shots')
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

// ---------- Mobile: app navigation and immersive course reader ----------
async function verifyMobile(width, height, label) {
  const mobile = await browser.newPage({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  })
  mobile.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(`[${label}] ${msg.text()}`) })
  mobile.on('pageerror', err => consoleErrors.push(`[${label}] ${String(err)}`))

  await mobile.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
  await mobile.locator('.mobile-tab-item').filter({ hasText: '课程' }).click()
  await mobile.waitForSelector('.mobile-course-card:visible', { timeout: 15000 })
  assert.equal(await mobile.locator('.mobile-course-library:visible').count(), 1, `${label}: 应显示课程库`)
  assert.equal(await mobile.locator('.mobile-course-library .markdown-body').count(), 0, `${label}: 课程库不应渲染讲义`)
  await mobile.screenshot({ path: join(SHOT_DIR, `${label}-course-library.png`), fullPage: false })

  await mobile.locator('.mobile-course-card').first().click()
  await mobile.waitForSelector('.mobile-course-reader .markdown-body:visible', { timeout: 20000 })
  assert.equal(await mobile.locator('.mobile-tab-bar:visible').count(), 0, `${label}: 阅读时应隐藏全局底栏`)
  assert.equal(await mobile.locator('.mobile-reader-toolbar:visible').count(), 1, `${label}: 应显示阅读工具栏`)
  assert.equal(await mobile.locator('.mobile-lesson-nav button').first().isDisabled(), true, `${label}: 第一课上一课应禁用`)
  await mobile.screenshot({ path: join(SHOT_DIR, `${label}-course-reader.png`), fullPage: false })

  const tocButton = mobile.locator('.toc-trigger')
  await tocButton.click()
  await mobile.waitForSelector('.course-toc-sheet:visible')
  const tocItems = mobile.locator('.mobile-toc-nav button')
  assert.ok(await tocItems.count() > 0, `${label}: 目录不应为空`)
  await tocItems.nth(Math.min(1, (await tocItems.count()) - 1)).click()
  await mobile.waitForSelector('.course-toc-sheet', { state: 'detached' })

  await mobile.locator('button[aria-label="返回课程库"]').click()
  await mobile.waitForSelector('.mobile-course-library:visible')
  assert.equal(await mobile.locator('.mobile-tab-bar:visible').count(), 1, `${label}: 返回课程库后应恢复底栏`)
  assert.equal(await mobile.locator('.continue-card:visible').count(), 1, `${label}: 应显示继续学习卡片`)

  // 词典：索引与词条详情分层，详情接管全局导航。
  await mobile.locator('.mobile-tab-item').filter({ hasText: '词典' }).click()
  await mobile.waitForSelector('.explorer-left:visible')
  await mobile.locator('.explorer-left .word-item').first().click()
  await mobile.waitForSelector('.explorer-layout.mobile-detail-open')
  assert.equal(await mobile.locator('.mobile-detail-bar:visible').count(), 1, `${label}: 词条详情应显示独立工具栏`)
  assert.equal(await mobile.locator('.mobile-tab-bar:visible').count(), 0, `${label}: 词条详情应隐藏底栏`)
  await mobile.locator('button[aria-label="返回词典索引"]').click()
  await mobile.waitForSelector('.explorer-left:visible')

  // 多邻国：单元库与学习页分层。
  await mobile.locator('.mobile-tab-item').filter({ hasText: '多邻国' }).click()
  await mobile.waitForSelector('.unit-card:visible')
  await mobile.locator('.unit-card').first().click()
  await mobile.waitForSelector('.duolingo-view.is-mobile-unit')
  assert.equal(await mobile.locator('.mobile-unit-bar:visible').count(), 1, `${label}: 单元页应显示独立工具栏`)
  assert.equal(await mobile.locator('.mobile-tab-bar:visible').count(), 0, `${label}: 单元页应隐藏底栏`)
  await mobile.locator('button[aria-label="返回单元列表"]').click()
  await mobile.waitForSelector('.unit-list:visible')

  // WordNet：词义列表与语义图分层，图表只在自身容器处理宽度。
  await mobile.getByRole('button', { name: '更多', exact: true }).click()
  await mobile.getByRole('button', { name: '语义网络', exact: true }).click()
  await mobile.waitForSelector('.sense-card:visible', { timeout: 15000 })
  await mobile.locator('.sense-card').first().click()
  await mobile.waitForSelector('.wordnet-view.is-mobile-graph')
  assert.equal(await mobile.locator('.mobile-graph-bar:visible').count(), 1, `${label}: 语义图应显示独立工具栏`)
  assert.equal(await mobile.locator('.mobile-tab-bar:visible').count(), 0, `${label}: 语义图应隐藏底栏`)
  await mobile.locator('button[aria-label="返回词义列表"]').click()
  await mobile.waitForSelector('.sense-panel:visible')

  const horizontalOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  assert.equal(horizontalOverflow, false, `${label}: 页面不应整体水平溢出`)
  console.log(`${label} 移动端课程体验: OK`)
  await mobile.close()
}

await verifyMobile(390, 844, '390x844')
await verifyMobile(360, 800, '360x800')

await browser.close()
console.log('---')
console.log('console 错误:', consoleErrors.length ? consoleErrors.slice(0, 5) : '无')
console.log('截图已保存到', SHOT_DIR)
