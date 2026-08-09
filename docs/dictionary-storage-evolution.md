# 词典存储架构演进：SQLite、HTTP Range 与 JSONL

> 状态：已决策并实施  
> 记录日期：2026-08-09  
> 当前方案：JSONL 逻辑分片 + IndexedDB 持久缓存

这份文档记录 Lexi 在引入 Open English WordNet 时对 SQLite、`sql.js-httpvfs`、HTTP Range 和 Cloudflare Pages 的探索。SQLite 方案最终被移除，但探索明确了静态站点上远程查询、物理分片和浏览器持久缓存之间的边界，直接促成了当前 JSONL 架构。

## 1. 最初为什么选择 SQLite

ECDICT 最初使用 SQLite，是因为它同时提供了几个很有吸引力的能力：

- 构建阶段可以把 CSV 转为有类型、可索引的数据表。
- 浏览器和构建器使用同一种查询模型，避免分别维护文件格式与查询逻辑。
- `lemma`、sense、synset 和关系目标都可以使用 B-tree 索引。
- WordNet 的实体、关系和反向边可以规范化为多张表，通过索引连接。
- 配合 `sql.js-httpvfs`，理论上可以在纯静态托管中只读取 SQLite 查询涉及的页面，而不下载完整数据库。

因此，早期 WordNet 方案曾设计为 6 种规范化表，官方 73 个 JSON 源文件经过处理后生成多个 SQLite 文件；ECDICT Main 也继续沿用 SQLite 分片。

这个方向本身并没有错。它适合以下前提：托管端稳定支持 HTTP Range，客户端需要复杂的临时查询、连接或全文检索，并且 SQLite 页缓存就是应用期望的缓存单位。

## 2. `sql.js-httpvfs` 实际解决什么问题

`sql.js-httpvfs` 是 SQLite/sql.js 上的只读 HTTP 虚拟文件系统。它通过 HTTP Range 请求远程 SQLite 的局部字节，让浏览器可以执行 SQL 而不先下载完整数据库。

它有两个需要区分的层次：

1. **SQLite 页面与物理读取块**：查询索引时读取数据库文件中的部分页面或连续字节。
2. **应用领域对象**：Lexi 真正要缓存的 `WordEntry`、lemma bundle 和 canonical synset graph。

前者是数据库引擎的存储单位，后者才是 IndexedDB 和页面组件使用的业务单位。二者并不天然对应。

项目也支持把数据库预先切成物理 chunk。这个能力适合有单文件大小限制的静态托管，并可改善 CDN 对局部文件的缓存；但它仍然是 SQLite VFS 的物理字节缓存，不会自动变成 Lexi 的领域对象缓存。

## 3. 206 的真实前提

HTTP Range 不是看到 `Accept-Ranges: bytes` 就已经成立。完整契约是：

```text
客户端请求
Range: bytes=1048576-1572863

服务端响应
HTTP/1.1 206 Partial Content
Content-Range: bytes 1048576-1572863/完整文件大小
Content-Length: 524288
```

需要注意：

- `Accept-Ranges: bytes` 只是服务端声明可能接受范围请求，不证明当前请求真的按范围返回。
- `200 OK` 表示返回完整表示；如果 Range 请求仍收到完整文件，httpvfs 的随机读取收益就不存在。
- `206 Partial Content` 必须与正确的 `Content-Range` 和响应体一致。
- `Content-Length` 是所返回表示的长度；动态压缩、分块传输或平台实现可能使它缺失。
- Cloudflare 的通用文档说明 Cloudflare 可以处理 Range 请求的 206 响应，但缓存行为取决于文件类型和源站设置。这不等于任意 Cloudflare Pages 静态资源、压缩设置和自定义域名组合都保证满足某个客户端库的完整契约。

因此，准确结论不是“Cloudflare Pages 完全不支持 206”，而是：**Lexi 当时的 Pages 部署没有稳定提供 `sql.js-httpvfs` 所依赖的响应契约，项目不能把核心词典功能建立在这个未经保证的前提上。**

## 4. 部署中观察到的问题

线上 SQLite 静态资源曾返回类似以下响应头：

```text
accept-ranges: bytes
content-type: application/octet-stream
cache-control: public, max-age=31536000, immutable
```

