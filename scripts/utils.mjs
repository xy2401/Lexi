/**
 * Lexi 数据切片工程 - 共享工具模块
 */

/**
 * 两字前缀归仓算法
 * 根据单词计算其所属的 SQLite 分片文件名
 * @param {string} word - 原始单词
 * @returns {string} 分片文件名，如 "ab.db", "a_.db", "other_.db"
 */
export function getDbName(word) {
  const cleanWord = word.toLowerCase().trim();
  if (cleanWord.length < 2) return `${cleanWord}_.db`;

  const first = cleanWord[0];
  const second = cleanWord[1];
  const isLetter = (ch) => /^[a-z]$/.test(ch);

  if (!isLetter(first)) return '__.db';               // 脏数据、纯数字符号归仓
  if (isLetter(second)) return `${first}${second}.db`; // 正常纯字母分片如 "ap.db"
  return `${first}_.db`;                               // 第二位带空格、符号的短语归仓如 "a_.db"
}

/**
 * 进度条工具
 */
export class Progress {
  constructor(total, label = '') {
    this.total = total;
    this.current = 0;
    this.label = label;
    this.lastPercent = -1;
    this.startTime = Date.now();
  }

  tick(n = 1) {
    this.current += n;
    const percent = Math.floor((this.current / this.total) * 100);
    if (percent !== this.lastPercent && percent % 5 === 0) {
      this.lastPercent = percent;
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
      process.stdout.write(`\r[${this.label}] ${percent}% (${this.current}/${this.total}) ${elapsed}s`);
    }
  }

  done() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`\n[${this.label}] 完成! 共处理 ${this.current} 条, 耗时 ${elapsed}s`);
  }
}

/**
 * 日志工具
 */
export function log(msg) {
  console.log(`[Lexi] ${msg}`);
}

export function logError(msg) {
  console.error(`[Lexi ERROR] ${msg}`);
}
