export interface DictionaryShardMeta {
  url: string
  bytes: number
  rows: number
  sha256: string
  oversized?: boolean
}

export interface DictionaryMainRoute {
  lastWord: string
  file: string
}

export interface DictionaryManifest {
  schemaVersion: number
  format: 'jsonl'
  version: string
  source: string
  sourceRows: number
  hotRows: number
  mainTargetBytes: number
  main: Record<string, DictionaryShardMeta>
  mainRoutes: Record<string, DictionaryMainRoute[]>
  hot: Record<string, DictionaryShardMeta>
}

let manifestPromise: Promise<DictionaryManifest> | null = null

export function getDictionaryManifest(): Promise<DictionaryManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch('/dicts/manifest.json', { cache: 'no-cache' })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`词典 manifest 加载失败: HTTP ${response.status}。若尚未构建词表，请在终端运行 \`npm run build:data\`。`)
        }
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('text/html')) {
          throw new Error('词典 manifest 不存在 (返回了 HTML 页面)。请先运行 \`npm run build:data\` 生成词典数据。')
        }
        const manifest = await response.json() as DictionaryManifest
        if (manifest.schemaVersion !== 3 || manifest.format !== 'jsonl' || !manifest.mainRoutes) {
          throw new Error('词典 manifest 格式不受支持，请重新运行 `npm run build:data`。')
        }
        return manifest
      })
      .catch(error => {
        manifestPromise = null
        throw error
      })
  }
  return manifestPromise
}
