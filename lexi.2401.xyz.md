# Lexi

渐进式、沉浸式英语阅读与听说训练沙盒。纯前端 Heavy Client 架构，0 后端、0 流量费，托管于 Cloudflare Pages。

## 核心能力

- **智能阅读 (Reader)**：导入文本 → 自动分词 → `<ruby>` 双行注音渲染 → 难度 Tag 过滤 → 形态还原（running→run）
- **词典浏览 (Explorer)**：A-Z 级联分片浏览 + 标签多维过滤 + 词族星云图
- **听说沙盒 (Audio Lab)**：Web Speech TTS 朗读高亮 + MediaRecorder 录音 + 双通道声谱图对比纠音
- **多邻国词库 (Duolingo)**：按单元/标签浏览词汇，支持发音与筛选

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Vue 3 + Pinia + TypeScript |
| 构建 | Vite 8 |
| 本地存储 | Dexie.js (IndexedDB) |
| 远端查询 | sql.js (WASM SQLite) 按需 fetch 分片 |
| 文本解析 | marked + 自研 tokenizer |
| 音频 | Web Speech API + Web Audio API + wavesurfer.js |
| 部署 | Cloudflare Pages (静态托管) |

## 数据架构：三轨 SQLite 分片

```
public/dicts/
├── ecdict/          # 全量词法数据 (76万词, 676个两字分片)
│   ├── aa.db ~ zz.db
│   └── _.db         # 非字母开头
├── stardict/        # 富文本语境 (12万词, 676个两字分片)
│   ├── aa.db ~ zz.db
│   └── _.db
└── hot/             # 高频热词 (5.8万词, 27个单字分片)
    ├── a.db ~ z.db
    └── _.db
```

### 查词优先级

```
IndexedDB (本地缓存) → hot/{x}.db (单字, ~230KB) → ecdict/{xx}.db (两字, ~1MB)
```

### 归仓算法

- **两字分片** (ecdict/stardict)：取前两字母，非字母用 `_` 替代 → `ab.db`, `a_.db`, `__.db`
- **单字分片** (hot)：取首字母 → `v.db`, `_.db`

### 表结构

```sql
-- ecdict / hot
CREATE TABLE words (word TEXT PRIMARY KEY, phonetic TEXT, frequency INTEGER, tags TEXT, exchange TEXT, translation TEXT);

-- stardict
CREATE TABLE words (word TEXT PRIMARY KEY, html_content TEXT);
```

## 构建

### 前置条件

- Node.js ≥ 18
- 数据源通过 git submodule 引入：`data/ECDICT`（含 ecdict.csv + stardict.7z）

### 脚本

```bash
npm run build:data    # 一键生成全部三套分片
# 等价于:
#   node scripts/build-ecdict.mjs      → public/dicts/ecdict/
#   node scripts/extract-stardict.mjs  → data/stardict-raw/stardict.csv (从 stardict.7z 解压)
#   node scripts/build-stardict.mjs    → public/dicts/stardict/
#   node scripts/build-hot-data.mjs    → public/dicts/hot/

npm run dev           # 本地开发
npm run build         # 生产构建 (vite build → dist/)
```

### Cloudflare Pages 部署

Build command:
```bash
git submodule update --init --recursive && npm run build:data && npm run build
```

构建产物（`public/dicts/**/*.db`）由 `build:data` 在 CI 中生成，不提交到 git。

## 项目结构

```
src/
├── App.vue                  # 主布局 (顶栏 + 视图切换)
├── components/
│   ├── ReaderView.vue       # 阅读器：文本导入 + ruby 渲染
│   ├── ExplorerTree.vue     # A-Z 分片浏览树
│   ├── TagFilter.vue        # 标签多维过滤
│   ├── TagSwitcher.vue      # 难度档位切换
│   ├── MorphNebula.vue      # 词族星云图
│   ├── WordTooltip.vue      # 轻量悬浮释义
│   ├── WordDrawer.vue       # 重型详情抽屉 (stardict 富文本)
│   ├── DuolingoView.vue     # 多邻国词汇浏览
│   └── SpectrogramCompare.vue # 声谱对比
├── composables/
│   ├── useTTS.ts            # Web Speech 朗读 + 高亮
│   └── useRecorder.ts       # MediaRecorder 录音
├── lib/
│   ├── db.ts                # Dexie IndexedDB 操作
│   ├── lookup-service.ts    # 查词调度 (local→hot→ecdict)
│   ├── remote-db.ts         # sql.js 远端分片查询
│   ├── morphology.ts        # 形态还原 (exchange 解析)
│   └── tokenizer.ts         # 文本分词
└── stores/
    └── dict.ts              # Pinia 全局状态

scripts/
├── build-ecdict.mjs         # ECDICT CSV → 676 个两字 SQLite 分片
├── build-stardict.mjs       # stardict.csv → 676 个两字分片
├── build-hot-data.mjs       # 热词筛选 → 27 个单字分片
├── extract-stardict.mjs     # stardict.7z → CSV (7zip-min)
├── fetch-duolingo.mjs       # 多邻国 API → 本地 JSON
└── utils.mjs                # 共享工具 (日志/事务/分片名)

data/
└── ECDICT/                  # git submodule (ecdict.csv + stardict.7z)
```

## 渐进式离线

1. 首次访问：hot 分片 (27个, 共 ~6MB) 批量加载写入 IndexedDB
2. 阅读中查词：本地未命中 → 远端分片按需 fetch → 结果写回 IndexedDB
3. 随使用积累，本地缓存越来越全，离线能力逐步增强
