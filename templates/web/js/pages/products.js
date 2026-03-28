/**
 * Products page logic
 * Search, display product cards, show detail modal, resource picker demo.
 */

(function () {
  "use strict";

  var searchInput = null;
  var container = null;
  var resultsCount = null;

  // ── Init ────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    searchInput = document.getElementById("search-input");
    container = document.getElementById("products-container");
    resultsCount = document.getElementById("results-count");

    if (searchInput) {
      searchInput.addEventListener("input", debounce(handleSearch, 400));

      // Search on Enter key
      searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleSearch();
        }
      });
    }
  });

  // ── Search products ─────────────────────────────────────────────
  async function handleSearch() {
    var query = searchInput.value.trim();

    if (!query) {
      container.innerHTML =
        '<div class="card">' +
        '<div class="empty-state">' +
        '<div class="empty-state-icon">&#128722;</div>' +
        "<h3>Search for products</h3>" +
        "<p>Enter a search term above to find products in your store, or use the Resource Picker to browse.</p>" +
        '<button class="btn btn-primary" onclick="document.getElementById(\'search-input\').focus()">Start searching</button>' +
        "</div></div>";
      if (resultsCount) resultsCount.textContent = "";
      return;
    }

    // Show loading skeleton
    container.innerHTML = renderSkeletonGrid();

    try {
      var data = await apiFetch("/api/products/search?q=" + encodeURIComponent(query));
      var products = data.products || [];

      if (resultsCount) {
        resultsCount.textContent = products.length + " product" + (products.length !== 1 ? "s" : "") + " found";
      }

      if (products.length === 0) {
        container.innerHTML =
          '<div class="card">' +
          '<div class="empty-state">' +
          '<div class="empty-state-icon">&#128270;</div>' +
          "<h3>No products found</h3>" +
          '<p>No products match "' + escapeHtml(query) + '". Try a different search term.</p>' +
          "</div></div>";
        return;
      }

      renderProductGrid(products);
    } catch (err) {
      container.innerHTML =
        '<div class="banner banner-critical">' +
        '<div class="banner-icon">&#9888;</div>' +
        '<div class="banner-content">' +
        "<p><strong>Search failed</strong></p>" +
        "<p>" + escapeHtml(err.message) + "</p>" +
        "</div></div>";
      if (resultsCount) resultsCount.textContent = "";
    }
  }

  // ── Render product grid ─────────────────────────────────────────
  function renderProductGrid(products) {
    var html = '<div class="product-grid">';

    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      var image = getProductImage(p);
      var price = getProductPrice(p);
      var status = getProductStatus(p);
      var vendor = p.vendor || "";
      var productId = extractId(p.id || p.admin_graphql_api_id || "");

      html +=
        '<div class="product-card" onclick="showProductDetail(\'' + escapeAttr(productId) + '\')">' +
        '<div class="product-card-image">' +
        (image
          ? '<img src="' + escapeAttr(image) + '" alt="' + escapeAttr(p.title || "") + '" loading="lazy">'
          : '<span>No image</span>') +
        "</div>" +
        '<div class="product-card-body">' +
        '<div class="product-card-title">' + escapeHtml(p.title || "Untitled") + "</div>" +
        (vendor ? '<div class="product-card-vendor">' + escapeHtml(vendor) + "</div>" : "") +
        '<div class="product-card-meta">' +
        '<span class="product-card-price">' + escapeHtml(price) + "</span>" +
        '<span class="badge ' + status.badgeClass + '">' + escapeHtml(status.label) + "</span>" +
        "</div></div></div>";
    }

    html += "</div>";
    container.innerHTML = html;
  }

  // ── Skeleton loading ────────────────────────────────────────────
  function renderSkeletonGrid() {
    var html = '<div class="product-grid">';
    for (var i = 0; i < 6; i++) {
      html +=
        '<div class="product-card">' +
        '<div class="skeleton skeleton-image"></div>' +
        '<div class="product-card-body">' +
        '<div class="skeleton skeleton-heading" style="width:80%;"></div>' +
        '<div class="skeleton skeleton-text" style="width:50%;"></div>' +
        '<div class="skeleton skeleton-text" style="width:60%;"></div>' +
        "</div></div>";
    }
    html += "</div>";
    return html;
  }

  // ── Show product detail in modal ────────────────────────────────
  window.showProductDetail = async function (productId) {
    var modal = document.getElementById("product-detail-modal");
    var content = document.getElementById("product-detail-content");

    content.innerHTML =
      '<div class="loading-state">' +
      '<div class="spinner"></div>' +
      "<p>Loading product details...</p>" +
      "</div>";

    modal.show();

    try {
      var data = await apiFetch("/api/products/" + encodeURIComponent(productId));
      var p = data.product || data;
      renderProductDetail(content, p);
    } catch (err) {
      content.innerHTML =
        '<div class="banner banner-critical">' +
        '<div class="banner-icon">&#9888;</div>' +
        '<div class="banner-content">' +
        "<p><strong>Could not load product</strong></p>" +
        "<p>" + escapeHtml(err.message) + "</p>" +
        "</div></div>";
    }
  };

  function renderProductDetail(container, p) {
    var image = getProductImage(p);
    var status = getProductStatus(p);
    // GraphQL returns variants as { edges: [{ node: {...} }] }
    var variants = [];
    if (p.variants && p.variants.edges) {
      for (var vi = 0; vi < p.variants.edges.length; vi++) {
        variants.push(p.variants.edges[vi].node);
      }
    } else if (Array.isArray(p.variants)) {
      variants = p.variants;
    }

    var html =
      '<div style="display:grid; grid-template-columns: 200px 1fr; gap: 20px; align-items: start;">';

    // Image
    html += '<div>';
    if (image) {
      html += '<img src="' + escapeAttr(image) + '" alt="' + escapeAttr(p.title || "") + '" style="width:100%; border-radius: 8px; border: 1px solid var(--p-color-border);">';
    } else {
      html += '<div style="width:100%; aspect-ratio:1; background: var(--p-color-bg); border-radius: 8px; display:flex; align-items:center; justify-content:center; color: var(--p-color-text-disabled); border: 1px solid var(--p-color-border);">No image</div>';
    }
    html += "</div>";

    // Info
    html += "<div>";
    html += '<h3 style="font-size: 18px; margin-bottom: 12px;">' + escapeHtml(p.title || "Untitled") + "</h3>";

    html += '<ul class="info-list">';
    html += infoRow("Status", '<span class="badge ' + status.badgeClass + '">' + escapeHtml(status.label) + "</span>");
    if (p.vendor) html += infoRow("Vendor", escapeHtml(p.vendor));
    // GraphQL uses productType (camelCase)
    if (p.productType) html += infoRow("Type", escapeHtml(p.productType));
    html += infoRow("Price", escapeHtml(getProductPrice(p)));
    if (p.totalInventory !== undefined) html += infoRow("Total inventory", String(p.totalInventory));
    html += "</ul>";
    html += "</div></div>";

    // Description — GraphQL uses "description" not "body_html"
    var desc = p.description || p.body_html || "";
    if (desc) {
      html += "<hr class='divider'>";
      html += '<h3 class="mb-2">Description</h3>';
      html += '<div class="text-secondary">' + escapeHtml(desc) + "</div>";
    }

    // Variants table
    if (variants.length > 0) {
      html += "<hr class='divider'>";
      html += '<h3 class="mb-3">Variants (' + variants.length + ")</h3>";
      html += '<div class="table-container"><table>';
      html += "<thead><tr><th>Title</th><th>Price</th><th>SKU</th><th>Inventory</th></tr></thead><tbody>";
      for (var i = 0; i < variants.length; i++) {
        var v = variants[i];
        html += "<tr>";
        html += "<td>" + escapeHtml(v.title || "--") + "</td>";
        html += "<td>" + escapeHtml(v.price ? formatCurrency(v.price) : "--") + "</td>";
        html += "<td><code>" + escapeHtml(v.sku || "--") + "</code></td>";
        // GraphQL uses inventoryQuantity (camelCase)
        html += "<td>" + (v.inventoryQuantity !== undefined ? v.inventoryQuantity : (v.inventory_quantity !== undefined ? v.inventory_quantity : "--")) + "</td>";
        html += "</tr>";
      }
      html += "</tbody></table></div>";
    }

    container.innerHTML = html;
  }

  function infoRow(label, valueHtml) {
    return "<li>" +
      '<span class="info-list-label">' + escapeHtml(label) + "</span>" +
      '<span class="info-list-value">' + valueHtml + "</span>" +
      "</li>";
  }

  // ── Resource Picker ─────────────────────────────────────────────
  window.openResourcePicker = async function () {
    if (!window.shopify || !window.shopify.resourcePicker) {
      showToast("Resource Picker is only available in the embedded Shopify admin.", true);
      return;
    }

    try {
      var selected = await shopify.resourcePicker({ type: "product" });

      if (!selected || selected.length === 0) {
        return; // User cancelled
      }

      // Show result in modal
      var modal = document.getElementById("picker-result-modal");
      var content = document.getElementById("picker-result-content");

      var html = '<p class="text-secondary mb-3">You selected ' + selected.length + " product(s):</p>";
      html += '<ul class="info-list">';
      for (var i = 0; i < selected.length; i++) {
        var item = selected[i];
        html += "<li>";
        html += '<span class="font-semibold">' + escapeHtml(item.title || "Untitled") + "</span>";
        html += '<span class="badge badge-info">Selected</span>';
        html += "</li>";
      }
      html += "</ul>";
      html += '<p class="text-secondary text-sm mt-4">Resource Picker returns product data you can use in your app logic.</p>';

      content.innerHTML = html;
      modal.show();
    } catch (err) {
      showToast("Resource Picker error: " + err.message, true);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────
  function getProductImage(product) {
    if (product.image && product.image.src) return product.image.src;
    if (product.images && product.images.length > 0) {
      return product.images[0].src || product.images[0];
    }
    if (product.featuredImage && product.featuredImage.url) return product.featuredImage.url;
    return null;
  }

  function getProductPrice(product) {
    if (product.variants && product.variants.length > 0) {
      var price = product.variants[0].price;
      if (price) return formatCurrency(price);
    }
    if (product.priceRangeV2) {
      var min = product.priceRangeV2.minVariantPrice;
      if (min) return formatCurrency(min.amount, min.currencyCode);
    }
    return "--";
  }

  function getProductStatus(product) {
    var status = (product.status || "").toLowerCase();
    if (status === "active") return { label: "Active", badgeClass: "badge-success" };
    if (status === "draft") return { label: "Draft", badgeClass: "badge-default" };
    if (status === "archived") return { label: "Archived", badgeClass: "badge-warning" };
    return { label: status || "Active", badgeClass: "badge-success" };
  }

  function extractId(gid) {
    // Extract numeric ID from GID like "gid://shopify/Product/123"
    if (!gid) return "";
    var parts = String(gid).split("/");
    return parts[parts.length - 1] || gid;
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
})();
