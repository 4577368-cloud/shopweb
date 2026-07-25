// pipispy 广告接口联调测试（对照项目现有 test:*.ts 的 assert() 样式）。
//
// 运行：npm run test:pipiads
//
// 背景审计结论（2026-07-25）：
//   - src/lib/marketing/api.ts 中 USE_MOCK = true 写死，8 个 pipispy URI 仅作文档注释，
//     全项目零真实 fetch；后端 tangbuy-plugin 仅有 billing 代理，无 marketing 代理
//     （/api/plugin/marketing/data 不存在）；.env 无 pipispy key。
//   - 因此"真实接口调用从未被测试"是结构性事实，不是偶发遗漏。
//
// 本脚本两块：
//   A. Mock 构建器契约自测：验证 makeXxx 产出的对象满足组件实际消费的字段/类型，
//      防止我们自己的 mock 数据漂移（今天即可跑，无需 key/代理）。
//   B. 真实 pipispy 联调探测（直连，不经后端代理）：
//      - 读 PIPIADS_API_KEY（回退 PIPISPY_KEY），从 .env.local 自动加载（无需 export）
//      - 直连 https://www.pipispy.com/open-api/v1/data ，POST { key, uri, params }
//      - 对每个端点：打印「首条记录的完整字段清单（字段名 / 类型 / 采样值）」，
//        让你一眼看清"实际返回了哪些指标"，并完整落到
//        ../shopify-data/pipiads-raw-sample.json（git 外目录，可打开细看）。
//      - 无 key 时明确打印"未配置 key"诊断 + 文档 URI 清单（不报假成功）。

