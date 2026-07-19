# 电商平台精细化对接子 Skill - 订单与履约中心

此子 Skill 专注于平台对接时的**订单同步、发货履约与防冲突处理**。必须严格遵守并发锁、AOP 事务机制以及模型强隔离策略。

// turbo-all

开发时，请将模板中的 `{Platform}` 或 `Amazon` 替换为**实际对接的电商平台名称**。

---

## 阶段一：通信组件与数据转换 (API Components & Adapters)

### 1. 拆分领域通信组件 (极度解耦)
**目标文件**：
- 订单请求：`service/order/external/component/{Platform}OrderComponent.java`
- 发货请求：`service/fulfillment/{Platform}FulfillmentComponent.java`
- 职责与规范：单一职责，只负责向第三方平台发起 HTTP/GraphQL 请求。
```java
package com.tang.plugin.service.order.external.component;

import org.springframework.stereotype.Component;
import java.util.List;

@Component
public class {Platform}OrderComponent {
    public List<Object> fetchOrders(String shopName, Long startTime, Long endTime) { 
        // 发送纯 HTTP 请求获取外部原始对象 
        return null;
    }
}
```

### 2. 订单域适配器 (强隔离)
**文件**：`service/order/external/adapter/{Platform}ExternalOrderAdapter.java`
- 职责：第三方订单 JSON 到内部 `ExternalOrder` 的纯粹转换，斩断外部模型对内部代码的污染。
```java
package com.tang.plugin.service.order.external.adapter;

import com.tang.plugin.domain.entity.order.ExternalOrder;
import org.springframework.stereotype.Component;

@Component
public class {Platform}ExternalOrderAdapter {
    public ExternalOrder convertToExternalOrder(Object platformOrder) {
        ExternalOrder externalOrder = new ExternalOrder();
        // 映射逻辑...
        return externalOrder;
    }
}
```

---

## 阶段二：核心业务策略层 (Strategies - 高内聚)

### 3. 订单同步策略 (严苛的并发锁与事务)
**文件**：`service/order/external/strategy/impl/{Platform}OrderStrategyImpl.java`
- 模板规范：
```java
package com.tang.plugin.service.order.external.strategy.impl;

import com.tang.common.core.exception.CustomException;
import com.tang.plugin.component.RedisManager;
import com.tang.plugin.config.TxManger;
import com.tang.plugin.domain.bo.PluginShopBO;
import com.tang.plugin.domain.dto.order.ExternalOrderSyncDTO;
import com.tang.plugin.domain.entity.order.ExternalOrder;
import com.tang.plugin.enums.PluginType;
import com.tang.plugin.service.order.TOrderOuterService;
import com.tang.plugin.service.order.external.adapter.{Platform}ExternalOrderAdapter;
import com.tang.plugin.service.order.external.component.{Platform}OrderComponent;
import com.tang.plugin.service.order.external.strategy.BaseExternalOrderStrategy;
import com.tang.plugin.service.order.external.strategy.ExternalOrderStrategy;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.collections4.CollectionUtils;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@Slf4j
public class {Platform}OrderStrategyImpl extends BaseExternalOrderStrategy<ExternalOrder> implements ExternalOrderStrategy<ExternalOrder> {
    @Resource private {Platform}OrderComponent orderComponent;
    @Resource private {Platform}ExternalOrderAdapter orderAdapter;
    @Resource private RedisManager redisManager;
    @Resource private TxManger txManger;
    @Resource private TOrderOuterService tOrderOuterService;

    @Override
    public PluginType getPluginType() { return PluginType.{PLATFORM}; }

    @Override
    public Class<ExternalOrder> getOrderClass() { return ExternalOrder.class; }

    @Override
    public void fetchExternalOrderByTimeRange(ExternalOrderSyncDTO syncDTO) {
        PluginShopBO shopBO = syncDTO.getShop();
        if (shopBO == null || shopBO.getShopName() == null) {
            log.error("{Platform} sync failed, shopName is empty");
            return;
        }
        // 调用 orderComponent 抓取
        List<Object> orders = orderComponent.fetchOrders(shopBO.getShopName(), syncDTO.getStartTime(), syncDTO.getEndTime());
        // 逐个转换与入库
        for (Object order : orders) {
            try {
                upsertDraftOrderFromExternal(orderAdapter.convertToExternalOrder(order), shopBO);
            } catch (Exception e) {
                log.error("{Platform} fetchExternalOrderByTimeRange error for shop: {}", shopBO.getShopName(), e);
            }
        }
    }

    @Override
    public Long createDraftOrderFromExternal(ExternalOrder externalOrder, PluginShopBO shopBO) {
        // 1. 分布式锁防护并发
        String lockKey = "{Platform}CreateDraftOrder:" + externalOrder.getOrderId();
        return redisManager.lockAround(lockKey, () -> {
            // 2. 防重复校验
            List<Long> orderIds = tOrderOuterService.listOrderIdsByChannelOuterShopNameAndOuterOrderId(
                shopBO.getShopType().name(), shopBO.getShopName(), externalOrder.getOrderId()
            );
            if (CollectionUtils.isNotEmpty(orderIds)) { throw new CustomException("{Platform} order exists"); }
            
            // 3. 父类在事务内创建
            return createDraftOrder(externalOrder, shopBO, null);
        });
    }
}
```

### 4. 发货履约服务 (Fulfillment Service)
**文件**：`service/fulfillment/impl/{Platform}FulfillmentServiceImpl.java`
- 职责：独立处理发货逻辑，不与 OrderStrategy 糅杂。

