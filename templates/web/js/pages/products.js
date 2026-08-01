/**
 * Products page logic
 * Search, display product cards, show detail modal, resource picker demo.
 * Uses Polaris Web Components for all UI rendering.
 */

(function () {
  "use strict";

  var searchInput = null;
  var container = null;
  var resultsCount = null;
  var resultsSection = null;

  // ── Init ────────────────────────────────────────────────────────
  // Show the count card only when there is a count. An empty <s-section>
  // still renders as a padded card, which reads as a stray blank box.
  function setResultsCount(text) {
    if (resultsCount) resultsCount.textContent = text || "";
    if (resultsSection) resultsSection.style.display = text ? "" : "none";
  }

  document.addEventListener("DOMContentLoaded", function () {
    searchInput = document.getElementById("search-input");
    container = document.getElementById("products-container");
    resultsCount = document.getElementById("results-count");
    resultsSection = document.getElementById("results-section");

    if (searchInput) {
      var debouncedSearch = debounce(handleSearch, 400);
      searchInput.addEventListener("input", debouncedSearch);
      searchInput.addEventListener("change", debouncedSearch);

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
        '<s-box padding="large-1200" border="base" borderRadius="base">' +
        '<s-stack alignItems="center" gap="base">' +
        '<s-text variant="headingMd">Search for products</s-text>' +
        '<s-text color="subdued">Enter a search term above to find products in your store, or use the Resource Picker to browse.</s-text>' +
        '<s-button variant="primary" onclick="document.getElementById(\'search-input\').focus()">Start searching</s-button>' +
        "</s-stack></s-box>";
      setResultsCount("");
      return;
    }

    // Show loading
    container.innerHTML =
      '<s-box padding="large-400">' +
      '<s-stack alignItems="center" gap="base">' +
      "<s-spinner></s-spinner>" +
      '<s-text color="subdued">Searching...</s-text>' +
      "</s-stack></s-box>";

    try {
      var data = await apiFetch("/api/products/search?q=" + encodeURIComponent(query));
      var products = data.products || [];

      {
        setResultsCount(products.length + " product" + (products.length !== 1 ? "s" : "") + " found");
      }

      if (products.length === 0) {
        container.innerHTML =
          '<s-box padding="large-1200" border="base" borderRadius="base">' +
          '<s-stack alignItems="center" gap="base">' +
          '<s-text variant="headingMd">No products found</s-text>' +
          '<s-text color="subdued">No products match "' + escapeHtml(query) + '". Try a different search term.</s-text>' +
          "</s-stack></s-box>";
        return;
      }

      renderProductGrid(products);
    } catch (err) {
      container.innerHTML =
        '<s-banner tone="critical">' +
        "<s-text>" +
        "<s-text fontWeight=\"semibold\">Search failed</s-text> " +
        escapeHtml(err.message) +
        "</s-text></s-banner>";
      setResultsCount("");
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
          : '<s-text color="subdued">No image</s-text>') +
        "</div>" +
        '<div class="product-card-body">' +
        '<s-text fontWeight="semibold">' + escapeHtml(p.title || "Untitled") + "</s-text>" +
        (vendor ? '<s-text color="subdued" variant="bodySm">' + escapeHtml(vendor) + "</s-text>" : "") +
        '<s-stack direction="inline" gap="small-200" alignItems="center" style="margin-top: 8px;">' +
        '<s-text fontWeight="semibold">' + escapeHtml(price) + "</s-text>" +
        '<s-badge tone="' + status.tone + '">' + escapeHtml(status.label) + "</s-badge>" +
        "</s-stack></div></div>";
    }

    html += "</div>";
    container.innerHTML = html;
  }

  // ── Show product detail in modal ────────────────────────────────
  window.showProductDetail = async function (productId) {
    var modal = document.getElementById("product-detail-modal");
    var content = document.getElementById("product-detail-content");

    content.innerHTML =
      '<s-stack alignItems="center" gap="base">' +
      "<s-spinner></s-spinner>" +
      '<s-text color="subdued">Loading product details...</s-text>' +
      "</s-stack>";

    modal.show();

    try {
      var data = await apiFetch("/api/products/" + encodeURIComponent(productId));
      var p = data.product || data;
      renderProductDetail(content, p);
    } catch (err) {
      content.innerHTML =
        '<s-banner tone="critical">' +
        "<s-text>" +
        "<s-text fontWeight=\"semibold\">Could not load product</s-text> " +
        escapeHtml(err.message) +
        "</s-text></s-banner>";
    }
  };

  function renderProductDetail(container, p) {
    var image = getProductImage(p);
    var status = getProductStatus(p);
    var variants = [];
    if (p.variants && p.variants.edges) {
      for (var vi = 0; vi < p.variants.edges.length; vi++) {
        variants.push(p.variants.edges[vi].node);
      }
    } else if (Array.isArray(p.variants)) {
      variants = p.variants;
    }

    var html = '<s-stack gap="base">';

    // Image + info grid
    html += '<s-grid gridTemplateColumns="@container (inline-size <= 400px) 1fr, 200px 1fr" gap="base" alignItems="start">';

    // Image
    if (image) {
      html += '<img src="' + escapeAttr(image) + '" alt="' + escapeAttr(p.title || "") + '" style="width:100%; border-radius: 8px; border: 1px solid #e1e3e5;">';
    } else {
      html += '<s-box padding="large-400" border="base" borderRadius="base" background="bg-surface-secondary"><s-stack alignItems="center"><s-text color="subdued">No image</s-text></s-stack></s-box>';
    }

    // Info
    html += '<s-stack gap="small-200">';
    html += '<s-text variant="headingLg">' + escapeHtml(p.title || "Untitled") + "</s-text>";
    html += '<s-stack gap="small-200">';
    html += infoRow("Status", '<s-badge tone="' + status.tone + '">' + escapeHtml(status.label) + "</s-badge>");
    if (p.vendor) html += infoRow("Vendor", "<s-text>" + escapeHtml(p.vendor) + "</s-text>");
    if (p.productType) html += infoRow("Type", "<s-text>" + escapeHtml(p.productType) + "</s-text>");
    html += infoRow("Price", "<s-text>" + escapeHtml(getProductPrice(p)) + "</s-text>");
    if (p.totalInventory !== undefined) html += infoRow("Total inventory", "<s-text>" + escapeHtml(String(p.totalInventory)) + "</s-text>");
    html += "</s-stack></s-stack>";
    html += "</s-grid>";

    // Description
    var desc = p.description || p.body_html || "";
    if (desc) {
      html += '<s-text variant="headingSm">Description</s-text>';
      html += '<s-text color="subdued">' + escapeHtml(desc) + "</s-text>";
    }

    // Variants table
    if (variants.length > 0) {
      html += '<s-text variant="headingSm">Variants (' + variants.length + ")</s-text>";
      html += '<div class="table-container"><table>';
      html += "<thead><tr><th>Title</th><th>Price</th><th>SKU</th><th>Inventory</th></tr></thead><tbody>";
      for (var i = 0; i < variants.length; i++) {
        var v = variants[i];
        html += "<tr>";
        html += "<td>" + escapeHtml(v.title || "--") + "</td>";
        html += "<td>" + escapeHtml(v.price ? formatCurrency(v.price) : "--") + "</td>";
        html += "<td><code>" + escapeHtml(v.sku || "--") + "</code></td>";
        html += "<td>" + escapeHtml(String(v.inventoryQuantity !== undefined ? v.inventoryQuantity : (v.inventory_quantity !== undefined ? v.inventory_quantity : "--"))) + "</td>";
        html += "</tr>";
      }
      html += "</tbody></table></div>";
    }

    html += "</s-stack>";
    container.innerHTML = html;
  }

  function infoRow(label, valueHtml) {
    return '<s-grid gridTemplateColumns="120px 1fr" gap="small-200" alignItems="center">' +
      '<s-text color="subdued">' + escapeHtml(label) + "</s-text>" +
      valueHtml +
      "</s-grid>";
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

      var html = '<s-stack gap="base">';
      html += '<s-text color="subdued">You selected ' + selected.length + " product(s):</s-text>";
      for (var i = 0; i < selected.length; i++) {
        var item = selected[i];
        html += '<s-stack direction="inline" gap="base" alignItems="center">';
        html += '<s-text fontWeight="semibold">' + escapeHtml(item.title || "Untitled") + "</s-text>";
        html += '<s-badge tone="info">Selected</s-badge>';
        html += "</s-stack>";
      }
      html += '<s-text color="subdued" variant="bodySm">Resource Picker returns product data you can use in your app logic.</s-text>';
      html += "</s-stack>";

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
    if (product.variants && product.variants.edges && product.variants.edges.length > 0) {
      var price = product.variants.edges[0].node.price;
      if (price) return formatCurrency(price);
    }
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
    if (status === "active") return { label: "Active", tone: "success" };
    if (status === "draft") return { label: "Draft", tone: "info" };
    if (status === "archived") return { label: "Archived", tone: "warning" };
    return { label: status || "Active", tone: "success" };
  }

  function extractId(gid) {
    if (!gid) return "";
    var parts = String(gid).split("/");
    return parts[parts.length - 1] || gid;
  }

  // escapeAttr is provided globally by app.js
})();
