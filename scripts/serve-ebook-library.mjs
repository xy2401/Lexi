import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { Command } from 'commander'

const program = new Command()
  .option('--root <path>', 'ebook library root')
  .option('--host <host>', 'listen host', '0.0.0.0')
  .option('--port <port>', 'listen port', '8000')
  .parse()

const options = program.opts()
if (!options.root) {
  console.error('缺少 --root，示例：npm run dev:library -- --root "D:\\Ebooks"')
  process.exit(1)
}

const root = resolve(options.root)
if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`书库目录不存在：${root}`)
  process.exit(1)
}

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.htm', 'text/html; charset=utf-8'],
  ['.xhtml', 'application/xhtml+xml; charset=utf-8'], ['.xml', 'application/xml; charset=utf-8'],
  ['.opf', 'application/oebps-package+xml; charset=utf-8'], ['.ncx', 'application/x-dtbncx+xml; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.svg', 'image/svg+xml'], ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'], ['.webp', 'image/webp'],
  ['.woff', 'font/woff'], ['.woff2', 'font/woff2'], ['.ttf', 'font/ttf'], ['.otf', 'font/otf'],
  ['.epub', 'application/epub+zip'],
])

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
  }
}

const server = createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders())
    response.end()
    return
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { ...corsHeaders(), Allow: 'GET, HEAD, OPTIONS' })
    response.end('Method Not Allowed')
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname)
  } catch {
    response.writeHead(400, corsHeaders())
    response.end('Bad Request')
    return
  }
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const filePath = resolve(root, relativePath)
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    response.writeHead(403, corsHeaders())
    response.end('Forbidden')
    return
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, corsHeaders())
    response.end('Not Found')
    return
  }

  const stat = statSync(filePath)
  response.writeHead(200, {
    ...corsHeaders(),
    'Content-Type': mimeTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
    'Content-Length': String(stat.size),
    'Last-Modified': stat.mtime.toUTCString(),
    'Cache-Control': 'no-cache',
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(filePath).pipe(response)
})

server.listen(Number(options.port), options.host, () => {
  console.log(`[ebook-library] ${root}`)
  console.log(`[ebook-library] http://localhost:${options.port}/ (CORS enabled)`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
