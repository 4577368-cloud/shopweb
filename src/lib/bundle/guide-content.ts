/**
 * Merchant-facing Bundle Hub tutorials (step / scene / Shopify checklist).
 * Written for operators — not engineers.
 */

export type BundleGuideId =
  | "hub"
  | "pick"
  | "fixed"
  | "mix"
  | "byob"
  | "offer"
  | "combo"
  | "gift";

export type BundleGuideDoc = {
  title: string;
  how: string[];
  scenes: string[];
  shopify: string[];
};

const zh: Record<BundleGuideId, BundleGuideDoc> = {
  hub: {
    title: "套装与组合 · 怎么用",
    how: [
      "从商品列表点「套装与组合」，或在某件商品上点「套装 / 管理套装」进入本面板。",
      "先想清楚顾客怎么买：整套打包卖、池子里任选满件、单品满件优惠/赠品，还是让顾客自己搭礼盒。",
      "点「新建活动」选玩法 → 按向导填规则与商品 → 保存（自组礼盒记得发布）。",
      "保存成功只代表 60s 里规则写好了；店面要真正生效，还需按各玩法完成 Shopify 后台步骤（见下方）。",
    ],
    scenes: [
      "洗发护发一起卖 → 用「固定套装」做成一个可下单的套装商品。",
      "T 恤任选 3 件 99 元 → 用「任选 N 件」一口价。",
      "同一件衣服买 2 件打 9 折，或买满送小样 → 用「单品玩法」。",
      "「选 1 个杯子 + 最多 3 个配件」自选礼盒 → 用「自组礼盒」。",
    ],
    shopify: [
      "一次性：Shopify 后台 → 折扣 → 创建折扣 → App 折扣 →「Tangbuy Bundle Discount」→ 选自动折扣，并勾选商品折扣 → 启用。没这一步，满减/一口价/赠品免单都不会在结账出现。",
      "主题编辑器：在需要的商品模板上添加对应主题区块（固定套装组成 / 满件赠品 / 自组礼盒）。",
      "若 App 或折扣功能刚更新过，需由运营执行一次应用部署后，主题区块与折扣才会到你的店铺。",
    ],
  },
  pick: {
    title: "选玩法 · 怎么选",
    how: [
      "固定套装：多件不同商品绑成「一个新商品」卖，顾客购物车里是一件套装。",
      "任选 N 件：划定一池商品，顾客随便搭配，凑满件数享折扣或一口价；结账仍是多件商品。",
      "单品玩法：规则挂在某一件商品上——件数折扣、两规格组合，或满件送赠品。",
      "自组礼盒：按「槽位」让顾客自选（例如主品 1 + 配件最多 3），结账多行，不新建套装父商品。",
    ],
    scenes: [
      "想做一个独立上架、可单独搜到的套装 SKU → 固定套装。",
      "想做「满 3 件打折 / 满件一口价」跨商品活动 → 任选 N 件。",
      "只想在当前商品详情页做满件优惠或赠品 → 单品玩法。",
      "想做 DIY 礼盒、选配感强 → 自组礼盒。",
    ],
    shopify: [
      "四种玩法保存后，都依赖「自动 App 折扣」才能在结账改价/免赠品（固定套装若只改标价、折扣为 0，可不依赖折扣功能）。",
      "赠品、自组礼盒还必须在主题里挂对应区块，顾客才能看见并操作。",
    ],
  },
  fixed: {
    title: "固定套装 · 配置步骤",
    how: [
      "确认参与套装的商品都已完成货源关联（否则采购对不上）。",
      "填写顾客看到的套装标题与售价；可用 AI 根据组件一键起名。",
      "勾选组件商品、选好规格与数量；需要时设置结账折扣百分比。",
      "点创建/保存，系统会在 Shopify 新建一个「套装主商品」，顾客买的是这个新商品。",
    ],
    scenes: [
      "旅行装：洗护小样 + 梳子固定打包。",
      "节日礼盒：主品 + 固定配件，不让顾客改搭配。",
      "引流套装：标价稍高、结账再减一档，突出「套装更划算」。",
    ],
    shopify: [
      "创建成功后，到 Shopify 商品列表确认新套装商品已出现，检查标题、图片、价格。",
      "若设置了套装折扣%：确认后台已启用 Tangbuy 自动 App 折扣（商品折扣类）。",
      "建议在商品详情主题中加入「套装组成」区块，让顾客看清套装内含什么。",
      "库存由组件联动，一般无需给套装父商品单独备库存。",
    ],
  },
  mix: {
    title: "任选 N 件 · 配置步骤",
    how: [
      "起一个活动标题（店内运营识别用；可用 AI 起名）。",
      "设定「满几件」生效，再选计价：折扣百分比，或满件合计一口价。",
      "在可选池勾选参与活动的商品（必须已关联货源）。",
      "保存后，顾客把池内商品凑满件数，结账自动按规则优惠。",
    ],
    scenes: [
      "同系列 T 恤 / 袜子：任选 3 件 99 元。",
      "配饰池：满 2 件减 15%。",
      "清仓混搭：多品池一口价促连带。",
    ],
    shopify: [
      "必须启用 Tangbuy 自动 App 折扣（商品折扣），否则结账无减免。",
      "一口价与折扣%都走同一折扣应用，无需再手工建优惠码。",
      "顾客结账仍是多行商品——这是正常的，采购也按行处理。",
      "无需新建父商品；一般也不必加主题区块（规则在结账生效）。",
    ],
  },
  byob: {
    title: "自组礼盒 · 配置步骤",
    how: [
      "填写活动标题；为每个槽位起顾客能看懂的名字（如「选杯子」「加配件」）。",
      "设每个槽位最少/最多选几件，并勾选该槽位可选商品（需已关联货源）。",
      "先「保存草稿」自查；确认无误后点「发布到店面」（仅发布状态会展示）。",
      "不会新建 Shopify 父商品；顾客选完后购物车是多件商品。",
    ],
    scenes: [
      "定制水杯：选杯身 1 + 贴图最多 2。",
      "护肤体验盒：精华必选 1 + 小样最多 3。",
      "节日自选礼：主礼 1 + 贺卡/包装可选。",
    ],
    shopify: [
      "主题编辑器 → 打开参与活动的商品模板 → 添加「60s · 自组礼盒」区块。",
      "确认活动状态为「进行中 / 已发布」，草稿不会在店面出现。",
      "若槽位商品有额外折扣需求，仍需启用 Tangbuy 自动 App 折扣。",
      "用手机预览：能否看到槽位、加减数量、加入购物车。",
    ],
  },
  offer: {
    title: "单品玩法 · 怎么选",
    how: [
      "规则只挂在当前这件商品上，不会新建套装父商品。",
      "件数 / 规格组合：买多打折，或指定两个规格一起买打折。",
      "满件赠品：买满触发件数，送另一件已关联的赠品。",
    ],
    scenes: [
      "同款内衣买 2 件减 10%。",
      "上衣 + 裤子两个规格组合优惠。",
      "买正装满 2 送旅行装小样。",
    ],
    shopify: [
      "结账优惠依赖 Tangbuy 自动 App 折扣。",
      "赠品玩法还需在触发商品模板添加「60s · 满件赠品」区块，否则顾客难以把赠品加进购物车。",
    ],
  },
  combo: {
    title: "件数 / 规格组合 · 配置步骤",
    how: [
      "选择类型：按件数优惠，或按「两个规格」组合优惠。",
      "填写门槛与折扣比例；可选填展示用标签（可用 AI 起名）。",
      "保存后规则写在当前商品上，结账自动减免。",
    ],
    scenes: [
      "买 2 件打 9 折促复购。",
      "套装感：指定色号 A + 色号 B 组合减价。",
    ],
    shopify: [
      "启用 Tangbuy 自动 App 折扣（商品折扣）。",
      "在商品详情页用购物车测一下：数量/规格满足后结账是否出现减免。",
      "无需新建商品，也无需单独主题区块。",
    ],
  },
  gift: {
    title: "满件赠品 · 配置步骤",
    how: [
      "确认触发商品与赠品都已关联货源。",
      "设满几件触发、选赠品及规格、赠送数量；可填店面展示标题（可用 AI）。",
      "保存后，顾客在详情页看到赠品模块；达件数后领取/同步赠品进购物车，结账赠品免单。",
    ],
    scenes: [
      "买面霜满 2 送同系列小样。",
      "买咖啡豆满 1 送滤纸。",
      "大促：主品满件送周边。",
    ],
    shopify: [
      "主题编辑器 → 触发商品模板 → 添加「60s · 满件赠品」区块（必做）。",
      "启用 Tangbuy 自动 App 折扣，否则赠品行不会免单。",
      "赠品建议设为可售、有库存；价格会在结账被折到 0。",
      "若旧规则没有图片标题，请在 60s 重新保存一次赠品规则以刷新展示信息。",
    ],
  },
};

