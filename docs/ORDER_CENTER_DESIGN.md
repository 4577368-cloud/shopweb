# 订单中心 · 产品设计 + 架构 + UI 样式规划（筹备稿 v1）

> 状态：**设计冻结 / 筹备阶段**，暂不开发。本文档用于对齐产品形态、技术架构与视觉风格。
> 范围：先聚焦「订单中心」；「运营中心」「履约中心」仅做导航与架构占位，详细设计后续展开。
> 约束：结构保持与开店部分一致的三栏（左导航｜中主区｜右 AI）；右侧 AI 复用既有 `AssistantRail` 模式。

---

## 0. 一句话定位

订单中心是从 **Shopify 待支付订单** 出发，关联 **tangbuy 货源** 并驱动 **采购 → 入仓 → 国际运输 → 到货** 全链路的运营中枢。它以「状态机 + 列表/详情」驱动，而非开店的「流程向导」驱动；因此它应当用**与开店解耦的新方式**开发，以便未来同时作为 **Shopify 嵌入式应用** 与 **独立站应用** 并存。

---

## 1. 信息架构：左侧导航的演进

### 1.1 现状（开店流程轨）
当前 `StepSidebar` 由 `useOnboarding` 的 `steps` 驱动，是一段**线性流程轨**：

```
开店流程
  1. 安装授权 (install)
  2. 选品 (products)
  3. SKU 对齐 (sku-align)
  4. 同步 (sync)
[进度条]
```

它强耦合 `useOnboarding` 的「引导进度」，不适合承载持续运营的订单/履约类入口。

### 1.2 目标（两段式中枢导航）
新增「运营中枢」分组，与「开店流程」并列共存，**互不破坏**：

```
开店流程                        运营中枢
  1. 安装授权                     ◆ 订单中心  (active)
  2. 选品                         ◆ 运营中心
  3. SKU 对齐                     ◆ 履约中心
  4. 同步
[进度条]
```

- 开店流程：保留 `StepSidebar` + onboarding 进度（旧模式）。
- 运营中枢：新入口，点击进入各自的「三栏工作区」（新模式）。
- 视觉：新入口带统一「中枢」图标，分组标题用 `nav.hub` 文案。

### 1.3 三个中心的边界
| 中心 | 职责 | 数据主轴 |
|------|------|----------|
| 订单中心 | 订单状态机、采购、物流追踪 | Shopify 订单 + 货源 + 物流 |
| 运营中心 | 指标、利润、库存健康、异常大盘 | 跨订单/货源聚合 |
| 履约中心 | 入仓/出库/集运/清关作业台 | 仓库 + 承运商 |

> 本筹备稿只细化「订单中心」。

---

## 2. 订单中心 · 产品与字段设计

### 2.1 三栏工作区结构
- **左**：订单中心内子导航 / 快捷筛选（全部、异常、待我处理）+ 状态计数。
- **中**：主工作区 = 顶部 **5 个 Tab**（待支付/已采购/已入仓/运输中/已到货）+ 过滤/搜索 + 订单卡片列表（或表格）+ 详情抽屉。
- **右**：AI 助手栏（`AssistantRail` + 订单专属 Copilot/Command）。

### 2.2 订单状态机（8 个状态 Tab + 1 个过滤视图，沿用旧版结构）
```
待下单 ──"重新下单"向货源下单──▶ 待补款(可选) ──补款完──▶ 待支付 ──支付完──▶ 备货中 ──发货──▶ 待发货 ──入仓国际──▶ 待送达 ──签收──▶ 已送达
   │                                                              │              │
   └───取消(任何阶段)──────────────────────────────────────────────────────────────────────▶ 已取消
```
- **线性主轴**：待下单 → (待补款 →) 待支付 → 备货中 → 待发货 → 待送达 → 已送达。
- **旁路**：已取消（任何阶段可取消）。
- **核心入口是「待下单」**：来自 Shopify 已付款订单（`financial_status = paid`），经定期拉取（webhook + cron，`order.id` 幂等）入我们系统，但尚未向货源下单；点击卡片「重新下单」触发向货源下单，进入待补款/待支付。
- 每个 Tab 计数徽标 = 该状态订单数；「全部」是跨状态过滤视图（横在 Tab 行右侧）。

