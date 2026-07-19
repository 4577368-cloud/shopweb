# Tangbuy · Shopify 一件代发 Onboarding 工作台

第一阶段前端产品原型：桌面端企业工作台 + mock data 演示。  
不含真实 API、数据库、登录或后端。

## 技术栈

- Next.js 16（App Router）
- TypeScript
- Tailwind CSS 4
- 自建 shadcn 风格组件体系
- 前端 Context 状态管理 + 静态 mock data

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)

## 路由规划

| 路由 | 页面 |
|------|------|
| `/` | 工作台首页 |
| `/authorize` | 授权店铺 |
| `/products` | 智能选品 |
| `/sku-align` | SKU 对齐确认 |
| `/logistics` | 确认物流 |
| `/sync` | 同步完成 |

## 目录结构

```
src/
  app/                      # 页面路由
    page.tsx                # 工作台首页
    authorize/page.tsx
    products/page.tsx
    sku-align/page.tsx
    logistics/page.tsx
    sync/page.tsx
    layout.tsx
    globals.css
  components/
    layout/                 # 工作台骨架（侧栏 / AI 助手 / 页头）
    ui/                     # 基础组件（Button / Input / Table / Badge…）
    providers.tsx
  context/
    onboarding-context.tsx  # 前端状态（可替换为真实接口）
  data/
    mock.ts                 # Mock 数据
  lib/
    types.ts                # 类型定义
    utils.ts
```

## 设计系统

- 冷白 / 浅灰层次 + 青绿强调色（teal）
- 高信息密度企业工作台，非营销页
- AI 助手为右侧解释层，非全屏聊天
- 每页一个主按钮，状态可视化

## 第二阶段预留

- `src/lib/types.ts`：接口契约
- `src/data/mock.ts`：可替换为 Shopify GraphQL / webhook 数据适配层
- `src/context/onboarding-context.tsx`：动作函数可改为 API mutation
