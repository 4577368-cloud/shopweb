# I18N Glossary & Translation Guide

Frontend copy for this Shopify supply-chain app is **English by default**, with **French (`fr`)**, **Spanish (`es`)**, and **Chinese (`zh`)** as secondary locales. All user-facing strings live in typed message dictionaries and are resolved at render time — no hardcoded UI copy anywhere.

## Architecture at a glance

| Piece | Location | Role |
| --- | --- | --- |
| Messages (source of truth) | `src/i18n/messages/en.ts` | `Dictionary` type — every key is defined here first |
| Translations | `src/i18n/messages/{fr,es,zh}.ts` | Must satisfy the `Dictionary` type (compile error if a key is missing) |
| Runtime + `t()` | `src/i18n/LocaleProvider.tsx` | `useT()` returns a translator; dot-path lookup with `{var}` interpolation and English fallback |
| Locale context | `src/i18n/config.ts` | `locales`, `localeLabels`, `isLocale()` |
| Links | `src/i18n/LocaleLink.tsx` | `localePath(locale, "/x")` keeps the locale prefix in URLs |
| Language switch | `src/components/i18n/LanguageSwitcher.tsx` | Swaps the locale segment in the current path |
| Routing | `src/middleware.ts` + `src/app/[locale]/` | All pages live under `/[locale]`; `/api` stays at root |

> The locale is always present in the URL (`/en/...`, `/fr/...`, `/es/...`, `/zh/...`). `t()` falls back to English when a key is somehow absent in the active locale, so the app never shows a blank string.

## How to add a new user-facing string

1. Add the key + English value to `src/i18n/messages/en.ts` (e.g. `sku.foo: "Some label"`).
2. Add the **same key** to `fr.ts`, `es.ts`, `zh.ts` with the translation. The `Dictionary` type enforces parity — `tsc` fails if any locale is missing a key.
3. In the component: `const t = useT(); const locale = useLocale();` then render `t("sku.foo")` (or `t("sku.foo", { count: n })` for interpolation).
4. For links: `href={localePath(locale, "/products")}` — never a bare `/products`.

Keep keys **nested by page/feature** (`install.*`, `home.*`, `products.*`, `sku.*`, `logistics.*`, `sync.*`, `status.*`, `steps.*`, `nav.*`, `common.*`). Group status/label maps under `status.*` so badges localize in one place.

## Terminology (use these exact equivalents)

Consistency matters more than literal translation. These are the agreed professional terms — reuse them everywhere.

| Concept (zh) | English (`en`) | French (`fr`) | Spanish (`es`) | Notes |
| --- | --- | --- | --- | --- |
| 智能选品 | Product Sourcing | Sélection produits | Selección de productos | The product-discovery / matching step |
| SKU 绑定 / 对齐 | SKU mapping | Correspondance SKU | Mapeo de SKU | Variant ↔ source SKU alignment |
| 授权店铺 | Connect store | Connecter la boutique | Conectar tienda | OAuth authorization action |
| 店铺授权 | Store authorization | Autorisation de la boutique | Autorización de la tienda | State, not the action |
| 货源 | Source | Source | Fuente | A supplier / source product |
| 匹配 | Match | Correspondance | Coincidencia | Auto-matching of products |
| 规格 / 变体 | Variant | Variante | Variante | Product variant |
| 待确认 | Needs confirm | À confirmer | Por confirmar | Medium-confidence AI suggestion |
| 自动对齐 | Auto-aligned | Aligné auto | Alineado auto | High-confidence, applied directly |
| 冲突 | Conflict | Conflit | Conflicto | Ambiguous mapping |
| 物流 | Logistics | Logistique | Logística | — |
| AI 物流方案 | AI logistics plan | Plan logistique IA | Plan logístico de IA | Page title |
| 运费预估 | Shipping estimate | Estimation d'expédition | Estimación de envío | Rate-fetch action |
| 线路 | Route | Route | Ruta | Shipping route/quote |
| 履约 | Fulfillment | Exécution | Cumplimiento | Auto-fulfillment prep |
| 上架 / 发布 | List / Publish | Publier | Publicar | Make product live |
| 同步 | Sync | Synchronisation | Sincronización | Shopify sync |
| 工作台 | Workbench | Espace de travail | Panel de trabajo | App shell |
| 开店流程 | Setup flow | Parcours de configuration | Proceso de configuración | Sidebar stepper |
| 草稿 | Draft | Brouillon | Borrador | Shopify draft status |

### Status tones (shared via `status-badge.tsx`)

`notStarted · inProgress · pending · done · exception · conflict` — localized once, reused by every workflow/step/auth/match/sku/sync badge.

## Coverage checklist

**Localized (page-level chrome + inline content):**
- [x] Install landing (`install.*`)
- [x] Home / workbench (`home.*`, `steps.*`, status badges)
- [x] Products (`products.*` chrome; deep sub-panels pending)
- [x] SKU mapping (`sku.*` — page, metrics, filters, copilot, toasts, batch-confirm)
- [x] Logistics (`logistics.*` — page, toasts, batch-accept preview, default template)
- [x] Sync (`sync.*` chrome; deep report/stream sub-components pending)
- [x] Status badges (central `status-badge.tsx`)
- [x] Language switcher (sidebar + install top bar)
- [x] Step sidebar (nav, progress, help links)

**Follow-up (deep shared sub-components — still contain source-language strings):**
- [ ] `products` deep panels: `ShopProductsPanel`, `SmartSourcingSummaryBar`, `CatalogPublishPanel`, `ProductsAgentPanel`
- [ ] `sku-align` deep: `SkuProductCard` rows, `SkuLogisticsEntryGate`
- [ ] `logistics` deep: `LogisticsDecisionList`, `LogisticsPlanStatusCard`, `LogisticsTemplateSetupCard`, `LogisticsAgentPanel`, `LogisticsClassifyStage`, `LogisticsSyncConfirmCard`, `LogisticsTemplateDrawer`
- [ ] `sync` deep: `ProgressPanel`, `LaunchReportStream`, `ProductFlipCard`, `CompletionScreen`, `FollowUpList`, `composeLaunchReport`
- [ ] `select/*` drawers (manual match, catalog link, pricing template)

When translating a deep component, move its strings into the appropriate `*.ts` dictionary section and call `t()` — do **not** hardcode copy, even in shared components.
