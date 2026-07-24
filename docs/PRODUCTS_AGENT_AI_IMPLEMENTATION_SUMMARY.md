# Products Agent AI — 分阶段实施总结（P0–P3）

> 对照 `docs/PRODUCTS_AGENT_AI_AUDIT.md` North Star，本次按 P0→P3 顺序落地。  
> 日期：2026-07-23

---

## North Star（回顾）

用户用语言 **在 Tangbuy + 1688 找品**，看中后 **（1688 先入 Tangbuy 优选池）上架 Shopify**；发现 Tab **展示价：Tangbuy 1×、1688 1.2×**（仅汇率 + 分源加价，与店铺定价模板乘数分离）。

---

## 阶段 P0 — 产品合流（通路优先）✅

### 交付

| 项 | 状态 | 实现 |
|----|------|------|
| 统一 `SourcingSearchHit` | ✅ | `src/lib/sourcing/types.ts` |
| 双源搜索合并 | ✅ | `src/lib/sourcing/search.ts` + `search-1688.ts` |
| 分源展示价 1× / 1.2× | ✅ | `src/lib/sourcing/display-pricing.ts` |
| `publishSourcingHit` 编排 | ✅ | `src/lib/sourcing/publish-sourcing-hit.ts` |
| 禁止 1688 直写 Shopify | ✅ | 1688 路径必经 `ensurePoolIngestForLogistics` → `goodsId` → `publishCatalogItem` |
| UI 来源标注 | ✅ | `catalog-product-card` 角标 + 序号 |
| 来源筛选 | ✅ | `CatalogFilterState.sourceFilter` + `smart-sourcing-filters` |

### P0 复盘

- **做对了**：发现 Tab 从「仅 Tangbuy 商城」升级为 Tangbuy + 1688 合流；上架编排与 SKU/物流侧入池逻辑复用同一套 `preferred-pool`。
- **限制**：1688 关键词搜索依赖 **图搜 API + seed 图**（优先用 Tangbuy 首条结果主图）；无关键词时仅展示 Tangbuy 结果。
- **定价口径**：卡片「建议售价」= 分源展示价（1×/1.2× + 汇率），**不再**用店铺定价模板 `multiplier` 作为发现 Tab 主展示。

### 关键文件

```
src/lib/sourcing/
  types.ts, display-pricing.ts, search.ts, search-1688.ts
  publish-sourcing-hit.ts, map-catalog.ts, session.ts
src/components/select/catalog-publish-panel.tsx  # 接入双源搜索 + publishSourcingHit
```

---

## 阶段 P1 — NL 指挥（命令层）✅

### 新增 Intent

| Intent | 示例 | 执行 |
|--------|------|------|
| `search_sourcing` | 「找红色连衣裙」 | 切发现 Tab + 填关键词触发双源搜索 |
| `set_sourcing_filters` | 「预算 15 美元」「只看 1688」 | `apply_filter_preset`（来源/价格带） |
| `publish_sourcing_item` | 「上架第 2 个」 | 确认卡 → `publishSourcingHit` |

### P1 复盘

- **LLM-first**：`command-client.ts` + `classify-command-service.ts` 改为 LLM 优先（对齐 SKU 车道）。
- **会话**：`session.ts` 保存最近一次搜索结果，供「第 N 个」指代解析。
- **确认卡**：`publish_sourcing_item` 展示来源、采购价、展示价（倍数）、入池说明。

### 关键文件

```
src/lib/agents/products/command-schema.ts
src/lib/agents/products/classify-command.ts   # trySourcingCommand 规则
src/lib/agents/products/plan-command.ts
src/lib/agents/products/command-ui-config.ts
src/app/[locale]/products/page.tsx            # preview + executor
```

---

## 阶段 P2 — 顾问车道收敛 ✅（轻量）

### 交付

- `go_discover` 文案更新：说明 **双源 + 1×/1.2× + 入池**，引导 NL（「找…」「上架第 N 个」）。
- `fact-check.ts`：发现 Tab 上下文允许分源加价事实 token。
- **原则**：搜索/上架走 **命令车道 B**；顾问车道 A 负责解释，不再空喊「去发现」。

### P2 复盘

