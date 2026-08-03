/**
 * BYOB builder — slot min/max, stepper, pick preview, multi-add to cart.
 * DOM contract: [data-tb-byob], [data-tb-byob-slot], [data-tb-byob-pick][data-variant-id]
 */
(function () {
  function root() {
    return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
  }

  function moneyFormat(el, cents) {
    var format = el.getAttribute("data-money-format") || "${{amount}}";
    var amount = (Math.max(0, Number(cents) || 0) / 100).toFixed(2);
    var withComma = amount.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return format
      .replace(/\{\{\s*amount\s*\}\}/g, withComma)
      .replace(/\{\{\s*amount_no_decimals\s*\}\}/g, String(Math.round(Number(amount))))
      .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/g, withComma.replace(".", ","))
      .replace(/\{\{\s*amount_with_period_separator\s*\}\}/g, withComma);
  }

  function clampQty(input, slotMax) {
    var n = Math.max(0, Number.parseInt(String(input.value || "0"), 10) || 0);
    var max = Math.max(0, slotMax);
    if (n > max) n = max;
    input.value = String(n);
    return n;
  }

  function slotQty(slotEl) {
    var n = 0;
    slotEl.querySelectorAll("[data-tb-byob-pick]").forEach(function (input) {
      n += Math.max(0, Number(input.value || 0));
    });
    return n;
  }

  function collectPicks(el) {
    var picks = [];
    var totalQty = 0;
    var totalCents = 0;
    el.querySelectorAll("[data-tb-byob-pick]").forEach(function (input) {
      var vid = input.getAttribute("data-variant-id");
      var q = Math.max(0, Number(input.value || 0));
      if (!vid || q <= 0) return;
      var title = input.getAttribute("data-title") || "";
      var price = Number(input.getAttribute("data-price") || 0);
      var slotEl = input.closest("[data-tb-byob-slot]");
      var slotTitle = slotEl ? slotEl.getAttribute("data-title") || "" : "";
      picks.push({
        id: Number(vid),
        quantity: q,
        title: title,
        slotTitle: slotTitle,
        price: price,
      });
      totalQty += q;
      totalCents += price * q;
    });
    return { picks: picks, totalQty: totalQty, totalCents: totalCents };
  }

  function updateSummary(el) {
    var status = el.querySelector("[data-tb-byob-status]");
    var picksEl = el.querySelector("[data-tb-byob-picks]");
    var pickedEl = el.querySelector("[data-tb-byob-picked]");
    var priceEl = el.querySelector("[data-tb-byob-price]");
    var btn = el.querySelector("[data-tb-byob-add]");
    var ok = true;
    var messages = [];

    el.querySelectorAll("[data-tb-byob-slot]").forEach(function (slotEl) {
      var min = Math.max(0, Number(slotEl.getAttribute("data-min") || 0));
      var max = Math.max(1, Number(slotEl.getAttribute("data-max") || 1));
      var title = slotEl.getAttribute("data-title") || "Slot";
      var n = slotQty(slotEl);
      var progress = slotEl.querySelector("[data-tb-byob-slot-progress]");
      if (progress) progress.textContent = n + " / " + max;

      slotEl.classList.remove("is-complete", "is-invalid");
      if (n > max || (min > 0 && n < min)) {
        ok = false;
        slotEl.classList.add("is-invalid");
        if (n < min) {
          messages.push(
            (status && status.getAttribute("data-incomplete")) ||
              title + ": need " + min
          );
        } else {
          messages.push(
            (status && status.getAttribute("data-over")) ||
              title + ": max " + max
          );
        }
      } else if (n >= min && (min > 0 || n > 0)) {
        if (min === 0 && n === 0) {
          /* optional empty */
        } else {
          slotEl.classList.add("is-complete");
        }
      }
    });

    var bag = collectPicks(el);
    if (pickedEl) pickedEl.textContent = String(bag.totalQty);
    if (priceEl) priceEl.textContent = moneyFormat(el, bag.totalCents);

    if (picksEl) {
      picksEl.innerHTML = "";
      if (bag.picks.length) {
        picksEl.hidden = false;
        bag.picks.forEach(function (p) {
          var li = document.createElement("li");
          li.className = "tb-byob__pick";
          var label = p.slotTitle ? p.slotTitle + " · " : "";
          li.textContent = label + p.title + " × " + p.quantity;
          picksEl.appendChild(li);
        });
      } else {
        picksEl.hidden = true;
      }
    }

    if (btn) btn.disabled = !ok || bag.totalQty === 0;
    if (status) {
      if (!ok) {
        status.textContent =
          messages[0] ||
          status.getAttribute("data-incomplete") ||
          "Incomplete";
      } else if (bag.totalQty === 0) {
        status.textContent =
          status.getAttribute("data-incomplete") || "Pick items";
      } else {
        status.textContent = status.getAttribute("data-ready") || "Ready";
      }
    }
    return ok && bag.totalQty > 0;
  }

  async function addAll(el) {
    if (!updateSummary(el)) return;
    var bag = collectPicks(el);
    if (!bag.picks.length) return;
    var status = el.querySelector("[data-tb-byob-status]");
    var btn = el.querySelector("[data-tb-byob-add]");
    if (btn) btn.disabled = true;
    try {
      var res = await fetch(root() + "cart/add.js", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: bag.picks.map(function (p) {
            return {
              id: p.id,
              quantity: p.quantity,
              properties: { _tb_byob: "1" },
            };
          }),
        }),
      });
      if (!res.ok) throw new Error("add");
      if (status) {
        status.textContent =
          status.getAttribute("data-added") || "Added to cart";
      }
      window.location.href = root() + "cart";
    } catch (e) {
      if (status) {
        status.textContent =
          status.getAttribute("data-error") || "Could not add bundle";
      }
      if (btn) btn.disabled = false;
    }
  }

  function bindStepper(el, slotEl, input) {
    var max = Math.max(1, Number(slotEl.getAttribute("data-max") || 1));
    var stepper = input.closest("[data-tb-byob-stepper]");
    if (!stepper || stepper.getAttribute("data-tb-bound") === "1") return;
    stepper.setAttribute("data-tb-bound", "1");
    stepper.querySelectorAll("[data-tb-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cur = clampQty(input, max);
        var action = btn.getAttribute("data-tb-action");
        if (action === "increase") input.value = String(Math.min(max, cur + 1));
        if (action === "decrease") input.value = String(Math.max(0, cur - 1));
        updateSummary(el);
      });
    });
    input.addEventListener("change", function () {
      clampQty(input, max);
      // Cap whole slot if over max across items
      var total = slotQty(slotEl);
      if (total > max) {
        var over = total - max;
        var v = Math.max(0, Number(input.value || 0) - over);
        input.value = String(v);
      }
      updateSummary(el);
    });
  }

  function bind(el) {
    if (el.getAttribute("data-tb-bound") === "1") return;
    el.setAttribute("data-tb-bound", "1");
    el.querySelectorAll("[data-tb-byob-slot]").forEach(function (slotEl) {
      slotEl.querySelectorAll("[data-tb-byob-pick]").forEach(function (input) {
        bindStepper(el, slotEl, input);
      });
    });
    updateSummary(el);
    var btn = el.querySelector("[data-tb-byob-add]");
    if (btn) {
      btn.addEventListener("click", function () {
        addAll(el);
      });
    }
  }

  function init() {
    document.querySelectorAll("[data-tb-byob]").forEach(bind);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
