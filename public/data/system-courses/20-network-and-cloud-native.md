# 容器、云服务与可观测性术语

> 这是一份计算机基础设施英语速览。它帮助读者识别网络请求、数据库、容器和云服务材料中的常用英文；概念说明只用于区分术语，不教授网络设计、数据库管理或集群运维。

---

## 1. 一次请求中的角色词

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

## 2. 地址与连接

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

## 3. HTTP 方法与消息词汇

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

## 4. 状态码怎样读

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

## 5. API 文档中的关键词

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

## 6. 数据库基础术语

`database` 是持久组织数据的系统。关系数据库材料中常见：

- `table`：表；
- `row / record`：行或记录；
- `column / field`：列或字段；
- `schema`：数据结构定义或命名空间，具体含义依产品；
- `primary key`：唯一标识记录的键；
- `foreign key`：引用另一表记录的键；
- `index`：帮助加速特定查询的数据结构；
- `query`：查询或数据库命令；
- `result set`：查询返回的结果集合。

常见动词：

- `create / alter / drop a table`
- `insert / update / delete a row`
- `run / execute a query`
- `fetch / retrieve records`
- `filter / sort results`
- `join two tables`
- `add an index`

`The query retrieves all active users from the database.`

`SQL` 是用于关系数据库的语言名称。`NoSQL` 是覆盖多类非关系数据系统的宽泛行业词，不等于“完全没有查询语言”。

---

## 7. 事务、备份和数据变化

`transaction` 是作为一个工作单元处理的一组数据库操作。理解常见文档只需认识：

- `begin / commit / roll back a transaction`
- `transaction isolation`
- `concurrent transaction`
- `deadlock`
- `lock a row`

`commit` 在数据库中表示确认事务，在 Git 中表示版本历史记录；这是同词在两个技术语境中的不同用法。

`The transaction was rolled back after the update failed.`

其他数据维护词：

- `backup`：备份；
- `restore`：从备份恢复；
- `replication`：维护数据副本；
- `migration`：迁移数据或结构；
- `consistency`：数据或观察结果的一致性；
- `durability`：已确认数据在规定故障条件下保持的性质。

`backup` 和 `replica` 不能简单视为同义词：副本通常服务于持续运行，备份通常服务于恢复历史状态。

---

## 8. Container 与 image

`container` 通常指隔离运行的进程环境；`container image` 是启动容器所需文件、配置和依赖的打包形式。

- `Dockerfile`：描述如何构建镜像的文本文件；
- `image`：不可变的分层运行包；
- `container`：由镜像启动的运行实例；
- `registry`：存储和分发镜像的服务；
- `volume`：用于保存或挂载数据的存储；
- `runtime`：实际运行容器的软件。

常见搭配：

- `build an image`
- `tag / push / pull an image`
- `run / stop a container`
- `mount a volume`
- `publish / expose a port`

`The image contains the application and its runtime dependencies.`

`image` 是包，`container` 是运行实例；两者是初学材料中最常混淆的一组词。

---

## 9. Cloud 与 Kubernetes 高频词

`cloud computing` 指通过网络按需使用计算、存储和其他服务。常见资源词：

- `instance / virtual machine`：虚拟计算实例；
- `region`：云服务的地理区域；
- `availability zone`：区域内相对独立的可用区；
- `object storage`：对象存储；
- `load balancer`：负载均衡器；
- `managed service`：由供应方管理更多运行工作的服务；
- `scaling`：扩缩容；
- `high availability`：高可用性。

Kubernetes 文档中的高频对象：

- `cluster`：由多个计算资源组成的集群；
- `node`：运行工作负载的机器；
- `Pod`：Kubernetes 中最小的可部署计算对象；
- `Deployment`：管理一组应用副本及更新；
- `Service`：为一组变化的 Pod 提供稳定访问方式；
- `namespace`：用于组织和隔离资源的命名空间；
- `replica`：同一工作负载的一个副本。

常见动词：

- `deploy an application`
- `schedule a Pod on a node`
- `scale a deployment`
- `expose a service`
- `restart a container`
- `roll out / roll back a release`

`The deployment runs three replicas across two nodes.`

---

## 10. 监控和故障信息

`monitoring` 强调收集和查看系统信号；`observability` 是更宽泛的行业术语，强调利用外部信号理解内部状态。

- `metric`：可聚合的数值；
- `log`：离散事件记录；
- `trace`：一次请求跨组件的路径；
- `alert`：满足条件后产生的通知；
- `dashboard`：展示状态的界面；
- `uptime / downtime`：可用和不可用时间；
- `latency`：延迟；
- `throughput`：吞吐量；
- `error rate`：错误率。

常见故障表达：

- `the service is unavailable`
- `latency has increased`
- `the error rate is elevated`
- `the database is unreachable`
- `the connection pool is exhausted`
- `the request was retried`
- `the service has recovered`

`We are seeing elevated latency and intermittent timeouts.`

---

## 11. 本课回看

- client、server、request、response、endpoint 和 protocol 描述通信角色。
- DNS、IP address、port、connection、TLS 和 certificate 常见于连接问题。
- HTTP 材料围绕 method、header、content、status code、cache 和 redirect 展开。
- API 文档常用 authentication、authorization、token、rate limit、timeout 和 retry。
- 数据库材料常见 table、schema、query、index、transaction、backup 和 migration。
- 容器材料必须区分 image、container、registry、volume 和 runtime。
- 云原生材料常见 cluster、node、Pod、Deployment、Service、replica 和 scaling。
- 监控材料使用 metric、log、trace、latency、throughput 和 error rate。

### 延伸资料

- [RFC 9110：HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/current/)
- [Docker：What is an image?](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-an-image/)
- [Kubernetes Concepts](https://kubernetes.io/docs/concepts/)
