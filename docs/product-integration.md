# 电商平台精细化对接子 Skill - 商品同步与发布

此子 Skill 专注于平台对接时的**商品拉取、属性同步、变体处理及商品主动刊登**。必须严格遵守商品单位、价格换算和 SPU/SKU 事务绑定原则。

// turbo-all

开发时，请将模板中的 `{Platform}` 或 `Amazon` 替换为**实际对接的电商平台名称**。

---

## 阶段一：通信组件与数据转换 (API Components & Adapters)

### 1. 拆分领域通信组件 (极度解耦)
**目标文件**：
- 商品请求：`service/publish/component/{platform}/{Platform}ProductComponent.java`
- 职责与规范：单一职责，只负责向第三方平台发起 HTTP/GraphQL 请求。

### 2. 产品域适配器 (强隔离)
**文件**：`service/publish/convert/{Platform}ProductRequestAdapter.java`
- 职责：处理产品属性、SKU、图片的双向映射，适配 `BasePublishProductHandler` 的需要。
- **强制规范**：拉取第三方商品时，必须将平台的变体与选项转换为内部 `ThirdPlatformProduct` 和 `ThirdPlatformSku`，并且**必须要在此处计算或换算重量单位（例如统一转为 GRAMS）和最值价格区间**。

---

## 阶段二：核心业务策略层 (Strategies - 高内聚)

### 3. 产品发布与同步处理器 (核心防并发防限流机制)
**文件**：`service/publish/handler/impl/product/{Platform}ProductHandler.java`
- 职责：负责商品的发布(Publish)、拉取同步(Sync/Pull)以及Webhook更新处理。
- 模板规范：
```java
package com.tang.plugin.service.publish.handler.impl.product;

import com.alibaba.fastjson2.JSONObject;
import com.google.common.util.concurrent.RateLimiter;
import com.tang.common.core.exception.CustomException;
import com.tang.plugin.component.RedisManager;
import com.tang.plugin.domain.bo.product.PublicProductBO;
import com.tang.plugin.domain.bo.product.PublicProductConvertBO;
import com.tang.plugin.domain.dto.product.PublishProductResultDTO;
import com.tang.plugin.domain.dto.product.SyncThirdPartyPlatformProductDTO;
import com.tang.plugin.domain.dto.product.SyncThirdProductDTO;
import com.tang.plugin.domain.dto.webhook.ProductWebHookDTO;
import com.tang.plugin.domain.entity.product.ThirdPlatformProduct;
import com.tang.plugin.domain.entity.product.ThirdPlatformSku;
import com.tang.plugin.enums.PluginType;
import com.tang.plugin.service.publish.component.ExchangeRateComponent;
import com.tang.plugin.service.publish.component.{platform}.{Platform}ProductComponent;
import com.tang.plugin.service.publish.component.{platform}.{Platform}ProductWebhookComponent;
import com.tang.plugin.service.publish.handler.BasePublishProductHandler;
import com.tang.plugin.utils.constant.RedisPrefixConstants;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.collections4.CollectionUtils;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Component
@Slf4j
public class {Platform}PublishProductHandler extends BasePublishProductHandler {
    
    @Resource private {Platform}ProductComponent productComponent;
    @Resource private ExchangeRateComponent exchangeRateComponent;
    @Resource private RedissonClient redissonClient;
    @Resource private {Platform}ProductWebhookComponent productWebhookComponent;
    
    public {Platform}PublishProductHandler() {
        channelCode = PluginType.{PLATFORM}.name();
    }
    
    // ========== 1. 商品主动发布逻辑 ==========
    @Override
    protected void publishProduct(PublicProductBO productBO, PublishProductResultDTO publishProductResultDTO) {
        String currency = getShopCurrency(productBO.getShopName());
        
        // 示例：每秒限制请求数
        final RateLimiter rateLimiter = RateLimiter.create(5.0); 

        for (PublicProductConvertBO request : requestList) {
            String lockKey = RedisPrefixConstants.PUBLISH_PRODUCT_SEARCH_PREFIX + channelCode + request.getShopName() + request.getDraftItemBO().getDraftItemId() + "lock";
            RLock lock = redissonClient.getLock(lockKey);
            try {
                if (!lock.tryLock(5, TimeUnit.SECONDS)) throw new CustomException("已有操作正在刊登，已被锁定");
                
                rateLimiter.acquire();
                
                Object externalProduct = productComponent.createProduct(request.getPublishPayload(), request.getShopName());
                handlerPublishResult(request, publishProductResultDTO, JSONObject.toJSONString(externalProduct));
            } catch (Exception e) {
                log.error("{Platform} publish error for shop: {}", request.getShopName(), e);
                handlerPublishFailResult(request, publishProductResultDTO, e.getMessage(), 500);
            } finally {
                if (lock != null && lock.isHeldByCurrentThread()) lock.unlock();
            }
        }
    }
    
    // ========== 2. 商品主动拉取/同步逻辑 (Product Pull / Sync) ==========
    @Override
    protected SyncThirdPartyPlatformProductDTO getThirdPartyPlatformProductList(SyncThirdProductDTO changeDTO) {
        changeDTO.setCurrency(getShopCurrency(changeDTO.getShopName()));
        changeDTO.setExchangeRate(exchangeRateComponent.getExchangeRate(changeDTO.getCurrency()));
        
        List<Object> products = productComponent.getProducts(changeDTO.getShopName());
        if (CollectionUtils.isEmpty(products)) return null;
        
        List<ThirdPlatformProduct> productList = new ArrayList<>();
        List<ThirdPlatformSku> skuList = new ArrayList<>();
        
        for (Object extProduct : products) {
            // 调用内部方法转换属性，其中必须计算好各 SKU 的重量与价格区间
            // convertToThirdPlatformProduct(changeDTO, extProduct, productList, skuList);
        }
        return SyncThirdPartyPlatformProductDTO.builder().thirdPlatformProductList(productList).thirdPlatformSkuList(skuList).build();
    }
    
    // ========== 3. 处理商品 Webhook 的底层入口 ==========
    @Override
    public void handleWebhook(ProductWebHookDTO dto) {
        switch(dto.getEvent()) {
            case {PLATFORM}_PRODUCT_UPDATED:
                // 交由独立组件解析，杜绝直接写库
                productWebhookComponent.handleProductUpdate(dto);
                break;
            default:
                break;
        }
    }
}
```

