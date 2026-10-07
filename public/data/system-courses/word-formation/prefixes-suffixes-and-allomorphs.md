# 前缀、后缀与形态变体

> **中心问题**：怎样识别词缀功能与形态变体，而不把拆词当作直接翻译？<br>
> **适用背景**：已区分屈折与派生。<br>
> **阅读材料**：派生词族、词典词类与真实句子。<br>
> **篇章边界**：通用词缀机制集中在此；读音变化与专门命名另篇处理。



## 1. 同一语素可以有多个表面形式

复数语素书写为 `-s`，发音却可能是 <lexi-phoneme>`/s/`</lexi-phoneme>、<lexi-phoneme>`/z/`</lexi-phoneme> 或 <lexi-phoneme>`/ɪz/`</lexi-phoneme>：`cats / dogs / buses`。这些是同一语素的异形体。

否定前缀 <lexi-morpheme kind="prefix">`in-`</lexi-morpheme> 会受后续辅音同化：

- <lexi-morpheme kind="prefix">`in-`</lexi-morpheme> + `possible` → `impossible`
- <lexi-morpheme kind="prefix">`in-`</lexi-morpheme> + `legal` → `illegal`
- <lexi-morpheme kind="prefix">`in-`</lexi-morpheme> + `regular` → `irregular`

<lexi-morpheme kind="prefix">`in-`</lexi-morpheme> / <lexi-morpheme kind="prefix" form="variant">`im-`</lexi-morpheme> / <lexi-morpheme kind="prefix" form="variant">`il-`</lexi-morpheme> / <lexi-morpheme kind="prefix" form="variant">`ir-`</lexi-morpheme> 的形式变化让发音更顺畅，不必把它们当作毫无关系的四个前缀。

不规则范式甚至可能使用完全不同的词干：`go` → <lexi-word form="irregular">`went`</lexi-word>。这种“异干互补”无法通过普通加后缀预测，正需要不规则样式明确标出。

---

## 2. 高频前缀：学语义网络，不背单译

### 否定与反向

- <lexi-morpheme kind="prefix">`un-`</lexi-morpheme>：`unfair`、`unlock`
- <lexi-morpheme kind="prefix">`non-`</lexi-morpheme>：`nonverbal`
- <lexi-morpheme kind="prefix">`de-`</lexi-morpheme>：`deactivate`
- <lexi-morpheme kind="prefix">`dis-`</lexi-morpheme>：`disagree`、`disconnect`

`unfair` 否定性质，`unlock` 反转动作；相同前缀在不同词基上构成不同但相关的意义。

### 时间、重复与顺序

- <lexi-morpheme kind="prefix">`pre-`</lexi-morpheme>：之前，`pretest`
- <lexi-morpheme kind="prefix">`post-`</lexi-morpheme>：之后，`postwar`
- <lexi-morpheme kind="prefix">`re-`</lexi-morpheme>：再次或返回，`rebuild / return`

`recreation` 未必按 “re + creation” 理解，读音和词义可能表明它是另一条历史来源。形似不保证同步构词关系。

### 数量与范围

- <lexi-morpheme kind="prefix">`mono-`</lexi-morpheme>：单一
- <lexi-morpheme kind="prefix">`bi-`</lexi-morpheme>：二、双
- <lexi-morpheme kind="prefix">`multi-`</lexi-morpheme>：多
- <lexi-morpheme kind="prefix">`micro-`</lexi-morpheme>：微小
- <lexi-morpheme kind="prefix">`macro-`</lexi-morpheme>：宏观

在科研单位中，`micro-` 也有严格的 <lexi-notation>`10⁻⁶`</lexi-notation> 数量意义，不能只理解为“很小”。

---

## 3. 高频后缀：词类线索与意义倾向

### 名词形成

- <lexi-morpheme kind="suffix">`-ness`</lexi-morpheme>：性质，`darkness`
- <lexi-morpheme kind="suffix">`-tion`</lexi-morpheme>：过程或结果，`evaluation`
- <lexi-morpheme kind="suffix">`-er`</lexi-morpheme>：执行者或工具，`writer / printer`
- <lexi-morpheme kind="suffix">`-ity`</lexi-morpheme>：性质，`stability`

### 形容词形成

- <lexi-morpheme kind="suffix">`-able`</lexi-morpheme>：可……的，`readable`
- <lexi-morpheme kind="suffix">`-al`</lexi-morpheme>：与……有关，`regional`
- <lexi-morpheme kind="suffix">`-less`</lexi-morpheme>：缺少，`wireless`
- <lexi-morpheme kind="suffix">`-ive`</lexi-morpheme>：倾向或性质，`responsive`

### 动词与副词形成

- <lexi-morpheme kind="suffix">`-ize`</lexi-morpheme>：使成为或采用，`standardize`
- <lexi-morpheme kind="suffix">`-ify`</lexi-morpheme>：使成为，`simplify`
- <lexi-morpheme kind="suffix">`-ly`</lexi-morpheme>：常构成副词，`carefully`

后缀提供强线索，却不是绝对词类判定器。`friendly` 是形容词；`daily` 可作形容词、名词或副词。

---

## 4. 构词的生产力与限制

“规则存在”不代表可以附加到任何词上。

<lexi-morpheme kind="suffix">`-ness`</lexi-morpheme> 很有生产力，可以理解新造的 `awkwardness`；但不是每个形容词加 `-ness` 都比已有词更自然。`un-` 常与可分级、可对立的形容词结合，却不自然地附到许多关系形容词上。

生产力受多种因素限制：

- 词基的词类与语义；
- 语音和形态条件；
- 已有词的竞争；
- 语域和领域惯例；
- 社群是否接受新造词。

`stealer` 结构上可理解，但日常更常用 `thief`；已有词会阻挡规律形式。

---

## 5. 先确认词基再判断词缀

遇到 `unhelpful`，可以识别基础部分、形成形容词的部分以及否定部分。遇到一个表面上也以同样字母开头的陌生词，却不能保证存在同一种现代结构。

有效的拆分要得到真实词族、词典义项或已知构词规则的支持。把词切成很多短串，通常只会增加猜测；能够解释当前词类和概念关系的少量结构更有价值。

## 6. 读音、词类和搭配一起查证

词缀既可能提供意义方向，也可能提示词类和词重音。读派生词时应分别确认这三项信息，不让某一条线索替代全部判断。

进入句子后，还要看它能与什么动词、名词或介词搭配。词族中的两个名词，可能分别指过程、结果或状态；后缀相同也不保证它们在相同句框里可以互换。

## 7. 查证词形与用法

构词线索先帮助提出假设，再由词典义项、词类和语境确认。词族中的成员需要分别观察搭配与语域，不把切分结果直接当作翻译。

参考：[Cambridge Grammar：Word formation](https://dictionary.cambridge.org/us/grammar/british-grammar/word-formation)。

---

相关篇章：[词根与词源：英语本族词、拉丁与希腊来源、借词](#course=roots-etymology-and-borrowing) · [复合、转类、缩略、混成与新词](#course=compounds-conversion-abbreviations-and-new-words) · [词汇的基本单位：单词、词形、词义、词族与语块](#course=words-forms-meanings-families-and-chunks) · [学术和专业术语的形成：名词化、缩写、命名与跨领域词义](#course=academic-and-professional-term-formation)
