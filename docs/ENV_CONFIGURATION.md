# 环境变量配置（前端 + 插件）

## 架构

| 流量 | 路径 |
|------|------|
| 浏览器 → `/api/plugin/**` | Next `rewrites` → `NEXT_PUBLIC_API_BASE`（GitLab 生产：`https://www.tangbuy.cc/gateway/source`） |
| Shopify OAuth 起点 | 浏览器同源 `/api/plugin/shopify/auth/install`（同上 rewrite） |
| 物流报价 / 货盘 / itemGet | 浏览器直连 `tangbuy.cc`，**Bearer = 当前登录用户的门户 JWT**（`TANGBUY_TOKEN` cookie 或 embedded session 的 platform token） |
| 1688 入池 | 浏览器直连 `admin.tangbuy.cc`（`NEXT_PUBLIC_TANGBUY_ADMIN_BROWSER_TOKEN`） |

**Shopify Partner Client ID / Secret 只配置在插件运行环境，不要写进 Next `.env`。**

### 货盘鉴权（与老 tang-plugin 一致）

- Standalone：邮箱/三方登录 → `TANGBUY_TOKEN`（主站 `/user/newLogin` 等）
- Embedded：Shopify session exchange → 主站 `/platform/login` 的 `tokenInfo`，存入内存 Bearer
- **不再**依赖固定的 `NEXT_PUBLIC_TANGBUY_MALL_TOKEN` / `TANG_PLUGIN_TANGBUY_MALL_TOKEN` 冒充某个账号调货盘

---

## Next.js（`.env.local` / GitLab `.env.prod`）

复制 `.env.example` → `.env.local`，至少：

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_API_BASE` | 插件 API 根（生产网关或本地 `http://127.0.0.1:8088`） |
| `NEXT_PUBLIC_TANGBUY_MALL_GATEWAY_BASE_URL` | 默认 `https://tangbuy.cc` |
| `NEXT_PUBLIC_TANGBUY_ADMIN_BROWSER_TOKEN` | 与 `TANGBUY_ADMIN_TOKEN` 相同（入池需浏览器直连 admin） |
| `TANGBUY_ADMIN_API_BASE` | `https://admin.tangbuy.cc/prod-api` |
| `TANGBUY_ADMIN_TOKEN` | 服务端入池备用 |
| `LLM_MODEL_*` | 仅 Next 服务端 Agent 文案（可选） |

**已废弃（业务不需要）：** `NEXT_PUBLIC_TANGBUY_MALL_TOKEN` — 历史共享门户 JWT；保留在 example 仅作兼容说明。

校验：`npm run validate:env`

改 `NEXT_PUBLIC_*` 后必须 **重启 `npm run dev`**；GitLab 构建吃 [`.env.prod`](../.env.prod)（`npm run build`）。

---

## 公司 GitLab 部署（`env.test` / `ops/env`）

当前机器上的运行配置在 `.env.local`。同步到公司 GitLab（**永不进 GitHub**）：

```bash
npm run env:gitlab
```

- 生成本地 `env.test`（已在 `.gitignore`）
- 仅推送到 remote `gitlab` 的独立分支 **`ops/env`**
- 不会 `git push origin`，也不会把密钥写进 `main`

生产前端构建：`npm run build` 使用仓库内 [`.env.prod`](../.env.prod)（API 网关 + Shopify API key）；货盘鉴权靠用户登录，不写死 mall token。

---

## 插件后端（ECS / Docker `.env`）

见 `tangbuy-plugin/deploy/.env.example`：

| 变量 | 说明 |
|------|------|
| `TANG_PLUGIN_SHOPIFY_API_KEY` / `SECRET` | Partner App |
| `TANG_PLUGIN_SHOPIFY_REDIRECT_URI` | 网关 callback |
| `TANG_PLUGIN_FRONTEND_BASE_URL` | `https://source.tangbuy.cc` |
| `TANG_PLUGIN_TANGBUY_MALL_TOKEN` | **已废弃用于业务货盘**；服务端改为转发当前请求的门户 JWT |
| `ALIBABA_1688_*` | 图搜 |
| `TANG_PLUGIN_PIPIADS_API_KEY` | 运营中心 |

---

## 常见错误

1. **只改了 `.env.local` 没重启 dev** → 仍走旧 API。  
2. **未登录 Tangbuy / 无 `TANGBUY_TOKEN`** → 物流黄条「请先登录」、货盘/报价不可用（与店铺授权无关）。  
3. **插件未设 Shopify 密钥** → 授权接口 JSON ERROR。  
4. **有 `TANGBUY_ADMIN_TOKEN` 无 `NEXT_PUBLIC_TANGBUY_ADMIN_BROWSER_TOKEN`** → 生产入池失败。