### 2.3 八个 Tab 字段矩阵（8 状态 Tab + 全部过滤视图）

> **Tab 结构**：待下单 / 待补款 / 待支付 / 备货中 / 待发货 / 待送达 / 已送达 / 已取消（8 个状态 Tab）+ 「全部」过滤视图（横在 Tab 行右侧）。
> **通用常驻字段**：**店铺订单号**（Shopify `order_number` / `id`，列表最核心标识）+ Tangbuy 订单号 + 创建时间 + 当前状态徽标。
> 点击「查看订单详情」**直接跳 Shopify Admin 订单详情**（详见 §2.4），**不在我们端渲染收件人详情**。

#### Tab 1 · 待下单（核心入口，基于 Shopify 拉取）
**来源**：Shopify 订单（`financial_status = paid`，已付款未向货源下单）。定期拉取：webhook 主通道 + cron 轮询兜底 + `order.id` 幂等。

**卡片字段**：
| 字段 | 说明 |
|------|------|
| **店铺订单号** | Shopify `order_number` / `id` ← **核心标识**，列表常驻 |
| Tangbuy 订单号 | 我们系统内部单号 |
| 创建时间 | Shopify `created_at` |
| 收货地址 · 国家 | **仅显示国家**（如「美国」）；不展示详细收件人（隐私 + 简洁） |
| **查看订单详情** | 跳 Shopify Admin 订单详情（详见 §2.4） |
| 状态徽标 | 待下单 |
| 商品明细 | `line_items[]`：商品图 + 标题 + SKU + 数量 |
| 供应商订单号 | 已绑定货源的 supplier order no |
| 商品成本 | 单价 × 数量 |
| 预估物流方式 | 按目的地国 + 预设规则派生（如 GD-EMS） |
| 预估物流时效 | 1-2日 等 |
| 预估运费 | 复用已配置的物流模板（LogisticsTemplate）策略 + 商品重量/体积，经现有 estimate 网关算价（已估过直接取 quote 缓存）；无模板/无重量标「待核价」 |
| 更多物流信息 | 链接 |
| 给 Tangbuy 的备注 | — |
| **成本汇总** | 商品成本总计 / 物流成本总计 / 成本总计 |
| **「重新下单」按钮** | 触发向货源下单 → 进入「待补款 / 待支付」 |

**关键派生（拉取时即时计算，全部复用既有共享数据，订单中心不重建）**：
- 收件人 `country_code` → 物流线路（美向/欧向等）+ 模板价（无匹配标「待核价」）。
- `line_items[].sku` → sku-align binding → tangbuy offer（反查货源报价）。
- **物流模板**：直接调 `api.getLogisticsTemplate(shopName)` 取已配置的 `LogisticsTemplate`（markets/speed/packaging），**订单中心不新建配置界面**（开店/物流阶段已配置，按 shop 共享）。
- **商品重量/体积**：经 `sku-align binding → tangbuy offer → variant-measures` 取 `weightG/volumeCm3`，已在物流页解析并按 shop 维度缓存，属物理属性共享。
- **算价**：`country_code + 模板 packaging/speed + 商品 weight/volume` 喂给现有 `estimate-gateway`（`/gateway/plugin/logistic/estimateSkuSaleFeePrice`）；该 SKU 此前在物流页估过价则直接取 `quote-cache`，否则实时询价。

#### Tab 2 · 待补款（Supplier Surcharge）
| 字段 | 说明 |
|------|------|
| 店铺 / Tangbuy 订单号 | 同上 |
| 补款原因 | 重量差异 / 偏远 / 改地址 |
| 补款金额 | 需追加支付 |
| 操作 | 确认补款 / 取消 |