---

## 阶段三：事件与调度层 (Events & Tasks - 防雪崩)

### 5. 并发隔离的轮询兜底任务 (Polling Task)
**文件**：`task/{Platform}OrderPollingTask.java`
- 模板规范：
```java
package com.tang.plugin.task;

import com.tang.plugin.domain.bo.PluginShopBO;
import com.tang.plugin.domain.dto.order.ExternalOrderSyncDTO;
import com.tang.plugin.domain.entity.user.UserAuthShop;
import com.tang.plugin.enums.PluginType;
import com.tang.plugin.service.order.ExternalOrderSyncService;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import tech.powerjob.worker.core.processor.ProcessResult;
import tech.powerjob.worker.core.processor.TaskContext;
import tech.powerjob.worker.core.processor.sdk.BasicProcessor;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Component
public class {Platform}OrderPollingTask implements BasicProcessor {
    @Resource private ExternalOrderSyncService externalOrderSyncService;
    @Resource private ThreadPoolExecutor shopOrderSyncExecutor;

    @Override
    public ProcessResult process(TaskContext context) throws Exception {
        List<UserAuthShop> shopList = listAllEnabledShop();
        Set<String> shopNameSet = new HashSet<>();
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failCount = new AtomicInteger(0);

        List<CompletableFuture<Void>> futures = shopList.stream()
            .filter(shop -> shopNameSet.add(shop.getShopName())) // 严格去重防护
            .map(shop -> CompletableFuture.runAsync(() -> {
                try {
                    ExternalOrderSyncDTO dto = new ExternalOrderSyncDTO();
                    dto.setShop(new PluginShopBO().setShopName(shop.getShopName()).setShopType(PluginType.{PLATFORM}));
                    dto.setType(2);
                    dto.setEndTime(Instant.now().toEpochMilli());
                    dto.setStartTime(Instant.now().minus(60, ChronoUnit.MINUTES).toEpochMilli());
                    
                    externalOrderSyncService.fetchExternalOrderByTimeRange(dto);
                    successCount.incrementAndGet();
                } catch (Exception e) {
                    failCount.incrementAndGet();
                    log.error("{Platform} Polling Error for shop[{}]: {}", shop.getShopName(), e.getMessage(), e); 
                }
            }, shopOrderSyncExecutor)).toList();

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        return new ProcessResult(failCount.get() == 0, String.format("{Platform} 同步完成, 成功:%d 失败:%d", successCount.get(), failCount.get()));
    }
    
    private List<UserAuthShop> listAllEnabledShop() {
        // ...执行 DB 提取该平台的激活状态店铺...
        return null;
    }
}
```

---

## 阶段四：底层模型防撞与高级防线

### 6. 订单域防冲突与锁机制 (Order Anti-Collision)
**规范要求**：
1. **全局唯一主键**：接收到第三方的原始订单 ID、订单行 ID、退款单 ID 后，**绝对禁止直接存入 DB**，必须强制经过 `OuterUniqueComponent`（底层调用 `OuterOrderUniqueUtils`）生成系统全局唯一键。
   ```java
   @Resource private OuterUniqueComponent outerUniqueComponent;
   // 例如：转译订单行 ID
   String safeLineId = outerUniqueComponent.generate{Platform}OrderLineUnique(shopName, externalLineId);
   ```
2. **并发锁机制**：在执行 `updateDraftOrderFromExternal` (外部订单状态更新入库) 时，必须包装在分布式锁内：
   ```java
   String key = String.format(OrderBizUtils.OPERATION_ORDER_LOCK_KEY, externalOrder.getOrderId());
   redisManager.lockAround(key, 1000, 5000, () -> { ... });
   ```

### 7. 地址模型 ID 强制转译 (Address Region Resolution)
**规范要求**：
绝对不允许直接将外网发来的英文字母缩写（如 `US`，州代码）原封不动存入系统，否则会导致发货物流与运费模板算力瘫痪。
- **强制要求**：接收到国家与省市数据后，必须调用 `remoteResourceSdkClient.getDataRegionByCountryCode(countryCode)` 换取内部系统的 `countryId`，确保系统内拥有唯一的地理认知。

### 8. 无效状态前置拦截 (Order State Validation)
**规范要求**：
防止垃圾订单堆积，保护 DB 的极致纯洁性。
- **强制要求**：在 `createDraftOrderFromExternal` 方法的入口，必须写死一套状态拦截表！如果解析出的外部状态等同于 `PENDING` (待处理/未完成支付)、`VOIDED` (已作废)、`REFUNDED` (全额退款)，必须通过抛出 `CustomException` 强制拦截并跳过订单生成。

---

## 阶段五：架构设计模式

### 9. 策略与工厂模式 (Strategy & Factory Pattern)
- **设计原理**：系统内存在 `ExternalOrderStrategyFactory` 调度中心。Spring 启动时会自动收集所有的 `List<ExternalOrderStrategy<?>>` 注入其中。
- **强制开发红线**：
  - 接入新平台时，你写的 OrderStrategy **必须且只能** `extends BaseExternalOrderStrategy<ExternalOrder>` 并且 `implements ExternalOrderStrategy<ExternalOrder>`。
  - 必须重写 `getPluginType()` 并返回对应的平台枚举。
  - **绝对禁止**在系统里手写任何 `if (shopType == xxx)` 这种硬编码网关判断，必须把路由控制权完全交给 Factory。
