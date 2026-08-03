/**
 * BYOB slot picker — enforce min/max, multi-add to cart.
 */
(function () {
  function root() {
    return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
  }

  function parseBuilder(el) {
    var slots = [];
    el.querySelectorAll("[data-tb-byob-slot]").forEach(function (slotEl) {
      var min = Math.max(0, Number(slotEl.getAttribute("data-min") || 0));
      var max = Math.max(1, Number(slotEl.getAttribute("data-max") || 1));
      var picks = {};
      slotEl.querySelectorAll("[data-tb-byob-pick]").forEach(function (input) {
        var vid = input.getAttribute("data-variant-id");
        if (!vid) return;
        var q = Math.max(0, Number(input.value || 0));
        picks[vid] = q;
        input.addEventListener("change", function () {
          updateSummary(el);
        });
      });
      slots.push({ el: slotEl, min: min, max: max, picks: picks });
    });
    return slots;
  }

  function slotQty(slot) {
    var n = 0;
    slot.el.querySelectorAll("[data-tb-byob-pick]").forEach(function (input) {
      n += Math.max(0, Number(input.value || 0));
    });
    return n;
  }

  function updateSummary(el) {
    var status = el.querySelector("[data-tb-byob-status]");
    var ok = true;
    var messages = [];
    el.querySelectorAll("[data-tb-byob-slot]").forEach(function (slotEl) {
      var min = Math.max(0, Number(slotEl.getAttribute("data-min") || 0));
      var max = Math.max(1, Number(slotEl.getAttribute("data-max") || 1));
      var title = slotEl.getAttribute("data-title") || "Slot";
      var n = 0;
      slotEl.querySelectorAll("[data-tb-byob-pick]").forEach(function (input) {
        n += Math.max(0, Number(input.value || 0));
      });
      if (n < min) {
        ok = false;
        messages.push(title + ": need at least " + min);
      }
      if (n > max) {
        ok = false;
        messages.push(title + ": at most " + max);
      }
    });
    var btn = el.querySelector("[data-tb-byob-add]");
    if (btn) btn.disabled = !ok;
    if (status) {
      status.textContent = ok
        ? status.getAttribute("data-ok") || "Ready to add"
        : messages.join(" · ");
    }
    return ok;
  }

  async function addAll(el) {
    if (!updateSummary(el)) return;
    var items = [];
    el.querySelectorAll("[data-tb-byob-pick]").forEach(function (input) {
      var vid = input.getAttribute("data-variant-id");
      var q = Math.max(0, Number(input.value || 0));
      if (!vid || q <= 0) return;
      items.push({
        id: Number(vid),
        quantity: q,
        properties: { _tb_byob: "1" },
      });
    });
    if (!items.length) return;
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
        body: JSON.stringify({ items: items }),
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
          status.getAttribute("data-err") || "Could not add bundle";
      }
      if (btn) btn.disabled = false;
    }
  }

  function bind(el) {
    if (el.getAttribute("data-tb-bound") === "1") return;
    el.setAttribute("data-tb-bound", "1");
    parseBuilder(el);
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
