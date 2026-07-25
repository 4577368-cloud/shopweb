# SKU 页 Agent AI 区域 · LLM 自然语言指挥能力审计

> 范围：仅 sku-align 板块中与 AI / 自然语言指挥相关的部分（即右侧 `AssistantRail` 里的 `SkuAgentPanel` + 后端 `/api/agents/sku-align/command` 命令分类链路）。
> 目标：评估向"自然语言指挥操作"升级的能力水位、定位"2 个输入框"的角色、给出可落地的升级路线。
> 审计性质：只读核查，未改动任何源码。

---

## 一、结论摘要（TL;DR）

1. **当前"自然语言指挥"是规则优先 + LLM 兜底的薄壳**：分类链路 `classifyCommandInput` 先跑正则，正则命中即返回，LLM 只在正则不识别时才调用，且 LLM 也只能在既定意图集里选。
2. **意图集极窄（仅 6 个）**：全部是视图/导航类 + 2 个动作，**没有任何核心编辑操作指令**（绑定/解绑/换货源/加补充货源/忽略/设为手动）。工作台上的编辑按钮无法用语言触发。
3. **实体/槽位抽取能力几乎为零**：只能按商品 ID、标题子串、或"当前聚焦商品"定位，无法表达"第 3 个变体""红色 S 码""价格 > 100 的""第二个货源"等。
4. **2 个输入框角色清晰**：① Agent 自然语言框（应做 NL 主力，当前过弱）；② 商品列表搜索框（快捷检索，可并入①）。
5. **对照"最强"的选品页 LLM**：选品页也是"规则路由 + LLM 文案润色"，并非真正的 NL 指挥。所以"系统最强仍不足"成立——sku 升级应直接对标"真·自然语言指挥"，而非复制选品页模式。

---

## 二、当前架构（调用链）

```
用户输入（SkuAgentPanel <input>）
   └─ handleSubmit → classifySkuCommandInput(text, ctx, locale)
        └─ shared classifyCommandInput
             ├─ [1] rulesClassify = classifySkuCommandByRules（正则）  ← 命中即返回，LLM 不调用
             └─ [2] 仅当正则未命中 → fetch POST /api/agents/sku-align/command
                  └─ route.ts：再次先跑正则；未命中才 chatCompletionJson(系统prompt, text, temp=0.1)
                       └─ parseSkuCommandDraft → 仅能在 6 个 intent 中选
        ↓ 得到 SkuCommandDraft
   planSkuCommand(t, draft, ctx) → SkuCommandPlan（含可执行判定/澄清）
        └─ CommandAgentExecution 展示 + 确认/执行
```

**关键事实**：
- `shared/command-client.ts:20-21`：本地正则 `confidence==="high"` 直接 `return`，**LLM 被短路**。
- `route.ts:24-27`：服务端也先跑正则再调 LLM（双重规则优先）。
- LLM 端点 `/api/agents/sku-align/command/route.ts` **确实存在且接线正常**（兜底 LLM 是活的，只是被规则挡在前面）。

---

## 三、两个输入框的审计结论

整个 sku-align 功能里只有 2 个 `<input>`（已在全仓 grep 确认）：

| # | 位置 | 当前角色 | 审计判定 |
|---|------|----------|----------|
| ① | `sku-agent-panel.tsx:311`（rail 内） | 自然语言指挥输入框 | **应作为"自然语言指挥"唯一主力入口**。当前因规则优先 + 6 意图而过弱，需升级为 LLM 优先 + 扩意图 + 槽位抽取。 |
| ② | `page.tsx:764`（主面板顶部） | 商品列表子串搜索框 | **当前是"快捷检索快捷键"**（纯 `includes` 子串匹配）。建议保留为快速检索，同时让①也能理解搜索类自然语言（如"搜红色连衣裙"），逐步统一；或把②降级为①的快捷入口（点击聚焦①并预填查询）。 |

**附加（非 `<input>`，但属"快捷发放指令"）**：`SkuAgentPanel` 的 `exampleCommands` 快捷指令 chips（`只看部分关联 / 批量确认待确认 / 重新对齐 / 解释匹配`）已是快捷指令，可扩充为更多高频操作的一键入口。

**为什么②"看起来很奇怪"**：它与①在视觉上分属两块（rail vs 主面板头部），功能又高度可能重叠（都能"找商品"）。用户感知到的"两个输入框"大概率就是①+②。统一为单一自然语言入口能消除这种割裂感。

---

## 四、自然语言能力缺口（5 项，按优先级）

### P0 — 架构翻转：规则优先 → LLM 优先（或并行）
- 现在 NL 输入先过正则，90% 常见说法被正则"截胡"，LLM 只接盘长尾，且长尾也只能映射到 6 意图。
- 建议：`classifyCommandInput` 改为 **LLM 优先**（或 LLM 与正则并行、LLM 胜出），正则仅作极速白名单（如单个词"确认"）。让自由表述真正进入 LLM 理解。
- 注意：保留正则作为"离线/LLM 不可用"的降级路径（route.ts 已有 `LlmUnavailableError` 回退）。

