import {
  sourcingDisplayPrice,
  sourcingProcurementDisplay,
} from "@/lib/sourcing/display-pricing";

const tpl = {
  exchangeRate: 7,
  targetCurrency: "USD",
  sourceCurrency: "CNY",
  multiplier: 2,
  addend: 0,
  roundingStrategy: "none",
  decimals: 2,
  isDefault: true,
};

const base = sourcingProcurementDisplay(70, tpl);
assert(base === 10, `procurement expected 10 got ${base}`);

const tangbuy = sourcingDisplayPrice(70, tpl, 1);
assert(tangbuy === 10, `tangbuy display expected 10 got ${tangbuy}`);

const ali = sourcingDisplayPrice(70, tpl, 1.2);
assert(ali === 12, `1688 display expected 12 got ${ali}`);

console.log("✓ display-pricing cases passed");

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
