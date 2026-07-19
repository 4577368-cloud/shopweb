# 电商平台精细化对接 Skill

这个 Skill 用于在 `tang-plugin` 项目中极速对接新的第三方电商平台。
本工作流**深度解剖并严格遵循了线上真实运行的 Shopify/WooCommerce 的超细粒度架构**。它通过严格的组件(Component)拆分、适配器(Adapter)隔离和事件(Handler)独立，保障生成的代码满足**极致的高内聚、低耦合**企业级要求。

由于平台对接工程庞大，本 Skill 已经重构为以下四个专注的子 Skill。**请根据当前开发阶段，查阅对应的子 Skill 工作流：**

- 🔗 **[认证与生命周期挂载 (Auth & Lifecycle)](file:///Users/pengjun/Desktop/tangBuy/skills/platform-integration/auth-integration.md)**: 负责处理 OAuth 授权、令牌管理以及全局 Webhook 与履约服务的初始注册挂载。
- 🔗 **[订单与履约中心 (Orders & Fulfillment)](file:///Users/pengjun/Desktop/tangBuy/skills/platform-integration/order-integration.md)**: 负责处理订单拉取同步、发货动作、并发锁防冲突以及发货状态处理。
- 🔗 **[商品同步与发布 (Products & Sync)](file:///Users/pengjun/Desktop/tangBuy/skills/platform-integration/product-integration.md)**: 负责处理商品拉取、变体最值极限计算、单位换算、价格汇率转换及商品刊登。
- 🔗 **[Webhook 与事件网关 (Webhooks & Events)](file:///Users/pengjun/Desktop/tangBuy/skills/platform-integration/webhook-integration.md)**: 负责处理第三方回调验签、AOP 挂载容错、并发乱序兜底及残片数据回源。

---

## 核心架构铁律 (AI 必须遵守)

在生成任何对接代码前，必须确保完全遵守以下架构与代码结构规范：
1. **严格的导入规范**：生成的代码必须保证 `import` 包名绝对正确（如 Redisson 的 `RLock`，Guava 的 `RateLimiter`，PowerJob 的 `TaskContext`），不允许随意捏造。
2. **严禁依赖注入错用**：必须统一使用 `@Resource` 进行 Bean 注入，绝对禁止使用 `@Autowired`。
3. **日志输出规范**：必须在类头使用 `@Slf4j`，并且 `log.info` / `log.error` 必须打印关联的 `shopName` 与 `orderId`，不允许吞噬异常。
4. **网络通信剥离**：绝对禁止在业务 Strategy 中写 HTTP 逻辑，必须交由专用领域的 `Component` (如 `OrderComponent`) 负责。
5. **外部模型隔离**：必须通过专用的 `Adapter` 将第三方原生 JSON 转换为内部的 `ExternalOrder` 等标准实体，严禁泄漏外部模型。
6. **防并发与事务完整**：写库前必须按订单使用 `redisManager.lockAround`；跨表写入必须包裹在 `txManger.run` 内部。
7. **防雪崩定时轮询**：`PollingTask` 必须通过 `shopNameSet` 隔离去重，强制使用专用线程池 `@Resource private ThreadPoolExecutor shopOrderSyncExecutor`，单个店铺的拉取必须加 `try-catch` 防止整个任务挂掉。

---

## 编码风格与项目硬性规范 (Code Style & Project Conventions)

这部分规范确保 AI 或人类开发者生成的代码**百分百匹配现有的 `tang-plugin` 项目代码气味**，做到“形神具备”：

### 1. 工具包导包红线 (Strict Utility Imports)
- **JSON 序列化**：强制只使用 `com.alibaba.fastjson2.JSON` 和 `JSONObject`，绝对禁止使用或混入 Jackson / Gson。
- **字符串与集合判空**：字符串判空**强制使用** `org.apache.commons.lang3.StringUtils`；集合判空**强制使用** `org.apache.commons.collections4.CollectionUtils`（或 cn.hutool.core.collection.CollectionUtil）。
- **时间类型约束**：全面抛弃陈旧的 `java.util.Date`，时间戳或范围推算统一使用 Java 8 原生的 `java.time.Instant` 和 `java.time.temporal.ChronoUnit`。

### 2. 异常处理与日志打印规范 (Exceptions & Logging)
- **反“吃异常”**：在业务逻辑中，严禁存在空的 `catch (Exception e) {}`，也严禁直接写 `e.printStackTrace()`。
- **自定义异常阻断**：任何第三方调用失败或校验不通过时，必须抛出项目原生的 `com.tang.common.core.exception.CustomException("xxx")`。
- **日志标准**：通过 `@Slf4j` 记录错误时，必须在文案中留下关键店铺名或单号占位符，并将异常对象抛到最后。例如：`log.error("Sync product failed for shop: {}", shopName, e);`

### 3. 数据库更新与软删除哲学 (DB Update & Soft Deletion)
- **无损增量更新**：如果业务只需改变订单状态，**严禁使用 Select 查出大对象再 UpdateById** 的耗性能写法，必须采用无损的新对象承载更新：`draftOrderService.updateById(new TDraftOrderDO().setId(orderId).setStatus(xxx))`。
- **严防物理删除**：电商数据即资产。无论在任何业务场景（包含 Webhook 删除商品推送），**绝对禁止执行物理删除指令（如 `deleteById`）**，所有的删除必须收束为逻辑软删除：`entity.setDelFlag(1)`。

### 4. 极窄事务边界 (Strict Transaction Boundaries)
- **摒弃臃肿大事务**：严禁为了图省事，在 Controller 入口或者庞大业务流的顶部挂上 `@Transactional`。
- **微切面包裹**：写库关联操作，必须剥离网络 IO，随后包裹在原生的编程式事务模板内。在 `tang-plugin` 中，请强制使用 `txManger.run(() -> { ... })` 或者在 Webhook 里使用 `autoSwitchTransactionTemplate.execute(status -> { ... return true; })`，将数据库锁霸占的时间缩到毫秒级。
