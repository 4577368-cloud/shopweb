# 电商平台精细化对接子 Skill - Webhook 与事件网关

此子 Skill 专注于平台对接时的**第三方事件订阅、回调处理、幂等容错以及网关路由机制**。必须严格遵循单一职责和防乱序机制。

// turbo-all

开发时，请将模板中的 `{Platform}` 或 `Amazon` 替换为**实际对接的电商平台名称**。

---

## 阶段一：事件网关与调度层

### 1. Webhook 接收控制器
**文件**：`controller/webhook/{Platform}WebhookController.java`
- 职责：暴露给第三方的唯一 HTTP Callback 入口。

### 2. Webhook 路由与验签策略
**文件**：`service/webhook/strategy/impl/{Platform}WebhookStrategy.java`
- 职责：校验 HTTP 签名 (如 HMAC)，根据传入的数据解析出 EventType，并路由给特定的 Handler。

### 3. 单一职责的 Webhook 事件处理器 (Webhook Handlers)
**文件群**：
- `service/webhook/handler/impl/{platform}/{Platform}OrderCreatedHandler.java`
- `service/webhook/handler/impl/{platform}/{Platform}ProductUpdateHandler.java`
- 职责：每个事件建立独立的处理器，保障 OCP (开闭原则)。
- 模板规范：
```java
package com.tang.plugin.service.webhook.handler.impl.{platform};

import com.alibaba.fastjson2.JSONObject;
import com.tang.plugin.domain.bo.PluginShopBO;
import com.tang.plugin.domain.dto.webhook.ProductWebHookDTO;
import com.tang.plugin.enums.PluginType;
import com.tang.plugin.enums.webhook.ProductWebHookEventEnum;
import com.tang.plugin.enums.webhook.{Platform}WebhookEventEnum;
import com.tang.plugin.service.publish.handler.impl.product.{Platform}PublishProductHandler;
import com.tang.plugin.service.webhook.handler.{Platform}WebhookEventHandler;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class {Platform}ProductUpdateHandler implements {Platform}WebhookEventHandler {
    @Resource private {Platform}PublishProductHandler publishProductHandler;
    
    @Override
    public boolean supports({Platform}WebhookEventEnum eventType) {
        return {Platform}WebhookEventEnum.PRODUCT_UPDATE == eventType;
    }
    
    @Override
    public void handle(String payload, PluginShopBO shop) {
        ProductWebHookDTO dto = new ProductWebHookDTO();
        dto.setShopName(shop.getShopName());
        dto.setShopId(shop.getShopId());
        dto.setShopType(PluginType.{PLATFORM});
        dto.setEvent(ProductWebHookEventEnum.{PLATFORM}_PRODUCT_UPDATED);
        dto.setPlatformProductJson(payload);
        
        // 严禁在此直接改库，必须转交业务层以保证全局汇率规则一致
        publishProductHandler.handleWebhook(dto);
    }
}
```

---

## 阶段二：容错与安全机制 (Security & Resilience)

