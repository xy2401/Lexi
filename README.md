# Lexi

渐进式、沉浸式英语阅读与听说训练沙盒。项目采用纯前端 Heavy Client 架构，无应用后端；词典查询、缓存、课程练习、TTS 朗读与跟读录音均在浏览器中完成，托管于 Cloudflare Pages。

**在线地址**：[lexi.2401.xyz](https://lexi.2401.xyz)

---

## 功能模块

### 📖 阅读器（Reader）
- 粘贴任意英文文本，自动标注词汇难度（基于 ECDICT 词频 / collins / oxford 标记）
- 点击词条展示音标、中文释义、词性与词形变化
- 支持标签三态筛选（仅看 / 排除 / 默认）
- 支持整句 TTS 朗读、逐段播放和人声跟读录音
- 录音完成后显示波形、FFT 频谱与时间轴

### 🔍 词典浏览器（Explorer）
- 按字母分组浏览 57,818 条高频词汇
- 支持分页与标签筛选
- 点击词条展示完整词典卡片
- 支持单词发音、词形关系展示与单词跟读录音

### 🌳 词根词缀（Word Root）
- 浏览 ECDICT 词根、前缀、后缀与词源数据
- 支持按词根、含义或例词搜索，以及类型和词源筛选
- 可从例词直接打开完整词典卡片并朗读

### ⚖️ 近义辨析（Resemble）
- 浏览近义词和易混词组
- 集中展示同组词汇的含义差异
- 支持搜索、分页、查词与发音

### 🌿 词族演变（Lemma Evolution）
- 可视化同根词族谱系（84,487 个词族）
- 支持考试标签、派生规则和关键词筛选
- 可从词族变体直接查词与朗读

### 🦉 多邻国课程（Duolingo）
- 290 个单元 / 2030 关 / 7611 个目标词汇
- 内置连词成句、听音辨句、词义选择、单词匹配与选词填空等练习
- 每道题均配有深度语法与句法解析
- TTS 朗读完整句子后再平滑切题

### ⚙️ 设置（Settings）
- 选择并试听浏览器提供的英文 TTS 语音
- 查看 IndexedDB 词库数量、存储占用与考试标签分布

---

## 技术架构

- **Vue 3 + TypeScript + Vite**：页面、组件和生产构建
- **Pinia**：词典加载状态、内存词条索引和全局标签筛选
- **Dexie / IndexedDB**：持久缓存 Hot 词库与按需获取的完整词条
- **sql.js-httpvfs**：通过 HTTP Range 按 SQLite 页读取远端词典分片
- **Web Speech API**：浏览器本地 TTS 朗读
- **MediaRecorder + WaveSurfer.js**：跟读录音、波形与频谱展示

应用启动时将 Hot 词库载入 IndexedDB 和内存 Map，以支持阅读器的同步标注；未缓存的完整词条再从远端主分片按需获取，并写回本地缓存。

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
npm run dev          # 生成扩展数据并启动 Vite 开发服务器（默认端口 3000）
npm run build        # 生成扩展数据、校验课程并执行 Vite 生产构建
npm run preview      # 本地预览 dist 生产构建
```

其他数据维护命令：

```bash
npm run build:dict       # 从已解压的 SQLite 数据生成词典分片
npm run build:extensions # 生成词根、近义词和词族数据集
npm run build:course     # 构建多邻国课程索引
npm run validate:course  # 校验课程 Markdown 和练习定义
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
  extract-stardict.mjs           # 解压 ECDICT stardict.7z
  build-dictionary-shards.mjs    # 构建主分片与 Hot 词库
  build-extension-datasets.mjs   # 构建词根、近义词、词族数据集
  course-tools.mjs               # 多邻国课程校验与索引构建

src/
  App.vue                        # 七个主模块的入口与全局词典卡片
  components/
    TagSwitcher.vue              # 全宽标签三态筛选组件
    PaginationBar.vue            # 分页栏（支持锚点回顶）
    ReaderView.vue               # 阅读标注、分段朗读与跟读入口
    ExplorerTree.vue             # A-Z 词典浏览器
    WordRootView.vue             # 词根词缀模块
    ResembleView.vue             # 近义词与易混词辨析模块
    LemmaView.vue                # 词族演变模块
    DuolingoView.vue             # 多邻国课程浏览与练习入口
    QuizRunner.vue               # 多邻国练习题运行器
    FollowReadPanel.vue          # 可复用的跟读录音面板
    VoiceSpectrogram.vue         # 录音波形与频谱
  composables/
    useTTS.ts                    # TTS 朗读（含 onEnd 回调）
    useRecorder.ts               # MediaRecorder 本地录音
  lib/
    dictionary-manifest.ts       # 版本与分片清单
    http-vfs.ts                  # 单 Worker HTTP Range VFS
    remote-db.ts                 # 两字符路由与查询接口
    db.ts                        # Hot/完整词条 IndexedDB 缓存
    lookup-service.ts            # local-hot/full → remote-main
    morphology.ts                # 词形还原与反向索引
    course-markdown.ts           # 课程 Markdown 与练习定义解析
```
