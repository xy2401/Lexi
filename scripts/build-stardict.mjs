/**
 * 脚本 B: Stardict CSV -> SQLite 分片矩阵
 * 
 * 流式读取 data/stardict-raw/stardict.csv，按两字前缀归仓算法
 * 将词条的完整释义内容写入 public/dicts/stardict/{prefix}.db
 * 
 * 表结构:
 *   words(word TEXT PK, html_content TEXT)
 * 
 * html_content 由 definition + translation + phonetic + pos 组合为格式化 HTML
 */

import { createReadStream } from 'fs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse';
import initSqlJs from 'sql.js';
import { getDbName, Progress, log } from './utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, 'data', 'stardict-raw', 'stardict.csv');
const OUT_DIR = join(ROOT, 'public', 'dicts', 'stardict');

const BATCH_SIZE = 2000;

/**
 * 将 CSV 记录组合为格式化 HTML 内容
 */
function buildHtmlContent(row) {
  const parts = [];

  // 音标
  if (row.phonetic) {
    parts.push(`<div class="phonetic">/${escapeHtml(row.phonetic)}/</div>`);
  }

  // 英文释义 (definition)
  if (row.definition) {
    const defs = row.definition.split('\\n').filter(d => d.trim());
    if (defs.length > 0) {
      parts.push('<div class="definition"><h4>Definition</h4><ol>');
      for (const d of defs) {
        parts.push(`<li>${escapeHtml(d.trim())}</li>`);
      }
      parts.push('</ol></div>');
    }
  }

  // 中文翻译 (translation)
  if (row.translation) {
    const trans = row.translation.split('\\n').filter(t => t.trim());
    if (trans.length > 0) {
      parts.push('<div class="translation"><h4>翻译</h4><ul>');
      for (const t of trans) {
        parts.push(`<li>${escapeHtml(t.trim())}</li>`);
      }
      parts.push('</ul></div>');
    }
  }

  // 词性
  if (row.pos) {
    parts.push(`<div class="pos">${escapeHtml(row.pos)}</div>`);
  }

  return parts.join('\n');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function main() {
  log('初始化 sql.js ...');
  const SQL = await initSqlJs();

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const buffers = new Map();
  const dbCounts = new Map();
  let totalRecords = 0;

  const progress = new Progress(770000, 'Stardict');

  function flushShard(dbName) {
    const records = buffers.get(dbName);
    if (!records || records.length === 0) return;

    const dbPath = join(OUT_DIR, dbName);
    let db;

    if (existsSync(dbPath)) {
      const existing = readFileSync(dbPath);
      db = new SQL.Database(existing);
    } else {
      db = new SQL.Database();
      db.run(`
        CREATE TABLE IF NOT EXISTS words (
          word TEXT PRIMARY KEY,
          html_content TEXT
        );
      `);
    }

    const stmt = db.prepare(
      'INSERT OR REPLACE INTO words (word, html_content) VALUES (?, ?)'
    );

    for (const rec of records) {
      stmt.run(rec);
    }
    stmt.free();

    const data = db.export();
    writeFileSync(dbPath, Buffer.from(data));
    db.close();

    const prev = dbCounts.get(dbName) || 0;
    dbCounts.set(dbName, prev + records.length);
    buffers.set(dbName, []);
  }

  log(`开始处理: ${CSV_PATH}`);

  await new Promise((resolve, reject) => {
    const parser = parse({
      columns: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    });

    const stream = createReadStream(CSV_PATH, { encoding: 'utf-8', highWaterMark: 2 * 1024 * 1024 });

    parser.on('data', (row) => {
      const word = row.word;
      if (!word) return;

      totalRecords++;
      progress.tick();

      const htmlContent = buildHtmlContent(row);
      // 跳过无任何有效内容的词条
      if (!htmlContent) return;

      const dbName = getDbName(word);

      if (!buffers.has(dbName)) {
        buffers.set(dbName, []);
      }
      buffers.get(dbName).push([word, htmlContent]);

      if (buffers.get(dbName).length >= BATCH_SIZE) {
        flushShard(dbName);
      }
    });

    parser.on('end', resolve);
    parser.on('error', reject);
    stream.pipe(parser);
  });

  log('刷入剩余缓冲 ...');
  for (const dbName of buffers.keys()) {
    flushShard(dbName);
  }

  progress.done();
  log(`分片总数: ${dbCounts.size}`);
  log(`词条总数: ${totalRecords}`);

  // 验证
  let maxFileSize = 0;
  for (const [dbName] of dbCounts) {
    const dbPath = join(OUT_DIR, dbName);
    const size = readFileSync(dbPath).length;
    if (size > maxFileSize) maxFileSize = size;
  }
  log(`最大分片文件: ${(maxFileSize / 1024 / 1024).toFixed(2)} MB`);
  log('Stardict 切片完成!');
}

main().catch(console.error);
