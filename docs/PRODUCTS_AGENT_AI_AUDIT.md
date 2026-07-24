# 选品页 Agent AI · 自然语言找品与上架能力盘点

> 范围：`/products`（智能选品）右侧 `ProductsAgentPanel`、发现新品 `CatalogPublishPanel`、店铺商品关联 `ShopProductsPanel`，及后端 agent / catalog / match 链路。  
> 目标：对照产品**终极能力**评估现状、缺口与建设路线。  
> 性质：只读盘点（2026-07-23），未改源码。

---

## 一、产品终极能力（North Star）

用户语言 → **帮商家找品**（Tangbuy 商品库 + 1688 货源）→ 看中后 **上架到 Shopify**。

| 原则 | 说明 |
|------|------|
| **不接受 1688 直上架 Shopify** | 1688 必须先进入 Tangbuy 商品库，再走 Tangbuy 商品的上架逻辑 |
| **搜索结果展示价** | Tangbuy 商品：**不加价**（用户看到 ≈ 采购/成本口径或 1×）；1688 商品：**默认 ×1.2** 展示 |
| **上架触发** | 点击 **或** 自然语言指挥（「把这个上架」「发布第 3 个」） |
| **1688 上架路径** | 与现有关联流程一致：`preferred-pool` 入池 → 解析 `internalGoodsId` → 按 Tangbuy catalog 逻辑 `publishCatalogItem`；入 Tangbuy 时默认售价亦为 **1.2×** 采购价 |

这与 `docs/Tangbuy-AI-Sourcing-Shopify-Visual-Spec.md` 中「输入需求 → AI 理解 → 浏览候选 → 导入 Shopify」方向一致，但需明确 **双货源合流 + 分源加价 + 禁止 1688 直发** 三条硬约束。

---

## 二、当前页面结构（两条业务线，一个输入框）

```
/products
├── Tab「Shopify 商品」(shop)     — 已有店铺商品 ↔ 货源关联
└── Tab「选品发现」(catalog)       — Tangbuy 商城推荐列表 → 一键上架 Shopify
```

右侧 **同一个** `ProductsAgentPanel` 输入框，内部是 **两条 AI 车道**：

### 车道 A — 顾问 / 问答（orchestrator）

```
输入 → classifyProductsShortInput（关键词规则）
     → routeProductsIntent → sourcing-advisor | pricing-strategist（规则骨架）
     → /api/agents/products/copy（LLM 润色文案）
     → suggestedAction（点按钮才动页面）
```

- **LLM 不做**「自然语言 → 结构化操作」
- 强在：店铺状态摘要、定价解释、匹配理由、筛选建议、跳 Tab
- 弱在：不能执行「搜红色连衣裙」「上架这个」

### 车道 B — 受控命令（command）

```
输入 → classifyProductCommandInput（规则优先 → 未命中再 LLM）
     → planProductCommand → 确认卡 → commandExecutors（page.tsx）
```

已支持 **13 个 intent**（筛选、聚焦、重搜候选、解释匹配、开定价、改价/文案、批量、draft/archive 等），**全部围绕「已有 Shopify 商品」**，**没有**：

- `search_sourcing` / `find_products`（找 Tangbuy+1688 新品）
- `publish_catalog_item` / `list_to_shopify`（发现 Tab 上架）
- `set_discover_filters`（自然语言改发现筛选项并执行搜索）

命令未命中时 **fallback 到车道 A**，用户易感到「说了指令却在聊天」。

---

## 三、找品能力盘点

### 3.1 「选品发现」Tab — 仅 Tangbuy 商城

| 项 | 现状 |
|----|------|
| 数据源 | `fetchMallPage` → `tangbuy.cc` `allSubScriptionSearch`（`CatalogPublishPanel`） |
| 关键词 | 筛选区 `keywords` + 推荐类目拼进 gateway 请求 |
| 1688 | **不在此 Tab 出现**；列表项 `offerId1688` 多为 null |
| 图搜 / 文搜 1688 | **无** |
| AI 参与 | `go_discover` / `suggest_filters` 仅 **切 Tab + 预置类目/关键词**（`filterPresetRequest`），不执行真实检索 |

