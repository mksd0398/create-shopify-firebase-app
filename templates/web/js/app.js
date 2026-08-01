/**
 * App Bridge initialization and shared utilities
 * Loaded on every page -- provides apiFetch, showToast, and helpers.
 *
 * In embedded admin, window.shopify is injected by the App Bridge CDN script.
 * Outside embedded admin (direct URL visit), graceful fallbacks are used.
 */

(function () {
  "use strict";

  // ── Shop context ────────────────────────────────────────────────
  // App Bridge is the source of truth: in the embedded admin the CDN
  // script injects window.shopify, and window.shopify.config carries
  // { apiKey, shop, host, locale } on EVERY page load.
  //
  // The ?shop=/?host= query params are only present on the first load --
  // the <ui-nav-menu> links are plain hrefs with no query string -- so
  // they are used purely as a fallback for viewing a page outside the
  // embedded admin (e.g. hitting the Hosting URL directly).
  var params = new URLSearchParams(window.location.search);

  function appBridgeConfig() {
    return (window.shopify && window.shopify.config) || null;
  }

  // Shared state accessible across pages.
  // shop/host are getters, not fixed values, so they resolve at read time
  // -- correct on every page and independent of script load order.
  window.__app = {
    get shop() {
      var cfg = appBridgeConfig();
      if (cfg && cfg.shop) return cfg.shop;
      // Query params are user-controlled -- validate before trusting.
      var rawShop = params.get("shop") || "";
      return /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(rawShop) ? rawShop : "";
    },
    get host() {
      var cfg = appBridgeConfig();
      if (cfg && cfg.host) return cfg.host;
      return params.get("host") || "";
    },
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

  // ── Navigation ──────────────────────────────────────────────────
  // No helper needed: App Bridge intercepts in-app navigation, so plain
  // <a href="/products"> links (see <ui-nav-menu>) and <s-clickable href>
  // are the supported way to move between pages. Do NOT hand-append
  // shop/host to URLs -- that is the legacy pattern, and window.shopify
  // provides the shop context on every page (see window.__app above).

  // ── Loading state helpers (Polaris Web Components) ──────────────
  window.showLoading = function showLoading(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML =
      '<s-box padding="large-400">' +
      '<s-stack alignItems="center" gap="base">' +
      "<s-spinner></s-spinner>" +
      '<s-text color="subdued">Loading\u2026</s-text>' +
      "</s-stack></s-box>";
  };

  window.hideLoading = function hideLoading(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = "";
  };

  // ── Error rendering helper (Polaris Web Components) ─────────────
  window.showError = function showError(containerId, message) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML =
      '<s-banner tone="critical">' +
      "<s-text>" +
      "<s-text fontWeight=\"semibold\">Something went wrong</s-text> " +
      escapeHtml(message) +
      "</s-text></s-banner>";
  };

  // ── Format helpers ──────────────────────────────────────────────
  window.formatCurrency = function formatCurrency(amount, currency) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  };

  window.formatDate = function formatDate(dateStr) {
    if (!dateStr) return "--";
    return new Date(dateStr).toLocaleDateString(undefined, {
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

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  window.escapeAttr = escapeAttr;

  // ── Mark ready ──────────────────────────────────────────────────
  window.__app.ready = true;
})();
