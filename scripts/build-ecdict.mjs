/**
 * 脚本 A: ECDICT CSV -> SQLite 分片矩阵
 * 
 * 流式读取 data/ECDICT/ecdict.csv，按两字前缀归仓算法
 * 将词条写入 public/dicts/ecdict/{prefix}.db
 * 
 * 表结构:
 *   words(word TEXT PK, frequency INTEGER, tags TEXT, exchange TEXT, phonetic TEXT, translation TEXT)
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
const CSV_PATH = join(ROOT, 'data', 'ECDICT', 'ecdict.csv');
const OUT_DIR = join(ROOT, 'public', 'dicts', 'ecdict');

// 每个分片的批次缓冲阈值
const BATCH_SIZE = 3000;

async function main() {
  log('初始化 sql.js ...');
  const SQL = await initSqlJs();

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  // 缓冲: dbName -> records[]
  const buffers = new Map();
  // 已写入计数: dbName -> count
  const dbCounts = new Map();
  let totalRecords = 0;

  const progress = new Progress(760000, 'ECDICT');

  /**
   * 将某个分片的缓冲刷入磁盘
   */
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
          frequency INTEGER,
          tags TEXT,
          exchange TEXT,
          phonetic TEXT,
          translation TEXT
        );
      `);
    }

    const stmt = db.prepare(
      'INSERT OR REPLACE INTO words (word, frequency, tags, exchange, phonetic, translation) VALUES (?, ?, ?, ?, ?, ?)'
    );

    for (const rec of records) {
      stmt.run(rec);
    }
    stmt.free();

    // 写入磁盘
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

    const stream = createReadStream(CSV_PATH, { encoding: 'utf-8', highWaterMark: 1024 * 1024 });

    parser.on('data', (row) => {
      const word = row.word;
      if (!word) return;

      totalRecords++;
      progress.tick();

      // 提取字段
      const frequency = parseInt(row.frq || row.bnc || '0', 10) || 0;
      const tags = row.tag || '';
      const exchange = row.exchange || '';
      const phonetic = row.phonetic || '';
      const translation = row.translation || '';

      const dbName = getDbName(word);

      if (!buffers.has(dbName)) {
        buffers.set(dbName, []);
      }
      buffers.get(dbName).push([word, frequency, tags, exchange, phonetic, translation]);

      // 达到批次阈值则刷盘
      if (buffers.get(dbName).length >= BATCH_SIZE) {
        flushShard(dbName);
      }
    });

    parser.on('end', resolve);
    parser.on('error', reject);
    stream.pipe(parser);
  });

  // 刷入所有剩余缓冲
  log('刷入剩余缓冲 ...');
  for (const dbName of buffers.keys()) {
    flushShard(dbName);
  }

  progress.done();
  log(`分片总数: ${dbCounts.size}`);
  log(`词条总数: ${totalRecords}`);

  // 验证
  let maxFileSize = 0;
  for (const [dbName, count] of dbCounts) {
    const dbPath = join(OUT_DIR, dbName);
    const size = readFileSync(dbPath).length;
    if (size > maxFileSize) maxFileSize = size;
  }
  log(`最大分片文件: ${(maxFileSize / 1024 / 1024).toFixed(2)} MB`);
  log('ECDICT 切片完成!');
}

main().catch(console.error);