### P0 — 意图集扩张：补上"核心编辑操作"
当前 6 意图：`open_filter / focus_product / batch_confirm_pending / rerun_auto_align / explain_sku_match / open_sku_detail`。
**缺的核心编辑意图（工作台已有按钮但语言不可达）**：
- `bind_variant`：把指定变体绑定到指定货源（"把红色S码绑到第二个货源"）
- `unbind_variant` / `clear_match`：解除某变体绑定
- `change_source`：更换某变体的目标货源
- `add_supplement_source`：给商品加补充货源（"给这件再加个补充货源"）
- `ignore_match`：忽略某条建议（"忽略这个匹配"）
- `set_manual`：标记为人工已处理
- `adjust_threshold` / `tune`：调整匹配阈值（"把置信度阈值调到 0.6"）
- 复合/批量："把价格>100 的都确认""把第 2~5 个变体绑到货源A"

这些应进 `SKU_COMMAND_DEFS` / `SkuCommandId`，并在系统 prompt 的 `Available commands` 中列出。

### P1 — 槽位/实体抽取
- 商品：除 ID / 标题子串 / 当前聚焦外，需支持**自然语言指代**（"那个红色的""标题里有连衣裙的""第 3 个"）。
- 变体：需按**规格维度**定位（颜色/尺码/材质），而非只能整件商品。
- 货源：需按"第 N 个货源 / 主货源 / 补充货源 / 评分最高"定位。
- 阈值/范围：支持"价格>100""置信度低于0.5"等条件槽。

### P1 — 澄清循环（disambiguation loop）
- 现在歧义只返回一段 `clarify` 文本，无交互。
- 建议：当 LLM 置信度中等或槽位缺失时，返回**结构化追问 + 候选选项**（如"你想绑定到哪个货源？① 主货源 ② 补充货源X"），用户点选或续写即继续，形成多轮指挥。

### P2 — 指令组合 / 多步
- 现在一次输入 = 一个意图。
- 建议：支持 `"先看部分关联，再把待确认的批量确认"` 这类链式指令（LLM 拆成子计划顺序执行，每步可确认）。

---

## 五、对照选品页 LLM（为什么"最强仍不足"）

- 选品页 `orchestrator.ts` 是 **规则路由**（intent → handler），`pricing-strategist` / `sourcing-advisor` 也是规则骨架 + 模板文案，**LLM 只在 `resolveProductsAgentResponse`(`/api/agents/products/copy`) 里做文案润色**，不做"自然语言→操作"的映射。
- 因此选品页的"强"仅限于**内容生成质量**，而非**自然语言指挥能力**；其指挥能力同样薄弱。
- **结论**：sku 不应复制选品页"规则+润色"模式，而应直接建设"LLM 优先的自然语言→操作"链路，才能满足用户"不断提高 LLM 自然语言能力"的诉求。两者可共用一套 `shared/command-client` + 系统 prompt 模板，只是 sku 这次要把 LLM 推到主驾驶位。

---

## 六、升级路线建议（仅 AI 相关部分，分阶段）

**阶段 1（低风险、立竿见影）**
- 翻转 `classifyCommandInput` 为 LLM 优先（正则降级为白名单/离线兜底）。
- 在系统 prompt 的 `Available commands` 中扩充意图描述，并相应扩展 `SKU_COMMAND_DEFS`。
- 让 Agent 输入框①能理解搜索类自然语言，逐步承接②的职能。

**阶段 2（核心能力建设）**
- 新增 `bind_variant / unbind / change_source / add_supplement_source / ignore_match / set_manual / tune_threshold` 等意图 + 对应 `plan-command` 分支 + `resolveSkuCommandExecution`。
- 强化槽位抽取：变体按规格维度、货源按序号/角色、支持范围/阈值条件。
- 接入工作台已有的执行函数（手动绑定、补充货源、忽略等），使语言指令真正落地。

**阶段 3（体验闭环）**
- 澄清循环：中等置信/缺槽位时返回结构化追问 + 候选。
- 指令组合：链式/批量自然语言。
- 持续用真实用户输入做 few-shot / 评测，迭代 prompt 与意图集（"不断提高"的常态化机制）。

---

## 七、风险与约束

- **破坏性操作必须二次确认**：`batch_confirm_pending` 已是 `sensitivity:"high"` + `confirmationRequired`。新增 `unbind / change_source / ignore` 等也应归为 high，进入 `CommandAgentExecution` 的确认流水线（已有机制，复用即可）。
- **不要批量改写用户文件**：本次仅为审计；后续任何实现均按"逐键/逐函数手术式修改 + `git diff` 自检"执行，绝不跑重构脚本、绝不 `git checkout` 用户文件（已写入 `~/.workbuddy/MEMORY.md` 铁律）。
- **LLM 不可用降级**：保留正则/模板兜底，保证离线或模型故障时不至于完全失灵。

---

## 附：本次审计涉及的关键文件（只读）

- `src/components/sku-align/sku-agent-panel.tsx`（Agent 面板 + 输入框① + 快捷指令）
- `src/components/sku-align/sku-align-ai-panel.tsx`（仅按钮，无输入）
- `src/app/[locale]/sku-align/page.tsx`（输入框② + rail 布局）
- `src/lib/agents/sku-align/classify-command.ts`（正则分类 + LLM 系统 prompt）
- `src/lib/agents/sku-align/command-client.ts`（规则优先调度）
- `src/lib/agents/shared/command-client.ts`（rules-first 实现）
- `src/lib/agents/sku-align/plan-command.ts`（意图→计划）
- `src/lib/agents/sku-align/command-schema.ts`（6 意图定义）
- `src/app/api/agents/sku-align/command/route.ts`（LLM 兜底端点，已接线）
- 参照：`src/lib/agents/products/orchestrator.ts` + `pricing-strategist.ts` + `enrich-copy.ts`
