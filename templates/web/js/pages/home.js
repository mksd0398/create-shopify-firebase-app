/**
 * Dashboard (home) page logic
 * Fetches shop info and renders store details + stats.
 */

(function () {
  "use strict";

  // ── Load shop data on page ready ────────────────────────────────
  document.addEventListener("DOMContentLoaded", loadDashboard);

  async function loadDashboard() {
    var container = document.getElementById("shop-info-content");
    var statusBadge = document.getElementById("shop-status");

    try {
      var data = await apiFetch("/api/shop");
      var shop = data.shop || data;

      // Render store info
      renderShopInfo(container, shop);

      // Show connected badge
      if (statusBadge) statusBadge.style.display = "";

      // Update stats
      updateStats(shop);
    } catch (err) {
      container.innerHTML =
        '<div class="banner banner-critical">' +
        '<div class="banner-icon">&#9888;</div>' +
        '<div class="banner-content">' +
        "<p><strong>Could not load store information</strong></p>" +
        "<p>" + escapeHtml(err.message) + "</p>" +
        "</div></div>";
    }
  }

  // ── Render shop info list ───────────────────────────────────────
  // The /api/shop endpoint returns GraphQL field names (camelCase).
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

    var html = '<ul class="info-list">';
    for (var i = 0; i < fields.length; i++) {
      html +=
        "<li>" +
        '<span class="info-list-label">' + escapeHtml(fields[i].label) + "</span>" +
        '<span class="info-list-value">' + escapeHtml(String(fields[i].value)) + "</span>" +
        "</li>";
    }
    html += "</ul>";

    container.innerHTML = html;
  }

  // ── Update stat cards ──────────────────────────────────────────
  function updateStats(shop) {
    var productsEl = document.getElementById("stat-products");
    var planEl = document.getElementById("stat-plan");

    if (productsEl) {
      // GraphQL returns productCount: { count } via alias
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
