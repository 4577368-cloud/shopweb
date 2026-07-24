/**
 * 产品 Agent 命令拆分回归（labels / 预览空批 / 执行器注册 / 状态执行）
 * 运行: npx tsx src/lib/products/test-agent-commands.ts
 */
import { createProductsCommandLabels } from "@/lib/products/agent-command-labels";
import {
  applyLocalProductStatus,
  createProductsCommandExecutors,
} from "@/lib/products/agent-command-executors";
import { createProductsPreviewGenerators } from "@/lib/products/agent-preview-generators";
import type { ProductsCommandRuntime } from "@/lib/products/agent-command-types";
import type { AiFieldEditRecord } from "@/lib/ai-field-edit-feedback";
import type { ShopMirrorProduct } from "@/lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function stubT(
  map: Record<string, string> = {}
): (key: string, params?: Record<string, string | number>) => string {
  return (key, params) => {
    if (map[key]) return map[key];
    if (params && Object.keys(params).length > 0) {
      return `${key}:${JSON.stringify(params)}`;
    }
    return key;
  };
}

function testLabels() {
  const t = stubT({
    "productsPage.copyTranslate": "translate",
    "productsPage.copyRewrite": "rewrite",
    "productsPage.copyOptimize": "optimize",
    "productsPreview.fieldTitle": "title",
    "productsPreview.fieldDescription": "desc",
    "productsPreview.fieldAll": "all",
    "productsPreview.modeLiteral": "literal",
    "productsPreview.modeLiteralShort": "lit-short",
    "productsPreview.modeAmazon": "amazon",
    "productsPreview.durationSeconds": "sec",
    "productsPreview.durationMinutes": "min",
  });
  const labels = createProductsCommandLabels(t);

  assert(
    labels.copyActionLabel("translate", "en") === "translate",
    "copyActionLabel translate"
  );
  assert(labels.copyActionLabel("rewrite") === "rewrite", "copyActionLabel rewrite");
  assert(labels.copyActionLabel("optimize") === "optimize", "copyActionLabel optimize");

  assert(labels.previewFieldLabel("title") === "title", "previewFieldLabel title");
  assert(labels.previewFieldLabel("description") === "desc", "previewFieldLabel desc");
  assert(labels.previewFieldLabel("all") === "all", "previewFieldLabel all");

  assert(labels.previewModeNote("literal") === "literal", "previewModeNote literal");
  assert(labels.previewModeNote("literal", true) === "lit-short", "previewModeNote short");
  assert(labels.previewModeNote("amazon") === "amazon", "previewModeNote amazon");

  assert(labels.previewDurationHint(30) === "sec", "duration under 60s");
  assert(labels.previewDurationHint(90) === "min", "duration minutes branch");
}

async function testPreviewEmptyBatchThrows() {
  const t = stubT({ "productsPreview.errNoProducts": "NO_PRODUCTS" });
  const labels = createProductsCommandLabels(t);
  const gen = createProductsPreviewGenerators({
    t,
    labels,
    sessionShopName: "demo",
  });

  const emptyPlan = {
    draft: { params: { batchProductIds: [] } },
  };

  const batchIntents = [
    "batch_update_product_copy",
    "batch_update_listing_price",
    "batch_draft_products",
    "batch_archive_products",
  ] as const;

  for (const intent of batchIntents) {
    const fn = gen[intent];
    assert(typeof fn === "function", `missing preview generator ${intent}`);
    let threw = false;
    try {
      await fn(emptyPlan, "demo");
    } catch (err) {
      threw = true;
      assert(
        err instanceof Error && err.message === "NO_PRODUCTS",
        `${intent} should throw errNoProducts`
      );
    }
    assert(threw, `${intent} should throw on empty batch`);
  }
}

function testExecutorRegistry() {
  const ctx = minimalRuntime();
  const executors = createProductsCommandExecutors(ctx);
  const expected = [
    "update_listing_price",
    "update_product_copy",
    "batch_update_product_copy",
    "batch_update_listing_price",
    "draft_product",
    "archive_product",
    "batch_draft_products",
    "batch_archive_products",
    "publish_sourcing_item",
  ];
  for (const id of expected) {
    assert(
      typeof executors[id as keyof typeof executors] === "function",
      `executor missing: ${id}`
    );
  }
}

function testApplyLocalProductStatus() {
  const products: ShopMirrorProduct[] = [
    { id: 1, thirdPlatformItemId: "p1", status: "ACTIVE" },
    { id: 2, thirdPlatformItemId: "p2", status: "DRAFT" },
  ];
  const ctx = minimalRuntime({
    setShopProducts: (action) => {
      if (typeof action === "function") {
        const next = action(products);
        products.length = 0;
        products.push(...next);
      }
    },
  });

  applyLocalProductStatus(ctx, "p1", "ARCHIVED");
  assert(products[0]?.status === "ARCHIVED", "p1 should be ARCHIVED");
  assert(products[1]?.status === "DRAFT", "p2 unchanged");
}

function minimalRuntime(
  overrides: Partial<{
    shopName: string;
    products: ShopMirrorProduct[];
    setShopProducts: ProductsCommandRuntime["setShopProducts"];
    toastMessages: string[];
  }> = {}
): ProductsCommandRuntime {
  const toastMessages = overrides.toastMessages ?? [];
  const t = stubT();
  const labels = createProductsCommandLabels(t);
  const edits: Record<string, AiFieldEditRecord> = {};
  const aiFieldEditsRef = { current: edits };

  return {
    shopName: overrides.shopName ?? "demo",
    template: null,
    aiFieldEditsRef,
    setAiFieldEdits: () => {},
    setShopProducts: overrides.setShopProducts ?? (() => {}),
    loadSummary: async () => null,
    bumpMirrorRefresh: () => {},
    showToast: (msg) => {
      toastMessages.push(msg);
    },
    t,
    labels,
    get toastMessages() {
      return toastMessages;
    },
  } as ProductsCommandRuntime & { toastMessages: string[] };
}

async function main() {
  testLabels();
  await testPreviewEmptyBatchThrows();
  testExecutorRegistry();
  testApplyLocalProductStatus();
  console.log("✓ products agent-command tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
