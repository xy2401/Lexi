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

### 🕸️ 英语语义网络（Open English WordNet）
- 按 lemma 浏览名词、动词、形容词和副词的独立 sense
- 展示释义、例句、同义词、动词句型和一跳语义关系图
- 支持沿上位、下位、组成、整体、蕴含、派生等关系交互导航
- 图中最多展示 40 个节点，完整关系保留在分类折叠列表中
- 使用本地 ECDICT Hot 缓存补充简短中文释义和考试标签

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
- **Dexie / IndexedDB**：持久缓存 Hot、Main 与 WordNet 已下载分片中的有效数据
- **sql.js**：在浏览器内解析可独立下载的小型 SQLite，不依赖 HTTP Range
- **Web Speech API**：浏览器本地 TTS 朗读
- **MediaRecorder + WaveSurfer.js**：跟读录音、波形与频谱展示

三套数据采用同一条基础链路：先查 IndexedDB，未命中时由 manifest 定位一个小型 SQLite，完整下载并用 sql.js 解析，再将该分片内可复用的数据和完成标记放入同一 IndexedDB 事务。Hot、Main 与 WordNet 的加载时机和分片边界各自独立；WordNet 加载失败不会影响 ECDICT。

---

## 双词典数据源

Lexi 同时使用两个职责独立的数据源：ECDICT 提供英汉词条、词频和考试标签；Open English WordNet 提供权威的英文释义、sense 划分和词义关系网络。两套数据库分别构建、分别加载，互不依赖。

### ECDICT 英汉词典

ECDICT 数据来自仓库中的 `stardict.7z` 完整归档，解压后约 340 万词。

Hot 词库是从同一完整数据中筛出的 57,818 条高频/考试词汇，负责首屏标注和快速启动。

#### 自适应逻辑分片

构建时先按单词前两位形成有序数据段，再按实际 SQLite 文件大小继续切成不超过 256 KiB 的独立逻辑分片。分片按词典排序规则连续排列，manifest 只记录每片的最后一个单词；查询时用二分查找定位目标文件：

```text
apple  → ap → 比较各片 lastWord → ap-001.db
a      → a_ → a_-000.db
1st    → __ → __-000.db
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

分片依据实际字节数而不是固定单词数生成，并保证单个词条不会跨片。构建后执行 `VACUUM` 和 `PRAGMA quick_check`；任何 Main 分片超过 256 KiB 都会导致构建失败。

#### 查询流程

```text
启动
  └─ 并行加载 a.db～z.db、_.db Hot 分片
       └─ 写入 IndexedDB，供阅读器同步标注

点击未缓存词条
  └─ 两字符路由 + lastWord 二分查找定位逻辑分片
       └─ 下载完整小型 SQLite，并用 sql.js 查询全部记录
            └─ 整片词条与完成标记原子写入 IndexedDB

再次查询同片任意词条
  └─ 直接读取 IndexedDB，不再下载该 SQLite
```

### Open English WordNet 2025 Core

构建脚本固定下载官方 `english-wordnet-2025-json.zip`，并在解压前校验 SHA-256：

```text
7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51
```

数据规模为 135,969 个 lexical entries、185,129 个 senses、107,519 个 synsets。项目只使用 Core 数据，不引入 Plus、Namenet 或 Kaikki。

官方压缩包中的 73 个 JSON 是源数据边界，不直接等同于部署文件。构建器先生成规范化暂存库，再按访问模式和实际文件大小产生部署分片。数据库共使用六种规范化业务表，另有一张 lemma 路由索引表：

```text
entries-*-NNN.db
  wordnet_entries
  wordnet_senses
  wordnet_sense_relations

noun.*-NNN / verb.*-NNN / adj.*-NNN / adv.*-NNN.db
  wordnet_synsets
  wordnet_synset_relations

index.db
  wordnet_lemma_index

frames.db
  wordnet_frames
