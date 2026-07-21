# SKU 对齐数据模型 & API 变更说明 V1

> 版本：V1.0  
> 状态：已落地 schema + API 契约 + 类型定义；业务逻辑分步实现（见文末开发顺序）  
> 路径前缀：`/api/plugin/sku-align/v1`（与 legacy `/api/plugin/match/sku/*` 并存，逐步迁移）

---

## 1. 背景与目标

### 1.1 现状问题

| 问题 | 根因 |
|------|------|
| 已绑定却显示空白 | binding 与展示数据源分裂（itemGet vs offer-detail），skuId 未校验 |
| 进页需手动点对齐 | 对齐仅在用户点击或首轮 scan 触发 |
| 状态混乱 | PENDING/ACTIVE/MANUAL/RULE/IMAGE 混在一层 UI |
| 手工结果被覆盖 | auto-align rerun 无 `is_manual_locked` 保护 |
| 无法表达 no_source / 多货源 | 仅 bound/unbound，单 variant 单 offer |

### 1.2 V1 目标

1. 已绑定却显示空白 → **展示同源 + 写入前 skuId 校验**
2. 进页静默对齐 → **alignment_run 触发链**
3. 高/中/低置信度分流 → **confidence_level + review 层**
4. 手工绑定保护 → **is_manual_locked + 覆盖规则**
5. 预留 L1 语义 / alias / 多货源 → **扩展字段与表结构**

### 1.3 V1 产品默认决策

见需求文档「一、V1 产品前提」— 均已写入状态机与 API 规则。

---

## 2. 与 Legacy 表的关系

| Legacy | V1 对应 | 迁移策略 |
|--------|---------|----------|
| `shop_product_binding` | `variant_sku_binding` | V1 写双写；读优先 V1，fallback legacy |
| `shop_product_match_candidate` | `alignment_candidate` + audit | 新 run 写 candidate 表；legacy candidate 保留历史 |
| （无） | `product_source_binding` | 商品 confirm 时 upsert |
| （无） | `variant_alignment_review` | 每次 run 更新 |
| （无） | `alignment_run` | 每次对齐任务 |
| （无） | `shop_sku_alias_knowledge` | 手工改选时写入 |

**命名映射（全文档统一）**

| 规格字段 | Legacy 列名 |
|----------|-------------|
| `shop_id` | `shop_name` |
| `shopify_product_id` | `third_platform_item_id` |
| `shopify_variant_id` | `third_platform_sku_id` |
| `offer_id` | `tangbuy_product_id` |
| `offer_sku_id` | `tangbuy_sku_id` |

---

## 3. 实体模型（DDL）

DDL 已追加至 `tangbuy-plugin/src/main/resources/schema.sql`。

### 3.1 `product_source_binding` — 商品级货源摘要

- 主货源 + 至多 1 个补充货源（`supplemental_offer_ids_json`）
- 变体计数摘要、最近 run 指针
- **不替代**变体级 binding

### 3.2 `variant_sku_binding` — 变体真实绑定（履约）

- 每 variant **至多 1 条** `active=true`
- `binding_state`: ALIGNED | MULTI_SOURCE | BLOCKED
- `is_manual_locked`: MANUAL ACTIVE / BLOCKED 时为 true
- `match_source`: IMAGE | RULE | MANUAL | CATALOG | SEMANTIC（预留）

### 3.3 `variant_alignment_review` — 建议/复核层

- `review_state`: SUGGESTED | UNMAPPED | NO_SOURCE | RESOLVED
- 存 suggested_*、reason_code、reason_text
- **不等于**可履约 binding

### 3.4 `alignment_run` — 对齐任务

- `trigger_type`: PRODUCT_BIND_CONFIRMED | PAGE_ENTER | CARD_EXPAND | MANUAL_REFRESH | ADD_SUPPLEMENT_SOURCE
- 统计 matched / suggested / unmapped / no_source / blocked / failed

### 3.5 `alignment_candidate` — Top-K 候选

- 供 drawer、Copilot、调试；预留 SEMANTIC / KNOWLEDGE_RERANK