但响应中没有 `Content-Length`。这本身不是 404；是否为 404 必须看 HTTP 状态码和响应内容。`application/octet-stream` 也更像真实二进制资源，而不是 SPA 的 HTML fallback。

问题在于 `sql.js-httpvfs` 的 full-file 模式会先通过 `HEAD` 获取远程文件长度。该项目的 Cloudflare Pages issue 记录了同样现象：`HEAD` 没有 `Content-Length` 时，库会报出“server uses gzip or doesn't have length”。这意味着即使响应里出现 `Accept-Ranges`，初始化仍可能在真正执行 SQL 前失败。

此外，Cloudflare 自动压缩与 Range 存在天然张力：Range 针对的是某个表示的字节范围，而压缩会改变表示长度和字节位置。可以通过专用对象存储、Worker 或明确禁用特定资源压缩来建立稳定契约，但这都会增加部署规则和维护面。

## 5. 物理 chunk 下载后，剩余数据去了哪里

讨论中曾以 512 KiB 物理 chunk 为例：一次查询可能只需要约 1 KiB 的一个词条，那么同一 chunk 的其余数据是否浪费？

答案分三层：

- **当前 SQL 查询**：SQLite 只返回目标行，不会把 chunk 内所有其他词条作为查询结果交给应用。
- **httpvfs 会话缓存**：已取回的字节可留在 VFS/内存缓存中，后续读取相同区域可能复用；项目 README 也明确提醒其没有缓存淘汰，读取越多占用的 RAM 越多。
- **Lexi 的 IndexedDB**：httpvfs 不会自动把 chunk 中的其他词条解码并写入 IndexedDB。刷新页面后，内存缓存与持久业务缓存的语义不同。

不能简单通过“当前 chunk 覆盖哪些单词”把其余数据全部写入 IndexedDB，原因是 SQLite 文件不是按完整 JSON 对象连续排列：

- B-tree 页中可能同时包含索引节点、表记录和空闲空间。
- 一行记录可能使用 overflow page，未必完整落在同一读取块。
- 索引页保存键与 rowid，不等于完整业务对象。
- 同一词条的表记录、索引和关系行可能分布在不同页面。
- 要识别并解码所有可用记录，本质上需要再次运行 SQLite 查询或理解其页格式，等于在 httpvfs 之外再实现一层数据库扫描与对象装配。

所以，物理 chunk 可以减少远程随机读取，却不能自然实现“下载了就把其中所有领域对象永久缓存”。这是 SQLite/httpvfs 与 Lexi 目标之间最关键的不匹配。

## 6. 为什么不能用平均文件大小做判断

ECDICT Main 曾经总计约 238 MiB，并拆成数百个文件。只看“总大小 ÷ 文件数”的平均值没有决策价值：

- 查询成本由目标词实际命中的文件或 chunk 决定。
- 文件大小分布可能高度偏斜，热点前缀与冷门前缀差异很大。
- SQLite 查询还取决于索引页、表页和 overflow page 的实际访问路径。
- Cloudflare Pages 的 25 MiB 是单文件限制，必须检查最大值而不是平均值。

因此后续构建器全部按每个文件的实际 UTF-8 字节数切分，并记录最大值、完整 SHA-256、行数和跨分片引用；验证器逐文件检查，而不是使用平均数推断。

## 7. 讨论过的替代路线

### 7.1 保留 SQLite，增加 Worker 或 Pages Function

由 Worker 明确处理 `HEAD`、`Range`、`206`、`Content-Range` 和长度，可以恢复 httpvfs 的前提。但这会让纯静态站点增加运行时后端，并需要处理缓存、压缩、错误范围和版本一致性。

### 7.2 把 SQLite 放到支持 Range 的对象存储

例如使用明确支持字节范围的对象存储，并配置 CORS 和响应头。这可以继续使用 SQLite，但增加新的部署资源、权限和成本，也没有解决 VFS 内存缓存与 IndexedDB 领域缓存不一致的问题。

### 7.3 预切 sql.js-httpvfs 物理 chunks

库本身支持预切 chunk，这能绕过单个大 SQLite 文件和部分 Range 限制。它的实际效果在网络层接近“只取所需块”，但仍需要 sql.js、WASM、Worker、SQLite 页布局和 VFS 内存缓存；应用如果还要 IndexedDB 持久缓存，就存在双重缓存体系。

