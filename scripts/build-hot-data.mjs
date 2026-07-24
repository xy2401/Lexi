/**
 * 脚本 C: 离线热数据包生成
 * 
 * 从 ECDICT CSV 中筛选核心高频词 (约 30,000 词)
 * 产出: public/hot-words.json
 * 
 * 筛选条件: frq > 0 或 bnc > 0 或 tag 包含 cet4/cet6/ielts/toefl/gre
 * 字段: word, phonetic, frequency, tags, exchange, translation
 */

import { createReadStream } from 'fs';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse';
import { Progress, log } from './utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, 'data', 'ECDICT', 'ecdict.csv');
const OUT_DIR = join(ROOT, 'public');
const OUT_PATH = join(OUT_DIR, 'hot-words.json');

// 考试标签关键词
const TAG_KEYWORDS = ['cet4', 'cet6', 'ielts', 'toefl', 'gre', 'kyan', 'kaoyan'];

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
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const hotWords = [];
  let totalRecords = 0;

  const progress = new Progress(770000, 'HotData');

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

      const frequency = parseInt(row.frq || row.bnc || '0', 10) || 0;

      hotWords.push({
        word,
        phonetic: row.phonetic || '',
        frequency,
        tags: row.tag || '',
        exchange: row.exchange || '',
        translation: row.translation || '',
      });
    });

    parser.on('end', resolve);
    parser.on('error', reject);
    stream.pipe(parser);
  });

  progress.done();
  log(`筛选出热词: ${hotWords.length} 条 (总扫描 ${totalRecords} 条)`);

  // 按词频降序排序
  hotWords.sort((a, b) => b.frequency - a.frequency);

  // 写入 JSON
  log('写入 hot-words.json ...');
  const json = JSON.stringify(hotWords);
  writeFileSync(OUT_PATH, json, 'utf-8');

  const sizeMB = (Buffer.byteLength(json, 'utf-8') / 1024 / 1024).toFixed(2);
  log(`产出: ${OUT_PATH}`);
  log(`文件大小: ${sizeMB} MB`);
  log('热数据包生成完成!');
}

main().catch(console.error);