### 3.6 `shop_sku_alias_knowledge` — 店铺级知识

- V1 仅结构 + 写入入口；不做向量检索

---

## 4. 状态模型

### 4.1 真实 binding（`variant_sku_binding.binding_state`）

| 状态 | 含义 | 物流 |
|------|------|------|
| `ALIGNED` | 已绑主货源 SKU | 可 |
| `MULTI_SOURCE` | 已绑补充货源 SKU | 可 |
| `BLOCKED` | 明确不售/不可履约 | **阻断** |

### 4.2 Review（`variant_alignment_review.review_state`）

| 状态 | 含义 |
|------|------|
| `SUGGESTED` | 有中/高置信建议，待确认 |
| `UNMAPPED` | 有货源矩阵但无足够可信候选 |
| `NO_SOURCE` | 矩阵确认缺规格（如 XXL） |
| `RESOLVED` | 无需用户处理 |

### 4.3 Run（`alignment_run.run_status`）

`QUEUED` → `RUNNING` → `SUCCEEDED` | `PARTIAL` | `FAILED`

### 4.4 UI Badge 推导（由 API 聚合，非 DB 字段）

```
if binding.active && binding_state == BLOCKED → "已阻断"
if binding.active && binding_state == MULTI_SOURCE → "多货源"
if binding.active && binding_state == ALIGNED → "已对齐"
else if review == SUGGESTED → "待确认"
else if review == NO_SOURCE → "无货源"
else if review == UNMAPPED → "未匹配"
```

---

## 5. 置信度分流规则

阈值（可配置，默认）：

| 档位 | 分数 | 本系统上架 (`origin=INTERNAL`) | 外部导入 (`origin=EXTERNAL`) |
|------|------|------------------------------|------------------------------|
| HIGH | ≥ 0.80 或单 SKU 货源 | 写 `variant_sku_binding` ALIGNED | 仅 `review=SUGGESTED` |
| MEDIUM | 0.50–0.79 | `review=SUGGESTED` + candidate | 同左 |
| LOW | < 0.50 | UNMAPPED 或 NO_SOURCE | 同左 |

**NO_SOURCE 判定**：对 option tokens 在矩阵中做维度展开后，确认不存在可映射 SKU（非「最接近」）。

---

## 6. 覆盖保护规则（强制）

1. `is_manual_locked=true` → auto-align / rerun **跳过**该 variant
2. `binding_state=BLOCKED` → 同上
3. ACTIVE binding **不得**因 rerun 降级为 SUGGESTED
4. `confirm-suggestions` 仅处理 `review_state=SUGGESTED` 且未锁定项
5. `no_source` **禁止**静默映射到最近似 SKU
6. 外部商品语义高置信 **不得** bypass 人工确认写 ACTIVE
7. 每 variant 仅 1 条 `active=true` binding；换绑 deactivate 旧行保留审计
8. legacy `shop_product_binding` 在 V1 写路径同步 deactivate，但不覆盖 MANUAL lock

---

## 7. 触发链路

| 优先级 | 事件 | trigger_type | 行为 |
|--------|------|--------------|------|
| 1 | 图搜/人工/发现新品 confirm | `PRODUCT_BIND_CONFIRMED` | 异步 run 全量变体 |
| 2 | 进入 `/sku-align` | `PAGE_ENTER` | unresolved 且 `last_aligned_at` > 10min → 静默 run |
| 3 | 展开商品卡 | `CARD_EXPAND` | 该商品有 unresolved 且无近期 run → 局部 run |
| 4 | 更多菜单「重新对齐」 | `MANUAL_REFRESH` | 强制 run，**尊重 lock** |
| 5 | 添加补充货源 | `ADD_SUPPLEMENT_SOURCE` | 仅 unresolved/no_source 变体 replan |

---

## 8. 展示数据源

1. **Primary**：itemGet SKU 矩阵（与 picker 同源）
2. **Fallback**：offer-detail AOP
3. **禁止**：binding 已 ACTIVE 但 display 字段全空 — API 返回 `display_status: LOADING | READY | ERROR` + `display_error`

