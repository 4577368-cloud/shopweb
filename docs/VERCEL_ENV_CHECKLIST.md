# Vercel 环境变量清单（ai.tangbuy.com）

在 Vercel Project → Settings → Environment Variables 中配置（Production + Preview 建议一致）。

| Key | 说明 |
|-----|------|
| `NEXT_PUBLIC_API_BASE` | `https://shop-x2mw.onrender.com` |
| `NEXT_PUBLIC_TANGBUY_MALL_TOKEN` | 门户 JWT（= Render `TANG_PLUGIN_TANGBUY_MALL_TOKEN`） |
| `NEXT_PUBLIC_TANGBUY_MALL_GATEWAY_BASE_URL` | `https://tangbuy.cc` |
| `NEXT_PUBLIC_TANGBUY_ADMIN_BROWSER_TOKEN` | = `TANGBUY_ADMIN_TOKEN`（1688 入池） |
| `TANGBUY_ADMIN_API_BASE` | `https://admin.tangbuy.cc/prod-api` |
| `TANGBUY_ADMIN_TOKEN` | Admin JWT |
| `TANGBUY_POOL_DEFAULT_LEVEL` | 如 `S` |
| `LLM_MODEL_BASE_URL` | 可选 |
| `LLM_MODEL_API_KEY` | 可选 |
| `LLM_MODEL_MODEL_ID` | 可选 |

**不要**在 Vercel 配置 `TANG_PLUGIN_SHOPIFY_*`（仅 Render 插件）。

保存后 **Redeploy** 最新 `main` 构建。

详见 [ENV_CONFIGURATION.md](./ENV_CONFIGURATION.md)。
