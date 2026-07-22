/**
 * 物流工作台状态不变量测试
 * 运行: npx tsx src/lib/logistics/test-workbench-state.ts
 */
import {
  deriveLogisticsWorkbenchState,
  assertLogisticsWorkbenchInvariants,
} from "@/lib/logistics/workbench-state";
import type { LogisticsAnalysis, LogisticsLine, VariantLogisticsDecision } from "@/lib/types";
import type { LogisticsEstimateResult } from "@/lib/api";
import { variantMatchesFilter } from "@/lib/logistics/display";

function mockLine(code: string, name?: string): LogisticsLine {
  return {
    lineCode: code,
    lineName: name ?? code,
    estimatedFee: 10,
    currency: "USD",
    estimatedDays: 12,
    carrier: "Test",
    trackingAvailable: true,
    priority: 1,
  };
}

function mockQuote(
  skuId: string,
  lineCode: string,
  lineName?: string
): LogisticsEstimateResult {
  return {
    thirdPlatformSkuId: skuId,
    quoteStatus: "SUCCESS",
    recommendedLine: mockLine(lineCode, lineName),
  };
}

function variant(
  id: string,
  overrides: Partial<VariantLogisticsDecision> = {}
): VariantLogisticsDecision {
  return {
    thirdPlatformSkuId: id,
    optionLabel: id,
    tangbuySkuId: "tb-sku",
    tangbuyGoodsId: "tb-goods",
    postalLimitClass: "GENERAL",
    postalLimitLabel: "普货",
    decisionStatus: "ready_for_quote",
    decisionReason: "",
    decisionConfirmed: false,
    ...overrides,
  };
}

function analysisWith(
  variants: VariantLogisticsDecision[]
): LogisticsAnalysis {
  return {
    shopName: "test",
    status: "ok",
    analyzedCount: 1,
    skippedUnboundCount: 0,
    productProfiles: [
      {
        thirdPlatformItemId: "p1",
        title: "Test",
        dominantLogisticsType: "GENERAL",
        dominantLogisticsTypeLabel: "普货",
        totalVariants: variants.length,
        variantDecisions: variants,
        decisionStatusCounts: {
          pending_sku: 0,
          pending_postal_meta: 0,
          ready_for_quote: variants.length,
          confirmed: 0,
          restricted: 0,
          needs_review: 0,
        },
      },
    ],
    totalVariants: variants.length,
    decisionStatusCounts: {
      pending_sku: 0,
      pending_postal_meta: 0,
      ready_for_quote: variants.length,
      confirmed: 0,
      restricted: 0,
      needs_review: 0,
    },
    highRiskTypes: [],
  };
}

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

console.log("logistics workbench state invariants\n");

// Case 1: 待报价 — 无报价，不可批量接受
{
  const a = analysisWith([variant("v1"), variant("v2")]);
  const state = deriveLogisticsWorkbenchState(a, new Map());
  assertLogisticsWorkbenchInvariants(state);
  assert("pending quote = 2", state.metrics.pendingQuoteCount === 2);
  assert("pending confirm = 0", state.metrics.pendingConfirmCount === 0);
  assert("cannot batch accept", !state.actions.canBatchAccept);
}

// Case 2: 待确认 — 有报价，可批量接受
{
  const a = analysisWith([variant("v1"), variant("v2")]);
  const quotes = new Map<string, LogisticsEstimateResult>([
    ["v1", mockQuote("v1", "A", "Line A")],
    ["v2", mockQuote("v2", "B", "Line B")],
  ]);
  const state = deriveLogisticsWorkbenchState(a, quotes);
  assertLogisticsWorkbenchInvariants(state);
  assert("pending confirm = 2", state.metrics.pendingConfirmCount === 2);
  assert("batch accept = 2", state.batchAcceptCount === 2);
  assert("can batch accept", state.actions.canBatchAccept);
  const listed = a.productProfiles[0].variantDecisions.filter((v) =>
    variantMatchesFilter(v, "pending_confirm", quotes.get(v.thirdPlatformSkuId))
  );
  assert("filter pending_confirm matches", listed.length === 2);
}

// Case 3: 混合 — 1 待报价 + 1 待确认
{
  const a = analysisWith([variant("v1"), variant("v2")]);
  const quotes = new Map<string, LogisticsEstimateResult>([
    ["v1", mockQuote("v1", "A", "Line A")],
  ]);
  const state = deriveLogisticsWorkbenchState(a, quotes);
  assertLogisticsWorkbenchInvariants(state);
  assert("pending quote = 1", state.metrics.pendingQuoteCount === 1);
  assert("pending confirm = 1", state.metrics.pendingConfirmCount === 1);
  assert("batch accept = 1", state.batchAcceptCount === 1);
}

// Case 4: pipeline 运行中禁用批量操作
{
  const a = analysisWith([
    variant("v1", {
      recommendedLine: mockLine("L"),
    }),
  ]);
  const state = deriveLogisticsWorkbenchState(a, new Map(), {
    pipelineRunning: true,
  });
  assertLogisticsWorkbenchInvariants(state);
  assert("pipeline blocks estimate", !state.actions.canEstimate);
  assert("pipeline blocks batch accept", !state.actions.canBatchAccept);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