### 4. Webhook 注册防抖与 AOP 代理 (Resilient Webhook Strategy)
**说明**：反向去电商平台注册 Webhook 是网络 I/O 极高风险的操作（尤其在刚授权完的瞬间）。为防止失败必须加入 `@Retryable`，并**强制注入自身**来绕过 Spring 本地方法调用导致 AOP 失效的问题。
**文件**：`service/webhook/strategy/impl/{Platform}WebhookStrategy.java`
- 模板规范：
```java
package com.tang.plugin.service.webhook.strategy.impl;

import com.tang.plugin.domain.dto.WebhookCreateDTO;
import com.tang.plugin.domain.dto.WebhooksCreateDTO;
import com.tang.plugin.domain.entity.user.UserAuthShop;
import com.tang.plugin.enums.PluginType;
import com.tang.plugin.enums.WebhookEvent;
import com.tang.plugin.service.webhook.strategy.WebhookStrategyAdapter;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Component;
import org.apache.commons.collections4.CollectionUtils;

@Component
@Slf4j
public class {Platform}WebhookStrategy extends WebhookStrategyAdapter {

    // 【核心红线】必须注入自身 self，这是确保 @Retryable 生效的唯一解法！
    @Resource
    private {Platform}WebhookStrategy self;

    @Override
    public PluginType getPluginType() { return PluginType.{PLATFORM}; }

    @Override
    public void createWebhook(WebhookCreateDTO webhookCreateDTO) {
        // 调用第三方 HTTP 接口执行实质的 Webhook 注册
        // {Platform}SdkComponent.createWebhook(...)
    }

    // AOP 重试代理方法
    @Retryable(retryFor = {Exception.class}, maxAttempts = 3, backoff = @Backoff(delay = 2000))
    public void createWebhookRetry(WebhookCreateDTO webhookCreateDTO) {
        createWebhook(webhookCreateDTO);
    }

    @Override
    public void createWebhooks(WebhooksCreateDTO webhooksCreateDTO) {
        UserAuthShop userAuthShop = webhooksCreateDTO.getUserAuthShop();
        if (CollectionUtils.isEmpty(webhooksCreateDTO.getWebhookEvents())) return;
        
        for (WebhookEvent event : webhooksCreateDTO.getWebhookEvents()) {
            try {
                // 【强制】必须使用 self.createWebhookRetry，否则 AOP 拦截器链断裂，重试将失效
                self.createWebhookRetry(new WebhookCreateDTO().setWebhookEvent(event).setUserAuthShop(userAuthShop));
                log.info("创建 webhook 成功 topic: {}", event.getTopic());
            } catch (Exception e) {
                log.error("创建 webhook 失败 topic: {}", event.getTopic(), e);
            }
        }
    }
}
```

---

## 阶段三：高级防撞与细节防线

### 5. 残片更新的回源查询 (Webhook Parent-Fetch)
**规范要求**：
某些平台（如 WooCommerce）的 Webhook 仅推送某个子变体（variation）的碎片信息。
- 在 `handleWebhook` 或具体事件 Handler 顶部，必须检查该事件是否属于子层级。
- 若是，则**强制要求带着 Parent ID 重新调用平台 API 获取完整主商品信息**（如 `getMainProductByProductId`），并重新构建 `Payload` 传递给业务流转，以防冲刷掉本地完整的商品数据。

### 6. 乱序到达与幂等兜底 (Idempotency & Out-Of-Order Handling)
**规范要求**：
必须假设海外电商平台抛送 Webhook 会发生严重的“网络乱序”（例如 `UPDATE` 消息由于网关分发，比 `CREATE` 消息更早到达唐小猫后端服务器）。
- **强制要求**：在构建 `handleProductUpdate` 的首行，第一步绝对是拿着传来的 `Id` 去调用 `thirdPlatformProductDao.selectByThirdPlatfromItemId`。
- 如果查不到，说明发生了网络乱序，此时不要报错抛弃，**必须立刻回转调用**对应的 `handleProductCreate` 实现完美的幂等兜底！

---

## 阶段四：架构设计模式

### 7. 事件路由与下沉委派模式 (Event Routing & Delegation)
- **设计原理**：平台入口 Webhook 统一走到策略中心，由其根据不同的 Topic 事件派发给极度单一职责的处理器，如 `ShopifyProductUpdateHandler`。
- **强制开发红线**：
  - 新建的 Handler 必须且只能实现 `WebhookEventHandler` 接口并重写 `supports()` 宣告自己负责的事件。
  - **核心防撞红线**：在独立的 Handler 内，**绝对禁止**擅自去执行计算汇率、转换单位和落库操作！它的唯一任务是拼装出一个统一的 `ProductWebHookDTO`，然后**强制委派并下沉调用**对应的核心商品管理器（例如 `publishProductHandler.handleWebhook(dto)`）。这样就能保证系统中所有的汇率转换和单位极限计算防撞机制只有一份，永不分裂。
