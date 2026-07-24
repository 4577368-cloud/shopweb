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
