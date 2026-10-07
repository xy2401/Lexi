# 云服务、可观测性与故障材料

> **中心问题**：怎样从云服务、监控和事故材料理解系统状态与行动？<br>
> **适用背景**：已有部署、服务运行或相关工作经验。<br>
> **阅读材料**：容器文档、平台说明、监控记录、事故通知与复盘。<br>
> **篇章边界**：部署状态与故障沟通在此；请求接口和版本协作不重复教授。



## 1. Container 与 image

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

## 2. Cloud 与 Kubernetes 高频词

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

## 3. 监控和故障信息

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

## 4. Incident 与状态通告

`incident` 是影响系统或用户、需要协调处理的事件。状态页常用：

- `investigating`：正在调查；
- `identified`：已确认问题；
- `monitoring`：已采取措施并观察恢复；
- `resolved`：已解决；
- `degraded performance`：性能下降；
- `partial outage`：部分不可用；
- `service disruption`：服务中断或受扰。

`We are investigating elevated error rates in the EU region.`

`A mitigation has been applied, and we are monitoring recovery.`

`postmortem` 或 `incident report` 是事后报告；`timeline`、`impact`、`contributing factors` 和 `follow-up actions` 是常见栏目。

---

## 5. 状态、影响与行动分别阅读

`degraded`、`unavailable`、`recovering` 可以描述不同状态。一次事故通告还需说明受影响对象、时间范围、已经完成的动作和下一步。单个状态词不能替代完整影响说明。

`Some requests are experiencing increased latency.` 限定对象和现象，`We are investigating the cause.` 报告当前行动。它没有确认根因已经找到。阅读时把观察、推测与确认分开。

## 6. 复盘中的顺序与证据

`timeline` 帮助记录事件顺序，`contributing factor` 指可能参与的条件，`corrective action` 指针对问题采取的行动。具体文书对 root cause 等名称可能有不同约定，应看组织定义。

`The change was rolled back before service recovered.` 给出先后顺序，因果解释还要看证据。复盘的英语任务是读清事件、解释与行动责任，不能因为两件事相邻就自动证明因果。

---

相关篇章：[数据、模型、检索与智能体文档](#course=data-models-retrieval-and-agent-documentation) · [计算机英文导读：抽象、系统与论证](#course=university-computer-science-reader) · [情态、语气与说话者立场](#course=modality-mood-and-stance)