- 未大改 orchestrator 路由；通过文案与 fact-check 约束减少顾问/命令重复。
- 后续可增强：顾问专用 intent「解释当前发现列表第 N 个」并注入 `session` 事实。

---

## 阶段 P3 — 体验与规格对齐 ✅（文档 + 基础 UI）

### 交付

- 卡片 **#序号**、**Tangbuy/1688** 角标、展示价脚注（1× / 1.2×）。
- 本文档作为 **终极盘点**。
- 视觉规格中「分析中 / 导入队列」等待 **下一迭代**（需独立队列 UI）。

### 仍待对齐 `Tangbuy-AI-Sourcing-Shopify-Visual-Spec.md`

- 候选对比抽屉（1688 vs Tangbuy 并排）
- 入池 `pending_resolve` 全局进度条 / 队列
- NL 评测集（句式 → intent → 上架成功率）

---

## 差距表（实施后粗估）

| 维度 | 实施前 | 实施后 |
|------|--------|--------|
| Tangbuy 发现 → 上架 | 55% | **75%** |
| 1688 作为找品源 | 15% | **50%**（关键词+图搜 seed，非纯文本搜） |
| 1688 → 入池 → 上架 | 25% | **80%**（产品路径已接） |
| NL 找品（双源） | 5% | **60%** |
| NL 上架 | 0% | **55%**（需先搜索会话） |
| 分源展示价 1×/1.2× | 0% | **90%** |

---

## 运维与风险

1. **`TANGBUY_ADMIN_TOKEN`**：1688 入池仍依赖有效 admin token；失败时控制台 `console.error`，用户见友好文案（`GOODS_SOURCE_NOT_READY_USER_MESSAGE`）。
2. **1688 图搜凭证**：`ALIBABA_1688_*` 未配置时 1688 列为空，仅 Tangbuy。
3. **入池索引延迟**：`pending_resolve` 时上架提示「入库中」，非硬失败。
4. **定价两套口径**：发现展示价（1×/1.2×）≠ 店铺定价模板；UI 脚注已区分。

---

## 建议验证清单

- [ ] 发现 Tab：关键词搜索 → 同时出现 Tangbuy + 1688 卡片（有 seed 图时）
- [ ] 卡片展示价：同采购价下 1688 比 Tangbuy 高约 20%
- [ ] 1688 卡片点上架 → 入池 → 轮询 goodsId → Shopify 上架成功
- [ ] Agent：「找手机壳」→ 切发现 Tab 并搜索
- [ ] Agent：「上架第 1 个」→ 确认卡 → 上架
- [ ] Token 过期时：控制台有诊断日志，用户无技术错误串

---

## 自动化回归（2026-07-23 测试轮）

```bash
npm run test:sourcing
```

覆盖：

- **15 条** NL 规则（中/英/西/法：找品、上架序号、预算、来源筛选、与店铺筛选不冲突）
- **展示价** 1× / 1.2× 数值断言

### 测试中发现并已修复

| 问题 | 修复 |
|------|------|
| 「找红色连衣裙」无空格无法匹配 | 中文搜索改为 `\s*` |
| 「1688 上便宜的手机壳」无动词 | 增加 implicit 1688 句式 |
| 「发布第二个」序号解析失败 | 中文序数 + 多语言 ordinals |
| 1688 卡片标题链到 tangbuyUrl | 分源外链 + `openOn1688` |
| 旧 saved search 缺 `sourceFilter` | `normalizeCatalogFilters` |
| 上架确认卡预览行格式乱 | 结构化 preview sections |
| 确认卡价格硬编码 USD | plan 阶段快照汇率 |
| 右侧示例 chip 无发现命令 | catalog Tab 下展示「找…」「上架第 2 个」 |

### 浏览器抽检（未授权店铺）

- 右侧 AI 助手结构未破坏：定价/翻译快捷钮、短命令输入、示例 chip、上下文摘要均正常
- 完整发现 Tab / 双源卡片需 **已授权店铺** + mall token 后手测

---

## TL;DR

**P0** 打通 Tangbuy+1688 合流与 `publishSourcingHit`；**P1** 扩展 NL 命令并 LLM-first；**P2** 顾问收敛为解释层；**P3** 基础 UI 标注 + 本总结。North Star 主链路 **已可演示**；图搜 seed 依赖与视觉规格深度对齐为下一批迭代。