import fs from "node:fs";
import path from "node:path";
import {
  makeAdCards,
  makeAdDetail,
  makeImageResults,
  makeStores,
  makeTtsShops,
} from "./mock";
import { PIPISPY_URI } from "./api";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error(`  ✗ ${msg}`);
    throw new Error(msg);
  }
  passed++;
  console.log(`  ✓ ${msg}`);
}
function section(title: string) {
  console.log(`\n=== ${title} ===`);
}
function num(v: unknown): v is number {
  return typeof v === "number" && !Number.isNaN(v);
}
function str(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

// pipispy rankList 的 time 参数必须是「Asia/Shanghai 零点」的 Unix 秒级时间戳。
function shanghaiMidnight(ts: number): number {
  const d = new Date(ts);
  const shDate = d.toLocaleString("sv", { timeZone: "Asia/Shanghai" }).split(" ")[0]; // YYYY-MM-DD
  return Math.floor(new Date(`${shDate}T00:00:00+08:00`).getTime() / 1000);
}

// 极简 .env.local / .env 解析（无需 dotenv 依赖）：仅补齐 process.env 中缺失的 key。
function loadEnvLocal() {
  const candidates = [".env.local", ".env"];
  for (const rel of candidates) {
    const fp = path.resolve(process.cwd(), rel);
    if (!fs.existsSync(fp)) continue;
    const text = fs.readFileSync(fp, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const m = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const k = m[1];
      let v = m[2];
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}

// 从 pipispy 响应里抽出「数据记录数组」（兼容多种包裹：data 数组 / data.list / data.data /
// data.records / data.items / body.list / body.records / 退化取首个数组字段）。
function extractRecords(body: any): any[] {
  const data = body?.data;
  if (Array.isArray(data)) return data as any[];
  if (data && typeof data === "object") {
    for (const k of ["list", "data", "records", "items", "rows", "result"]) {
      if (Array.isArray((data as any)[k])) return (data as any)[k];
    }
    for (const v of Object.values(data)) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") return v as any[];
    }
  }
  if (Array.isArray(body?.list)) return body.list as any[];
  if (Array.isArray(body?.records)) return body.records as any[];
  return [];
}

// 字段清单：首条记录的每个 key → { type, sample }，让你看清实际返回了多少指标。
function fieldInventory(record: any): string {
  if (!record || typeof record !== "object") return "  (非对象记录)";
  const lines: string[] = [];
  for (const [k, v] of Object.entries(record)) {
    let t = Array.isArray(v) ? `array[${v.length}]` : typeof v;
    let sample = "";
    if (v == null) sample = "null";
    else if (typeof v === "string") sample = v.length > 40 ? v.slice(0, 40) + "…" : v;
    else if (typeof v === "object")
      sample = Array.isArray(v) ? JSON.stringify(v.slice(0, 2)).slice(0, 40) : "{…" + Object.keys(v).length + " keys}";
    else sample = String(v);
    lines.push(`    · ${k}: ${t}  =  ${sample}`);
  }
  return lines.join("\n");
}

async function main() {
  // -------------------------------------------------------------------------
  // A. Mock 构建器契约自测（组件实际消费的字段）
  // -------------------------------------------------------------------------
  section("A. Mock 构建器满足组件消费契约");

  const stores = makeStores(40);
  assert(stores.length === 40, `makeStores 返回 40 条 (实际 ${stores.length})`);
  for (const s of stores) {
    assert(str(s.id) && str(s.name), `StoreRow.id/name 非空 (${s.name})`);
    assert(str(s.platform), `StoreRow.platform 非空`);
    assert(num(s.adCount) && num(s.playCount) && num(s.putDays), `StoreRow 聚合指标为 number`);
    assert(Array.isArray(s.regions) && Array.isArray(s.categories), `StoreRow.regions/categories 为数组`);
    assert(s.tiktok !== undefined, `StoreRow.tiktok 存在(可 null)`);
  }

  const ads = makeAdCards(80);
  assert(ads.length === 80, `makeAdCards 返回 80 条 (实际 ${ads.length})`);
  for (const a of ads) {
    // image 在 mock 阶段恒为空串，由 CoverThumb 降级为首字母占位（设计 §cover-thumb）；
    // 真实 pipispy 响应会带真图 URL。契约为「string，可空」，故此处仅校验类型。
    assert(str(a.id) && str(a.title) && typeof a.image === "string", `AdCard.id/title 非空且 image 为 string(可空)`);
    assert(num(a.price) && (a.priceUsd === null || num(a.priceUsd)), `AdCard.price 为 number，priceUsd 为 number|null`);
    assert(num(a.adCount) && num(a.activeAdCount) && num(a.adAudienceReach), `AdCard 真实指标(adCount/activeAdCount/adAudienceReach)为 number`);
    assert(Array.isArray(a.adPlatform) && a.adPlatform.length >= 1, `AdCard.adPlatform 为非空数组`);
    assert(str(a.store.name) && str(a.store.domain), `AdCard.store.name/domain 非空`);
    assert(typeof a.sourceProductLink === "string", `AdCard.sourceProductLink 为 string`);
  }

  const tts = makeTtsShops(60);
  assert(tts.length === 60, `makeTtsShops 返回 60 条 (实际 ${tts.length})`);
  for (const t of tts) {
    assert(str(t.id) && str(t.title), `TtsShopRow.id/title 非空`);
    assert(num(t.gmvUsd) && num(t.score) && num(t.salesVolume) && num(t.personCount) && num(t.goodsCount), `TtsShopRow 真实指标为 number`);
    assert(Array.isArray(t.regions) && Array.isArray(t.categories), `TtsShopRow.regions/categories 为数组`);
    assert(Array.isArray(t.salesTrendData) && t.salesTrendData.length > 0, `TtsShopRow.salesTrendData 为非空数组`);
  }

  const detail = makeAdDetail("ad_1");
  assert(str(detail.id) && str(detail.product.title), `AdDetail.id/product.title 非空`);
  assert(str(detail.store.name) && str(detail.store.domain), `AdDetail.store.name/domain 非空`);
  assert(detail.copyUnavailable === true, `AdDetail.copyUnavailable === true (设计 §2.4 限制)`);

  const imgs = makeImageResults(24);
  assert(imgs.length === 24, `makeImageResults 返回 24 条 (实际 ${imgs.length})`);
  for (const i of imgs) {
    assert(num(i.similarity) && i.similarity >= 0 && i.similarity <= 1, `ImageSearchResult.similarity ∈ [0,1]`);
  }

  console.log(`\n[A] mock 契约自测通过：${passed} 断言`);

  // -----------------------------------------------------------------------
  // B. 真实 pipispy 联调探测（直连，不经后端代理）
  // -----------------------------------------------------------------------
  section("B. 真实 pipispy 联调探测（直连 www.pipispy.com，不经后端代理）");
  loadEnvLocal();

  const KEY = process.env.PIPIADS_API_KEY || process.env.PIPISPY_KEY;
  const BASE =
    process.env.PIPISPY_BASE && process.env.PIPISPY_BASE.length > 0
      ? process.env.PIPISPY_BASE
      : "https://www.pipispy.com/open-api/v1/data";

  if (!KEY) {
    console.log("  ⚠ 未配置 pipispy key，跳过真实调用。");
    console.log("  配置方式（二选一）：");
    console.log("    1. 在项目根 .env.local 加一行：  PIPIADS_API_KEY=你的key");
    console.log("    2. 运行时内联：  PIPIADS_API_KEY=你的key npm run test:pipiads");
    console.log("  文档 URI（来自 src/lib/marketing/api.ts PIPISPY_URI）：");
    for (const [k, v] of Object.entries(PIPISPY_URI)) {
      console.log(`    - ${k}: ${v}`);
    }
    console.log(`\n[B] 真实探测跳过（未配置 key）；mock 自测部分已全部通过。`);
    return;
  }

  console.log(`  BASE = ${BASE}`);
  console.log(`  KEY  = ${KEY.slice(0, 4)}****${KEY.slice(-4)}（已遮蔽）`);

  const endpoints: { name: string; uri: string; params: Record<string, unknown> }[] = [
    // 参数名来自 pipiads-cli 官方 catalog（已落实测）：
    // rankList 必填 current_page/page_size/sort_key/sort_type/time/type
    { name: "rankList", uri: PIPISPY_URI.rankList, params: { current_page: 1, page_size: 3, sort_key: "count_growth", sort_type: "desc", time: shanghaiMidnight(Date.now()), type: 3 } },
    // productsSearch 用 page/per_page/order_by/direction（无 q/keyword）
    { name: "productsSearch", uri: PIPISPY_URI.productsSearch, params: { page: 1, per_page: 3, order_by: "ad_started_at", direction: "desc" } },
    // tiktokShopList 必填 current_page/page_size；sort/time 可选
    { name: "tiktokShopList", uri: PIPISPY_URI.tiktokShopList, params: { current_page: 1, page_size: 3, sort: 3, sort_type: "desc", time: 30 } },
    // competition 必填 id（store id）；用真实拿到的 TikTok 店铺 id 演示
    { name: "competition", uri: PIPISPY_URI.competition, params: { id: "7495813413576477254", current_page: 1, page_size: 3 } },
  ];

  const sample: Record<string, unknown> = {};
  let liveOk = 0;

  for (const ep of endpoints) {
    console.log(`\n  --- 端点: ${ep.name} (${ep.uri}) ---`);
    try {
      const res = await fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: KEY, uri: ep.uri, params: ep.params }),
      });
      const body = (await res.json().catch(() => null)) as any;
      console.log(`  HTTP ${res.status}`);
      if (body?.remaining_credits !== undefined)
        console.log(`  remaining_credits = ${body.remaining_credits}, consumed_credits = ${body.consumed_credits ?? "?"}`);
      sample[ep.name] = { uri: ep.uri, httpStatus: res.status, body };

      if (body == null) {
        console.log("  ✗ 响应体为空 / 非 JSON");
        failed++;
        continue;
      }
      // 打印顶层结构提示
      const topKeys = Object.keys(body);
      console.log(`  顶层字段: ${topKeys.join(", ")}`);
      if (body.code !== undefined) console.log(`  code = ${body.code}, msg = ${body.msg}`);

      const records = extractRecords(body);
      if (records.length === 0) {
        console.log("  ⚠ 未抽到数据数组（可能 balance 类端点无 list，或 uri 路径有误）。原始 data 字段：");
        console.log("    " + JSON.stringify(body.data ?? body).slice(0, 300));
      } else {
        console.log(`  命中记录数(本页): ${records.length}`);
        console.log(`  首条记录完整字段清单（共 ${Object.keys(records[0]).length} 个）：`);
        console.log(fieldInventory(records[0]));
      }
      liveOk++;
    } catch (e) {
      console.error(`  ✗ [${ep.name}] 探测失败: ${(e as Error).message}`);
      sample[ep.name] = { uri: ep.uri, error: (e as Error).message };
      failed++;
    }
  }

  // 完整原始响应落到 git 外目录，便于在编辑器里逐字段核对。
  try {
    const outPath = path.resolve(process.cwd(), "../shopify-data/pipiads-raw-sample.json");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(sample, null, 2), "utf8");
    console.log(`\n[B] 完整原始响应已写入: ${outPath}`);
  } catch (e) {
    console.log(`\n[B] 写入样本文件失败（不影响控制台输出）: ${(e as Error).message}`);
  }

  console.log(`\n[B] 真实探测: ${liveOk}/${endpoints.length} 端点返回了响应（详见上方字段清单）`);
  console.log(`[B] 下一步：把实际返回的字段对照 src/lib/marketing/types.ts，补齐前端未展示的指标。`);
}

main()
  .then(() => {
    console.log(`\n总计: ${passed} 断言通过, ${failed} 失败`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error(`\n致命错误: ${(e as Error).message}`);
    process.exit(1);
  });
