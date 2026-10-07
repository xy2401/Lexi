# 计算机英文导读：抽象、系统与论证

> **中心问题**：怎样读懂计算对象、系统假设和算法论述？<br>
> **适用背景**：已有计算机与人工智能的本科基础或对应专题知识。<br>
> **阅读材料**：本科教材、研究生专著与博士研究文献。<br>
> **篇章边界**：教材与研究中的概念表达；实际工具文档另属工作系列。



## 1. 先判断专业材料在完成什么任务

本篇把熟悉的计算机与人工智能知识连接到英文命名与表达。阅读前先判断材料是在引入对象、推导关系、描述方法还是比较证据。一个英文词在不同专题中可以进入不同的概念系统，因此先确定当前学科与段落功能，再选词义。

教材中的定义与研究论文中的贡献声明使用不同阅读路线。前者帮助建立对象，后者要联系已有工作与证据。先从导论、章节目的、符号表和图题建立定位，随后进入具体论述。

## 2. 计算、状态与计算模型

`computation` 是按规则变换信息的过程，`input` 进入过程，`output` 是结果，`state` 保存某一时刻影响后续行为的信息。`program` 是对计算过程的可执行描述。

`deterministic` 表示相同初始状态与输入产生相同结果，`nondeterministic` 在理论或系统语境中允许多个可能路径。它不必等同于随机 `random`。

`computable` 讨论问题是否存在算法可解，`decidable` 常指算法总能停机并给出是非答案。`termination` 与 `correctness` 是两个不同要求：程序停下不保证答案正确。

## 3. 算法与复杂度

`algorithm` 是有限、明确的求解步骤；`implementation` 是算法在特定语言和系统中的实现。不同实现可采用同一算法，性能仍可能不同。

`time complexity` 描述运行时间随输入规模增长的趋势，`space complexity` 描述额外存储需求。`Big O notation` 给出渐近上界，重点是增长率，不是某台机器上的精确秒数。

`worst case`、`average case` 和 `amortized analysis` 使用不同评价视角。`efficient` 必须连同输入规模、资源和任务约束理解。

## 4. 数据结构与操作成本

`data structure` 组织数据及其允许的操作。`array` 支持按索引访问，`linked list` 通过链接连接节点，`stack` 遵循后进先出，`queue` 遵循先进先出。

`tree` 表示层级关系，`graph` 表示节点与边构成的一般网络，`hash table` 通过哈希把键映射到位置。`structure` 影响 `search`、`insert`、`delete` 和 `traverse` 的成本。

`abstract data type` 规定行为接口，不指定实现细节。例如 `queue` 是行为约定，可以由数组或链表实现。

## 5. 抽象、类型与接口

`abstraction` 隐藏不相关细节并保留可用模型，`encapsulation` 把状态与操作边界组织在一起，`interface` 说明外部可以怎样交互。

`type` 描述值的集合及允许操作。`static typing` 在运行前检查许多类型关系，`dynamic typing` 在运行时处理更多类型判断；两者内部仍有多种设计，不能简单等同于安全或不安全。

`generic` 或 `parametric polymorphism` 让代码对一类类型复用，`subtype polymorphism` 让接口接收多个兼容的具体类型。材料中的 `contract` 常指调用者与实现者之间的行为约定。

## 6. 操作系统、进程与并发

`operating system` 管理处理器、内存、设备和文件等资源。`process` 是运行中的程序实例，`thread` 是进程内的执行序列，二者共享资源的方式不同。

`concurrency` 表示多个任务在时间上交错推进，`parallelism` 表示多个任务在同一时刻实际执行。并发程序需要处理 `race condition`、`deadlock` 和 `synchronization`。

`virtual memory` 给进程提供抽象地址空间，`scheduler` 决定执行资源如何分配，`system call` 是程序请求内核服务的接口。

## 7. 数据库：模式、查询与事务

`database` 持久组织数据，`schema` 描述结构和约束，`query` 请求读取或变更数据。关系数据库用 `table`、`row`、`column` 和 `key` 表示关系结构。

