/**
 * 解压 stardict.7z → data/stardict-raw/stardict.csv
 * 
 * 如果 CSV 已存在则跳过，确保 Cloudflare 构建时能从 submodule 的 7z 生成源数据
 * 优先用系统 7z/p7zip 命令，fallback 到 7zip-min
 */

import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARCHIVE = join(ROOT, 'data', 'ECDICT', 'stardict.7z');
const OUT_DIR = join(ROOT, 'data', 'stardict-raw');
const OUT_CSV = join(OUT_DIR, 'stardict.csv');

function log(msg) {
  console.log(`[Lexi] ${msg}`);
}

if (existsSync(OUT_CSV)) {
  log(`stardict.csv 已存在，跳过解压: ${OUT_CSV}`);
  process.exit(0);
}

if (!existsSync(ARCHIVE)) {
  log(`源文件不存在，跳过: ${ARCHIVE}`);
  process.exit(0);
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

log(`解压: ${ARCHIVE} → ${OUT_DIR}`);
const start = Date.now();

// 尝试系统 7z 命令 (Linux: p7zip, macOS: 7z, Windows: 7z)
let extracted = false;
for (const cmd of ['7z', '7za', 'p7zip']) {
  try {
    execSync(`${cmd} x "${ARCHIVE}" -o"${OUT_DIR}" -y`, { stdio: 'pipe', timeout: 300000 });
    extracted = true;
    break;
  } catch (e) {
    // 命令不存在或执行失败，尝试下一个
  }
}

// fallback: 7zip-min (bundled binaries)
if (!extracted) {
  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const seven = require('7zip-min');
    await new Promise((resolve, reject) => {
      seven.extractFull(ARCHIVE, OUT_DIR, (err) => err ? reject(err) : resolve());
    });
    extracted = true;
  } catch (e) {
    console.error(`[Lexi ERROR] 解压失败:`, e.message || e);
    process.exit(1);
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
log(`解压完成, 耗时 ${elapsed}s`);
