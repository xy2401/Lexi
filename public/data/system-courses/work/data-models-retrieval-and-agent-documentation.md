# 数据、模型、检索与智能体文档

> **中心问题**：模型、数据与智能体文档怎样区分处理阶段、能力和限制？<br>
> **适用背景**：已有相关技术背景；本篇帮助阅读文档与评估报告。<br>
> **阅读材料**：模型说明、数据处理文档、检索流程和评估报告。<br>
> **篇章边界**：职业文档与系统说明在此；算法研究与学术证据回查大学系列。



## 1. AI、机器学习和大模型

`artificial intelligence`（AI）是最宽泛的名称，指让计算机执行通常需要感知、判断、生成或决策能力的任务。

`machine learning`（ML）强调从数据中学习模式，而不是把所有规则逐条写死。常见搭配：

- `train a model on data`：用数据训练模型；
- `make a prediction`：作出预测；
- `learn from examples`：从样本学习；
- `machine-learning system`：机器学习系统。

`deep learning` 是使用多层 `neural network` 的机器学习方法。`generative AI` 指能够生成文本、图像、音频、代码等内容的系统。

`large language model`（LLM）是处理和生成语言序列的模型。`large` 没有跨所有机构统一的参数门槛，不应机械翻成一个固定规模。

`A large language model predicts and generates sequences of tokens.`

> [!NOTE]
> `model` 指学习得到的计算模型；`product` 或 `application` 还可能包含搜索、数据库、工具、权限和界面。介绍产品能力时，这几个词不能混用。

---

## 2. 数据与训练阶段的常见词

`dataset` 是用于分析、训练或评测的数据集合。文本集合也常称 `corpus`，复数是 <lexi-word form="irregular">`corpora`</lexi-word>。

- `training data`：用于调整模型参数的数据；
- `validation set`：开发过程中用于比较方案的数据；
- `test set`：用于最终评测的数据；
- `data quality`：数据质量；
- `data contamination`：测试内容等不应出现的数据进入了训练材料；
- `synthetic data`：由程序或模型生成的数据。

`pretraining` 是在大规模数据和通用目标上进行的初始训练；`fine-tuning` 是在较小、较具体的数据上继续调整。

常见介词搭配：

- `pretrained on web data`
- `fine-tuned on medical texts`
- `fine-tuned for classification`

`parameter` 是训练中被调整的数值；`weight` 常指神经网络里的具体参数。`checkpoint` 是训练某一阶段保存的模型状态。

`The model was fine-tuned on domain-specific examples.`

`epoch` 表示完整遍历一次指定训练集；`batch` 是一次共同处理的一组样本；`learning rate` 是影响参数更新幅度的训练设置。阅读材料时知道这些基本指向即可，本课不展开优化方法。

---

## 3. 文本怎样进入模型

`token` 是模型处理文本时使用的单位，可能是单词、子词、字符或字节片段。它不等于 `word`，不同 `tokenizer` 也可能把同一句话切成不同数量的 token。

`text` → `tokens` → `token` `IDs`

`tokenization` 是切分和编码过程，`vocabulary` 是 tokenizer 能直接表示的 token 集合。

`embedding` 是把离散项目表示成连续向量的方式。常见表达包括：

- `token embedding`
- `text embedding`
- `embedding model`
- `embedding space`
- `semantic similarity`

`context window` 表示一次请求中模型可处理的上下文范围，通常以 token 计量。`long-context model` 表示支持较长输入，但不自动意味着模型能同样准确地利用每一个位置。

`The document exceeds the model's context window.`

---

## 4. Transformer 与 attention

`Transformer` 是许多现代语言模型采用的神经网络架构。读者经常遇到：

- `encoder`：把输入编码成表示；
- `decoder`：逐步生成输出；
- `encoder-decoder model`：同时具有两类组件；
- `decoder-only model`：以生成后续 token 为主要结构；
- `layer`：网络中的一层计算；
- `attention head`：一组注意力计算单元。

`attention` 让模型在处理某个位置时，根据当前计算需要组合其他位置的信息。`self-attention` 表示这些位置来自同一序列。

`Self-attention connects information across positions in a sequence.`

在普通材料中，理解到这里已经足够。`attention score` 是内部计算量，不应直接当作完整的人类解释。

---

## 5. Prompt、输出与推理

`inference` 指使用训练完成的模型产生预测或输出，不是日常英语中单纯的“推断结论”。运行模型也常写成 `run inference` 或 `serve a model`。

`prompt` 是提供给生成模型的输入。模型生成的文字可称 `output`、`response`、`completion` 或 `generation`，具体词受接口和文档习惯影响。

- `system prompt`：定义高层行为或规则的输入；
- `instruction`：给模型的任务说明；
- `few-shot examples`：放在上下文中的少量示例；
- `prompt template`：可重复填充的提示模板；
- `prompt engineering`：设计和测试提示的实践。

