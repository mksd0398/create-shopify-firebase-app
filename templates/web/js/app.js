/**
 * App Bridge initialization and shared utilities
 * Loaded on every page -- provides apiFetch, showToast, navigateTo, and helpers.
 *
 * In embedded admin, window.shopify is injected by the App Bridge CDN script.
 * Outside embedded admin (direct URL visit), graceful fallbacks are used.
 */

(function () {
  "use strict";

  // ── Query params provided by Shopify when loading the app ───────
  var params = new URLSearchParams(window.location.search);
  var shop = params.get("shop") || "";
  var host = params.get("host") || "";

  // Shared state accessible across pages
  window.__app = {
    shop: shop,
    host: host,
    ready: false,
  };

  // ── API fetch helper ────────────────────────────────────────────
  // Automatically attaches session token and handles JSON errors.
  window.apiFetch = async function apiFetch(endpoint, options) {
    if (!options) options = {};
    var token = null;
    try {
      if (window.shopify && typeof window.shopify.idToken === "function") {
        token = await window.shopify.idToken();
      }
    } catch (_) {
      // Session token unavailable -- continue without auth
    }

    var headers = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }
    // Merge caller-supplied headers
    if (options.headers) {
      Object.keys(options.headers).forEach(function (k) {
        headers[k] = options.headers[k];
      });
    }

    var fetchOpts = Object.assign({}, options, { headers: headers });

    var res = await fetch(endpoint, fetchOpts);

    if (!res.ok) {
      var errBody;
      try {
        errBody = await res.json();
      } catch (_) {
        errBody = { error: res.statusText };
      }
      throw new Error(errBody.error || "API error: " + res.status);
    }

    return res.json();
  };

  // ── Toast helper ────────────────────────────────────────────────
  window.showToast = function showToast(message, isError) {
    if (window.shopify && window.shopify.toast) {
      window.shopify.toast.show(message, {
        duration: 5000,
        isError: !!isError,
      });
      return;
    }
    // Fallback toast for non-embedded preview
    var existing = document.querySelector(".toast-fallback");
    if (existing) existing.remove();

    var toast = document.createElement("div");
    toast.className = "toast-fallback" + (isError ? " toast-error" : "");
    toast.textContent = message;
    document.body.appendChild(toast);
    // Trigger reflow then show
    toast.offsetHeight; // eslint-disable-line no-unused-expressions
    toast.classList.add("toast-visible");
    setTimeout(function () {
      toast.classList.remove("toast-visible");
      setTimeout(function () {
        toast.remove();
      }, 300);
    }, 4000);
  };

  // ── Navigation helper ───────────────────────────────────────────
  // Preserves shop/host query params when navigating between pages.
  window.navigateTo = function navigateTo(path) {
    var qs = new URLSearchParams();
    if (window.__app.shop) qs.set("shop", window.__app.shop);
    if (window.__app.host) qs.set("host", window.__app.host);
    var search = qs.toString();
    window.location.href = path + (search ? "?" + search : "");
  };

  // ── Loading state helpers ───────────────────────────────────────
  window.showLoading = function showLoading(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML =
      '<div class="loading-state">' +
      '<div class="spinner"></div>' +
      "<p>Loading\u2026</p>" +
      "</div>";
  };

  window.hideLoading = function hideLoading(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var spinner = el.querySelector(".loading-state");
    if (spinner) spinner.remove();
  };

  // ── Error rendering helper ──────────────────────────────────────
  window.showError = function showError(containerId, message) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML =
      '<div class="banner banner-critical">' +
      '<div class="banner-icon">&#9888;</div>' +
      '<div class="banner-content">' +
      "<p><strong>Something went wrong</strong></p>" +
      "<p>" + escapeHtml(message) + "</p>" +
      "</div></div>";
  };

  // ── Format helpers ──────────────────────────────────────────────
  window.formatCurrency = function formatCurrency(amount, currency) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  };

  window.formatDate = function formatDate(dateStr) {
    if (!dateStr) return "--";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // ── Debounce utility ────────────────────────────────────────────
  window.debounce = function debounce(fn, delay) {
    var timer;
    return function () {
      var ctx = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, delay);
    };
  };

  // ── HTML escaping ───────────────────────────────────────────────
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
  window.escapeHtml = escapeHtml;

  // ── Mark ready ──────────────────────────────────────────────────
  window.__app.ready = true;
  console.log("[app.js] Initialized", { shop: shop, host: host });
})();
