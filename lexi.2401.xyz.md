# Lexi

渐进式、沉浸式英语阅读与听说训练沙盒。纯前端 Heavy Client 架构，无应用后端，托管于 Cloudflare Pages。

## 词典数据源

Lexi 只使用 ECDICT 仓库中 `stardict.7z` 提供的完整数据。仓库根目录的 `ecdict.csv` 是约 76 万词的基础版，不参与 Lexi 构建；完整归档解压后约 340 万词。

Hot 词库不是第二部词典。它是从同一完整数据中筛出的 57,818 条高频/考试词汇，只负责首屏标注和快速启动。

## 两字符语义分片

完整词典按单词前两位路由：

```text
apple  → ap.db
a      → a_.db
a-     → a_.db
1st    → __.db
```

每个主分片只有一张完整的 `words` 表：

```sql
CREATE TABLE words (
  word TEXT PRIMARY KEY COLLATE NOCASE,
  phonetic TEXT,
  definition TEXT,
  translation TEXT,
  pos TEXT,
  collins INTEGER,
  oxford INTEGER,
  tags TEXT,
  bnc INTEGER,
  frequency INTEGER,
  exchange TEXT,
  detail TEXT,
  audio TEXT
) WITHOUT ROWID;
```

构建后执行 `VACUUM` 和 `PRAGMA quick_check`。20MiB 以上给出警告，达到 25MiB 时构建失败；不会自动改成固定大小分块。

## 查询流程

```text
启动
  └─ 并行加载 a.db～z.db、_.db Hot 分片
       └─ 写入 IndexedDB，供阅读器同步标注

点击未缓存词条
  └─ 两字符路由到唯一主分片
       └─ sql.js-httpvfs 使用 HTTP Range 读取所需 4KiB SQLite 页
            └─ 完整词条写回 IndexedDB
```

点击词条时，卡片直接展示同一行的音标、中文摘要、英文释义、词性和词形变化，不再维护独立的详细释义 Drawer。

## 构建

前置条件：

- Node.js ≥ 22
- `data/ECDICT` git submodule
- `data/ECDICT/stardict.7z`

```bash
npm install
npm run build:data   # 解压完整归档，生成两字符主分片、Hot 分片和 manifest
npm run build        # Vite 生产构建
npm run dev          # 本地开发
```

Cloudflare Pages 构建命令：

```bash
git submodule update --init --recursive && npm run build:data && npm run build
```

生成结构：

```text
public/dicts/
├── manifest.json
├── main/
│   ├── __.db
│   ├── a_.db
│   ├── aa.db
│   └── ...
└── hot/
    ├── _.db
    ├── a.db
    └── ...
```

## 主要代码

```text
scripts/build-dictionary-shards.mjs  # 单一来源构建主分片与 Hot
src/lib/dictionary-manifest.ts       # 版本与分片清单
src/lib/http-vfs.ts                  # 单 Worker HTTP Range VFS
src/lib/remote-db.ts                 # 两字符路由与查询接口
src/lib/db.ts                        # Hot/完整词条 IndexedDB 缓存
src/lib/lookup-service.ts            # local-hot/full → remote-main
```
