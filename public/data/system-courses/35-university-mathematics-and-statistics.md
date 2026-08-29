# 高等数学与统计：变化、模型与推断

> **中心问题**：怎样读懂大学数学与统计材料中关于结构、变化、不确定性和论证的英语？
>
> **阅读场景**：教材定义、定理、公式说明、统计方法简介和模型讨论。
>
> **课程边界**：本课解释术语关系与数学句法，不教授计算方法；论文中报告统计结果、证据强度和审稿措辞由《论文写作与研究交流》负责。

高等数学的困难常藏在普通词里：`let` 是引入对象，`given` 是提供条件，`such that` 是施加限制，`approaches` 描述趋近。先读清这些关系，再进入公式，通常比逐个翻译符号更有效。

## 1. 集合、映射与函数

`set` 是对象的集合，集合中的对象叫 `element` 或 `member`。`subset` 的每个元素都属于另一个集合；`union` 合并成员，`intersection` 保留共有成员，`complement` 描述相对全集未包含的部分。

`function` 或 `mapping` 把 `domain` 中的每个输入对应到一个输出。`codomain` 是预先规定的目标集合，`range` 或 `image` 是实际达到的输出集合，两者不一定相同。

`injective` 表示不同输入不会得到同一输出，`surjective` 表示目标集合中的每个元素都被达到，`bijective` 同时满足两者。材料也会写 `one-to-one` 和 `onto`。

## 2. 极限、趋近与连续性

`limit` 描述输入接近某点时输出趋向的值，不必要求函数在该点本身取这个值。`x approaches a` 与 `the limit exists` 是过程和结论两个层次。

`converge` 表示序列或过程趋向有限目标，`diverge` 表示不收敛。`arbitrarily close` 不是“大概接近”，而是误差可以按要求变得任意小。

`continuous` 的直觉是微小输入变化只造成微小输出变化，正式定义则由极限表达。`The function is continuous at x equals a.` 是局部性质；`continuous on an interval` 才覆盖整个区间。

## 3. 导数：瞬时变化与局部近似

`derivative` 描述函数相对输入的瞬时变化率，也给出曲线切线的 `slope`。`differentiate the function` 是求导，`differentiable` 是可导。

如果 `position` 是时间的函数，一阶导数可解释为 `velocity`，二阶导数为 `acceleration`。在其他语境中，导数仍是局部敏感度，不必具有运动含义。

`increasing`、`decreasing`、`stationary point`、`local maximum` 和 `local minimum` 把导数符号与函数形状连接起来。`local` 只比较附近，不保证是整个定义域的最大或最小。

## 4. 积分：累积、面积与逆过程

`integral` 描述连续累积。`definite integral` 在区间上给出一个值，常可解释为带符号面积；`indefinite integral` 表示一族 `antiderivative`。

`integrand` 是被积函数，`bounds` 或 `limits of integration` 是积分上下限。`integrate with respect to x` 指定累积变量，其他量在该操作中通常视为参数。

微积分基本定理把 `derivative` 与 `integral` 连接为局部变化和整体累积的逆关系。`area under the curve` 是常见直觉，但积分还可表示质量、概率或总效应。

## 5. 向量、矩阵与线性变换

`vector` 可以表示有序分量、方向量或向量空间中的元素；`magnitude` 是大小，`direction` 是方向。`scalar multiplication` 改变向量尺度，`dot product` 把两个向量映射为标量。

`matrix` 是按行列排列的数或符号，也可表示 `linear transformation`。`row` 是行，`column` 是列，`transpose` 交换行列，`inverse` 在存在时撤销原变换。

线性方程组常写成矩阵形式。`rank` 反映独立方向的数量，`determinant` 与可逆性和尺度变化相关，`eigenvalue` 与 `eigenvector` 描述变换保持方向的特殊向量关系。

## 6. 概率变量与分布

`random variable` 把随机结果映射为数值；`distribution` 描述这些值及其概率如何分布。`discrete` 变量取可数值，`continuous` 变量在区间内变化。

`probability mass function` 用于离散变量，`probability density function` 用于连续变量。密度的高度本身不是单点概率，区间下的面积才对应概率。

`expected value` 是按概率加权的长期平均位置，`variance` 描述离散程度，`standard deviation` 与原变量单位一致。`independent` 比“没有明显关系”更强，是联合概率结构的性质。

## 7. 样本、估计与检验

`population` 是关心的总体，`sample` 是实际观察的子集。总体的数值特征叫 `parameter`，由样本计算的量叫 `statistic`。

`estimator` 是从样本产生估计值的规则，`estimate` 是一次应用后的具体结果。`bias` 描述估计量系统偏离目标，`standard error` 描述抽样变化造成的估计不确定性。

`null hypothesis` 是检验所针对的基准主张，`alternative hypothesis` 是竞争主张。`p-value` 是在零假设及模型条件下，获得当前或更极端结果的概率；它不是零假设为真的概率，也不直接等于效应大小。

## 8. 优化、模型与约束

`objective function` 是要最大化或最小化的量，`constraint` 限制允许解，`feasible region` 是满足全部约束的集合。`optimum` 是在给定模型和约束内的最佳点，不保证现实世界绝对最佳。

`parameter` 控制模型形式，`variable` 在问题中变化，`assumption` 规定模型成立的条件。`fit a model` 是用数据选择或估计模型参数，`validate a model` 是检查它在目标任务和数据上的表现。

`trade-off` 表示改善一个目标可能损害另一个。多目标问题中，`optimal` 必须连同目标函数、约束和评价标准阅读。

## 9. 数学证明的语言

定义常写 `We define A to be B.`；引入对象常写 `Let x be a real number.`；存在性用 `there exists`，全称性用 `for every` 或 `for all`，唯一性用 `there exists a unique`。

`lemma` 是服务于更大证明的辅助结果，`proposition` 是一般命题，`theorem` 通常是较重要的已证结果，`corollary` 是由前述结果直接推出的结论。

证明策略包括 `direct proof`、`proof by contradiction`、`proof by induction` 和 `counterexample`。`without loss of generality` 表示所选情形能代表其他对称情形，并非允许随意忽略困难情况。

## 10. 本课回看

读大学数学与统计材料时，先确认对象和量词，再沿 `function`、`limit`、`derivative`、`integral` 理解变化，用 `vector` 与 `matrix` 看结构，用 `distribution`、`estimator` 和 `inference` 看不确定性。最后检查模型 `assumption`、约束和证明范围；论文如何把结果写成克制的研究主张，则回到论文课程处理。
