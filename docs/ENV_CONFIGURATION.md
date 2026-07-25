# 环境变量配置（前端 + Render 插件）

## 架构

| 流量 | 路径 |
|------|------|
| 浏览器 → `/api/plugin/**` | Next `rewrites` → `NEXT_PUBLIC_API_BASE`（如 `https://shop-x2mw.onrender.com`） |
| Shopify OAuth 起点 | 浏览器同源 `/api/plugin/shopify/auth/install`（同上 rewrite） |
| 物流报价 / 货盘 | 浏览器直连 `tangbuy.cc`（`NEXT_PUBLIC_TANGBUY_MALL_TOKEN`） |
| 1688 入池 | 浏览器直连 `admin.tangbuy.cc`（`NEXT_PUBLIC_TANGBUY_ADMIN_BROWSER_TOKEN`） |

**Shopify Partner Client ID / Secret 只配置在 Render（`tangbuy-plugin`），不要写进 Next `.env`。**

---

## Next.js（`.env.local` / Vercel）

复制 `.env.example` → `.env.local`，至少：

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_API_BASE` | `https://shop-x2mw.onrender.com`（生产）或 `http://127.0.0.1:8088`（本地插件） |
| `NEXT_PUBLIC_TANGBUY_MALL_TOKEN` | 门户 JWT，与 Render `TANG_PLUGIN_TANGBUY_MALL_TOKEN` **相同** |
| `NEXT_PUBLIC_TANGBUY_MALL_GATEWAY_BASE_URL` | 默认 `https://tangbuy.cc` |
| `NEXT_PUBLIC_TANGBUY_ADMIN_BROWSER_TOKEN` | 与 `TANGBUY_ADMIN_TOKEN` 相同（Vercel 无法直连 admin 时必配） |
| `TANGBUY_ADMIN_API_BASE` | `https://admin.tangbuy.cc/prod-api` |
| `TANGBUY_ADMIN_TOKEN` | 服务端入池备用 |
| `LLM_MODEL_*` | 仅 Next 服务端 Agent 文案（可选） |

校验：`npm run validate:env`

改 `NEXT_PUBLIC_*` 后必须 **重启 `npm run dev`**；Vercel 改 env 后 **Redeploy**。

---

## Render（`shop-x2mw` / tangbuy-plugin）

Dashboard → Environment（`render.yaml` 中 `sync: false` 的项必须手填）：

| 变量 | 值 |
|------|-----|
| `TANG_PLUGIN_SHOPIFY_API_KEY` | Partner App **Client ID** |
| `TANG_PLUGIN_SHOPIFY_API_SECRET` | Partner App **Client secret** |
| `TANG_PLUGIN_SHOPIFY_REDIRECT_URI` | `https://shop-x2mw.onrender.com/api/plugin/shopify/auth/callback` |
| `TANG_PLUGIN_SHOPIFY_WEBHOOK_BASE_URL` | `https://shop-x2mw.onrender.com` |
| `TANG_PLUGIN_FRONTEND_BASE_URL` | `https://ai.tangbuy.com` |
| `TANG_PLUGIN_TANGBUY_MALL_TOKEN` | 与前端 `NEXT_PUBLIC_TANGBUY_MALL_TOKEN` 相同 |

Partner 后台 **Allowed redirection URL** 必须与 `REDIRECT_URI` 完全一致。

缺 Shopify key 时的报错：`Shopify api-key/api-secret not configured on server`。

---

## 常见错误

1. **只改了 `.env.local` 没重启 dev** → 仍走旧 API。  
2. **Vercel 未设 `NEXT_PUBLIC_API_BASE`** → `/api/plugin` 无 rewrite，全站 404。  
3. **Render 未设 Shopify 密钥** → 授权接口 JSON ERROR（与前端无关）。  
4. **`.env.local` 里只写 `TANG_PLUGIN_*`** → Next 不会读（除个别 server route 回退）；mall 用 `NEXT_PUBLIC_` 前缀。  
5. **有 `TANGBUY_ADMIN_TOKEN` 无 `NEXT_PUBLIC_TANGBUY_ADMIN_BROWSER_TOKEN`** → 生产入池失败。
