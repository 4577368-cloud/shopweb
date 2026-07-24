// Operations Hub（订单中心 / 运营中心 / 履约中心）当前处于 **本地 / 开发环境**
// 测试阶段。它必须：
//   1. 绝不出现在生产环境的开店流程体验中；
//   2. 与 `useOnboarding` / 开店步骤流程完全解耦（独立路由 + 独立左栏）。
//
// 开关规则：
//   - `npm run dev` 期间始终开启（NODE_ENV === "development"）；
//   - 生产构建默认关闭，除非显式置位 NEXT_PUBLIC_HUB_ENABLED=true
//     （仅当运营中枢准备正式上线时由部署方开启）。
export const HUB_ENABLED =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_HUB_ENABLED === "true";
