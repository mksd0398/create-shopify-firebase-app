/**
 * App Bridge helper — handles authentication, API calls, and navigation.
 *
 * Security is handled by App Bridge (session tokens) and server-side
 * verification. No manual iframe checks needed.
 */

(function () {
  "use strict";

  window.App = {
    ready: false,
    shop: null,
    host: null,

    async init() {
      const params = new URLSearchParams(window.location.search);
      this.host = params.get("host");
      this.shop = params.get("shop");

      await this._waitForShopify();

      if (!window.shopify) {
        document.getElementById("app").innerHTML = `
          <div style="text-align:center;padding:60px 20px;color:#6d7175;">
            <h2 style="color:#1a1a1a;">Loading...</h2>
            <p>If this persists, reload from the Shopify admin.</p>
          </div>
        `;
        return;
      }

      this.ready = true;
      window.dispatchEvent(new Event("app-ready"));
    },

    _waitForShopify() {
      return new Promise((resolve) => {
        if (window.shopify) return resolve();
        let attempts = 0;
        const interval = setInterval(() => {
          if (window.shopify || ++attempts > 50) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    },

    async getSessionToken() {
      if (!window.shopify) throw new Error("App Bridge not loaded");
      return await window.shopify.idToken();
    },

    async apiFetch(path, options = {}) {
      const token = await this.getSessionToken();
      const resp = await fetch(path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`API Error ${resp.status}: ${errText}`);
      }
      return resp.json();
    },

    navigate(page) {
      const url = new URL(page, window.location.origin);
      if (this.host) url.searchParams.set("host", this.host);
      if (this.shop) url.searchParams.set("shop", this.shop);
      window.location.href = url.pathname + url.search;
    },

    showToast(message) {
      if (window.shopify?.toast) {
        window.shopify.toast.show(message);
        return;
      }
      const existing = document.querySelector(".toast");
      if (existing) existing.remove();
      const toast = document.createElement("div");
      toast.className = "toast show";
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    },
  };

  document.addEventListener("DOMContentLoaded", () => window.App.init());
})();
