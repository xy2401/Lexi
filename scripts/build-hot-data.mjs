/**
 * 脚本 C: 热词单字 SQLite 分片生成
 * 
 * 从 ECDICT CSV 中筛选核心高频词 (约 30,000 词)
 * 按首字母拆分为单字分片: public/dicts/hot/{letter}.db
 * 
 * 筛选条件: frq > 0 或 bnc > 0 或 tag 包含 cet4/cet6/ielts/toefl/gre
 * 表结构: words(word TEXT PK, frequency INTEGER, tags TEXT, exchange TEXT, phonetic TEXT, translation TEXT)
 */

import { createReadStream } from 'fs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse';
import initSqlJs from 'sql.js';
import { Progress, log } from './utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, 'data', 'ECDICT', 'ecdict.csv');
const OUT_DIR = join(ROOT, 'public', 'dicts', 'hot');

// 考试标签关键词
const TAG_KEYWORDS = ['cet4', 'cet6', 'ielts', 'toefl', 'gre', 'kyan', 'kaoyan'];

/**
 * 单字归仓算法：按首字母分片
 * a-z → "a.db"~"z.db"，非字母 → "_.db"
 */
function getHotDbName(word) {
  const first = word[0]?.toLowerCase();
  if (first && /^[a-z]$/.test(first)) return `${first}.db`;
  return '_.db';
}

function isHotWord(row) {
  const frq = parseInt(row.frq || '0', 10) || 0;
  const bnc = parseInt(row.bnc || '0', 10) || 0;
  const tag = (row.tag || '').toLowerCase();

  if (frq > 0) return true;
  if (bnc > 0) return true;
  for (const kw of TAG_KEYWORDS) {
    if (tag.includes(kw)) return true;
  }
  return false;
}

async function main() {
  log('初始化 sql.js ...');
  const SQL = await initSqlJs();

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  // 缓冲: dbName -> records[]
  const buffers = new Map();
  const dbCounts = new Map();
  let totalRecords = 0;
  let hotCount = 0;

  const BATCH_SIZE = 3000;
  const progress = new Progress(770000, 'HotData');

  function flushShard(dbName) {
    const records = buffers.get(dbName);
    if (!records || records.length === 0) return;

    const dbPath = join(OUT_DIR, dbName);
    let db;

    if (existsSync(dbPath)) {
      db = new SQL.Database(readFileSync(dbPath));
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

    const data = db.export();
    writeFileSync(dbPath, Buffer.from(data));
    db.close();

    const prev = dbCounts.get(dbName) || 0;
    dbCounts.set(dbName, prev + records.length);
    buffers.set(dbName, []);
  }

  log(`开始筛选: ${CSV_PATH}`);

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

      if (!isHotWord(row)) return;
      hotCount++;

      const frequency = parseInt(row.frq || row.bnc || '0', 10) || 0;
      const dbName = getHotDbName(word);

      if (!buffers.has(dbName)) buffers.set(dbName, []);
      buffers.get(dbName).push([word, frequency, row.tag || '', row.exchange || '', row.phonetic || '', row.translation || '']);

      if (buffers.get(dbName).length >= BATCH_SIZE) {
        flushShard(dbName);
      }
    });

    parser.on('end', resolve);
    parser.on('error', reject);
    stream.pipe(parser);
  });

  // 刷入剩余缓冲
  log('刷入剩余缓冲 ...');
  for (const dbName of buffers.keys()) {
    flushShard(dbName);
  }

  // 确保所有 27 个分片始终存在（即使无数据也生成空表，避免前端 404）
  const ALL_SHARDS = [];
  for (let i = 97; i <= 122; i++) ALL_SHARDS.push(`${String.fromCharCode(i)}.db`);
  ALL_SHARDS.push('_.db');
  for (const name of ALL_SHARDS) {
    const dbPath = join(OUT_DIR, name);
    if (!existsSync(dbPath)) {
      const emptyDb = new SQL.Database();
      emptyDb.run(`CREATE TABLE IF NOT EXISTS words (word TEXT PRIMARY KEY, frequency INTEGER, tags TEXT, exchange TEXT, phonetic TEXT, translation TEXT);`);
      writeFileSync(dbPath, Buffer.from(emptyDb.export()));
      emptyDb.close();
      dbCounts.set(name, 0);
      log(`  ${name}: 空分片已创建`);
    }
  }

  progress.done();
  log(`筛选出热词: ${hotCount} 条 (总扫描 ${totalRecords} 条)`);
  log(`分片数: ${dbCounts.size}`);

  // 统计
  let totalSize = 0;
  for (const [dbName, count] of dbCounts) {
    const size = readFileSync(join(OUT_DIR, dbName)).length;
    totalSize += size;
    log(`  ${dbName}: ${count} 条, ${(size / 1024).toFixed(0)} KB`);
  }
  log(`总大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  log('热词分片生成完成!');
}

main().catch(console.error);
