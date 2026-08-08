/**
 * Lexi 数据切片工程 - 共享工具模块
 */

/**
 * 两字符语义分片：aa..zz、a_..z_、__。
 */
export function getShardName(word) {
  const normalized = String(word || '').toLowerCase().trim()
  const first = normalized[0] || ''
  const second = normalized[1] || ''
  const isLetter = character => /^[a-z]$/.test(character)

  if (!isLetter(first)) return '__.db'
  if (!isLetter(second)) return `${first}_.db`
  return `${first}${second}.db`
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