写入前：`offer_sku_id` 必须存在于当前 scope 的 itemGet 矩阵。

---

## 9. API 契约

Base: `/api/plugin/sku-align/v1`  
Query 参数统一使用 `shopName`（= shop_id）。

| Method | Path | 说明 | Legacy |
|--------|------|------|--------|
| GET | `/overview?shopName=&tab=` | 商品级摘要列表 | 替代增强 `/match/sku/overview` |
| GET | `/products/{productId}?shopName=` | 单商品详情 + variants[] | 新增 |
| POST | `/runs` | 触发对齐任务 | 替代 `/match/sku/auto-align`（批量） |
| POST | `/page-enter?shopName=` | 进入页面静默刷新 stale unresolved | 新增 |
| POST | `/products/{productId}/expand?shopName=` | 展开商品卡局部刷新 | 新增 |
| GET | `/runs/{runId}?shopName=` | 查询 run 状态 | 新增 |
| POST | `/confirm-suggestions` | 批量确认 SUGGESTED | 替代多次 `/match/sku/ack` |
| POST | `/variants/{variantId}/bind?shopName=` | 手工改选 | 增强 `/match/sku/bind` |
| POST | `/variants/{variantId}/block?shopName=` | 标记 blocked | 新增 |
| POST | `/products/{productId}/supplement-source?shopName=` | 添加补充货源（≤1） | 新增 |
| GET | `/variants/{variantId}/candidates?shopName=` | Drawer 候选 | 新增 |
| POST | `/knowledge/alias?shopName=` | 写入 alias | 新增 |

Legacy `/api/plugin/match/sku/*` **V1 阶段保留**，前端逐步切 v1。

---

## 10. 开发顺序与验收

| Step | 内容 | 验收 |
|------|------|------|
| 1 | itemGet 同源 + skuId 校验 + display_status | 无「已确认+空白」 |
| 2 | review + run 表 + POST /runs | 静默跑通 suggested/unmapped/no_source |
| 3 | 触发链（confirm/page/expand） | 无需点「自动对齐 SKU」 |
| 4 | confirm-suggestions + manual lock | MANUAL 不被覆盖 |
| 5 | supplement source（1 主 + 1 补） | XXL 缺口可闭环 |

---

## 11. V1 不做

全平台 alias、向量库、1主+N补 UI、Shopify blocked 回写、no_source 风险映射、Copilot 直写 binding、物流拆单。

---

## 12. 实现清单（本次落地）

- [x] DDL：`schema.sql` 六张 V1 表
- [x] Java：枚举、实体、DTO、Controller、Service 骨架、保护规则类
- [x] TS：`src/lib/sku-align-v1/*` + `api.ts` v1 client
- [x] `alignment_run` 异步执行桥接 legacy auto-align
- [x] Step 1：itemGet 同源 + skuId 写入校验 + display_status
- [x] Step 2：review/binding 表读写 + engine 写 V1 表
- [x] Step 3：商品 confirm 钩子调用 `onProductBindConfirmed`
- [x] Step 3：触发链 PAGE_ENTER / CARD_EXPAND / MANUAL_REFRESH（前端 + Controller）
- [x] Step 4：confirm-suggestions / manual lock / alias
- [x] Step 5：supplement source
- [ ] Legacy 双写适配器
- [ ] 前端 `/sku-align` 切 v1 接口

---

## 13. 落地反馈（V1 设计交付）

### 1. 改了哪些表 / 模型

**新增 6 张表**（`tangbuy-plugin/src/main/resources/schema.sql`）：

| 表 | 职责 |
|----|------|
| `product_source_binding` | 商品级主/补货源摘要 |
| `variant_sku_binding` | 变体真实 binding（履约） |
| `variant_alignment_review` | 建议/复核层 |
| `alignment_run` | 对齐任务审计 |
| `alignment_candidate` | Top-K 候选 |
| `shop_sku_alias_knowledge` | 店铺级 alias |

**Legacy 保留**：`shop_product_binding`、`shop_product_match_candidate` — V1 过渡期双写，最终 read 切 V1。

**Java 模型**：`domain/entity/skualign/*`、`enums/skualign/*`、`domain/dto/skualign/*`

