/** Fetch and parse one complete UTF-8 JSON Lines shard. */
export async function fetchJsonLines<T>(
  url: string,
  version: string,
  expectedBytes: number,
): Promise<T[]> {
  const response = await fetch(`${url}?v=${encodeURIComponent(version)}`)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('text/html')) throw new Error(`${url}: 收到 HTML fallback`)

  const buffer = await response.arrayBuffer()
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(`${url}: 文件大小不符，预期 ${expectedBytes}，实际 ${buffer.byteLength}`)
  }

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new Error(`${url}: UTF-8 解码失败：${detail}`)
  }
  if (!text) return []

  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  const records: T[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!line) throw new Error(`${url}:${index + 1}: 不允许空行`)
    try {
      const record = JSON.parse(line) as T
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new Error('记录必须是 JSON 对象')
      }
      records.push(record)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      throw new Error(`${url}:${index + 1}: JSONL 解析失败：${detail}`)
    }
  }
  return records
}
