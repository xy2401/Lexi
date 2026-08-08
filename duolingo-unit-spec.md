# Lexi 单元课程规范 v5

## 1. 权威数据源

课程 Markdown 是单元内容的唯一权威来源。`public/data/duolingo-zs-en.json` 是由构建器生成的搜索索引，不允许手工维护。

每个索引项固定包含：

```json
{
  "id": 1,
  "name": "喜好",
  "desc": "使用基础词汇谈论喜好",
  "words": ["Chinese", "English"],
  "file": "001-喜好.md"
}
```

文件名、H1 编号和名称必须一致。Windows 文件名不支持的标点可从文件名中移除，但 H1 保留自然标题。

## 2. 文档结构

```markdown
# Unit 001: 喜好

> 使用基础词汇谈论喜好

## 单词

<quiz-word-list>

Chinese, English, book

</quiz-word-list>

## 单元讲解

普通 Markdown 讲解。

## Tips

- 词语提示。

## 练习

七种练习标签，顺序见下一节。
```

所有自定义标签的开标签之后、闭标签之前必须各有一个空行。标签内容使用标准 Markdown，保证在普通 Markdown 阅读器中仍可阅读。

## 3. 固定七关

每个单元必须各有且只有一个以下标签，并保持源码顺序：

1. `<quiz-pronunciation-match>`：空标签，读取共享词表生成至少十道发音配对。
2. `<quiz-pronunciation-spell>`：空标签，读取共享词表生成至少十道发音填写。
3. `<quiz-translation-choice>`：空标签，读取共享词表与本地 ECDICT 生成至少十道中文选词。
4. `<quiz-sentence-builder>`：十个带编号的中英文句对，每题配有深度语法与句法解析。
5. `<quiz-listening>`：恰好十道同一主题微场景的听音辨句。
6. `<quiz-matching>`：空标签时读取共享词表与 ECDICT 生成十组配对；显式表格也至少十组。
7. `<quiz-cloze>`：十道一空三选项的填空题，每题只有一个正确项。

空标签仍必须保留标签内空行：

```markdown
<quiz-pronunciation-match>

</quiz-pronunciation-match>
```

## 4. 微场景规则

- Listening 固定十句，每句都必须有自然中文翻译。
- 十句英文不得重复，必须覆盖至少 10 个不同的本单元词条或短语。
- 优先改编单元讲解和 Tips 中已有的可靠例句。
- 允许基础功能词、合理词形变化和支持场景衔接的常用表达；避免无关高级词汇。
- Sentence Builder 必须原样复用 Listening 中的十句，中英文均保持一致。
- Cloze 必须复用 Listening 中的十句，逐题挖空本单元词条或短语；补全后必须与原句完全一致。
- Cloze 固定三个同类选项，只有一个答案在语法和语义上成立。

## 5. 标签格式

### 连词成句

```markdown
<quiz-sentence-builder>

1. **中文**：我喜欢我的书。  
   **英文**：I like my book.
   > **解析**：**like** 是及物动词，后直接接宾语，不需要介词；my 是第一人称单数物主代词，修饰名词 book。

</quiz-sentence-builder>
```

### 听音辨句

```markdown
<quiz-listening>

1. I like my book.
   > **中文**：我喜欢我的书。
2. You like your cat.
   > **中文**：你喜欢你的猫。

</quiz-listening>
```

实际文档必须正好十题。

### 词义消消乐

空标签使用共享词表；显式模式使用两列表格：

```markdown
<quiz-matching>

| 英文单词 | 课文释义 |
| :--- | :--- |
| `book` | 书本 |

</quiz-matching>
```

### 选词填空

```markdown
<quiz-cloze>

I `____` my book.

- [x] like
- [ ] likes
- [ ] liking

> **解析**：主语 I 后使用动词原形。

</quiz-cloze>
```

## 6. 内容边界

- 词表迁移保留原有顺序和大小写；大小写不同但语义重复的历史项只保留首次出现者。
- 讲解和 Tips 可以继续使用普通 Markdown，不应包含未登记的 `<quiz-*>` 标签。
- 中文翻译和解析静态写入 Markdown，运行时不调用 AI 或在线翻译。
- 课程内容不声称是第三方课程的官方教案；不确定的语法目标使用“可以练习”等审慎表述。

## 7. 构建与自检

```bash
npm run validate:course
npm run build:course
npm run build
```

- `validate:course` 只读校验全部 290 个 Markdown 和当前索引。
- `build:course` 校验后重新生成公开索引。
- `build` 先执行课程校验，再执行 Vite 生产构建。
- 任何未知/重复标签、空行错误、词表重复、十题数量错误、中文缺失、句子复用失败或编号不一致都会使构建失败，并报告文件及行号。
- 全量基线为 290 个单元、2,030 个关卡、2,900 道 Listening 和 7,611 个有效词条。

`scripts/fetch-duolingo.mjs` 的抓取结果只写入 `data/`，仅作导入参考，不能覆盖公开索引。
