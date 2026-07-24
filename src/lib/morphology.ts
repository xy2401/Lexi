/**
 * 智能形态还原 (Morphological Restoration)
 * 
 * 解析 ECDICT exchange 字段，构建变形词 -> 原型的反向索引
 * exchange 格式: "p:proved/d:proved/i:proving/3:proves/s:proves"
 * 键含义: p=过去式, d=过去分词, i=现在分词, 3=三单, r=比较级, t=最高级, s=复数, 0=原型
 */

// 反向索引: 变形词 -> 原型
const reverseIndex = new Map<string, string>()

/**
 * 解析 exchange 字段，返回变形映射
 */
export function parseExchange(exchange: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!exchange) return result

  for (const part of exchange.split('/')) {
    const idx = part.indexOf(':')
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key && value) {
      result[key] = value
    }
  }
  return result
}

/**
 * exchange 键的中文含义
 */
export const EXCHANGE_LABELS: Record<string, string> = {
  p: '过去式',
  d: '过去分词',
  i: '现在分词',
  '3': '三单',
  r: '比较级',
  t: '最高级',
  s: '复数',
  '0': '原型',
  '1': '类别',
}

/**
 * 从热数据构建反向索引
 * 应在热数据加载完成后调用一次
 */
export function buildReverseIndex(words: Array<{ word: string; exchange: string }>): void {
  reverseIndex.clear()

  for (const { word, exchange } of words) {
    if (!exchange) continue
    const forms = parseExchange(exchange)
    for (const [, form] of Object.entries(forms)) {
      // 变形词 -> 原型
      const lowerForm = form.toLowerCase()
      if (lowerForm && lowerForm !== word.toLowerCase()) {
        reverseIndex.set(lowerForm, word.toLowerCase())
      }
    }
  }
}

/**
 * 尝试还原变形词为原型
 * @returns 原型词，若无法还原则返回原词
 */
export function restoreBase(word: string): string {
  const lower = word.toLowerCase()
  return reverseIndex.get(lower) || lower
}

/**
 * 获取反向索引大小（调试用）
 */
export function getReverseIndexSize(): number {
  return reverseIndex.size
}
