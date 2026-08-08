export interface DictionaryShardMeta {
  url: string
  bytes: number
  rows: number
  hash: string
}

export interface DictionaryManifest {
  version: string
  source: string
  pageSize: number
  sourceRows: number
  hotRows: number
  main: Record<string, DictionaryShardMeta>
  hot: Record<string, DictionaryShardMeta>
}

let manifestPromise: Promise<DictionaryManifest> | null = null

export function getDictionaryManifest(): Promise<DictionaryManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch('/dicts/manifest.json', { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`词典 manifest 加载失败: HTTP ${response.status}`)
        return response.json() as Promise<DictionaryManifest>
      })
      .catch(error => {
        manifestPromise = null
        throw error
      })
  }
  return manifestPromise
}
