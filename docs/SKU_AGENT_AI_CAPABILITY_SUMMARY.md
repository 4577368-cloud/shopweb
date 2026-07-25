# SKU 页 Agent AI 自然语言指挥能力总结

> 范围：仅 sku-align 板块的 AI 相关部分（自然语言指挥升级 Phase 1 + Phase 2）
> 时间：2026-07-23
> 原则：逐函数手术式修改 + git diff 自检，未触碰用户其它内容；products/logistics 命令链路行为不变。

---

## 一、能力总览（Before → After）

| 维度 | 升级前 | 升级后（Phase 1+2） |
|---|---|---|
| 分类策略 | **规则优先**：正则命中即返回，LLM 仅在正则不识别时薄兜底 | **LLM 优先**：自然语言先交模型理解，仅 LLM 不可用时回退规则 |
| 意图数量 | 6 个（全视图/导航） | **13 个**（6 视图/导航 + 7 编辑操作） |
| 可执行的"真动作" | 仅 `batch_confirm_pending`（批量确认） | 增加 `unbind`（真实解绑 mutation）+ 6 个编辑意图引导到 workbench |
| 槽位抽取 | ≈ 0（仅商品 ID/标题子串/当前聚焦） | 变体按**规格/序号**、货源按**序号/角色**、阈值按**自然语言** |
| LLM 端点 | 接线正常但被规则挡在前面 | 真正生效，作为主路径 |
| 理解不了时 | 静默降级到规则误分类 | 返回**澄清提示**，不再误分类 |

---

## 二、能力项清单（13 个意图）

### A. 视图 / 导航类（原 6 个，理解力增强）
| 意图 | 能力 | 自然语言示例 |
|---|---|---|
| `open_filter` | 过滤商品列表（全量/已关联/部分关联） | "只看待确认的" "显示部分关联" "show partially linked" |
| `focus_product` | 聚焦/定位某商品 | "看下拖鞋那个" "focus the slippers" |
| `open_sku_detail` | 打开商品 SKU 映射工作台 | "打开详情" "open the mapping workbench" |
| `batch_confirm_pending` | 批量确认待确认匹配（高敏感，强制确认） | "把待确认的一起确认" "batch confirm pending" |
| `rerun_auto_align` | 重新生成自动匹配 | "重新匹配" "re-match" |
| `explain_sku_match` | 解释某个变体为何对上该货源 | "为什么会对上" "explain this match" |

### B. 编辑操作类（新增 7 个，Phase 2）
| 意图 | 能力 | 执行方式 | 自然语言示例 |
|---|---|---|---|
| `unbind` | **真实解绑变体绑定**（高敏感，确认预览） | 调 `unbindWithFallback` 真实 mutation | "解绑红色 S 码" "unbind the red S" |
| `bind_variant` | 把变体绑定到指定货源 | 解析商品+变体 → 打开 workbench 选货源 | "把红色 S 码绑到第二个货源" |
| `change_source` | 更换变体的已绑定货源 | 解析后 → 打开 workbench | "把红色 S 码换成第三个货源" |
| `add_supplement_source` | 给商品加补充货源 | 解析后 → 打开 workbench | "给这个商品加个补充货源" |
| `ignore_match` | 忽略某变体的待确认匹配 | 解析后 → 打开 workbench | "忽略红色 S 码的待确认" |
| `set_manual` | 手动指定变体绑定（含货源 ID） | 解析后 → 打开 workbench | "手动把 M 码绑到货源 12345" |
| `tune_threshold` | 调整匹配阈值 | 解析后 → 打开 workbench 匹配设置 | "调高匹配阈值" "更严格一点" |

---

## 三、槽位抽取能力（自然语言 → 结构化参数）

这是"自然语言指挥"的核心升级点。模型现在能识别并填充以下槽位：

| 槽位 | 抽取方式 | 示例 |
|---|---|---|
| 商品定位 | 当前聚焦 / 标题子串 / 显式 ID | "这个" / "拖鞋" / "商品 12345" |
| 变体定位 | **按规格**（颜色+尺码）/ **按序号**（第 N 个）/ 隐含当前 | "红色 S 码" / "第 3 个变体" |
| 货源引用 | **按序号**（第 N 个货源）/ **按角色**（主货源/补充货源） | "第二个货源" / "补充货源" |
| 阈值 | 自然语言 → 数值（调高/更严格→0.8，调低/更宽松→0.5） | "调高阈值" → 0.8 |
| 作用域 | current / explicit / all | "全部" → all |

---

## 四、架构落地（仅 sku-align AI 文件）

| 文件 | 改动 |
|---|---|
| `lib/agents/shared/command-client.ts` | 加 `priority` 参数（默认 `rule-first`，products/logistics 不变） |
| `lib/agents/sku-align/command-client.ts` | 调用传 `priority:"llm-first"` |
| `app/api/agents/sku-align/command/route.ts` | 翻转为 LLM 优先，LLM 不可用才回退规则 |
| `lib/agents/sku-align/classify-command.ts` | 系统 prompt 补 7 意图示例句式 + 槽位抽取规则；规则兜底加 `unbind` |
| `lib/agents/sku-align/command-schema.ts` | 增 7 意图 + 槽位参数类型 + 命令定义 |
| `lib/agents/sku-align/plan-command.ts` | 增 7 意图规划 + 变体解析 `resolveVariantId` + 执行映射 |
| `lib/agents/sku-align/command-ui-config.ts` | 增 7 条 UI 配置（高敏感+确认预览/直接导航） |
| `lib/agents/sku-align/skills.ts` | 增 `binding` 技能，覆盖 7 个新意图 |
| `app/[locale]/sku-align/page.tsx` | 增 `unbind` 预览生成器 + 执行器（调 `unbindWithFallback`） |
| 四语字典 `en/fr/es/zh.ts` | `agentSku` 增 13 键 + `sku.unbindDone`（纯加法镜像） |

---

## 五、安全设计（遵守"不弄坏东西"铁律）

1. **隔离影响面**：`priority` 参数化，products/logistics 完全走默认 `rule-first`，行为不变。
2. **列表页无货源目录**：6 个 source 依赖型意图不直接执行，而是复用 `focus_product` 导航打开对应 workbench（零新执行代码路径、不动 workbench），由用户在工作台完成具体货源选择。
3. **唯一真实 mutation 是 `unbind`**：走现有 `CommandAgentExecution` 确认流水线（高敏感 + requiresPreview），不裸奔。
4. **理解不了 → 澄清**：不再静默降级到规则误分类。
5. **全程 git diff 自检**：`sku-product-workbench.tsx` / `sku-binding-panel.tsx` 等用户存量文件未被触碰。

---

## 六、尚未完成（Phase 3，未启动）

- **澄清循环**：歧义时返回结构化追问 + 候选（而非一次性 clarify 文案）。
- **指令组合**：支持多步/条件指令（"先看部分关联，再把待确认批量确认"）。
- **few-shot 评测常态化**：用真实输入做意图识别回归评测。
- **source 依赖意图的端内直执行**：待 workbench 货源目录可被列表页安全引用后，可让 `bind_variant`/`change_source` 等真正在 rail 内完成，不用跳转。

---

## 七、验证状态

- Phase 1 + Phase 2 改动：`tsc --noEmit` 零错误；`npm run build` 退出码 0（历史构建已通过）。
- 本次仅为总结输出，**未重新 build**（按用户要求）。
