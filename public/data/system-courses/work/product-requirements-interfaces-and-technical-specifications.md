# 产品需求、接口与技术说明

> **中心问题**：技术说明怎样把需求、接口条件与实际行为联系起来？<br>
> **适用背景**：已有软件开发或产品协作经验。<br>
> **阅读材料**：需求说明、API 文档、请求示例与错误报告。<br>
> **篇章边界**：关注需求与接口的阅读；协作历史、模型文档和运维材料由相邻篇展开。



## 1. 从需求到发布的词汇地图

常见开发流程可以帮助定位术语：

`requirement` → `issue` → `change` → `review` → `test` → `release`

- `requirement`：需求或必须满足的条件；
- `acceptance criteria`：用于确认需求是否满足的验收条件；
- `issue`：待跟踪的问题，可以是缺陷、任务或建议；
- `change`：一次代码或配置变更；
- `review`：对变更进行审查；
- `release`：对外提供的版本；
- `deployment`：把某个版本放入运行环境的过程。

`release` 和 `deploy` 不完全相同：版本可以已经部署但尚未向用户发布，也可以先发布安装包而不由团队直接部署。

`The change has been deployed but is not yet available to all users.`

---

## 2. Bug report 与复现信息

`bug`、`defect` 和 `issue` 都可能表示问题。`issue` 最宽泛，不一定是程序错误。

缺陷报告常见栏目：

- `summary`：问题概述；
- `environment`：版本、平台和配置；
- `steps to reproduce`：复现步骤；
- `expected behavior`：预期行为；
- `actual behavior`：实际行为；
- `frequency`：出现频率；
- `workaround`：临时规避方法；
- `impact / severity`：影响和严重程度。

`The page becomes unresponsive after the sidebar is collapsed twice.`

`This issue occurs consistently on version 4.2.0.`

`reproduce` 是“复现问题”，不是重新生产产品。`intermittent` 表示间歇出现；`deterministic` 表示相同条件下稳定出现相同结果。

---

## 3. 一次请求中的角色词

下面这条线只用来定位术语：

`client` → `network` → `server` → `database` → `response`

- `client`：发起请求的程序；
- `server`：接收请求并提供服务的程序；
- `request`：客户端发出的请求消息；
- `response`：服务器返回的响应消息；
- `service`：提供一组能力的运行组件；
- `resource`：请求所指向的对象；
- `endpoint`：客户端可访问的接口地址；
- `protocol`：通信双方共同遵守的规则。

`client` 和 `server` 是一次通信中的角色，不一定对应两台固定机器。

`The client sends a request, and the server returns a response.`

常见动词：

- `send / receive a request`
- `handle / process a request`
- `return / serve a response`
- `expose an endpoint`
- `connect to a server`

---

## 4. 地址与连接

`URL` 是 Web 地址，材料中常见这些部分：

- `scheme`：如 `http` 或 `https`；
- `host` 或 `hostname`：主机名称；
- `port`：区分网络服务的数字；
- `path`：资源路径；
- `query parameter`：查询参数；
- `fragment`：页面内部位置标记。

`DNS` 是 `Domain Name System`，常见描述是 `resolve a domain name to an IP address`。

`IP address` 标识网络地址；`port` 标识主机上的服务入口。`socket` 在不同语境中可指通信端点或相关编程接口。

`TCP`、`UDP` 和 `QUIC` 是传输相关协议名。快速阅读时可以先记：TCP 常与可靠字节流一起出现；UDP 常与数据报一起出现；QUIC 常与 HTTP/3 一起出现。

`TLS` 是保护网络通信的安全协议。相关搭配：

- `establish a connection`
- `open / close a connection`
- `connection refused`
- `connection reset`
- `TLS certificate`
- `certificate expired`
- `secure / encrypted connection`

`The connection failed because the TLS certificate had expired.`

---

## 5. HTTP 方法与消息词汇

`HTTP` 是 Web 中常见的请求—响应协议。`HTTPS` 表示 HTTP 通信由 TLS 保护。

高频方法：

- `GET`：获取资源或表示；
- `POST`：提交数据或请求服务器执行处理；
- `PUT`：创建或整体替换目标资源；
- `PATCH`：部分修改；
- `DELETE`：请求删除；
- `HEAD`：只获取与响应相关的元数据。

这些是方法的基本意图；具体 API 仍以自己的文档为准。

`header` 携带消息的控制信息或元数据；`body` 或较新的规范用词 `content` 指消息内容；`content type` 表示内容格式。

常见字段与表达：

- `request header / response header`
- `authorization header`
- `content type`
- `request body`
- `query string`
- `status code`
- `redirect to another URL`
- `cache a response`

`The API returns a JSON response with a 200 status code.`

---

## 6. 状态码怎样读

状态码按第一位分组：

- `2xx success`：请求已成功处理；
- `3xx redirection`：需要重定向或使用其他位置；
- `4xx client error`：请求或客户端条件有问题；
- `5xx server error`：服务器未能完成请求。

高频状态：

- `200 OK`
- `201 Created`
- `204 No Content`
- `400 Bad Request`
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found`
- `409 Conflict`
- `429 Too Many Requests`
- `500 Internal Server Error`
- `502 Bad Gateway`
- `503 Service Unavailable`
- `504 Gateway Timeout`

`401 Unauthorized` 的英文名称容易误导，它通常与缺少或无效的身份认证有关；`403 Forbidden` 更常表示服务器理解请求但不允许执行。

常见句型：

`The request was rejected with a 403 Forbidden response.`

`The gateway timed out while waiting for the upstream service.`

---

## 7. API 文档中的关键词

`API` 是 `application programming interface`。阅读接口文档时经常看到：

- `authentication`：确认身份；
- `authorization`：确认是否有权限；
- `credential`：用于证明身份的凭据；
- `access token`：访问令牌；
- `rate limit`：速率限制；
- `pagination`：分页；
- `timeout`：等待超时；
- `retry`：重试；
- `idempotent`：重复相同请求的预期效果等同于一次；
- `payload`：消息携带的数据；在 HTTP 新规范中也会看到更一般的 `content`。

常见搭配：

- `authenticate a request`
- `grant / deny access`
- `provide valid credentials`
- `exceed the rate limit`
- `retry a failed request`
- `set a timeout`
- `paginate the results`

`Requests without valid credentials are rejected.`

---

## 8. 条件与承诺怎样限定行为

`requires` 说明需要满足的条件，`returns` 说明返回行为，`may` 可能限定允许性或可能性，要按当前文档的约定理解。接口文档应同时读输入条件、动作和结果，不能只看字段名称。

`The endpoint returns an empty list when no records match.` 把空列表与无匹配条件联系起来。它没有声称网络错误也会返回空列表；错误行为要读对应部分。

## 9. 需求到验收的措辞

`acceptance criteria` 用于说明判断需求是否完成的条件，`expected behavior` 描述期望行为，`actual behavior` 描述观察结果。三个对象各自承担不同工作。

`The report should include the selected date range.` 要求输出包含范围。读者可以据此核对产物，但仍需确认日期范围的定义和边界。通用情态规则回查语法，当前产品的约定由文档给出。

---

相关篇章：[版本控制、提交与评审](#course=version-control-commits-and-review) · [计算机英文导读：抽象、系统与论证](#course=university-computer-science-reader) · [情态、语气与说话者立场](#course=modality-mood-and-stance)