`zero-shot` 表示不给任务示例；`few-shot` 表示在当前上下文提供少量示例。它们不等于 `fine-tuning`，因为模型参数没有因此更新。

`The task is demonstrated with three few-shot examples.`

`temperature`、`top-p` 和 `top-k` 是生成时常见的采样设置。它们影响输出的选择分布，但不保证事实正确。

`latency` 是一次响应等待多久；`throughput` 是单位时间能处理多少工作；`token usage` 是输入和输出消耗的 token 数。

---

## 6. 检索、工具和 agent

`retrieval-augmented generation`（RAG）表示先检索外部材料，再把相关内容提供给生成模型。

相关术语：

- `document chunk`：文档切分后的小段；
- `index`：支持检索的数据结构；
- `vector search`：基于向量相似度的检索；
- `retriever`：检索组件；
- `reranker`：对候选结果重新排序的组件；
- `grounded answer`：有给定材料作为依据的回答；
- `citation`：引用或来源标记。

`The retriever returns relevant passages for the model to use.`

`tool use` 或 `function calling` 表示模型生成结构化请求，让外部程序执行搜索、计算或其他动作。

`agent` 通常指能够观察状态、选择工具并连续采取动作的系统，但不同产品对这个词的定义差别很大。阅读文档时要查看它具体是否包含记忆、规划、工具权限和循环执行。

---

## 7. 评测与质量术语

`benchmark` 是用于比较系统表现的标准任务或数据集；`metric` 是计分方法；`evaluation` 是完整评测过程，常缩写为 `eval`。

常见指标词：

- `accuracy`：预测正确的总体比例；
- `precision`：被系统判为正例的结果中有多少是真的；
- `recall`：真实正例中有多少被找到；
- `F-score`：综合 precision 和 recall 的指标；
- `human evaluation`：由人进行的评估；
- `offline evaluation`：上线前或离线数据上的评估；
- `online evaluation`：真实运行环境中的评估。

`The new model improves recall but slightly reduces precision.`

`baseline` 是用于比较的基准方案；`state of the art`（SOTA）表示在某个明确基准和时间点达到领先结果，不等于在所有任务上最好。

---

## 8. 风险和限制的常见表达

`hallucination` 通常指生成内容看似流畅，却没有可靠依据或与事实冲突。它描述一种输出问题，不是“模型像人一样产生幻觉”。

`bias` 可指数据、模型或评测中的系统性偏差；具体材料还会区分 `sampling bias`、`measurement bias`、`selection bias` 等。

`guardrail` 是限制或检查模型输入输出的机制总称；`content filter` 更具体地指内容过滤；`red teaming` 指主动寻找系统失败或被滥用方式的测试活动。

`prompt injection` 是不可信内容试图改变原有指令或诱导系统执行不当动作。`jailbreak` 通常指试图绕过模型行为限制的输入或方法。

常见限制写法：

- `may produce inaccurate information`
- `is sensitive to prompt wording`
- `should not be used as the sole basis for...`
- `requires human review`
- `has not been evaluated for...`

`The output requires human review before publication.`

---

## 9. 阅读材料中的高频动词

- `train / pretrain / fine-tune a model`
- `generate / produce an output`
- `process / encode / tokenize text`
- `retrieve / rank relevant documents`
- `evaluate / benchmark a system`
- `deploy / serve / run a model`
- `reduce latency / improve throughput`
- `mitigate risk / detect harmful content`
- `cite a source / ground a response`

注意名词和动词转换：`evaluation → evaluate`、`generation → generate`、`retrieval → retrieve`、`deployment → deploy`、`alignment → align`。

---

## 10. 本课回看

- AI、ML、deep learning、generative AI 和 LLM 处于不同概念层级。
- dataset、corpus、pretraining、fine-tuning 和 checkpoint 属于数据与训练语境。
- token、embedding、context window、Transformer 和 attention 描述模型处理输入的基本方式。
- prompt、inference、completion、latency 和 throughput 常见于产品与接口文档。
- RAG、retriever、tool use 和 agent 描述围绕模型构建的系统能力。
- benchmark、metric、hallucination、bias 和 guardrail 用于讨论评测、质量和风险。

### 延伸资料

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [NIST AI 600-1：Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)

## 11. 数据库基础术语

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

## 12. 事务、备份和数据变化

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

---

相关篇章：[版本控制、提交与评审](#course=version-control-commits-and-review) · [云服务、可观测性与故障材料](#course=cloud-observability-and-incident-materials) · [计算机英文导读：抽象、系统与论证](#course=university-computer-science-reader) · [情态、语气与说话者立场](#course=modality-mood-and-stance)
