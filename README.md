# Lexi

渐进式、沉浸式英语阅读与听说训练沙盒。项目采用纯前端 Heavy Client 架构，无应用后端；词典查询、缓存、课程练习、TTS 朗读与跟读录音均在浏览器中完成，托管于 Cloudflare Pages。

**在线地址**：[lexi.2401.xyz](https://lexi.2401.xyz)

---

## 功能模块

### 📖 阅读器（Reader）
- 接入可配置的 Standard Ebooks 解包书库，支持搜索、分类多选、排序、分页、收藏、最近阅读和继续阅读
- 支持导入无 DRM 的 EPUB 2/3 与单文件 HTML；临时文本继续接受纯文本、Markdown 和 HTML
- 沉浸阅读提供目录、章节导航、进度恢复、主题、字体、字号、行高和正文宽度设置
- 远程章节及图片、本地图书、收藏和阅读进度保存在独立的 `lexi-reader` IndexedDB
- 自动标注词汇难度（基于 ECDICT 词频 / collins / oxford 标记），关闭标注后仍可点击查词
- 点击词条展示音标、中文释义、词性与词形变化
- 支持标签四态筛选（仅看 / 排除 / 标注 / 默认）；标注态以黄色标签显示最低等级的标签代码（如 `gk`、`gre`），不显示 ruby 释义
- 支持段落/章节 TTS 朗读和人声跟读录音
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
- 持久保存最后单元、练习面板、已完成关卡、尝试次数与最佳正确率

### ⚙️ 设置（Settings）
- 选择并试听浏览器提供的英文 TTS 语音
- 查看 IndexedDB 词库数量、存储占用与考试标签分布
- 新增、编辑、启停、切换和测试远程图书馆来源
- 查看 Reader 独立存储用量，并在保留收藏、进度和本地图书的前提下清除远程缓存

---

## 技术架构

- **Vue 3 + TypeScript + Vite**：页面、组件和生产构建
- **Pinia**：词典加载状态、内存词条索引和全局标签筛选
- **Dexie / IndexedDB**：持久缓存 Hot、Main 与 WordNet 已下载分片中的有效数据
- **独立 Reader IndexedDB**：持久保存来源、书目、书包元数据、清洗后的章节、图片、本地图书与进度
- **独立 Progress IndexedDB**：持久保存最后模块、词典历史、标签筛选、各浏览模块状态与课程进度
- **JSON Lines**：每行一个领域对象，浏览器原生解析后直接写入 IndexedDB
- **fflate + DOMPurify**：浏览器异步解包 EPUB，并统一清洗远程 XHTML、本地图书和临时 HTML
- **Web Speech API**：浏览器本地 TTS 朗读
- **MediaRecorder + WaveSurfer.js**：跟读录音、波形与频谱展示

三套数据采用同一条基础链路：先查 IndexedDB，未命中时由 manifest 定位一个 JSONL 分片，完整下载并逐行解析，再将该分片内可复用的数据和完成标记放入同一 IndexedDB 事务。Hot、Main 与 WordNet 的加载时机和分片边界各自独立；WordNet 加载失败不会影响 ECDICT。

SQLite、HTTP Range 与 Cloudflare Pages 的探索过程及迁移依据记录在[《词典存储架构演进：SQLite、HTTP Range 与 JSONL》](docs/dictionary-storage-evolution.md)。

---

## 电子书库

Reader 使用 `standard-ebooks-library-v2` 适配器，对接 Libr 的唯一图书目录。书库根目录提供 v2 目录 JSON，每本 Standard Ebooks 图书只保留一份解包资源：

```text
{baseUrl}/subject_top.json
{baseUrl}/library/{repo_name}/src/epub/content.opf
{baseUrl}/library/{repo_name}/src/epub/toc.xhtml
{baseUrl}/library/{repo_name}/src/epub/{chapterHref}
{baseUrl}/library/{repo_name}/src/epub/images/cover.svg
```

`subject_top.json` 的 `schema_version` 为 `2`，`books[]` 直接提供唯一的 `repo_name`、`asset_path` 和带排名的 `subjects[]`。Lexi 将分类对象规范化为 slug 列表，并始终通过经过安全校验的 `asset_path` 加载资源，不再进行分类目录回退。当前 Libr 在每类最多收录 30 本的规则下提供 19 类、402 本唯一图书，默认生产地址为 `https://libr.2401.xyz`。

本地开发可直接发布外部书库目录，无需复制或修改书库仓库：

```bash
npm run dev:library -- --root "D:\xy2401\codeDoc.wget\Ebooks" --port 8000
npm run dev
```

静态服务仅允许 `GET`、`HEAD`、`OPTIONS`，提供 CORS、正确 MIME、`Content-Length` 与 `Last-Modified`，并拒绝目录穿越。开发环境同时预置 `http://localhost:8000` 本地书库和 `https://libr.2401.xyz` 远程书库，可在 Reader 中即时切换；生产环境只预置 Libr。`VITE_DEFAULT_LIBRARY_URL` 可覆盖远程 Libr 地址；生产书库必须使用 HTTPS 并返回 `Access-Control-Allow-Origin`。Lexi 不使用 iframe 或服务端代理。

远程目录会优先从 IndexedDB 展示并在后台刷新。章节及其图片完成同一事务后才标记为缓存成功；再次打开已缓存章节不发送正文或图片请求。来源故障只影响该远程来源，不影响本地图书、临时文本或词典。

---

## 双词典数据源

Lexi 同时使用两个职责独立的数据源：ECDICT 提供英汉词条、词频和考试标签；Open English WordNet 提供权威的英文释义、sense 划分和词义关系网络。两套数据库分别构建、分别加载，互不依赖。

### ECDICT 英汉词典

ECDICT 数据来自仓库中的 `stardict.7z` 完整归档，解压后约 340 万词。

Hot 词库是从同一完整数据中筛出的 57,818 条高频/考试词汇，负责首屏标注和快速启动。

#### 自适应逻辑分片

构建器单遍读取已经按词序排列的 ECDICT CSV，先按单词前两位形成逻辑路由，再按 UTF-8 JSONL 实际大小切成目标 256 KiB 的独立分片。manifest 只记录每片的最后一个单词；查询时用二分查找定位目标文件：

```text
apple  → ap → 比较各片 lastWord → ap-001.jsonl
a      → a_ → a_-000.jsonl
1st    → __ → __-000.jsonl
```

每一行都是一个完整词典对象，不包含可由浏览器补足的 `cacheLevel` 和 `shard`：

```json
{"word":"bank","phonetic":"bæŋk","definition":"n. ...","translation":"n. 银行, 堤, 岸","pos":"n:...","collins":5,"oxford":1,"tags":"zk gk ielts","bnc":522,"frequency":522,"exchange":"...","detail":"","audio":""}
```

分片依据实际字节数而不是固定单词数生成，并保证单个词条不会跨片。若单条记录超过 256 KiB，它会独占一个分片并在 manifest 标记 `oversized`；达到 2 MiB 会警告，达到 Cloudflare Pages 的 25 MiB 限制则构建失败。构建时同时校验源数据排序、唯一性、记录数、文件哈希和分片边界。

#### 查询流程

```text
启动
  └─ 并行加载 a.jsonl～z.jsonl、_.jsonl Hot 分片
       └─ 写入 IndexedDB，供阅读器同步标注

点击未缓存词条
  └─ 两字符路由 + lastWord 二分查找定位逻辑分片
       └─ 下载完整 JSONL，逐行解析为完整词条对象
            └─ 整片词条与完成标记原子写入 IndexedDB

再次查询同片任意词条
  └─ 直接读取 IndexedDB，不再下载该 JSONL
```

### Open English WordNet 2025 Core

构建脚本固定下载官方 `english-wordnet-2025-json.zip`，并在解压前校验 SHA-256：

```text
7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51
```

数据规模为 135,969 个 lexical entries、185,129 个 senses、107,519 个 synsets。项目只使用 Core 数据，不引入 Plus、Namenet 或 Kaikki。

官方压缩包中的 73 个 JSON 是源数据边界，不直接等同于部署文件。构建器保留规范化业务对象和关系结构，再按访问模式与实际 JSONL 大小产生部署分片：

```text
entries-*-NNN.jsonl
  每行一个 lemma bundle
  内含 entries、senses、sense relations

noun.*-NNN / verb.*-NNN / adj.*-NNN / adv.*-NNN.jsonl
  每行一个 canonical synset graph
  内含释义、例句、成员和 synset relations

index.jsonl
  每行一个 lemma → entryShard 路由

frames.jsonl
  每行一个动词句型
```

JSONL 直接采用 IndexedDB 业务对象结构，不保存对象自身的 `shard`；浏览器根据当前文件名补足。`entryShard`、`synsetShard` 和 `targetShard` 继续显式保存，用于跨分片导航。前端查询层对外只提供 `lookupWordNetLemma()`、`loadWordNetSynset()` 和 `loadWordNetFrames()` 三个业务接口。

WordNet 的加载策略按数据职责区分：

- `index.jsonl`：首次需要 WordNet 时全量导入 IndexedDB，用于存在性检查、自动补全和 lemma 到 entry 分片的路由。
- entry 分片：目标大小 256 KiB，保证一个 lemma 的 entry、sense 和 sense relation 不跨片；按需整片导入 IndexedDB。
- synset 分片：目标大小 256 KiB，保证一个 canonical synset 及其关系不跨片；按需整片导入 IndexedDB。
- `frames.jsonl`：体积很小，首次需要动词句型时全量导入。

sense 行中的 `synset_shard` 直接定位 canonical synset；关系行携带目标分片和简短摘要，因此绘制一跳网络不需要逐节点请求数据库，点击目标节点时才加载其 canonical synset。已下载 entry/synset 分片中的所有业务对象都会持久保存，不会只保留当前查询结果。

entry 与 synset 使用同一套超大实体规则：超过 256 KiB 的单个对象独占一个分片并标记 `oversized`，2 MiB 警告，25 MiB 构建失败。构建器会重新计算最终 `synsetShard` / `targetShard`，校验全部引用，并验证 `bank` 的 10 个名词 sense 与 8 个动词 sense。JSONL 以 `text/plain; charset=utf-8` 返回，由 Cloudflare 自动压缩；部署不依赖 `206 Partial Content` 或 `Content-Length`。

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
npm run build:data    # 解压完整归档，生成 Main/Hot JSONL 和 manifest
npm run build:wordnet # 下载、校验 73 个源 JSON，并构建 WordNet JSONL
npm run dev          # 生成扩展数据并启动 Vite 开发服务器（默认端口 3000）
npm run dev:library -- --root "D:\path\to\Ebooks" --port 8000 # 启动带 CORS 的本地书库服务
npm run build        # 构建 WordNet、生成扩展数据、校验课程并执行 Vite 生产构建
npm run preview      # 本地预览 dist 生产构建
npm run typecheck    # TypeScript 静态检查
npm test             # Reader 目录、清洗、HTML 与 EPUB 导入测试
```

其他数据维护命令：

```bash
npm run build:dict       # 从已解压的 ECDICT CSV 生成 JSONL 分片
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
│   ├── __-000.jsonl
│   ├── a_-000.jsonl
│   ├── aa-000.jsonl
│   ├── co-000.jsonl
│   ├── co-001.jsonl
│   └── ...
├── hot/
│   ├── _.jsonl
│   ├── a.jsonl
│   └── ...
└── wordnet/
    ├── index.jsonl
    ├── entries-0-000.jsonl
    ├── entries-a-000.jsonl
    ├── noun.act-000.jsonl
    ├── verb.motion-000.jsonl
    ├── adj.all-000.jsonl
    ├── adv.all-000.jsonl
    ├── frames.jsonl
    └── ...
```

---

## 主要代码

```text
scripts/
  extract-stardict.mjs           # 解压 ECDICT stardict.7z
  build-dictionary-shards.mjs    # 流式构建 Main/Hot JSONL
  prepare-wordnet.mjs            # 下载、校验、解压 OEWN 2025 Core
  build-wordnet.mjs              # 构建可直接入库的 WordNet JSONL
  validate-dictionary-assets.mjs # 校验部署数据库与跨分片引用
  build-extension-datasets.mjs   # 构建词根、近义词、词族数据集
  course-tools.mjs               # 多邻国课程校验与索引构建
  serve-ebook-library.mjs        # 带 CORS 与路径防护的静态书库服务

src/
  App.vue                        # 主模块入口、全局词典卡片与设置
  components/
    TagSwitcher.vue              # 全宽标签三态筛选组件
    PaginationBar.vue            # 分页栏（支持锚点回顶）
    ReaderView.vue               # 阅读标注、分段朗读与跟读入口
    ReaderWorkspace.vue          # 远程/本地书架、详情与沉浸阅读
    LibrarySettings.vue          # 图书馆来源与 Reader 存储管理
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
    jsonl-loader.ts              # 下载并严格解析 UTF-8 JSONL
    remote-db.ts                 # Main 边界路由、整片导入与查询接口
    db.ts                        # Hot/Main/WordNet IndexedDB 缓存
    lookup-service.ts            # local-hot/full → remote-main
    wordnet-manifest.ts          # WordNet 版本、统计与分片清单
    wordnet-types.ts             # WordNet 业务对象与缓存类型
    wordnet-service.ts           # WordNet 路由、整片导入与三个业务接口
    morphology.ts                # 词形还原与反向索引
    course-markdown.ts           # 课程 Markdown 与练习定义解析
    reader-types.ts              # Reader 领域类型与显示设置
    reader-db.ts                 # 独立 lexi-reader IndexedDB
    progress-db.ts               # 独立 lexi-progress 学习进度与界面记忆
    reader-sanitize.ts           # 书籍与临时 HTML 安全清洗
    library-service.ts           # 远程目录、OPF/TOC、章节与缓存接口
    epub-import.ts               # EPUB 2/3 与 HTML 本地导入
```

---

## 许可证

Lexi 原创源代码采用 [MIT License](https://opensource.org/license/mit)。ECDICT、Open English WordNet、课程来源及第三方依赖不因收录于本项目而改用 MIT，仍分别遵循其自身许可或服务条款。完整的项目链接、许可名称、署名与修改说明见根目录 [LICENSES](LICENSES)。
