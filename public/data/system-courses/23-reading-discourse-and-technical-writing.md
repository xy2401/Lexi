# 阅读、篇章与技术写作

> **中心问题**：怎样看见英文句子与段落的结构，并把技术信息写得清楚可查？  
> **阅读场景**：说明文、API 文档、设计说明、报告与论文摘要。  
> **课程边界**：本课讲阅读与表达结构，不替代语法课程对时态、从句等规则的完整解释。

长句难读，通常不是因为其中每个词都难，而是因为读者还没看见句子与段落的组织方式。本课把长句分析、衔接、标点和技术写作放在同一条阅读路径中：先找主干，再看关系，最后判断作者要你做什么。

## 1. 每段都有一项工作

技术材料常在做四类事：定义对象、描述过程、报告观察、限定结论。先判断段落的工作，词汇就有了位置。看见 `is defined as`，你在读定义；看见 `is measured by`，你在读方法；看见 `suggests that`，你在读谨慎解释。

`A rate limit is defined as the maximum number of requests allowed in a given period.`

## 2. 长句先找有限动词与主干

面对长句，不要从左到右把每个词翻成中文。先找承担时态的有限动词，再问谁是它的主语；关系从句、分词短语、介词短语常只是给主干补信息。

`The model, which was trained on a larger dataset, performs better on unseen inputs.`

主干是 `The model performs better`；中间的 `which ... dataset` 说明训练背景。先把插入信息临时括起来，句子会清楚许多。

## 3. 连接词不是可有可无的装饰

`however` 提示转折，`therefore` 提示推论，`for example` 提示实例，`in particular` 提示聚焦。它们告诉你相邻句子是并列、对比、因果还是解释。

`The system is fast. However, its memory use remains high.`

读到连接词时，先在脑中给关系命名，再继续读内容；这样不会把「相反」读成「补充」。

## 4. 指代词把句子织成篇章

`this`、`these`、`such`、`it` 常把前文的一件事、一个结果或一整种方法打包带到下一句。它们有时指名词，有时指整个命题。

`The samples were stored at low temperature. This reduced the risk of degradation.`

这里的 `This` 指「低温存放」这件事。遇到代词时，往前找能在意义和数上对得上的对象，不要只找最近的名词。

## 5. 标点是结构信号

逗号常标出插入信息或并列成分；冒号常引出解释、列表或结论；分号连接关系紧密的完整句；破折号可以突然补充或转向。技术写作里，标点尤其帮助读者看出层级，而不是替代逻辑。

`The change had one consequence: the response time increased.`

冒号前的概括和冒号后的具体内容形成「总—分」关系。读标点时，顺便问前后是解释、结果还是并列。

## 6. 定义、步骤、限制的常见句法

技术文本经常重复有限几种句型：

- `X refers to ...`：给术语下定义。
- `X consists of ...`：说明组成。
- `X is used to ...`：说明用途。
- `X must not ...`：给出禁止或限制。
- `If X occurs, ...`：描述条件与处置。

`If the request fails, the client retries after a short delay.`

认出句型后，陌生术语仍可通过它在结构中的角色被理解。

## 7. 把名词堆拆回动作

书面英语喜欢把动作压缩成名词：`the evaluation of performance`、`the reduction of error`、`the implementation of the policy`。阅读时可以把它们暂时还原成「谁评估、评估什么」「什么减少了」「谁实施什么」，就能看清论述的因果链。

## 8. 写清楚比写复杂更重要

简明技术写作倾向于：一个句子放一个主要关系；已知信息放前面，新信息放后面；用具体动词替代空泛名词；在必要处明确条件和限制。被动语态并不错误，但如果行动者对读者重要，就应清楚写出。

`The service returns an error when the token has expired.`

这比含糊的「错误发生了」更能告诉读者系统、条件与结果。

## 9. 一条可复用的阅读路线

1. 看标题和首句，判断本段要完成什么工作。
2. 圈出连接词、指代词、条件词和限制词。
3. 为每个长句找主干，再补回修饰信息。
4. 把名词化表达还原成动作与参与者。
5. 用一句自己的话说清段落的结论与边界。

这种读法不会把英文变成逐词翻译，而会把它读成一张由定义、条件、证据和结论组成的结构图。

## 10. 报告问题时要区分现象、影响与处置

技术材料中的 `issue`、`failure`、`impact`、`mitigation`、`workaround` 分别指问题、失效、影响、缓解措施和临时绕过方式。它们常按固定顺序出现：先描述发生了什么，再说明谁受影响，最后交代当前处置和下一步。

`The issue affects a small number of users, and a workaround is available.`

看见这种顺序时，不要只抓到「error」；它其实是一段有角色、影响和状态的篇章。

## 11. 让读者能扫描，也能细读

一段说明应让标题承担对象，首句承担结论，后续句子承担条件、例外和理由。列表适合并列步骤，段落适合因果解释，表格只用于真正需要横向比较的字段。写作时每加一句，问它是在定义、限定、举例还是推进结论；如果没有明确工作，就应删去或合并。
