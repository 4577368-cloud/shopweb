/**
 * Read-only evaluation harness for the SKU-align command classifier.
 *
 * Goal: make few-shot / natural-language command evaluation routine.
 * - Runs a corpus of sample commands through the deterministic rules classifier
 *   and reports how many match the expected intent/shape.
 * - Optionally (RUN_LLM=1) hits the live LLM-first API route and compares.
 *
 * This script NEVER writes to the repository or mutates any source file.
 * Run:  npx tsx scripts/eval-sku-commands.ts
 *       RUN_LLM=1 npx tsx scripts/eval-sku-commands.ts   (needs dev server on :3000)
 */
import {
  classifySkuCommandByRules,
  parseSkuCommandResponse,
} from "../src/lib/agents/sku-align/classify-command";
import type { SkuCommandId } from "../src/lib/agents/sku-align/command-schema";

interface Case {
  input: string;
  expectedIntent?: SkuCommandId;
  expectShape?: "draft" | "steps" | "clarify";
  note?: string;
}

// Few-shot evaluation corpus. `note` explains cases the keyword-only rules
// baseline cannot handle (those are exactly what the LLM-first route covers).
const corpus: Case[] = [
  { input: "只看部分关联", expectedIntent: "open_filter", expectShape: "draft" },
  { input: "显示待确认的商品", expectedIntent: "open_filter", expectShape: "draft" },
  { input: "批量确认待确认", expectedIntent: "batch_confirm_pending", expectShape: "draft" },
  { input: "把需要复核的一起确认", expectedIntent: "batch_confirm_pending", expectShape: "draft" },
  { input: "重新对齐", expectedIntent: "rerun_auto_align", expectShape: "draft" },
  { input: "解释这个匹配", expectedIntent: "explain_sku_match", expectShape: "draft" },
  { input: "打开详情", expectedIntent: "open_sku_detail", expectShape: "draft" },
  { input: "解绑红色 S 码", expectedIntent: "unbind", expectShape: "draft" },
  { input: "调高匹配阈值", expectedIntent: "tune_threshold", expectShape: "draft", note: "rules baseline cannot parse NL threshold" },
  { input: "给这个商品加个补充货源", expectedIntent: "add_supplement_source", expectShape: "draft", note: "rules baseline cannot parse NL slot" },
  { input: "把红色 S 码绑到第二个货源", expectedIntent: "bind_variant", expectShape: "draft", note: "rules baseline cannot parse NL slot" },
  { input: "先看部分关联，再把待确认的批量确认", expectShape: "steps", note: "multi-step; rules baseline returns a single open_filter" },
  { input: "把红色 S 码解绑，还是先看下这个商品？", expectShape: "clarify", note: "ambiguous; LLM returns structured clarify" },
];

function shapeOf(r: ReturnType<typeof classifySkuCommandByRules>): "draft" | "steps" | "clarify" {
  if (r.steps && r.steps.length > 0) return "steps";
  if (r.draft) return "draft";
  return "clarify";
}

// Smoke test the composite parser directly (does not need the network).
function smokeParse() {
  const samples: Record<string, string> = {
    steps: '{"steps":[{"intent":"open_filter","targetScope":"none","params":{"filterMode":"partially_linked"},"confirmationRequired":false},{"intent":"batch_confirm_pending","targetScope":"all","params":{"batchFilter":"partially_linked"},"confirmationRequired":true}]}',
    clarify: '{"clarify":{"message":"解绑还是看详情？","candidates":[{"intent":"unbind"},{"intent":"open_sku_detail"}]}}',
    draft: '{"intent":"tune_threshold","targetScope":"current","params":{"threshold":0.8},"confirmationRequired":false}',
  };
  console.log("\n=== parseSkuCommandResponse smoke test ===");
  for (const [kind, json] of Object.entries(samples)) {
    const parsed = parseSkuCommandResponse(json);
    const ok =
      (kind === "steps" && parsed?.kind === "steps") ||
      (kind === "clarify" && parsed?.kind === "clarify") ||
      (kind === "draft" && parsed?.kind === "draft");
    console.log(`${ok ? "PASS" : "FAIL"}  parse ${kind} -> ${parsed?.kind ?? "null"}`);
  }
}

async function main() {
  console.log("=== SKU command rules-baseline evaluation ===");
  let pass = 0;
  const total = corpus.length;
  for (const c of corpus) {
    const r = classifySkuCommandByRules(c.input);
    const shape = shapeOf(r);
    const intentOk = c.expectedIntent ? r.draft?.intent === c.expectedIntent : true;
    const shapeOk = c.expectShape ? shape === c.expectShape : true;
    const ok = intentOk && shapeOk;
    if (ok) pass++;
    const got = r.draft?.intent ?? (shape === "steps" ? `steps(${r.steps?.length})` : "clarify");
    console.log(`${ok ? "PASS" : "FAIL"}  [${shape}] "${c.input}" => ${got}${c.note ? `  (${c.note})` : ""}`);
  }
  console.log(`\nRules baseline: ${pass}/${total} matched expectations.`);
  console.log("Note: the rules path is keyword-only; NL / threshold / slot / composite / ambiguous");
  console.log("cases are handled by the LLM-first route (phase 1+2+3).");

  smokeParse();

  if (process.env.RUN_LLM === "1") {
    console.log("\n=== SKU command LLM evaluation (RUN_LLM=1) ===");
    let lpass = 0;
    for (const c of corpus) {
      try {
        const res = await fetch("http://localhost:3000/api/agents/sku-align/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: c.input, locale: "zh" }),
        });
        const data = await res.json();
        const shape = data.steps?.length ? "steps" : data.draft ? "draft" : "clarify";
        const ok =
          (c.expectedIntent ? data.draft?.intent === c.expectedIntent : true) &&
          (c.expectShape ? shape === c.expectShape : true);
        if (ok) lpass++;
        const got = data.draft?.intent ?? (shape === "steps" ? `steps(${data.steps?.length})` : "clarify");
        console.log(`${ok ? "PASS" : "FAIL"}  [${shape}] "${c.input}" => ${got}`);
      } catch (e) {
        console.log(`ERR  "${c.input}" => ${(e as Error).message}`);
      }
    }
    console.log(`\nLLM: ${lpass}/${corpus.length} matched expectations.`);
  }
}

void main();
