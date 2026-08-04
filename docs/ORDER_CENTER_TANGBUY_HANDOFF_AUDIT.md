# 订单中心 × Tangbuy 接入 · 专业审计与开发交接

**日期**：2026-08-04（修订：当晚加厚一轮）  
**分支**：`guifeng`（尚未作为生产 `main` 验收闭环）  
**性质**：现状审计 + 调通缺口 + 分工交接。**只写已核实事实；未联调通过的不写成已完成。**

---

## 0. 一句话结论

当前处于 **「Source 侧编排层已加厚可联调；主站 Feign 路径/鉴权/契约未钉死、仓配未真正拉取、支付未真闭环」** 阶段。

相对首版交接文档，本轮**已补齐**（仍属本地/骨架，非联调绿通）：

| 加厚项 | 结果 |
|--------|------|
| uniOrder 请求体字段对齐参考仓 | `storeName`/`storeUrl`/`sellerName`/`userId`、行属性、**同一** `packageBzNo`、`packageAmountPre` 可走 FE 报价 |
| lineId 同源 | 优先物流页 acceptances 的 `recommendedLine.lineCode`；失败再回退 mall 模板 |
| `goodsStatus` 落库 | 独立列 `t_draft_order.goods_status`（启动/读写前 `ADD COLUMN IF NOT EXISTS`）；**不再写 `content`** |
| stub 防误用 | order/pay stub 打 `[STUB-NOT-PRODUCTION]` **WARN** 日志 |

仍未完成：

- 对 Tangbuy 主站 **真下单、真支付、真仓配回写**：**默认 remote=false**；开启后 path 仍属镜像猜测，**未经联调验收**
- 验收口径三条 **均未在联调环境打通**

---

## 1. 仓库与提交锚点（给审计对齐代码）

| 仓 | GitLab | 说明 |
|----|--------|------|
| FE Source | `gitlab.tangbuy.cn/guifeng/60s-Sourcing`（及 gitlab-cc） | 订单中心 + 本轮 lineId 同源 / audit 文档 |
| BE Plugin | `gitlab.tangbuy.cc/guifeng/tang-source-plugin` | Feign + 本轮 uniOrder 加厚 / goods_status |
| 参考仓（只读） | `tangbuy/backend/common/tang-plugin` | 老插件完整 uniOrder / Pay / payCb |

请以推送后 `guifeng` 最新 commit 为准（首轮：FE `c1460f7`/`d6782d4`，BE `64f4342`/`d362c9c`；加厚轮：见后续 push 说明）。

**注意**：

- BE `src/main/resources/**` **禁止提交**；远程开关靠部署环境变量。
- GitHub `origin` 对 BE 可能因历史 yml 密钥拒推；**以 GitLab `tang-source-plugin` 为准。**
- 生产是否已部署本分支：**未验证**。

### 建议阅读

| 文档 | 用途 |
|------|------|
| `docs/ORDER_CENTER_TANGBUY_SYNC.md` | 仓配 `goodsStatus` / 分区语义 |
| `docs/ORDER_CENTER_DROPSHIP_PURCHASE_SPEC.md` | 代发下单规格 |
| `docs/ORDER_CENTER_PROCUREMENT_LINE_CONTRACT.md` | 采购行快照契约 |
| **本文件** | 现状 / 缺口 / 分工 |

---

## 2. 目标架构（产品定死的边界）

```
Shopify 订单 → tang-source-plugin（draft 域）
                 ├─ uniOrder → tang-order（真 TO/TI + tradeNo）
                 ├─ tradeNo → tang-pay（channelList / payment/order）
                 ├─ payCb → draft 状态推进
                 └─ 仓配 goodsStatus（定时/MQ）→ draft 细相位
订单中心 UI ← 列表 VO 映射后的 Tab（不自建第二套账本）
```

**明确不做**：Source 自建采购状态机；用 `/billing/*` 冒充采购已付；50+ 仓状态做成 50 个 Tab。

**架构事实（对照参考仓已核实）**：

- 远程 `uniOrder` body **不嵌套**完整 `packageCreateInfo`；主站侧主要吃 `packageAmountPre` + `packageBzNo` + orders/items。
- `lineId` / declare / tax：留在 **purchase 请求 + 本地 `t_draft_order_package`**；经运费估价进入 `packageAmountPre`（参考仓）。本仓当前用 FE acceptance `estimatedFee` 作为 hint，**尚未接主站估价 API**。