**结论**：发现 Tab = Tangbuy catalog 浏览器，**不是**「Tangbuy + 1688 统一找品」。

### 3.2 「Shopify 商品」Tab — 1688 仅用于「关联」，不是「找新品上架」

| 项 | 现状 |
|----|------|
| 场景 | 店铺**已有**商品缺货源 |
| 能力 | `runImageSearchPipeline` → `/api/plugin/match/image-search`（1688 图搜） |
| 结果 | 确认绑定 → `confirmImageMatch` + 可选 `preferred-pool` 入池 |
| NL | `rerun_candidate_search` 命令 / `propose_candidate_search` 意图 → 重搜**当前聚焦商品**的候选 |

**结论**：1688 能力绑在 **关联链路**，与「从 0 选新品上架」是不同产品路径，**未与发现 Tab 合并**。

### 3.3 与 North Star 的差距（找品）

| 能力 | North Star | 现状 | 缺口 |
|------|------------|------|------|
| 统一结果集（Tangbuy + 1688） | 同一列表、标出来源 | 分两 Tab、两种 API | **大** |
| 自然语言找品 | 「找夏季连衣裙 20 美元以内」 | 仅规则切 Tab/类目 | **大** |
| 文搜 1688 | 关键词/类目搜 1688 offer | 仅图搜且仅关联场景 | **大** |
| 图搜找新品 | 上传图/链接触发双源搜索 | 图搜仅 shop 关联 | **中** |
| AI 排序/解释 | 推荐理由、风险 | 店铺侧有 `explain_match_*`；发现侧无 | **中** |

---

## 四、定价与展示盘点

### 4.1 当前定价模型

- 全局 `PricingTemplate`：`exchangeRate × multiplier + addend`（`calculateSalePrice` / `listingSalePrice`）
- 发现 Tab 建议售价：`toCatalogRecommendation(row, template)` — **所有 catalog 行同一套倍率**
- 默认倍率：后端/前端 fallback **`multiplier: 2`**（`pricing-template-drawer.tsx` `FALLBACK_FORM`），**不是 1.2**
- Tangbuy vs 1688：**无分源加价**；`CatalogRecommendation` 有 `offerId1688` / `upstreamPlatform` 字段，但列表逻辑未按来源分支计价

### 4.2 与 North Star 的差距（定价）

| 规则 | North Star | 现状 |
|------|------------|------|
| Tangbuy 展示 | 不加价（1×） | 走完整 template（含 multiplier） |
| 1688 展示 | 默认 1.2× | 未进发现列表；若入池后当 Tangbuy 卖，仍用全局 multiplier |
| 入 Tangbuy 默认价 | 1.2× 采购价 | 入池 API 不传价；上架价来自 template 推算 |

**建议数据模型（实现时）**：`displayPrice = cost × sourceMarkup(source)`，其中 `TANGBUY_CATALOG → 1.0`，`OFFER_1688 → 1.2`；与店铺级「上架定价模板」解耦或作为发现专用 override。

---

## 五、上架能力盘点

### 5.1 Tangbuy 商品 → Shopify（已有）

```
CatalogProductCard「上架」
  → resolvePublishSnapshot(item)（itemGet 富化）
  → api.publishCatalogItem(shopName, candidateId, snapshot)
  → markCatalogPublished + queuePublishReveal（店铺 Tab 动画回显）
```

- 前提：`candidateId` 已是 Tangbuy **internal goodsId**
- 交互：`window.confirm` + 按钮，**无 NL 命令**
- AI：`go_discover` 只打开 Tab，**不能**「上架第 2 个」

### 5.2 1688 商品 → Shopify（North Star 路径）

目标链路：

```
1688 offer（搜索结果）
  → preferred-pool/add（入 Tangbuy 商品库）
  → poll internalGoodsId
  → 与 Tangbuy 商品相同：resolvePublishSnapshot + publishCatalogItem
  → 禁止跳过入池直发 Shopify
```