---

## 阶段三：底层模型防撞与高级防线

### 4. 全变体极值计算与单位换算 (Product Conversion Limits)
**规范要求**：
构建本系统的 `ThirdPlatformProduct` 前，**强制要求对商品的 Variants (变体) 列表进行全量遍历**，用以计算该商品主体的极限值（否则前端展示报错，国际运费算错）：
1. **价格极限提取与本币转换**：
   找出所有变体中的 `minPrice` 和 `maxPrice`，然后**强制调用** `exchangeRateComponent.getExchangeRate(currency)` 乘上汇率转换为本币存储。
2. **重量极限提取与绝对单位转换**：
   找出所有变体中的 `minWeight` 和 `maxWeight`，然后**强制调用** `WeightUnit.convertTo(weight, WeightUnit.GRAMS)` 统一转换为克 (Grams)。

### 5. 属性排位与 SPU/SKU 强事务绑定 (SPU/SKU Transaction Boundary)
**规范要求**：
1. **规格排序控制**：将外部 Option1/Option2 映射封装进 `productAttributeList` 的同时，必须强行提取并附带其对应的 `position/id` 属性，以确保前端 SKU 生成的表格与第三方严格同序。
2. **强一致性事务控制**：处理 Webhook 落地数据库时，针对主商品 (`ThirdPlatformProduct` Dao) 和 附属 SKUs (`ThirdPlatformSku` Dao) 的批量插入或更新，**必须强制包裹在 `autoSwitchTransactionTemplate.execute(...)` 等事务上下文中**。如果报错，立刻回滚！绝对不允许出现 SPU 存活但 SKU 写入失败的“无头死商品”。

---

## 阶段四：架构设计模式

### 6. 模板方法模式 (Template Method Pattern)
- **设计原理**：拉取与刊登商品的核心流程、任务队列、失败重试等逻辑已经全部被锁死在 `BasePublishProductHandler` 父类中。父类暴露了多个 `protected abstract` 方法供特定平台填充 HTTP 逻辑。
- **强制开发红线**：
  - 接入新平台时，你的 ProductHandler **必须** `extends BasePublishProductHandler`。
  - 必须在无参构造函数中指明归属，例如：`public XXXPublishProductHandler() { channelCode = PluginType.XXX.name(); }`（父类的 `@PostConstruct` 会靠它自动完成向 `ProductPlatformHandlerHolder` 的注册）。
  - **绝对禁止**覆盖父类中已有的非 abstract 业务流转方法，你只能重写类似 `publishProduct(...)` 和 `getThirdPartyPlatformProductList(...)` 这种纯粹的交互骨架方法。
