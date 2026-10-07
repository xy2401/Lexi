# 大学数学英文导读：定义、结构与证明

> **中心问题**：怎样从集合、映射和命题读到数学教材与证明？<br>
> **适用背景**：已有数学的本科基础或对应专题知识。<br>
> **阅读材料**：本科教材、研究生专著与博士研究文献。<br>
> **篇章边界**：数学对象、分析与代数关系；概率统计另有导读。



## 1. 先判断专业材料在完成什么任务

本篇把熟悉的数学知识连接到英文命名与表达。阅读前先判断材料是在引入对象、推导关系、描述方法还是比较证据。一个英文词在不同专题中可以进入不同的概念系统，因此先确定当前学科与段落功能，再选词义。

教材中的定义与研究论文中的贡献声明使用不同阅读路线。前者帮助建立对象，后者要联系已有工作与证据。先从导论、章节目的、符号表和图题建立定位，随后进入具体论述。

## 2. 集合、映射与函数

`set` 是对象的集合，集合中的对象叫 `element` 或 `member`。`subset` 的每个元素都属于另一个集合；`union` 合并成员，`intersection` 保留共有成员，`complement` 描述相对全集未包含的部分。

`function` 或 `mapping` 把 `domain` 中的每个输入对应到一个输出。`codomain` 是预先规定的目标集合，`range` 或 `image` 是实际达到的输出集合，两者不一定相同。

`injective` 表示不同输入不会得到同一输出，`surjective` 表示目标集合中的每个元素都被达到，`bijective` 同时满足两者。材料也会写 `one-to-one` 和 `onto`。

## 3. 极限、趋近与连续性

`limit` 描述输入接近某点时输出趋向的值，不必要求函数在该点本身取这个值。`x approaches a` 与 `the limit exists` 是过程和结论两个层次。

`converge` 表示序列或过程趋向有限目标，`diverge` 表示不收敛。`arbitrarily close` 不是“大概接近”，而是误差可以按要求变得任意小。

`continuous` 的直觉是微小输入变化只造成微小输出变化，正式定义则由极限表达。`The function is continuous at x equals a.` 是局部性质；`continuous on an interval` 才覆盖整个区间。

## 4. 导数：瞬时变化与局部近似

`derivative` 描述函数相对输入的瞬时变化率，也给出曲线切线的 `slope`。`differentiate the function` 是求导，`differentiable` 是可导。

如果 `position` 是时间的函数，一阶导数可解释为 `velocity`，二阶导数为 `acceleration`。在其他语境中，导数仍是局部敏感度，不必具有运动含义。

`increasing`、`decreasing`、`stationary point`、`local maximum` 和 `local minimum` 把导数符号与函数形状连接起来。`local` 只比较附近，不保证是整个定义域的最大或最小。

## 5. 积分：累积、面积与逆过程

`integral` 描述连续累积。`definite integral` 在区间上给出一个值，常可解释为带符号面积；`indefinite integral` 表示一族 `antiderivative`。

`integrand` 是被积函数，`bounds` 或 `limits of integration` 是积分上下限。`integrate with respect to x` 指定累积变量，其他量在该操作中通常视为参数。

微积分基本定理把 `derivative` 与 `integral` 连接为局部变化和整体累积的逆关系。`area under the curve` 是常见直觉，但积分还可表示质量、概率或总效应。

## 6. 向量、矩阵与线性变换

`vector` 可以表示有序分量、方向量或向量空间中的元素；`magnitude` 是大小，`direction` 是方向。`scalar multiplication` 改变向量尺度，`dot product` 把两个向量映射为标量。

`matrix` 是按行列排列的数或符号，也可表示 `linear transformation`。`row` 是行，`column` 是列，`transpose` 交换行列，`inverse` 在存在时撤销原变换。

线性方程组常写成矩阵形式。`rank` 反映独立方向的数量，`determinant` 与可逆性和尺度变化相关，`eigenvalue` 与 `eigenvector` 描述变换保持方向的特殊向量关系。

## 7. 优化、模型与约束

`objective function` 是要最大化或最小化的量，`constraint` 限制允许解，`feasible region` 是满足全部约束的集合。`optimum` 是在给定模型和约束内的最佳点，不保证现实世界绝对最佳。

`parameter` 控制模型形式，`variable` 在问题中变化，`assumption` 规定模型成立的条件。`fit a model` 是用数据选择或估计模型参数，`validate a model` 是检查它在目标任务和数据上的表现。

`trade-off` 表示改善一个目标可能损害另一个。多目标问题中，`optimal` 必须连同目标函数、约束和评价标准阅读。

## 8. 数学证明的语言

定义常写 `We define A to be B.`；引入对象常写 `Let x be a real number.`；存在性用 `there exists`，全称性用 `for every` 或 `for all`，唯一性用 `there exists a unique`。

`lemma` 是服务于更大证明的辅助结果，`proposition` 是一般命题，`theorem` 通常是较重要的已证结果，`corollary` 是由前述结果直接推出的结论。

证明策略包括 `direct proof`、`proof by contradiction`、`proof by induction` 和 `counterexample`。`without loss of generality` 表示所选情形能代表其他对称情形，并非允许随意忽略困难情况。

## 9. 从术语连接到完整论述

认识术语之后，还要看它与动作、条件和证据怎样相连。`defined as` 提示定义，`derived from` 提示推导或来源，`depends on` 提示依赖关系，`under these conditions` 提示范围。

通用长句结构回查语法系列，证据与引用回查共通学术阅读。专业术语由当前学科材料解释；把语法连接和领域对象分开核对，才能读清作者究竟提出了什么。

## 10. 本科、研究生与博士的阅读层次

本科教材层从集合、函数和定理的定义读起，确认符号对应的对象以及命题的量词范围。

研究生专题层读专著中的条件细分和证明策略，比较 lemma、theorem 与 corollary 在论证中的位置。

博士文献层寻找新定理或方法相对已有结果改变的假设和结论，追踪证明依赖、反例与适用边界。

层次表示材料深度和所需背景。已熟悉专题的读者可以直接选读，不必把同一主题按学历重复学习。

---

相关篇章：[教材、专著、综述和研究论文的结构](#course=textbooks-monographs-reviews-and-research-papers) · [方法、数据、图表与结果表达](#course=methods-data-figures-and-results) · [引用、证据、局限与研究贡献](#course=citations-evidence-limitations-and-contributions)