```

lemma、sense ID、synset ID、关系类型和关系目标均为显式可索引列；只有发音、词形、释义、例句、成员等无需独立检索的数组使用 JSON 列。前端查询层对外只提供 `lookupWordNetLemma()`、`loadWordNetSynset()` 和 `loadWordNetFrames()` 三个业务接口。

WordNet 的加载策略按数据职责区分：

- `index.db`：首次需要 WordNet 时全量导入 IndexedDB，用于存在性检查、自动补全和 lemma 到 entry 分片的路由。
- entry 分片：目标大小 256 KiB，保证一个 lemma 的 entry、sense 和 sense relation 不跨片；按需整片导入 IndexedDB。
- synset 分片：目标大小 512 KiB，保证一个 canonical synset 及其关系不跨片；按需整片导入 IndexedDB。
- `frames.db`：体积很小，首次需要动词句型时全量导入。

sense 行中的 `synset_shard` 直接定位 canonical synset；关系行携带目标分片和简短摘要，因此绘制一跳网络不需要逐节点请求数据库，点击目标节点时才加载其 canonical synset。已下载 entry/synset 分片中的所有业务对象都会持久保存，不会只保留当前查询结果。

所有分片构建后执行 `VACUUM`、`PRAGMA quick_check` 和引用完整性校验。构建器会重新计算最终 `synset_shard` / `target_shard`，并验证 `bank` 的 10 个名词 sense 与 8 个动词 sense。部署不依赖 Cloudflare Pages 返回 `206 Partial Content` 或 `Content-Length`。

Open English WordNet 2025 由 [Open English WordNet](https://en-word.net/) 发布，依照 [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) 使用。

---

## 构建

前置条件：

- Node.js ≥ 22
- `data/ECDICT` git submodule
- `data/ECDICT/stardict.7z`
- 构建环境可访问 `https://en-word.net/`（WordNet 压缩包会自动下载并校验）

```bash
npm install
npm run build:data    # 解压完整归档，生成 Main 逻辑分片、Hot 分片和 manifest
npm run build:wordnet # 下载、校验 73 个源 JSON，并构建 WordNet 逻辑分片
npm run dev          # 生成扩展数据并启动 Vite 开发服务器（默认端口 3000）
npm run build        # 构建 WordNet、生成扩展数据、校验课程并执行 Vite 生产构建
npm run preview      # 本地预览 dist 生产构建
```

其他数据维护命令：

```bash
npm run build:dict       # 从已解压的 SQLite 数据生成词典分片
npm run validate:dicts   # 校验两套 manifest、文件大小、记录数、路由引用和 bank 样例
npm run prepare:wordnet  # 仅下载、校验和解压 OEWN 2025 Core
npm run build:wordnet    # 准备源数据并构建 WordNet 数据库
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
├── wordnet-manifest.json
├── main/
│   ├── __-000.db
│   ├── a_-000.db
│   ├── aa-000.db
│   ├── co-000.db
│   ├── co-001.db
│   └── ...
├── hot/
│   ├── _.db
│   ├── a.db
│   └── ...
└── wordnet/
    ├── index.db
    ├── entries-0-000.db
    ├── entries-a-000.db
    ├── noun.act-000.db
    ├── verb.motion-000.db
    ├── adj.all-000.db
    ├── adv.all-000.db
    ├── frames.db
    └── ...
```

---

## 主要代码

```text
scripts/
  extract-stardict.mjs           # 解压 ECDICT stardict.7z
  build-dictionary-shards.mjs    # 构建自适应 Main 分片与 Hot 词库
  prepare-wordnet.mjs            # 下载、校验、解压 OEWN 2025 Core
  build-wordnet.mjs              # 构建规范化 WordNet SQLite 分片
  validate-dictionary-assets.mjs # 校验部署数据库与跨分片引用
  build-extension-datasets.mjs   # 构建词根、近义词、词族数据集
  course-tools.mjs               # 多邻国课程校验与索引构建

src/
  App.vue                        # 八个主模块的入口与全局词典卡片
  components/
    TagSwitcher.vue              # 全宽标签三态筛选组件
    PaginationBar.vue            # 分页栏（支持锚点回顶）
    ReaderView.vue               # 阅读标注、分段朗读与跟读入口
    ExplorerTree.vue             # A-Z 词典浏览器
    WordNetView.vue              # sense 面板与一跳语义关系图
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
    sqlite-loader.ts             # 下载并解析完整小型 SQLite
    remote-db.ts                 # Main 边界路由、整片导入与查询接口
    db.ts                        # Hot/Main/WordNet IndexedDB 缓存
    lookup-service.ts            # local-hot/full → remote-main
    wordnet-manifest.ts          # WordNet 版本、统计与分片清单
    wordnet-types.ts             # WordNet 业务对象与缓存类型
    wordnet-service.ts           # WordNet 路由、整片导入与三个业务接口
    morphology.ts                # 词形还原与反向索引
    course-markdown.ts           # 课程 Markdown 与练习定义解析
```
