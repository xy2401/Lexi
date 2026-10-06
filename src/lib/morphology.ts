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
  '3': '第三人称单数',
  r: '比较级',
  t: '最高级',
  s: '名词复数',
  '0': '原型',
  '1': '类别',
}

interface MorphologyEntry {
  word?: string
  exchange?: string
  translation?: string
  pos?: string
}

/** ECDICT 的 exchange 混有不同词义的变形；只展示词性支持的标签。 */
export function getWordForms(entry: MorphologyEntry | null, includeBase = false) {
  if (!entry?.exchange) return []
  const parts = new Set<string>()
  for (const match of (entry.pos || '').matchAll(/(?:^|\/)([a-z]+):/gi)) {
    parts.add(match[1].toLowerCase())
  }
  const translation = (entry.translation || '').replace(/\\n/g, '\n')
  for (const match of translation.matchAll(/(?:^|\n)\s*(pron|aux|adj|adv|vt|vi|v|n|a)\./gi)) {
    parts.add(match[1].toLowerCase())
  }
  const noun = parts.has('n')
  const verb = ['v', 'vt', 'vi', 'aux'].some(part => parts.has(part))
  const comparative = ['a', 'adj', 'ad', 'adv'].some(part => parts.has(part))
  const pronoun = parts.has('p') || parts.has('pron')

  return Object.entries(parseExchange(entry.exchange)).flatMap(([key, value]) => {
    if (!(key in EXCHANGE_LABELS) || key === '1') return []
    if (key === '0' && (!includeBase || pronoun)) return []
    if (key === 's') {
      // I → is 来自字母名等词义，不能当作代词“我”的复数。
      const word = entry.word?.toLowerCase() || ''
      if (pronoun && ['i', 'he', 'she', 'it', 'we', 'you', 'they'].includes(word)) {
        if (['he', 'she', 'it'].includes(word) && value === 'they') {
          return [{ key, label: '对应复数代词', value }]
        }
        return []
      }
      if (!noun) return []
    }
    if (['p', 'd', 'i', '3'].includes(key) && !verb) return []
    if (['r', 't'].includes(key) && !comparative) return []
    return [{ key, label: EXCHANGE_LABELS[key], value }]
  })
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