const en: Record<BundleGuideId, BundleGuideDoc> = {
  hub: {
    title: "Bundles & combos · How to use",
    how: [
      "Open from the product list (Bundles & combos) or from a product card (Bundle / Manage).",
      "Decide how shoppers buy: fixed kit, pick-any pool, single-product offer/gift, or DIY box.",
      "Create → choose a play → fill rules & products → save (publish BYOB when ready).",
      "Saving in 60s writes the rule; storefront checkout still needs the Shopify steps below.",
    ],
    scenes: [
      "Hair care duo → Fixed kit as one sellable product.",
      "Any 3 tees for $99 → Mix & match flat price.",
      "Buy 2 for 10% off, or gift with purchase → Product offer.",
      "Pick 1 mug + up to 3 add-ons → Build-your-own.",
    ],
    shopify: [
      "One-time: Shopify Admin → Discounts → Create → App discount → Tangbuy Bundle Discount → Automatic, Product class → Activate. Without this, % / flat / free-gift discounts won’t apply.",
      "Theme editor: add the matching theme block on product templates (kit components / free gift / BYOB).",
      "After app updates, ops must deploy so blocks & the discount function reach your shop.",
    ],
  },
  pick: {
    title: "Choose a play",
    how: [
      "Fixed kit: multiple products become one new sellable parent.",
      "Mix & match: shoppers pick from a pool to hit a qty for % or flat price; cart stays multi-line.",
      "Product offer: rules on one product — qty/variant discount or free gift.",
      "BYOB: slot-based picking; multi-line checkout; no new parent SKU.",
    ],
    scenes: [
      "Need a searchable kit product → Fixed kit.",
      "Cross-product “any 3” promo → Mix.",
      "Only on this PDP → Product offer.",
      "DIY gift box → BYOB.",
    ],
    shopify: [
      "Most plays need the automatic Tangbuy app discount at checkout (fixed kit with 0% discount may not).",
      "Gift & BYOB also need their theme blocks installed.",
    ],
  },
  fixed: {
    title: "Fixed kit · Steps",
    how: [
      "Link sources for every component first.",
      "Name the kit (AI can draft from components) and set list price.",
      "Pick components, variants, qty; optional checkout % off.",
      "Save creates a new Shopify parent product shoppers buy.",
    ],
    scenes: [
      "Travel set, holiday fixed gift box, kit with a checkout markdown.",
    ],
    shopify: [
      "Confirm the new kit product in Shopify Admin.",
      "If discount % > 0, activate Tangbuy automatic app discount.",
      "Add the kit components theme block on the PDP for clarity.",
      "Inventory tracks components — usually no separate kit stock.",
    ],
  },
  mix: {
    title: "Mix & match · Steps",
    how: [
      "Name the campaign; set min qty; choose % or flat price.",
      "Select pool products (must be source-linked).",
      "Save — cart lines from the pool get the deal when qty is met.",
    ],
    scenes: [
      "Any 3 for $99, accessories 15% off 2+, clearance mix pools.",
    ],
    shopify: [
      "Activate Tangbuy automatic Product app discount.",
      "No parent product or theme block required for pricing.",
      "Multi-line carts are expected.",
    ],
  },
  byob: {
    title: "Build-your-own · Steps",
    how: [
      "Name the campaign and each customer-facing slot.",
      "Set min/max per slot and pool products (source-linked).",
      "Save draft, then Publish — only published shows on storefront.",
      "No new parent SKU; cart is multi-line.",
    ],
    scenes: [
      "Custom mug + stickers, skincare sampler, holiday DIY gift.",
    ],
    shopify: [
      "Theme editor → product template → add 60s Build-your-own block.",
      "Status must be Active/Published.",
      "Preview on mobile that slots and add-to-cart work.",
    ],
  },
  offer: {
    title: "Product offer · Choose",
    how: [
      "Rules attach to this product only.",
      "Combo: qty or two-variant discount.",
      "Gift: hit qty → free linked gift product.",
    ],
    scenes: [
      "Buy 2 save 10%, top+bottom variant pair, GWP sample.",
    ],
    shopify: [
      "Activate Tangbuy automatic app discount.",
      "Gifts also need the Free gift theme block on the trigger PDP.",
    ],
  },
  combo: {
    title: "Qty / variant combo · Steps",
    how: [
      "Pick qty discount or variant-pair discount.",
      "Set thresholds & %; optional label (AI can name).",
      "Save to the product metafield — checkout applies it.",
    ],
    scenes: [
      "Buy 2 get 10% off; color A + B pair deal.",
    ],
    shopify: [
      "Activate Tangbuy automatic Product app discount.",
      "Test on the PDP cart; no new product or theme block needed.",
    ],
  },
  gift: {
    title: "Free gift · Steps",
    how: [
      "Trigger and gift products must be source-linked.",
      "Set min qty, gift variant & qty; optional storefront label (AI).",
      "Shoppers use the gift module on the PDP; checkout makes the gift free.",
    ],
    scenes: [
      "Buy 2 creams get a sample; coffee + filters; promo GWP.",
    ],
    shopify: [
      "Theme editor → trigger PDP → add 60s Free gift block (required).",
      "Activate Tangbuy automatic app discount or the gift won’t be $0.",
      "Keep the gift sellable/in stock; re-save old rules to refresh images/titles.",
    ],
  },
};

export function getBundleGuide(
  id: BundleGuideId,
  locale: string
): BundleGuideDoc {
  const pack = locale.startsWith("zh") ? zh : en;
  return pack[id] ?? en[id];
}
