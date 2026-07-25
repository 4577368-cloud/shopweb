// Operations Hub（订单中心 / 运营中心 / 履约中心）
//
// - `npm run dev`：始终可用（便于本地联调）
// - 生产：须在 Vercel 设置 NEXT_PUBLIC_HUB_ENABLED=true 才会开放中枢路由与侧栏入口
// - 商品货源关联达 80% 后侧栏中枢可点击（见 src/lib/hub/unlock.ts、WorkbenchSidebar、HubRouteGate）
export const HUB_ENABLED =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_HUB_ENABLED === "true";
