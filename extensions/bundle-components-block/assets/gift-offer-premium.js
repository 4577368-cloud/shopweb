/**
 * Premium free-gift block — progress UI + cart sync when trigger qty meets minQty.
 * Discount Function applies 100% on the gift variant line.
 */
(function () {
  function root() {
    return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
  }

  function qs(sel, el) {
    return (el || document).querySelector(sel);
  }

  async function fetchCart() {
    var res = await fetch(root() + "cart.js", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("cart");
    return res.json();
  }

  function triggerQty(cart, triggerProductId) {
    var tid = String(triggerProductId);
    var n = 0;
    (cart.items || []).forEach(function (item) {
      if (String(item.product_id) === tid) n += item.quantity || 0;
    });
    return n;
  }

  function giftLine(cart, giftVariantId) {
    var vid = String(giftVariantId);
    return (cart.items || []).find(function (item) {
      return String(item.variant_id) === vid && item.properties && item.properties._tb_free_gift;
    });
  }

  async function addGift(giftVariantId, giftQty, triggerProductId) {
    var res = await fetch(root() + "cart/add.js", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            id: Number(giftVariantId),
            quantity: giftQty,
            properties: {
              _tb_free_gift: "1",
              _tb_gift_trigger: String(triggerProductId),
            },
          },
        ],
      }),
    });
    if (!res.ok) throw new Error("add");
    return res.json();
  }

  async function changeQty(lineKey, quantity) {
    var res = await fetch(root() + "cart/change.js", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: lineKey, quantity: quantity }),
    });
    if (!res.ok) throw new Error("change");
    return res.json();
  }

  function setStatus(statusEl, key) {
    if (!statusEl) return;
    var text = statusEl.getAttribute("data-" + key) || statusEl.getAttribute("data-default") || "";
    statusEl.textContent = text;
  }

  function updateProgress(box, tq, minQty, hasGift) {
    var bar = qs("[data-tb-gift-progress-bar]", box);
    var progressText = qs("[data-tb-gift-progress]", box);
    var status = qs("[data-tb-gift-status]", box);
    var btn = qs("[data-tb-gift-sync]", box);
    var pct = Math.min(100, Math.round((tq / Math.max(1, minQty)) * 100));
    if (bar) bar.style.width = pct + "%";

    if (tq < minQty) {
      var need = minQty - tq;
      var needTpl =
        (status && status.getAttribute("data-need-more")) ||
        "Add __COUNT__ more to unlock your gift";
      if (progressText) {
        progressText.textContent = needTpl.replace(/__COUNT__/g, String(need));
      }
      setStatus(status, "locked");
      if (btn) btn.disabled = true;
      return;
    }

    if (progressText) {
      progressText.textContent =
        (status && status.getAttribute("data-ready")) || "Threshold met — claim your gift.";
    }
    if (hasGift) {
      setStatus(status, "added");
      if (btn) btn.disabled = true;
    } else {
      setStatus(status, "ready");
      if (btn) btn.disabled = false;
    }
  }

  async function refreshUi(box) {
    var triggerProductId = box.getAttribute("data-trigger-product-id");
    var minQty = Math.max(1, Number(box.getAttribute("data-min-qty") || 1));
    var giftVariantId = box.getAttribute("data-gift-variant-id");
    if (!triggerProductId || !giftVariantId) return;
    try {
      var cart = await fetchCart();
      var tq = triggerQty(cart, triggerProductId);
      var line = giftLine(cart, giftVariantId);
      updateProgress(box, tq, minQty, !!line);
    } catch (e) {
      /* keep defaults */
    }
  }

  async function syncBox(box, opts) {
    var force = opts && opts.force;
    var triggerProductId = box.getAttribute("data-trigger-product-id");
    var minQty = Math.max(1, Number(box.getAttribute("data-min-qty") || 1));
    var giftVariantId = box.getAttribute("data-gift-variant-id");
    var giftQty = Math.max(1, Number(box.getAttribute("data-gift-qty") || 1));
    var status = qs("[data-tb-gift-status]", box);
    var btn = qs("[data-tb-gift-sync]", box);
    if (!triggerProductId || !giftVariantId) return;

    try {
      var cart = await fetchCart();
      var tq = triggerQty(cart, triggerProductId);
      var line = giftLine(cart, giftVariantId);

      if (tq < minQty) {
        if (line && line.key) {
          await changeQty(line.key, 0);
        }
        updateProgress(box, tq, minQty, false);
        return;
      }

      if (!line) {
        if (!force) {
          updateProgress(box, tq, minQty, false);
          return;
        }
        if (btn) btn.disabled = true;
        await addGift(giftVariantId, giftQty, triggerProductId);
        setStatus(status, "added");
        updateProgress(box, tq, minQty, true);
        document.dispatchEvent(new CustomEvent("tb:gift-synced"));
        return;
      }

      if ((line.quantity || 0) !== giftQty && line.key) {
        await changeQty(line.key, giftQty);
      }
      updateProgress(box, tq, minQty, true);
    } catch (e) {
      setStatus(status, "error");
      if (btn) btn.disabled = false;
    }
  }

  function bind(box) {
    if (box.getAttribute("data-tb-bound") === "1") return;
    box.setAttribute("data-tb-bound", "1");
    var btn = qs("[data-tb-gift-sync]", box);
    if (btn) {
      btn.addEventListener("click", function () {
        syncBox(box, { force: true });
      });
    }
    document.addEventListener("cart:updated", function () {
      refreshUi(box).then(function () {
        syncBox(box, { force: false });
      });
    });
    setTimeout(function () {
      refreshUi(box).then(function () {
        // Auto-remove gift if below threshold; do not auto-add until CTA
        syncBox(box, { force: false });
      });
    }, 400);
  }

  function init() {
    document.querySelectorAll("[data-tb-gift]").forEach(bind);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
