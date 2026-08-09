export interface WordNetManifestFile {
  kind: 'entries' | 'synsets' | 'frames'
  url: string
  bytes: number
  sha256: string
  entries?: number
  senses?: number
  synsets?: number
  relations?: number
  frames?: number
}

export interface WordNetManifest {
  schemaVersion: number
  version: string
  source: {
    name: string
    version: string
    url: string
    sha256: string
    license: string
    licenseUrl: string
  }
  pageSize: number
  generatedAt: string
  stats: {
    lexicalEntries: number
    senses: number
    senseRelations: number
    synsets: number
    synsetRelations: number
    inferredSynsetRelations: number
    frames: number
  }
  files: Record<string, WordNetManifestFile>
}

let manifestPromise: Promise<WordNetManifest> | null = null

export function getWordNetManifest(): Promise<WordNetManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch('/dicts/wordnet-manifest.json', { cache: 'no-cache' })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`WordNet manifest 加载失败：HTTP ${response.status}。请运行 \`npm run build:wordnet\`。`)
        }
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('text/html')) {
          throw new Error('WordNet manifest 不存在（收到 HTML fallback）。请运行 `npm run build:wordnet`。')
        }
        const manifest = await response.json() as WordNetManifest
        if (manifest.schemaVersion !== 1 || !manifest.files || !manifest.version) {
          throw new Error('WordNet manifest 格式不受支持')
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