| 环节 | 现状 |
|------|------|
| 入池 | `resolveIdentityWithPreferredPool` / `ensurePoolIngestForLogistics` — **主要在选品「确认关联」、物流报价、SKU 换货源时触发** |
| 发现 Tab 上架 | **仅 Tangbuy catalog id**，无 1688 入口 |
| 入池后 publish | 理论可行（goodsId + itemGet），**未产品化** |
| token 失败 | 用户侧友好提示已部分落地；入池失败则整条链断 |

### 5.3 与 North Star 的差距（上架）

| 能力 | North Star | 现状 |
|------|------------|------|
| 点击上架 Tangbuy | ✓ | ✓（发现 Tab） |
| 点击上架 1688（先入池） | ✓ | ✗（无 1688 在发现列表） |
| NL「上架这个/第 N 个」 | ✓ | ✗ |
| NL 确认卡（售价、来源） | 建议有 | 仅浏览器 `confirm` |
| 上架后回店铺 Tab | 可选 | ✓ reveal 动画 |

---

## 六、AI Agent 能力矩阵（选品页）

| 用户想做的事 | 车道 A（顾问） | 车道 B（命令） | 页面按钮 | 缺口 |
|--------------|----------------|----------------|----------|------|
| 看店铺匹配进度 | ✓ summarize | — | 摘要条 | — |
| 只看待确认/未匹配 | ✓ go_* / open_filter | ✓ open_filter | Tab 筛选 | — |
| 解释为何推荐货源 | ✓ explain_match_* | ✓ explain_product_match | — | 需聚焦商品 |
| 重搜 1688 候选（已有商品） | ✓ propose_candidate_search | ✓ rerun_candidate_search | 图搜 | — |
| 改售价/文案 | ✓ 引导 | ✓ update_* / batch_* | 定价抽屉 | — |
| 去发现 Tab | ✓ go_discover | — | Tab | 不执行搜索 |
| 设发现筛选/关键词 | △ suggest_filters | ✗ | 筛选表单 | **无 NL 执行搜索** |
| **搜 Tangbuy+1688 新品** | ✗ | ✗ | ✗ | **核心缺口** |
| **上架某个发现结果** | ✗ | ✗ | ✓ 仅点击 | **无 NL** |
| **1688 新品入池再上架** | ✗ | ✗ | ✗ | **核心缺口** |

---

## 七、关键代码锚点（盘点引用）

| 模块 | 路径 |
|------|------|
| Agent 面板双车道 | `src/components/select/products-agent-panel.tsx` |
| 顾问路由 | `src/lib/agents/products/orchestrator.ts` |
| 顾问骨架 | `sourcing-advisor.ts`, `pricing-strategist.ts` |
| 文案 LLM | `src/app/api/agents/products/copy/route.ts`, `enrich-copy.ts` |
| 命令分类 | `command-client.ts`, `classify-command.ts`, `classify-command-service.ts` |
| 命令计划/执行 | `plan-command.ts`, `products/page.tsx` `commandExecutors` |
| 发现列表 | `catalog-publish-panel.tsx`, `catalog-recommendations.ts` |
| Tangbuy 网关 | `tangbuy-mall-gateway.ts` |
| 1688 图搜（关联） | `batch-link/image-search-pipeline.ts`, `api.imageSearch` |
| 入池 | `tangbuy/preferred-pool.ts`, `api/tangbuy/preferred-pool/add` |
| 上架 | `api.publishCatalogItem`, `resolvePublishSnapshot` |
| 定价 | `price-calculator.ts`, `listing-pricing.ts` |
| 视觉规格（目标体验） | `docs/Tangbuy-AI-Sourcing-Shopify-Visual-Spec.md` §6.2–6.3 |

---

## 八、差距总结（一张表）