**前端**：`src/lib/sku-align-v1/types.ts`、`state-machine.ts`

### 2. API 新增 vs 复用

| V1 路径 | 状态 |
|---------|------|
| `GET /api/plugin/sku-align/v1/overview` | 已实现（bridge legacy overview） |
| `GET /api/plugin/sku-align/v1/products/{id}` | 已实现（bridge） |
| `POST /api/plugin/sku-align/v1/runs` | 已实现（写 run + 异步 legacy auto-align） |
| `POST /api/plugin/sku-align/v1/page-enter` | 已实现（Step 3） |
| `POST /api/plugin/sku-align/v1/products/{id}/expand` | 已实现（Step 3） |
| `GET /api/plugin/sku-align/v1/runs/{id}` | 已实现 |
| `POST .../confirm-suggestions` | 已实现（Step 4） |
| `POST .../variants/{id}/bind` | 已实现（Step 4，manual lock + legacy 双写） |
| `POST .../variants/{id}/block` | 已实现（Step 4） |
| `POST .../products/{id}/supplement-source` | 已实现（Step 5） |
| `POST .../knowledge/alias` | 已实现（Step 4） |

**Legacy 保留**：`/api/plugin/match/sku/*` 全量保留至前端迁移完成。

### 3. 状态机如何落地

- **DB 字段**：`variant_sku_binding.binding_state` + `variant_alignment_review.review_state` + `alignment_run.run_status`
- **服务端规则**：`SkuAlignProtectionRules`（覆盖保护、外部商品不可 auto-ACTIVE）
- **客户端推导**：`deriveVariantStatusBadge()`、`blocksLogistics()` — UI 只读 API 字段 + 纯函数，不自行拼状态

### 4. MANUAL ACTIVE 如何不被覆盖

`SkuAlignProtectionRules.isProtectedFromAutoOverwrite()`：

- `is_manual_locked=true` → skip
- `binding_state=BLOCKED` → skip

Engine 写路径（Step 2 起）在 auto-align / rerun 前必须调用；`confirm-suggestions` 用 `canConfirmSuggestion()` 过滤。

### 5. 如何避免「已确认但空白」

- API 强制返回 `displayStatus: READY | LOADING | ERROR`
- 写入前校验 `offer_sku_id ∈ itemGet 矩阵`（Step 1）
- 展示同源：picker 与详情均走 itemGet（Step 1）
- 客户端 `assertDisplayIntegrity()` — READY 但无 spec 则降级 ERROR

### 6. 进页静默对齐触发点

| trigger_type | 入口 |
|--------------|------|
| `PRODUCT_BIND_CONFIRMED` | `SkuAlignV1Service.onProductBindConfirmed()` — 待 hook 到 image confirm |
| `PAGE_ENTER` | `maybeRefreshOnPageEnter()` — stale > 10min |
| `CARD_EXPAND` | 前端调 `POST /runs` scope=PRODUCT |
| `MANUAL_REFRESH` | 商品卡 ⋮ 菜单 |
| `ADD_SUPPLEMENT_SOURCE` | 补充货源成功后 |

### 7. no_source / blocked / multi_source 区分

| 概念 | 层 | 字段 |
|------|-----|------|
| `no_source` | review | `review_state=NO_SOURCE`，矩阵缺规格 |
| `blocked` | binding | `binding_state=BLOCKED`，无 offer/sku |
| `multi_source` | binding | `binding_state=MULTI_SOURCE` + `source_role=SUPPLEMENT` |

物流阻断：`blocksLogistics()` — `NO_SOURCE`、`SUGGESTED`、`UNMAPPED`、`BLOCKED` 均阻断。

### 8. V1 仍留后续迭代

- L1 语义层（`match_source=SEMANTIC`，`engine_version=semantic-v1`）
- alias 检索增强（表已建，写入 Step 4）
- 1 主 + N 补（JSON 数组已预留，V1 业务限 1）
- Shopify blocked 回写
- Copilot 直写 binding
- 物流多供应商拆单
- Legacy 表退役与双写关闭