#### Tab 3 · 待支付（向货源付款）
| 字段 | 说明 |
|------|------|
| 店铺 / Tangbuy 订单号 | — |
| 供应商 | offer 来源 |
| 应付金额 | 商品成本 + 物流成本 + 补款 |
| 支付方式 | — |
| 操作 | 标记已支付 |

#### Tab 4 · 备货中（Sourcing）
| 字段 | 说明 |
|------|------|
| 店铺 / Tangbuy 订单号 | — |
| 供应商预计发货时间 | — |
| 操作 | 催促 / 取消 |

#### Tab 5 · 待发货（Source Warehouse → Hub）
货源已发货到五楼集运仓。**物流双轨第 ① 段在此启动**（详见 §2.5）。
| 字段 | 说明 |
|------|------|
| 店铺 / Tangbuy 订单号 | — |
| **五楼单号** | 货运代理 / 集运单号（用户要求） |
| **中国境内物流** | 货源仓 → 五楼集运仓（待揽收 / 已揽收 / 运输中 / 已入仓） |
| 操作 | 查看境内物流、推进入仓 |

#### Tab 6 · 待送达（Hub → Customer）
集运仓已出库，国际运输中。**物流双轨第 ② 段**。
| 字段 | 说明 |
|------|------|
| 店铺 / Tangbuy 订单号 | — |
| 五楼单号 | — |
| 国际物流单号 | 承运商 tracking no |
| 承运商 | 云途 / 燕文 / 4PX 等 |
| **中国境内物流** | 已完成 ✅ |
| **国际物流** | 五楼仓 → 目的国（已出库 / 干线 / 清关 / 末端派送） |
| 预计到达 | ETA |
| 操作 | 查看轨迹、异常处理 |

#### Tab 7 · 已送达（Delivered）
| 字段 | 说明 |
|------|------|
| 店铺 / Tangbuy 订单号 | — |
| 签收时间 / 签收人 | — |
| 物流完成状态 | 已签收 / 异常 |
| 售后 / 退款状态 | — |
| 操作 | 归档 |

#### Tab 8 · 已取消（Cancelled）
旁路状态（任何阶段可取消）。
| 字段 | 说明 |
|------|------|
| 店铺 / Tangbuy 订单号 | — |
| 取消时间 / 原因 | — |
| 退款状态 | — |

#### 「全部」过滤视图
跨状态合计 + 多维筛选（按时间、目的地国、供应商、异常），横在 Tab 行右侧。

### 2.4 点击订单详情 → 跳 Shopify Admin（不在我们端查看收件人）
**用户明确决策**：日常不查看收件人详情，因此**不在我们端渲染**收货人姓名 / 电话 / 详细地址。
- 点击「查看订单详情」→ **直接跳转 Shopify Admin 订单详情**：
  - **嵌入式（Shopify Admin iframe）**：通过 **App Bridge `Redirect.dispatch`** 跳订单详情，保留 Admin shell。
  - **独立站形态**：新窗口打开 `https://{shop}.myshopify.com/admin/orders/{shopify_order_id}`。
- 我们端列表仅显示「收货地址 · 国家」（如「美国」），用于物流线路和模板价派生。
- **PII 隔离**：收件人详情只在 Shopify 端存留与展示，我们不持久化。

### 2.5 物流双轨监控（关键能力）
| 轨道 | 段 | 状态枚举 | 数据来源 | 启动 Tab |
|------|----|----------|----------|----------|
| 中国境内物流 | 货源仓 → 五楼集运仓 | 待揽收 / 已揽收 / 运输中 / 已入仓 | 五楼/集运商 API（**需新增后端集成**） | **待发货** |
| 国际物流 | 五楼仓 → 目的国客户 | 已出库 / 干线运输 / 清关 / 末端派送 / 已签收 | 承运商 API（**需新增后端集成**） | **待送达** |

- 前端以**双迷你进度条**呈现（国内段 + 国际段），异常态用 warning/danger 色。
- 订单卡片与详情抽屉均展示双轨；AI 可针对「停滞超 N 天」「清关异常」做预警。