| 维度 | 完成度（粗估） | 说明 |
|------|----------------|------|
| 店铺商品 ↔ 货源关联 + NL 辅助 | **70%** | 命令+顾问覆盖主流程；图搜/入池仍偏后置 |
| Tangbuy 发现 → 上架 Shopify | **55%** | 有列表+上架；定价规则与 North Star 不一致；无 NL |
| 1688 作为「找品源」 | **15%** | 仅关联场景图搜，未进统一发现 |
| 1688 → 入池 → 上架 | **25%** | 技术件有，产品路径未接 |
| NL 找品（双源） | **5%** | 仅类目/Tab 级建议 |
| NL 上架 | **0%** | — |
| 分源展示价（1× / 1.2×） | **0%** | 全局 template multiplier |

---

## 九、建议建设路线（对齐 North Star，仅选品）

### 阶段 P0 — 产品合流（少 AI，先通路）

1. **统一「找品」结果模型** `SourcingSearchHit { source: tangbuy|1688, cost, displayPrice, offerId?, goodsId?, … }`
2. **发现 Tab 或新「AI 找品」视图**：Tangbuy 关键词 + 1688 关键词/图搜 API 合并展示，**UI 标注来源**
3. **分源加价**：Tangbuy `displayMultiplier=1`，1688 `displayMultiplier=1.2`（可配置，默认 1.2）
4. **上架编排器** `publishSourcingHit(hit)`：
   - `tangbuy` → 现有 `publishCatalogItem`
   - `1688` → `preferred-pool` → poll goodsId → 同上
5. **禁止**任何 1688 直写 Shopify 的 API 路径

### 阶段 P1 — NL 指挥（命令层扩展）

在 `ProductCommandId` 增加（示例）：

| Intent | 示例 | 执行 |
|--------|------|------|
| `search_sourcing` | 「找红色连衣裙」「1688 上便宜的手机壳」 | 填筛选 + 触发双源搜索 + 切到结果视图 |
| `publish_sourcing_item` | 「上架第 2 个」「发布这个」 | 解析序号/指代 → `publishSourcingHit` + 确认卡 |
| `set_sourcing_filters` | 「预算 15 美元以内」「只看 Tangbuy」 | 结构化 filters |

- 分类建议：**LLM 优先**（可参考 SKU 阶段 1 的 `priority: "llm-first"`，仅 products command）
- 确认卡展示：**来源、采购价、展示价（1×/1.2×）、入池状态**

### 阶段 P2 — 顾问车道收敛

- 车道 A 专注 **解释搜索结果**（为何推荐、1688 vs Tangbuy 差异、入池等待）
- 减少与车道 B 重复的「去发现」空话；搜索/上架一律走命令执行层
- `copy` LLM 润色时注入 **事实**：`displayPrice`、`poolIngestStatus`（`fact-check` 已有模式可复用）

### 阶段 P3 — 体验与规格对齐

- 对齐 `Tangbuy-AI-Sourcing-Shopify-Visual-Spec.md`：分析中状态、候选对比、导入队列
- 评测集：真实商家句式 → intent + 槽位 + 上架成功率

---

## 十、风险与约束（实现时注意）

1. **TANGBUY_ADMIN_TOKEN**：入池依赖 admin token；过期则 1688 上架链全断（应控制台报错 + 用户友好文案，已部分落地）
2. **入池索引延迟**：`pending_resolve` 期间应展示「入库中」而非失败
3. **定价两套口径**：发现展示价（1×/1.2×）vs 店铺定价模板（汇率/取整）需在 UI 说清，避免与「采购成本展示」混淆
4. **命令与顾问分流**：避免「上架」被顾问当成 go_discover
5. **改动纪律**：与 SKU 审计相同 — 手术式修改、`git diff` 自检，禁止批量脚本覆盖用户字典/文件

---

## 十一、TL;DR

- **终极能力**：用户用语言 **找 Tangbuy+1688 品**，看中后 **（1688 先入 Tangbuy）上架 Shopify**；展示价 **Tangbuy 不加价、1688 默认 1.2×**。
- **今天**：选品 AI 强在 **已有店铺的关联/定价/解释**；发现 Tab **只有 Tangbuy**；1688 **只服务关联**；**没有**统一找品、分源加价、NL 上架。
- **下一步**：先做 **P0 产品合流与上架编排**，再扩 **P1 NL 命令**；顾问 LLM 退居「解释层」，指挥归命令层。
