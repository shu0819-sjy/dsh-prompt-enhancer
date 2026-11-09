---
name: enhance-diverge
description: 发散模式——把简短草稿发散为多维度优化清单：枚举该任务可优化的具体维度（性能/可读性/健壮性/安全/测试/架构…），每条一句话说明覆盖什么与为什么；结合会话参考裁剪不相关维度。T2 为选中维度的子维度拆分增量。
mode: diverge
templates:
  t1: system.md
  t2: increment.md
retrieve:
  kind: rounds
  windows: [[1, 2], [3, 5], [6, 10]]
sources: ["session"]
rules: [{"rule": "reference-guide", "when": "参考块/记忆命中"}, {"rule": "diverge-override", "when": "始终生效：本模式放宽 discipline 第 9 条稳定性约束（枚举发散允许），其余纪律不变"}]
---