---

## 3. 目前真实达到的阶段

### 主干 A · 订单状态真相 — **半真实 / 映射+落库就绪**

| 项 | 状态 | 说明 |
|----|------|------|
| 列表 `draftStatus` / `orderStatus` / `tradeNo` / `tangbuyOrderNo` / `exceptionTag` / `goodsStatus` | ✅ | VO + FE Tab 信 API |
| `DraftOrderItemEnum` → Tab 映射 | ✅ | `OrderStatusMapper` |
| `goodsStatus` 细相位 + exceptionTag | ✅ 映射 | 写独立列 `goods_status` |
| 定时/MQ 真拉 `listOrderDetail` | ❌ | 仅 heartbeat + `applyGoodsStatus` 入口 |
| MQ Listener 是否挂上 | ⚠️ | 进程内 handler 有；生产 Listener 未本轮核实 |
| 支付成功只改前端 | ✅ 已改 | 改刷新列表；payCb 未通则仍看不到 preparing |

### 主干 B · 下单 — **门禁+请求体加厚；默认 stub**

| 项 | 状态 | 说明 |
|----|------|------|
| 绑定回写 / 地址门禁 | ✅ | |
| declare/tax → packageChoosedContent | ✅ FE | 本地 package 落库；远程 body 不嵌套（与参考一致） |
| lineId | ✅ 加厚 | **acceptances 优先** → mall 模板回退；无则诚实失败 |
| uniOrder 字段名 | ✅ 加厚 | `storeName`/`storeUrl`/`sellerName`/`userId`/`userName`、行 attrs |
| `packageBzNo` 一致 | ✅ 加厚 | 远程 body 与本地 package 行共用同一 bzNo |
| `packageAmountPre` | ⚠️ | 可吃 FE `packageAmountPre`（acceptance fee）；否则仍 0；**非主站估价** |
| remote 默认 | stub | `PAY*` + `[STUB-NOT-PRODUCTION]` WARN |
| Feign path | ⚠️ | `/remote/order/uniOrder` 或 `/uniOrder` — **未钉死** |

### 主干 C · 支付 — **BFF 外壳；默认 stub**

| 项 | 状态 | 说明 |
|----|------|------|
| channelList / payment/order BFF | ✅ | |
| PaymentModal 走 tradeNo | ✅ | 不走 billing |
| stub | WARN | `[STUB-NOT-PRODUCTION]` |
| payCb | ⚠️ lite | 无验签 |
| 合单支付 | ❌ | |
| 端到端真付 | ❌ 未验收 | |

---

## 4. 环境开关

```text
TANG_PLUGIN_REMOTE_ORDER_ENABLED=true
TANG_PLUGIN_REMOTE_ORDER_URL=<需主站确认>
TANG_PLUGIN_REMOTE_PAY_ENABLED=true
TANG_PLUGIN_REMOTE_PAY_URL=<需主站确认>
```

另需确认（**未核实**）：Feign Header/鉴权、payCb 公网登记、联调样本单（已付+已绑+地址+物流已确认线路）。

---

## 5. 调通所欠缺（更新后）

### P0 · 仍阻塞三大验收

1. **契约会钉死** uniOrder / channelList / payment/order / payCb 的 path、鉴权、DTO、验签  
2. **remote=true 沙箱一单** → 主站真 tradeNo（非 `PAY*`）  
3. **真付一笔** → payCb → draft 离开待支付  
4. （可选加速）主站运费估价接入，替换 FE fee hint / 0

### P1 · 仓配真相

5. 实现 `listOrderDetail`（或多桶）拉取 → `applyGoodsStatus`  
6. 确认 RocketMQ Listener 挂载（若生产依赖 MQ）

### P2

7. payCb 验签 / 合单支付 / 生产 stub 误开告警（日志已有 WARN，可再加 metric）  
8. 样本单清单固化给联调

### 本轮已从缺口移除

- ~~uniOrder body 字段名明显偏离参考仓~~（已对齐主要字段）  
- ~~lineId 只靠 mall 猜~~（已 acceptances 同源）  
- ~~goodsStatus 占用 content~~（已独立列）  
- ~~stub 仅 info 日志~~（已 WARN 醒目标记）

