# Lexi

渐进式、沉浸式英语阅读与听说训练沙盒。纯前端 Heavy Client 架构，无应用后端，托管于 Cloudflare Pages。

**在线地址**：[lexi.2401.xyz](https://lexi.2401.xyz)

---

## 功能模块

### 📖 阅读器（Reader）
- 粘贴任意英文文本，自动标注词汇难度（基于 ECDICT 词频 / collins / oxford 标记）
- 点击词条展示音标、中文释义、词性与词形变化
- 支持标签三态筛选（仅看 / 排除 / 默认）

### 🔍 词典浏览器（Explorer）
- 按字母分组浏览 57,818 条高频词汇
- 支持分页与标签筛选
- 点击词条展示完整词典卡片

### 🌳 词族演变（Lemma Evolution）
- 可视化同根词族谱系（84,487 个词族）
- 支持标签三态筛选

### 🦉 多邻国课程（Duolingo）
- 290 个单元 / 2030 关 / 7611 个目标词汇
- 内置练习题：连词成句、听音辨句、选词填空
- 每道题均配有深度语法与句法解析
- TTS 朗读完整句子后再平滑切题

---

## 词典数据源

Lexi 只使用 ECDICT 仓库中 `stardict.7z` 提供的完整数据。完整归档解压后约 340 万词。

Hot 词库是从同一完整数据中筛出的 57,818 条高频/考试词汇，负责首屏标注和快速启动。

### 两字符语义分片

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

构建后执行 `VACUUM` 和 `PRAGMA quick_check`。20MiB 以上给出警告，达到 25MiB 时构建失败。

### 查询流程

```text
启动
  └─ 并行加载 a.db～z.db、_.db Hot 分片
       └─ 写入 IndexedDB，供阅读器同步标注

点击未缓存词条
  └─ 两字符路由到唯一主分片
       └─ sql.js-httpvfs 使用 HTTP Range 读取所需 4KiB SQLite 页
            └─ 完整词条写回 IndexedDB
```

---

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

---

## 主要代码

```text
scripts/
  build-dictionary-shards.mjs    # 构建主分片与 Hot 词库
  build-extension-datasets.mjs   # 构建词根、近义词、词族数据集
  course-tools.mjs               # 多邻国课程校验与索引构建

src/
  components/
    TagSwitcher.vue              # 全宽标签三态筛选组件
    PaginationBar.vue            # 分页栏（支持锚点回顶）
    LemmaView.vue                # 词族演变模块
    QuizRunner.vue               # 多邻国练习题运行器
  composables/
    useTTS.ts                    # TTS 朗读（含 onEnd 回调）
  lib/
    dictionary-manifest.ts       # 版本与分片清单
    http-vfs.ts                  # 单 Worker HTTP Range VFS
    remote-db.ts                 # 两字符路由与查询接口
    db.ts                        # Hot/完整词条 IndexedDB 缓存
    lookup-service.ts            # local-hot/full → remote-main
```