### 2.6 右侧 AI 面板职责（订单中心）
复用已验证的 `command-schema / plan-command` 模式（sku 已落地）：
- 订单健康概览、异常预警（物流停滞 / 付款超时 / 清关卡住 / 备货超时）。
- 自然语言操作：`把订单 #1024 标记已发货并回填五楼单号 WL2026xxx` / `把 #1303 重新下单`。
- 批量指令：`把待送达超过 10 天未更新的订单列出来` / `把待下单里目的地美国且无模板价的挑出来`。
- 承接 sku 已建的澄清循环 + 指令组合 + 序列执行能力。

---

## 3. 架构方案：嵌入式 + 独立站 双形态

### 3.1 问题陈述
- 开店部分强耦合 `useOnboarding` / `StepSidebar` / 引导进度，无法直接作为独立站。
- 订单中心是持续运营中枢，应可：① 嵌入 Shopify Admin（iframe + App Bridge）；② 独立部署为站点。
- 用户要求：新部分用**不同于开店的新方式**，二者解耦。

### 3.2 推荐方案：Feature-Package + Host-Shell（应用内分包）
在现有 Next.js 单仓内，把订单中心抽为**独立功能包**，不直接依赖 `useOnboarding`：

```
┌─ Host A：嵌入式（现有 Next.js 的 /[locale]/order-center/*）
│     WorkbenchShell + 中枢导航 + App Bridge（Shopify session token）
│
├─ Host B：独立站（同包独立部署 / 同 Next 另一组路由，关闭 App Bridge）
│
└─ 共享层
      @tangbuy/hub-order   订单中心功能包（React + 自有数据层）
      @tangbuy/ui          共享 UI 原语（Button/Card/Table/AssistantRail 抽象）
      @tangbuy/data        数据客户端（封装 /api/plugin + 鉴权适配层）
            │
            ▼
      tangbuy-plugin (Java)  ← /api/plugin 代理（next.config.ts rewrites）
```

- **依赖隔离**：功能包只依赖 `@tangbuy/ui` + `@tangbuy/data`，通过「宿主适配层」获取 auth/token，而非直接读 `useOnboarding`。
- **数据层**：沿用 `next.config.ts` 的 `/api/plugin` 代理，嵌入式与独立站共用同一后端，仅环境变量 `NEXT_PUBLIC_API_BASE` 不同。
- **视觉一致**：复用现有 CSS 变量令牌（`--wb-sidebar-w`、`--wb-rail-w`、`--brand` 等），三栏壳沿用 `WorkspaceLayout`。

### 3.3 为何不用微前端（Module Federation）
- 当前无 MF 基建；发布频率与团队规模不需运行时拆分。
- 包级隔离 + 构建期组合已满足「双形态并存」，且**类型安全、调试简单、构建快**。
- 若未来确需运行时独立部署，再升级为 MF，当前不预支复杂度。

### 3.4 演进路径（不破坏开店）
| 阶段 | 内容 |
|------|------|
| Phase 0（本筹备） | 设计冻结、确定包边界、字段矩阵定稿 |
| Phase 1 | 抽取 `@tangbuy/ui` + `@tangbuy/data` 共享层（从现有 components/lib 整理） |
| Phase 2 | 实现 `@tangbuy/hub-order` + 嵌入式宿主路由（左侧中枢导航接入） |
| Phase 3 | 独立站宿主（同一包，关闭 App Bridge） |
| 并行 | 开店部分继续旧模式，两段式导航共存 |

### 3.5 与开店部分的明确边界
| 维度 | 开店部分 | 订单中心 |
|------|----------|----------|
| 驱动 | 流程向导 / 引导进度 | 数据 / 状态机 |
| 导航 | `StepSidebar` + onboarding | 中枢导航（新） |
| 部署 | 仅嵌入式 | 嵌入式 + 独立站 |
| 耦合 | `useOnboarding` | `@tangbuy/data` 适配层 |

---

## 4. UI 样式规划

