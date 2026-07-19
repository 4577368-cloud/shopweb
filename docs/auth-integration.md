# 电商平台精细化对接子 Skill - 认证与生命周期挂载

此子 Skill 专注于平台对接时的**店铺认证、令牌管理与核心生命周期回调挂载**。必须严格遵循 `tang-plugin` 项目的高内聚、低耦合规范。

// turbo-all

开发时，请将模板中的 `{Platform}` 或 `Amazon` 替换为**实际对接的电商平台名称**。

---

## 阶段一：基础模型与授权层 (Domain & Auth)

### 1. 基础模型定义
**目标**：定义平台常量、数据库授权表实体以及专属数据载体。
- 修改 `src/main/java/com/tang/plugin/enums/PluginType.java` 增加枚举。
- 创建数据库映射实体：`domain/entity/user/{Platform}StoreAuth.java`
- 创建平台独有的 DTO 文件夹：`domain/request/{platform}` 和 `domain/dto/{platform}`。

### 2. 实现店铺授权服务 (Auth Service)
**文件**：`src/main/java/com/tang/plugin/service/user/{Platform}StoreAuthService.java`
- 职责：专门处理该平台的 OAuth 令牌获取、刷新、保存和店铺授权生命周期管理。

---

## 阶段二：生命周期钩子层 (Auth Post-Hooks - 隐形挂载)

### 3. 授权回调的后置钩子 (Auth Service Extensions)
**说明**：在获取到第三方的 Access Token 并且保存到数据库后，绝对不能直接结束！必须执行两大核心组件的挂载，否则项目无法正常工作。
**文件**：`src/main/java/com/tang/plugin/service/user/{Platform}AuthService.java`
- 模板规范：
```java
// ... 在获取并保存 token 到 DB 之后执行：
UserAuthShop userAuthShop = new UserAuthShop();
userAuthShop.setShopType(PluginType.{PLATFORM});
userAuthShop.setShopName(shopName);

// 【强制】1. 向第三方平台动态订阅所有声明的 Webhook (极度重要)
try {
    webhookManagementService.registerWebhooks(userAuthShop);
} catch (Exception e) {
    log.error("注册 webhook 失败", e);
}

// 【强制】2. 注册当前平台(TangBuy)作为第三方商店的合法履约承运商 (Fulfillment Service)
try {
    externalFulfillmentService.createFulfillmentService(userAuthShop);
} catch (Exception e) {
    log.error("注册履约服务商失败", e);
}
```

---

## 阶段三：安全与容错防线

### 4. 全局 HMAC 安全签名防线 (Global Signature Verification)
**说明**：任何来自外网的回调（Auth Callback、Webhook Push）必须经过严格的参数去重排序和 SHA256 HMAC 验签。
**代码片段参考** (在 Controller/AuthService 顶部拦截)：
```java
// 提取参数，排除 hmac/signature 等字段
Map<String, String> filteredParams = new HashMap<>(params);
filteredParams.remove("hmac");
filteredParams.remove("signature");

// 强要求按字典序排序参数后拼接验证
String paramString = filteredParams.entrySet().stream()
        .sorted(Map.Entry.comparingByKey())
        .map(e -> e.getKey() + "=" + e.getValue())
        .collect(Collectors.joining("&"));
        
String calculatedHmac = HmacUtils.hmacSha256Hex(appSecret, paramString);
if (!calculatedHmac.equals(requestHmac)) {
    throw new SecurityException("非法篡改请求拦截！");
}
```
