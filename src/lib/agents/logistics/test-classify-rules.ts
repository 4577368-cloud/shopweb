/**
 * Logistics agent rule classifier regression.
 * Run: npx tsx src/lib/agents/logistics/test-classify-rules.ts
 */
import { classifyLogisticsCommandByRules } from "@/lib/agents/logistics/classify-command";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testExplainQuoteZh() {
  const r = classifyLogisticsCommandByRules("解释「拖鞋」的报价", null);
  assert(r.confidence === "high", "explain zh high");
  assert(r.draft?.intent === "explain_quote", "explain intent");
  assert(r.draft?.params.productTitleHint === "拖鞋", "title hint");
}

function testExplainQuoteEn() {
  const r = classifyLogisticsCommandByRules(
    'explain the shipping quote for "slippers"',
    null
  );
  assert(r.draft?.intent === "explain_quote", "explain en intent");
}

function testFetchQuotesEs() {
  const r = classifyLogisticsCommandByRules("actualizar cotizaciones", null);
  assert(r.confidence === "high", "fetch es high");
  assert(r.draft?.intent === "fetch_quotes", "fetch es intent");
}

function testAcceptFr() {
  const r = classifyLogisticsCommandByRules("confirmer tout", null);
  assert(r.draft?.intent === "accept_all_ready", "accept fr");
}

function testLlmCalibrationImport() {
  const { calibrateLogisticsLlmConfidence, normalizeLogisticsCommandDraft } =
    require("@/lib/agents/logistics/llm-classify-calibration") as typeof import("@/lib/agents/logistics/llm-classify-calibration");
  const draft = normalizeLogisticsCommandDraft({
    intent: "fetch_quotes",
    targetScope: "all",
    params: {},
    confirmationRequired: false,
  });
  const rules = classifyLogisticsCommandByRules("refresh quotes", null);
  const conf = calibrateLogisticsLlmConfidence("refresh quotes", draft, rules, null);
  assert(conf === "high", "calibrate agrees with rules");
  const loose = calibrateLogisticsLlmConfidence(
    "maybe do something",
    { ...draft, intent: "start_estimate" },
    { confidence: "none", source: "default" },
    null
  );
  assert(loose === "medium", "unknown phrasing stays medium");
}

function main() {
  testExplainQuoteZh();
  testExplainQuoteEn();
  testFetchQuotesEs();
  testAcceptFr();
  testLlmCalibrationImport();
  console.log("✓ logistics classify rules tests passed");
}

main();
