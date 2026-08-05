/**
 * Sync free-gift line into cart when trigger qty meets minQty.
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
    const res = await fetch(root() + "cart.js", {
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

  async function syncBox(box) {
    var triggerProductId = box.getAttribute("data-trigger-product-id");
    var minQty = Math.max(1, Number(box.getAttribute("data-min-qty") || 1));
    var giftVariantId = box.getAttribute("data-gift-variant-id");
    var giftQty = Math.max(1, Number(box.getAttribute("data-gift-qty") || 1));
    var status = qs("[data-tb-gift-status]", box);
    if (!triggerProductId || !giftVariantId) return;

    try {
      var cart = await fetchCart();
      var tq = triggerQty(cart, triggerProductId);
      var line = giftLine(cart, giftVariantId);

      if (tq < minQty) {
        if (line && line.key) {
          await changeQty(line.key, 0);
          if (status) {
            status.hidden = false;
            status.textContent = status.getAttribute("data-msg-removed") || "Gift removed (qty below threshold).";
          }
        }
        return;
      }

      if (!line) {
        await addGift(giftVariantId, giftQty, triggerProductId);
        if (status) {
          status.hidden = false;
          status.textContent = status.getAttribute("data-msg-added") || "Free gift added to cart.";
        }
        document.dispatchEvent(new CustomEvent("tb:gift-synced"));
        return;
      }

      if ((line.quantity || 0) !== giftQty && line.key) {
        await changeQty(line.key, giftQty);
      }
      if (status) {
        status.hidden = false;
        status.textContent = status.getAttribute("data-msg-ok") || "Free gift is in your cart.";
      }
    } catch (e) {
      if (status) {
        status.hidden = false;
        status.textContent = status.getAttribute("data-msg-err") || "Could not sync free gift.";
      }
    }
  }

  function bind(box) {
    if (box.getAttribute("data-tb-bound") === "1") return;
    box.setAttribute("data-tb-bound", "1");
    var btn = qs("[data-tb-gift-sync]", box);
    if (btn) {
      btn.addEventListener("click", function () {
        syncBox(box);
      });
    }
    // After theme ATC, re-sync shortly
    document.addEventListener("cart:updated", function () {
      syncBox(box);
    });
    setTimeout(function () {
      syncBox(box);
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