---

## 6. 分工交接

### 6.1 增强 · 订单

**范围**：主干 A + B → 真 tradeNo / 仓配回写

| 工作项 | 验收 |
|--------|------|
| 对齐 Feign path + 鉴权 | 沙箱返回主站 tradeNo |
| 核对加厚后的 body 是否被主站接受 | 主站可见 TO/TI；必要时按契约微调字段 |
| 绑定/地址/lineId 门禁回归 | 物流页确认线路后订单中心可下单 |
| 仓配拉取 | 刷新可见 preparing→…→delivered |
| 运费（可后） | 主站估价进 `packageAmountPre` |

**入口**：`RemoteOrderSdkClient`、`InnerOrderSyncManagerImpl`、`DraftOrderManagerImpl`、`DraftOrderBindingSyncService`、`OrderStatusMapper`、`ProcurementStatusSyncService`、`DraftOrderSchemaSupport`、`OrderHeaderQueryService`；FE：`build-package-create-info.ts`、`dropship-purchase.ts`、`handlePlace`

**先问主站**：uniOrder URL/Header？响应 tradeNo/orderNo/orderNoMap？仓配权威接口？

### 6.2 彭军 · 支付

**范围**：主干 C（有 tradeNo 之后）

| 工作项 | 验收 |
|--------|------|
| 对齐 channelList / payment/order | 真通道非 stub |
| payCb 验签+幂等+回调可达 | draft → PROCESSING；UI 进备货 |
| 与 billing 边界 | 采购不走 `/billing/consume/balance` |

**入口**：`PayController`、`RemotePaySdkClient`、`PayCallbackController`；FE：`tang-pay.ts`、`payment-modal.tsx`；参考仓 Pay*

**先问主站**：path/包装类型？payment body？payCb 验签与回调 URL？

### 6.3 边界

| 现象 | Owner |
|------|--------|
| stub `PAY*` | 增强（order remote） |
| 有 tradeNo 付不动 | 彭军 |
| 付了 Tab 不变 | 先 payCb（彭军）→ 再仓配细相位（增强） |
| lineId / 地址下不了单 | 增强（协同物流确认线路） |

---

## 7. 建议联调顺序

1. 契约会（增强+彭军+主站 order/pay）  
2. 增强：remote order → 真 tradeNo（先在物流页确认线路）  
3. 彭军：真付 → payCb  
4. 增强：仓配回写至少一相位  
5. 共同：§8 三条打勾 → 再谈 `main` / 生产开关

---

## 8. 产品验收口径（未打勾不得宣称「已接入」）

1. **状态**：已付 Shopify → 待下单；付采购后随主站进备货/发货/在途/签收，刷新可见、不靠 mock  
2. **下单**：绑定+地址+线路+模板齐 → 真 tradeNo → 待支付可开弹窗  
3. **支付**：老系统通道付完 → payCb → 离开待支付进备货  

---

## 9. 自测清单（更新）

### 增强

- [ ] remote=false → `PAY*` + 日志含 `[STUB-NOT-PRODUCTION]`  
- [ ] 物流页确认线路后，下单 packageCreateInfo.lineId = acceptance.lineCode  
- [ ] 无 acceptance 且无 mall lane → 诚实失败，不进假 pendingPayment  
- [ ] `applyGoodsStatus` 后 DB `goods_status` 有值；`content` 不再被写成状态码  
- [ ] list header 带 `goodsStatus` / `exceptionTag`（有映射时）

### 彭军

- [ ] remote pay=false → stub 通道 + `[STUB-NOT-PRODUCTION]`  
- [ ] 无 tradeNo 禁止支付弹窗  
- [ ] 测试环境手动 payCb 可推 draft（验签补齐前仅测试）  

---

## 10. 口径边界

| 可以说 | 不可以说 |
|--------|----------|
| 编排层已按参考仓加厚，可进入联调 | 已接好 Tangbuy 下单/支付/仓配 |
| 默认 stub，日志已醒目标记 | 待支付 tradeNo 都是主站真单 |
| Feign/DTO 已尽量对齐参考；path 待钉 | Feign 已与生产一致 |
| payCb 有 lite 实现 | 支付回调已按主站验签完成 |

---

**维护**：联调每通一项，更新 §3/§5/§8；禁止口头升级状态。
