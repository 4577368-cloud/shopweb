import { classifyProductCommandByRules } from "@/lib/agents/products/classify-command";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const cases: Array<{
  text: string;
  intent: string;
  check?: (draft: NonNullable<ReturnType<typeof classifyProductCommandByRules>["draft"]>) => void;
}> = [
  {
    text: "找红色连衣裙",
    intent: "search_sourcing",
    check: (d) => assert(d.params.sourcingKeywords?.includes("红色") ?? false, "kw"),
  },
  {
    text: "look for wireless earbuds",
    intent: "search_sourcing",
    check: (d) => assert(!!d.params.sourcingKeywords?.includes("wireless"), "kw"),
  },
  {
    text: "find cute plush toys",
    intent: "search_sourcing",
    check: (d) => assert(!!d.params.sourcingKeywords?.includes("plush"), "kw"),
  },
  {
    text: "buscar fundas de móvil",
    intent: "search_sourcing",
    check: (d) => assert(!!d.params.sourcingKeywords?.includes("fundas"), "kw"),
  },
  {
    text: "chercher robe rouge",
    intent: "search_sourcing",
    check: (d) => assert(!!d.params.sourcingKeywords?.includes("robe"), "kw"),
  },
  {
    text: "1688 上便宜的手机壳",
    intent: "search_sourcing",
    check: (d) => assert(d.params.sourcingSourceFilter === "1688", "1688 filter"),
  },
  {
    text: "上架第 2 个",
    intent: "publish_sourcing_item",
    check: (d) => assert(d.params.sourcingListIndex === 2, "idx"),
  },
  {
    text: "发布第二个",
    intent: "publish_sourcing_item",
    check: (d) => assert(d.params.sourcingListIndex === 2, "idx cn"),
  },
  {
    text: "publish item 3",
    intent: "publish_sourcing_item",
    check: (d) => assert(d.params.sourcingListIndex === 3, "idx en"),
  },
  {
    text: "list the second one",
    intent: "publish_sourcing_item",
    check: (d) => assert(d.params.sourcingListIndex === 2, "idx ord"),
  },
  {
    text: "预算 15 美元以内",
    intent: "set_sourcing_filters",
    check: (d) => assert(d.params.sourcingPriceMaxUsd === 15, "budget"),
  },
  {
    text: "under $20",
    intent: "set_sourcing_filters",
    check: (d) => assert(d.params.sourcingPriceMaxUsd === 20, "budget en"),
  },
  {
    text: "只看 1688",
    intent: "set_sourcing_filters",
    check: (d) => assert(d.params.sourcingSourceFilter === "1688", "src"),
  },
  {
    text: "看待确认",
    intent: "open_filter",
  },
  {
    text: "把售价改成 9.9 美元",
    intent: "update_listing_price",
  },
  {
    text: "商品标题修改为英文",
    intent: "update_product_copy",
    check: (d) => {
      assert(d.params.copyAction === "translate", "translate");
      assert(d.params.copyTargetLang === "en", "en");
      assert(d.params.copyField === "title", "title");
      assert(d.targetScope === "current", "current");
    },
  },
  {
    text: "把它标题改成韩文",
    intent: "update_product_copy",
    check: (d) => assert(d.params.copyTargetLang === "ko", "ko"),
  },
  {
    text: "翻译这个商品成为日语",
    intent: "update_product_copy",
    check: (d) => assert(d.params.copyTargetLang === "ja", "ja"),
  },
  {
    text: "当前商品标题调整为中文简体",
    intent: "update_product_copy",
    check: (d) => assert(d.params.copyTargetLang === "zh", "zh"),
  },
  {
    text: "标题翻译为英语",
    intent: "update_product_copy",
    check: (d) => assert(d.params.copyTargetLang === "en", "en"),
  },
];

let passed = 0;
for (const c of cases) {
  const r = classifyProductCommandByRules(c.text);
  assert(r.confidence === "high" && !!r.draft, `no draft: ${c.text}`);
  assert(r.draft!.intent === c.intent, `${c.text} → ${r.draft!.intent}, want ${c.intent}`);
  c.check?.(r.draft!);
  passed++;
}

console.log(`✓ ${passed}/${cases.length} products sourcing NL rule cases passed`);
