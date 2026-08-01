/**
 * Dashboard (home) page logic
 * Fetches shop info and renders store details + stats using Polaris Web Components.
 */

(function () {
  "use strict";

  // ── Load shop data on page ready ────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    if (typeof apiFetch !== "function") {
      var loading = document.getElementById("shop-loading");
      if (loading) {
        loading.innerHTML =
          '<s-banner tone="critical"><s-text><s-text fontWeight="semibold">App failed to initialize</s-text> Core scripts did not load. Please refresh the page.</s-text></s-banner>';
      }
      return;
    }
    loadDashboard();
  });

  async function loadDashboard() {
    var loading = document.getElementById("shop-loading");
    var content = document.getElementById("shop-info-content");

    try {
      var data = await apiFetch("/api/shop");
      var shop = data.shop || data;

      // Render store info
      renderShopInfo(content, shop);

      // Hide loading, show content
      if (loading) loading.style.display = "none";
      content.style.display = "";

      // Update stats
      updateStats(shop);
    } catch (err) {
      if (loading) {
        loading.innerHTML =
          '<s-banner tone="critical">' +
          "<s-text>" +
          "<s-text fontWeight=\"semibold\">Could not load store information</s-text> " +
          escapeHtml(err.message) +
          "</s-text></s-banner>";
      }
    }
  }

  // ── Render shop info list ───────────────────────────────────────
  function renderShopInfo(container, shop) {
    var fields = [
      { label: "Store name", value: shop.name || "--" },
      { label: "Domain", value: (shop.primaryDomain && shop.primaryDomain.host) || shop.myshopifyDomain || "--" },
      { label: "Email", value: shop.email || "--" },
      { label: "Plan", value: (shop.plan && shop.plan.displayName) || "--" },
      { label: "Country", value: (shop.billingAddress && shop.billingAddress.country) || "--" },
      { label: "Currency", value: shop.currencyCode || "--" },
      { label: "Shopify domain", value: shop.myshopifyDomain || "--" },
    ];

    var html = '<s-box border="base" borderRadius="base" padding="base">';
    html += '<s-stack gap="small-200">';
    for (var i = 0; i < fields.length; i++) {
      html +=
        '<s-grid gridTemplateColumns="1fr 1fr" gap="small-200">' +
        '<s-text color="subdued">' + escapeHtml(fields[i].label) + "</s-text>" +
        "<s-text>" + escapeHtml(String(fields[i].value)) + "</s-text>" +
        "</s-grid>";
    }
    html += "</s-stack></s-box>";

    container.innerHTML = html;
  }

  // ── Update stat cards ──────────────────────────────────────────
  function updateStats(shop) {
    var productsEl = document.getElementById("stat-products");
    var planEl = document.getElementById("stat-plan");

    if (productsEl) {
      var count = shop.productCount && shop.productCount.count;
      productsEl.textContent = count !== undefined && count !== null ? String(count) : "--";
    }

    if (planEl) {
      planEl.textContent = (shop.plan && shop.plan.displayName) || "--";
    }
  }

  // ── Quick action: test API ──────────────────────────────────────
  window.testApiConnection = async function () {
    try {
      await apiFetch("/api/shop");
      showToast("API connection successful!");
    } catch (err) {
      showToast("API error: " + err.message, true);
    }
  };
})();