`primary key` 唯一标识记录，`foreign key` 连接表间关系，`index` 加速某些查询但增加存储和更新成本。`normalization` 减少冗余与更新异常，实际设计也会因读取需求而权衡。

`transaction` 把多个操作作为一个逻辑单位。`atomicity`、`consistency`、`isolation` 和 `durability` 描述传统事务保证；具体系统提供的隔离与一致性级别要看文档。

## 8. 网络、协议与分布式系统

`protocol` 是参与者交换消息的规则，`packet` 是网络传输单位，`address` 用于定位，`route` 决定数据经过的路径。`latency` 是延迟，`throughput` 是单位时间处理或传输的量。

`client` 发起请求，`server` 提供服务，这是一种交互角色而非固定机器身份。`request` 与 `response` 构成常见交换，`timeout` 表示等待超过限定时间。

分布式系统面对部分故障、消息延迟和状态复制。`consistency` 描述不同参与者观察数据的规则，`availability` 描述系统能否持续响应，术语含义需要结合具体模型。

## 9. 安全：资产、威胁与控制

`security` 从保护 `asset` 开始。`threat` 是可能造成损害的情形或主体，`vulnerability` 是可被利用的弱点，`risk` 综合可能性与影响。

`authentication` 验证是谁，`authorization` 决定允许做什么，`encryption` 保护数据机密性，`integrity` 关注数据未被未授权修改。`hash` 与加密用途不同，通常不可逆地映射输入。

`attack surface` 是可能被攻击的入口集合，`mitigation` 降低风险，`least privilege` 只授予完成任务所需的最小权限。这里只解释文档语言，不提供攻击步骤。

## 10. 论文、定义与伪代码表达

算法材料先定义 `problem`、`input`、`output` 和 `precondition`，再给 `procedure`。伪代码中的 `for each`、`while`、`return`、`enqueue` 和 `dequeue` 表达控制与抽象操作，不绑定特定语言语法。

正确性论证会写 `loop invariant`、`base case` 和 `inductive step`；性能评价会说明 `benchmark`、`workload`、`baseline` 和 `metric`。`outperforms the baseline` 只在给定数据、硬件和指标下成立。

系统论文常区分 `design`、`implementation`、`evaluation` 和 `limitation`。读者应检查作者测了什么、与谁比较、代价是什么，而不是只看“更快”的摘要句。

## 11. 本课回看

计算机科学材料的主线是：`computation` 由 `algorithm` 描述，`complexity` 评价资源增长，`data structure` 组织操作，`abstraction` 与类型管理边界，`concurrency` 协调执行，`database` 和 `protocol` 连接数据与系统，`security` 约束可信交互。涉及 Git、云部署或产品命令时，转到对应开发课程。

## 12. 从术语连接到完整论述

认识术语之后，还要看它与动作、条件和证据怎样相连。`defined as` 提示定义，`derived from` 提示推导或来源，`depends on` 提示依赖关系，`under these conditions` 提示范围。

通用长句结构回查语法系列，证据与引用回查共通学术阅读。专业术语由当前学科材料解释；把语法连接和领域对象分开核对，才能读清作者究竟提出了什么。

## 13. 本科、研究生与博士的阅读层次

本科教材层读清抽象对象、接口、算法步骤和系统状态，把术语连接到图示与伪代码。

研究生专题层核对复杂度、模型假设、并发条件和评价设置，区分理论性质与实现表现。

博士文献层比较新算法或系统与基线的论证和实验，核对任务、数据、资源条件及局限。

层次表示材料深度和所需背景。已熟悉专题的读者可以直接选读，不必把同一主题按学历重复学习。

---

相关篇章：[教材、专著、综述和研究论文的结构](#course=textbooks-monographs-reviews-and-research-papers) · [方法、数据、图表与结果表达](#course=methods-data-figures-and-results) · [引用、证据、局限与研究贡献](#course=citations-evidence-limitations-and-contributions)