### 4.1 设计令牌（沿用现有，保证一致）
- 三栏宽度：`--wb-sidebar-w`（左）、`--wb-rail-w`（右），沿用 `WorkspaceLayout` 的 grid 模板。
- 品牌色：`--brand`（accent）、`--brand-soft`（浅底）。
- 状态色：待支付=灰/蓝、已采购=蓝、已入仓=紫、运输中=橙、已到货=绿。

### 4.2 左侧中枢导航
- 两段分组；新入口带「中枢」图标；当前入口高亮（`bg-brand-soft/80` + ring）。
- 各中心内可含子筛选（异常 / 待我处理）。

### 4.3 主区
- 顶部 Tab 条：5 个 Tab + 计数徽标（异常态用 warning 色）。
- 过滤 / 搜索栏（复用 sku 页 `SegmentedTabs` + 搜索框）。
- 订单卡片（或表格）：状态徽标 + 物流双轨迷你进度条 + 关键字段 + 操作。
- 详情：右侧抽屉（`manual-match-drawer` 同款模式）。

### 4.4 右侧 AI 栏
- 复用 `AssistantRail` + `CopilotCard` + 订单专属 Command 面板（沿用 sku 的 `SkuAgentPanel` 交互范式）。

---

## 5. 待确认 / 开放问题
1. **货源反查（链路已明确）**：待支付订单 → `line_items[].sku` → sku-align binding → tangbuy offer。需后端提供"按一批 SKU 批量反查 offer"的接口（当前 sku-align 为单变体绑定，订单是多 `line_items`，需批量能力）。
2. **五楼/集运商 API**：是否已存在后端集成？当前 `tangbuy-plugin` 未见，需新增（已采购/运输中双轨的核心依赖）。
3. **独立站形态**：是否需要独立域名 / 独立鉴权体系？还是复用 Shopify session？
4. **三中心数据模型**：订单是否贯穿三个中心（订单中心建单 → 履约中心作业 → 运营中心聚合）？建议统一 `OrderId` 为主键。
5. **i18n**：新增 `nav.hub`、`order.*` 键族（en 为 source，fr/es/zh 镜像），沿用既有四语机制。
6. **物流线路 & 模板价预设规则（已拍板·复用共享数据，2026-07-24）**：**不**在订单中心新建物流模板配置界面。数据源全部复用开店/物流阶段已落地的共享资产：① 物流模板 = `LogisticsTemplate`（前端 `api.getLogisticsTemplate` → `/api/plugin/logistics/template`，后端 `LogisticsTemplateService.getEffective(shopName)`，按 shop 唯一）；② 商品重量/体积 = 经 `sku-align binding → tangbuy offer → variant-measures` 解析的 `weightG/volumeCm3`（按 shop 维度的物理属性，已缓存）；③ 算价 = 现有 `estimate-gateway`（`/gateway/plugin/logistic/estimateSkuSaleFeePrice`），已估过的 SKU 直接走 `quote-cache`。无模板/无重量回退标「待核价」。→ Phase 1 mock 的 `deriveLogisticsRoute/deriveTemplatePrice` 仅为占位，真实实现改为消费上述共享链路。
7. **「重新下单」触发的向货源下单接口**：待下单卡片点「重新下单」 → 调用 tangbuy 下单接口生成 supplier order → 进入「待补款 / 待支付」。需确认：① tangbuy 是否已有「按 Shopify 订单下单」接口；② 入参契约（哪些来自 Shopify 订单、哪些由我们补充）。
8. **App Bridge `Redirect.dispatch` 在订单中心的应用**：嵌入式宿主跳 Shopify Admin 订单详情走 App Bridge（保留 Admin shell），独立站走新窗口；需确认 App Bridge 版本与权限 scope（`read_orders` 已够，详情页本身在 Admin 内）。

---

*本稿为筹备设计，待评审后进入 Phase 1（共享层抽取）。开发将严格遵循「逐文件手术式 + git diff 自检 + 绝不 checkout 用户文件」铁律。*
