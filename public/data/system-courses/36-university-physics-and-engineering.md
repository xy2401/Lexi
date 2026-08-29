# 物理与工程：模型、测量与系统

> **中心问题**：怎样读懂大学物理与工程材料中“系统如何建模、响应如何测量、设计受什么约束”？
>
> **阅读场景**：大学教材、工程说明、实验图注、材料数据表和模型摘要。
>
> **课程边界**：本课解释跨物理与工程的术语网络，不提供设计计算、设备操作、故障处置或安全认证。

物理材料倾向于问规律怎样描述系统，工程材料还会问在约束下怎样实现目标。共同语言是 `model`、`input`、`response`、`measurement`、`constraint` 与 `uncertainty`。

## 1. 量纲、单位与向量

`dimension` 描述量的物理类型，如长度、时间和质量；`unit` 是具体尺度。`dimensional analysis` 检查等式两边量纲是否一致，也帮助判断一个模型可能缺少什么因素。

`scalar` 只有大小，`vector` 还有方向。`component` 是向量沿某一坐标方向的分量，`resultant` 是多个向量合成后的结果。`resolve a force into components` 是把力分解，不是“解决一股力”。

`magnitude` 表示矢量大小，`direction` 表示方向，`coordinate system` 决定分量怎样表示。换坐标会改变分量，不会改变同一物理向量。

## 2. 力学：状态、相互作用与守恒

`momentum` 是质量与速度相关的矢量，`impulse` 是力随时间的累积并改变动量。`conservation of momentum` 适用于选定系统在外部冲量可忽略的条件下。

`torque` 描述力使物体转动的效应，`angular momentum` 是旋转运动的重要状态量。`equilibrium` 可以是合力与合力矩都为零的静态或动态平衡。

工程叙述会区分 `load`、`support` 和 `reaction force`。`free-body diagram` 隔离研究对象并画出外力，它是分析模型，不是物体的照片。

## 3. 场、电势与电路模型

`field` 给空间中每一点赋予一个物理量，如 `electric field` 或 `magnetic field`。`potential` 是与单位量相关的势能描述，`potential difference` 驱动能量转移。

电路模型使用 `voltage`、`current`、`resistance`、`capacitance` 和 `inductance` 描述元件关系。`node` 是连接点，`branch` 是支路，`ground` 是选定的参考电势，不必等同于实际大地。

`steady state` 表示瞬态过程结束后宏观量按某种规律稳定，`transient response` 是系统从一个状态过渡到另一个状态的响应。

## 4. 热力学：系统、能量与熵

`system` 是分析边界内的对象，`surroundings` 是边界外环境。`open system` 可交换物质和能量，`closed system` 可交换能量但不交换物质，`isolated system` 理想上都不交换。

`state variable` 描述系统平衡状态，`process` 描述状态怎样改变。`heat` 和 `work` 是跨边界的能量传递方式，不是系统内部“含有”的物质。

`entropy` 可与能量分散、微观状态数和不可逆性联系，不能简单等同于“混乱”。`The entropy of an isolated system does not decrease.` 是带有系统边界的陈述。

## 5. 波、频率与信号

`signal` 是承载信息、随时间或空间变化的量。`amplitude` 描述幅度，`frequency` 描述重复快慢，`phase` 描述周期中的相对位置，`spectrum` 展示信号按频率分解后的组成。

`bandwidth` 是系统或信号涉及的频率范围，`noise` 是不需要的随机或非目标成分，`signal-to-noise ratio` 比较有用信号与噪声强度。

系统的 `input` 经过传递过程形成 `output`。`frequency response` 描述不同频率输入被放大、衰减或延迟的程度；`filter` 按频率特征保留或削弱成分。

## 6. 材料：应力、应变与性质

`stress` 是单位面积上的内部受力量，`strain` 是相对形变。日常英语里 `stress` 指压力感，工程材料中必须看单位和方向。

`elastic` 表示卸载后大体恢复，`plastic deformation` 表示留下永久形变。`stiffness` 是结构或材料抵抗形变的程度，`strength` 是承受失效前载荷的能力，二者不能互换。

`toughness` 关注断裂前吸收能量的能力，`hardness` 关注抵抗压入或划伤，`brittle` 描述较少塑性形变就断裂。材料数据必须连同测试条件阅读。

## 7. 模型、约束与设计权衡

`model` 通过假设简化系统，`simulation` 按模型计算系统行为，`prototype` 是用于验证形式或功能的实体或可运行版本。三者处于不同抽象层级。

`requirement` 说明系统必须实现什么，`constraint` 限制可行选择，`specification` 把要求写成可检查的技术描述。`criterion` 是判断方案的标准。

工程设计常面对 `trade-off`：质量、成本、效率、可靠性和安全裕度无法同时无限改善。`optimize` 总是相对于目标和约束，不等于让所有指标都最大。

## 8. 测量、不确定度与校准

`accuracy` 是接近参考值的程度，`precision` 是重复结果的集中程度，`resolution` 是仪器可分辨的最小变化。高分辨率不自动保证高准确度。

`calibration` 用已知参考检查和调整测量系统，`traceability` 把测量结果连接到可追溯的参考链。`systematic error` 造成持续偏差，`random error` 造成散布。

`uncertainty` 量化对测量结果合理范围的认识。材料可能写 `reported with an uncertainty of`、`within tolerance` 或 `below the detection limit`；这些限定词是结果的一部分。

## 9. 系统响应、稳定性与失效

`feedback` 把输出信息返回输入侧，`negative feedback` 常抑制偏差，`positive feedback` 常放大变化。正负描述作用方向，不直接表示好坏。

`stability` 关注受扰动后系统是否保持有界或回到目标状态，`robustness` 关注模型误差或环境变化下性能是否仍可接受，`reliability` 关注规定条件和时间内完成所需功能。

`failure mode` 是系统可能怎样失效，`factor of safety` 或 `safety factor` 提供设计裕度。读这些术语是为了理解文档，不应用来替代合格工程判断。

## 10. 本课回看

大学物理与工程材料可以沿一条链阅读：量纲和 `vector` 定义量，`momentum`、`field`、`potential` 与 `entropy` 描述系统，`signal` 描述信息变化，`stress` 与 `strain` 描述材料响应，模型再受约束、测量 `uncertainty` 和失效条件检验。每个结论都要连同系统边界与假设理解。