### 7.4 首次下载完整 SQLite 到 IndexedDB/OPFS

这会让后续 SQL 查询稳定且离线能力强，但 ECDICT Main 需要较大的首次下载，偏离按需加载低频数据的目标。浏览器存储配额、迁移与文件版本替换也更复杂。

### 7.5 领域对象 JSONL 逻辑分片

把网络传输、解析结果和 IndexedDB 缓存统一到同一领域对象，是最终选择。它牺牲了浏览器端任意 SQL，换来更简单、可验证的加载与持久化语义。

## 8. 最终决策

Lexi 的查询模式并不需要通用数据库引擎：

- ECDICT 主要按规范化单词精确查询。
- WordNet 先按 lemma 找 bundle，再按已知 ID 加载 synset。
- 一跳关系的目标摘要已在构建阶段生成，不需要运行时跨表连接。
- 第一版不做 definition/example 全文搜索。
- 数据只读，构建阶段可以完成规范化、排序、反向边和引用校验。

因此三套数据统一为以下基础链路：

```text
manifest 路由
    ↓
普通 fetch 获取完整 JSONL 分片（HTTP 200，可压缩）
    ↓
逐行 JSON.parse 为领域对象
    ↓
同一 Dexie 事务写入全部对象与完成标记
    ↓
以后直接从 IndexedDB 读取
```

具体加载策略仍然不同：

- Hot：27 个首字符分片，启动时全量加载。
- Main：两字符逻辑路由，再根据有序 `lastWord` 二分定位 256 KiB 目标分片。
- WordNet index：首次使用时全量加载，负责自动补全和 entry 路由。
- WordNet entry/synset：分别按业务对象边界切成 256 KiB 目标分片，按需加载。
- 单个领域对象超过目标大小时独占分片，不允许跨片。

JSONL 方案不依赖 `206` 或 `Content-Length`；Cloudflare 对普通 `200` 文本响应自动压缩。下载到浏览器的数据全部是可直接持久化的业务对象，因此“避免大文件加载”和“加载了就不要浪费”使用了同一套机制。

## 9. SQLite 探索留下的有效成果

虽然 SQLite 代码已经删除，但以下成果被保留下来：

- WordNet 实体与关系必须规范化理解，不能用一个笼统 `payload` 替代索引和引用设计。
- lemma、sense、synset 和关系目标的标识及跨分片路由必须显式存在。
- canonical synset、官方 sense 顺序、关系目标摘要、反向边和 `inferred` 标记都进入了最终领域模型。
- 路由 manifest 只需要保存有序边界，不需要保存“每个单词 → 文件”的巨大映射。
- 构建和查询必须围绕最大访问单元设计，不能依赖平均文件大小。
- 缓存单位应尽量与应用消费单位一致；否则会出现 VFS、HTTP cache 和 IndexedDB 三套互不等价的缓存。
- 部署能力必须在真实域名、真实响应头和真实请求方式下验证，不能仅凭平台或库的功能列表推断。

## 10. 以后重新评估 SQLite 的条件

若未来同时出现以下需求，可以重新评估 SQLite/其他浏览器数据库方案：

- definition/example 全文搜索或多字段组合检索成为核心功能。
- 运行时需要复杂连接、聚合或不可预计算的图查询。
- 托管端明确、稳定地提供 `HEAD Content-Length` 和 Range 206 契约。
- 项目愿意增加 Worker、R2 或其他后端/对象存储设施。
- SQLite 页缓存本身即可满足离线要求，或已经有成熟的 OPFS/IndexedDB VFS 持久化方案。

在这些条件出现前，JSONL 逻辑分片更符合 Lexi 的纯静态、按需加载和领域对象持久缓存目标。

## 参考资料

- [sql.js-httpvfs README：HTTP Range VFS、chunked database、缓存与索引说明](https://github.com/phiresky/sql.js-httpvfs)
- [sql.js-httpvfs issue #13：Cloudflare Pages 缺少 Content-Length](https://github.com/phiresky/sql.js-httpvfs/issues/13)
- [Cloudflare 2xx 文档：206 Partial Content](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/2xx-success/#206-partial-content)
- [RFC 9110：Range Requests](https://www.rfc-editor.org/rfc/rfc9110.html#name-range-requests)

